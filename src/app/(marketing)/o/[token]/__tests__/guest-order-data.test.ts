/**
 * [blocker] ข้อมูลที่ guest เห็นต้องไม่มี PII ดิบหลุดออกไป — feature 00041 (BR-BOE-01/04)
 *
 * D-1 เปิดให้ "ใครก็ตามที่ถือลิงก์" เห็นออเดอร์ได้ ⇒ ไฟล์นี้คือขอบเขตที่ user ยอมรับความเสี่ยงไว้
 * ถ้ามีฟิลด์หลุดเกินจากนี้ มติ D-1 จะกลายเป็นการเปิดเผยเต็มโดยไม่มีใครตั้งใจ
 *
 * เทสตรวจถึงระดับ **ค่าที่อยู่ใน object จริง** ไม่ใช่แค่ชื่อ key — เพราะ key ที่ชื่อถูกต้อง
 * แต่ใส่ค่าดิบเข้าไปก็รั่วเหมือนกัน
 *
 * 🛑 แดง = ห้าม merge
 */

import { describe, it, expect } from 'vitest'
import { buildGuestOrderData } from '../guest-order-data'

const RAW_PHONE = '0812345891'
const RAW_ADDR = {
  line1: '45 ถ.สุขุมวิท',
  subdistrict: 'บางปูใหม่',
  district: 'เมืองสมุทรปราการ',
  province: 'สมุทรปราการ',
  postcode: '10280',
  note: 'ฝากไว้หน้าบ้าน โทร 0899999999',
}

function makeOrder(over: Record<string, unknown> = {}) {
  return {
    publicToken: 'tok_1',
    status: 'SHIPPED',
    createdAt: new Date('2026-08-08T03:00:00.000Z'),
    totalAmount: 1290,
    buyerContact: RAW_PHONE,
    shippingAddress: RAW_ADDR,
    paymentMethod: 'COD',
    items: [
      {
        id: 'it_1',
        name: 'ผ้าเบรกหน้า',
        description: 'ลูกค้าคุณสมชาย ต่อรองเหลือ 600 อย่าบอกคนอื่น',
        qty: 2,
        price: 320,
        product: { images: ['f1.jpg'] },
      },
    ],
    shop: {
      shopName: 'ร้านทดสอบ',
      logo: null,
      user: { displayName: 'เจ้าของร้าน', username: 'shop1', trustScore: 26, avatar: null },
    },
    shipmentTracking: null,
    shipments: [
      { trackingNo: 'TH01', courierName: 'Flash', courierCode: 'FLE', carrierStatus: 'in_transit' },
    ],
    ...over,
  } as never
}

