import { describe, expect, it } from 'vitest'

import { ORDER_STATUS_META, resolveServiceOrderBadge } from '@/lib/order-display'
import { computeOrderMoney, type PaymentRow } from '@/lib/order-payment'
import { readBuyerOrderSource } from '@/lib/__tests__/helpers/buyer-order-sources'

/**
 * ป้ายสถานะของงานร้านบริการ — หัวหน้าอธิบายวงจรไว้ 2 บรรทัด (2026-08-15):
 *   "เมนูรอยืนยัน คือจอง" · "ถ้าเข้ามาหน้าร้านจ่ายเลย ถึงจะเป็นชำระเงินแล้ว"
 *
 * ผิดที่นี่ = ป้ายบนจอโกหกเรื่องเงิน ซึ่งเป็นคำที่ร้านใช้ตัดสินว่าจะทวงใครต่อ
 */
const pay = (kind: 'DEPOSIT' | 'BALANCE', amount: number): PaymentRow => ({ kind, amount, voidedAt: null })
const money = (total: number, paid: PaymentRow[] = []) =>
  computeOrderMoney({ totalAmount: total, depositAgreed: null, payments: paid })

describe('resolveServiceOrderBadge', () => {
  it('[blocker] มีนัด + ยังไม่ได้รับเงินสักบาท → "จอง"', () => {
    const b = resolveServiceOrderBadge({ status: 'PENDING', money: money(1000), hasAppointment: true })
    expect(b.label).toBe('จอง')
    expect(b.tone).toBe('warning')
  })

  it('[blocker] walk-in ที่ยังไม่จ่าย → "รอชำระ" ไม่ใช่ "จอง"', () => {
    /**
     * 🛑 หัวใจของการ derive แทนการเปลี่ยนชื่อสถานะ — บน prod มีงาน walk-in 21 ใบที่ลูกค้า
     * เดินเข้ามาเอง **ไม่ได้จองอะไร** ถ้าเปลี่ยน `ORDER_STATUS_META.PENDING.label` เป็น "จอง"
     * ตรง ๆ ป้ายจะโกหกทั้ง 21 ใบทันที
     */
    const b = resolveServiceOrderBadge({ status: 'PENDING', money: money(1000), hasAppointment: false })
    expect(b.label).toBe('รอชำระ')
  })

  it('[blocker] จ่ายมัดจำแล้วแต่ยังค้าง → "รอชำระ" ไม่ใช่ "จอง"', () => {
    // ขั้นตอนเดินหน้าไปแล้ว — เรียกว่า "จอง" อีกจะอ่านเหมือนยังไม่มีอะไรเกิดขึ้น
    const b = resolveServiceOrderBadge({
      status: 'PENDING',
      money: money(1000, [pay('DEPOSIT', 300)]),
      hasAppointment: true,
    })
    expect(b.label).toBe('รอชำระ')
  })

  it('[blocker] รับครบแล้ว → "ชำระเงินแล้ว" และต้องเป็นเขียว (Verified-Means-Green)', () => {
    const b = resolveServiceOrderBadge({
      status: 'PENDING',
      money: money(1000, [pay('BALANCE', 1000)]),
      hasAppointment: true,
    })
    expect(b.label).toBe('ชำระเงินแล้ว')
    expect(b.tone).toBe('success')
    expect(b.cls).toContain('success')
  })

  it('[blocker] จ่ายเกิน (ทิป/โอนเกิน) ก็ยังเป็น "ชำระเงินแล้ว"', () => {
    const b = resolveServiceOrderBadge({
      status: 'PENDING',
      money: money(1000, [pay('BALANCE', 1200)]),
      hasAppointment: true,
    })
    expect(b.label).toBe('ชำระเงินแล้ว')
  })

  it('[blocker] ยกเลิกแล้ว → ป้าย "ยกเลิก" เสมอ เรื่องเงินห้ามทับ', () => {
    /**
     * ใบที่ยกเลิกแต่เคยรับเงินไว้ ต้องไม่ขึ้น "ชำระเงินแล้ว" — คนอ่านจะเข้าใจว่างานยังเดินอยู่
     * (การคืนเงินเป็นคนละเรื่องที่ระบบยังไม่ทำ ยิ่งห้ามพูดเกินจริง)
     */
    const b = resolveServiceOrderBadge({
      status: 'CANCELLED',
      money: money(1000, [pay('BALANCE', 1000)]),
      hasAppointment: true,
    })
    expect(b).toEqual(ORDER_STATUS_META.CANCELLED)
  })

  it('[blocker] บิลยอด 0 (ยังไม่ใส่รายการ) → ห้ามขึ้น "ชำระเงินแล้ว"', () => {
    /**
     * `outstanding` ของบิลยอด 0 เป็น 0 อยู่แล้ว — ถ้าไม่ดักไว้ ป้ายจะอ้างว่ามีธุรกรรมเกิดขึ้น
     * ทั้งที่ยังไม่มีอะไรเลย (คลาสเดียวกับ `0` ที่ถูกใช้แทน "ไม่รู้")
     */
    const b = resolveServiceOrderBadge({ status: 'PENDING', money: money(0), hasAppointment: true })
    expect(b.label).not.toBe('ชำระเงินแล้ว')
    expect(b).toEqual(ORDER_STATUS_META.PENDING)
  })

  it('สถานะที่ไม่รู้จัก → ตกกลับไปป้าย PENDING ไม่พังทั้งจอ', () => {
    const b = resolveServiceOrderBadge({ status: 'WEIRD', money: money(0), hasAppointment: false })
    expect(b).toEqual(ORDER_STATUS_META.PENDING)
  })
})

