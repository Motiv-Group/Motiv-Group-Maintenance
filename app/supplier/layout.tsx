import { Navbar } from '@/components/ui/Navbar'
import { BottomNav } from '@/components/ui/BottomNav'
import { RealtimeRefresh } from '@/components/ui/RealtimeRefresh'
import { SwipeNav } from '@/components/ui/SwipeNav'

const LINKS = [
  { href: '/supplier',           label: 'Dashboard' },
  { href: '/supplier/tickets',   label: 'Tickets'   },
  { href: '/supplier/regional',  label: 'Clients'   },
  { href: '/supplier/suppliers', label: 'Sub Suppliers' },
  { href: '/supplier/stats',     label: 'Stats'     },
  { href: '/supplier/snag',      label: 'Snag'      },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar role="supplier" />
      <RealtimeRefresh tables={['tickets', 'quotes', 'notifications', 'profiles', 'completions']} />
      <SwipeNav links={LINKS}>
        <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6 pb-24">
          {children}
        </main>
      </SwipeNav>
      <BottomNav role="supplier" />
    </div>
  )
}
