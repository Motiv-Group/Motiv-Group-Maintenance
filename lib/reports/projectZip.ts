import 'server-only'
import JSZip from 'jszip'

export interface ZipPhoto { name: string; bytes: Buffer }
export interface ZipStore { folder: string; pdf: Buffer; photos: ZipPhoto[] }

/** Assemble the master export ZIP: the chosen summary file(s) at the root, then a
 *  folder per store (each holding the store's summary PDF + its renamed photos).
 *  All content is pre-materialised by the caller — this only zips it. */
export async function buildProjectZip(opts: {
  slug: string
  summaryPdf?: Buffer | null
  summaryXlsx?: Buffer | null
  stores: ZipStore[]
}): Promise<Buffer> {
  const zip = new JSZip()
  if (opts.summaryPdf) zip.file(`${opts.slug}-summary.pdf`, opts.summaryPdf)
  if (opts.summaryXlsx) zip.file(`${opts.slug}-summary.xlsx`, opts.summaryXlsx)

  const seen = new Map<string, number>()
  for (const s of opts.stores) {
    // Guard against two stores slugging to the same folder name.
    const n = seen.get(s.folder) ?? 0
    seen.set(s.folder, n + 1)
    const folderName = n === 0 ? s.folder : `${s.folder}-${n + 1}`
    const dir = zip.folder(folderName) ?? zip
    dir.file('summary.pdf', s.pdf)
    for (const p of s.photos) dir.file(p.name, p.bytes)
  }

  return (await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } })) as Buffer
}

/** Filesystem-safe folder/file name from free text: keep letters/digits/dash, collapse
 *  the rest to single dashes, trim, cap length. */
export function safeName(s: string): string {
  return (s || 'store')
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 80) || 'store'
}
