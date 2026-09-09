/**
 * สัญญาการคุยกันระหว่างหน้าเว็บกับเปลือก native เรื่องการซื้อ (feature 00064)
 *
 * ## ทำไมต้องมีโมดูลบริสุทธิ์แยก
 *
 * StoreKit เรียกจากเว็บไม่ได้ ⇒ ปุ่มซื้ออยู่ในเว็บ แต่ตัวซื้อจริงอยู่ใน native · สองฝั่งนี้
 * **อยู่คนละรีโป ไม่มี type ตัวไหนเชื่อมให้** (บทเรียนเดียวกับ `deep:push-permission` ที่
 * SellerWebView เขียนเตือนไว้เองว่า "ถ้าพิมพ์ต่างกันจะเงียบสนิทโดยไม่มี error")
 * ⇒ รูปร่างข้อความต้องมีที่เดียวและมีเทสคุม
 *
 * ## 🛑 ข้อความจาก native ต้องตรวจก่อนเชื่อทุกครั้ง
 *
 * `injectJavaScript` ยัดค่าเข้ามาที่ `window` ซึ่งโค้ดหน้าอื่นก็เขียนทับได้ · และ
 * **ราคาที่แสดงต้องมาจาก StoreKit เท่านั้น** (Apple ตรวจข้อนี้ตรง ๆ — TC-IAP-40) ⇒ ของที่
 * รูปร่างไม่ครบต้องตกทั้งใบ ห้ามเติมค่าเริ่มต้นให้เอง เพราะราคาที่เดาเองผิดทั้งสองทาง:
 * แสดงถูกกว่าจริง = ผู้ใช้รู้สึกโดนหลอก · แพงกว่าจริง = เสียลูกค้าฟรี ๆ
 */
import { describe, expect, it } from 'vitest'

import { buildIapRequest, parseIapResult, IAP_RESULT_EVENT } from '@/lib/iap-bridge-protocol'

describe('buildIapRequest — ข้อความที่เว็บส่งไปให้ native', () => {
  it('ขอรายการสินค้า', () => {
    expect(buildIapRequest({ kind: 'products', requestId: 'r1' })).toEqual({
      type: 'deep:iap-products',
      requestId: 'r1',
    })
  })

  it('ขอซื้อ — ต้องแนบรหัสสินค้าไปด้วย', () => {
    expect(buildIapRequest({ kind: 'purchase', requestId: 'r2', productId: 'com.x.pro' })).toEqual({
      type: 'deep:iap-purchase',
      requestId: 'r2',
      productId: 'com.x.pro',
    })
  })

  it('ขอกู้คืนการซื้อ', () => {
    expect(buildIapRequest({ kind: 'restore', requestId: 'r3' })).toEqual({
      type: 'deep:iap-restore',
      requestId: 'r3',
    })
  })

  it('🛑 ทุกชนิดขึ้นต้นด้วย `deep:` — ฝั่ง native allow-list ตาม prefix นี้', () => {
    const ids = { requestId: 'r' }
    for (const req of [
      buildIapRequest({ kind: 'products', ...ids }),
      buildIapRequest({ kind: 'purchase', productId: 'p', ...ids }),
      buildIapRequest({ kind: 'restore', ...ids }),
    ]) {
      expect(req.type.startsWith('deep:iap-')).toBe(true)
    }
  })
})

