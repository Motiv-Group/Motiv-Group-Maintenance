import { redirect } from 'next/navigation'
// v2 ticket detail; store managers use the My Tickets list in v3.
export default function Page() { redirect('/client/tickets') }
