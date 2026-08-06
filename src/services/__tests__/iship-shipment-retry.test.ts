/**
 * iship-shipment-retry.test.ts — "แก้ที่อยู่แล้วกดลองใหม่ ต้องส่งที่อยู่ชุดใหม่จริง ๆ"
 *
 * เคสจริง prod 2026-08-06 (order DP256908869471CB): ร้านแก้ตำบล/อำเภอ/จังหวัดที่สะกดผิด
 * แล้วกดลองใหม่ แต่ `receiverSnapshot` ของใบเดิมไม่เคยถูกอัปเดต ระบบจึงยิงที่อยู่ชุดเก่า
 * ซ้ำแล้วได้ ADDRESS_INVALID เหมือนเดิมทุกครั้ง — ร้านติดลูปแก้เท่าไรก็ไม่มีผล
 *
 * กติกาที่ล็อกไว้: ออเดอร์คือแหล่งความจริงของที่อยู่ (ตามคอมเมนต์ applyReceiverPatch)
 * → การลองใหม่ต้องอ่านที่อยู่จากออเดอร์ใหม่ทุกครั้ง ไม่ใช่เฉพาะตอนมี receiverPatch แนบมา
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    shopShippingAccount: { findUnique: vi.fn(), updateMany: vi.fn() },
    orderShipment: { findFirst: vi.fn(), update: vi.fn(), findUniqueOrThrow: vi.fn() },
    order: { findFirst: vi.fn(), findFirstOrThrow: vi.fn(), findUniqueOrThrow: vi.fn() },
    $transaction: vi.fn(),
  },
}))
vi.mock('@/lib/token-crypto', () => ({
  decryptToken: () => 'token-plain',
  encryptToken: (t: string) => t,
}))
vi.mock('@/lib/iship/client', () => ({ createOrder: vi.fn() }))
vi.mock('@/services/order.service', () => ({
  createOrder: vi.fn(),
  settleCodFromCarrier: vi.fn(),
  syncOrderPaymentToParcel: vi.fn(),
}))
vi.mock('@/services/order-event.service', () => ({ recordOrderEvent: vi.fn() }))

import { prisma } from '@/lib/prisma'
import * as iship from '@/lib/iship/client'
import { createShipment, retryShipment } from '@/services/iship.service'

const SHOP = 'shop-1'
const USER = 'user-1'
const SHIPMENT = 'shipment-1'
const ORDER = 'order-1'

/** ที่อยู่ชุดที่สะกดผิด — ชุดที่ถูก freeze ไว้ตอนเปิดพัสดุครั้งแรกแล้วขนส่งตีกลับ */
const STALE = {
  name: 'ณรงค์ สอนปลอด',
  phone: '0631360508',
  line1: '112 หมู่ 3',
  subdistrict: 'ช้างซาย',
  district: 'กาญจดิษ',
  province: 'สุราษฐานี',
  postcode: '84160',
  note: null,
}

/** ที่อยู่ที่ร้านแก้ให้ถูกแล้วในออเดอร์ */
const FIXED = {
  line1: '112 หมู่ 3',
  subdistrict: 'ช้างซ้าย',
  district: 'กาญจนดิษฐ์',
  province: 'สุราษฎร์ธานี',
  postcode: '84160',
  note: null,
}

const shipmentRow = {
  id: SHIPMENT,
  orderId: ORDER,
  shopId: SHOP,
  status: 'PENDING',
  source: 'CREATED',
  idempotencyKey: `${ORDER}:1`,
  courierCode: 'FlashExpressA',
  courierName: 'Flash Thunder',
  categoryId: 6,
  weight: 4.01,
  width: 42,
  length: 13,
  height: 13,
  codAmount: 720,
  senderSnapshot: {
    name: 'ร้านทดสอบ',
    phone: '0868860611',
    address: '479/234 หมู่ 10',
    subdistrict: 'ในคลองบางปลากด',
    district: 'พระสมุทรเจดีย์',
    province: 'สมุทรปราการ',
    postcode: '10290',
  },
  receiverSnapshot: STALE,
  optionsSnapshot: { onTime: false, boxShield: false, isInsured: false, remark: null },
  isOverWeight: false,
  isOverSize: false,
  labelPrintedAt: null,
  labelPrintCount: 0,
  isDryRun: false,
  lastErrorCode: null,
  carrierStatus: null,
  carrierStatusText: null,
  carrierStatusAt: null,
  createdByUserId: USER,
  createdAt: new Date(),
}