describe('parseIapResult — ของที่ native ส่งกลับมา ต้องตรวจก่อนเชื่อ', () => {
  it('รายการสินค้าครบถ้วน → ผ่าน', () => {
    const got = parseIapResult({
      requestId: 'r1',
      ok: true,
      kind: 'products',
      products: [{ productId: 'com.x.growth', displayName: 'Growth', displayPrice: '฿249' }],
    })
    expect(got).toEqual({
      requestId: 'r1',
      ok: true,
      kind: 'products',
      products: [{ productId: 'com.x.growth', displayName: 'Growth', displayPrice: '฿249' }],
    })
  })

  it('🛑 สินค้าที่ขาดราคา → **ตกทั้งใบ** ไม่ใช่ข้ามเฉพาะตัวนั้น', () => {
    expect(
      parseIapResult({
        requestId: 'r1',
        ok: true,
        kind: 'products',
        products: [
          { productId: 'com.x.growth', displayName: 'Growth', displayPrice: '฿249' },
          { productId: 'com.x.pro', displayName: 'Pro' },
        ],
      }),
      'ปล่อยผ่านบางตัว = หน้าซื้อโชว์ไม่ครบ 3 tier โดยไม่มีใครรู้ว่าหายไปไหน',
    ).toBeNull()
  })

  it('🛑 ราคาต้องเป็นข้อความจาก StoreKit ห้ามเป็นตัวเลขดิบ', () => {
    /* ตัวเลขดิบแปลว่ามีคนคำนวณ/จัดรูปแบบเอง ซึ่งจะผิดสกุลเงินทันทีที่ขายข้ามประเทศ */
    expect(
      parseIapResult({
        requestId: 'r1',
        ok: true,
        kind: 'products',
        products: [{ productId: 'p', displayName: 'x', displayPrice: 249 }],
      }),
    ).toBeNull()
  })

  it('ซื้อสำเร็จ → ต้องมีใบเซ็น (JWS)', () => {
    const got = parseIapResult({ requestId: 'r2', ok: true, kind: 'purchase', jws: 'a.b.c', transactionId: '200' })
    expect(got).toEqual({ requestId: 'r2', ok: true, kind: 'purchase', jws: 'a.b.c', transactionId: '200' })
  })

  it('🛑 ซื้อสำเร็จแต่ไม่มีใบเซ็น → ตก (ไม่มีใบเซ็น = พิสูจน์กับเซิร์ฟเวอร์ไม่ได้)', () => {
    expect(parseIapResult({ requestId: 'r2', ok: true, kind: 'purchase', transactionId: '200' })).toBeNull()
    expect(parseIapResult({ requestId: 'r2', ok: true, kind: 'purchase', jws: '', transactionId: '200' })).toBeNull()
  })

  it('กู้คืน → รายการใบเซ็น (ว่างได้ แปลว่าไม่มีอะไรให้กู้)', () => {
    expect(parseIapResult({ requestId: 'r3', ok: true, kind: 'restore', items: [] })).toEqual({
      requestId: 'r3',
      ok: true,
      kind: 'restore',
      items: [],
    })
  })

  it('ล้มเหลว → เก็บเหตุผลไว้ให้ UI เลือกข้อความ', () => {
    for (const reason of ['CANCELLED', 'UNAVAILABLE', 'FAILED'] as const) {
      expect(parseIapResult({ requestId: 'r', ok: false, reason })).toEqual({
        requestId: 'r',
        ok: false,
        reason,
      })
    }
  })

  it('🛑 เหตุผลที่ไม่รู้จัก → `FAILED` ไม่ใช่เชื่อตามที่ส่งมา', () => {
    expect(parseIapResult({ requestId: 'r', ok: false, reason: 'ห่วย' })).toEqual({
      requestId: 'r',
      ok: false,
      reason: 'FAILED',
    })
  })

  it('🛑 ของที่รูปร่างพังทุกแบบ → null ไม่ throw', () => {
    for (const bad of [null, undefined, 0, '', 'x', [], {}, { ok: true }, { requestId: 'r' }, { requestId: 1, ok: true, kind: 'products', products: [] }]) {
      expect(() => parseIapResult(bad)).not.toThrow()
      expect(parseIapResult(bad)).toBeNull()
    }
  })

  it('🛑 kind ที่ไม่รู้จัก → null (กันคนเพิ่มชนิดใหม่ฝั่งเดียวแล้วอีกฝั่งเงียบ)', () => {
    expect(parseIapResult({ requestId: 'r', ok: true, kind: 'refund', jws: 'a.b.c', transactionId: '1' })).toBeNull()
  })
})

