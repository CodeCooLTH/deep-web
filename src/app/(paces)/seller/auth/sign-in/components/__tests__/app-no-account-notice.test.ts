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
const PROXY = 'src/proxy.ts'
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

/**
 * [blocker] สองเคสที่ถูกด่าน 3.1.1 ตัดจบ **พูดแทนกันไม่ได้**
 *
 * เดิมส่ง `app_no_account=1` ให้ทั้งคู่ แล้วขึ้น "ไม่พบบัญชีผู้ขายสำหรับข้อมูลที่ใช้เข้าสู่ระบบนี้"
 * ซึ่ง **โกหกครึ่งหนึ่งของคนที่เห็น**:
 *
 * · `needsRegistration` = ยังไม่มีเบอร์ ⇒ ยังไม่มีบัญชีผู้ขายที่ใช้ได้ · ข้อความเดิมถูก
 * · `needsOnboarding` = **มีบัญชีแล้ว ยืนยันเบอร์แล้ว** แค่ยังตั้งค่าร้านไม่เสร็จ
 *
 * เคสจริง 2026-09-10: แอดมินร้านธุรกิจถูกวางไว้ในร้านส่วนตัวที่ยังไม่ตั้งค่า แล้วเห็นข้อความ
 * ว่าไม่พบบัญชี ⇒ ไปไล่หาว่าตัวเองสมัครผิดช่องทางไหน ทั้งที่ปัญหาคนละเรื่องกันเลย
 *
 * 🛑 ที่แก้คือ **คำ** ไม่ใช่ *สิทธิ์* — ทั้งสองเคสยังถูกบล็อกเหมือนเดิม
 */
describe('[blocker] แยกคำตามเหตุผลจริง ไม่ใช่ใช้คำเดียวกับทุกคน', () => {
  it('🛑 proxy ต้องเลือกพารามิเตอร์ตามธงที่ทำให้ถูกบล็อก', () => {
    const proxy = code(PROXY)
    expect(proxy, 'ไม่มีการแยกเคส = กลับไปพูดคำเดียวกับทุกคน').toContain('app_setup_required')
    expect(
      /needsRegistration\s*\?\s*'app_no_account'\s*:\s*'app_setup_required'/.test(proxy),
      'ต้องตัดสินจาก needsRegistration — ไม่ใช่เดาจากอย่างอื่น',
    ).toBe(true)
  })

  it('🛑 component ต้องอ่านพารามิเตอร์ใหม่ด้วย ไม่งั้นเงียบสนิท', () => {
    expect(code(NOTICE)).toContain('app_setup_required')
    expect(code(NOTICE)).toContain('sellerSetupIncompleteInApp')
  })

  it('🛑 ข้อความเคสนี้ต้อง **ไม่** บอกว่าไม่พบบัญชี — เขามีบัญชีอยู่จริง', () => {
    for (const msg of [
      th.auth.signIn.oauthError.sellerSetupIncompleteInApp,
      en.auth.signIn.oauthError.sellerSetupIncompleteInApp,
    ]) {
      expect(msg, `ยังบอกว่าไม่พบบัญชี: ${msg}`).not.toMatch(/ไม่พบบัญชี|no .*account was found/i)
      expect(msg.trim().length).toBeGreaterThan(0)
    }
  })

  it('🛑 ต้องเป็นคนละข้อความกับเคส "ไม่มีบัญชี" จริง ๆ', () => {
    expect(th.auth.signIn.oauthError.sellerSetupIncompleteInApp).not.toBe(
      th.auth.signIn.oauthError.noSellerAccountInApp,
    )
    expect(en.auth.signIn.oauthError.sellerSetupIncompleteInApp).not.toBe(
      en.auth.signIn.oauthError.noSellerAccountInApp,
    )
  })

  it('🛑 ข้อความใหม่ก็ห้ามชี้ทางไปสมัคร/จ่ายเงินข้างนอกเหมือนกัน (3.1.1)', () => {
    for (const msg of [
      th.auth.signIn.oauthError.sellerSetupIncompleteInApp,
      en.auth.signIn.oauthError.sellerSetupIncompleteInApp,
    ]) {
      expect(msg).not.toMatch(/https?:\/\/|deepthailand|www\.|\.app\b|\.com\b/i)
      expect(msg).not.toMatch(/เว็บไซต์|website|sign ?up|register|สมัครที่/i)
    }
  })
})
