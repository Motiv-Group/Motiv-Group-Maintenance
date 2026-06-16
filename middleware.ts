import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// v3 cutover: roles live in user_profiles (company-scoped identity).
export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options))
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const path = request.nextUrl.pathname

  async function getRole(): Promise<string | null> {
    if (!user) return null
    const { data } = await supabase.from('user_profiles').select('role').eq('id', user.id).single()
    return data?.role ?? null
  }

  const gate = async (allowed: string[]) => {
    if (!user) return NextResponse.redirect(new URL('/auth/login', request.url))
    const role = await getRole()
    if (!role || !allowed.includes(role)) return NextResponse.redirect(new URL('/auth/login', request.url))
    return null
  }

  if (path.startsWith('/client'))    { const r = await gate(['store_manager']); if (r) return r }
  if (path.startsWith('/regional'))  { const r = await gate(['regional_manager']); if (r) return r }
  if (path.startsWith('/supplier'))  { const r = await gate(['supplier']); if (r) return r }
  if (path.startsWith('/executive')) { const r = await gate(['executive', 'system_admin']); if (r) return r }
  if (path.startsWith('/admin'))     { const r = await gate(['system_admin']); if (r) return r }
  if (path.startsWith('/settings'))  { if (!user) return NextResponse.redirect(new URL('/auth/login', request.url)) }

  if (user && (path === '/auth/login' || path === '/auth/signup')) {
    const role = await getRole()
    const dest = role === 'supplier' ? '/supplier'
      : role === 'regional_manager' ? '/regional'
      : role === 'executive' || role === 'system_admin' ? '/executive'
      : '/client'
    return NextResponse.redirect(new URL(dest, request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/client/:path*', '/supplier/:path*', '/regional/:path*', '/executive/:path*', '/admin/:path*', '/settings', '/settings/:path*', '/auth/:path*'],
}
