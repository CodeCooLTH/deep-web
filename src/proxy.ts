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
  // ยกเว้น /api/cron/* — Vercel Cron เรียกแบบ server-to-server ไม่มี Origin
  // header เหมือน browser (TD-002); auth ของ route นี้ใช้ CRON_SECRET ที่ตัว
  // route เองแทน ไม่ได้อาศัย cookie จึงไม่มี CSRF surface เช่นกัน. rate-limit ยัง apply ปกติ
  if (
    MUTATION_METHODS.has(request.method) &&
    !pathname.startsWith('/api/app/') &&
    !pathname.startsWith('/api/cron/')
  ) {
    if (!isAllowedOrigin(request.headers.get('origin'))) {
      return NextResponse.json({ error: 'CSRF check failed' }, { status: 403 })
    }
  }

  // Rate-limit per-IP แยก bucket ตาม method (feat 00007 item 6):
  //  - mutation (POST/PUT/PATCH/DELETE เช่น bid): auth 30/unauth 100 (เข้มเท่าเดิม)
  //  - read (GET เช่น realtime refetch auction detail): auth 120/unauth 200 —
  //    auction ร้อน client refetch ทุกครั้งราคาเปลี่ยน; read ถูก+idempotent จึงยกเพดานได้
  //    กันคนดูเฉยๆ โดน 429 โดยไม่ลดความเข้มของ mutation
  const token = await getToken({ req: request })
  const isMutation = MUTATION_METHODS.has(request.method)
  const limit = isMutation ? (token ? 30 : 100) : token ? 120 : 200
  const key = `${clientIp(request)}:${token ? 'auth' : 'pub'}:${isMutation ? 'mut' : 'get'}`
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
  // Static assets ใน public/ (favicon, /data/*.json, รูป ฯลฯ) — ปล่อยผ่าน ไม่ rewrite ตาม subdomain
  // (public/ เสิร์ฟที่ root; ถ้า rewrite → /seller/data/... = 404) — bug จริง feature Quick Create address db
  if (/\.(?:json|png|jpe?g|svg|gif|webp|ico|txt|woff2?|css|js|map)$/i.test(pathname)) {
    return NextResponse.next()
  }

  // Cookies are per-hostname → this token is specific to this subdomain's session
  const token = await getToken({ req: request })
  const isAuthed = !!token

  // ========== MAIN domain (buyer) ==========
  if (subdomain === 'main') {
    // feature 00012: ลิงก์เชิญพนักงาน `deepthailand.app/i/<slug>` อยู่บน main domain (สั้น แชร์ง่าย)
    // แต่ปลายทางคือ seller dashboard — redirect ไป seller subdomain เพื่อให้ login/accept เกิดใน
    // seller session (session แยกตาม subdomain). host มี port ติดมาด้วย (dev deepth.local:4000) → คงไว้
    if (pathname.startsWith('/i/')) {
      const rootHost = host.replace(/^www\./, '')
      return NextResponse.redirect(`${request.nextUrl.protocol}//seller.${rootHost}${pathname}${request.nextUrl.search}`)
    }
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

    // ── Mobile web app (แยกจาก desktop/tablet) ──
    // มือถือ (UA) + authed → rewrite buyer path ไปหน้า /m/* (URL เดิม แต่ render แอปมือถือ).
    // /dashboard → /m (หน้าแรก); path อื่นในลิสต์ → /m{path}
    const ua = request.headers.get('user-agent') || ''
    const isMobile = /Android|iPhone|iPod|Mobile|BlackBerry|IEMobile|Opera Mini/i.test(ua)
    if (isMobile && isAuthed && !pathname.startsWith('/m/') && pathname !== '/m') {
      const MOBILE_PREFIXES = ['/orders', '/messages', '/reviews', '/badges', '/settings']
      if (pathname === '/dashboard') {
        const url = request.nextUrl.clone()
        url.pathname = '/m'
        return NextResponse.rewrite(url)
      }
      // /check (public) — authed มือถือ → app shell /m/check (guest ไม่เข้า block นี้ → /check ปกติ)
      if (pathname === '/check') {
        const url = request.nextUrl.clone()
        url.pathname = '/m/check'
        return NextResponse.rewrite(url)
      }
      if (MOBILE_PREFIXES.some(p => pathname === p || pathname.startsWith(`${p}/`))) {
        const url = request.nextUrl.clone()
        url.pathname = `/m${pathname}`
        return NextResponse.rewrite(url)
      }
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
    // feature 00012: /choose-shop (เลือกร้าน/เปิดร้าน) + /i (landing รับคำเชิญ) ต้องเข้าถึงได้เสมอ —
    // ยกเว้นจาก force-redirect gate (ผู้ถูกเชิญ/nobody flags เป็น false อยู่แล้ว แต่กันเหนียวไว้)
    const isExempt =
      pathname.startsWith('/auth') ||
      pathname.startsWith('/api') ||
      pathname.startsWith('/choose-shop') ||
      pathname.startsWith('/i/') ||
      pathname === '/i'
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
      // x-pathname: ส่ง original pathname ให้ RSC layout อ่าน (feat 00008 P4-5) —
      // ใช้ให้ (dashboard) layout รู้ว่ากำลัง render หน้า business onboarding อยู่ไหม
      // เพื่อยกเว้น D4 force-redirect (กัน redirect loop)
      const requestHeaders = new Headers(request.headers)
      requestHeaders.set('x-pathname', pathname)
      return NextResponse.rewrite(url, { request: { headers: requestHeaders } })
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
