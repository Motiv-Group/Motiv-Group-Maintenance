'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Globe2, Map as MapIcon, Store, Truck, Gavel, Bell, Settings, LogOut, FileBarChart, LayoutDashboard, Ticket, ClipboardCheck, AlertTriangle, ReceiptText, BarChart2, Users, CalendarClock, CheckCircle2, Network, ScrollText, Database, Triangle, Mail, Zap, ShieldAlert, FolderKanban, Paintbrush } from 'lucide-react'
import { MotivLogo } from '@/components/ui/MotivLogo'
import { ContextSwitcher } from '@/components/ui/ContextSwitcher'
import { SwipeNav } from '@/components/ui/SwipeNav'

interface ChromeTab { href: string; label: string; icon: React.ElementType }
type SearchParamsLike = { get(name: string): string | null }
// A small status pill shown under the name in the sidebar/header profile block
// (e.g. a supplier's "Pending verification" / "Verified"). Kept gentle by design.
export type AccountStatus = { label: string; tone: 'amber' | 'emerald' }

// Verification shows as a short coloured suffix on the ROLE line ("Supplier ·
// Verified" / "· Pending") — inline, so it never adds a row or thickens the block
// (the name can be long and lives on its own line above).
function statusSuffix(s: AccountStatus) {
  return <span className={s.tone === 'emerald' ? 'text-emerald-400' : 'text-amber-300'}> · {s.tone === 'emerald' ? 'Verified' : 'Pending'}</span>
}

const EXEC_TABS: ChromeTab[] = [
  { href: '/executive',           label: 'Dashboard', icon: Globe2 },
  { href: '/executive/regions',   label: 'Regions',   icon: MapIcon },
  { href: '/executive/stores',    label: 'Stores',    icon: Store },
  { href: '/executive/suppliers', label: 'Suppliers', icon: Truck },
  { href: '/executive/decisions', label: 'Decisions', icon: Gavel },
]
const REGIONAL_TABS: ChromeTab[] = [
  { href: '/regional',          label: 'Today',     icon: LayoutDashboard },
  { href: '/regional/stores',   label: 'Stores',    icon: Store },
  { href: '/regional/tickets',  label: 'Tickets',   icon: Ticket },
  { href: '/regional/signoff',  label: 'Signoff',   icon: ClipboardCheck },
  { href: '/regional/snag',     label: 'Snags',     icon: AlertTriangle },
  { href: '/regional/suppliers', label: 'Suppliers', icon: Truck },
  { href: '/regional/projects', label: 'Projects',  icon: FolderKanban },
]
const STORE_TABS: ChromeTab[] = [
  { href: '/client',         label: 'Dashboard', icon: LayoutDashboard },
  { href: '/client/tickets', label: 'Tickets',   icon: Ticket },
  { href: '/client/visits',  label: 'Visits',    icon: CalendarClock },
]
const STORE_DESKTOP_TABS: ChromeTab[] = [
  { href: '/client',                          label: 'Today',     icon: LayoutDashboard },
  { href: '/client/tickets',                  label: 'Tickets',   icon: Ticket },
  { href: '/client/visits',                   label: 'Visits',    icon: CalendarClock },
  { href: '/client/tickets?status=completed', label: 'Completed', icon: CheckCircle2 },
]
const SUPPLIER_TABS: ChromeTab[] = [
  { href: '/supplier',         label: 'Today',       icon: LayoutDashboard },
  { href: '/supplier/tickets', label: 'Tickets',     icon: Ticket },
  { href: '/supplier/quotes',  label: 'Quotes',      icon: ReceiptText },
  { href: '/supplier/signoff', label: 'Signoff',     icon: ClipboardCheck },
  { href: '/supplier/snag',    label: 'Snags',       icon: AlertTriangle },
  { href: '/supplier/technicians', label: 'Field Team', icon: Users },
  { href: '/supplier/stats',   label: 'Performance', icon: BarChart2 },
]
const INDIVIDUAL_TABS: ChromeTab[] = [
  { href: '/individual',         label: 'Dashboard', icon: LayoutDashboard },
  // Individuals see "Jobs" everywhere (their pages say Log a Job / Recent Jobs) —
  // the tab label must match, not the internal "tickets" term.
  { href: '/individual/tickets', label: 'Jobs',      icon: Ticket },
]
// Platform-admin: the business tabs go on the mobile bottom-nav; the full set
// (business + infra/provider panels) fills the desktop sidebar.
const ADMIN_TABS: ChromeTab[] = [
  { href: '/admin',           label: 'Overview',  icon: LayoutDashboard },
  { href: '/admin/accounts',  label: 'Accounts',  icon: Users },
  { href: '/admin/hierarchy', label: 'Hierarchy', icon: Network },
  { href: '/admin/suppliers', label: 'Suppliers', icon: Truck },
  { href: '/admin/projects',  label: 'Projects',  icon: FolderKanban },
  { href: '/admin/audit',     label: 'Audit',     icon: ScrollText },
]
const ADMIN_DESKTOP_TABS: ChromeTab[] = [
  ...ADMIN_TABS,
  { href: '/admin/customization', label: 'Customize', icon: Paintbrush },
  { href: '/admin/supabase', label: 'Supabase', icon: Database },
  { href: '/admin/vercel',   label: 'Vercel',   icon: Triangle },
  { href: '/admin/resend',   label: 'Resend',   icon: Mail },
  { href: '/admin/upstash',  label: 'Upstash',  icon: Zap },
  { href: '/admin/sentry',   label: 'Sentry',   icon: ShieldAlert },
]
const VARIANTS = {
  exec:     { tabs: EXEC_TABS, roleLabel: 'Executive', base: '/executive', reports: true },
  regional: { tabs: REGIONAL_TABS, roleLabel: 'Regional Manager', base: '/regional', reports: true },
  store:    { tabs: STORE_TABS, roleLabel: 'Store Manager', base: '/client', reports: false },
  supplier: { tabs: SUPPLIER_TABS, roleLabel: 'Supplier', base: '/supplier', reports: false },
  individual: { tabs: INDIVIDUAL_TABS, roleLabel: 'Individual', base: '/individual', reports: false },
  admin:    { tabs: ADMIN_TABS, roleLabel: 'System Admin', base: '/admin', reports: false },
} as const

