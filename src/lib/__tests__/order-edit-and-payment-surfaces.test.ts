import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { canEditOrder } from '@/lib/order-display'
import { chatOrderActions } from '@/lib/chat-order-actions'
import { computeOrderMoney } from '@/lib/order-payment'

const ROOT = process.cwd()
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

/** ตัดคอมเมนต์ทั้งบล็อกและบรรทัดเดียวออก — ด่านต้องดู *โค้ด* ไม่ใช่คำอธิบาย */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/**
 * ด่านของบทเรียน 2026-08-31 — "ทางเข้า 2 ทางทำได้ไม่เท่ากัน"
 *
 * หัวหน้าถามว่าเปิดงานจากแชทกับจากปฏิทิน ข้างในทำได้เหมือนกันไหม ไล่โค้ดแล้วเจอ 2 เรื่อง:
 *   1. ปุ่ม "รับเงินแล้ว" มีที่แชทที่เดียว และแชทหาบิลด้วย `customerId` ที่ derive จากเบอร์โทร
 *      ⇒ บิลที่เปิดจากปฏิทินโดยไม่กรอกเบอร์ **บันทึกรับเงินไม่ได้เลย** (ไม่มีจอไหนมีปุ่ม)
 *   2. เกณฑ์ "แก้บิลได้เฉพาะ PENDING" เขียนกระจาย 3 ที่ แล้วที่ที่ 4 ลืม
 */
