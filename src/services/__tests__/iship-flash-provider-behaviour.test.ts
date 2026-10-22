/**
 * 00084 T4 — พฤติกรรมของโค้ด iShip เมื่อมีพัสดุ provider=FLASH ปนอยู่ (mock prisma, ไม่แตะฐาน)
 * mutation ที่ต้องแดง: ถอด provider guard ใน createShipment (CS-13) · ถอดการแยกใบ Flash ใน getLabelPdf (CS-15)
 * · ถอดสาขา FLASH ใน toShipmentView (CS-19) · ถอด provider ใน carrierTrackingSettled (CS-26)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    shopShippingAccount: { findUnique: vi.fn(), updateMany: vi.fn() },
    shipmentTracking: { findUnique: vi.fn(async () => null) },
    orderShipment: { findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), update: vi.fn(), count: vi.fn() },
    order: { findFirst: vi.fn(), findFirstOrThrow: vi.fn(), findUniqueOrThrow: vi.fn() },
    $transaction: vi.fn(),
  },
}))
vi.mock('@/lib/token-crypto', () => ({ decryptToken: () => 'tok', encryptToken: (t: string) => t }))
vi.mock('@/lib/iship/client', () => ({ createOrder: vi.fn(), downloadLabel: vi.fn(async () => new ArrayBuffer(4)) }))
vi.mock('@/services/order.service', () => ({
  createOrder: vi.fn(),
  settleCodFromCarrier: vi.fn(),
  syncOrderPaymentToParcel: vi.fn(),
}))
vi.mock('@/services/order-event.service', () => ({ recordOrderEvent: vi.fn() }))

import { prisma } from '@/lib/prisma'
import * as iship from '@/lib/iship/client'
import { createShipment, getLabelPdf, getShipmentPanelOrReason, IShipServiceError } from '@/services/iship.service'
import { carrierTrackingSettled, describeShipmentStatus } from '@/lib/iship/status'
import { orderShippingStage } from '@/lib/chat-order-progress'

const SHOP = 's1'
const ACCOUNT = {
  shopId: SHOP, status: 'ACTIVE', accessTokenEnc: 'enc', createMode: 'OFF',
  senderName: 'ร้าน', senderPhone: '0868860611', senderAddress: '1', senderSubdistrict: 'ก',
  senderDistrict: 'ข', senderProvince: 'ค', senderPostcode: '10290',
  defaultWeight: null, optProductValue: null,
}
const FIXED = { line1: '1', subdistrict: 'ก', district: 'ข', province: 'กรุงเทพมหานคร', postcode: '10110', note: null }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.shopShippingAccount.findUnique).mockResolvedValue(ACCOUNT as never)
  vi.mocked(prisma.order.findFirst).mockResolvedValue({
    id: 'o1', fulfillmentMode: 'SHIPPED', buyerName: 'ก', buyerContact: '0631360508',
    shippingAddress: FIXED, totalAmount: 100, paymentMethod: null, items: [],
  } as never)
})

const flashRow = (over: Record<string, unknown> = {}) => ({
  id: 'f1', orderId: 'o1', status: 'FAILED', source: 'CREATED', provider: 'FLASH',
  courierCode: 'FLASH', courierName: 'Flash Express', trackingNo: null, carrierStatus: null,
  carrierStatusText: null, carrierStatusAt: null, problemAt: null, returnStartedAt: null,
  returnedAt: null, returnDispatchedAt: null, isOverWeight: false, isOverSize: false,
  labelPrintedAt: null, labelPrintCount: 0, isDryRun: false, lastErrorCode: null,
  lastErrorMessage: null, weight: null, width: null, length: null, height: null,
  codAmount: 0, createdAt: new Date(), ...over,
})

describe('createShipment — ใบ Flash ที่ active', () => {
  it('FLASH FAILED ⇒ SHIPMENT_EXISTS ไม่เข้าทาง retry ของ iShip และไม่ยิง iShip', async () => {
    vi.mocked(prisma.orderShipment.findFirst).mockResolvedValue(flashRow() as never)
    await expect(createShipment(SHOP, 'u1', 'o1')).rejects.toMatchObject({
      name: 'IShipServiceError', code: 'SHIPMENT_EXISTS',
    })
    expect(iship.createOrder).not.toHaveBeenCalled()
    expect(prisma.orderShipment.update).not.toHaveBeenCalled()
  })

  it('FLASH NEEDS_REVIEW ⇒ SHIPMENT_EXISTS เช่นกัน', async () => {
    vi.mocked(prisma.orderShipment.findFirst).mockResolvedValue(flashRow({ status: 'NEEDS_REVIEW' }) as never)
    await expect(createShipment(SHOP, 'u1', 'o1')).rejects.toBeInstanceOf(IShipServiceError)
  })
})

describe('getLabelPdf — พิมพ์หลายใบ', () => {
  it('ใบ Flash เข้า skipped ด้วยเหตุผลที่อ่านออก · ใบ iShip ยังพิมพ์ปกติ', async () => {
    vi.mocked(prisma.orderShipment.findMany).mockResolvedValue([
      { id: 'i1', status: 'CREATED', trackingNo: 'TH1', provider: 'ISHIP' },
      { id: 'f1', status: 'CREATED', trackingNo: 'TH2FL', provider: 'FLASH' },
    ] as never)
    const r = await getLabelPdf(SHOP, ['i1', 'f1'])
    expect(r.skipped).toEqual([{ shipmentId: 'f1', reason: 'ใบปะหน้า Flash พิมพ์ได้ทีละใบ' }])
    expect(vi.mocked(iship.downloadLabel).mock.calls[0]![1]).toEqual(['TH1'])
    // ประทับพิมพ์เฉพาะ ISHIP
    expect(vi.mocked(prisma.orderShipment.updateMany).mock.calls[0]![0]!.where).toMatchObject({ provider: 'ISHIP' })
  })

  it('เลือกมีแต่ Flash ⇒ INVALID_STATE ที่ข้อความระบุ Flash ทีละใบ และไม่ต้องมีบัญชี iShip', async () => {
    vi.mocked(prisma.shopShippingAccount.findUnique).mockResolvedValue(null as never)
    vi.mocked(prisma.orderShipment.findMany).mockResolvedValue([
      { id: 'f1', status: 'CREATED', trackingNo: 'TH2FL', provider: 'FLASH' },
    ] as never)
    const err = await getLabelPdf(SHOP, ['f1']).catch((e) => e)
    expect(err).toBeInstanceOf(IShipServiceError)
    expect(err.code).toBe('INVALID_STATE')
    expect(err.userMessage).toContain('Flash')
    expect(iship.downloadLabel).not.toHaveBeenCalled()
  })
})

describe('toShipmentView (ผ่าน getShipmentPanelOrReason)', () => {
  it('ใบ FLASH ที่มี lastErrorCode ของ Flash ⇒ lastErrorMessage เป็นข้อความไทย ไม่ใช่ undefined/null', async () => {
    vi.mocked(prisma.orderShipment.findFirst).mockResolvedValue(
      flashRow({ lastErrorCode: 'DUPLICATE_ORDER', lastErrorMessage: 'raw' }) as never,
    )
    const r = await getShipmentPanelOrReason(SHOP, 'o1')
    if (!('ctx' in r)) throw new Error('expected ctx')
    expect(r.ctx.shipment?.provider).toBe('FLASH')
    expect(typeof r.ctx.shipment?.lastErrorMessage).toBe('string')
    expect(r.ctx.shipment?.lastErrorMessage?.length).toBeGreaterThan(5)
  })
})

describe('carrierTrackingSettled — provider-aware', () => {
  const cod = { carrierStatus: 'delivered', codAmount: 500, codSettledAt: null }
  it('FLASH COD delivered ⇒ จบ (Flash ไม่แจ้ง payment_success)', () => {
    expect(carrierTrackingSettled({ ...cod, provider: 'FLASH' })).toBe(true)
  })
  it('ISHIP เดิม/ไม่ระบุ COD delivered ที่ยังไม่ settle ⇒ ยังไม่จบ', () => {
    expect(carrierTrackingSettled({ ...cod, provider: 'ISHIP' })).toBe(false)
    expect(carrierTrackingSettled(cod)).toBe(false)
  })
  it('FLASH ที่ยังไม่ delivered ⇒ ยังไม่จบ', () => {
    expect(carrierTrackingSettled({ carrierStatus: 'in_transit', provider: 'FLASH' })).toBe(false)
  })
})

describe('NEEDS_REVIEW', () => {
  it('describeShipmentStatus', () => {
    expect(describeShipmentStatus('NEEDS_REVIEW')).toEqual({ text: 'ต้องตรวจสอบพัสดุ', tone: 'warning' })
  })
  it('chat-order-progress: NEEDS_REVIEW เหมือน FAILED (ไม่นับว่ามีพัสดุ)', () => {
    const base = { status: 'CONFIRMED', fulfillmentMode: 'SHIPPED', hasManualTracking: false }
    const sh = (status: string) => ({ status, carrierStatus: 'in_transit', problemAt: null })
    expect(orderShippingStage({ ...base, shipment: sh('NEEDS_REVIEW') }))
      .toBe(orderShippingStage({ ...base, shipment: sh('FAILED') }))
    expect(orderShippingStage({ ...base, shipment: sh('NEEDS_REVIEW') }))
      .not.toBe(orderShippingStage({ ...base, shipment: sh('CREATED') }))
  })
})
