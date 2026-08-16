import { describe, expect, it } from 'vitest'

import {
  MAX_PAYMENT_AMOUNT,
  chatMoneySummary,
  chatOrderActions,
  checkPaymentAmount,
  resolveSlipTarget,
} from '@/lib/chat-order-actions'
import { computeOrderMoney, type PaymentRow } from '@/lib/order-payment'

/**
 * ปุ่มเรื่องเงินในแชท — หัวหน้าสั่งว่า "มี action ให้ admin กดง่ายๆ ที่หน้า chat"
 * ปุ่มที่ควรโผล่แล้วไม่โผล่ = ร้านทำงานไม่ได้ · ปุ่มที่ไม่ควรโผล่แล้วโผล่ = กดผิดแล้วเงินเพี้ยน
 */

const money = (opts: {
  total: number
  deposit?: number | null
  paid?: readonly PaymentRow[]
}) =>
  computeOrderMoney({
    totalAmount: opts.total,
    depositAgreed: opts.deposit ?? null,
    payments: opts.paid ?? [],
  })

const pay = (kind: 'DEPOSIT' | 'BALANCE', amount: number): PaymentRow => ({
  kind,
  amount,
  voidedAt: null,
})

/**
 * `hasAppointment` ตั้งต้นเป็น true — เคสส่วนใหญ่คือใบที่มีนัด
 *
 * 🛑 ห้าม derive จาก `appointmentStatus != null` เป็นอันขาด: ใบ walk-in ที่ร้านเคยกดปิดผลไว้
 * ก็มีสถานะนัดได้ และค่าที่ derive จากกันเองจะทำให้เทสพิสูจน์อะไรไม่ได้เลยตอนตัวใดตัวหนึ่งเพี้ยน
 */
const keys = (ctx: Omit<Parameters<typeof chatOrderActions>[0], 'hasAppointment'> & {
  hasAppointment?: boolean
}) => chatOrderActions({ hasAppointment: true, ...ctx }).map((a) => a.key)

