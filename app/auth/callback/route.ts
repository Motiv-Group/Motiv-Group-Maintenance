import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Exchanges the auth code from an email link (password recovery, etc.) for a
// session cookie, then redirects to `next`.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const supabase = createClient()
    await supabase.auth.exchangeCodeForSession(code)
  }

  return NextResponse.redirect(`${origin}${next}`)
}
