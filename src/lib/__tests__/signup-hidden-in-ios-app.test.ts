/**
 * ด่าน — **การลงทะเบียนต้องไม่มีอยู่ในแอป iOS** (Apple Guideline 3.1.1, 2026-08-23)
 *
 * Apple เขียนมาว่า:
 *   *"The app includes an account registration feature for businesses and organizations,
 *   which is considered access to external mechanisms for purchases or subscriptions to be
 *   used in the app. Next Steps: **Remove the account registration features for business
 *   and organizations**"*
 *
 * ## ระบบเรามี 3 ทางที่พาไปกรอกฟอร์มลงทะเบียนกิจการ — ปิดครึ่งเดียวไม่นับ
 *
 * | # | เส้นทาง | ใครพามา | ปิดยังไง |
 * |---|---|---|---|
 * | 1 | `/auth/sign-up` | ลิงก์ "สมัครสมาชิก" | `redirect()` ได้ |
 * | 2 | `/register` | **`proxy.ts` บังคับ** (`needsRegistration`) | ต้องแสดงจอแทน |
 * | 3 | `/onboarding` | **`proxy.ts` บังคับ** (`needsOnboarding`) | ต้องแสดงจอแทน |
 *
 * ข้อ 2–3 เข้าถึงได้โดย **ไม่ต้องผ่านข้อ 1 เลย** — ล็อกอินด้วย Apple/Facebook/LINE สร้างบัญชี
 * ใหม่ให้ทันที แล้ว proxy พาไปกรอกฟอร์มต่อ ⇒ ปิดแค่ข้อ 1 = ฟอร์มยังอยู่ในแอปครบ
 * และคนตรวจของ Apple จะเดินเข้าเส้นทางนี้แน่นอน เพราะ 4.8 บังคับให้มีปุ่ม Sign in with Apple
 *
 * ## 🛑 ข้อ 2–3 ห้าม redirect
 *
 * `proxy.ts` เป็นคนบังคับให้มาที่หน้านั้น ⇒ redirect ออกแล้วมันเด้งกลับมาทันที = **ลูปไม่รู้จบ**
 * (คลาสเดียวกับลูปปุ่มย้อนกลับเมื่อ 2026-08-23 — ฝั่งหนึ่งดันเข้า อีกฝั่งดึงออก)
 *
 * ## ทำไมต้องมีด่าน ทั้งที่เขียนคอมเมนต์ไว้แล้ว
 *
 * `tsc`/build/eslint ผ่านหมดทุกกรณีข้างบน — โค้ดถูกทุกตัวอักษร สิ่งที่ผิดคือ **หน้านี้โผล่
 * ให้ใครเห็น** ซึ่งไม่มีเครื่องมือไหนอ่านออก · และราคาของการพลาดคือรีวิวรอบใหม่ (รอบละหลายวัน)
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { isPaymentRestricted, isSignUpRestricted, resolveAppShell } from '@/lib/app-shell'

const ROOT = process.cwd()
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const SIGN_UP = 'src/app/(paces)/seller/auth/sign-up/page.tsx'
const SIGN_IN = 'src/app/(paces)/seller/auth/sign-in/page.tsx'
const SIGN_IN_FORM = 'src/app/(paces)/seller/auth/sign-in/components/SignInForm.tsx'
const REGISTER = 'src/app/(paces)/seller/register/page.tsx'
const ONBOARDING = 'src/app/(paces)/seller/onboarding/page.tsx'

describe('เกณฑ์ "อยู่ในแอป iOS ไหม"', () => {
  it('[blocker] ต้องซ่อนเฉพาะในแอป iOS — เว็บ/Android ห้ามกระทบ', () => {
    const ios = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15'
    const android = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36'

    expect(isSignUpRestricted(resolveAppShell('app', ios)), 'ในแอป iOS = ซ่อน').toBe(true)
    expect(isSignUpRestricted(resolveAppShell(undefined, ios)), 'Safari บน iPhone = ไม่ซ่อน').toBe(
      false,
    )
    expect(isSignUpRestricted(resolveAppShell('app', android)), 'แอป Android = ยังไม่ซ่อน').toBe(
      false,
    )
    expect(isSignUpRestricted(resolveAppShell(undefined, 'Mozilla/5.0 (Macintosh)')), 'เว็บ').toBe(
      false,
    )
  })

  it('[blocker] ต้องเป็นฟังก์ชันคนละตัวกับ isPaymentRestricted', () => {
    /**
     * 🛑 วันนี้สองอันคืนค่าเท่ากันทุกกรณี แต่ตอบ **คนละคำถาม** และ Apple ยกมาคนละข้อคนละรอบ
     * ถ้ายุบเป็นตัวเดียว วันที่ข้อจ่ายเงินถูกผ่อน (เช่นเราไปทาง IAP) การสมัครจะกลับมาโผล่ในแอป
     * ด้วย **โดยไม่มีใครตั้งใจและไม่มีอะไรฟ้อง**
     */
    const src = stripComments(read('src/lib/app-shell.ts'))
    expect(src, 'ต้องมี isSignUpRestricted แยกต่างหาก').toMatch(
      /export function isSignUpRestricted/,
    )
    expect(src, 'ต้องมีรายการ shell ของตัวเอง ไม่ใช้ร่วมกับฝั่งจ่ายเงิน').toMatch(
      /SIGNUP_RESTRICTED_SHELLS/,
    )
    /* ยังต้องมีตัวเดิมอยู่ครบ — ด่านนี้ไม่ได้มาแทนที่ */
    expect(typeof isPaymentRestricted).toBe('function')
  })
})

