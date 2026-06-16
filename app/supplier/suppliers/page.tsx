import { redirect } from 'next/navigation'
// v2 sub-supplier directory removed in v3 (suppliers are company-managed by RM/Exec).
export default function Page() { redirect('/supplier') }
