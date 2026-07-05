import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Only allow same-origin relative paths in `next` — reject protocol-relative
// (`//host`), backslash tricks, absolute URLs and userinfo (`@`) to prevent an
// open redirect to an attacker-controlled host after login.
function safeNext(raw: string | null): string {
  const n = raw ?? '/'
  if (!n.startsWith('/') || n.startsWith('//') || n.startsWith('/\\') || n.includes('://') || n.includes('@')) {
    return '/'
  }
  return n
}

// Exchanges the auth code from an email link (password recovery, etc.) for a
// session cookie, then redirects to `next`.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = safeNext(searchParams.get('next'))

  if (code) {
    const supabase = createClient()
    await supabase.auth.exchangeCodeForSession(code)
  }

  return NextResponse.redirect(`${origin}${next}`)
}
