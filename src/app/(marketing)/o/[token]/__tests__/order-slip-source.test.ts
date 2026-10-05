/**
 * [blocker] OrderSlip ต้องเป็น presentational — เงิน/ป้ายทั้งหมดมาจาก buildSlipMoneyView (feature 00068 · TFR-009)
 * อ่านไฟล์ตรง ๆ (ยังไม่อยู่ใน BUYER_ORDER_FILES — Controller ลงทะเบียนตอนต่อสาย)
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { stripComments } from '@/lib/__tests__/helpers/buyer-order-sources'

const FILE = join(process.cwd(), 'src/app/(marketing)/o/[token]/OrderSlip.tsx')
const code = stripComments(readFileSync(FILE, 'utf8'))

describe('[blocker] OrderSlip ไม่คิดเงื่อนไขเงินเอง', () => {
  it('ไม่อ่านฟิลด์ดิบของออเดอร์ที่ใช้ตัดสินเงิน/ป้าย', () => {
    for (const re of [
      /totalAmount/,
      /paymentConfirmedAt/,
      /paymentMethod/,
      /canSellerConfirmPayment|getPaymentBadge|SELLER_CONFIRMED_PAID_LABEL/,
      /['"]PENDING['"]|['"]CANCELLED['"]|['"]CONFIRMED['"]/,
      /depositReceived|depositAgreed|totalReceived|fullyPaid/,
      /\.outstanding\s*[<>=!]/,
    ]) {
      expect(code, `OrderSlip ห้ามมี ${re}`).not.toMatch(re)
    }
  })
  it('ตัวเลขเงินทุกจุดผ่าน formatBaht · ป้ายยอด/ป้ายแถวอ่านจาก view', () => {
    expect(code).toMatch(/from '@\/lib\/format-money'/)
    expect(code).not.toMatch(/toLocaleString|Intl\.NumberFormat|toFixed/)
    expect(code).toMatch(/money\.totalLabel/)
    expect(code).toMatch(/money\.paidChip/)
    expect(code).toMatch(/lines\.outstandingLabel/)
    expect(code).toMatch(/lines\.deposit\.label/)
  })
  it('คำบนตราจาก resolveStampLabel · คำเอกสารจาก ORDER_VOCAB (ไม่พิมพ์เอง)', () => {
    expect(code).not.toMatch(/['"]สำเร็จ['"]/)
    expect(code).toMatch(/resolveStampLabel\(/)
    expect(code).toMatch(/resolveOrderVocab\(/)
    for (const w of ['ได้รับแล้ว', 'รับบริการแล้ว', 'ชำระเงินแล้ว', 'ยังค้างชำระ', 'ร้านยืนยันรับ', 'ใบสั่งซื้อ', 'รายละเอียดคำสั่ง']) {
      expect(code, `ห้ามพิมพ์ "${w}" เอง`).not.toContain(w)
    }
  })
  it('ขอบฉีก 2 ชั้น (drop-shadow ชั้นนอก + mask ชั้นใน) และไม่มี emoji/ไล่สี', () => {
    expect(code).toMatch(/drop-shadow\(/)
    expect(code).toMatch(/mask:\s*'radial-gradient/)
    expect(code).not.toMatch(/background-clip|WebkitBackgroundClip|linear-gradient/)
    expect(code).not.toMatch(/\p{Extended_Pictographic}/u)
  })
  it('ปุ่มไอคอนมี aria-label ผันตาม noun', () => {
    expect(code).toMatch(/aria-label=\{`คัดลอกเลข\$\{noun\}`\}/)
    expect(code).toMatch(/aria-label=\{`แชร์ลิงก์\$\{noun\}`\}/)
  })
})
