/**
 * ด่าน — **ล็อกอินด้วย Apple/Facebook/LINE ในแอป iOS ต้องไม่กลายเป็นการสมัครบัญชี**
 *
 * ## รูที่ด่านนี้ปิด (เจอ 2026-09-08 ตอนอ่านจดหมาย Apple ย้อนหลัง)
 *
 * `signup-hidden-in-ios-app.test.ts` ปิดทางสมัคร 3 ทาง (`/auth/sign-up` · ลิงก์ "สมัครสมาชิก" ·
 * ปุ่ม "เปิดร้านของฉัน") แล้ว **จงใจเปิด** `/register` กับ `/onboarding` ไว้ เพราะ `proxy.ts`
 * บังคับคนมาสองหน้านั้นและหนีไม่ได้ — เหตุผลถูก แต่สมมติฐานผิด:
 *
 *   *"เมื่อไม่มีทางเข้าไหนพาคนใหม่มาถึง 2 หน้าสุดท้ายได้ในแอป"*
 *
 * **ยังมีอีกทางหนึ่ง** — ปุ่ม OAuth บนหน้าล็อกอินโชว์ทุกเปลือก (`SignInForm.tsx`) และ
 * `signIn` callback ใน `auth.ts` บล็อกเฉพาะบัญชีที่ถูกลบ ⇒ Apple ID ที่ไม่เคยผูก = สร้าง
 * user ใหม่ตามปกติ → `needsRegistration` → proxy บังคับไป `/register` = **หน้าสมัคร ในแอป**
 *
 * นี่คือเส้นทางที่ทีมรีวิวของ Apple เดินจริง (เขาไม่มีบัญชี Deep) และทำให้ผิดพร้อมกัน 2 ข้อ:
 *   · 3.1.1 — "Remove the account registration features for business and organizations"
 *   · 2.1(a) — ค้าง เพราะยืนยันเบอร์ไทยด้วย SMS ไม่ได้ (บั๊กที่ Apple รายงานบน iPad)
 *
 * 🛑 การแก้ `idmsa.apple.com` ใน deep-seller-app (25 ส.ค.) แก้แค่ "ค้างที่หน้าของ Apple"
 * พอ SIWA ผ่านได้ จะไปค้างที่หน้าสมัครแทน = เปลี่ยนบั๊กหนึ่งเป็นอีกบั๊กหนึ่ง
 *
 * ## ทางออกที่เลือก: ตัดจบที่ proxy แล้ว **ออกจากระบบ** ไม่ใช่โชว์จอแจ้ง
 *
 * โชว์จอแจ้งค้างไว้ทั้งที่ session ยังอยู่ = ผู้ใช้ติดตาย (บทเรียน 4 บัญชีบน prod 2026-09-04)
 * ⇒ ต้องล้าง session ด้วย ผู้ใช้จึงกลับไปยืนที่หน้าล็อกอินได้จริง ไม่ใช่แค่เห็นข้อความ
 *
 * 🛑 ข้อความที่แสดงต้อง **ไม่มีลิงก์/คำชวนไปสมัครที่เว็บ** — Apple ถือว่าการบอกทางไปสมัคร
 * ข้างนอกเป็นความผิด 3.1.1 ข้อเดียวกัน (ดู `isPaymentRestricted`)
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { shouldBlockAppRegistration, resolveAppShell } from '@/lib/app-shell'

const ROOT = process.cwd()
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
/** ด่านต้องดู *โค้ด* ไม่ใช่คำอธิบาย — ไฟล์เหล่านี้เล่าเหตุผลไว้ยาวและมีชื่อสัญลักษณ์ในคอมเมนต์ */
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')

const PROXY = 'src/proxy.ts'

const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15'
const IPAD = 'Mozilla/5.0 (iPad; CPU OS 26_0 like Mac OS X) AppleWebKit/605.1.15'
const ANDROID = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36'
const DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'
const inApp = (ua: string) => resolveAppShell('app', ua)

