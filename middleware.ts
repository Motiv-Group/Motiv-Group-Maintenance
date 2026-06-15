import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

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
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const path = request.nextUrl.pathname

  async function getRole() {
    if (!user) return null
    const { data } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    return data?.role ?? null
  }

  // Store manager routes
  if (path.startsWith('/client')) {
    if (!user) return NextResponse.redirect(new URL('/auth/login', request.url))
    const role = await getRole()
    if (role !== 'client' && role !== 'store_manager') {
      return NextResponse.redirect(new URL('/auth/login', request.url))
    }
  }

  // Regional manager routes
  if (path.startsWith('/regional')) {
    if (!user) return NextResponse.redirect(new URL('/auth/login', request.url))
    const role = await getRole()
    if (role !== 'regional_manager') {
      return NextResponse.redirect(new URL('/auth/login', request.url))
    }
  }

  // Admin routes
  if (path.startsWith('/supplier')) {
    if (!user) return NextResponse.redirect(new URL('/auth/login', request.url))
    const role = await getRole()
    if (role !== 'supplier') {
      return NextResponse.redirect(new URL('/auth/login', request.url))
    }
  }

  // Settings — any authenticated user
  if (path.startsWith('/settings')) {
    if (!user) return NextResponse.redirect(new URL('/auth/login', request.url))
  }

  // Redirect logged-in users away from auth pages
  if (user && (path === '/auth/login' || path === '/auth/signup')) {
    const role = await getRole()
    let dest = '/client'
    if (role === 'supplier') dest = '/supplier'
    else if (role === 'regional_manager') dest = '/regional'
    return NextResponse.redirect(new URL(dest, request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/client/:path*',
    '/supplier/:path*',
    '/regional/:path*',
    '/settings',
    '/settings/:path*',
    '/auth/:path*',
  ],
}
