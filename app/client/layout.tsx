import { Navbar } from '@/components/ui/Navbar'
import { BottomNav } from '@/components/ui/BottomNav'
import { RealtimeRefresh } from '@/components/ui/RealtimeRefresh'
import { SwipeNav } from '@/components/ui/SwipeNav'

const LINKS = [
  { href: '/client',         label: 'Dashboard' },
  { href: '/client/tickets', label: 'Tickets'   },
]

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar role="client" />
      <RealtimeRefresh tables={['tickets', 'quotes', 'notifications']} />
      <SwipeNav links={LINKS}>
        <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6 pb-24">
          {children}
        </main>
      </SwipeNav>
      <BottomNav role="client" />
    </div>
  )
}
