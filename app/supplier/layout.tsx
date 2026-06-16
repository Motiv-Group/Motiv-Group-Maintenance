import { requireSupplierV3 } from '@/lib/health/guard'
import { ExecChrome } from '@/components/exec/ExecChrome'
import { RealtimeRefresh } from '@/components/ui/RealtimeRefresh'

export const dynamic = 'force-dynamic'

export default async function SupplierLayout({ children }: { children: React.ReactNode }) {
  const { fullName } = await requireSupplierV3()
  return (
    <ExecChrome userName={fullName} variant="supplier">
      <RealtimeRefresh tables={['tickets', 'quotes', 'signoffs']} />
      {children}
    </ExecChrome>
  )
}
