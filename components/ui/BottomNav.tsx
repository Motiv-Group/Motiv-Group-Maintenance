'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Ticket, Users, BarChart2,
  AlertTriangle, Store, ClipboardCheck, Truck,
  Globe2, Map as MapIcon, Gavel,
} from 'lucide-react'

type NavRole = 'client' | 'supplier' | 'regional' | 'executive'

const NAV_LINKS: Record<NavRole, { href: string; label: string; icon: React.ElementType }[]> = {
  supplier: [
    { href: '/supplier',           label: 'Home',          icon: LayoutDashboard },
    { href: '/supplier/tickets',   label: 'Tickets',       icon: Ticket          },
    { href: '/supplier/regional',  label: 'Clients',       icon: Users           },
    { href: '/supplier/suppliers', label: 'Sub Suppliers', icon: Truck           },
    { href: '/supplier/stats',     label: 'Stats',         icon: BarChart2       },
    { href: '/supplier/snag',      label: 'Snag',          icon: AlertTriangle   },
  ],
  regional: [
    { href: '/regional',         label: 'Dashboard', icon: LayoutDashboard },
    { href: '/regional/stores',  label: 'Stores',    icon: Store           },
    { href: '/regional/tickets', label: 'Tickets',   icon: Ticket          },
    { href: '/regional/signoff', label: 'Sign-off',  icon: ClipboardCheck  },
    { href: '/regional/snag',    label: 'Snag',      icon: AlertTriangle   },
  ],
  client: [
    { href: '/client',         label: 'Dashboard', icon: LayoutDashboard },
    { href: '/client/tickets', label: 'Tickets',   icon: Ticket          },
  ],
  executive: [
    { href: '/executive',           label: 'Estate',    icon: Globe2          },
    { href: '/executive/regions',   label: 'Regions',   icon: MapIcon         },
    { href: '/executive/stores',    label: 'Stores',    icon: Store           },
    { href: '/executive/suppliers', label: 'Suppliers', icon: Truck           },
    { href: '/executive/decisions', label: 'Decisions', icon: Gavel           },
  ],
}

const BASE: Record<NavRole, string> = {
  supplier:  '/supplier',
  regional:  '/regional',
  client:    '/client',
  executive: '/executive',
}

export function BottomNav({ role }: { role: NavRole }) {
  const pathname = usePathname()
  const links    = NAV_LINKS[role]
  const base     = BASE[role]

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-20 bg-brand-600 border-t border-brand-700 safe-area-pb">
      <div className="flex items-stretch justify-around h-16">
        {links.map(({ href, label, icon: Icon }) => {
          const active =
            pathname === href ||
            (href !== base && pathname.startsWith(href + '/'))
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center justify-center flex-1 gap-1 text-[10px] font-medium transition-colors ${
                active
                  ? 'text-[#C6A35D]'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <Icon size={22} strokeWidth={active ? 2.5 : 1.8} />
              {label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
