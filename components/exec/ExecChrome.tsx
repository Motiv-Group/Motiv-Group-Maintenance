'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Globe2, Map as MapIcon, Store, Truck, Gavel, Bell, Settings, LogOut, FileBarChart, LayoutDashboard, Ticket, ClipboardCheck, AlertTriangle, ReceiptText, BarChart2, Users, CalendarClock, Network, ScrollText, Database, Triangle, Mail, Zap, ShieldAlert, FolderKanban, Paintbrush, Timer, Wallet, Server, ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { MotivLogo } from '@/components/ui/MotivLogo'
import { ContextSwitcher } from '@/components/ui/ContextSwitcher'
import { SwipeNav } from '@/components/ui/SwipeNav'
import { UserAvatar } from '@/components/ui/UserAvatar'

interface ChromeTab { href: string; label: string; icon: React.ElementType }
// A collapsible sidebar section (desktop only) — a labelled parent with child tabs.
// Used for the admin "Infrastructure" group (Supabase/Vercel/Resend/Upstash/Sentry).
interface ChromeGroup { label: string; icon: React.ElementType; children: ChromeTab[] }
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
// Desktop sidebar adds Reports — on mobile it stays behind the header icon
// (the sidebar replaces the header on lg, so it must carry the link).
const EXEC_DESKTOP_TABS: ChromeTab[] = [
  ...EXEC_TABS,
  { href: '/executive/reports', label: 'Reports', icon: FileBarChart },
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
  { href: '/admin/sla',       label: 'SLA',       icon: Timer },
  { href: '/admin/audit',     label: 'Audit',     icon: ScrollText },
]
// Desktop sidebar: the business tabs + Finance + Customize, with the 5 provider
// panels tucked into a collapsible "Infrastructure" group (INFRA_GROUP) below.
const ADMIN_DESKTOP_TABS: ChromeTab[] = [
  ...ADMIN_TABS,
  { href: '/admin/finance', label: 'Finance', icon: Wallet },
  { href: '/admin/customization', label: 'Customize', icon: Paintbrush },
]
const INFRA_GROUP: ChromeGroup = {
  label: 'Infrastructure',
  icon: Server,
  children: [
    { href: '/admin/supabase', label: 'Supabase', icon: Database },
    { href: '/admin/vercel',   label: 'Vercel',   icon: Triangle },
    { href: '/admin/resend',   label: 'Resend',   icon: Mail },
    { href: '/admin/upstash',  label: 'Upstash',  icon: Zap },
    { href: '/admin/sentry',   label: 'Sentry',   icon: ShieldAlert },
  ],
}
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
  contextOptions, activeContextId, contextCookie, accountStatus = null, avatarUrl = null, tabBadges = {},
}: { children: ReactNode; userName: string | null; variant?: keyof typeof VARIANTS; unreadCount?: number; contextLabel?: string | null; contextOptions?: { id: string; label: string }[]; activeContextId?: string | null; contextCookie?: string; accountStatus?: AccountStatus | null; avatarUrl?: string | null; tabBadges?: Record<string, number> }) {
  const { tabs, roleLabel, base, reports } = VARIANTS[variant]
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const home = tabs[0]?.href ?? base
  const isStore = variant === 'store'
  const isSupplier = variant === 'supplier'
  const isAdmin = variant === 'admin'
  const isExec = variant === 'exec'
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
      {/* Every role gets the desktop left sidebar (top bar + bottom nav hide on
          lg). Store/Admin/Exec swap in a wider desktop tab set; Admin's includes
          the infra panels. */}
      <DesktopSidebar
        userName={userName}
        roleLabel={roleLabel}
        contextLabel={contextLabel}
        contextOptions={contextOptions}
        activeContextId={activeContextId}
        contextCookie={contextCookie}
        ContextIcon={isStore ? Store : isSupplier ? Truck : isAdmin ? LayoutDashboard : MapIcon}
        unreadCount={unreadCount}
        avatarUrl={avatarUrl}
        accountStatus={accountStatus}
        tabs={isStore ? STORE_DESKTOP_TABS : isAdmin ? ADMIN_DESKTOP_TABS : isExec ? EXEC_DESKTOP_TABS : tabs}
        groups={isAdmin ? [INFRA_GROUP] : undefined}
        tabBadges={tabBadges}
        home={home}
        notificationsHref={`${base}/notifications`}
        isActive={(href) => isStore
          ? isStoreDesktopActive(href, pathname, searchParams)
          : isActiveHref(href, home, pathname, searchParams)}
      />

      <div className="lg:pl-[260px] flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 bg-brand-600 border-b border-brand-700 lg:hidden">
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
              <UserAvatar name={userName ?? roleLabel} avatarUrl={avatarUrl} size={32} />
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
        <main className={`flex-1 ${mainWrap} w-full mx-auto px-4 sm:px-5 py-5 pb-32 lg:px-10 lg:py-8 lg:pb-10`}>{children}</main>
      </SwipeNav>

      <nav className="fixed bottom-0 inset-x-0 z-30 bg-brand-600 border-t border-brand-700 lg:hidden">
        <div className={`${wrap} mx-auto flex items-stretch h-20 justify-around`}>
          {tabs.map(({ href, label, icon: Icon }) => {
            const active = isActiveHref(href, home, pathname, searchParams)
            const badge = tabBadges[href] ?? 0
            return (
              <Link key={href} href={href}
                className={`flex flex-col items-center justify-center gap-1 flex-1 text-[11px] font-medium transition-colors ${active ? 'text-blue-400' : 'text-gray-400 hover:text-gray-200'}`}>
                <span className="relative">
                  <Icon size={22} strokeWidth={active ? 2.4 : 1.8} />
                  {badge > 0 && (
                    <span className="absolute -top-1 -right-2 min-w-[15px] h-[15px] px-0.5 bg-red-500 text-white text-[9px] font-semibold rounded-full flex items-center justify-center">{badge > 9 ? '9+' : badge}</span>
                  )}
                </span>
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

// Desktop left sidebar shared by every role chrome. Tabs, context chip icon,
// home + notifications links and the active-tab test are injected so each role
// drives its own nav while sharing the exact look.
function DesktopSidebar({
  userName,
  roleLabel,
  contextLabel,
  contextOptions,
  activeContextId,
  contextCookie,
  ContextIcon,
  unreadCount,
  avatarUrl,
  accountStatus,
  tabs,
  groups,
  tabBadges = {},
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
  avatarUrl?: string | null
  accountStatus?: AccountStatus | null
  tabs: ChromeTab[]
  groups?: ChromeGroup[]
  tabBadges?: Record<string, number>
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
            const badge = tabBadges[href] ?? 0
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
                {badge > 0 && <span className="ml-auto rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] text-white">{badge > 9 ? '9+' : badge}</span>}
              </Link>
            )
          })}
          {(groups ?? []).map(g => <SidebarGroup key={g.label} group={g} isActive={isActive} />)}
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
          <UserAvatar name={user} avatarUrl={avatarUrl} size={40} />
          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-white">{user}</div>
            <div className="truncate text-xs text-gray-400">{roleLabel}{accountStatus && statusSuffix(accountStatus)}</div>
          </div>
        </div>
      </div>
    </aside>
  )
}

// A collapsible sidebar section (e.g. admin "Infrastructure"). Starts open when any
// child is the active route, so the current page is always visible; the header
// toggles it and highlights when collapsed-but-active.
function SidebarGroup({ group, isActive }: { group: ChromeGroup; isActive: (href: string) => boolean }) {
  const anyActive = group.children.some(c => isActive(c.href))
  const [open, setOpen] = useState(anyActive)
  const { icon: Icon } = group
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition ${
          anyActive && !open ? 'text-white' : 'text-gray-300 hover:bg-white/[0.06] hover:text-white'
        }`}
      >
        <Icon size={18} className={anyActive ? 'text-blue-300' : 'text-gray-400'} />
        <span>{group.label}</span>
        <ChevronDown size={16} className={`ml-auto text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mt-1 space-y-1 pl-3">
          {group.children.map(({ href, label, icon: ChildIcon }) => {
            const active = isActive(href)
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  active ? 'bg-blue-600/25 text-white ring-1 ring-blue-500/30' : 'text-gray-300 hover:bg-white/[0.06] hover:text-white'
                }`}
              >
                <ChildIcon size={16} className={active ? 'text-blue-300' : 'text-gray-400'} />
                <span>{label}</span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
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
