import type { ReactNode } from 'react'
import { LogOut } from 'lucide-react'
import { MotivLogo } from '@/components/ui/MotivLogo'
import { AdminNav } from '@/components/admin/AdminNav'

export const dynamic = 'force-dynamic'

// Standalone chrome for the platform-admin area (gated to system_admin by
// middleware). Separate from the role apps — just a header + logout.
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--app-bg)] text-[var(--text)] flex flex-col">
      <header className="sticky top-0 z-20 bg-brand-600 border-b border-brand-700">
        <div className="max-w-[1500px] mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MotivLogo height={32} />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#C6A35D] bg-[#C6A35D]/15 ring-1 ring-[#C6A35D]/30 rounded-full px-2 py-0.5">Admin</span>
          </div>
          <form action="/auth/logout" method="post" className="contents">
            <button type="submit" className="p-2 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 transition" title="Log out"><LogOut size={17} /></button>
          </form>
        </div>
      </header>
      <AdminNav />
      <main className="flex-1 max-w-[1500px] w-full mx-auto px-4 py-6">{children}</main>
    </div>
  )
}
