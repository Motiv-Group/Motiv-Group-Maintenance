import { describe, it, expect } from 'vitest'
import { fileMatchesAccept } from '@/components/ui/useFileDrop'

const f = (name: string, type: string) => ({ name, type })

describe('fileMatchesAccept — drag-drop accept filtering mirrors the <input accept> attr', () => {
  it('accepts anything when no accept is given', () => {
    expect(fileMatchesAccept(f('x.exe', 'application/octet-stream'))).toBe(true)
    expect(fileMatchesAccept(f('x.png', 'image/png'), '')).toBe(true)
  })

  it('matches a wildcard MIME (image/*)', () => {
    expect(fileMatchesAccept(f('a.png', 'image/png'), 'image/*')).toBe(true)
    expect(fileMatchesAccept(f('a.webp', 'image/webp'), 'image/*')).toBe(true)
    expect(fileMatchesAccept(f('a.pdf', 'application/pdf'), 'image/*')).toBe(false)
  })

  it('matches an exact MIME (application/pdf)', () => {
    expect(fileMatchesAccept(f('q.pdf', 'application/pdf'), 'application/pdf')).toBe(true)
    expect(fileMatchesAccept(f('q.png', 'image/png'), 'application/pdf')).toBe(false)
  })

  it('matches by extension (.csv), case-insensitively, even with an empty MIME', () => {
    expect(fileMatchesAccept(f('data.csv', 'text/csv'), '.csv')).toBe(true)
    expect(fileMatchesAccept(f('DATA.CSV', ''), '.csv')).toBe(true)
    expect(fileMatchesAccept(f('data.txt', 'text/plain'), '.csv')).toBe(false)
  })

  it('matches any pattern in a comma list', () => {
    const accept = 'image/png,image/jpeg,.pdf'
    expect(fileMatchesAccept(f('a.png', 'image/png'), accept)).toBe(true)
    expect(fileMatchesAccept(f('a.pdf', 'application/pdf'), accept)).toBe(true)
    expect(fileMatchesAccept(f('a.gif', 'image/gif'), accept)).toBe(false)
  })
})