describe('ทั้ง 3 ทางเข้าต้องถูกปิด', () => {
  it('[blocker] /auth/sign-up — redirect ออกที่ตัวหน้า ไม่ใช่แค่ซ่อนลิงก์', () => {
    /* ลิงก์ที่ซ่อนกันได้แค่คนที่เดินตามปุ่ม · คนตรวจของ Apple พิมพ์ URL ตรงเข้ามาได้
       ⇒ ด่านต้องอยู่ที่ปลายทาง ไม่ใช่ที่ทางเดิน (`rule-must-be-enforced-not-described.md`) */
    const src = stripComments(read(SIGN_UP))
    expect(src, 'ต้องเช็ค shouldHideSignUp').toMatch(/await shouldHideSignUp\(\)/)
    expect(src, 'ต้อง redirect ไปหน้าล็อกอิน').toMatch(/redirect\('\/auth\/sign-in'\)/)
  })

  it('[blocker] /register และ /onboarding — ต้องแสดงจอแทน ห้าม redirect (proxy บังคับมา)', () => {
    /**
     * 🛑 หัวใจของด่านนี้ · `proxy.ts` เด้งผู้ใช้มาที่สองหน้านี้เอง
     * redirect ออก = proxy เด้งกลับ = **ลูปไม่รู้จบ** ซึ่งแย่กว่าปล่อยฟอร์มไว้เสียอีก
     */
    for (const rel of [REGISTER, ONBOARDING]) {
      const src = stripComments(read(rel))
      expect(src, `${rel}: ต้องเช็ค shouldHideSignUp`).toMatch(/await shouldHideSignUp\(\)/)
      expect(src, `${rel}: ต้องคืนจอแจ้งแทนฟอร์ม`).toMatch(/return <AppSetupBlockedNotice \/>/)
      expect(src, `${rel}: ห้าม redirect — proxy บังคับมาที่นี่ จะวนลูป`).not.toMatch(/redirect\(/)
    }
  })

  it('[blocker] proxy ต้องยังบังคับสองหน้านั้นอยู่ — ถ้าเลิกบังคับ กฎ "ห้าม redirect" ก็เปลี่ยน', () => {
    /* ปักหมุดข้อเท็จจริงที่ทำให้กฎข้างบนจำเป็น — วันที่ proxy เลิกบังคับ ค่อยมาผ่อนกฎได้
       แต่ต้องเป็นการตัดสินใจของคน ไม่ใช่หลุดไปเอง */
    const proxy = stripComments(read('src/proxy.ts'))
    expect(proxy, 'proxy ต้องยังเด้งไป /register').toMatch(/redirect\(new URL\('\/register'/)
    expect(proxy, 'proxy ต้องยังเด้งไป /onboarding').toMatch(/redirect\(new URL\('\/onboarding'/)
  })
})

describe('ลิงก์ที่พาไปสมัคร ต้องหายไปด้วย', () => {
  it('[blocker] หน้าล็อกอิน — ลิงก์ "สมัครสมาชิก" ต้องอยู่ใต้เงื่อนไข', () => {
    /* ปลายทาง redirect อยู่แล้ว แต่ปล่อยลิงก์ไว้ = ปุ่มที่กดแล้วเด้งกลับที่เดิม
       ซึ่งผู้ใช้อ่านเป็น "แอปพัง" มากกว่า "ทางนี้ปิด" */
    const src = stripComments(read(SIGN_IN))
    expect(src, 'ต้องอ่านค่าจาก server').toMatch(/const hideSignUp = await shouldHideSignUp\(\)/)
    expect(src, 'ลิงก์ต้องอยู่ใต้ !hideSignUp').toMatch(/\{!hideSignUp && \(/)
    expect(src, 'ต้องส่งค่าต่อให้ฟอร์ม').toMatch(/<SignInForm hideSignUp=\{hideSignUp\} \/>/)
  })

  it('[blocker] ผล OTP "ยังไม่มีบัญชี" — ลิงก์ต้องหายไปด้วย', () => {
    /* จุดนี้ลืมง่ายที่สุดเพราะโผล่เฉพาะตอนกรอกเบอร์ที่ไม่มีในระบบ — เห็นได้ยากตอนกดทดสอบเอง
       แต่คนตรวจของ Apple กรอกเบอร์มั่ว ๆ แล้วเจอได้ทันที */
    const src = stripComments(read(SIGN_IN_FORM))
    expect(src, "ลิงก์ต้องผูกกับ !hideSignUp").toMatch(
      /otpError === 'NO_ACCOUNT' && !hideSignUp/,
    )
  })

  it('[blocker] จอแจ้งต้องไม่มีลิงก์/ปุ่มไปเว็บ และต้องออกจากระบบได้', () => {
    /**
     * 🛑 Apple เขียนเองว่าการลงทะเบียนคือ *"access to external mechanisms"* ⇒ ปุ่มที่พาไป
     * ลงทะเบียนบนเว็บก็คือทางเข้าไปกลไกภายนอกอีกแบบ · กติกาเดียวกับฝั่งจ่ายเงินที่เรายึดอยู่แล้ว
     *
     * และต้องมีทางออก — ไม่งั้นผู้ใช้ติดจอนี้ถาวร (proxy บังคับกลับมาทุกเส้นทาง)
     * = แลกความผิดข้อ 3.1.1 ด้วยบั๊กข้อ 2.1 ซึ่งไม่ได้กำไรอะไรเลย
     */
    const src = stripComments(read('src/components/paces/AppSetupBlockedNotice.tsx'))
    expect(src, 'ห้ามมี <a>/Link ไปที่ไหน').not.toMatch(/<Link|<a\s|href=/)
    expect(src, 'ห้ามฝัง URL ของเว็บเรา').not.toMatch(/https?:\/\//)
    expect(src, 'ต้องมีปุ่มออกจากระบบ').toMatch(/signOut\(/)
    /* ข้อความต้องมาจาก dictionary — จอนี้คนตรวจของ Apple เห็นแน่ ถ้าฝังไทยเขาอ่านไม่ออก */
    expect(src, 'ต้องใช้ useT() ไม่ฝังข้อความตายตัว').toMatch(/t\.appSetupBlocked\./)
    for (const rel of ['src/i18n/dictionaries/th.ts', 'src/i18n/dictionaries/en.ts']) {
      expect(read(rel), `${rel} ต้องมีคำแปล`).toMatch(/appSetupBlocked:/)
    }
  })
})
