import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { signManyUrls } from '@/lib/storage'
import { loadProject, type ProjectRow, type ProjectSummary, type StoreRow } from '@/lib/projects/data'

export interface ReportPhoto { url: string; caption: string | null }
export interface ProjectReportData {
  project: ProjectRow
  summary: ProjectSummary
  stores: StoreRow[]
  /** storeId → its before/after photos (signed URLs), sort-ordered. */
  photosByStore: Record<string, { before: ReportPhoto[]; after: ReportPhoto[] }>
}

// Load a project + its stores + before/after photos for the PDF report. Access is
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
  const photosByStore: Record<string, { before: ReportPhoto[]; after: ReportPhoto[] }> = {}
  for (const s of loaded.stores) photosByStore[s.id] = { before: [], after: [] }

  const storeIds = loaded.stores.map(s => s.id)
  if (storeIds.length) {
    const { data: files } = await admin
      .from('project_files')
      .select('project_store_id, file_category, storage_path, caption, sort_order')
      .in('project_store_id', storeIds)
      .in('file_category', ['before_photo', 'after_photo'])
      .order('sort_order', { ascending: true })
    const rows = files ?? []
    const signed = await signManyUrls(rows.map(r => r.storage_path))
    rows.forEach((r, i) => {
      const url = signed[i]
      const bucket = r.project_store_id ? photosByStore[r.project_store_id] : undefined
      if (!url || !bucket) return
      const ref: ReportPhoto = { url, caption: r.caption ?? null }
      if (r.file_category === 'before_photo') bucket.before.push(ref)
      else bucket.after.push(ref)
    })
  }

  return { project: loaded.project, summary: loaded.summary, stores: loaded.stores, photosByStore }
}

export type { ProjectRow, ProjectSummary, StoreRow }