beforeEach(() => {
  vi.clearAllMocks()

  vi.mocked(prisma.shopShippingAccount.findUnique).mockResolvedValue({
    shopId: SHOP,
    status: 'CONNECTED',
    accessTokenEnc: 'enc',
    senderName: 'ร้านทดสอบ',
    senderPhone: '0868860611',
    senderAddress: '479/234 หมู่ 10',
    senderSubdistrict: 'ในคลองบางปลากด',
    senderDistrict: 'พระสมุทรเจดีย์',
    senderProvince: 'สมุทรปราการ',
    senderPostcode: '10290',
    defaultCourierCode: 'FlashExpressA',
    defaultCategoryId: 6,
    defaultWeight: 4.01,
    defaultWidth: 42,
    defaultLength: 13,
    defaultHeight: 13,
    defaultCodEnabled: false,
    defaultRemark: null,
    optOnTime: false,
    optBoxShield: false,
    optIsInsured: false,
    optProductValue: null,
    optServiceType: null,
  } as never)

  // ตัวเดียวกันนี้ตอบทั้ง "ใบที่ยังใช้งานอยู่" ของ createShipment และ "ใบเดิม" ของ retryShipment
  vi.mocked(prisma.orderShipment.findFirst).mockResolvedValue({
    ...shipmentRow,
    status: 'FAILED',
  } as never)

  vi.mocked(prisma.order.findFirstOrThrow).mockResolvedValue({
    buyerName: 'ณรงค์ สอนปลอด',
    buyerContact: '0631360508',
    shippingAddress: FIXED,
  } as never)

  // snapshot ที่ dispatch อ่าน = ค่าล่าสุดที่ถูก update ไป (จำลองพฤติกรรมฐานจริง)
  let current = { ...shipmentRow }
  vi.mocked(prisma.orderShipment.update).mockImplementation((async (args: {
    data: Record<string, unknown>
  }) => {
    current = { ...current, ...args.data }
    return current
  }) as never)
  vi.mocked(prisma.orderShipment.findUniqueOrThrow).mockImplementation(
    (async () => current) as never,
  )

  vi.mocked(prisma.order.findUniqueOrThrow).mockResolvedValue({
    items: [{ name: 'สินค้า', qty: 1, price: 720 }],
  } as never)

  vi.mocked(prisma.$transaction).mockImplementation((async (cb: (tx: unknown) => unknown) =>
    cb({ orderShipment: { update: vi.fn().mockResolvedValue(current) } })) as never)

  vi.mocked(iship.createOrder).mockResolvedValue({
    result: { tracking_number: 'TH123', ref: 'ref-1', id: 1 },
    dryRun: false,
  } as never)
})

describe('retryShipment — ที่อยู่ผู้รับตอนลองใหม่', () => {
  it('ไม่มี receiverPatch แนบมา ก็ต้องอ่านที่อยู่ล่าสุดจากออเดอร์ ไม่ใช่ยิง snapshot ชุดเก่าซ้ำ', async () => {
    await retryShipment(SHOP, USER, SHIPMENT)

    const payload = vi.mocked(iship.createOrder).mock.calls[0]![1]
    // ตำบล → dst_district, อำเภอ → dst_amphure (สลับชื่อโดยเจตนา ดู mapping.ts)
    expect(payload.dst_district).toBe('ช้างซ้าย')
    expect(payload.dst_amphure).toBe('กาญจนดิษฐ์')
    expect(payload.dst_province).toBe('สุราษฎร์ธานี')
  })
})

describe('createShipment — กด "แก้ข้อมูลแล้วลองใหม่" ทับใบที่ล้มอยู่', () => {
  it('ค่าที่ร้านกรอกใหม่ต้องถูกใช้จริง ไม่ถูกทิ้งแล้วยิงค่าชุดเดิมซ้ำ', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue({
      id: ORDER,
      fulfillmentMode: 'SHIPPED',
      buyerName: 'ณรงค์ สอนปลอด',
      buyerContact: '0631360508',
      shippingAddress: FIXED,
      totalAmount: 720,
      items: [{ name: 'สินค้า', qty: 1, price: 720 }],
    } as never)

    await createShipment(SHOP, USER, ORDER, {
      courierCode: 'KerryExpress',
      weight: 2,
      remark: 'ห้ามโยน',
    })

    const payload = vi.mocked(iship.createOrder).mock.calls[0]![1]
    expect(payload.courier_code).toBe('KerryExpress')
    expect(payload.weight).toBe(2)
    expect(payload.remark).toBe('ห้ามโยน')
  })
})
