import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * [blocker] ล็อกอินด้วยผู้ให้บริการภายนอกที่ล้มเหลว **ต้องบอกเหตุผล** ห้ามเงียบ
 *
 * ## บั๊กที่ด่านนี้กัน (หัวหน้าแจ้ง 2026-08-19)
 *
 * *"login ด้วย apple แล้วไม่พาไปไหน อยู่ที่หน้า login เหมือนเดิม"*
 *
 * NextAuth เด้งกลับหน้า login **พร้อมเหตุผลใน `?error=`** อยู่แล้ว
 * (`next-auth/core/index.js:209-211` → `167-169`) แต่ `SignInForm` อ่าน `searchParams`
 * แค่ `callbackUrl` ⇒ เหตุผลถูกทิ้งทุกครั้ง
 *
 * 🛑 ความล้มเหลวที่เงียบสนิท **แยกไม่ออกจาก "ปุ่มเสีย"** — ไม่มีใครรู้ว่าต้องทำอะไรต่อ
 * รวมทีมรีวิวของ Apple ที่กำลังจะกดปุ่มนี้ และ log ของ Vercel แพลนนี้ query ย้อนหลังไม่ได้
 * ⇒ ถ้าหน้าจอไม่พูด ก็ไม่มีที่ไหนพูดเลย
 *
 * ## ทำไมสแกนซอร์ส
 *
 * `vitest.config` ตั้ง `environment: "node"` และรีโปไม่มี jsdom — วิธีเดียวกับด่านอื่นที่
 * ผูกกับ `src/lib/auth.ts` อยู่แล้ว (`apple-login-destination` · `oauth-provider-parity`)
 *
 * 🛑 แดง = ห้าม merge
 */

const ROOT = process.cwd()
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

/** ลบเนื้อคอมเมนต์แต่คงจำนวนบรรทัด — ไฟล์ที่ทำถูกคือไฟล์ที่เขียนคำเตือนของกฎนั้นไว้ด้วย */
const blankComments = (src: string) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/^([ \t]*)\/\/.*$/gm, (m, indent: string) => indent)

const SIGN_IN_DIR = 'src/app/(paces)/seller/auth/sign-in'
const NOTICE = `${SIGN_IN_DIR}/components/OAuthErrorNotice.tsx`

