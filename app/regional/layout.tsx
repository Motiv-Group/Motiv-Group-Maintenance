import { Navbar } from '@/components/ui/Navbar'
import { BottomNav } from '@/components/ui/BottomNav'
import { RealtimeRefresh } from '@/components/ui/RealtimeRefresh'
import { SwipeNav } from '@/components/ui/SwipeNav'

const LINKS = [
  { href: '/regional',         label: 'Dashboard' },
  { href: '/regional/stores',  label: 'Stores'    },
  { href: '/regional/tickets', label: 'Tickets'   },
  { href: '/regional/signoff', label: 'Sign-off'  },
  { href: '/regional/snag',    label: 'Snag'      },
]

export default function RegionalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar role="regional" />
      <RealtimeRefresh tables={['tickets', 'quotes', 'notifications', 'completions']} />
      <SwipeNav links={LINKS}>
        <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6 pb-24">
          {children}
        </main>
      </SwipeNav>
      <BottomNav role="regional" />
    </div>
  )
}