describe('chatOrderActions', () => {
  it('[blocker] ตกลงมัดจำไว้ ยังไม่ได้รับ → เห็นทั้งแจ้งมัดจำ รับเงิน และเข้ารับบริการ', () => {
    const k = keys({
      orderStatus: 'PENDING',
      appointmentStatus: 'SCHEDULED',
      money: money({ total: 1000, deposit: 300 }),
    })
    expect(k).toEqual(['REQUEST_DEPOSIT', 'RECORD_PAYMENT', 'MARK_SERVED'])
  })

  it('[blocker] รับมัดจำแล้ว → ไม่ต้องแจ้งมัดจำซ้ำ แต่ยังรับเงินส่วนที่เหลือได้', () => {
    const k = keys({
      orderStatus: 'PENDING',
      appointmentStatus: 'SCHEDULED',
      money: money({ total: 1000, deposit: 300, paid: [pay('DEPOSIT', 300)] }),
    })
    expect(k).not.toContain('REQUEST_DEPOSIT')
    expect(k).toContain('RECORD_PAYMENT')
  })

  it('[blocker] "รับเงิน" ต้องกดได้ตั้งแต่ก่อนถึงวันนัด', () => {
    /**
     * ลูกค้าโอนมัดจำก่อนวันนัดคือเรื่องปกติที่สุดของร้านจอง — และเป็นเหตุผลทั้งหมด
     * ที่มีคำว่า "มัดจำ" ถ้าปุ่มโผล่เฉพาะตอนถึงวันนัด ฟีเจอร์นี้ไม่มีความหมาย
     */
    expect(
      keys({
        orderStatus: 'PENDING',
        appointmentStatus: 'SCHEDULED',
        money: money({ total: 1000, deposit: 300 }),
      }),
    ).toContain('RECORD_PAYMENT')
  })

  it('[blocker] จ่ายครบแล้ว → ไม่มีปุ่มรับเงิน', () => {
    const k = keys({
      orderStatus: 'PENDING',
      appointmentStatus: 'SCHEDULED',
      money: money({ total: 1000, deposit: 0, paid: [pay('BALANCE', 1000)] }),
    })
    expect(k).not.toContain('RECORD_PAYMENT')
    expect(k).toContain('MARK_SERVED')
  })

  it('[blocker] ยังค้างเงิน แต่ต้องกด "เข้ารับบริการ" ได้ (หัวหน้า: อนุโลมช่วงนี้ก่อน)', () => {
    // ห้ามซ่อนปุ่มเพื่อบังคับให้เก็บเงินก่อน — การเตือนเป็นหน้าที่ของ completionWarning()
    expect(
      keys({
        orderStatus: 'PENDING',
        appointmentStatus: 'SCHEDULED',
        money: money({ total: 1000, deposit: 0 }),
      }),
    ).toContain('MARK_SERVED')
  })

  it('[blocker] ให้บริการจบแล้ว → ไม่มีปุ่มเข้ารับบริการ แต่ยังตามเก็บเงินได้', () => {
    const k = keys({
      orderStatus: 'PENDING',
      appointmentStatus: 'COMPLETED',
      money: money({ total: 1000, deposit: 0, paid: [pay('BALANCE', 400)] }),
    })
    expect(k).not.toContain('MARK_SERVED')
    expect(k).toContain('RECORD_PAYMENT')
  })

  it('[blocker] ไม่มาตามนัด (NO_SHOW) ก็ถือว่าจบแล้ว', () => {
    expect(
      keys({
        orderStatus: 'PENDING',
        appointmentStatus: 'NO_SHOW',
        money: money({ total: 1000, deposit: 0 }),
      }),
    ).not.toContain('MARK_SERVED')
  })

  it('[blocker] ออเดอร์ที่ยกเลิกแล้ว → ไม่มีปุ่มอะไรเลย', () => {
    expect(
      keys({
        orderStatus: 'CANCELLED',
        appointmentStatus: 'SCHEDULED',
        money: money({ total: 1000, deposit: 300 }),
      }),
    ).toEqual([])
  })

  it('[blocker] ปุ่มหลักต้องมีได้ตัวเดียวเสมอ', () => {
    for (const ctx of [
      { orderStatus: 'PENDING', appointmentStatus: 'SCHEDULED', money: money({ total: 1000, deposit: 300 }) },
      { orderStatus: 'PENDING', appointmentStatus: 'SCHEDULED', money: money({ total: 1000, deposit: 0 }) },
      { orderStatus: 'PENDING', appointmentStatus: 'COMPLETED', money: money({ total: 1000, deposit: 0, paid: [pay('BALANCE', 1000)] }) },
    ]) {
      const primaries = chatOrderActions({ hasAppointment: true, ...ctx }).filter((a) => a.primary)
      expect(primaries.length, `ปุ่มหลักต้อง ≤ 1 (${JSON.stringify(ctx.appointmentStatus)})`).toBeLessThanOrEqual(1)
    }
  })

  it('[blocker] walk-in (ไม่มีนัด) ต้องไม่มีปุ่มเข้ารับบริการ — ปลายทาง 404', () => {
    /**
     * 🛑 เทสข้อนี้เคยเขียนกลับด้าน (ยืนยันว่า walk-in "ยังกดเข้ารับบริการได้") และเขียวมาตลอด
     * ทั้งที่ `POST /api/orders/[token]/appointment/outcome` **404 เมื่อใบนั้นไม่มีนัด** —
     * เทสยืนยันได้แค่ว่าโค้ดทำตามที่คนเขียนเทสคิด ไม่ใช่ว่าคนเขียนคิดถูก
     * (บทเรียนเดียวกับ `external-payload-schema.md` และเทส generic-card 2 ข้อเมื่อ 2026-08-09)
     *
     * ยังเก็บเงินได้ตามปกติ — walk-in จ่ายเงินได้ แค่ไม่มีนัดให้ปิดผล (BR-RSV-04)
     */
    const k = keys({
      orderStatus: 'PENDING',
      appointmentStatus: null,
      hasAppointment: false,
      money: money({ total: 500, deposit: 0 }),
    })
    expect(k).not.toContain('MARK_SERVED')
    expect(k).toContain('RECORD_PAYMENT')
  })

  it('[blocker] walk-in ที่ตกลงมัดจำไว้ ต้องไม่มีปุ่มแจ้งมัดจำ — ไม่มีนัดให้สรุปส่ง', () => {
    // การ์ดที่ส่งออกไปคือ "สรุปนัด" ซึ่งใบไม่มีนัดสร้างไม่ได้ (ชีตจะขึ้น error ว่าไม่มีนัด)
    const k = keys({
      orderStatus: 'PENDING',
      appointmentStatus: null,
      hasAppointment: false,
      money: money({ total: 1000, deposit: 300 }),
    })
    expect(k).not.toContain('REQUEST_DEPOSIT')
    // ปุ่มแรกคือ "เริ่มงานเลย" — ใบที่ยังไม่มีเวลาเริ่มยังไม่มีที่ยืนในตารางงานเลย
    expect(k).toEqual(['START_WALK_IN', 'RECORD_PAYMENT'])
  })

  it('[blocker] walk-in ต้องได้ปุ่ม "เริ่มงานเลย" เป็นปุ่มหลัก (BR-SQ-21)', () => {
    /**
     * 🛑 ตราบใดที่ `serviceStart` เป็น null งานใบนั้นหายจากตารางงานทั้งวัน —
     * query กรองด้วย `serviceStart < to AND serviceEnd > from` ซึ่ง null ไม่เข้าเงื่อนไขทั้งคู่
     * ร้านจึงมีงานที่กำลังทำอยู่จริงแต่ตารางบอกว่าวันนี้ว่าง โดยไม่มีอะไรฟ้อง
     */
    const list = chatOrderActions({
      orderStatus: 'PENDING',
      appointmentStatus: null,
      hasAppointment: false,
      money: money({ total: 500 }),
    })
    expect(list[0].key).toBe('START_WALK_IN')
    expect(list[0].primary).toBe(true)
  })

  it('[blocker] ใบที่มีนัดแล้ว ต้องไม่มีปุ่ม "เริ่มงานเลย" — มันมีเวลาเริ่มอยู่แล้ว', () => {
    expect(
      keys({
        orderStatus: 'PENDING',
        appointmentStatus: 'SCHEDULED',
        money: money({ total: 500 }),
      }),
    ).not.toContain('START_WALK_IN')
  })

  it('[blocker] ปิดงานไปแล้ว ต้องไม่มีปุ่ม "เริ่มงานเลย" ให้ย้อนกลับ', () => {
    expect(
      keys({
        orderStatus: 'PENDING',
        appointmentStatus: 'COMPLETED',
        hasAppointment: false,
        money: money({ total: 500 }),
      }),
    ).not.toContain('START_WALK_IN')
  })
})