describe('buildGuestOrderData', () => {
  it('เบอร์ถูก mask — ค่าดิบต้องไม่ปรากฏที่ไหนใน payload เลย', () => {
    const out = buildGuestOrderData(makeOrder(), 1)

    expect(out.maskedPhone).toBe('•••-•••-891')
    expect(JSON.stringify(out)).not.toContain(RAW_PHONE)
  })

  it('ที่อยู่ถูก mask — จังหวัดเต็ม ท่อนอื่นไม่มีค่าดิบหลุด', () => {
    const out = buildGuestOrderData(makeOrder(), 1)

    expect(out.maskedShippingAddress?.province).toBe('สมุทรปราการ')
    const json = JSON.stringify(out)
    expect(json).not.toContain('45 ถ.สุขุมวิท')
    expect(json).not.toContain('บางปูใหม่')
    expect(json).not.toContain('10280')
  })

  // note มักมีเบอร์สำรอง/จุดสังเกตที่ระบุตัวตนได้ — ห้ามหลุดเด็ดขาด
  it('note ของที่อยู่ไม่หลุดออกไปเลย', () => {
    const out = buildGuestOrderData(makeOrder(), 1)
    expect(JSON.stringify(out)).not.toContain('ฝากไว้หน้าบ้าน')
    expect(JSON.stringify(out)).not.toContain('0899999999')
  })

  // description ของ item เป็น free-text ที่ร้านพิมพ์เอง เคยมีเคสใส่ข้อมูลเฉพาะลูกค้ารายนั้น
  it('description ของรายการสินค้าไม่ถูกส่งไปให้ guest', () => {
    const out = buildGuestOrderData(makeOrder(), 1)
    expect(JSON.stringify(out)).not.toContain('ต่อรองเหลือ 600')
    expect(out.items[0]).not.toHaveProperty('description')
  })

  it('ไม่มีฟิลด์นอก allow-list ติดมา', () => {
    const out = buildGuestOrderData(makeOrder(), 1)
    expect(Object.keys(out).sort()).toEqual(
      [
        'carrierStatus',
        'createdAtIso',
        'items',
        'maskedPhone',
        'maskedShippingAddress',
        'maxVerifyLevel',
        'paymentMethod',
        'publicToken',
        'shipmentTracking',
        'shop',
        'status',
        'totalAmount',
        // หลักฐานร้าน — ตัวเลขรวมของร้าน ไม่ใช่ของออเดอร์ใบนี้ และเปิดสาธารณะอยู่แล้วบน /u/{username}
        'completedOrders',
        'avgRating',
        'reviewCount',
        'channels',
        'latestReview',
      ].sort(),
    )
  })

  // 🛑 รีวิวที่ยกมาโชว์ต้องไม่พาตัวระบุคนซื้อมาด้วย — ร้านที่มีออเดอร์น้อย (ส่วนใหญ่บน prod ตอนนี้)
  // ชื่อ+วันที่ประกอบกันชี้ตัวได้ทันทีว่าใครเป็นคนรีวิว
  it('รีวิวล่าสุดส่งแค่ rating กับ comment ไม่มีชื่อ/วันที่', () => {
    const out = buildGuestOrderData(makeOrder(), 1, {
      completedOrders: 12,
      avgRating: 4.8,
      reviewCount: 5,
      channels: [],
      latestReview: { rating: 5, comment: 'ส่งไวมาก' },
    })

    expect(Object.keys(out.latestReview ?? {}).sort()).toEqual(['comment', 'rating'])
  })

  // ไม่ส่ง stats มา → ต้องได้ค่าที่แปลว่า "ไม่มีข้อมูล" ไม่ใช่ 0 ที่แปลว่า "นับแล้วได้ศูนย์"
  it('ไม่มีสถิติ → completedOrders/avgRating เป็น null ไม่ใช่ 0', () => {
    const out = buildGuestOrderData(makeOrder(), 1)

    expect(out.completedOrders).toBeNull()
    expect(out.avgRating).toBeNull()
    expect(out.channels).toEqual([])
  })

  it('ไม่ส่งสลิป/ผู้ซื้อ/ลิงก์เข้าถึง ที่เป็นของเจ้าของออเดอร์เท่านั้น', () => {
    const out = buildGuestOrderData(
      makeOrder({ slipFileId: 'slip_1', accessUrl: 'https://secret', buyerName: 'สมชาย' }),
      1,
    )
    const json = JSON.stringify(out)
    expect(json).not.toContain('slip_1')
    expect(json).not.toContain('https://secret')
    expect(json).not.toContain('สมชาย')
  })

  it('ไม่มีเบอร์ (null) → maskedPhone เป็น null ไม่ใช่สตริงว่าง', () => {
    const out = buildGuestOrderData(makeOrder({ buyerContact: null }), 1)
    expect(out.maskedPhone).toBeNull()
  })

  it('ไม่มีที่อยู่ (NO_SHIPPING) → maskedShippingAddress เป็น null', () => {
    const out = buildGuestOrderData(makeOrder({ shippingAddress: null }), 1)
    expect(out.maskedShippingAddress).toBeNull()
  })

  it('carrierStatus ส่งต่อไปให้คำนวณ stage ได้ (BR-BOE-12)', () => {
    expect(buildGuestOrderData(makeOrder(), 1).carrierStatus).toBe('in_transit')
  })

  /* 🛑 [blocker] รูปที่ผู้ซื้อเห็นบนจอที่กำลังจะโอนเงิน ต้องเป็น "โลโก้ร้าน" ไม่ใช่รูปส่วนตัว
     ของเจ้าของ — จอถัดไป (sign-in) เลือกด้วยกฎนี้อยู่แล้ว ถ้าสองจอเลือกคนละกฎ ผู้ซื้อจะเห็น
     ร้านเดียวกันเป็นคนละรูปห่างกันไม่กี่วินาที

     ⚠️ fixture ในไฟล์นี้ cast `as never` ทั้งก้อน ⇒ TypeScript จับ field ที่หายไปจาก shop
     ไม่ได้เลย เทสคู่นี้จึงเป็นด่านเดียวที่เหลืออยู่ ห้ามลบ */
  it('[blocker] มีโลโก้ร้าน → ใช้โลโก้ร้าน ไม่ใช่รูปส่วนตัวของเจ้าของ', () => {
    const out = buildGuestOrderData(
      makeOrder({
        shop: {
          shopName: 'ร้านทดสอบ',
          vertical: 'SERVICE_QUEUE',
          logo: 'shop-logo.png',
          user: { displayName: 'เจ้าของร้าน', username: 'shop1', trustScore: 26, avatar: 'owner-selfie.jpg' },
        },
      }),
      1,
    )
    // storage key ต้องถูกแปลงเป็น URL ที่ <img src> ใช้ได้จริง ไม่ใช่คืน key ดิบ
    // (บั๊กบน prod 2026-08-12: คืน key ดิบ → path สัมพัทธ์ → 404 เงียบ กล่องเทาว่าง)
    expect(out.shop.user.avatar).toBe('/api/files/shop-logo.png')
  })

  it('[blocker] ไม่มีโลโก้ร้าน → ตกไปใช้รูปเจ้าของ (ร้านบุคคลที่ยังไม่อัปโหลดโลโก้)', () => {
    const out = buildGuestOrderData(
      makeOrder({
        shop: {
          shopName: 'ร้านทดสอบ',
          vertical: 'ONLINE_SALES',
          logo: null,
          user: { displayName: 'เจ้าของร้าน', username: 'shop1', trustScore: 26, avatar: 'owner-selfie.jpg' },
        },
      }),
      1,
    )
    expect(out.shop.user.avatar).toBe('/api/files/owner-selfie.jpg')
  })
})

/**
 * [blocker] ประเภทกิจการต้องเดินทางถึงจอผู้ซื้อ
 *
 * ถ้า field นี้หายไป จอจะตกไป ONLINE_SALES เงียบ ๆ แล้วร้านบริการ/บ้านพักเห็นคำว่า "สินค้า"
 * ทั้งหน้า ซึ่งเป็นอาการที่ user รายงานเองบน prod 2026-08-12 — ไม่มี error ไม่มีอะไรฟ้อง
 * เพราะสตริงที่ผิดก็ยังเป็นสตริงที่ถูกต้องตามชนิดทุกประการ (HR16)
 */
describe('[blocker] buildGuestOrderData ส่ง shop.vertical ต่อให้จอผู้ซื้อ', () => {
  it('ส่งค่าตามที่ร้านตั้งไว้ ไม่ใช่ค่าคงที่', () => {
    const out = buildGuestOrderData(
      makeOrder({
        shop: {
          shopName: 'บ้านพักทดสอบ',
          vertical: 'LODGING',
          logo: null,
          user: { displayName: 'เจ้าของ', username: 'host1', trustScore: 10, avatar: null },
        },
      }),
      1,
    )
    expect(out.shop.vertical).toBe('LODGING')
  })
})
