'use client'

// "Generate report" on the RM project page — opens the export options modal
// (format / scope / photo ZIP); the modal handles the request + download.
import { useState } from 'react'
import { FileText } from 'lucide-react'
import { ProjectReportModal } from './ProjectReportModal'

export function ProjectReportButton({ projectId, projectName }: { projectId: string; projectName: string }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="flex flex-col items-stretch gap-1 sm:items-end">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3.5 text-sm font-semibold text-white transition hover:bg-blue-500"
      >
        <FileText size={15} /> Generate report
      </button>
      {open && <ProjectReportModal projectId={projectId} projectName={projectName} onClose={() => setOpen(false)} />}
    </div>
  )
}
