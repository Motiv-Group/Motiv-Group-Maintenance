import { ReportBuilder } from '@/components/reports/ReportBuilder'

export default function SupplierReportsPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Reports</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          Generate a professional performance report — tickets, quoting, delivery and sub-suppliers.
        </p>
      </div>
      <ReportBuilder role="supplier" />
    </div>
  )
}
