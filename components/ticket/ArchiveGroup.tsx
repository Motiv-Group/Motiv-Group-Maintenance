// A labelled sub-group inside the Archive/History block — a small uppercase heading
// over its cards so mixed archived items (quotes, requests, submissions…) stay
// separated and scannable without cluttering the section. Shared by the RM and
// supplier ticket detail pages. Pure presentational — safe in Server Components.
export function ArchiveGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-faint)]">{label}</p>
      {children}
    </div>
  )
}