describe('[blocker] แก้บิล — เกณฑ์เดียวทุกจอ', () => {
  it('`canEditOrder` = PENDING เท่านั้น (ตรงกับด่านฝั่ง server)', () => {
    expect(canEditOrder('PENDING')).toBe(true)
    for (const s of ['SHIPPED', 'CONFIRMED', 'CANCELLED', 'RETURNED', '']) {
      expect(canEditOrder(s), `${s} ต้องแก้ไม่ได้`).toBe(false)
    }
  })

  it('🛑 ด่านฝั่ง server ยังอยู่ — UI ที่ซ่อนปุ่มไม่ใช่ด่านความปลอดภัย', () => {
    const svc = read('src/services/order.service.ts')
    expect(svc, '`updateOrder` ต้องยัง throw เมื่อไม่ใช่ PENDING').toMatch(
      /if \(existing\.status !== "PENDING"\) throw new OrderNotEditableError\(\)/,
    )
  })

  it('🛑 ทุกจอที่มีปุ่มแก้บิลต้องเรียก `canEditOrder` — ห้ามเขียนเงื่อนไขเอง', () => {
    /* จุดที่ 4 (`OrderProgressBar`) คือจุดที่ลืมมาตลอด: แถวนั้นเลือกใบด้วย *แกนนัด*
       (`filterActiveServiceOrders`) ไม่ใช่ `Order.status` ⇒ ใบ CONFIRMED ที่ยังไม่ปิดผลนัด
       ยังอยู่ในแถวและเคยเห็นปุ่มแก้ไข กดแล้วเจอ 400 ตอนกดบันทึก */
    const SURFACES = [
      'src/app/(paces)/seller/(dashboard)/orders/components/OrderActions.tsx',
      'src/app/(paces)/seller/(dashboard)/orders/components/OrderCardMenu.tsx',
      'src/app/(paces)/seller/(chat)/_components/OrderCardView.tsx',
      'src/app/(paces)/seller/(chat)/inbox/[conversationId]/components/OrderProgressBar.tsx',
    ]
    for (const rel of SURFACES) {
      const src = read(rel)
      expect(src, `${rel} ต้อง import canEditOrder`).toMatch(/canEditOrder/)
      /* ห้ามให้ `canEdit` มาจากการเทียบสถานะดิบ — ตรวจเฉพาะตัวแปรนี้
         (`canCancel = PENDING || SHIPPED` เป็นกฎคนละตัว ไม่เกี่ยวกัน ห้ามเหมารวม) */
      const raw = stripComments(src)
        .split('\n')
        .filter((l) => /canEdit[^=]*=[^=]*status\s*===\s*['"]PENDING['"]/.test(l))
      expect(raw, `${rel} ยังเขียนเงื่อนไข PENDING เอง:\n${raw.join('\n')}`).toEqual([])
    }

    /* 🛑 แถบในแชทต้อง **เรียกใช้จริง** ไม่ใช่แค่ import ทิ้งไว้ — จุดนี้คือจุดที่เคยลืม
       (import อย่างเดียวผ่านด่านข้างบนได้ ซึ่งจะทำให้ด่านนี้ไร้ความหมายทันที) */
    const bar = stripComments(
      read('src/app/(paces)/seller/(chat)/inbox/[conversationId]/components/OrderProgressBar.tsx'),
    )
    expect(bar, 'ปุ่ม "แก้ไขรายการ" ต้องอยู่ใต้ canEditOrder(o.status)').toMatch(
      /canEditOrder\(o\.status\)\s*&&/,
    )
  })
})

describe('[blocker] รับเงิน — ต้องกดได้นอกแชทด้วย', () => {
  const money = (args: { total: number; deposit?: number | null; received?: number }) =>
    computeOrderMoney({
      totalAmount: args.total,
      depositAgreed: args.deposit ?? null,
      payments: args.received
        ? [{ kind: 'BALANCE' as const, amount: args.received, voidedAt: null }]
        : [],
    })

  it('บิลที่ยังไม่ตั้งมัดจำและยังไม่รับเงินเลย ต้องมีปุ่ม "รับเงินแล้ว"', () => {
    /* 🛑 เคสนี้คือเคสที่พังจริง: `hasMoneyStory()` เป็น false (ไม่มีมัดจำ + ยังไม่รับเงิน)
       ⇒ การ์ด "เงินที่รับแล้ว" ไม่ขึ้นบนหน้าออเดอร์ ถ้าผูกปุ่มไว้กับการ์ดนั้น ปุ่มจะหายไป
       ในกรณีที่มันมีประโยชน์ที่สุดพอดี — วัดจริงบนจอแล้ว 2026-08-31 (ออเดอร์ ฿2,500) */
    const acts = chatOrderActions({
      orderStatus: 'CONFIRMED',
      appointmentStatus: null,
      hasAppointment: false,
      money: money({ total: 2500 }),
    })
    expect(acts.map((a) => a.key)).toContain('RECORD_PAYMENT')
  })

  it('บิลที่จ่ายครบแล้ว ไม่มีปุ่ม (ปุ่มที่กดแล้วไม่มีอะไรให้ทำ แย่กว่าไม่มีปุ่ม)', () => {
    const acts = chatOrderActions({
      orderStatus: 'CONFIRMED',
      appointmentStatus: 'COMPLETED',
      hasAppointment: true,
      money: money({ total: 2500, received: 2500 }),
    })
    expect(acts.map((a) => a.key)).not.toContain('RECORD_PAYMENT')
  })

  it('🛑 หน้าออเดอร์ต้องต่อสายปุ่มนี้จริง — ไม่ใช่แค่ import ทิ้งไว้', () => {
    const client = read(
      'src/app/(paces)/seller/(dashboard)/orders/[token]/components/OrderDetailClient.tsx',
    )
    expect(client, 'ต้องตัดสินจาก chatOrderActions ไม่ใช่เขียนเงื่อนไขเงินเอง').toMatch(
      /chatOrderActions\(/,
    )
    expect(client, "ต้องหยิบเฉพาะ RECORD_PAYMENT").toMatch(/'RECORD_PAYMENT'/)
    expect(client, 'ต้องมี case ใน handleAction').toMatch(/case 'record-payment'/)
    expect(client, 'ต้อง render ชีตตัวเดียวกับแชท').toMatch(/<RecordPaymentSheet/)
  })

  it('🛑 ชุดเงินที่ป้อนปุ่มต้อง **ไม่** ผ่าน hasMoneyStory — ไม่งั้นรูเดิมกลับมา', () => {
    const page = read('src/app/(paces)/seller/(dashboard)/orders/[token]/page.tsx')
    /* `serviceMoney` = กั้นด้วย vertical อย่างเดียว · `orderMoney` = กั้นเพิ่มด้วย hasMoneyStory
       ปุ่มต้องกินตัวแรก การ์ดกินตัวหลัง */
    expect(page).toMatch(/serviceMoney=\{serviceMoney\}/)
    expect(page, 'orderMoney ต้องยังกั้นด้วย hasMoneyStory (การ์ดไม่โผล่บนจอที่ไม่ได้ขอ)').toMatch(
      /!m \|\| !hasMoneyStory\(m\)/,
    )
  })

  it('เฉพาะร้านคิวงาน — ร้านขายออนไลน์ต้องไม่มีปุ่มนี้ (AC-SQ-07)', () => {
    const page = read('src/app/(paces)/seller/(dashboard)/orders/[token]/page.tsx')
    expect(page).toMatch(/if \(shop\.vertical !== 'SERVICE_QUEUE'\) return null/)
  })

  it('🛑 "เริ่มงานเลย" ยังอยู่ในแชทเท่านั้น (หัวหน้าสั่ง 2026-08-31)', () => {
    const client = read(
      'src/app/(paces)/seller/(dashboard)/orders/[token]/components/OrderDetailClient.tsx',
    )
    /* ตัดคอมเมนต์ก่อนเทียบ — ไฟล์นั้น *อธิบายไว้* ว่าทำไมถึงไม่เอา `START_WALK_IN`
       ซึ่งเป็นเหตุผลที่ต้องเก็บไว้ให้คนอ่าน ไม่ใช่ของหลุด (บทเรียนเดิม: ด่านที่จับคอมเมนต์
       บังคับให้คนเลือกระหว่าง "ลบเหตุผลทิ้ง" กับ "ปิดด่าน" ซึ่งแย่ทั้งคู่) */
    const code = stripComments(client)
    expect(code, 'หน้าออเดอร์ต้องไม่เรียกใช้ START_WALK_IN จริง').not.toMatch(/START_WALK_IN/)
    expect(code).not.toMatch(/StartWalkInSheet/)
  })
})
