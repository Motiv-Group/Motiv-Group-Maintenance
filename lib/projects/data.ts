import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { signedUrl, signManyUrls } from '@/lib/storage'
import {
  storeProgress,
  projectProgressRounded,
  statusBreakdown,
  storeStatus,
  currentMilestone,
  isOverdue,
  type ProjectStoreLike,
  type StoreStatus,
} from './progress'
import type { ProjectStatus, FileCategory } from './types'
import type { Database } from '@/lib/database.types'

type Admin = ReturnType<typeof createAdminClient>

export type ProjectRow = Database['public']['Tables']['projects']['Row']
type ProjectFileRow = Database['public']['Tables']['project_files']['Row']
/** The project_stores columns fetched by MILESTONE_COLS (a subset of the full Row). */
type StoreDbRow = Pick<
  Database['public']['Tables']['project_stores']['Row'],
  | 'id' | 'project_id' | 'branch_code' | 'store_name' | 'town' | 'rfid_m2_required'
  | 'start_date' | 'end_date' | 'on_site_completed_at' | 'before_photos_completed_at'
  | 'after_photos_completed_at' | 'signoff_completed_at' | 'on_site_note'
  | 'progress_percentage' | 'updated_at'
>

// ── Audit / event log ───────────────────────────────────────────────────────
export interface ProjectEventEntry {
  projectId: string
  companyId: string | null
  projectStoreId?: string | null
  eventType: string
  previousValue?: string | null
  newValue?: string | null
  metadata?: Record<string, unknown> | null
  createdBy: string | null
}

/** Best-effort append to project_events — never throws (a log failure can't break
 *  the mutation it records). Service-role client (no insert policy on the table). */
export async function logProjectEvent(admin: Admin, e: ProjectEventEntry): Promise<void> {
  try {
    const { error } = await admin.from('project_events').insert({
      project_id: e.projectId,
      company_id: e.companyId,
      project_store_id: e.projectStoreId ?? null,
      event_type: e.eventType,
      previous_value: e.previousValue ?? null,
      new_value: e.newValue ?? null,
      metadata: (e.metadata ?? null) as never,
      created_by: e.createdBy,
    })
    if (error) console.error('[project-event] insert failed:', e.eventType, error.message)
  } catch (err) {
    console.error('[project-event] insert threw:', e.eventType, err)
  }
}

// ── Row shapes surfaced to the UI ───────────────────────────────────────────
export interface StoreRow extends ProjectStoreLike {
  id: string
  project_id: string
  branch_code: string
  store_name: string | null
  town: string | null
  rfid_m2_required: number | null
  start_date: string | null
  end_date: string | null
  on_site_completed_at: string | null
  before_photos_completed_at: string | null
  after_photos_completed_at: string | null
  signoff_completed_at: string | null
  on_site_note: string | null
  progress_percentage: number | null
  updated_at: string
  // derived
  progress: number
  status: StoreStatus
  overdue: boolean
  current: ReturnType<typeof currentMilestone>
}

export interface ProjectSummary {
  id: string
  name: string
  description: string | null
  client_name: string | null
  status: ProjectStatus
  start_date: string | null
  end_date: string | null
  coverUrl: string | null
  updated_at: string
  archived_at: string | null
  storeCount: number
  progress: number
  completed: number
  inProgress: number
  notStarted: number
  overdue: number
}

export interface ProjectFileView {
  id: string
  project_store_id: string | null
  category: FileCategory
  url: string | null
  original_filename: string | null
  mime_type: string | null
  caption: string | null
  signed_date: string | null
  signatory_name: string | null
  sort_order: number
  created_at: string
  isImage: boolean
}

function decorateStore(s: StoreDbRow, now: Date): StoreRow {
  return {
    ...s,
    progress: storeProgress(s),
    status: storeStatus(s),
    overdue: isOverdue(s, now),
    current: currentMilestone(s),
  }
}

function summarise(project: ProjectRow, stores: ProjectStoreLike[], now: Date): ProjectSummary {
  const bd = statusBreakdown(stores, now)
  return {
    id: project.id,
    name: project.name,
    description: project.description ?? null,
    client_name: project.client_name ?? null,
    status: project.status as ProjectStatus, // DB column is text; app writes only ProjectStatus values
    start_date: project.start_date ?? null,
    end_date: project.end_date ?? null,
    coverUrl: null, // signed by the caller in a batch (avoids N sign calls here)
    updated_at: project.updated_at,
    archived_at: project.archived_at ?? null,
    storeCount: stores.length,
    progress: projectProgressRounded(stores),
    completed: bd.complete,
    inProgress: bd.inProgress,
    notStarted: bd.notStarted,
    overdue: bd.overdue,
  }
}