describe('shouldBlockAppRegistration — ใครต้องถูกตัดจบ', () => {
  it('🛑 แอป iOS + ยังไม่ลงทะเบียน (เฟส 1) → บล็อก', () => {
    expect(shouldBlockAppRegistration(inApp(IOS), { needsRegistration: true })).toBe(true)
  })

  it('🛑 แอป iOS + ยังไม่ setup ร้าน (เฟส 2) → บล็อก — เปิดร้านแรก = สมัครธุรกิจเหมือนกัน', () => {
    expect(shouldBlockAppRegistration(inApp(IOS), { needsOnboarding: true })).toBe(true)
  })

  it('🛑 iPad ก็ต้องบล็อก — Apple ตรวจบน iPad Air M3 และรายงานบั๊กมาจากเครื่องนั้น', () => {
    expect(shouldBlockAppRegistration(inApp(IPAD), { needsRegistration: true })).toBe(true)
  })

  it('ผู้ขายที่ลงทะเบียนครบแล้ว → ผ่านตามปกติ ไม่แตะ', () => {
    expect(shouldBlockAppRegistration(inApp(IOS), {})).toBe(false)
    expect(shouldBlockAppRegistration(inApp(IOS), null)).toBe(false)
  })

  it('เว็บบน Safari ของ iPhone → **ไม่บล็อก** (กฎของ Apple ใช้กับในแอปเท่านั้น)', () => {
    expect(shouldBlockAppRegistration(resolveAppShell(undefined, IOS), { needsRegistration: true })).toBe(false)
  })

  it('เดสก์ท็อป และ แอป Android → ไม่บล็อก', () => {
    expect(shouldBlockAppRegistration(resolveAppShell(undefined, DESKTOP), { needsRegistration: true })).toBe(false)
    expect(shouldBlockAppRegistration(inApp(ANDROID), { needsRegistration: true })).toBe(false)
  })
})

describe('[blocker] proxy ต้องบังคับใช้ด่านนี้จริง', () => {
  it('🛑 proxy เรียก `shouldBlockAppRegistration`', () => {
    expect(
      code(PROXY),
      'proxy ไม่ได้เรียกด่านเลย ⇒ ปุ่ม Apple ในแอปยังพาไปหน้าสมัครได้เหมือนเดิม',
    ).toContain('shouldBlockAppRegistration')
  })

  it('🛑 ต้องล้าง session cookie ทั้งชื่อ dev และ prod — ไม่งั้นผู้ใช้ติดตาย', () => {
    const src = code(PROXY)
    expect(src, 'ขาดชื่อคุกกี้ของ prod (HTTPS ใช้ prefix __Secure-)').toContain(
      '__Secure-next-auth.session-token',
    )
    expect(src, 'ขาดชื่อคุกกี้ของ dev').toContain('next-auth.session-token')
    expect(src, 'ต้องลบคุกกี้จริง ไม่ใช่แค่ redirect').toMatch(/cookies\.delete/)
  })

  it('🛑 ด่านต้องมาก่อน force-redirect ไป /register — ไม่งั้นเด้งเข้าหน้าสมัครไปแล้ว', () => {
    const src = code(PROXY)
    const gate = src.indexOf('shouldBlockAppRegistration')
    const force = src.indexOf("'/register'")
    expect(gate, 'ไม่พบด่านใน proxy').toBeGreaterThan(-1)
    expect(force, "ไม่พบ force-redirect ไป /register").toBeGreaterThan(-1)
    expect(gate, 'ด่านอยู่หลัง force-redirect = ไม่มีผล').toBeLessThan(force)
  })

  it('🛑 ปลายทางต้องเป็นหน้าล็อกอิน และห้ามมีลิงก์ชวนไปสมัครที่เว็บ (3.1.1)', () => {
    const src = code(PROXY)
    expect(src).toContain('/auth/sign-in')
    expect(src, 'ห้ามมีโดเมนเว็บของเราในทางออกนี้').not.toMatch(
      /shouldBlockAppRegistration[\s\S]{0,600}deepthailand\.app/,
    )
  })
})
