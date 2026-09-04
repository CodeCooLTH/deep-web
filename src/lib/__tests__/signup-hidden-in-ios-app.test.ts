/**
 * ด่าน — **การสมัครเป็นผู้ขายต้องไม่มีอยู่ในแอป iOS** (Apple Guideline 3.1.1, 2026-08-23)
 *
 * Apple เขียนมาว่า:
 *   *"The app includes an account registration feature for businesses and organizations,
 *   which is considered access to external mechanisms for purchases or subscriptions to be
 *   used in the app. Next Steps: **Remove the account registration features for business
 *   and organizations**"*
 *
 * ## 🛑 บทเรียน 2026-08-25 → 09-04: ปิด "ปลายทาง" แล้วผู้ขายติดตายเข้าแอปไม่ได้
 *
 * รอบแรกปิดที่ปลายทาง — `/register` กับ `/onboarding` แสดงจอแจ้งแทนฟอร์ม
 * แต่ **`proxy.ts` เป็นคนบังคับให้ผู้ใช้มาสองหน้านั้น** และคอมเมนต์ตรงนั้นเขียนไว้เองว่า
 * *"ปิด/หนีไม่ได้จนเสร็จ"* ⇒ กลายเป็นวงปิด:
 *
 *     proxy บังคับมา /register → ในแอปไม่มีฟอร์ม → ล็อกอินใหม่ → proxy บังคับมาอีก → …
 *
 * วัดจาก prod 2026-09-04: **ติดอยู่จริง 4 บัญชี** (2 ในนั้นล็อกอินด้วย Apple ในแอป)
 * และเกิดซ้ำ 100% กับผู้ขายใหม่ทุกคนที่กด "เปิดร้านของฉัน" ในแอป
 *
 * 🛑 **ด่านรุ่นก่อนทำนายบั๊กนี้ไว้แล้วแต่ตรวจผิดตัว** — มันเขียนว่า *"ต้องมีทางออก ไม่งั้น
 * ผู้ใช้ติดจอนี้ถาวร = แลกความผิดข้อ 3.1.1 ด้วยบั๊กข้อ 2.1"* แล้วไปตรวจว่า **มีปุ่มออกจากระบบไหม**
 * ซึ่งไม่ใช่ทางออก — กดแล้วล็อกอินกลับมาก็เจอจอเดิม
 * ⇒ *"มีปุ่มให้กด" ไม่เท่ากับ "ไปไหนได้"* · ด่านต้องตรวจ **ผลลัพธ์** ไม่ใช่การมีอยู่ของปุ่ม
 *
 * ## กฎที่ถูกต้อง: ปิดที่ **ต้นทาง** ไม่ใช่ปลายทาง
 *
 * | จุด | ใครไปถึง | ทำยังไง |
 * |---|---|---|
 * | `/auth/sign-up` + ลิงก์ "สมัครสมาชิก" | คนที่ **ยังไม่ล็อกอิน** เลือกเอง | ปิด — redirect ออก |
 * | ปุ่ม "เปิดร้านของฉัน" (`/choose-shop`) | คนล็อกอินแล้วที่ **เลือกเอง** ว่าจะเป็นผู้ขาย | ปิด — ซ่อนปุ่ม |
 * | `/register` · `/onboarding` | **`proxy.ts` บังคับมา** หนีไม่ได้ | **ต้องเปิด** — ไม่งั้นติดตาย |
 *
 * เมื่อไม่มีทางเข้าไหนพาคนใหม่มาถึง 2 หน้าสุดท้ายได้ในแอป หน้าเหล่านั้นจะเหลือผู้ใช้กลุ่มเดียว
 * คือ **คนที่มีร้านค้างอยู่แล้วและต้องกรอกให้จบ** ซึ่งไม่ใช่ "การสมัครธุรกิจ" ที่ Apple ห้าม
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
const CHOOSE_SHOP_PAGE = 'src/app/(paces)/seller/choose-shop/page.tsx'
const CHOOSE_SHOP_CLIENT = 'src/app/(paces)/seller/choose-shop/components/ChooseShopClient.tsx'
const PROXY = 'src/proxy.ts'

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
    /* วันนี้คืนค่าเท่ากันทุกกรณี แต่ตอบคนละคำถามและ Apple ยกมาคนละข้อคนละรอบ
       ยุบเป็นตัวเดียว = วันที่ผ่อนข้อจ่ายเงิน การสมัครจะกลับมาโผล่ด้วยโดยไม่มีใครตั้งใจ */
    const src = stripComments(read('src/lib/app-shell.ts'))
    expect(src).toMatch(/export function isSignUpRestricted/)
    expect(src).toMatch(/SIGNUP_RESTRICTED_SHELLS/)
    expect(typeof isPaymentRestricted).toBe('function')
  })
})