const MILESTONE_COLS =
  'id, project_id, branch_code, store_name, town, rfid_m2_required, start_date, end_date, on_site_completed_at, before_photos_completed_at, after_photos_completed_at, signoff_completed_at, on_site_note, progress_percentage, updated_at'

/** Project list with computed stats. Same for admin + RM (no internal fields are on
 *  these rows — internal notes live in project_notes). Excludes archived by default. */
export async function loadProjects(companyId: string, includeArchived = false): Promise<ProjectSummary[]> {
  const admin = createAdminClient()
  let q = admin.from('projects').select('*').eq('company_id', companyId)
  if (!includeArchived) q = q.is('archived_at', null)
  const { data: projects } = await q.order('created_at', { ascending: false })
  const list = projects ?? []
  if (!list.length) return []

  const ids = list.map((p) => p.id)
  const { data: stores } = await admin
    .from('project_stores')
    .select('id, project_id, end_date, on_site_completed_at, before_photos_completed_at, after_photos_completed_at, signoff_completed_at')
    .in('project_id', ids)
  const byProject = new Map<string, ProjectStoreLike[]>()
  for (const s of stores ?? []) {
    const arr = byProject.get(s.project_id) ?? []
    arr.push(s)
    byProject.set(s.project_id, arr)
  }

  const now = new Date()
  const summaries = list.map((p) => summarise(p, byProject.get(p.id) ?? [], now))
  // Sign cover images in one batch.
  const covers = await signManyUrls(list.map((p) => p.cover_image_path))
  let ci = 0
  for (let i = 0; i < list.length; i++) {
    if (list[i].cover_image_path) summaries[i].coverUrl = covers[ci++] ?? null
  }
  return summaries
}

/** One project + its stores (decorated). Returns null if not found / wrong company. */
export async function loadProject(
  companyId: string,
  projectId: string,
): Promise<{ project: ProjectRow; stores: StoreRow[]; summary: ProjectSummary } | null> {
  const admin = createAdminClient()
  const { data: project } = await admin.from('projects').select('*').eq('id', projectId).eq('company_id', companyId).single()
  if (!project) return null
  const { data: stores } = await admin
    .from('project_stores')
    .select(MILESTONE_COLS)
    .eq('project_id', projectId)
    .order('branch_code', { ascending: true })
  const now = new Date()
  const rows = (stores ?? []).map((s) => decorateStore(s, now))
  const summary = summarise(project, rows, now)
  summary.coverUrl = project.cover_image_path ? await signedUrl(project.cover_image_path) : null
  return { project, stores: rows, summary }
}

/** One store + its signed files. Returns null if not found / wrong company. */
export async function loadProjectStore(
  companyId: string,
  storeId: string,
): Promise<{ store: StoreRow; project: ProjectRow; files: ProjectFileView[] } | null> {
  const admin = createAdminClient()
  const { data: store } = await admin.from('project_stores').select('*').eq('id', storeId).eq('company_id', companyId).single()
  if (!store) return null
  const [{ data: project }, { data: files }] = await Promise.all([
    admin.from('projects').select('*').eq('id', store.project_id).single(),
    admin.from('project_files').select('*').eq('project_store_id', storeId).order('sort_order', { ascending: true }),
  ])
  const fileRows: ProjectFileRow[] = files ?? []
  const signed = await signManyUrls(fileRows.map((f) => f.storage_path))
  const fileViews: ProjectFileView[] = fileRows.map((f, i) => ({
    id: f.id,
    project_store_id: f.project_store_id,
    category: f.file_category as FileCategory, // DB column is text; app writes only FileCategory values
    url: signed[i] ?? null,
    original_filename: f.original_filename,
    mime_type: f.mime_type,
    caption: f.caption,
    signed_date: f.signed_date,
    signatory_name: f.signatory_name,
    sort_order: f.sort_order,
    created_at: f.created_at,
    isImage: typeof f.mime_type === 'string' && f.mime_type.startsWith('image/'),
  }))
  if (!project) return null
  return { store: decorateStore(store, new Date()), project, files: fileViews }
}

/** Admin-only: internal notes for a project (and/or a store). */
export async function loadProjectNotes(companyId: string, projectId: string) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('project_notes')
    .select('id, project_store_id, body, created_at, created_by')
    .eq('company_id', companyId)
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
  return data ?? []
}

/** Count files per category for a store (used to gate milestone marking + recompute). */
export async function fileCategoryCounts(admin: Admin, storeId: string): Promise<Record<string, number>> {
  const { data } = await admin.from('project_files').select('file_category').eq('project_store_id', storeId)
  const counts: Record<string, number> = {}
  for (const r of data ?? []) counts[r.file_category] = (counts[r.file_category] ?? 0) + 1
  return counts
}
