import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { DEFAULT_SELLER_CALLBACK, safeCallbackUrl } from '@/lib/safe-callback-url'

/**
 * ด่านกัน "ล็อกอิน Apple แล้วไปโผล่หน้าอื่นที่ไม่ใช่หน้าแรก" (user สั่ง 2026-08-12:
 * "login apple id ถ้าเสร็จหมดแล้วไปหน้า home นะ หน้าแรกอ่ะ")
 *
 * ปลายทางของการล็อกอินถูกตัดสินจาก **3 จุดที่อยู่คนละไฟล์กัน** และแต่ละจุดพังเงียบคนละแบบ —
 * ไม่มี tsc/build ตัวไหนโยงสามจุดนี้เข้าหากันได้เพราะทุกจุด "ถูก" ในตัวเอง:
 *
 *   1. `DEFAULT_SELLER_CALLBACK`  ถ้าไม่ใช่ /dashboard → ทุก provider ไปผิดที่พร้อมกัน
 *   2. `SignInForm` ปุ่ม Apple    ถ้าไม่ส่ง callbackUrl → NextAuth ถอยไปใช้ baseUrl (root ของ
 *                                 subdomain seller ซึ่ง **ไม่มีหน้า**) = ผู้ใช้เห็น 404 หลังล็อกอิน
 *   3. signIn callback (link mode) ถ้า `return "/account?..."` หลุดออกมานอกบล็อก link
 *                                 → การล็อกอินธรรมดาจะถูกลากไปหน้า "ข้อมูลส่วนตัว" ทุกครั้ง
 *
 * 🛑 ข้อ 3 คือเคสที่เกือบเกิดจริง: `/account` ถูกเพิ่มเป็นปลายทางในรอบเดียวกับที่เพิ่ม Apple
 * (แก้บั๊ก "กดเชื่อมแล้วเด้งไปหน้าการจัดส่ง") — ปลายทางของ **link** กับของ **login** อยู่ห่างกัน
 * ไม่กี่บรรทัดในไฟล์เดียวกัน และทั้งคู่เป็นสตริงที่ถูกต้องตามชนิดทุกประการ
 */

const ROOT = process.cwd()

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8')
}

describe('ล็อกอิน Apple ต้องจบที่หน้าแรก', () => {
  it('[blocker] ปลายทางตั้งต้นของฝั่งร้านคือ /dashboard', () => {
    // /dashboard = "หน้าหลัก" ในเมนูล่าง (SellerBottomNav) — root ของ subdomain seller ไม่มีหน้า
    expect(DEFAULT_SELLER_CALLBACK).toBe('/dashboard')
    expect(safeCallbackUrl(null)).toBe('/dashboard')
    expect(safeCallbackUrl(undefined)).toBe('/dashboard')
    // ค่าที่ไม่ผ่านเกณฑ์ต้องถอยมาหน้าแรก ไม่ใช่ถอยไปที่อื่น
    expect(safeCallbackUrl('//evil.com')).toBe('/dashboard')
  })

  it('[blocker] ปุ่ม Apple ในหน้าล็อกอินต้องส่ง callbackUrl ที่ผ่าน safeCallbackUrl', () => {
    const form = read('src/app/(paces)/seller/auth/sign-in/components/SignInForm.tsx')

    // ไม่ส่ง callbackUrl เลย = NextAuth ถอยไป baseUrl ซึ่งเป็น root ที่ไม่มีหน้า
    expect(form, 'ปุ่ม Apple ต้องส่ง callbackUrl').toMatch(/signIn\('apple',\s*\{\s*callbackUrl\s*\}/)

    // callbackUrl ต้องมาจากตัว sanitize ไม่ใช่อ่านดิบจาก query (open-redirect + ปลายทางมั่ว)
    expect(form).toContain("safeCallbackUrl(searchParams.get('callbackUrl'))")
  })

  it('[blocker] ปลายทาง /account สงวนให้ link mode เท่านั้น ห้ามหลุดมาเส้นล็อกอิน', () => {
    const auth = read('src/lib/auth.ts')

    /**
     * ทุกบรรทัดที่ return `/account` ต้องอยู่ **หลัง** จุดที่ตัดสินว่าเป็น link mode
     * (`if (!intent || intent.provider !== account.provider) return true;`)
     * ถ้ามีตัวไหนอยู่ก่อนหน้านั้น = การล็อกอินธรรมดาจะถูกลากไป /account ด้วย
     */
    const gate = auth.indexOf('intent.provider !== account.provider')
    expect(gate, 'หาด่านแยก link mode ใน auth.ts ไม่เจอ').toBeGreaterThan(-1)

    const accountReturns = [...auth.matchAll(/return\s+"\/account\?/g)].map((m) => m.index ?? -1)
    expect(accountReturns.length, 'ต้องมี return /account ของ link mode อยู่จริง').toBeGreaterThan(0)
    for (const at of accountReturns) {
      expect(at, `return "/account?..." ที่ตำแหน่ง ${at} อยู่ก่อนด่าน link mode`).toBeGreaterThan(gate)
    }
  })
})
