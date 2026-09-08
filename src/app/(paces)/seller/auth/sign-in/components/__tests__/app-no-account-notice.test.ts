/**
 * ด่าน — คนที่ถูกด่าน 3.1.1 ตัดจบ ต้อง**เห็นเหตุผล** ไม่ใช่โดนเด้งกลับมาเงียบ ๆ
 *
 * `proxy.ts` ล้าง session แล้วส่งกลับ `/auth/sign-in?app_no_account=1` — ถ้าไม่มีใครอ่าน
 * พารามิเตอร์นั้น ผู้ใช้จะเห็นแค่ "กด Sign in with Apple แล้วเด้งกลับหน้าเดิม" ซึ่งเป็น
 * **อาการเดียวกับบั๊กที่ `OAuthErrorNotice` ถูกสร้างมาแก้** (หัวหน้าแจ้ง 2026-08-19) และเป็น
 * อาการเดียวกับที่ Apple รายงานเป็นบั๊ก 2.1(a) พอดี ⇒ เงียบตรงนี้ = แลกความผิด 3.1.1
 * ด้วยบั๊ก 2.1(a) อีกรอบ
 *
 * 🛑 ข้อความห้ามชวนไปสมัครที่เว็บ — Apple ถือว่าการบอกทางไปสมัคร/จ่ายเงินข้างนอก
 * เป็นความผิด 3.1.1 ข้อเดียวกันกับการมีปุ่มจ่ายเงิน
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { th } from '@/i18n/dictionaries/th'
import { en } from '@/i18n/dictionaries/en'

const ROOT = process.cwd()
const NOTICE = 'src/app/(paces)/seller/auth/sign-in/components/OAuthErrorNotice.tsx'
const code = (rel: string) =>
  readFileSync(join(ROOT, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')

describe('[blocker] แจ้งเหตุผลเมื่อถูกด่าน 3.1.1 ตัดจบ', () => {
  it('🛑 component อ่าน `app_no_account` จาก URL', () => {
    expect(
      code(NOTICE),
      'ไม่มีใครอ่านพารามิเตอร์ ⇒ ผู้ใช้เห็นแค่เด้งกลับหน้าเดิมโดยไม่รู้สาเหตุ',
    ).toContain('app_no_account')
  })

  it('🛑 มีข้อความทั้งไทยและอังกฤษ', () => {
    expect(th.auth.signIn.oauthError.noSellerAccountInApp).toBeTruthy()
    expect(en.auth.signIn.oauthError.noSellerAccountInApp).toBeTruthy()
  })

  it('🛑 ข้อความห้ามชี้ทางไปสมัคร/จ่ายเงินข้างนอก (3.1.1)', () => {
    for (const msg of [
      th.auth.signIn.oauthError.noSellerAccountInApp,
      en.auth.signIn.oauthError.noSellerAccountInApp,
    ]) {
      expect(msg, `ห้ามมีลิงก์/โดเมนในข้อความ: ${msg}`).not.toMatch(
        /https?:\/\/|deepthailand|www\.|\.app\b|\.com\b/i,
      )
      expect(msg, `ห้ามชวนไปสมัครที่เว็บ: ${msg}`).not.toMatch(
        /เว็บไซต์|website|sign ?up|register|สมัครที่/i,
      )
    }
  })
})
