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
    expect(resolvePostAuthRedirect('/auth/sign-in', BASE)).toBe('/dashboard')
  })

  it('🛑 มี query ต่อท้ายก็ยังคือหน้าล็อกอิน', () => {
    expect(resolvePostAuthRedirect('/auth/sign-in?callbackUrl=%2Fshop', BASE)).toBe('/dashboard')
    expect(resolvePostAuthRedirect('/auth/sign-in#x', BASE)).toBe('/dashboard')
  })

  /**
   * 🛑 เคสที่หลอกตาที่สุด — มีคำว่า `/auth/callback/` อยู่ใน query
   * ถ้าวันหนึ่งมีคนเปลี่ยนการตรวจจาก `startsWith` เป็น `includes` เคสนี้จะพาผู้ใช้
   * กลับไปหน้าล็อกอินทันทีโดยที่เทสอื่นยังเขียวหมด
   */
  it('🛑 หน้าล็อกอินที่มี /auth/callback/ ซ่อนใน query → ยังต้องเป็นหน้าล็อกอินอยู่ดี', () => {
    expect(resolvePostAuthRedirect('/auth/sign-in?next=/auth/callback/line', BASE)).toBe('/dashboard')
  })

  it('🛑 แบบเต็ม URL ก็ต้องกันด้วย (คุกกี้เก็บค่าเต็มได้)', () => {
    expect(resolvePostAuthRedirect(`${BASE}/auth/sign-in`, BASE)).toBe('/dashboard')
  })

  it('หน้า auth อื่น ๆ ก็ไม่ใช่ปลายทางหลังล็อกอิน', () => {
    for (const p of ['/auth/sign-up', '/auth/verify-otp', '/auth/reset-pass', '/auth/new-pass']) {
      expect(resolvePostAuthRedirect(p, BASE), `${p} ไม่ควรเป็นปลายทาง`).toBe('/dashboard')
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
    expect(resolvePostAuthRedirect(url, BASE)).toBe(url)
  })

  it('`/auth/callback/instagram` ต้องผ่าน', () => {
    const url = '/auth/callback/instagram?next=%2Fshop'
    expect(resolvePostAuthRedirect(url, BASE)).toBe(url)
  })

  it('`/auth/callback/facebook` ต้องผ่าน (ยังมีผู้ใช้อยู่)', () => {
    expect(resolvePostAuthRedirect('/auth/callback/facebook', BASE)).toBe('/auth/callback/facebook')
  })
})

describe('[blocker] พฤติกรรมเดิมต้องไม่เปลี่ยน', () => {
  it('path ปกติผ่านตามเดิม', () => {
    for (const p of ['/dashboard', '/shop', '/orders?stage=x', '/business/subscribe']) {
      expect(resolvePostAuthRedirect(p, BASE)).toBe(p)
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