describe('checkPaymentAmount — เตือน ≠ ห้าม', () => {
  it('[blocker] ยอดไม่เป็นบวก / ไม่ใช่ตัวเลข → บล็อก', () => {
    for (const amount of [0, -1, NaN]) {
      const c = checkPaymentAmount({ amount, kind: 'BALANCE', money: money({ total: 1000 }) })
      expect(c.blocking, `amount=${amount} ต้องบล็อก`).toBe(true)
      expect(c.message).toBeTruthy()
    }
  })

  it('[blocker] เกินเพดานที่ DB รับ → บล็อกตั้งแต่บนจอ ไม่ปล่อยให้ได้ 400 กลับมา', () => {
    const c = checkPaymentAmount({
      amount: MAX_PAYMENT_AMOUNT + 1,
      kind: 'BALANCE',
      money: money({ total: 1000 }),
    })
    expect(c.blocking).toBe(true)
  })

  it('[blocker] จ่ายเกินยอดค้าง → เตือนเฉย ๆ ห้ามบล็อก (ลูกค้าโอนเกิน/ทิป เกิดจริงทุกวัน)', () => {
    const c = checkPaymentAmount({ amount: 1200, kind: 'BALANCE', money: money({ total: 1000 }) })
    expect(c.blocking).toBe(false)
    expect(c.message).toContain('มากกว่ายอดค้าง')
  })

  it('[blocker] มัดจำเกินยอดที่ยังขาด → เตือน ไม่บล็อก', () => {
    const m = money({ total: 1000, deposit: 300, paid: [pay('DEPOSIT', 100)] })
    const c = checkPaymentAmount({ amount: 250, kind: 'DEPOSIT', money: m })
    expect(c.blocking).toBe(false)
    // ที่ยังขาดคือ 200 ไม่ใช่ 300 — ตัวเลขในคำเตือนต้องเป็นยอดที่เหลือจริง
    expect(c.message).toContain('200')
  })

  it('บันทึกเป็นมัดจำทั้งที่บิลไม่ได้ตั้งยอดมัดจำ → บอกให้รู้ตัว แต่ทำได้', () => {
    const c = checkPaymentAmount({ amount: 200, kind: 'DEPOSIT', money: money({ total: 1000 }) })
    expect(c.blocking).toBe(false)
    expect(c.message).toContain('ไม่ได้ตั้งยอดมัดจำ')
  })

  it('ยอดพอดีกับที่ค้าง → ไม่มีอะไรต้องบอก', () => {
    const c = checkPaymentAmount({ amount: 1000, kind: 'BALANCE', money: money({ total: 1000 }) })
    expect(c).toEqual({ blocking: false, message: null })
  })
})

