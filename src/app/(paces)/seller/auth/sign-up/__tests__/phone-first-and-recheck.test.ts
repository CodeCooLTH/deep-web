import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * ด่านของฟอร์มสมัครผู้ขาย 2 ข้อที่ "ถอดออกแล้วไม่มีอะไรฟ้อง"
 *
 * 1) **ช่องเบอร์ต้องมาก่อนช่องรหัสผ่าน** — เหตุผลทั้งหมดของการย้ายคือ ผู้ใช้กรอกฟอร์มจากบนลงล่าง
 *    ถ้าเบอร์กลับไปอยู่ท้ายฟอร์มเมื่อไร ผู้ใช้จะเดินผ่านการตั้งรหัสผ่าน (ที่ต้องผ่าน strength meter)
 *    ไปก่อนเสมอ แล้วความพยายามทั้งหมดเป็นโมฆะตอนรู้ว่ามีบัญชีอยู่แล้ว — live-check เร็วแค่ไหน
 *    ก็ช่วยไม่ได้ **การจัดลำดับคือตัวฟีเจอร์เอง ไม่ใช่การจัดหน้าให้สวย** และการ "จัดฟอร์มใหม่
 *    ให้เรียงสวย ๆ" ในอนาคตจะย้อนมันกลับได้โดยที่ tsc/เทส/detector เขียวหมด
 *
 * 2) **ด่านจริงคือ check-phone ตอน submit ไม่ใช่ live-check** — live-check เป็นแค่ตัวเร่งให้รู้เร็ว
 *    ถ้าใครถอด re-check ตอน submit ทิ้งเพราะคิดว่า "live-check ครอบให้แล้ว" ระบบจะยิง OTP ไป
 *    เบอร์ที่มีบัญชีอยู่แล้วได้จริงในเคสที่ live-check ไม่เคยทำงาน (network ล่ม / ผู้ใช้ paste แล้ว
 *    กด submit ภายใน 400ms ก่อน debounce ยิง)
 */

const ROOT = process.cwd()
const SRC = 'src/app/(paces)/seller/auth/sign-up/components/SignUpForm.tsx'

/** ตัดคอมเมนต์ก่อนสแกน — ไฟล์ที่ทำถูกคือไฟล์ที่เขียนคำเตือนของกฎนั้นไว้ด้วย (บทเรียน HR9) */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length))
}

const source = stripComments(readFileSync(join(ROOT, SRC), 'utf8'))

/**
 * ตัดเอาเฉพาะส่วน JSX — ห้ามวัดลำดับจากทั้งไฟล์
 *
 * 🛑 ร่างแรกของเทสนี้ใช้ `rhfPasswordRest` เป็นหมุดของ "ช่องรหัสผ่าน" แล้วแดงทันทีทั้งที่โค้ดถูก
 * เพราะ match แรกคือ **บรรทัดประกาศตัวแปร** ซึ่งอยู่เหนือ JSX ทั้งหมด — คลาสเดียวกับที่
 * docs/conventions/rule-must-be-enforced-not-described.md เตือนไว้ว่าเทสสแกนซอร์สต้องจับ
 * ตัวแปรปลายทางในบริบทที่ใช้จริง ไม่ใช่ชื่อเปล่า ๆ (บรรทัด import ก็ match)
 */
const jsx = source.slice(source.indexOf('  return ('))

describe('ฟอร์มสมัครผู้ขาย — ลำดับช่องและด่านเบอร์ซ้ำ', () => {
  it('[blocker] ช่องเบอร์ต้อง render ก่อนช่องรหัสผ่านและช่อง username', () => {
    const phoneAt = jsx.indexOf('id="phone"')
    const usernameAt = jsx.indexOf('id="username"')
    const passwordAt = jsx.indexOf('<PasswordInputWithStrength')

    expect(phoneAt, 'หา input เบอร์ไม่เจอ').toBeGreaterThan(-1)
    expect(usernameAt, 'หา input username ไม่เจอ').toBeGreaterThan(-1)
    expect(passwordAt, 'หาช่องรหัสผ่านไม่เจอ').toBeGreaterThan(-1)

    expect(phoneAt, 'เบอร์ต้องมาก่อน username').toBeLessThan(usernameAt)
    expect(phoneAt, 'เบอร์ต้องมาก่อนรหัสผ่าน').toBeLessThan(passwordAt)
  })

  it('[blocker] onSubmit ต้องยังเช็ค check-phone เองก่อนยิง OTP', () => {
    const submitAt = source.indexOf('const onSubmit')
    expect(submitAt).toBeGreaterThan(-1)
    const submitBody = source.slice(submitAt)

    const checkAt = submitBody.indexOf('/api/users/check-phone')
    const otpAt = submitBody.indexOf('/api/otp/send')

    expect(checkAt, 'onSubmit ต้องเรียก check-phone').toBeGreaterThan(-1)
    expect(otpAt, 'onSubmit ต้องเป็นที่ที่ยิง OTP').toBeGreaterThan(-1)
    expect(checkAt, 'ต้องเช็คเบอร์ก่อนยิง OTP ไม่ใช่หลัง').toBeLessThan(otpAt)
    expect(submitBody, 'เจอเบอร์ซ้ำแล้วต้องหยุด ไม่ใช่เดินต่อ').toMatch(
      /setPhoneConflict\(values\.phone\)\s*\n\s*return/,
    )
  })

  it('[blocker] live-check ต้องกรองด้วย MOBILE_PHONE_RE ไม่ใช่ regex ที่เขียนเอง', () => {
    /**
     * SSOT ของ "เบอร์ที่รับได้" คือ `MOBILE_PHONE_RE` (`^0[689][0-9]{8}$`) ใน `src/lib/phone.ts`
     * ถ้าใครเขียน regex เองที่นี่ ฟอร์มจะยิง API ให้เบอร์บ้าน (ซึ่ง schema ปฏิเสธอยู่แล้ว)
     * และที่แย่กว่าคือกฎในหัวคนอ่านโค้ดจะแตกเป็นสองเวอร์ชันทันที (Hard Rule 16)
     */
    expect(source).toContain('MOBILE_PHONE_RE')
    expect(source, 'ห้ามมี regex เบอร์เขียนเองในไฟล์นี้').not.toMatch(/\/\^0\[0-9\]\{9\}\$\//)
  })
})
