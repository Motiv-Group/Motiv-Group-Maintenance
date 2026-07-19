import { describe, it, expect } from 'vitest'
import {
  storeProgress,
  completedMilestones,
  projectProgress,
  projectProgressRounded,
  currentMilestone,
  storeStatus,
  isOverdue,
  stageLabel,
  milestoneCounts,
  statusBreakdown,
  type StoreMilestones,
} from './progress'

const T = '2026-07-14T10:00:00.000Z' // any non-null timestamp = "complete"

const store = (n: 0 | 1 | 2 | 3 | 4): StoreMilestones => ({
  on_site_completed_at: n >= 1 ? T : null,
  before_photos_completed_at: n >= 2 ? T : null,
  after_photos_completed_at: n >= 3 ? T : null,
  signoff_completed_at: n >= 4 ? T : null,
})

describe('storeProgress — milestones drive the percentage (acceptance 5–9)', () => {
  it('starts at 0%', () => expect(storeProgress(store(0))).toBe(0))
  it('On Site → 25%', () => expect(storeProgress(store(1))).toBe(25))
  it('+ Before Photos → 50%', () => expect(storeProgress(store(2))).toBe(50))
  it('+ After Photos → 75%', () => expect(storeProgress(store(3))).toBe(75))
  it('+ Sign-off → 100%', () => expect(storeProgress(store(4))).toBe(100))

  it('counts completed milestones regardless of null vs undefined', () => {
    expect(completedMilestones({ on_site_completed_at: T, before_photos_completed_at: undefined })).toBe(1)
  })

  it('recalculates down when evidence is removed (acceptance 10)', () => {
    const full = store(4)
    expect(storeProgress(full)).toBe(100)
    const afterRemoved: StoreMilestones = { ...full, after_photos_completed_at: null, signoff_completed_at: null }
    expect(storeProgress(afterRemoved)).toBe(50)
  })
})

describe('projectProgress — average over derived store count (acceptance 11)', () => {
  it('empty project → 0', () => expect(projectProgress([])).toBe(0))

  it('is the AVERAGE of store %, not a count of complete stores', () => {
    // 80 stores: 40 at 100%, 40 at 50% → (40*100 + 40*50) / 80 = 75
    const stores = [...Array(40).fill(store(4)), ...Array(40).fill(store(2))]
    expect(projectProgress(stores)).toBe(75)
  })

  it('divides by the TOTAL number of stores, not just updated ones', () => {
    // 1 store at 100%, 3 untouched at 0% → 100/4 = 25 (not 100)
    const stores = [store(4), store(0), store(0), store(0)]
    expect(projectProgress(stores)).toBe(25)
  })

  it('does not hardcode a store count — 3 vs 5 stores give different denominators', () => {
    expect(projectProgress([store(4), store(0), store(0)])).toBeCloseTo(33.33, 1)
    expect(projectProgress([store(4), store(0), store(0), store(0), store(0)])).toBe(20)
  })

  it('rounds to 1 dp for display', () => {
    expect(projectProgressRounded([store(4), store(0), store(0)])).toBe(33.3)
  })
})

describe('currentMilestone / storeStatus', () => {
  it('points at the next outstanding milestone', () => {
    expect(currentMilestone(store(0))).toBe('on_site')
    expect(currentMilestone(store(1))).toBe('before_photos')
    expect(currentMilestone(store(2))).toBe('after_photos')
    expect(currentMilestone(store(3))).toBe('signoff')
    expect(currentMilestone(store(4))).toBeNull()
  })

  it('maps completion count to status', () => {
    expect(storeStatus(store(0))).toBe('not_started')
    expect(storeStatus(store(1))).toBe('on_site')
    expect(storeStatus(store(2))).toBe('before_complete')
    expect(storeStatus(store(3))).toBe('after_complete')
    expect(storeStatus(store(4))).toBe('complete')
  })
})

describe('isOverdue — end date passed AND below 100% (spec §9)', () => {
  const now = new Date('2026-07-14T00:00:00.000Z')

  it('overdue when end date is in the past and not complete', () => {
    expect(isOverdue({ ...store(2), end_date: '2026-07-01' }, now)).toBe(true)
  })
  it('NOT overdue when complete, even past the end date', () => {
    expect(isOverdue({ ...store(4), end_date: '2026-07-01' }, now)).toBe(false)
  })
  it('NOT overdue when the end date is still in the future', () => {
    expect(isOverdue({ ...store(0), end_date: '2026-08-01' }, now)).toBe(false)
  })
  it('NOT overdue with no end date, or an unparseable one', () => {
    expect(isOverdue({ ...store(0), end_date: null }, now)).toBe(false)
    expect(isOverdue({ ...store(0), end_date: 'not-a-date' }, now)).toBe(false)
  })
  it('overdue is a warning flag — it does not change the percentage', () => {
    const s = { ...store(2), end_date: '2026-07-01' }
    expect(isOverdue(s, now)).toBe(true)
    expect(storeProgress(s)).toBe(50) // still 50%, per spec §9
  })
  it('end date is inclusive — NOT overdue on the end date, only from the day after', () => {
    const s = { ...store(2), end_date: '2026-07-19' }
    // Any time on the 19th (the end date itself) is still on-time.
    expect(isOverdue(s, new Date('2026-07-19T00:00:00.000Z'))).toBe(false)
    expect(isOverdue(s, new Date('2026-07-19T23:59:59.000Z'))).toBe(false)
    // From the 20th onwards it is overdue.
    expect(isOverdue(s, new Date('2026-07-20T00:00:00.000Z'))).toBe(true)
  })
})

describe('stageLabel — professional wording (spec §5)', () => {
  it('maps percentage buckets to labels', () => {
    expect(stageLabel(0)).toBe('Not Started')
    expect(stageLabel(25)).toBe('Mobilisation')
    expect(stageLabel(50)).toBe('In Progress')
    expect(stageLabel(75)).toBe('Nearing Completion')
    expect(stageLabel(100)).toBe('Complete')
  })
})

describe('milestoneCounts / statusBreakdown', () => {
  const now = new Date('2026-07-14T00:00:00.000Z')

  it('counts stores that reached each milestone', () => {
    const stores = [store(4), store(2), store(1)]
    expect(milestoneCounts(stores)).toEqual({ on_site: 3, before_photos: 2, after_photos: 1, signoff: 1 })
  })

  it('summarises status buckets, with overdue as an overlapping flag', () => {
    const stores = [
      store(4), // complete
      store(0), // not started
      { ...store(2), end_date: '2026-07-01' }, // in progress + overdue
    ]
    expect(statusBreakdown(stores, now)).toEqual({ total: 3, notStarted: 1, inProgress: 1, complete: 1, overdue: 1 })
  })
})