describe('ปิดที่ต้นทาง — จุดที่ผู้ใช้ "เลือกเอง" ว่าจะเป็นผู้ขาย', () => {
  it('[blocker] /auth/sign-up — redirect ออกที่ตัวหน้า ไม่ใช่แค่ซ่อนลิงก์', () => {
    /* ลิงก์ที่ซ่อนกันได้แค่คนที่เดินตามปุ่ม · คนตรวจของ Apple พิมพ์ URL ตรงเข้ามาได้ */
    const src = stripComments(read(SIGN_UP))
    expect(src).toMatch(/await shouldHideSignUp\(\)/)
    expect(src).toMatch(/redirect\('\/auth\/sign-in'\)/)
  })

  it('[blocker] ปุ่ม "เปิดร้านของฉัน" ต้องหายในแอป — นี่คือประตูบานจริง', () => {
    /**
     * 🛑 กดปุ่มนี้ = สร้างร้านส่วนตัว → proxy บังคับไป `/register` → `/onboarding`
     * นั่นคือ "ฟอร์มลงทะเบียนกิจการ" ที่ Apple สั่งให้เอาออก และเป็นทางที่ **คนตรวจของ Apple
     * เดินได้จริง** เพราะข้อ 4.8 บังคับให้มีปุ่ม Sign in with Apple ⇒ เขาล็อกอินแล้วมาถึงที่นี่ได้
     *
     * ปิดที่นี่แทนการปิดปลายทาง เพราะปิดปลายทางทำให้คนที่ค้างกลางทางติดตาย (ดูหัวไฟล์)
     */
    const page = stripComments(read(CHOOSE_SHOP_PAGE))
    expect(page, 'หน้า choose-shop ต้องอ่านค่าจาก server').toMatch(/shouldHideSignUp\(\)/)
    expect(page, 'ต้องส่งค่าลงไปให้ client').toMatch(/hideOpenShop=\{await shouldHideSignUp\(\)\}/)

    const client = stripComments(read(CHOOSE_SHOP_CLIENT))
    expect(client, 'client ต้องรับ prop').toMatch(/hideOpenShop/)
    /* ต้องไม่มีปุ่มไหนที่เรียก handleOpenPersonal โดยอยู่นอกเงื่อนไข !hideOpenShop
       — นับจำนวนการเรียกเทียบกับจำนวนบล็อกที่กั้นไว้ */
    const calls = client.split('onClick={handleOpenPersonal}').length - 1
    const guards = client.split('!hideOpenShop &&').length - 1
    expect(calls, 'ไม่เจอปุ่มเปิดร้านเลย — ไฟล์เปลี่ยนโครง ด่านนี้ต้องเขียนใหม่').toBeGreaterThan(0)
    expect(guards, `มีปุ่มเปิดร้าน ${calls} จุด แต่กั้นไว้ ${guards} บล็อก`).toBe(calls)
  })

  it('[blocker] หน้าล็อกอิน — ลิงก์ "สมัครสมาชิก" ต้องอยู่ใต้เงื่อนไข', () => {
    const src = stripComments(read(SIGN_IN))
    expect(src).toMatch(/const hideSignUp = await shouldHideSignUp\(\)/)
    expect(src).toMatch(/\{!hideSignUp && \(/)
    expect(src).toMatch(/<SignInForm hideSignUp=\{hideSignUp\} \/>/)
  })

  it('[blocker] ผล OTP "ยังไม่มีบัญชี" — ลิงก์ต้องหายไปด้วย', () => {
    /* จุดนี้ลืมง่ายที่สุดเพราะโผล่เฉพาะตอนกรอกเบอร์ที่ไม่มีในระบบ */
    const src = stripComments(read(SIGN_IN_FORM))
    expect(src).toMatch(/otpError === 'NO_ACCOUNT' && !hideSignUp/)
  })
})

describe('🛑 หน้าที่ proxy บังคับให้มา ต้องทำให้เสร็จได้ในทุกเปลือก', () => {
  it('[blocker] /register และ /onboarding ห้ามมีด่านของเปลือกแอป', () => {
    /**
     * 🛑 นี่คือด่านที่ป้องกันบั๊ก "ผู้ขายเข้าแอปไม่ได้" ไม่ให้กลับมาอีก
     *
     * `proxy.ts` บังคับให้ผู้ใช้มาสองหน้านี้และหนีไม่ได้จนกว่าจะกรอกเสร็จ ⇒ ถ้าหน้าเหล่านี้
     * ตัดสินใจอะไรตาม "เปิดจากที่ไหน" แล้วไม่แสดงฟอร์ม ผู้ใช้จะติดตายทันที
     *
     * ห้ามทั้ง `shouldHideSignUp` · `shouldHidePayments` · `shouldHidePaidFeatures`
     * — ไม่ใช่แค่ตัวใดตัวหนึ่ง เพราะทั้งสามตัวให้ผลเดียวกันคือ "หน้านี้ไม่แสดงของจริงในแอป"
     */
    for (const rel of [REGISTER, ONBOARDING]) {
      const src = stripComments(read(rel))
      expect(src, `${rel}: ห้ามกั้นตามเปลือกแอป — proxy บังคับมาที่นี่ จะติดตาย`).not.toMatch(
        /shouldHide(SignUp|Payments|PaidFeatures)\s*\(/,
      )
      expect(src, `${rel}: ห้าม redirect — proxy จะเด้งกลับมา = ลูปไม่รู้จบ`).not.toMatch(
        /redirect\(/,
      )
    }
  })

  it('[blocker] ปักหมุดว่า proxy ยังบังคับสองหน้านั้นอยู่จริง', () => {
    /* ข้อเท็จจริงที่ทำให้กฎข้างบนจำเป็น — วันที่ proxy เลิกบังคับ ค่อยมาทบทวนกฎได้
       แต่ต้องเป็นการตัดสินใจของคน ไม่ใช่หลุดไปเอง */
    const proxy = stripComments(read(PROXY))
    expect(proxy, 'proxy ต้องยังเด้งไป /register').toMatch(/redirect\(new URL\('\/register'/)
    expect(proxy, 'proxy ต้องยังเด้งไป /onboarding').toMatch(/redirect\(new URL\('\/onboarding'/)
  })

  it('[blocker] จอทางตันต้องไม่กลับมา', () => {
    /* `AppSetupBlockedNotice` ถูกลบทิ้ง 2026-09-04 พร้อมคำแปลทั้ง 2 ภาษา
       ถ้ามีใครสร้างกลับมาแล้วเอาไปแปะที่หน้าที่ proxy บังคับ บั๊กเดิมจะกลับมาทันที */
    for (const rel of [REGISTER, ONBOARDING]) {
      expect(stripComments(read(rel)), `${rel}: ห้ามแสดงจอทางตัน`).not.toMatch(
        /AppSetupBlockedNotice/,
      )
    }
  })
})
