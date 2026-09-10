/**
 * [blocker] คำที่ผู้ใช้เห็นเมื่อซื้อผ่าน Apple ไม่สำเร็จ (feature 00064)
 *
 * 🛑 เดิมข้อความอยู่ในตัว component ⇒ ไม่มีเทสไหนแตะได้ และทุกบริบทใช้คำเดียวกันหมด
 *
 * ปัญหาที่ทำให้ต้องแยก: `TIMEOUT` ตอนกดซื้อ **ไม่ได้แปลว่าไม่ได้จ่ายเงิน** — ผู้ใช้อาจ
 * ยืนยันกับ Apple สำเร็จหลังเราเลิกรอ (ธุรกรรมค้างที่ StoreKit) การบอกให้ "ลองใหม่อีกครั้ง"
 * คือชวนให้กดซื้อซ้ำ ทางที่ถูกคือชี้ไปที่ปุ่ม "กู้คืนการซื้อ" ในหน้าเดียวกัน
 */
import { describe, expect, it } from 'vitest'

import {
  iapFailureMessage,
  IAP_VERIFY_PENDING_MESSAGE,
  type IapFailureContext,
} from '@/lib/iap-failure-message'
import type { IapFailure } from '@/lib/iap-bridge-protocol'

const CONTEXTS: IapFailureContext[] = ['products', 'purchase', 'restore']
const REASONS: IapFailure[] = ['CANCELLED', 'UNAVAILABLE', 'FAILED', 'TIMEOUT']

describe('[blocker] ข้อความเมื่อทำรายการกับ Apple ไม่สำเร็จ', () => {
  it('🛑 หมดเวลาตอนกดซื้อ → ต้องชี้ไป "กู้คืนการซื้อ" และ **ห้าม** มีคำว่า "ลองใหม่"', () => {
    const msg = iapFailureMessage('TIMEOUT', 'purchase')
    expect(msg).toContain('กู้คืนการซื้อ')
    expect(
      msg,
      'อาจจ่ายเงินไปแล้ว — "ลองใหม่" = ชวนให้กดซื้อซ้ำ',
    ).not.toContain('ลองใหม่')
  })

  it('หมดเวลาตอนขอราคา → ยังเป็น "แอปไม่ตอบสนอง" (ไม่มีคนอยู่ในวงจร = สะพานพังจริง)', () => {
    expect(iapFailureMessage('TIMEOUT', 'products')).toBe('แอปไม่ตอบสนอง กรุณาลองใหม่อีกครั้ง')
  })

  it('หมดเวลาตอนกู้คืน → ลองใหม่ได้ (ยังไม่มีการจ่ายเงินรอบใหม่เกิดขึ้น)', () => {
    const msg = iapFailureMessage('TIMEOUT', 'restore')
    expect(msg).toContain('ลองใหม่')
    expect(msg, 'คนละเคสกับตอนกดซื้อ ห้ามใช้คำเดียวกัน').not.toBe(
      iapFailureMessage('TIMEOUT', 'purchase'),
    )
  })

  it('🛑 ทุกคู่ (เหตุผล × บริบท) ต้องมีข้อความจริง — ไม่มีคู่ไหนได้สตริงว่าง', () => {
    for (const reason of REASONS) {
      for (const context of CONTEXTS) {
        const msg = iapFailureMessage(reason, context)
        expect(msg.trim().length, `${reason} + ${context} ได้ข้อความว่าง`).toBeGreaterThan(0)
      }
    }
  })

  it('เหตุผลที่ไม่ขึ้นกับจังหวะ ต้องพูดเหมือนกันทุกบริบท (กันคำ drift — Hard Rule 16)', () => {
    for (const reason of ['CANCELLED', 'UNAVAILABLE', 'FAILED'] as const) {
      const [a, b, c] = CONTEXTS.map((ctx) => iapFailureMessage(reason, ctx))
      expect(a, `${reason} พูดไม่ตรงกันระหว่างบริบท`).toBe(b)
      expect(b).toBe(c)
    }
  })

  it('ไม่มีข้อความไหนโยนศัพท์เทคนิคใส่ผู้ใช้', () => {
    for (const reason of REASONS) {
      for (const context of CONTEXTS) {
        const msg = iapFailureMessage(reason, context)
        for (const jargon of ['TIMEOUT', 'StoreKit', 'JWS', 'undefined', 'null']) {
          expect(msg, `${reason}/${context} หลุดคำว่า ${jargon}`).not.toContain(jargon)
        }
      }
    }
  })
})

/**
 * [blocker] จ่ายเงินแล้วแต่เปิดสิทธิ์ไม่สำเร็จ — ห้ามสัญญาสิ่งที่โค้ดไม่ได้ทำ
 *
 * 🛑 คำเดิมบอกว่า "เปิดแอปอีกครั้งระบบจะลองให้เอง" แต่ `SellerWebView` ส่งฟังก์ชันเปล่า
 * เข้า `startIapListeners(onRecovered)` ⇒ **ไม่มีอะไรลองให้เลย** ผู้ใช้ที่เชื่อคำนี้จะปิด-เปิด
 * แอปวนไปเรื่อย ๆ โดยที่สิทธิ์ไม่มีวันเข้า ทั้งที่ปุ่มที่แก้ได้จริงอยู่บนจอเดียวกัน
 *
 * วันที่ต่อ `onRecovered` เข้ากับเว็บจริงแล้ว ค่อยมาผ่อนเทสตัวนี้พร้อมกัน — ห้ามผ่อนก่อน
 */
describe('[blocker] คำเมื่อจ่ายเงินแล้วแต่สิทธิ์ยังไม่เข้า', () => {
  it('🛑 ต้องชี้ไปที่ "กู้คืนการซื้อ" ซึ่งเป็นทางกลับทางเดียวที่ทำงานจริง', () => {
    expect(IAP_VERIFY_PENDING_MESSAGE).toContain('กู้คืนการซื้อ')
  })

  it('🛑 ห้ามสัญญาว่าเปิดแอปใหม่แล้วระบบจะลองให้เอง — โค้ดฝั่งแอปไม่ได้ทำ', () => {
    for (const lie of ['เปิดแอปอีกครั้ง', 'ระบบจะลองให้เอง', 'อัตโนมัติ']) {
      expect(IAP_VERIFY_PENDING_MESSAGE, `ยังสัญญาว่า "${lie}"`).not.toContain(lie)
    }
  })

  it('ต้องบอกด้วยว่าเงินถูกตัดไปแล้ว — ไม่งั้นผู้ใช้จะกดซื้อซ้ำ', () => {
    expect(IAP_VERIFY_PENDING_MESSAGE).toContain('ชำระเงินสำเร็จ')
  })
})
