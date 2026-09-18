/**
 * [blocker] ล็อกอินสำเร็จแล้วต้องไม่ถูกส่งกลับหน้าล็อกอิน (แก้ 2026-09-17)
 *
 * ## บั๊กจริง
 *
 * ออกจากระบบ → กด Sign in with Apple → ยืนยันกับ Apple **สำเร็จ** → กลับมาแล้ว
 * **ยังอยู่หน้าล็อกอินเหมือนเดิม** · ครั้งแรกหลังติดตั้งใหม่ไม่เป็น
 *
 * ต้นเหตุ: `signOut({ callbackUrl: '/auth/sign-in' })` ทิ้งค่านั้นไว้ในคุกกี้
 * `__Secure-next-auth.callback-url` · ขากลับของ Apple เป็น `form_post` ที่ **ไม่มี**
 * พารามิเตอร์ `callbackUrl` ⇒ next-auth ถอยไปอ่านคุกกี้ (`core/lib/callback-url.js`)
 * ⇒ ได้ `/auth/sign-in` ⇒ `callbacks.redirect` เดิมปล่อยผ่านทุก path ที่ขึ้นต้นด้วย `/`
 *
 * ผู้ใช้ **ล็อกอินสำเร็จแล้วจริง ๆ** แต่นั่งมองฟอร์มล็อกอิน แล้วสรุปว่าเข้าไม่ได้
 */
import { describe, expect, it } from 'vitest'

import { resolvePostAuthRedirect } from '@/lib/post-auth-redirect'

const BASE = 'https://seller.deepthailand.app'

describe('[blocker] ห้ามลงเอยที่หน้ายืนยันตัวตนหลังล็อกอินสำเร็จ', () => {
  it('🛑 `/auth/sign-in` (ค่าที่ค้างจาก signOut) → ต้องไป /dashboard ไม่ใช่วนกลับ', () => {
    expect(resolvePostAuthRedirect('/auth/sign-in', BASE)).toBe(`${BASE}/dashboard`)
  })

  it('🛑 มี query ต่อท้ายก็ยังคือหน้าล็อกอิน', () => {
    expect(resolvePostAuthRedirect('/auth/sign-in?callbackUrl=%2Fshop', BASE)).toBe(`${BASE}/dashboard`)
    expect(resolvePostAuthRedirect('/auth/sign-in#x', BASE)).toBe(`${BASE}/dashboard`)
  })

  /**
   * 🛑 เคสที่หลอกตาที่สุด — มีคำว่า `/auth/callback/` อยู่ใน query
   * ถ้าวันหนึ่งมีคนเปลี่ยนการตรวจจาก `startsWith` เป็น `includes` เคสนี้จะพาผู้ใช้
   * กลับไปหน้าล็อกอินทันทีโดยที่เทสอื่นยังเขียวหมด
   */
  it('🛑 หน้าล็อกอินที่มี /auth/callback/ ซ่อนใน query → ยังต้องเป็นหน้าล็อกอินอยู่ดี', () => {
    expect(resolvePostAuthRedirect('/auth/sign-in?next=/auth/callback/line', BASE)).toBe(`${BASE}/dashboard`)
  })

  it('🛑 แบบเต็ม URL ก็ต้องกันด้วย (คุกกี้เก็บค่าเต็มได้)', () => {
    expect(resolvePostAuthRedirect(`${BASE}/auth/sign-in`, BASE)).toBe(`${BASE}/dashboard`)
  })

  it('หน้า auth อื่น ๆ ก็ไม่ใช่ปลายทางหลังล็อกอิน', () => {
    for (const p of ['/auth/sign-up', '/auth/verify-otp', '/auth/reset-pass', '/auth/new-pass']) {
      expect(resolvePostAuthRedirect(p, BASE), `${p} ไม่ควรเป็นปลายทาง`).toBe(`${BASE}/dashboard`)
    }
  })
})

describe('[blocker] 🛑 ห้ามเหมารวม /auth ทั้งหมด — LINE กับ Instagram จะล็อกอินไม่ได้', () => {
  /**
   * `SignInForm` ส่ง `callbackUrl: '/auth/callback/line?next=...'` โดยตั้งใจ — เป็นหน้ารอ
   * ให้ session นิ่งก่อนส่งต่อ · ตัดทิ้งเมื่อไหร่ = ล็อกอิน LINE/IG พังทันทีทั้งสองเจ้า
   */
  it('`/auth/callback/line` ต้องผ่าน พร้อม query เดิมครบ', () => {
    const url = '/auth/callback/line?next=%2Fdashboard'
    expect(resolvePostAuthRedirect(url, BASE)).toBe(`${BASE}${url}`)
  })

  it('`/auth/callback/instagram` ต้องผ่าน', () => {
    const url = '/auth/callback/instagram?next=%2Fshop'
    expect(resolvePostAuthRedirect(url, BASE)).toBe(`${BASE}${url}`)
  })

  it('`/auth/callback/facebook` ต้องผ่าน (ยังมีผู้ใช้อยู่)', () => {
    expect(resolvePostAuthRedirect('/auth/callback/facebook', BASE)).toBe(`${BASE}/auth/callback/facebook`)
  })
})

