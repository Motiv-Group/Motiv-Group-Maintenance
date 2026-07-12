'use client'

import { type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { UserCircle2, Building2, Bell, Palette, ShieldCheck, LogOut, ArrowLeft, type LucideIcon } from 'lucide-react'
import { MotivLogo } from '@/components/ui/MotivLogo'

type NavItem = { href: string; label: string; short: string; icon: LucideIcon }

/**
 * Settings chrome — the same fixed navy sidebar as the store "today" page
 * (see ExecChrome's StoreDesktopSidebar), but its nav items are the settings
 * categories. Replaces the old top Navbar. On mobile it becomes a top bar +
 * bottom tab nav, mirroring the rest of the app.
 */
export function SettingsChrome({
  children, userName, roleLabel, roleHome, profileLabel,
}: {
  children: ReactNode
  userName: string | null
  roleLabel: string
  roleHome: string
  profileLabel: string
}) {
  const pathname = usePathname()
  const user = userName ?? roleLabel
  const initial = user.trim().charAt(0).toUpperCase()
  const iconBtn = 'p-2 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 transition-colors'

  const NAV: NavItem[] = [
    { href: '/settings',               label: 'Account',        short: 'Account', icon: UserCircle2 },
    { href: '/settings/profile',       label: profileLabel,     short: 'Profile', icon: Building2 },
    { href: '/settings/notifications', label: 'Notifications',  short: 'Alerts',  icon: Bell },
    { href: '/settings/appearance',    label: 'Appearance',     short: 'Theme',   icon: Palette },
    { href: '/settings/privacy',       label: 'Privacy & Data', short: 'Privacy', icon: ShieldCheck },
  ]
  // /settings is the Account index — exact match; deeper routes match by prefix.
  const isActive = (href: string) => href === '/settings' ? pathname === '/settings' : pathname.startsWith(href)

  return (
    <div className="min-h-screen bg-[var(--app-bg)] text-[var(--text)] flex flex-col">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[260px] border-r border-white/10 bg-brand-600 text-white lg:flex lg:flex-col">
        <div className="px-5 pt-6 pb-4">
          <Link href={roleHome} className="inline-flex"><MotivLogo height={44} /></Link>
          <Link href={roleHome} className="mt-6 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-gray-200 transition hover:bg-white/[0.08]">
            <ArrowLeft size={14} className="shrink-0 text-gray-400" /> Back to Dashboard
          </Link>
        </div>

        <nav className="flex-1 px-3">
          <p className="px-3 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Settings</p>
          <div className="space-y-1">
            {NAV.map(({ href, label, icon: Icon }) => {
              const on = isActive(href)
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={on ? 'page' : undefined}
                  className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition ${
                    on ? 'bg-blue-600/25 text-white ring-1 ring-blue-500/30' : 'text-gray-300 hover:bg-white/[0.06] hover:text-white'
                  }`}
                >
                  <Icon size={18} className={on ? 'text-blue-300' : 'text-gray-400'} />
                  <span>{label}</span>
                </Link>
              )
            })}
          </div>
        </nav>

        <div className="border-t border-white/10 px-3 py-4">
          <form action="/auth/logout" method="post">
            <button type="submit" className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold text-gray-300 transition hover:bg-white/[0.06] hover:text-white">
              <LogOut size={18} className="text-gray-400" /> Log out
            </button>
          </form>
        </div>

        <div className="border-t border-white/10 p-4">
          <div className="flex items-center gap-3 rounded-2xl bg-white/[0.04] p-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-blue-600 text-sm font-bold text-white">{initial}</span>
            <div className="min-w-0">
              <div className="truncate text-sm font-bold text-white">{user}</div>
              <div className="truncate text-xs text-gray-400">{roleLabel}</div>
            </div>
          </div>
        </div>
      </aside>

      <div className="lg:pl-[260px] flex min-h-screen flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-20 bg-brand-600 border-b border-brand-700 lg:hidden">
          <div className="max-w-[1700px] mx-auto px-4 h-16 flex items-center justify-between">
            <Link href={roleHome}><MotivLogo height={40} /></Link>
            <div className="flex items-center gap-1">
              <Link href={roleHome} className={iconBtn} title="Back to Dashboard"><ArrowLeft size={18} /></Link>
              <form action="/auth/logout" method="post" className="contents">
                <button type="submit" className={iconBtn} title="Log out"><LogOut size={17} /></button>
              </form>
              <div className="flex items-center gap-2 pl-2 ml-1 border-l border-white/15">
                <span className="w-8 h-8 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-sm">{initial}</span>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 max-w-[1700px] w-full mx-auto px-4 sm:px-5 py-5 pb-32 lg:px-10 lg:py-8 lg:pb-10">{children}</main>

        {/* Mobile bottom tab nav = settings categories */}
        <nav className="fixed bottom-0 inset-x-0 z-20 bg-brand-600 border-t border-brand-700 lg:hidden">
          <div className="max-w-[1700px] mx-auto flex items-stretch h-20 justify-around">
            {NAV.map(({ href, short, icon: Icon }) => {
              const on = isActive(href)
              return (
                <Link key={href} href={href} aria-current={on ? 'page' : undefined}
                  className={`flex flex-col items-center justify-center gap-1 flex-1 text-[11px] font-medium transition-colors ${on ? 'text-blue-300' : 'text-gray-400 hover:text-gray-200'}`}>
                  <Icon size={22} strokeWidth={on ? 2.4 : 1.8} />
                  {short}
                </Link>
              )
            })}
          </div>
        </nav>
      </div>
    </div>
  )
}