export function ExecChrome({
  children, userName, variant = 'exec', unreadCount = 0, contextLabel,
  contextOptions, activeContextId, contextCookie, accountStatus = null,
}: { children: ReactNode; userName: string | null; variant?: keyof typeof VARIANTS; unreadCount?: number; contextLabel?: string | null; contextOptions?: { id: string; label: string }[]; activeContextId?: string | null; contextCookie?: string; accountStatus?: AccountStatus | null }) {
  const { tabs, roleLabel, base, reports } = VARIANTS[variant]
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const home = tabs[0]?.href ?? base
  const initial = (userName ?? roleLabel).trim().charAt(0).toUpperCase()
  const isStore = variant === 'store'
  const isRegional = variant === 'regional'
  const isSupplier = variant === 'supplier'
  const isAdmin = variant === 'admin'
  // Store, Regional, Supplier + Admin get the desktop left sidebar (top bar +
  // bottom nav hide on lg). Admin's sidebar carries the full tab set incl. infra.
  const hasSidebar = isStore || isRegional || isSupplier || isAdmin
  // Nav bars are always deep navy (brand-600) in both light and dark mode,
  // matching the Settings Navbar — so icons/labels use light tones on navy.
  const iconBtn = 'p-2.5 sm:p-2 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 transition-colors'
  // All roles share the same content width so the chrome (header, main, nav) is
  // consistent. On desktop the content fills --content-width of the available width
  // (default 90%, user-configurable 70–95% in Settings → Appearance); mobile stays
  // full-width (relying on the px padding) so nothing is squeezed.
  const wrap = 'max-w-none lg:max-w-[var(--content-width)]'
  const mainWrap = wrap

  return (
    <div className="min-h-screen bg-[var(--app-bg)] text-[var(--text)] flex flex-col">
      {hasSidebar && (
        <DesktopSidebar
          userName={userName}
          roleLabel={roleLabel}
          contextLabel={contextLabel}
          contextOptions={contextOptions}
          activeContextId={activeContextId}
          contextCookie={contextCookie}
          ContextIcon={isStore ? Store : isSupplier ? Truck : isAdmin ? LayoutDashboard : MapIcon}
          unreadCount={unreadCount}
          initial={initial}
          accountStatus={accountStatus}
          tabs={isStore ? STORE_DESKTOP_TABS : isAdmin ? ADMIN_DESKTOP_TABS : tabs}
          home={home}
          notificationsHref={`${base}/notifications`}
          isActive={(href) => isStore
            ? isStoreDesktopActive(href, pathname, searchParams)
            : isActiveHref(href, home, pathname, searchParams)}
        />
      )}

      <div className={hasSidebar ? 'lg:pl-[260px] flex min-h-screen flex-col' : 'flex min-h-screen flex-col'}>
      <header className={`sticky top-0 z-30 bg-brand-600 border-b border-brand-700 ${hasSidebar ? 'lg:hidden' : ''}`}>
        <div className={`${wrap} mx-auto px-4 h-16 flex items-center justify-between`}>
          <Link href={home} className="shrink-0">
            <MotivLogo height={40} wordmark={false} className="sm:hidden" />
            <MotivLogo height={44} className="hidden sm:inline-flex" />
          </Link>
          <div className="flex items-center gap-1">
            {reports && <Link href={`${base}/reports`} className={iconBtn} title="Reports"><FileBarChart size={18} /></Link>}
            <Link href={`${base}/notifications`} className={`relative ${iconBtn}`} title="Notifications">
              <Bell size={18} />
              {unreadCount > 0 && (
                <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[9px] font-semibold rounded-full flex items-center justify-center">{unreadCount > 9 ? '9+' : unreadCount}</span>
              )}
            </Link>
            <Link href="/settings" className={iconBtn} title="Settings"><Settings size={17} /></Link>
            <form action="/auth/logout" method="post" className="contents">
              <button type="submit" className={iconBtn} title="Log out"><LogOut size={17} /></button>
            </form>
            <div className="flex items-center gap-2 pl-2 ml-1 border-l border-white/15">
              <span className="w-8 h-8 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-sm">{initial}</span>
              <div className="hidden sm:block leading-tight">
                <div className="text-sm font-medium text-white truncate">{userName ?? roleLabel}</div>
                <div className="text-[11px] text-gray-300 truncate">{roleLabel}{accountStatus && statusSuffix(accountStatus)}</div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Swipe left/right on mobile moves between this section's tabs. */}
      <SwipeNav links={tabs}>
        <main className={`flex-1 ${mainWrap} w-full mx-auto px-4 sm:px-5 ${hasSidebar ? 'py-5 pb-32 lg:px-10 lg:py-8 lg:pb-10' : 'py-6 pb-32'}`}>{children}</main>
      </SwipeNav>

      <nav className={`fixed bottom-0 inset-x-0 z-30 bg-brand-600 border-t border-brand-700 ${hasSidebar ? 'lg:hidden' : ''}`}>
        <div className={`${wrap} mx-auto flex items-stretch h-20 justify-around`}>
          {tabs.map(({ href, label, icon: Icon }) => {
            const active = isActiveHref(href, home, pathname, searchParams)
            return (
              <Link key={href} href={href}
                className={`flex flex-col items-center justify-center gap-1 flex-1 text-[11px] font-medium transition-colors ${active ? 'text-blue-400' : 'text-gray-400 hover:text-gray-200'}`}>
                <Icon size={22} strokeWidth={active ? 2.4 : 1.8} />
                {label}
              </Link>
            )
          })}
        </div>
      </nav>
      </div>
    </div>
  )
}

