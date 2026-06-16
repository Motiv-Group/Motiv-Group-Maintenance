import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// POST /auth/logout — server-side sign-out + redirect.
// Driven by a native <form> in the Navbar so logout never depends on client
// hydration or a client-side router transition (both of which previously made
// the logout button appear unresponsive). signOut clears the auth cookies on
// the response; we always redirect even if signOut fails.
export async function POST(request: Request) {
  const supabase = createClient()
  try { await supabase.auth.signOut() } catch {}
  // 303 → browser re-issues the request to /auth/login as a GET
  return NextResponse.redirect(new URL('/auth/login', request.url), { status: 303 })
}
