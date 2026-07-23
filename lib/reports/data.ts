import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { signManyUrls } from '@/lib/storage'
import { loadProject, type ProjectRow, type ProjectSummary, type StoreRow } from '@/lib/projects/data'

/** A report photo: the raw storage path (for downloading the original into a ZIP)
 *  plus a short-lived signed URL (for embedding a downsampled copy in a PDF). */
export interface ReportPhoto { path: string; url: string; caption: string | null }
export interface StorePhotos { before: ReportPhoto[]; after: ReportPhoto[]; coc: ReportPhoto[] }
export interface ProjectReportData {
  project: ProjectRow
  summary: ProjectSummary
  stores: StoreRow[]
  /** storeId → its before/after/COC photos (signed URLs + raw paths), sort-ordered. */
  photosByStore: Record<string, StorePhotos>
}

// project_files.file_category → report photo group. before/after are the milestone
// photos; the sign-off photo + sign-off document both stand in for the "COC".
const CATEGORY_GROUP: Record<string, keyof StorePhotos> = {
  before_photo: 'before',
  after_photo: 'after',
  signoff_photo: 'coc',
  signoff_document: 'coc',
}

// Load a project + its stores + before/after/COC photos for the report. Access is
// the caller's job: pass rmUserId to scope to that RM's assigned projects (returns
// null when unassigned — same as loadProject), or omit for a system_admin.
export async function loadProjectReportData(
  companyId: string,
  projectId: string,
  rmUserId?: string,
): Promise<ProjectReportData | null> {
  const loaded = await loadProject(companyId, projectId, rmUserId)
  if (!loaded) return null

  const admin = createAdminClient()
  const photosByStore: Record<string, StorePhotos> = {}
  for (const s of loaded.stores) photosByStore[s.id] = { before: [], after: [], coc: [] }

  const storeIds = loaded.stores.map(s => s.id)
  if (storeIds.length) {
    const { data: files } = await admin
      .from('project_files')
      .select('project_store_id, file_category, storage_path, caption, sort_order')
      .in('project_store_id', storeIds)
      .in('file_category', ['before_photo', 'after_photo', 'signoff_photo', 'signoff_document'])
      .order('sort_order', { ascending: true })
    const rows = files ?? []
    const signed = await signManyUrls(rows.map(r => r.storage_path))
    rows.forEach((r, i) => {
      const url = signed[i]
      const bucket = r.project_store_id ? photosByStore[r.project_store_id] : undefined
      const group = CATEGORY_GROUP[r.file_category]
      if (!url || !bucket || !group) return
      bucket[group].push({ path: r.storage_path, url, caption: r.caption ?? null })
    })
  }

  return { project: loaded.project, summary: loaded.summary, stores: loaded.stores, photosByStore }
}

export type { ProjectRow, ProjectSummary, StoreRow }
