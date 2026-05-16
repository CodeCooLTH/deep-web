import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { getSubdomain } from '@/lib/subdomain'

export async function proxy(request: NextRequest) {
  const host = request.headers.get('host') || 'localhost:3000'
  const subdomain = getSubdomain(host)
  const { pathname } = request.nextUrl

  // Skip internal paths early (no auth checks, no rewrites)
  if (pathname.startsWith('/_next') || pathname.startsWith('/api')) {
    return NextResponse.next()
  }

  // Cookies are per-hostname → this token is specific to this subdomain's session
  const token = await getToken({ req: request })
  const isAuthed = !!token

  // ========== MAIN domain (buyer) ==========
  if (subdomain === 'main') {
    // Block direct access to /seller/* and /admin/* on the main domain
    if (pathname.startsWith('/seller') || pathname.startsWith('/admin')) {
      return NextResponse.redirect(new URL('/', request.url))
    }
    // Landing `/` เข้าถึงได้ทั้ง guest + authed — ไม่ auto-redirect ไป
    // /dashboard (user feedback 2026-04-18). Header จะแสดง UserDropdown
    // แทนปุ่ม Login/Signup เมื่อ authed
    // /dashboard (and any nested /dashboard/*) requires login
    if (pathname.startsWith('/dashboard') && !isAuthed) {
      const signIn = new URL('/auth/sign-in', request.url)
      signIn.searchParams.set('callbackUrl', pathname)
      return NextResponse.redirect(signIn)
    }
    return NextResponse.next()
  }

  // ========== SELLER subdomain ==========
  if (subdomain === 'seller') {
    // Root dispatcher
    if (pathname === '/') {
      const target = isAuthed ? '/dashboard' : '/auth/sign-in'
      return NextResponse.redirect(new URL(target, request.url))
    }
    // Dashboard (and nested) requires login
    if (pathname.startsWith('/dashboard') && !isAuthed) {
      return NextResponse.redirect(new URL('/auth/sign-in', request.url))
    }
    // Backward-compat: URL เก่าที่ผู้ใช้ bookmark/พิมพ์ตรงแบบ /seller/orders
    // หลัง SP-1 strip /seller prefix ออกจาก nav แล้ว — redirect ถาวรเพื่อเลิกใช้รูปแบบเก่า
    if (pathname === '/seller' || pathname.startsWith('/seller/')) {
      const stripped = pathname.slice('/seller'.length) || '/'
      const target = stripped + request.nextUrl.search
      return NextResponse.redirect(new URL(target, request.url), 301)
    }
    // Everything else: rewrite to the internal /seller/* path tree
    if (!pathname.startsWith('/seller')) {
      const url = request.nextUrl.clone()
      url.pathname = `/seller${pathname}`
      return NextResponse.rewrite(url)
    }
    return NextResponse.next()
  }

  // ========== ADMIN subdomain ==========
  if (subdomain === 'admin') {
    if (pathname === '/') {
      const target = isAuthed ? '/dashboard' : '/auth/sign-in'
      return NextResponse.redirect(new URL(target, request.url))
    }
    if (pathname.startsWith('/dashboard') && !isAuthed) {
      return NextResponse.redirect(new URL('/auth/sign-in', request.url))
    }
    if (!pathname.startsWith('/admin')) {
      const url = request.nextUrl.clone()
      url.pathname = `/admin${pathname}`
      return NextResponse.rewrite(url)
    }
    return NextResponse.next()
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|images|icons).*)']
}
