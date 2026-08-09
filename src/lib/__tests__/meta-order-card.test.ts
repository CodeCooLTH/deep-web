import { describe, expect, it } from 'vitest'
import { parseMetaOrderCard } from '../meta-order-card'
import { parseMetaSystemNotice } from '../meta-system-notice'

/**
 * บั๊กที่เทสชุดนี้ตรึงไว้ (user report 2026-08-09): การ์ดคำขอชำระเงินขึ้นเป็นข้อความดิบ
 * "[การ์ดจาก Facebook] ฿360.00 order — Waiting for payment" กลางเธรดแทนที่จะเป็นการ์ด
 *
 * ต้นเหตุมี 2 ชั้น — เทสนี้ครอบทั้งคู่:
 *   1. regex เดิมรับเฉพาะ "฿N order" ล้วน ๆ ไม่รับคำนำหน้า/สถานะที่เส้น Graph sync เติมเสมอ
 *   2. ฝั่ง ChatThread เรียก parseMetaSystemNotice ก่อน ซึ่งจับคำนำหน้าเดียวกันนี้ได้
 *      → ต้องมั่นใจว่า "การ์ดยอดเงิน" กับ "การ์ดชนิดอื่น" แยกออกจากกันได้จริงที่ระดับ parser
 */
describe('parseMetaOrderCard', () => {
  it('รูปเดิมจาก webhook (ไม่มีคำนำหน้า ไม่มีสถานะ) ยังต้องอ่านได้เหมือนเดิม', () => {
    expect(parseMetaOrderCard('฿400.00 order')).toEqual({ amount: '฿400.00', status: null })
  })

  it('รูปจากเส้น Graph sync ที่มีทั้งคำนำหน้าและสถานะ — เคสที่ user เจอบน prod', () => {
    expect(parseMetaOrderCard('[การ์ดจาก Facebook] ฿360.00 order — Waiting for payment')).toEqual({
      amount: '฿360.00',
      status: 'Waiting for payment',
    })
  })

  it('มีคำนำหน้าแต่ subtitle ว่าง = รู้ยอด ไม่รู้สถานะ', () => {
    expect(parseMetaOrderCard('[การ์ดจาก Facebook] ฿360.00 order')).toEqual({
      amount: '฿360.00',
      status: null,
    })
  })

  it('ยอดที่มีคอมมาอ่านได้ และคงรูปเดิมที่ Meta ส่งมา ไม่ reformat', () => {
    expect(parseMetaOrderCard('[การ์ดจาก Facebook] ฿1,130.00 order')?.amount).toBe('฿1,130.00')
  })

  /**
   * คำนำหน้าเดียวกันนี้ใช้กับการ์ดทุกชนิด — ถ้า regex กว้างไป การ์ดโทรจะกลายเป็นการ์ดยอดเงิน
   * ที่ไม่มียอดเงิน ซึ่งแย่กว่าบั๊กเดิม
   */
  it('การ์ดชนิดอื่นที่ใช้คำนำหน้าเดียวกัน ต้องไม่ถูกจับเป็นการ์ดยอดเงิน', () => {
    expect(parseMetaOrderCard('[การ์ดจาก Facebook] Video call — Call again')).toBeNull()
    expect(parseMetaOrderCard('[การ์ดจาก Facebook] โทรหา ร้านทดสอบ — ส่งข้อความแล้ว')).toBeNull()
  })

  it('ข้อความจริงของร้านที่บังเอิญมีคำว่า order ต้องไม่ถูกจับ', () => {
    expect(parseMetaOrderCard('฿360.00 order ครับ รบกวนโอนด้วยนะครับ')).toBeNull()
    expect(parseMetaOrderCard('สนใจ order ฿360.00 ไหมคะ')).toBeNull()
  })

  it('ท้ายข้อความของการ์ดหลายใบไม่ไหลไปปนในสถานะ', () => {
    expect(
      parseMetaOrderCard('[การ์ดจาก Facebook] ฿360.00 order — Waiting for payment และอีก 2 รายการ')
        ?.status,
    ).toBe('Waiting for payment')
  })

  it('ค่าว่าง/null คืน null', () => {
    expect(parseMetaOrderCard(null)).toBeNull()
    expect(parseMetaOrderCard('')).toBeNull()
  })
})

describe('ลำดับการตรวจ: การ์ดยอดเงิน vs บรรทัดระบบ', () => {
  /**
   * นี่คือหัวใจของบั๊ก — ทั้งสอง parser จับข้อความเดียวกันนี้ได้ทั้งคู่ ผู้เรียก (ChatThread)
   * จึงต้องให้การ์ดยอดเงินชนะเสมอ เทสนี้ตรึงข้อเท็จจริงนั้นไว้ให้เห็นชัดว่า "ทับกันจริง"
   * ไม่ใช่เรื่องบังเอิญ — ถ้าวันหนึ่งมีคนสลับลำดับกลับ บั๊กเดิมจะกลับมาทันทีโดยไม่มีอะไรฟ้อง
   */
  const body = '[การ์ดจาก Facebook] ฿360.00 order — Waiting for payment'

  it('ข้อความเดียวกันถูกจับได้ทั้งสอง parser — ผู้เรียกต้องให้การ์ดยอดเงินชนะ', () => {
    expect(parseMetaOrderCard(body)).not.toBeNull()
    expect(parseMetaSystemNotice(body)).not.toBeNull()
  })

  it('การ์ดชนิดอื่นตกไปเป็นบรรทัดระบบตามเดิม (ไม่ถูกงานนี้แย่งไป)', () => {
    const other = '[การ์ดจาก Facebook] Video call — Call again'
    expect(parseMetaOrderCard(other)).toBeNull()
    expect(parseMetaSystemNotice(other)).not.toBeNull()
  })
})
