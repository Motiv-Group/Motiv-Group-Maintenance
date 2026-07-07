export const dynamic = 'force-dynamic'

import { createAdminClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { SupplierEditForm } from '@/components/admin/SupplierEditForm'
import { BackButton } from '@/components/ui/BackButton'
import type { Supplier } from '@/lib/types'

export default async function EditSupplierPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const adminClient = createAdminClient()
  const { data } = await adminClient.from('suppliers').select('*').eq('id', params.id).single()
  if (!data) notFound()

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <BackButton />
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Edit Sub Supplier</h1>
      </div>
      <SupplierEditForm supplier={data as Supplier} />
    </div>
  )
}
