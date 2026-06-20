import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { getSubdomain } from '@/lib/subdomain'
import { isAllowedOrigin } from '@/lib/csrf-origin'
import { checkApiRateLimit, clientIp } from '@/lib/api-rate-limit'

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

// CSRF + rate-limit สำหรับ /api (NFR-2.2/2.3) — proxy = nodejs runtime
// ยกเว้น /api/auth/* (NextAuth จัดการ CSRF + session polling เอง)
async function guardApi(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl
  if (pathname.startsWith('/api/auth/')) return NextResponse.next()

  // CSRF: Origin-check เฉพาะ mutation (OPTIONS preflight ปล่อยผ่าน)
  // ยกเว้น /api/app/* — Buyer App (mobile) ไม่มี Origin header แบบ browser;
  // auth ของ /api/app ใช้ Bearer token (lib/app-auth.ts) ไม่ใช่ cookie จึงไม่มี
  // CSRF surface (CSRF อาศัย cookie ที่ browser แนบอัตโนมัติ). ยังคง rate-limit ด้านล่าง.
  if (MUTATION_METHODS.has(request.method) && !pathname.startsWith('/api/app/')) {
    if (!isAllowedOrigin(request.headers.get('origin'))) {
      return NextResponse.json({ error: 'CSRF check failed' }, { status: 403 })
    }
  }

  // Rate-limit per-IP: unauth 100/min, auth 30/min (แยก bucket ด้วย suffix)
  const token = await getToken({ req: request })
  const limit = token ? 30 : 100
  const key = `${clientIp(request)}:${token ? 'auth' : 'pub'}`
  if (!checkApiRateLimit(key, limit, 60_000)) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': '60' } },
    )
  }

  return NextResponse.next()
}

export async function proxy(request: NextRequest) {
  const host = request.headers.get('host') || 'localhost:3000'
  const subdomain = getSubdomain(host)
  const { pathname } = request.nextUrl

  // Internal Next paths — ปล่อยผ่าน
  if (pathname.startsWith('/_next')) {
    return NextResponse.next()
  }
  // API — CSRF + rate-limit (ไม่ rewrite, ไม่แตะ subdomain routing)
  if (pathname.startsWith('/api')) {
    return guardApi(request)
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
    // Dashboard + register + onboarding require login
    if ((pathname.startsWith('/dashboard') || pathname.startsWith('/register') || pathname.startsWith('/onboarding')) && !isAuthed) {
      return NextResponse.redirect(new URL('/auth/sign-in', request.url))
    }
    // บังคับ 2 เฟส (flag ใน JWT): needsRegistration (ไม่มีเบอร์) → /register (ลงทะเบียน เหมือน sign-up);
    // needsOnboarding (ไม่มี slug) → /onboarding (setup ครั้งแรก). ยกเว้น /auth,/api. ปิด/หนีไม่ได้จนเสร็จ
    const t = token as { needsRegistration?: boolean; needsOnboarding?: boolean } | null
    const isExempt = pathname.startsWith('/auth') || pathname.startsWith('/api')
    if (isAuthed && !isExempt) {
      if (t?.needsRegistration) {
        // เฟส 1: ยังไม่มีเบอร์ → ต้องลงทะเบียนที่ /register ก่อน
        if (!pathname.startsWith('/register')) return NextResponse.redirect(new URL('/register', request.url))
      } else {
        // ลงทะเบียนแล้ว แต่ยังค้างที่ /register → ออกไปเฟสถัดไป (/dashboard ก่อน → proxy เด้ง /onboarding ถ้ายังไม่ setup)
        if (pathname.startsWith('/register'))
          return NextResponse.redirect(new URL('/dashboard', request.url))
        // เฟส 2: ไม่มี slug → ต้อง setup ที่ /onboarding
        if (t?.needsOnboarding && !pathname.startsWith('/onboarding'))
          return NextResponse.redirect(new URL('/onboarding', request.url))
        // setup เสร็จแล้ว แต่ยังค้างที่ /onboarding → ออก
        if (!t?.needsOnboarding && pathname.startsWith('/onboarding'))
          return NextResponse.redirect(new URL('/dashboard', request.url))
      }
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