describe('[blocker] หน้า login ฝั่ง seller ต้องพูดเมื่อ OAuth ล้ม', () => {
  it('หน้า sign-in ต้อง render ตัวแสดง error ไม่ใช่มีแต่ฟอร์ม', () => {
    const page = blankComments(read(`${SIGN_IN_DIR}/page.tsx`))
    expect(page, 'ต้อง import ตัวแสดง error').toMatch(
      /import OAuthErrorNotice from ['"]\.\/components\/OAuthErrorNotice['"]/,
    )
    expect(page, 'ต้อง render ด้วย ไม่ใช่ import ทิ้งไว้เฉย ๆ').toMatch(/<OAuthErrorNotice\s*\/>/)
  })

  it('ตัวแสดง error ต้องอ่าน ?error= จาก URL', () => {
    const code = blankComments(read(NOTICE))
    expect(code, "ต้องอ่านคีย์ 'error' ตรง ๆ").toMatch(/useSearchParams\(\)\.get\(['"]error['"]\)/)
  })

  it('ต้องแจ้งผ่าน pacesToast — ห้าม react-toastify ใน (paces) (Hard Rule 9)', () => {
    /**
     * ยกมาจากฝั่ง buyer ตรง ๆ ไม่ได้ (`OAuthErrorToast.tsx` ใช้ `react-toastify`)
     * — เป็นเหตุผลเดียวที่ไฟล์นี้มีอยู่แยกจากของ buyer แทนที่จะใช้ร่วมกัน
     */
    const code = blankComments(read(NOTICE))
    expect(code, 'ต้องเรียก pacesToast.error').toMatch(/pacesToast\.error\(/)
    expect(code, 'ห้าม import react-toastify').not.toMatch(/from ['"]react-toastify['"]/)
  })

  it('รหัสที่ไม่รู้จักต้องยังบอกรหัสออกมา ห้ามตกไปเงียบ', () => {
    /**
     * 🛑 นี่คือหัวใจของด่านนี้ — ตัวแสดง error ที่ครอบเฉพาะรหัสที่คิดออกวันนี้ จะกลับไปเงียบ
     * ทันทีที่เจอรหัสที่ไม่เคยเห็น ซึ่งคือ **เคสที่เราต้องการมันที่สุด** (ของที่รู้จักแล้ว
     * เรารู้วิธีแก้อยู่แล้ว)
     *
     * `OAuthCallback` กับ `OAuthAccountNotLinked` แก้คนละที่กันคนละเรื่อง แต่ผู้ใช้เล่าอาการ
     * มาได้เหมือนกันทุกประการ — รหัสคือสิ่งเดียวที่แยกออก
     */
    const code = blankComments(read(NOTICE))
    expect(code, 'ต้องมีข้อความ fallback เมื่อไม่รู้จักรหัส').toMatch(/\?\?\s*m\.unknown/)
    expect(code, 'ต้องต่อรหัสจริงท้ายข้อความเสมอ').toMatch(/\$\{code\}/)
  })
})

describe('[blocker] คุกกี้ระหว่างทางของ OAuth ต้องข้ามเว็บได้ครบทุกใบ', () => {
  /**
   * Apple ใช้ `response_mode=form_post` = ยิง **POST ข้ามเว็บ** กลับมาที่ callback ของเรา
   * ⇒ คุกกี้ `SameSite=Lax` **ไม่ถูกส่ง** (Lax ผ่านเฉพาะ GET ระดับบนสุด)
   *
   * 🛑 รอบแรก (2026-08-12) ทับไว้แค่ 3 ใบ (pkce/state/nonce) แล้วเขียนคอมเมนต์ว่า
   * "ทับเฉพาะตัวที่ใช้ระหว่างเดินทาง" — แต่ `callback-url` **ก็เป็นตัวระหว่างเดินทาง**
   * (ตั้งตอนเริ่ม อ่านตอน callback อายุสั้น ใช้ครั้งเดียว) มันแค่ไม่ได้ชื่อขึ้นต้นเหมือนพวกนั้น
   * ผลคือ next-auth ถอยไปใช้ origin ของเว็บ (`core/lib/callback-url.js`) ผู้ใช้ไปโผล่หน้าแรก
   * แทนปลายทางที่ตั้งไว้ — ล้มเงียบอีกแบบหนึ่งที่ไม่มี error ให้ใครเห็น
   */
  const REQUIRED = ['pkceCodeVerifier', 'state', 'nonce', 'callbackUrl'] as const

  for (const key of REQUIRED) {
    it(`crossSiteOAuthCookies ต้องทับ ${key}`, () => {
      const src = read('src/lib/auth.ts')
      const from = src.indexOf('function crossSiteOAuthCookies')
      expect(from, 'หาฟังก์ชันไม่เจอ — ด่านนี้ผูกกับมันอยู่').toBeGreaterThan(-1)
      const body = blankComments(src.slice(from, src.indexOf('\n}', from)))
      expect(body, `${key} ต้องอยู่ในชุดที่ถูกทับ`).toMatch(new RegExp(`\\b${key}\\s*:`))
    })
  }

  it('ทุกใบต้องเป็น SameSite=None + Secure', () => {
    const src = read('src/lib/auth.ts')
    const from = src.indexOf('function crossSiteOAuthCookies')
    const body = blankComments(src.slice(from, src.indexOf('\n}', from)))
    expect(body, 'ต้องประกาศ sameSite none ที่ options ร่วม').toMatch(/sameSite:\s*["']none["']/)
    expect(body, 'SameSite=None บังคับต้องมี Secure').toMatch(/secure:\s*true/)
    /** ทุกใบต้องหยิบ `options` ร่วมไปใช้ — ใบที่ประกาศ options เองคือใบที่หลุดกฎได้เงียบ ๆ */
    const spreads = body.match(/\.\.\.options/g) ?? []
    expect(spreads.length, 'ทุกใบต้อง spread options ร่วม').toBeGreaterThanOrEqual(REQUIRED.length - 1)
  })
})
