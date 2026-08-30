import { describe, expect, it } from 'vitest'

import {
  PICKUP_AUTOCONFIRM_HOURS,
  PICKUP_STAGE_LABEL,
  computeAutoConfirmDeadline,
  derivePickupStage,
  isPickupOrder,
} from './order-pickup'

describe('isPickupOrder', () => {
  it("คืน true เฉพาะ 'PICKUP'", () => {
    expect(isPickupOrder('PICKUP')).toBe(true)
    expect(isPickupOrder('SHIPPED')).toBe(false)
    expect(isPickupOrder('NO_SHIPPING')).toBe(false)
    expect(isPickupOrder(null)).toBe(false)
    expect(isPickupOrder(undefined)).toBe(false)
  })
})

describe('computeAutoConfirmDeadline', () => {
  // [blocker] mutation: เปลี่ยน `48` เป็น `24` ใน order-pickup.ts ต้องทำให้เทสนี้แดง
  //
  // 🛑 ตัวเลข 48*60*60*1000 ในไฟล์นี้เป็น literal ที่จงใจ "ไม่" import มาจาก
  // PICKUP_AUTOCONFIRM_HOURS — ถ้า derive expected จากค่าคงที่ตัวเดียวกับที่ implementation
  // ใช้ mutation จะเปลี่ยนทั้งคู่พร้อมกันแล้วเทสยังเขียว (docs/conventions/mutation-silence-means-weak-corpus.md)
  it('คืนเวลา handedOverAt + 48 ชั่วโมงเป๊ะ (literal ไม่พึ่งค่าคงที่)', () => {
    const handedOverAt = new Date('2026-08-28T10:00:00.000Z')
    const expected = new Date(handedOverAt.getTime() + 48 * 60 * 60 * 1000)

    expect(computeAutoConfirmDeadline(handedOverAt)).toEqual(expected)
  })

  it('สอดคล้องกับค่าคงที่ที่ export (ตรวจว่า export ตรงกับพฤติกรรมจริง)', () => {
    expect(PICKUP_AUTOCONFIRM_HOURS).toBe(48)
    const handedOverAt = new Date('2026-01-01T00:00:00.000Z')
    const deadline = computeAutoConfirmDeadline(handedOverAt)

    expect(deadline.getTime() - handedOverAt.getTime()).toBe(
      PICKUP_AUTOCONFIRM_HOURS * 60 * 60 * 1000,
    )
  })
})

describe('derivePickupStage', () => {
  const base = {
    status: 'PENDING',
    handedOverAt: null as Date | string | null,
    disputeOpenedAt: null as Date | string | null,
    disputeResolvedAt: null as Date | string | null,
  }

  it('CONFIRMED → DONE เสมอ ไม่ว่าฟิลด์อื่นเป็นอะไร', () => {
    expect(derivePickupStage({ ...base, status: 'CONFIRMED' })).toBe('DONE')
    expect(
      derivePickupStage({
        ...base,
        status: 'CONFIRMED',
        disputeOpenedAt: new Date(),
        disputeResolvedAt: null,
      }),
    ).toBe('DONE')
  })

  it('CANCELLED → DONE', () => {
    expect(derivePickupStage({ ...base, status: 'CANCELLED' })).toBe('DONE')
  })

  it('ยังไม่มอบของ ไม่มีข้อพิพาท → AWAITING_HANDOVER', () => {
    expect(derivePickupStage(base)).toBe('AWAITING_HANDOVER')
  })

  it('มอบของแล้ว ไม่มีข้อพิพาท → AWAITING_BUYER_ACK', () => {
    expect(derivePickupStage({ ...base, handedOverAt: new Date() })).toBe('AWAITING_BUYER_ACK')
  })

  it('มีข้อพิพาทค้าง (เปิดแล้วยังไม่ resolve) ระหว่างรอ ack → DISPUTED ชนะ AWAITING_BUYER_ACK', () => {
    expect(
      derivePickupStage({
        ...base,
        handedOverAt: new Date(),
        disputeOpenedAt: new Date(),
        disputeResolvedAt: null,
      }),
    ).toBe('DISPUTED')
  })

  it('ข้อพิพาทที่ resolve แล้ว ไม่ทำให้เป็น DISPUTED', () => {
    expect(
      derivePickupStage({
        ...base,
        handedOverAt: new Date(),
        disputeOpenedAt: new Date('2026-01-01'),
        disputeResolvedAt: new Date('2026-01-02'),
      }),
    ).toBe('AWAITING_BUYER_ACK')
  })

  it('มีข้อพิพาทค้างก่อนมอบของ (ยังไม่ handedOverAt) → DISPUTED เช่นกัน', () => {
    expect(
      derivePickupStage({
        ...base,
        handedOverAt: null,
        disputeOpenedAt: new Date(),
        disputeResolvedAt: null,
      }),
    ).toBe('DISPUTED')
  })
})

describe('PICKUP_STAGE_LABEL', () => {
  it('มีคำไทยครบ 4 สถานะตาม UX-Design-Spec A2/A5', () => {
    expect(PICKUP_STAGE_LABEL.AWAITING_HANDOVER).toEqual({ label: 'รอมอบของ', tone: 'warning' })
    expect(PICKUP_STAGE_LABEL.AWAITING_BUYER_ACK).toEqual({ label: 'รอผู้ซื้อยืนยัน', tone: 'info' })
    expect(PICKUP_STAGE_LABEL.DISPUTED).toEqual({ label: 'มีข้อทักท้วง', tone: 'warning' })
    expect(PICKUP_STAGE_LABEL.DONE).toEqual({ label: 'เสร็จสิ้น', tone: 'success' })
  })

  it("'รอผู้ซื้อยืนยัน' ต้องไม่ใช่ tone success (ห้ามเขียวก่อนปิดงานจริง)", () => {
    expect(PICKUP_STAGE_LABEL.AWAITING_BUYER_ACK.tone).not.toBe('success')
  })
})