describe('resolveSlipTarget — สลิปที่ลูกค้าส่งมาควรลงบิลไหน', () => {
  const cand = (token: string, outstanding: number, orderStatus = 'PENDING') => ({
    token,
    label: token.toUpperCase(),
    orderStatus,
    money: money({ total: outstanding + 100, paid: [pay('BALANCE', 100)] }),
  })

  it('[blocker] ค้างใบเดียว → ชี้ใบนั้น', () => {
    expect(resolveSlipTarget([cand('a', 500)])?.token).toBe('a')
  })

  it('[blocker] ค้างสองใบ → ต้องคืน null ห้ามเดา (เดาผิด = ผิดพร้อมกันสองใบ)', () => {
    expect(resolveSlipTarget([cand('a', 500), cand('b', 300)])).toBeNull()
  })

  it('[blocker] ไม่มีใบไหนค้าง → null (ปุ่มที่กดแล้วไม่มีอะไรให้ทำ แย่กว่าไม่มีปุ่ม)', () => {
    const paidUp = {
      token: 'a',
      label: 'A',
      orderStatus: 'PENDING',
      money: money({ total: 500, paid: [pay('BALANCE', 500)] }),
    }
    expect(resolveSlipTarget([paidUp])).toBeNull()
  })

  it('[blocker] ใบที่ยกเลิกแล้วไม่นับ → เหลือค้างใบเดียวจริงก็ยังชี้ได้', () => {
    expect(resolveSlipTarget([cand('a', 500), cand('b', 300, 'CANCELLED')])?.token).toBe('a')
  })

  it('ไม่มีออเดอร์เลย → null', () => {
    expect(resolveSlipTarget([])).toBeNull()
  })
})

describe('chatMoneySummary', () => {
  it('[blocker] ยังไม่ได้รับอะไร + มีมัดจำ → บอกว่า "รอมัดจำ" ไม่ใช่ "จ่ายแล้ว"', () => {
    expect(chatMoneySummary(money({ total: 1000, deposit: 300 }))).toContain('รอมัดจำ')
  })

  it('รับบางส่วน → บอกทั้งที่รับแล้วและที่ค้าง', () => {
    const s = chatMoneySummary(money({ total: 1000, deposit: 300, paid: [pay('DEPOSIT', 300)] }))
    expect(s).toContain('300')
    expect(s).toContain('700')
  })

  it('จ่ายครบ → "ชำระครบแล้ว"', () => {
    expect(chatMoneySummary(money({ total: 1000, deposit: 0, paid: [pay('BALANCE', 1000)] }))).toBe(
      'ชำระครบแล้ว',
    )
  })

  it('ไม่มีมัดจำและยังไม่จ่าย → "รอชำระ" ตามยอดค้าง', () => {
    expect(chatMoneySummary(money({ total: 500, deposit: 0 }))).toContain('รอชำระ')
  })
})
