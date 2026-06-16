import { requireRegionalV3 } from '@/lib/health/guard'
import { ExecChrome } from '@/components/exec/ExecChrome'
import { RealtimeRefresh } from '@/components/ui/RealtimeRefresh'

export const dynamic = 'force-dynamic'

export default async function RegionalLayout({ children }: { children: React.ReactNode }) {
  const { fullName } = await requireRegionalV3()
  return (
    <ExecChrome userName={fullName} variant="regional">
      <RealtimeRefresh tables={['tickets', 'quotes', 'signoffs', 'snags']} />
      {children}
    </ExecChrome>
  )
}
