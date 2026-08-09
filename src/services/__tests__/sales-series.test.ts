/**
 * sales-series.test.ts — unit tests สำหรับ getSalesSeries (Sales Chart, command center)
 *
 * mock prisma.order.findMany (test env ไม่มี DB จริง). ครอบ:
 * - daily: bucket ต่อวัน (tz ไทย), exclude CANCELLED, total, prevTotal (เดือนก่อน)
 * - monthly: 12 bucket, labels เดือนไทย
 * - Decimal totalAmount → number
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    order: { findMany: vi.fn() },
    // includeFinance=true เท่านั้นที่แตะตารางนี้ — เทสชุด COGS ด้านล่างต้องมีให้ mock
    expense: { findMany: vi.fn() },
  },
}))

import { prisma } from '@/lib/prisma'
import { getSalesSeries } from '@/services/dashboard.service'

const findMany = vi.mocked(prisma.order.findMany)

// helper: UTC instant ที่ตรงกับเวลาไทย (Asia/Bangkok = UTC+7) เที่ยงวัน → หนีขอบวัน
// เวลาไทย y-m-d 12:00 = UTC 05:00 วันเดียวกัน
const thaiNoon = (y: number, m1: number, d: number) => new Date(Date.UTC(y, m1 - 1, d, 5, 0, 0))

beforeEach(() => findMany.mockReset())

describe('getSalesSeries — daily', () => {
  it('bucket ต่อวัน, exclude CANCELLED, total + prevTotal ถูก', async () => {
    // period = มีนาคม 2026 (31 วัน). row ที่ query คืน = ทั้งช่วง prevGte..lt (ก.พ.+มี.ค.)
    findMany.mockResolvedValue([
      { totalAmount: 100, createdAt: thaiNoon(2026, 3, 5) },
      { totalAmount: 200, createdAt: thaiNoon(2026, 3, 5) }, // วันเดียวกัน → รวม 300
      { totalAmount: 50, createdAt: thaiNoon(2026, 3, 10) },
      { totalAmount: 70, createdAt: thaiNoon(2026, 2, 15) }, // เดือนก่อน → prevTotal
    ] as never)

    const res = await getSalesSeries('shop1', 'daily', { year: 2026, month: 3 })

    expect(res.labels).toHaveLength(31)
    expect(res.labels[0]).toBe('1')
    expect(res.labels[30]).toBe('31')
    expect(res.values[4]).toBe(300) // วันที่ 5 (index 4)
    expect(res.values[9]).toBe(50) // วันที่ 10 (index 9)
    expect(res.total).toBe(350)
    expect(res.prevTotal).toBe(70)
    // มีนาคม 2026 เป็นอดีต (now > period) → ไม่มีแท่งอนาคต
    expect(res.futureFromIndex).toBe(31)
  })

  it('CANCELLED ไม่ถูกนับ (where filter) + query ใช้ status not CANCELLED', async () => {
    findMany.mockResolvedValue([{ totalAmount: 100, createdAt: thaiNoon(2026, 3, 2) }] as never)
    const res = await getSalesSeries('shop1', 'daily', { year: 2026, month: 3 })
    expect(res.total).toBe(100)
    // ยืนยัน where ส่ง status != CANCELLED + shopId
    const arg = findMany.mock.calls[0][0] as { where: Record<string, unknown> }
    expect(arg.where.shopId).toBe('shop1')
    expect(arg.where.status).toEqual({ not: 'CANCELLED' })
  })
})

/**
 * คอลัมน์ "รอเงิน COD" ในชีตยอดขาย (user สั่ง 2026-08-07) — นิยามต้องเป็นตัวเดียวกับไทล์หน้าแรก
 * คือ deriveShippingStage(...) === 'AWAITING_COD': ของถึงปลายทางแล้ว + เป็นการเก็บเงินปลายทาง
 * + ร้านยังไม่กดว่าได้รับเงิน. ถ้าใครแก้ให้ "ทุกใบ COD ที่ยังไม่ได้เงิน" เทสชุดนี้ต้องแดง
 */
