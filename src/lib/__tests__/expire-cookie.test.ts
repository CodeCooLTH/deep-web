/**
 * [blocker] ลบคุกกี้แล้วต้องลบได้จริงบน prod (2026-09-20)
 *
 * ## บั๊กจริง — จอขาวบน iPad หลังล็อกอิน Apple
 *
 * ด่าน 3.1.1 (`proxy.ts`) เตะผู้ใช้ที่ตั้งค่าร้านไม่เสร็จไป `/auth/sign-in?app_setup_required=1`
 * พร้อม **สั่งลบคุกกี้ session** — แต่คำสั่งนั้นไม่เคยมีผลบน prod เพราะ
 * `res.cookies.delete(name)` ส่ง `Set-Cookie` ที่ **ไม่มีแฟล็ก `Secure`** ขณะที่ชื่อคุกกี้
 * ขึ้นต้นด้วย `__Secure-` ⇒ เบราว์เซอร์ทิ้งคำสั่งทั้งใบตามสเปก
 *
 * ⇒ session ยังอยู่ ⇒ หน้า sign-in ส่งกลับ `/dashboard` ⇒ โดนด่านเตะกลับ ⇒ **วนไม่จบ**
 * ⇒ WebView ค้างหน้าเปล่า เลื่อนไม่ได้ ลากรีเฟรชได้แค่จอโหลด (ตรงกับที่หัวหน้าเจอ)
 *
 * 🛑 เทสนี้อ่าน `Set-Cookie` ที่ออกไปจริง ไม่ใช่เชื่อว่า API ทำให้ถูก — ของเดิมก็ "เรียกถูก"
 * ทุกตัวอักษร สิ่งที่ผิดคือสิ่งที่ส่งออกไป
 */
import { NextResponse } from 'next/server'
import { describe, expect, it } from 'vitest'

import { cookieNeedsSecure, expireCookie, expireCookies } from '@/lib/expire-cookie'

/**
 * 🛑 ต้องจับ "แฟล็ก" ไม่ใช่คำว่า Secure เฉย ๆ — ชื่อคุกกี้เองก็มีคำนี้อยู่ (`__Secure-…`)
 * เทสร่างแรกเขียน /Secure/i แล้วแดงทันทีเพราะไปจับชื่อตัวเอง
 */
function hasSecureFlag(setCookie: string): boolean {
  return /;\s*Secure(\s*;|\s*$)/i.test(setCookie)
}

function setCookies(fn: (res: NextResponse) => void): string[] {
  const res = NextResponse.redirect('https://seller.deepthailand.app/auth/sign-in?app_no_account=1')
  fn(res)
  return res.headers.getSetCookie()
}

describe('[blocker] คุกกี้ชื่อ __Secure- ต้องลบด้วยแฟล็ก Secure', () => {
  it('🛑 ของเดิม (res.cookies.delete) ส่งคำสั่งที่เบราว์เซอร์ทิ้ง — เทสนี้ปักหลักฐานไว้', () => {
    const raw = setCookies((res) => res.cookies.delete('__Secure-next-auth.session-token'))
    expect(
      hasSecureFlag(raw[0]),
      'ถ้าวันหนึ่ง Next แก้ให้ใส่ Secure เอง เทสนี้จะแดงแล้วเราจะได้รู้',
    ).toBe(false)
  })

  it('🛑 expireCookie ต้องใส่ Secure ให้ชื่อที่ขึ้นต้น __Secure-', () => {
    const [first] = setCookies((res) => expireCookie(res, '__Secure-next-auth.session-token'))
    expect(first).toMatch(/^__Secure-next-auth\.session-token=;/)
    expect(hasSecureFlag(first), 'ไม่มีแฟล็ก Secure = เบราว์เซอร์ทิ้งคำสั่ง = ลูปเดิมกลับมา').toBe(true)
    expect(first, 'ต้องหมดอายุทันที').toMatch(/Max-Age=0/i)
    expect(first, 'path ต้องตรงกับตอนตั้ง ไม่งั้นเบราว์เซอร์มองเป็นคนละใบ').toMatch(/Path=\//)
  })

  it('🛑 ชื่อธรรมดาห้ามมี Secure — dev อยู่บน http ใส่ไปแล้วลบไม่ออกเหมือนกัน', () => {
    const [first] = setCookies((res) => expireCookie(res, 'next-auth.session-token'))
    expect(first).toMatch(/^next-auth\.session-token=;/)
    expect(hasSecureFlag(first)).toBe(false)
  })

  it('__Host- ก็ต้องมี Secure เหมือนกัน (สเปกเดียวกัน)', () => {
    expect(cookieNeedsSecure('__Host-next-auth.csrf-token')).toBe(true)
    expect(cookieNeedsSecure('__Secure-next-auth.state')).toBe(true)
    expect(cookieNeedsSecure('deep_shell')).toBe(false)
  })

  it('🛑 ต้องตามไปลบลูกที่ถูกหั่นด้วย — next-auth หั่นคุกกี้ยาวเป็น .0/.1', () => {
    const names = setCookies((res) => expireCookie(res, '__Secure-next-auth.session-token')).map(
      (c) => c.split('=')[0],
    )
    expect(names).toContain('__Secure-next-auth.session-token')
    expect(names).toContain('__Secure-next-auth.session-token.0')
    expect(names).toContain('__Secure-next-auth.session-token.1')
  })

  it('expireCookies ลบครบทุกใบที่ส่งเข้าไป', () => {
    const names = setCookies((res) =>
      expireCookies(res, ['__Secure-next-auth.state', 'next-auth.state']),
    ).map((c) => c.split('=')[0])
    expect(names).toContain('__Secure-next-auth.state')
    expect(names).toContain('next-auth.state')
  })
})

describe('[blocker] ผู้เรียกต้องใช้ตัวนี้ ไม่ใช่ res.cookies.delete', () => {
  it('🛑 ด่าน 3.1.1 ใน proxy.ts', async () => {
    const fs = await import('fs')
    const src = fs.readFileSync('src/proxy.ts', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    expect(src).toMatch(/expireCookies\(res, SESSION_COOKIES\)/)
    expect(src, 'delete() ตรง ๆ = ลูปเดิมกลับมา').not.toMatch(/cookies\.delete\(/)
  })

  it('🛑 /api/auth/cleanup — คุกกี้ OAuth บน prod ก็ชื่อ __Secure- ทั้งชุด', async () => {
    const fs = await import('fs')
    const src = fs
      .readFileSync('src/app/api/auth/cleanup/route.ts', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
    expect(src).toMatch(/expireCookies\(res, STALE_AUTH_COOKIES\)/)
    expect(src).not.toMatch(/cookies\.delete\(/)
  })
})

describe('[blocker] ตาข่ายชั้นสอง — หน้า sign-in ต้องไม่ส่งคนที่ด่านเตะมากลับไปวน', () => {
  it('🛑 ต้องยกเว้นเมื่อมาพร้อม app_no_account / app_setup_required', async () => {
    const fs = await import('fs')
    const src = fs
      .readFileSync('src/app/(paces)/seller/auth/sign-in/page.tsx', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
    expect(src).toMatch(/app_no_account/)
    expect(src).toMatch(/app_setup_required/)
    /* เงื่อนไข redirect ต้องผูกกับธงนี้จริง ไม่ใช่แค่ประกาศตัวแปรทิ้งไว้ */
    expect(src).toMatch(/if \(!blockedByAppGate && sessionUserId\(session\)\)/)
  })
})
