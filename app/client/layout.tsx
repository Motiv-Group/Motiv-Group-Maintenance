import { requireStoreManagerV3 } from '@/lib/health/guard'
import { ExecChrome } from '@/components/exec/ExecChrome'
import { RealtimeRefresh } from '@/components/ui/RealtimeRefresh'

export const dynamic = 'force-dynamic'

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const { fullName } = await requireStoreManagerV3()
  return (
    <ExecChrome userName={fullName} variant="store">
      <RealtimeRefresh tables={['tickets', 'quotes']} />
      {children}
    </ExecChrome>
  )
}
