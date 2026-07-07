import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

// POST /auth/logout — server-side sign-out + redirect.
// Driven by a native <form> in the chrome so logout never depends on client
// hydration. We sign out AND explicitly expire every Supabase auth cookie on the
// redirect response — a token refresh (e.g. after submitting a quote) can leave a
// cookie that signOut's own clear misses, which previously made logout "stick".
export async function POST(request: Request) {
  const supabase = await createClient()
  try { await supabase.auth.signOut() } catch {}

  // 303 → browser re-issues the request to /auth/login as a GET
  const res = NextResponse.redirect(new URL('/auth/login', request.url), { status: 303 })
  try {
    for (const c of (await cookies()).getAll()) {
      if (c.name.startsWith('sb-')) res.cookies.set(c.name, '', { maxAge: 0, path: '/' })
    }
  } catch {}
  return res
}
