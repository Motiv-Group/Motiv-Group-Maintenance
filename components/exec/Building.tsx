import { Hammer } from 'lucide-react'

export function Building({ tab }: { tab: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-24">
      <div className="w-14 h-14 rounded-2xl bg-[#f59e0b]/15 flex items-center justify-center mb-4">
        <Hammer className="text-[#f59e0b]" size={24} />
      </div>
      <h1 className="text-xl font-bold text-[var(--text)]">{tab}</h1>
      <p className="text-sm text-[var(--text-muted)] mt-1 max-w-sm">This executive tab is being built in the next Phase 2 step. The <span className="text-[#f59e0b]">Regions</span> tab is live now.</p>
    </div>
  )
}