describe('[blocker] พฤติกรรมเดิมต้องไม่เปลี่ยน', () => {
  it('path ปกติผ่านตามเดิม', () => {
    for (const p of ['/dashboard', '/shop', '/orders?stage=x', '/business/subscribe']) {
      expect(resolvePostAuthRedirect(p, BASE)).toBe(`${BASE}${p}`)
    }
  })

  it('URL เต็มที่ origin เดียวกันผ่านตามเดิม', () => {
    expect(resolvePostAuthRedirect(`${BASE}/dashboard`, BASE)).toBe(`${BASE}/dashboard`)
  })

  it('🛑 นอก origin ต้องถอยไป baseUrl (open-redirect)', () => {
    expect(resolvePostAuthRedirect('https://evil.com/x', BASE)).toBe(BASE)
    expect(resolvePostAuthRedirect('https://evil.com/auth/sign-in', BASE)).toBe(BASE)
  })

  it('URL ที่ใช้ไม่ได้ → baseUrl', () => {
    expect(resolvePostAuthRedirect('not a url', BASE)).toBe(BASE)
  })
})

/**
 * [blocker] ผลลัพธ์ต้องเป็น URL เต็มเสมอ (แก้ 2026-09-18)
 *
 * ## บั๊กจริง
 *
 * ล็อกอินด้วยรหัสผ่านบน iPhone → ปุ่มขึ้น "กำลังเข้าสู่ระบบ..." แล้วกลับเป็น "เข้าสู่ระบบ"
 * **ไม่มีข้อความ ไม่เปลี่ยนหน้า ช่องยังมีข้อความเดิม** · รีเฟรชแล้วเข้าได้ทันที
 *
 * ต้นเหตุ: ฟังก์ชันนี้เคยคืน `/dashboard` (ไม่มีโดเมน) · `signIn(..., { redirect: false })`
 * ฝั่งหน้าเว็บของ next-auth รับค่านี้เป็น `data.url` แล้วทำ `new URL(data.url)`
 * (`next-auth/react/index.js` ตอนแยก `?error=`) ⇒ **throw `TypeError`** หลัง POST สำเร็จ
 * ⇒ คุกกี้ session ตั้งไปแล้ว แต่โค้ดหลังล็อกอินไม่เคยได้รัน
 *
 * Apple ไม่เป็น เพราะ Apple ใช้ค่านี้เป็น `Location` ของ 302 ฝั่งเซิร์ฟเวอร์ ซึ่งรับ path ได้
 *
 * กระทบ **ทุกทางเข้าที่ใช้ `redirect: false` จากหน้า `/auth/*`** — รหัสผ่าน/OTP ของผู้ขาย
 * แอดมิน และผู้ซื้อ (baseUrl บน prod อิงโดเมนที่เข้า จึงเข้ากิ่งนี้ทุกโดเมน)
 *
 * สัญญาเดียวกับ callback ปริยายของ next-auth เอง (`core/lib/default-callbacks.js`):
 * `if (url.startsWith("/")) return \`${baseUrl}${url}\``
 */
describe('[blocker] ผลลัพธ์ต้องเป็น URL เต็มเสมอ — signIn ฝั่งหน้าเว็บ parse ด้วย new URL()', () => {
  const INPUTS = [
    '/auth/sign-in',
    `${BASE}/auth/sign-in`,
    `${BASE}/auth/sign-in?callbackUrl=%2Fdashboard`,
    `${BASE}/auth/verify-otp?phone=0800000000&mode=signin`,
    '/dashboard',
    '/auth/callback/line?next=%2Finbox',
    `${BASE}/dashboard`,
    'https://evil.com/x',
    'not a url',
  ]

  it.each(INPUTS)('🛑 %s → new URL(ผลลัพธ์) ต้องไม่ throw', (input) => {
    const out = resolvePostAuthRedirect(input, BASE)
    /* บรรทัดเดียวกับที่ next-auth ทำใน signIn() — throw ตรงนี้ = บั๊กบน iPhone กลับมา */
    expect(() => new URL(out).searchParams.get('error'), `ได้ "${out}"`).not.toThrow()
  })

  it('🛑 เคสที่เจอจริง: รหัสผ่านจากหน้า /auth/sign-in (callbackUrl ปริยาย = window.location.href)', () => {
    expect(resolvePostAuthRedirect(`${BASE}/auth/sign-in`, BASE)).toBe(`${BASE}/dashboard`)
  })

  it('🛑 `//evil.com` (protocol-relative) ต้องไม่หลุดไปโดเมนอื่น — เหตุผลที่ต่อสตริงไม่ใช้ new URL(path, base)', () => {
    for (const input of ['//evil.com', '//evil.com/dashboard', '/\\evil.com']) {
      expect(new URL(resolvePostAuthRedirect(input, BASE)).origin, input).toBe(BASE)
    }
  })

  it('ผลลัพธ์ต้องอยู่ origin เดียวกับ baseUrl เสมอ', () => {
    for (const input of INPUTS) {
      expect(new URL(resolvePostAuthRedirect(input, BASE)).origin).toBe(BASE)
    }
  })
})

describe('[blocker] auth.ts ต้องเรียก SSOT ไม่เขียนกฎเอง', () => {
  it('🛑 ห้ามกลับไปเขียน `if (url.startsWith("/")) return url` ตรง ๆ', async () => {
    const fs = await import('fs')
    const code = fs
      .readFileSync('src/lib/auth.ts', 'utf8')
      .split('\n')
      .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*'))
      .join('\n')

    expect(code).toContain('resolvePostAuthRedirect(url, baseUrl)')
    expect(
      /async redirect\(\{[^}]*\}\)\s*\{\s*if \(url\.startsWith/.test(code),
      'เขียนกฎเองในไฟล์นี้ = บั๊กเดิมกลับมา',
    ).toBe(false)
  })
})
