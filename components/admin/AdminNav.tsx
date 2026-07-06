'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Database, Triangle, Mail, Zap, ShieldAlert, UsersRound, Network } from 'lucide-react'

// Tabs for the platform-admin area. Overview = existing revenue page; Accounts =
// invite the store hierarchy; Hierarchy = the company/region/store tree; the rest
// are the live infra/provider panels.
const TABS = [
  { href: '/admin',          label: 'Overview',  icon: LayoutDashboard },
  { href: '/admin/accounts', label: 'Accounts',  icon: UsersRound },
  { href: '/admin/hierarchy',label: 'Hierarchy', icon: Network },
  { href: '/admin/supabase', label: 'Supabase',  icon: Database },
  { href: '/admin/vercel',   label: 'Vercel',   icon: Triangle },
  { href: '/admin/resend',   label: 'Resend',   icon: Mail },
  { href: '/admin/upstash',  label: 'Upstash',  icon: Zap },
  { href: '/admin/sentry',   label: 'Sentry',   icon: ShieldAlert },
] as const

export function AdminNav() {
  const pathname = usePathname()
  return (
    <nav className="sticky top-16 z-10 bg-brand-600/95 backdrop-blur border-b border-brand-700">
      <div className="max-w-[1500px] mx-auto px-2 overflow-x-auto">
        <div className="flex items-stretch gap-0.5 min-w-max">
          {TABS.map(({ href, label, icon: Icon }) => {
            const active = href === '/admin' ? pathname === '/admin' : pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
                  active
                    ? 'text-[#C6A35D] border-[#C6A35D]'
                    : 'text-gray-400 border-transparent hover:text-gray-200'
                }`}
              >
                <Icon size={15} strokeWidth={active ? 2.4 : 1.8} />
                {label}
              </Link>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
