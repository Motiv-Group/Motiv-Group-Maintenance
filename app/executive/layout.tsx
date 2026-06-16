import { requireExecutiveV3 } from '@/lib/health/guard'
import { ExecChrome } from '@/components/exec/ExecChrome'
import { RealtimeRefresh } from '@/components/ui/RealtimeRefresh'

export const dynamic = 'force-dynamic'

export default async function ExecutiveLayout({ children }: { children: React.ReactNode }) {
  const { fullName } = await requireExecutiveV3()
  return (
    <ExecChrome userName={fullName}>
      <RealtimeRefresh tables={['tickets', 'quotes', 'signoffs', 'decision_items']} />
      {children}
    </ExecChrome>
  )
}
