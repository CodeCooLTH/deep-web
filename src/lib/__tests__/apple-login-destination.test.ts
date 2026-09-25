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

/**
 * อ่านซอร์สโดย **ตัดคอมเมนต์ทิ้งก่อน** — ใช้กับด่านที่ค้นหาข้อความในโค้ด
 *
 * 🛑 เพิ่ม 2026-09-25 เพราะด่านนี้แดงผิดตัว: ไฟล์ที่ทำถูกตามกฎ คือไฟล์ที่เขียนคำอธิบาย
 * ของกฎนั้นไว้ด้วย ⇒ `indexOf("signIn('apple'")` ไปเจอ **คอมเมนต์** ที่อธิบายว่าทำไมต้อง
 * เลิกใช้ทางนั้นในแอป แล้วตรวจผิดที่ทั้งเคส (คลาสเดียวกับ grep gate ของ HR9 เมื่อ
 * 2026-08-02→03 และของ `component-declared-in-render.md` ซึ่งเขียนกติกานี้ไว้แล้ว)
 *
 * ไม่ได้ทำให้ด่านอ่อนลง: คอมเมนต์ไม่ทำงาน การตัดออกคือการเลิกตรวจของที่ไม่เคยมีผล
 */
function readCode(rel: string): string {
  return read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
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

  /**
   * 🛑 ด่านนี้เคยปักหมุด **รูปแบบการเขียน** ไว้ (`signIn('apple', { callbackUrl }`) ซึ่งแดง
   * ทันทีที่ปลายทางเปลี่ยนเป็นหน้ารอ ทั้งที่ **เจตนายังถูกครบทุกข้อ** — ปรับเป็นตรวจเจตนาแทน
   *
   * ทำไมปลายทางเปลี่ยน (2026-09-17): ชี้ตรง `/dashboard` ทำให้คำขอถัดไปอาจยังไม่เห็นคุกกี้
   * session ที่ callback เพิ่งตั้ง (ชนกับการลบคุกกี้ชื่อเดียวกันตอน `signOut`)
   * ⇒ ผู้ใช้ล็อกอินสำเร็จแต่ถูกเตะกลับหน้าล็อกอิน ต้องกดใหม่ · ดู `sign-out-seller.ts`
   *
   * เจตนาเดิมที่ยังต้องบังคับเหมือนเดิมทุกข้อ:
   *   1. ต้องส่ง callbackUrl (ไม่ส่ง = NextAuth ถอยไป root ของ subdomain ที่ไม่มีหน้า)
   *   2. ค่าต้องมาจากตัว sanitize ไม่ใช่อ่านดิบจาก query (open-redirect)
   */
  it('[blocker] ปุ่ม Apple ในหน้าล็อกอินต้องส่ง callbackUrl ที่ผ่าน safeCallbackUrl', () => {
    const form = readCode('src/app/(paces)/seller/auth/sign-in/components/SignInForm.tsx')

    const at = form.indexOf("signIn('apple'")
    expect(at, 'ไม่พบการเรียก signIn ของ Apple').toBeGreaterThan(-1)
    const call = form.slice(at, at + 300)

    // ไม่ส่ง callbackUrl เลย = NextAuth ถอยไป baseUrl ซึ่งเป็น root ที่ไม่มีหน้า
    expect(call, 'ปุ่ม Apple ต้องส่ง callbackUrl').toContain('callbackUrl')

    // 🛑 ห้ามอ่านดิบจาก query ตรงจุดเรียก — ต้องใช้ตัวแปรที่ผ่าน sanitize มาแล้ว
    expect(call, 'อ่านดิบจาก query = open-redirect').not.toContain('searchParams.get')

    // callbackUrl ต้องมาจากตัว sanitize ไม่ใช่อ่านดิบจาก query (open-redirect + ปลายทางมั่ว)
    expect(form).toContain("safeCallbackUrl(searchParams.get('callbackUrl'))")

    // ต้องเดินผ่านหน้ารอ — เหตุผลอยู่หัว it() นี้
    expect(call, 'ชี้ตรงปลายทาง = คุกกี้ session อาจยังไม่ทันลงตัว').toContain(
      '/auth/callback/apple',
    )
  })

  it('[blocker] ปลายทาง /account สงวนให้ link mode เท่านั้น ห้ามหลุดมาเส้นล็อกอิน', () => {
    const auth = read('src/lib/auth.ts')

    /**
     * ทุกจุดที่พา `/account` ต้องอยู่ **หลัง** ด่านที่ตัดสินว่าเป็น link mode
     * (`if (!intent || intent.provider !== account.provider) return true;`)
     * ถ้ามีตัวไหนอยู่ก่อนหน้านั้น = การล็อกอินธรรมดาจะถูกลากไป /account ด้วย
     *
     * 🛑 ปรับ 2026-09-25: ตรรกะ link mode ถูกสกัดไป `services/oauth-link.service.ts`
     * เพราะมีผู้เรียกรายที่สอง (`/api/account/link/apple-native` — Apple สั่งให้แอป iOS
     * ใช้แผ่นของระบบ) ⇒ `auth.ts` เหลือ **จุดเดียว** คือ `linkOutcomeRedirect(...)`
     *
     * ด่านไม่ได้อ่อนลง — มันยังตอบคำถามเดิมเป๊ะว่า "ของที่พาไป /account อยู่หลังด่านไหม"
     * แค่ตอนนี้มีของให้ตรวจชิ้นเดียวแทนที่จะเป็นสี่ชิ้น และ **สตริงปลายทางถูกปักหมุด
     * ที่ไฟล์ปลายทางแทน** (เคสถัดไป) ซึ่งกันได้กว้างกว่าเดิมเพราะครอบผู้เรียกทั้งสองราย
     */
    const gate = auth.indexOf('intent.provider !== account.provider')
    expect(gate, 'หาด่านแยก link mode ใน auth.ts ไม่เจอ').toBeGreaterThan(-1)

    const at = auth.indexOf('linkOutcomeRedirect(')
    expect(at, 'auth.ts ต้องยังพา /account ผ่าน linkOutcomeRedirect อยู่').toBeGreaterThan(-1)
    expect(at, 'ตัวพาไป /account อยู่ก่อนด่าน link mode').toBeGreaterThan(gate)

    /* ห้ามมีใครแอบเขียนสตริงปลายทางสดใน auth.ts อีก — ของแบบนั้นจะหลุดด่านข้างบนได้ */
    expect(auth, 'auth.ts ห้ามเขียน "/account?..." สดอีกแล้ว').not.toMatch(/"\/account\?/)
  })

  it('[blocker] ปลายทางของ link mode ต้องเป็น /account ที่เดียว ไม่ใช่ /settings', () => {
    /**
     * เคสนี้ย้ายตามตรรกะมาจาก `auth.ts` — `/settings` กลายเป็นหน้า "การจัดส่ง" ตั้งแต่
     * feature 00026 และ **ไม่มีใครอ่าน `?linked=` / `?link_error=` ที่นั่น**
     * ⇒ เชื่อมสำเร็จก็เงียบ ล้มเหลวก็เงียบ (เจอจริง 2026-08-12)
     */
    /* ส่วนบริสุทธิ์ (ชนิดผลลัพธ์ + ปลายทาง) แยกออกมาเพื่อให้ import เข้าเทสได้โดยไม่ต้องมี
       NEXTAUTH_SECRET — ตัวที่แตะฐานข้อมูลยังอยู่ที่ `services/oauth-link.service.ts` */
    const svc = read('src/lib/oauth-link-outcome.ts')
    for (const s of ['/account?linked=', '/account?link_error=taken', '/account?link_error=reclaimable']) {
      expect(svc, `หายไป: ${s}`).toContain(s)
    }
    expect(svc, 'ปลายทาง /settings คือหน้าที่ไม่มีใครอ่านผลลัพธ์').not.toContain('/settings?')
  })
})