describe('ชื่อ event ต้องตรงกับฝั่งแอป', () => {
  it('🛑 `deep:iap-result` — พิมพ์ต่างกันเมื่อไหร่คือเงียบสนิทไม่มี error', () => {
    expect(IAP_RESULT_EVENT).toBe('deep:iap-result')
  })
})

/**
 * ── เพิ่มภายหลัง: ปิดธุรกรรม ──────────────────────────────────────────────
 *
 * 🛑 StoreKit จะส่งธุรกรรมที่ยัง **ไม่ถูกปิด** กลับมาทุกครั้งที่เปิดแอป จนกว่าเราจะสั่งปิด
 * — นั่นคือกลไกกู้คืนในตัว (BR-IAP-11 / TC-IAP-31)
 *
 * ⇒ ห้ามให้ native ปิดเองทันทีที่จ่ายเงินสำเร็จ ต้องรอ **เซิร์ฟเวอร์ยืนยันว่าเปิดสิทธิ์แล้ว**
 * ถ้าปิดก่อนแล้วเซิร์ฟเวอร์ล่ม ลูกค้าจ่ายเงินไปแล้วไม่ได้ของ และ StoreKit จะไม่ส่งธุรกรรมนั้น
 * กลับมาอีกเลยตลอดกาล — เงินหายจริง กู้คืนไม่ได้
 *
 * ⇒ ผลการซื้อจึงต้องมี `transactionId` ติดมาด้วย เพื่อบอก native ว่าให้ปิด "ใบไหน"
 */
describe('ปิดธุรกรรมหลังเซิร์ฟเวอร์ยืนยัน', () => {
  it('มีคำสั่งปิดธุรกรรมพร้อมระบุใบ', () => {
    expect(buildIapRequest({ kind: 'finish', requestId: 'r9', transactionId: '2000000123' })).toEqual({
      type: 'deep:iap-finish',
      requestId: 'r9',
      transactionId: '2000000123',
    })
  })

  it('🛑 ผลการซื้อต้องมี `transactionId` — ไม่มี = สั่งปิดใบไหนไม่ได้', () => {
    expect(
      parseIapResult({ requestId: 'r', ok: true, kind: 'purchase', jws: 'a.b.c' }),
      'ไม่มี transactionId แล้วปล่อยผ่าน = ธุรกรรมค้างไม่ถูกปิดตลอดกาล StoreKit จะยัดกลับมาทุกครั้งที่เปิดแอป',
    ).toBeNull()

    expect(
      parseIapResult({ requestId: 'r', ok: true, kind: 'purchase', jws: 'a.b.c', transactionId: '200' }),
    ).toEqual({ requestId: 'r', ok: true, kind: 'purchase', jws: 'a.b.c', transactionId: '200' })
  })

  it('🛑 กู้คืน — แต่ละใบต้องมีทั้งลายเซ็นและเลขธุรกรรมคู่กัน', () => {
    expect(
      parseIapResult({
        requestId: 'r',
        ok: true,
        kind: 'restore',
        items: [{ jws: 'a.b.c', transactionId: '200' }],
      }),
    ).toEqual({
      requestId: 'r',
      ok: true,
      kind: 'restore',
      items: [{ jws: 'a.b.c', transactionId: '200' }],
    })

    /* ใบไหนขาดอย่างใดอย่างหนึ่ง = ตกทั้งใบ (เหตุผลเดียวกับรายการสินค้า) */
    expect(
      parseIapResult({ requestId: 'r', ok: true, kind: 'restore', items: [{ jws: 'a.b.c' }] }),
    ).toBeNull()
  })

  it('กู้คืนแล้วไม่มีอะไรเลย → รายการว่าง ไม่ใช่ error', () => {
    expect(parseIapResult({ requestId: 'r', ok: true, kind: 'restore', items: [] })).toEqual({
      requestId: 'r',
      ok: true,
      kind: 'restore',
      items: [],
    })
  })
})