describe('ต่อสายจริง — ป้ายต้องเปลี่ยนเฉพาะร้านบริการ', () => {
  const read = (rel: string) =>
    require('node:fs')
      .readFileSync(require('node:path').join(process.cwd(), rel), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1') as string

  it('[blocker] ทั้ง 2 หน้าออเดอร์ต้องส่งป้ายผ่านตัวแปรที่เป็น null เมื่อไม่ใช่ร้านบริการ', () => {
    /**
     * 🛑 ตัวกั้นคือ `orderMoney`/`order.money` ซึ่ง page.tsx ตั้งเป็น null ให้ vertical อื่น
     * แล้ว ⇒ ป้ายเดิมไม่ขยับแม้แต่ตัวอักษรเดียว · ถ้าจอไหนเรียก `resolveServiceOrderBadge()`
     * โดยไม่ผ่านตัวกั้นนี้ ร้านขายออนไลน์จะได้ป้าย "รอชำระ" ทันทีทั้งระบบ
     */
    // 00073: หน้าร้านใช้ป้ายชุดเดียว (resolveServiceStatusBadge) ผ่าน `serviceJob` ซึ่งเป็น null เมื่อ serviceMoney เป็น null
    // (serviceMoney กั้นด้วย vertical ที่จุดคำนวณ) ⇒ ร้านอื่นได้ serviceBadge = null = ป้ายเดิม
    const seller = read('src/app/(paces)/seller/(dashboard)/orders/[token]/page.tsx')
    expect(seller).toMatch(/if \(shop\.vertical !== 'SERVICE_QUEUE'\) return null/)
    expect(seller).toMatch(/const serviceJob = serviceMoney\s*\n?\s*\?/)
    expect(seller).toMatch(/serviceBadge=\{serviceJob\?\.badge \?\? null\}/)

    const buyer = readBuyerOrderSource().replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
    // 00073: ร้านบริการได้ป้ายชุดเดียวคำฝั่งลูกค้าจาก server (order.serviceStatus — null เมื่อไม่ใช่ร้านบริการ)
    expect(buyer).toMatch(/order\.serviceStatus\s*\n?\s*\?\s*order\.serviceStatus/)
    expect(buyer).toMatch(/order\.money\s*\n?\s*\?\s*resolveServiceOrderBadge\(/)
    expect(buyer, 'ไม่ใช่ร้านบริการต้องตกไปใช้ป้ายเดิม').toMatch(
      /:\s*resolveOrderStatusBadge\(order\.status\)/,
    )
  })

  it('[blocker] การ์ดสรุปออเดอร์ต้องรับ "ผลลัพธ์" ไม่ใช่ money ดิบ', () => {
    /**
     * `OrderSummary` ใช้ร่วมทุก vertical — ถ้าให้มันตัดสินเองว่าใบไหนเป็นร้านบริการ
     * จะกลายเป็นด่าน vertical ตัวที่สองที่ต้องดูแลคู่กันไปตลอด แล้ววันหนึ่งสองตัวจะไม่ตรงกัน
     */
    const summary = read('src/app/(paces)/seller/(dashboard)/orders/[token]/components/OrderSummary.tsx')
    expect(summary, 'ต้องรับ serviceBadge สำเร็จรูป').toMatch(/serviceBadge\?:/)
    expect(summary, 'ห้ามคำนวณเองในการ์ด').not.toContain('resolveServiceOrderBadge')
    expect(summary, 'ต้องตกกลับป้ายเดิมเมื่อไม่ได้รับ').toMatch(
      /serviceBadge \?\? resolveOrderStatusBadge\(/,
    )
  })
})