describe('getSalesSeries — รอเงิน COD ต่อวัน', () => {
  const activeShipment = (carrierStatus: string) => [
    { status: 'CREATED', isDryRun: false, carrierStatus, createdAt: thaiNoon(2026, 3, 5) },
  ]

  it('ใบ COD ที่ส่งถึงแล้วแต่ร้านยังไม่กดรับเงิน → เข้า codPendingValues ของวันนั้น', async () => {
    findMany.mockResolvedValue([
      {
        totalAmount: 900,
        createdAt: thaiNoon(2026, 3, 5),
        status: 'SHIPPED',
        paymentMethod: 'COD',
        codReceivedAt: null,
        shipments: activeShipment('delivered'),
      },
    ] as never)

    const res = await getSalesSeries('shop1', 'daily', { year: 2026, month: 3 })

    expect(res.codPendingValues[4]).toBe(900) // วันที่ 5 (index 4)
    // ยังนับเป็นยอดขายของวันเดิมด้วย — คอลัมน์นี้เป็นส่วนย่อยของยอดขาย ไม่ใช่ก้อนใหม่
    expect(res.values[4]).toBe(900)
  })

  it('กดรับเงินแล้ว / ไม่ใช่ COD / ของยังไม่ถึง → ไม่นับ', async () => {
    findMany.mockResolvedValue([
      {
        totalAmount: 100,
        createdAt: thaiNoon(2026, 3, 5),
        status: 'SHIPPED',
        paymentMethod: 'COD',
        codReceivedAt: thaiNoon(2026, 3, 6), // ร้านกดรับเงินแล้ว
        shipments: activeShipment('delivered'),
      },
      {
        totalAmount: 200,
        createdAt: thaiNoon(2026, 3, 5),
        status: 'SHIPPED',
        paymentMethod: 'โอนเงิน',
        codReceivedAt: null,
        shipments: activeShipment('delivered'),
      },
      {
        totalAmount: 300,
        createdAt: thaiNoon(2026, 3, 5),
        status: 'SHIPPED',
        paymentMethod: 'COD',
        codReceivedAt: null,
        shipments: activeShipment('in_transit'), // ยังไม่ถึงปลายทาง
      },
    ] as never)

    const res = await getSalesSeries('shop1', 'daily', { year: 2026, month: 3 })

    expect(res.codPendingValues[4]).toBe(0)
  })

  it('พัสดุทดสอบ (isDryRun) ไม่ทำให้ใบนั้นถูกนับเป็นรอเงิน COD', async () => {
    findMany.mockResolvedValue([
      {
        totalAmount: 400,
        createdAt: thaiNoon(2026, 3, 7),
        status: 'SHIPPED',
        paymentMethod: 'เก็บเงินปลายทาง',
        codReceivedAt: null,
        shipments: [
          { status: 'CREATED', isDryRun: true, carrierStatus: 'delivered', createdAt: thaiNoon(2026, 3, 7) },
        ],
      },
    ] as never)

    const res = await getSalesSeries('shop1', 'daily', { year: 2026, month: 3 })

    // ไม่มีพัสดุ active → status SHIPPED = "กำลังจัดส่ง" ไม่ใช่ "รอเงิน COD"
    expect(res.codPendingValues[6]).toBe(0)
  })
})

