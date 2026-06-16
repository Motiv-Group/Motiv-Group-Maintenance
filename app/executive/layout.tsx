import { Navbar } from '@/components/ui/Navbar'
import { BottomNav } from '@/components/ui/BottomNav'
import { RealtimeRefresh } from '@/components/ui/RealtimeRefresh'
import { SwipeNav } from '@/components/ui/SwipeNav'

const LINKS = [
  { href: '/executive',           label: 'Estate'    },
  { href: '/executive/regions',   label: 'Regions'   },
  { href: '/executive/stores',    label: 'Stores'    },
  { href: '/executive/suppliers', label: 'Suppliers' },
  { href: '/executive/decisions', label: 'Decisions' },
]

export default function ExecutiveLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar role="executive" />
      <RealtimeRefresh tables={['tickets', 'quotes', 'notifications', 'completions']} />
      <SwipeNav links={LINKS}>
        <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6 pb-24">
          {children}
        </main>
      </SwipeNav>
      <BottomNav role="executive" />
    </div>
  )
}
