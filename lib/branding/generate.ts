import sharp from 'sharp'
import JSZip from 'jszip'
import pngToIco from 'png-to-ico'

export interface GenerateInput {
  /** Any subset — only the provided masters are (re)generated. At least one required. */
  symbol?: Buffer
  wordmark?: Buffer
  lockup?: Buffer
  /** solid background for icons, hex like '#0e1016' (app chrome colour) */
  chromeHex: string
}

export interface GeneratedAsset {
  key: string
  contentType: string
  data: Buffer
}

export interface GenerateResult {
  web: GeneratedAsset[]
  /** The repo + Android asset pack. null when no symbol was provided (icons —
   *  the bulk of the pack — depend on the symbol, so a wordmark/lockup-only
   *  round keeps the previous pack rather than shipping a near-empty zip). */
  zip: Buffer | null
}

const PNG = 'image/png'
const ICO = 'image/x-icon'

/** Alpha values at or below this are treated as transparent when trimming borders. */
const ALPHA_TRIM_THRESHOLD = 10

/** Android launcher + adaptive-foreground sizes per density bucket. */
const ANDROID_DENSITIES = [
  { name: 'mdpi', launcher: 48, foreground: 108 },
  { name: 'hdpi', launcher: 72, foreground: 162 },
  { name: 'xhdpi', launcher: 96, foreground: 216 },
  { name: 'xxhdpi', launcher: 144, foreground: 324 },
  { name: 'xxxhdpi', launcher: 192, foreground: 432 },
] as const

interface Rgb {
  r: number
  g: number
  b: number
}

function hexToRgb(hex: string): Rgb {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!match || !match[1]) throw new Error(`invalid hex colour: ${hex}`)
  const n = parseInt(match[1], 16)
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff }
}

/**
 * Trim fully-transparent borders by scanning the alpha channel for the content
 * bounding box, then extracting it. Done manually on raw pixels rather than
 * sharp's `.trim()` because the masters have coloured RGB under transparent
 * alpha (e.g. white text at alpha 0), which colour-based trim would not remove.
 */
async function trimTransparent(buf: Buffer, label: string): Promise<Buffer> {
  let raw: { data: Buffer; info: sharp.OutputInfo }
  try {
    raw = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  } catch {
    throw new Error(`${label} image could not be read`)
  }

  const { data, info } = raw
  const { width, height, channels } = info
  if (!width || !height) throw new Error(`${label} image could not be read`)

  let top = height
  let bottom = -1
  let left = width
  let right = -1
  for (let y = 0; y < height; y++) {
    const rowStart = y * width * channels
    for (let x = 0; x < width; x++) {
      const alpha = data[rowStart + x * channels + 3] ?? 0
      if (alpha > ALPHA_TRIM_THRESHOLD) {
        if (y < top) top = y
        if (y > bottom) bottom = y
        if (x < left) left = x
        if (x > right) right = x
      }
    }
  }

  if (bottom < 0) throw new Error(`${label} image is fully transparent`)

  return sharp(buf)
    .ensureAlpha()
    .extract({ left, top, width: right - left + 1, height: bottom - top + 1 })
    .png()
    .toBuffer()
}

/** Resize to fit inside a square content box, preserving aspect ratio and alpha. */
async function fitInBox(src: Buffer, box: number): Promise<Buffer> {
  return sharp(src).resize(box, box, { fit: 'inside' }).png().toBuffer()
}

/** Content centered on a solid-colour square, flattened to a fully opaque PNG. */
async function squareOnBg(src: Buffer, size: number, contentRatio: number, bgHex: string): Promise<Buffer> {
  const bg = hexToRgb(bgHex)
  const inner = await fitInBox(src, Math.round(size * contentRatio))
  const composed = await sharp({
    create: { width: size, height: size, channels: 4, background: { ...bg, alpha: 1 } },
  })
    .composite([{ input: inner, gravity: 'centre' }])
    .png()
    .toBuffer()
  // Second pass: flatten drops the (already fully-opaque) alpha channel entirely.
  return sharp(composed).flatten({ background: bg }).png().toBuffer()
}

/** Content centered on a transparent square canvas, alpha preserved. */
async function squareTransparent(src: Buffer, size: number, contentRatio: number): Promise<Buffer> {
  const inner = await fitInBox(src, Math.round(size * contentRatio))
  return sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: inner, gravity: 'centre' }])
    .png()
    .toBuffer()
}

/** Punch a square icon into a circle via an SVG circle composited as dest-in. */
async function circleCrop(square: Buffer, size: number): Promise<Buffer> {
  const r = size / 2
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${r}" cy="${r}" r="${r}" fill="#fff"/></svg>`
  )
  return sharp(square)
    .ensureAlpha()
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer()
}

