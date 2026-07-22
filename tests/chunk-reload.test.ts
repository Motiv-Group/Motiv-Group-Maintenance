import { describe, it, expect } from 'vitest'
import { isChunkError } from '@/lib/chunk-reload'

describe('isChunkError — stale-chunk detection for the auto-reload boundary', () => {
  it('matches the deploy stale-chunk / module-load errors', () => {
    expect(isChunkError({ name: 'ChunkLoadError', message: 'Loading chunk 42 failed' })).toBe(true)
    expect(isChunkError({ message: 'Module …/eye.js was instantiated … but the module factory is not available' })).toBe(true)
    expect(isChunkError({ message: 'Failed to fetch dynamically imported module: /_next/x.js' })).toBe(true)
    expect(isChunkError({ message: 'error loading dynamically imported module' })).toBe(true)
    expect(isChunkError({ digest: 'ChunkLoadError' })).toBe(true)
  })

  it('ignores ordinary application errors + empty input', () => {
    expect(isChunkError({ name: 'TypeError', message: "Cannot read properties of undefined" })).toBe(false)
    expect(isChunkError({ message: 'Report generation failed' })).toBe(false)
    expect(isChunkError(null)).toBe(false)
    expect(isChunkError(undefined)).toBe(false)
    expect(isChunkError({})).toBe(false)
  })
})
