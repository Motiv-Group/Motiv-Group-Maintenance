// Shared project types (spec §8, §9). Kept separate from progress.ts (pure calc) so
// both client components and server loaders can import them without pulling in server-only code.

export type ProjectStatus = 'draft' | 'planned' | 'active' | 'complete' | 'archived'

export const PROJECT_STATUSES: ProjectStatus[] = ['draft', 'planned', 'active', 'complete', 'archived']

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  draft: 'Draft',
  planned: 'Planned',
  active: 'Active',
  complete: 'Complete',
  archived: 'Archived',
}

export type FileCategory = 'before_photo' | 'after_photo' | 'signoff_photo' | 'signoff_document' | 'project_cover'

export const PHOTO_CATEGORIES: FileCategory[] = ['before_photo', 'after_photo', 'signoff_photo', 'signoff_document']

/** Which milestone a file category counts toward (null = not milestone evidence). */
export const CATEGORY_MILESTONE: Record<FileCategory, 'before_photos' | 'after_photos' | 'signoff' | null> = {
  before_photo: 'before_photos',
  after_photo: 'after_photos',
  signoff_photo: 'signoff',
  signoff_document: 'signoff',
  project_cover: null,
}

/** The DB timestamp column backing each milestone. */
export const MILESTONE_COLUMN = {
  on_site: 'on_site_completed_at',
  before_photos: 'before_photos_completed_at',
  after_photos: 'after_photos_completed_at',
  signoff: 'signoff_completed_at',
} as const

export type MilestoneKey = keyof typeof MILESTONE_COLUMN
