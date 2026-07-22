import { describe, it, expect } from 'vitest'
import { renderProjectReport, type RenderReport } from './ProjectReport'

// 1x1 transparent PNG — a valid image src so the photo/logo paths render.
const PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const base: RenderReport = {
  appName: 'Motiv',
  brandHex: '#0e1016',
  logoDataUri: PX,
  generatedAt: '22 Jul 2026',
  project: { name: 'Test Rollout', client: 'Acme Retail', region: null, statusLabel: 'Active', startDate: '01 Jun 2026', endDate: '30 Sep 2026', progress: 62 },
  summary: { stores: 2, completed: 1, inProgress: 1, notStarted: 0, overdue: 1 },
  stores: [
    {
      branchCode: 'JHB-001', name: 'Sandton', town: 'Sandton', progress: 100, statusLabel: 'Complete', overdue: false,
      startDate: '01 Jun 2026', endDate: '15 Jun 2026',
      milestones: [
        { label: 'On site', done: true, date: '02 Jun 2026' },
        { label: 'Before', done: true, date: '03 Jun 2026' },
        { label: 'After', done: true, date: '10 Jun 2026' },
        { label: 'Sign-off', done: true, date: '15 Jun 2026' },
      ],
      before: [{ dataUri: PX, caption: null }, { dataUri: PX, caption: 'entry' }],
      after: [{ dataUri: PX, caption: null }],
    },
    {
      branchCode: 'CPT-002', name: 'Claremont', town: null, progress: 24, statusLabel: 'On site', overdue: true,
      startDate: null, endDate: '20 Jul 2026',
      milestones: [
        { label: 'On site', done: true, date: '18 Jul 2026' },
        { label: 'Before', done: false, date: null },
        { label: 'After', done: false, date: null },
        { label: 'Sign-off', done: false, date: null },
      ],
      before: [], after: [],
    },
  ],
}

// react-pdf's first render lazily loads its layout/font engine (slow cold start);
// warm renders are fast. Generous timeout so the cold render can complete.
describe('renderProjectReport', () => {
  it('renders a valid, non-trivial PDF with photos + logo', async () => {
    const pdf = await renderProjectReport(base)
    expect(Buffer.isBuffer(pdf)).toBe(true)
    // PDF magic bytes.
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-')
    // A real report is well over a few KB.
    expect(pdf.length).toBeGreaterThan(2000)
  }, 60_000)

  it('renders with no stores and no logo (empty project) without throwing', async () => {
    const pdf = await renderProjectReport({ ...base, logoDataUri: null, stores: [], summary: { stores: 0, completed: 0, inProgress: 0, notStarted: 0, overdue: 0 } })
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-')
  }, 60_000)
})
