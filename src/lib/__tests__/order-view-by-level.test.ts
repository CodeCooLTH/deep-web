/**
 * order-view-by-level — allow-list ของออเดอร์ระดับเงิน NONE (ช่าง) · 00071 P3 · S-15
 *
 * เทสแกนกลาง: คีย์ที่ปล่อยผ่านทั้งหมดต้องไม่ชนกับรายการคีย์เงินต้องห้าม · คอลัมน์ใหม่ที่ไม่รู้จักต้องหายไปเอง
 * mutation ที่ต้องแดง: (1) เติม 'totalAmount' ลง NO_MONEY_ORDER_KEYS (2) เปลี่ยน pick ให้ copy ทั้ง object
 */
import { describe, it, expect } from 'vitest'
import {
  NO_MONEY_FORBIDDEN_KEYS,
  NO_MONEY_ITEM_KEYS,
  NO_MONEY_ORDER_KEYS,
  NO_MONEY_SHIPMENT_KEYS,
  filterOrderEventsForNoMoney,
  toNoMoneyAppointmentDay,
  toNoMoneyOrder,
} from '../order-view-by-level'
import type { OrderEventView } from '../order-event'

/** ไล่คีย์ทุกชั้น (array/object ซ้อน) — ใช้ซ้ำในเทส route/page ผ่าน import ไม่ได้จึงเขียนสั้น ๆ ซ้ำที่นี่ */
function allKeys(v: unknown, out: string[] = []): string[] {
  if (Array.isArray(v)) v.forEach((x) => allKeys(x, out))
  else if (v && typeof v === 'object' && !(v instanceof Date)) {
    for (const [k, x] of Object.entries(v)) {
      out.push(k)
      allKeys(x, out)
    }
  }
  return out
}

const RICH = {
  id: 'o1', publicToken: 'tok', orderNo: 'DP1', status: 'PENDING', type: 'SERVICE', createdAt: new Date(),
  buyerName: 'สมชาย', buyerContact: '0812345678', internalNote: 'หมายเหตุ',
  serviceStart: new Date(), serviceEnd: new Date(), appointmentStatus: 'SCHEDULED',
  totalAmount: '900', discount: '10', vatRate: '0.07', vatAmount: '5', depositAmount: '300', draftStatedTotalAmount: '900',
  paymentMethod: 'COD', paymentConfirmedAt: new Date(), codReceivedAt: null, slipFileId: 'f1',
  brandNewMoneyColumn: '12', // คอลัมน์ที่ใครเติมใน schema ทีหลัง — ต้องไม่รั่ว
  items: [{ id: 'i1', name: 'ตัดผม', qty: 1, description: null, price: '900', cost: '100', product: { images: ['a'], cost: '5', price: '9' } }],
  payments: [{ kind: 'DEPOSIT', amount: '300' }],
  shipments: [{ id: 's1', trackingNo: 'T', status: 'CREATED', carrierPrice: '40', estimatedPrice: '40', codFee: '5', codAmount: '900' }],
  shipmentTracking: { trackingNo: 'T', provider: 'x', createdAt: new Date(), orderId: 'o1' },
  serviceResource: { id: 'r', name: 'ช่าง A', capacity: 1, depositDefault: '300' },
  shopChannel: { avatarUrl: null, provider: 'LINE', name: 'เพจ', accessTokenEnc: 'secret' },
  buyer: { id: 'u', displayName: 'n', username: 'un', avatar: null, phone: '0899' },
}

describe('allow-list ไม่ชนคีย์เงิน', () => {
  it('ทุกคีย์ที่ปล่อยผ่านไม่อยู่ในรายการต้องห้าม (เติมคีย์เงินลง allow-list = แดง)', () => {
    const allowed = [...NO_MONEY_ORDER_KEYS, ...NO_MONEY_ITEM_KEYS, ...NO_MONEY_SHIPMENT_KEYS]
    expect(allowed.filter((k) => NO_MONEY_FORBIDDEN_KEYS.includes(k))).toEqual([])
  })
})