function isActiveHref(href: string, home: string, pathname: string, searchParams: SearchParamsLike): boolean {
  const [path, query = ''] = href.split('?')
  if (query) {
    const expected = new URLSearchParams(query)
    for (const [key, value] of expected.entries()) {
      if (searchParams.get(key) !== value) return false
    }
    return pathname === path
  }
  return pathname === path || (href !== home && pathname.startsWith(path))
}

// Desktop left sidebar shared by the store + regional chromes. Tabs, context
// chip icon, home + notifications links and the active-tab test are injected so
// each role drives its own nav while sharing the exact look.
function DesktopSidebar({
  userName,
  roleLabel,
  contextLabel,
  contextOptions,
  activeContextId,
  contextCookie,
  ContextIcon,
  unreadCount,
  initial,
  accountStatus,
  tabs,
  home,
  notificationsHref,
  isActive,
}: {
  userName: string | null
  roleLabel: string
  contextLabel?: string | null
  contextOptions?: { id: string; label: string }[]
  activeContextId?: string | null
  contextCookie?: string
  ContextIcon: React.ElementType
  unreadCount: number
  initial: string
  accountStatus?: AccountStatus | null
  tabs: ChromeTab[]
  home: string
  notificationsHref: string
  isActive: (href: string) => boolean
}) {
  const user = userName ?? roleLabel

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[260px] border-r border-white/10 bg-brand-600 text-white lg:flex lg:flex-col">
      <div className="px-5 pt-6">
        <Link href={home} className="inline-flex"><MotivLogo height={52} /></Link>
      </div>
      {/* Context chip sits in px-3 like the nav items so it's the same width. */}
      {contextOptions && contextOptions.length > 0 ? (
        <div className="px-3 pb-4">
          <ContextSwitcher options={contextOptions} activeId={activeContextId ?? null} cookieName={contextCookie ?? 'motiv_ctx'} Icon={ContextIcon} />
        </div>
      ) : contextLabel ? (
        <div className="px-3 pb-4">
          <div className="mt-6 flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-white">
            <span className="truncate">{contextLabel}</span>
            <ContextIcon size={14} className="shrink-0 text-gray-400" />
          </div>
        </div>
      ) : <div className="pb-4" />}

      <nav className="flex-1 px-3">
        <div className="space-y-1">
          {tabs.map(({ href, label, icon: Icon }) => {
            const active = isActive(href)
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition ${
                  active
                    ? 'bg-blue-600/25 text-white ring-1 ring-blue-500/30'
                    : 'text-gray-300 hover:bg-white/[0.06] hover:text-white'
                }`}
              >
                <Icon size={18} className={active ? 'text-blue-300' : 'text-gray-400'} />
                <span>{label}</span>
              </Link>
            )
          })}
        </div>
      </nav>

      <div className="border-t border-white/10 px-3 py-4">
        <Link href={notificationsHref} className="flex items-center justify-between rounded-xl px-3 py-3 text-sm font-semibold text-gray-300 hover:bg-white/[0.06] hover:text-white">
          <span className="flex items-center gap-3"><Bell size={18} className="text-gray-400" /> Notifications</span>
          {unreadCount > 0 && <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] text-white">{unreadCount > 9 ? '9+' : unreadCount}</span>}
        </Link>
        <Link href="/settings" className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-gray-300 hover:bg-white/[0.06] hover:text-white">
          <Settings size={18} className="text-gray-400" /> Settings
        </Link>
        <form action="/auth/logout" method="post">
          <button type="submit" className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold text-gray-300 hover:bg-white/[0.06] hover:text-white">
            <LogOut size={18} className="text-gray-400" /> Log out
          </button>
        </form>
      </div>

      <div className="border-t border-white/10 p-4">
        <div className="flex items-center gap-3 rounded-2xl bg-white/[0.04] p-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-blue-600 text-sm font-bold text-white">{initial}</span>
          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-white">{user}</div>
            <div className="truncate text-xs text-gray-400">{roleLabel}{accountStatus && statusSuffix(accountStatus)}</div>
          </div>
        </div>
      </div>
    </aside>
  )
}

function isStoreDesktopActive(href: string, pathname: string, searchParams: SearchParamsLike): boolean {
  if (href === '/client/tickets') {
    return pathname.startsWith('/client/tickets')
      && pathname !== '/client/tickets/new'
      && searchParams.get('status') !== 'completed'
  }
  return isActiveHref(href, '/client', pathname, searchParams)
}
