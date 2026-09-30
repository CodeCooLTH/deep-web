/**
 * [blocker] ปุ่ม OAuth ในแอป iOS ต้องถูกปฏิเสธ **ก่อนสร้างบัญชี** ไม่ใช่สร้างแล้วค่อยเตะออก
 *
 * ## รูที่ด่านนี้ปิด (นับจริงบน prod 2026-09-28 — **12 ราย**)
 *
 * `proxy.ts` มีด่าน 3.1.1 อยู่แล้ว แต่มันทำงาน **หลัง** บัญชีถูกสร้าง: เตะออกและล้าง session ได้
 * **แต่แถวที่สร้างไปแล้วยังอยู่** ⇒ ผู้ใช้ได้บัญชีกำพร้าที่ไม่มีเบอร์และไม่มีรหัสผ่าน แล้ว
 * **Facebook/LINE id นั้นใช้กับ Deep ไม่ได้อีกเลย** เพราะ `AuthAccount` ผูก id ไว้กับบัญชีที่
 * เจ้าตัวเข้าไม่ถึง และการถอดต้องยืนยันด้วย OTP ทางเบอร์ซึ่งไม่มี (ทางตันของภาคผนวก 6)
 *
 * Apple ไม่เป็นแบบนี้เพราะทางเข้าเป็น API ของเราเอง (`/api/login/apple-native`) ซึ่งตอบ
 * `NO_ACCOUNT` ตั้งแต่ก่อนสร้าง ⇒ ด่านนี้คือการทำให้ **เจ้าอื่นเท่ากับ Apple**
 *
 * ## 🛑 ด่านใน proxy ยังต้องอยู่ ห้ามถอด
 *
 * สองด่านจับคนละเคส — ตัวนี้จับ "ยังไม่เคยผูก = กำลังสมัคร" ส่วน proxy จับ "ผูกแล้วแต่ยัง
 * ลงทะเบียนไม่ครบ" (ไม่มีเบอร์ / ยังไม่ตั้งค่าร้าน) ซึ่งตัวนี้มองไม่เห็นเลย
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { resolveAppShell, shouldBlockOAuthSignup } from '@/lib/app-shell'

const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15'
const IPAD = 'Mozilla/5.0 (iPad; CPU OS 26_0 like Mac OS X) AppleWebKit/605.1.15'
const ANDROID = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36'
const DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'
const inApp = (ua: string) => resolveAppShell('app', ua)

describe('shouldBlockOAuthSignup — ใครถูกปฏิเสธก่อนสร้างบัญชี', () => {
  it('🛑 แอป iOS + ยังไม่เคยผูก = กำลังสมัคร → บล็อก', () => {
    expect(shouldBlockOAuthSignup(inApp(IOS), false)).toBe(true)
    expect(shouldBlockOAuthSignup(inApp(IPAD), false)).toBe(true)
  })

  it('🛑 ผูกไว้แล้ว = ล็อกอินของคนเดิม → ต้องผ่านเสมอ แม้อยู่ในแอป', () => {
    /* เป็นเงื่อนไขที่แยก "สมัคร" ออกจาก "ล็อกอิน" — พลาดข้อนี้ = ผู้ขายเดิมเข้าแอปไม่ได้ทั้งหมด */
    expect(shouldBlockOAuthSignup(inApp(IOS), true)).toBe(false)
    expect(shouldBlockOAuthSignup(inApp(IPAD), true)).toBe(false)
  })

  it('เว็บ / Safari บนมือถือ / แอป Android → ไม่บล็อก (กฎของ Apple ใช้กับแอป iOS เท่านั้น)', () => {
    expect(shouldBlockOAuthSignup(resolveAppShell(undefined, IOS), false)).toBe(false)
    expect(shouldBlockOAuthSignup(resolveAppShell(undefined, DESKTOP), false)).toBe(false)
    expect(shouldBlockOAuthSignup(inApp(ANDROID), false)).toBe(false)
  })

  it('🛑 ต้องใช้เกณฑ์ของ "การสมัคร" ไม่ใช่เกณฑ์ของ "การจ่ายเงิน"', () => {
    /**
     * สองกฎนี้บังเอิญให้คำตอบเท่ากันวันนี้ แต่เป็นคนละข้อในจดหมายคนละรอบ —
     * ยุบรวมเมื่อไหร่ วันที่ข้อจ่ายเงินถูกผ่อน การสมัครจะกลับมาโผล่ในแอปด้วย
     * โดยไม่มีใครตั้งใจ (`domain-term-single-definition.md`)
     */
    const src = readFileSync(join(process.cwd(), 'src/lib/app-shell.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1')
    const body = src.slice(src.indexOf('export function shouldBlockOAuthSignup'))
    expect(body, 'ไปเรียกเกณฑ์ของการจ่ายเงินแทน').not.toMatch(/isPaymentRestricted/)
    expect(body, 'ไม่ได้ใช้เกณฑ์ของการสมัคร').toMatch(/isSignUpRestricted/)
  })
})