describe('toNoMoneyOrder', () => {
  const out = toNoMoneyOrder(RICH)

  it('ไม่มีคีย์เงินสักตัวที่ความลึกใดก็ตาม', () => {
    expect(allKeys(out).filter((k) => NO_MONEY_FORBIDDEN_KEYS.includes(k))).toEqual([])
  })

  it('คอลัมน์ใหม่ที่ไม่รู้จัก + คีย์ลับของลูก (accessTokenEnc/phone/depositDefault) หายไปเอง', () => {
    const keys = allKeys(out)
    for (const k of ['brandNewMoneyColumn', 'accessTokenEnc', 'phone', 'depositDefault', 'orderId']) expect(keys).not.toContain(k)
  })

  it('คงของที่งานช่างต้องใช้: ชื่อ/เบอร์/นัด/รายการ(ชื่อ×จำนวน)/หมายเหตุภายใน', () => {
    expect(out).toMatchObject({
      buyerName: 'สมชาย', buyerContact: '0812345678', internalNote: 'หมายเหตุ', appointmentStatus: 'SCHEDULED',
      items: [{ name: 'ตัดผม', qty: 1, product: { images: ['a'] } }],
      serviceResource: { name: 'ช่าง A' },
    })
  })

  it('ตัดด้วย "ไม่มีคีย์" ไม่ใช่ null — คีย์ที่ต้นทางไม่มีก็ไม่ถูกสร้าง, null ต้นทางคง null', () => {
    const o = toNoMoneyOrder({ publicToken: 't', internalNote: null })
    expect(Object.keys(o).sort()).toEqual(['internalNote', 'publicToken'])
    expect(o.internalNote).toBeNull()
  })
})

describe('toNoMoneyAppointmentDay', () => {
  const row = { orderToken: 't', buyerName: 'a', totalAmount: '900', depositAmount: '300', conversationId: 'c1' }
  it('ตัดยอด/มัดจำ · ไม่มี H1 → conversationId เป็น null', () => {
    const r = toNoMoneyAppointmentDay(row, { canChat: false })
    expect(r).toEqual({ orderToken: 't', buyerName: 'a', conversationId: null })
    expect('totalAmount' in r).toBe(false)
    expect('depositAmount' in r).toBe(false)
  })
  it('มี H1 → คงห้องแชท', () => {
    expect(toNoMoneyAppointmentDay(row, { canChat: true }).conversationId).toBe('c1')
  })
})

describe('filterOrderEventsForNoMoney', () => {
  const ev = (type: string, meta: object = {}): OrderEventView =>
    ({ id: type, type, meta, occurredAtISO: '2026-10-10T00:00:00Z', actorLabel: null, actorAvatar: null }) as OrderEventView

  it('ตัดเหตุการณ์ที่เล่าเรื่องเงินทั้งบรรทัด (ยอดเก็บเงินปลายทาง/ยืนยันรับเงิน/วิธีชำระ)', () => {
    const kept = filterOrderEventsForNoMoney([
      ev('ORDER_CREATED'), ev('COD_SETTLED', { amount: 900 }), ev('PAYMENT_CONFIRMED'), ev('PAYMENT_CONFIRM_REVERTED'),
      ev('PAYMENT_METHOD_SYNCED', { amount: 900, paymentFrom: 'CASH' }), ev('SYSTEM_CONFIRMED'), ev('ORDER_CANCELLED'),
    ])
    expect(kept.map((e) => e.type)).toEqual(['ORDER_CREATED', 'ORDER_CANCELLED'])
  })

  it('เหตุการณ์ที่เหลือ: meta ไม่มี amount/paymentFrom แม้ต้นทางมี', () => {
    const [e] = filterOrderEventsForNoMoney([ev('ORDER_EDITED', { changedCount: 2, amount: 5, paymentFrom: 'X' })])
    expect(e.meta).toEqual({ changedCount: 2 })
  })
})