describe('getSalesSeries — ต้นทุนสินค้า (COGS) สองชุด', () => {
  const expenseFindMany = vi.mocked(prisma.expense.findMany)
  beforeEach(() => {
    expenseFindMany.mockReset()
    expenseFindMany.mockResolvedValue([] as never)
  })

  /**
   * [blocker] ห้าม merge ถ้าแดง — นี่คือกฎที่ทำให้หน้า "ยอดขายและกำไร" ลบกันลงตัวบนหน้าจอ
   *
   * `cogsValues` ต้องนับต้นทุนของ **ทุกใบ** เพื่อให้คู่กับ `values` (ยอดขาย ซึ่งรวมใบรอยืนยัน)
   * ส่วน `cogsConfirmedValues` นับเฉพาะใบที่เป็นรายได้แล้ว เพื่อให้คู่กับ `confirmedValues` (สูตร P&L)
   * ถ้าใครยุบสองอันนี้เป็นก้อนเดียว คอลัมน์ "ต้นทุนสินค้า" บนชีตจะว่างในวันที่ยังไม่มีใครยืนยัน
   * ทั้งที่คอลัมน์ "ยอดขาย" บรรทัดเดียวกันมีตัวเลข → กำไรของแถวนั้นสูงเกินจริงแบบเงียบ ๆ
   */
  it('[blocker] cogsValues นับทุกใบ · cogsConfirmedValues นับเฉพาะใบที่เป็นรายได้แล้ว', async () => {
    findMany.mockResolvedValue([
      {
        totalAmount: 1000,
        createdAt: thaiNoon(2026, 3, 5),
        status: 'CONFIRMED',
        shipments: [],
        items: [{ cost: 200, qty: 2 }], // 400
      },
      {
        totalAmount: 500,
        createdAt: thaiNoon(2026, 3, 5),
        status: 'PENDING', // ยังไม่นับเป็นรายได้ แต่ยอด 500 อยู่ใน values แล้ว
        shipments: [],
        items: [{ cost: 150, qty: 1 }], // 150
      },
    ] as never)

    const res = await getSalesSeries('shop1', 'daily', { year: 2026, month: 3 }, true)

    expect(res.values[4]).toBe(1500)
    expect(res.confirmedValues[4]).toBe(1000)
    expect(res.cogsValues?.[4]).toBe(550) // 400 + 150 — ทุกใบ
    expect(res.cogsConfirmedValues?.[4]).toBe(400) // เฉพาะใบที่ยืนยันแล้ว
    expect(res.totalCogs).toBe(550)
    // netProfit ต้องยังเป็นสูตรการ์ด P&L: ยืนยันแล้ว − ต้นทุน(เฉพาะใบยืนยัน) − ค่าใช้จ่าย
    expect(res.netProfitValues?.[4]).toBe(600)
  })

  /** cost = null คือ "ยังไม่ตั้งต้นทุน" ไม่ใช่ต้นทุน 0 — ต้องข้าม ไม่ใช่บวก 0 แล้วทำเป็นว่ารู้แล้ว */
  it('[blocker] บรรทัดที่ยังไม่ตั้งต้นทุน (cost = null) ถูกข้าม ไม่นับเป็น 0', async () => {
    findMany.mockResolvedValue([
      {
        totalAmount: 800,
        createdAt: thaiNoon(2026, 3, 9),
        status: 'CONFIRMED',
        shipments: [],
        items: [{ cost: null, qty: 3 }, { cost: 100, qty: 1 }],
      },
    ] as never)

    const res = await getSalesSeries('shop1', 'daily', { year: 2026, month: 3 }, true)

    expect(res.cogsValues?.[8]).toBe(100)
  })

  /** ไม่ผ่าน gate สิทธิ์ → ต้องไม่มีฟิลด์การเงินเลย (UI ซ่อนทั้งบล็อก ไม่ใช่โชว์ 0) */
  it('includeFinance=false → ไม่มี cogsValues/totalCogs ใน response', async () => {
    findMany.mockResolvedValue([
      { totalAmount: 800, createdAt: thaiNoon(2026, 3, 9), status: 'CONFIRMED', shipments: [] },
    ] as never)

    const res = await getSalesSeries('shop1', 'daily', { year: 2026, month: 3 })

    expect(res.cogsValues).toBeUndefined()
    expect(res.totalCogs).toBeUndefined()
  })
})

describe('getSalesSeries — monthly', () => {
  it('12 bucket, labels เดือนไทย, bucket ตามเดือน', async () => {
    findMany.mockResolvedValue([
      { totalAmount: 500, createdAt: thaiNoon(2026, 1, 20) }, // ม.ค.
      { totalAmount: 300, createdAt: thaiNoon(2026, 7, 3) }, // ก.ค.
      { totalAmount: 250, createdAt: thaiNoon(2025, 11, 9) }, // ปีก่อน → prevTotal
    ] as never)

    const res = await getSalesSeries('shop1', 'monthly', { year: 2026 })

    expect(res.labels).toHaveLength(12)
    expect(res.labels[0]).toBe('ม.ค.')
    expect(res.labels[11]).toBe('ธ.ค.')
    expect(res.values[0]).toBe(500) // ม.ค.
    expect(res.values[6]).toBe(300) // ก.ค.
    expect(res.total).toBe(800)
    expect(res.prevTotal).toBe(250)
  })
})
