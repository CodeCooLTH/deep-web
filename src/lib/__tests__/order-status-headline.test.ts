import { describe, expect, it } from 'vitest'
import { resolveOrderStatusHeadline } from '../order-status-headline'

/**
 * [blocker] หัวเรื่องสถานะของหน้า `/o/[token]`
 *
 * เกณฑ์ที่เทสชุดนี้ต้องจับให้ได้คือ "เขียนกลับด้านแล้วมีอะไรฟ้องไหม" — ทั้งสองค่าเป็นสตริงที่ถูก
 * ตามชนิดเสมอ ไม่ว่าตรรกะจะสลับหรือไม่ (ui-boolean-needs-a-testable-home.md)
 */
describe('resolveOrderStatusHeadline', () => {
  it('[blocker] ไม่มีพัสดุ → หัวเรื่องคือสถานะออเดอร์ และไม่มีป้ายซ้ำ', () => {
    const r = resolveOrderStatusHeadline({ status: 'PENDING', stage: 'AWAITING_PARCEL', hasShipment: false })
    expect(r.headline).toBe('รอดำเนินการ')
    expect(r.statusPill).toBeNull()
  })

  // เคสหลักของหน้านี้: ร้านเปิดพัสดุแล้ว ผู้ซื้อเปิดลิงก์มาดูว่ากล่องถึงไหน
  it('[blocker] มีพัสดุกำลังส่ง → หัวเรื่องเป็นเรื่องของกล่อง ป้ายเป็นเรื่องของดีล', () => {
    const r = resolveOrderStatusHeadline({ status: 'PENDING', stage: 'SHIPPING', hasShipment: true })
    expect(r.headline).toBe('กำลังจัดส่ง')
    expect(r.statusPill).toBe('รอดำเนินการ')
    expect(r.headline).not.toBe(r.statusPill)
  })

  it('[blocker] พัสดุมีปัญหา → หัวเรื่องต้องพูดถึงปัญหา ไม่ใช่ "รอดำเนินการ" เฉย ๆ', () => {
    const r = resolveOrderStatusHeadline({ status: 'PENDING', stage: 'PROBLEM', hasShipment: true })
    expect(r.headline).not.toBe('รอดำเนินการ')
    expect(r.statusPill).toBe('รอดำเนินการ')
  })

  // 🛑 เคสที่ SHIPPING_STAGE_LABEL ตรง ๆ จะให้ undefined — map ตัวนั้นไม่มีคีย์ DONE
  it('[blocker] พัสดุส่งถึงแล้ว + ออเดอร์ยืนยันแล้ว → ต้องได้คำจริง ไม่ใช่ค่าว่าง', () => {
    const r = resolveOrderStatusHeadline({ status: 'CONFIRMED', stage: 'DONE', hasShipment: true })
    expect(r.headline).toBeTruthy()
    expect(r.headline).not.toBe('undefined')
    expect(r.statusPill).toBeNull() // ซ้ำกับหัวเรื่องแล้ว
  })

  it('[blocker] ยกเลิกแล้ว → ไม่มีป้ายซ้ำ และหัวเรื่องพูดว่ายกเลิก', () => {
    const r = resolveOrderStatusHeadline({ status: 'CANCELLED', stage: 'DONE', hasShipment: true })
    expect(r.statusPill).toBeNull()
    expect(r.headline).toContain('ยกเลิก')
  })

  it('ไม่มีทางคืนป้ายที่พูดคำเดียวกับหัวเรื่อง (ทุกคู่ status × stage)', () => {
    const statuses = ['PENDING', 'SHIPPED', 'CONFIRMED', 'CANCELLED']
    const stages = ['AWAITING_PARCEL', 'AWAITING_PICKUP', 'SHIPPING', 'AWAITING_COD', 'PROBLEM', 'DONE'] as const
    for (const status of statuses) {
      for (const stage of stages) {
        for (const hasShipment of [true, false]) {
          const r = resolveOrderStatusHeadline({ status, stage, hasShipment })
          expect(r.headline, `${status}/${stage}/${hasShipment}`).toBeTruthy()
          if (r.statusPill !== null) expect(r.statusPill).not.toBe(r.headline)
        }
      }
    }
  })
})