// ─── ต้องมีคนเรียกจริง ────────────────────────────────────────────────────────

/** ตัดคอมเมนต์ก่อนสแกน — ไฟล์ที่ทำถูกคือไฟล์ที่เขียนคำอธิบายของกฎนั้นไว้ด้วย */
const code = (rel: string) =>
  readFileSync(join(process.cwd(), rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')

const AUTH = 'src/lib/auth.ts'
const PROXY = 'src/proxy.ts'

describe('[blocker] `signIn` callback ต้องบังคับด่านนี้จริง', () => {
  const auth = code(AUTH)

  it('🛑 ต้องเรียก `shouldBlockOAuthSignup` — โค้ดที่ไม่มีใครเรียกคือรูปร่างของบั๊กเดิม', () => {
    expect(auth, 'ไม่มีใครเรียกด่าน ⇒ FB/LINE ยังสร้างบัญชีกำพร้าเหมือนเดิม').toMatch(
      /shouldBlockOAuthSignup\(/,
    )
  })

  it('🛑 ต้องเด้งไปหน้าล็อกอินด้วยธงเดียวกับด่าน 3.1.1 ใน proxy (HR16)', () => {
    /* คนละธง = คนละข้อความ = ผู้ใช้เห็นคำอธิบายคนละอย่างสำหรับสถานการณ์เดียวกัน */
    const at = auth.indexOf('shouldBlockOAuthSignup(')
    expect(auth.slice(at, at + 220)).toMatch(/app_no_account=1/)
    expect(code(PROXY), 'proxy เลิกใช้ธงนี้แล้ว = สองที่หลุดจากกัน').toMatch(/app_no_account/)
  })

  it('🛑 ห้ามบล็อกโหมดเชื่อมบัญชี — ด่านต้องอยู่ **หลัง** การอ่าน link-intent', () => {
    /**
     * โหมดเชื่อมบัญชีคือการ "ผูกเจ้าใหม่เข้าบัญชีที่ล็อกอินอยู่" ซึ่ง **ไม่ใช่การสมัคร**
     * บล็อกด้วย = ผู้ขายที่อยู่ในแอปเชื่อม Facebook/LINE เพิ่มไม่ได้เลย
     */
    const intentAt = auth.indexOf('verifyLinkIntent(')
    const gateAt = auth.indexOf('shouldBlockOAuthSignup(')
    expect(intentAt, 'หาการอ่าน link-intent ไม่เจอ').toBeGreaterThan(-1)
    expect(gateAt, 'หาด่านไม่เจอ').toBeGreaterThan(-1)
    expect(gateAt, 'ด่านอยู่ก่อนอ่าน link-intent = บล็อกโหมดเชื่อมบัญชีไปด้วย').toBeGreaterThan(
      intentAt,
    )
  })

  it('🛑 ต้องส่ง "ผูกไว้แล้วหรือยัง" เข้าไปด้วย ไม่ใช่บล็อกทุกคนที่อยู่ในแอป', () => {
    /* ส่งค่าคงที่ไปแทน = ผู้ขายเดิมที่ล็อกอินด้วย Facebook เข้าแอปไม่ได้ทั้งหมด */
    const at = auth.indexOf('shouldBlockOAuthSignup(')
    expect(auth.slice(at, at + 120)).toMatch(/linkedAccount/)
  })

  it('🛑 ด่านใน proxy ต้องยังอยู่ — สองด่านจับคนละเคส ถอดตัวไหนก็มีรูทันที', () => {
    /* ตัวใหม่จับ "กำลังสมัคร" · proxy จับ "มีบัญชีแล้วแต่ลงทะเบียนไม่ครบ" */
    expect(code(PROXY)).toMatch(/shouldBlockAppRegistration\(/)
  })
})
