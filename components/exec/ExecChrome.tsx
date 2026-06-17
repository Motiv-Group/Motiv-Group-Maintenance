'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Globe2, Map as MapIcon, Store, Truck, Gavel, Bell, Settings, LogOut, FileBarChart, LayoutDashboard, Ticket, ClipboardCheck, AlertTriangle, ReceiptText, BarChart2 } from 'lucide-react'
import { MotivLogo } from '@/components/ui/MotivLogo'

interface ChromeTab { href: string; label: string; icon: React.ElementType }

const EXEC_TABS: ChromeTab[] = [
  { href: '/executive',           label: 'Estate',    icon: Globe2 },
  { href: '/executive/regions',   label: 'Regions',   icon: MapIcon },
  { href: '/executive/stores',    label: 'Stores',    icon: Store },
  { href: '/executive/suppliers', label: 'Suppliers', icon: Truck },
  { href: '/executive/decisions', label: 'Decisions', icon: Gavel },
]
const REGIONAL_TABS: ChromeTab[] = [
  { href: '/regional',          label: 'Overview',  icon: LayoutDashboard },
  { href: '/regional/stores',   label: 'Stores',    icon: Store },
  { href: '/regional/tickets',  label: 'Tickets',   icon: Ticket },
  { href: '/regional/suppliers', label: 'Suppliers', icon: Truck },
  { href: '/regional/signoff',  label: 'Signoff',   icon: ClipboardCheck },
  { href: '/regional/snag',     label: 'Snags',     icon: AlertTriangle },
]
const STORE_TABS: ChromeTab[] = [
  { href: '/client',         label: 'Dashboard', icon: LayoutDashboard },
  { href: '/client/tickets', label: 'Tickets',   icon: Ticket },
]
const SUPPLIER_TABS: ChromeTab[] = [
  { href: '/supplier',         label: 'Home',        icon: LayoutDashboard },
  { href: '/supplier/tickets', label: 'Tickets',     icon: Ticket },
  { href: '/supplier/quotes',  label: 'Quotes',      icon: ReceiptText },
  { href: '/supplier/signoff', label: 'Sign-off',    icon: ClipboardCheck },
  { href: '/supplier/stats',   label: 'Performance', icon: BarChart2 },
]
const VARIANTS = {
  exec:     { tabs: EXEC_TABS, roleLabel: 'Executive', base: '/executive', reports: true },
  regional: { tabs: REGIONAL_TABS, roleLabel: 'Regional Manager', base: '/regional', reports: true },
  store:    { tabs: STORE_TABS, roleLabel: 'Store Manager', base: '/client', reports: false },
  supplier: { tabs: SUPPLIER_TABS, roleLabel: 'Supplier', base: '/supplier', reports: false },
} as const

export function ExecChrome({
  children, userName, variant = 'exec',
}: { children: ReactNode; userName: string | null; variant?: keyof typeof VARIANTS }) {
  const { tabs, roleLabel, base, reports } = VARIANTS[variant]
  const pathname = usePathname()
  const home = tabs[0]?.href ?? base
  const initial = (userName ?? roleLabel).trim().charAt(0).toUpperCase()
  const iconBtn = 'p-2 rounded-lg text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--hover)] transition-colors'
  // Store manager uses a narrow centred column — constrain header + main + nav
  // to the same width so the logo lines up with the content cards.
  const wrap = variant === 'store' ? 'max-w-3xl' : 'max-w-[1500px]'

  return (
    <div className="min-h-screen bg-[var(--app-bg)] text-[var(--text)] flex flex-col">
      <header className="sticky top-0 z-20 bg-[var(--app-bg)] border-b border-[var(--border)]">
        <div className={`${wrap} mx-auto px-4 h-14 flex items-center justify-between`}>
          <Link href={home}><MotivLogo height={30} /></Link>
          <div className="flex items-center gap-1">
            {reports && <Link href={`${base}/reports`} className={iconBtn} title="Reports"><FileBarChart size={18} /></Link>}
            <Link href={`${base}/notifications`} className={`relative ${iconBtn}`} title="Notifications">
              <Bell size={18} />
              <span className="absolute top-1 right-1 w-3.5 h-3.5 bg-red-500 text-white text-[9px] rounded-full flex items-center justify-center">3</span>
            </Link>
            <Link href="/settings" className={iconBtn} title="Settings"><Settings size={17} /></Link>
            <form action="/auth/logout" method="post" className="contents">
              <button type="submit" className={iconBtn} title="Log out"><LogOut size={17} /></button>
            </form>
            <div className="flex items-center gap-2 pl-2 ml-1 border-l border-[var(--border)]">
              <span className="w-8 h-8 rounded-full bg-[#C6A35D] text-[#0a0e17] font-bold flex items-center justify-center text-sm">{initial}</span>
              <div className="hidden sm:block leading-tight">
                <div className="text-sm font-medium text-[var(--text)]">{userName ?? roleLabel}</div>
                <div className="text-[11px] text-[var(--text-muted)]">{roleLabel}</div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className={`flex-1 ${wrap} w-full mx-auto px-4 py-6 pb-28`}>{children}</main>

      <nav className="fixed bottom-0 inset-x-0 z-20 bg-[var(--nav-bg)] border-t border-[var(--border)]">
        <div className={`${wrap} mx-auto flex items-stretch h-16 justify-around`}>
          {tabs.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || (href !== home && pathname.startsWith(href))
            return (
              <Link key={href} href={href}
                className={`flex flex-col items-center justify-center gap-1 flex-1 text-[11px] font-medium transition-colors ${active ? 'text-[#C6A35D]' : 'text-[var(--text-faint)] hover:text-[var(--text-muted)]'}`}>
                <Icon size={20} strokeWidth={active ? 2.4 : 1.8} />
                {label}
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
