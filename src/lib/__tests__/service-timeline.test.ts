import { describe, expect, it } from 'vitest'

import { getServiceTimeline } from '@/lib/order-display'

/**
 * เส้นทางที่ลูกค้าร้านบริการเห็นบนหน้า /o/[token]
 *
 * 🛑 ชุดเดิม (NO_SHIPPING) เขียนว่า **"ส่งมอบแล้ว"** เป็นขั้นปัจจุบันตั้งแต่บิลยัง PENDING
 * ⇒ ลูกค้าที่จองไว้และยังไม่ได้รับบริการ เห็นคำที่อ้างสิ่งที่ยังไม่เกิด บนหน้าที่เขาใช้ตัดสินใจโอนเงิน
 * (หัวหน้า 2026-08-15: "order detail ดูไม่รู้เรื่อง")
 */
const NOW = new Date('2026-08-16T12:00:00+07:00')
const labels = (s: ReturnType<typeof getServiceTimeline>) => s.map((x) => x.label)
const stateOf = (s: ReturnType<typeof getServiceTimeline>, label: string) =>
  s.find((x) => x.label === label)?.state

describe('getServiceTimeline', () => {
  it('[blocker] ห้ามมีคำว่า "ส่งมอบ" หรือ "จัดส่ง" — ร้านบริการไม่มีของให้ส่ง', () => {
    for (const status of ['PENDING', 'SHIPPED', 'CONFIRMED', 'CANCELLED'] as const) {
      const t = getServiceTimeline({
        status,
        serviceStart: '2026-08-16T09:00:00+07:00',
        appointmentStatus: 'SCHEDULED',
        now: NOW,
      })
      for (const l of labels(t)) {
        expect(l, `${status}: "${l}" ไม่ควรอยู่ในเส้นทางของร้านบริการ`).not.toMatch(/ส่งมอบ|จัดส่ง|สินค้า/)
      }
    }
  })

  it('[blocker] ยังไม่ถึงเวลานัด → "เข้ารับบริการ" ต้องยังไม่ใช่ขั้นปัจจุบัน', () => {
    const t = getServiceTimeline({
      status: 'PENDING',
      serviceStart: '2026-08-20T09:00:00+07:00',
      appointmentStatus: 'SCHEDULED',
      now: NOW,
    })
    expect(stateOf(t, 'เข้ารับบริการ')).toBe('up')
  })

  it('[blocker] เลยเวลานัดมาแล้วแต่ร้านยังไม่กดปิดผล → "กำลังถึงคิว"', () => {
    /**
     * ตัดสินจากเวลาที่ผ่านไป ไม่ใช่จากสถานะที่ร้านกด — ร้านที่ยุ่งจะกดปิดผลทีหลัง
     * ถ้ารอให้ร้านกดก่อน ลูกค้าที่นั่งอยู่ในร้านจะเห็นว่า "ยังไม่ถึงคิว" ซึ่งขัดกับสิ่งที่เห็นด้วยตา
     */
    const t = getServiceTimeline({
      status: 'PENDING',
      serviceStart: '2026-08-16T09:00:00+07:00',
      appointmentStatus: 'SCHEDULED',
      now: NOW,
    })
    expect(stateOf(t, 'เข้ารับบริการ')).toBe('cur')
  })

  it('[blocker] ปิดผลนัดแล้ว → "เข้ารับบริการ" เป็น done แม้ยังไม่ถึงเวลาที่นัดไว้', () => {
    const t = getServiceTimeline({
      status: 'PENDING',
      serviceStart: '2026-08-20T09:00:00+07:00',
      appointmentStatus: 'COMPLETED',
      now: NOW,
    })
    expect(stateOf(t, 'เข้ารับบริการ')).toBe('done')
  })

  it('[blocker] ยังไม่ระบุเวลา (walk-in ที่ยังไม่กดเริ่ม) → ยังไม่ถึงคิว ห้ามเดาว่ามาแล้ว', () => {
    const t = getServiceTimeline({
      status: 'PENDING',
      serviceStart: null,
      appointmentStatus: null,
      now: NOW,
    })
    expect(stateOf(t, 'เข้ารับบริการ')).toBe('up')
  })

  it('[blocker] ลูกค้ายืนยันแล้ว → ขั้นสุดท้ายเป็น fin และขั้นกลางต้อง done ตามไปด้วย', () => {
    const t = getServiceTimeline({
      status: 'CONFIRMED',
      serviceStart: '2026-08-20T09:00:00+07:00',
      appointmentStatus: 'SCHEDULED',
      now: NOW,
    })
    expect(stateOf(t, 'ยืนยันแล้ว')).toBe('fin')
    // ยืนยันว่ารับบริการแล้วโดยไม่ผ่านขั้น "เข้ารับบริการ" เป็นไปไม่ได้ในความจริง
    expect(stateOf(t, 'เข้ารับบริการ')).toBe('done')
  })

  it('ยกเลิกแล้ว → ขั้นกลางเป็น "ยกเลิก" ไม่ใช่เดินหน้าต่อ', () => {
    const t = getServiceTimeline({
      status: 'CANCELLED',
      serviceStart: '2026-08-16T09:00:00+07:00',
      appointmentStatus: 'SCHEDULED',
      now: NOW,
    })
    expect(labels(t)).toContain('ยกเลิก')
    expect(stateOf(t, 'ยกเลิก')).toBe('cx')
  })
})