function buildReadme(): string {
  return `# Motiv brand assets

Generated from the master brand images. Where to put things:

- \`web/public/\` — copy the files into the repo's \`public/\` folder.
- \`web/app/\` — copy the files into the repo's \`app/\` folder (Next.js serves
  \`favicon.ico\`, \`icon.png\` and \`apple-icon.png\` from there automatically).
- \`brand/\` — copy the files into the repo's \`public/brand/\` folder.
- \`android/res/\` — copy the \`mipmap-*\` folders into
  \`android/app/src/main/res/\` (replacing the existing launcher icons),
  then rebuild the Android app.
`
}

export async function generateBrandAssets(input: GenerateInput): Promise<GenerateResult> {
  const bgHex = input.chromeHex
  hexToRgb(bgHex) // fail fast on a bad colour before any image work

  if (!input.symbol && !input.wordmark && !input.lockup) {
    throw new Error('Provide at least one image (symbol, wordmark or lockup)')
  }

  const web: GeneratedAsset[] = []
  const zip = new JSZip()
  let wroteZip = false

  // ── Symbol → every icon/favicon/launcher + symbol.png + the repo/Android pack ──
  if (input.symbol) {
    const symbol = await trimTransparent(input.symbol, 'symbol')
    const [icon192, icon512, icon512Maskable, appleTouch, fav16, fav32, fav48, symbolPng] = await Promise.all([
      squareOnBg(symbol, 192, 0.8, bgHex),
      squareOnBg(symbol, 512, 0.8, bgHex),
      // Maskable icons get cropped to arbitrary shapes; 66% content keeps the
      // symbol inside the guaranteed-visible safe zone.
      squareOnBg(symbol, 512, 0.66, bgHex),
      squareOnBg(symbol, 180, 0.8, bgHex),
      // Larger content ratio at tiny sizes so the mark stays legible.
      squareOnBg(symbol, 16, 0.9, bgHex),
      squareOnBg(symbol, 32, 0.85, bgHex),
      squareOnBg(symbol, 48, 0.85, bgHex),
      sharp(symbol).resize(512, 512, { fit: 'inside', withoutEnlargement: true }).png().toBuffer(),
    ])
    const faviconIco = await pngToIco([fav16, fav32, fav48])

    // Android launcher set, one trio per density bucket.
    const androidFiles = (
      await Promise.all(
        ANDROID_DENSITIES.map(async (d) => {
          const launcher = await squareOnBg(symbol, d.launcher, 0.8, bgHex)
          const [round, foreground] = await Promise.all([
            circleCrop(launcher, d.launcher),
            // Adaptive icons mask away the outer third; ~44% content sits well
            // inside the 66-of-108dp safe zone.
            squareTransparent(symbol, d.foreground, 0.44),
          ])
          return [
            { path: `android/res/mipmap-${d.name}/ic_launcher.png`, data: launcher },
            { path: `android/res/mipmap-${d.name}/ic_launcher_round.png`, data: round },
            { path: `android/res/mipmap-${d.name}/ic_launcher_foreground.png`, data: foreground },
          ]
        })
      )
    ).flat()

    web.push(
      { key: 'icon-192.png', contentType: PNG, data: icon192 },
      { key: 'icon-512.png', contentType: PNG, data: icon512 },
      { key: 'icon-512-maskable.png', contentType: PNG, data: icon512Maskable },
      { key: 'apple-touch-icon.png', contentType: PNG, data: appleTouch },
      { key: 'favicon-16.png', contentType: PNG, data: fav16 },
      { key: 'favicon-32.png', contentType: PNG, data: fav32 },
      { key: 'favicon.ico', contentType: ICO, data: faviconIco },
      { key: 'symbol.png', contentType: PNG, data: symbolPng },
    )

    zip.file('README.md', buildReadme())
    zip.file('web/public/icon-192.png', icon192)
    zip.file('web/public/icon-512.png', icon512)
    zip.file('web/app/favicon.ico', faviconIco)
    zip.file('web/app/icon.png', icon512)
    zip.file('web/app/apple-icon.png', appleTouch)
    zip.file('brand/motiv-symbol.png', symbolPng)
    for (const f of androidFiles) zip.file(f.path, f.data)
    wroteZip = true
  }

  // ── Wordmark → wordmark.png (white-on-transparent; alpha always preserved) ──
  if (input.wordmark) {
    const wordmark = await trimTransparent(input.wordmark, 'wordmark')
    const wordmarkPng = await sharp(wordmark).resize({ height: 120 }).png().toBuffer()
    web.push({ key: 'wordmark.png', contentType: PNG, data: wordmarkPng })
    if (wroteZip) zip.file('brand/motiv-wordmark.png', wordmarkPng)
  }

  // ── Lockup → lockup.png (login hero) ──
  if (input.lockup) {
    const lockup = await trimTransparent(input.lockup, 'lockup')
    const lockupPng = await sharp(lockup).resize({ width: 1200, withoutEnlargement: true }).png().toBuffer()
    web.push({ key: 'lockup.png', contentType: PNG, data: lockupPng })
    if (wroteZip) zip.file('brand/motiv-lockup.png', lockupPng)
  }

  const zipBuffer = wroteZip ? await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }) : null

  return { web, zip: zipBuffer }
}
