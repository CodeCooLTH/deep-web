/**
 * [blocker] ผลจาก /impeccable critique 2026-10-05 (snapshot .impeccable/critique/2026-10-05T03-58-25Z__*)
 * ลิงก์ SMS หมดอายุ · dialog ยืนยันรับก่อนกด · ประโยคเตือนใต้ปุ่ม · หมึกอำพันบนการ์ดบัญชี
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { readBuyerOrderFile, stripComments } from '@/lib/__tests__/helpers/buyer-order-sources'

const signIn = stripComments(
  readFileSync(join(process.cwd(), 'src/app/(marketing)/auth/sign-in/SignInCard.tsx'), 'utf8'),
)
const odm = readBuyerOrderFile('OrderDetailMobile.tsx', { stripComments: true })
const payout = readBuyerOrderFile('PayoutAccountCard.tsx', { stripComments: true })
const pill = readBuyerOrderFile('TrustPill.tsx', { stripComments: true })

describe('[blocker] ลิงก์ SMS หมดอายุ → ฟอร์มเบอร์ ไม่ใช่ฟอร์มรหัสผ่าน (P0)', () => {
  it('smsExpired=1 เลือกโหมด otp ตั้งแต่แรก', () => {
    expect(signIn).toMatch(/smsExpired\s*=\s*searchParams\.get\('smsExpired'\)\s*===\s*'1'/)
    expect(signIn).toMatch(/prefillPhone\s*\|\|\s*smsExpired\s*\?\s*'otp'/)
  })
  it('ข้อความเป็นแถบค้างในหน้า (Alert) ไม่ใช่ toast ที่หายเอง', () => {
    expect(signIn).toMatch(/\{smsExpired && \(\s*<Alert/)
  })
})

describe('[blocker] dialog ยืนยันรับ ไม่ใช้เขียวก่อนผู้ซื้อยืนยัน (P1 · Verified-Means-Green)', () => {
  const dialog = odm.slice(odm.indexOf("aria-labelledby='confirm-dialog-title'"), odm.indexOf('<ReviewSheet'))
  it('ไม่มี success ใน dialog ยืนยันรับ', () => {
    expect(dialog.length).toBeGreaterThan(100)
    expect(dialog).not.toMatch(/success/)
  })
  it('ปุ่มผันคำตามร้านบริการ', () => {
    expect(dialog).toMatch(/order\.isServiceShop \? 'รับบริการแล้ว' : 'ได้รับแล้ว'/)
  })
})

describe('[blocker] เตือนก่อนแตะปุ่มยืนยัน + ปุ่มยกเลิกไม่ใช่ถังขยะ (P1)', () => {
  it('มีประโยคเตือนใต้ปุ่มยืนยันทั้งสองแบบร้าน', () => {
    expect(odm).toContain('กดเมื่อได้ของครบแล้วเท่านั้น')
    expect(odm).toContain('กดเมื่อได้รับบริการครบแล้วเท่านั้น')
  })
  it('ปุ่มยกเลิกในแถบล่างใช้กากบาท', () => {
    const cancel = odm.slice(odm.indexOf("aria-label='ยกเลิกคำสั่งซื้อ'"), odm.indexOf("className='cancel-label'"))
    expect(cancel).toContain('tabler-x')
    expect(cancel).not.toContain('tabler-trash')
  })
})

describe('[blocker] ข้อความอำพันบนพื้นจางใช้หมึกเข้ม (P1 · contrast-fix-keeps-hue)', () => {
  it('การ์ดบัญชีไม่ใช้ warning.main กับตัวอักษร', () => {
    expect(payout).not.toMatch(/color:\s*'warning\.main'/)
    expect(payout).toContain('VERIFY_BADGE_PALETTE.gold.fg')
  })
  it('TrustPill tier warning ใช้หมึก gold ไม่ใช่ warning.dark', () => {
    expect(pill).toMatch(/tierColor === 'warning'\s*\?\s*VERIFY_BADGE_PALETTE\.gold\.fg/)
  })
})
