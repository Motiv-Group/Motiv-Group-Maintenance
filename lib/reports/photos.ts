import 'server-only'
import sharp from 'sharp'

// Fetch a (signed) image URL and downsample to a small JPEG data URI for embedding
// in the PDF. Doing it here — not inside the PDF renderer — keeps the output light
// and generation reliable, and lets one bad photo fail gracefully (null) instead of
// breaking the whole report.
export async function photoToDataUri(url: string, maxWidth = 520): Promise<string | null> {
  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null
    const input = Buffer.from(await res.arrayBuffer())
    const jpg = await sharp(input)
      .rotate() // honour EXIF orientation before stripping metadata
      .resize({ width: maxWidth, withoutEnlargement: true })
      .jpeg({ quality: 68 })
      .toBuffer()
    return `data:image/jpeg;base64,${jpg.toString('base64')}`
  } catch {
    return null
  }
}
