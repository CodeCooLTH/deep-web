/**
 * [blocker] สถิติผู้ซื้อระดับแพลตฟอร์ม (feature 00055) — AC-BR-01..10
 *
 * 🛑 คลาสความผิดพลาดที่ฟีเจอร์นี้เสี่ยงที่สุดคือ **ติดตราลูกค้าที่ไม่ผิด** ซึ่งเคยเกิดแล้ว
 * 2026-08-11 (ป้าย "เคยยกเลิก N ครั้ง" นับการยกเลิกของ *ร้านเอง* ไปโทษลูกค้า — prod มี 8 ใบ
 * `cancelInitiator='seller'` ทั้งหมด) เทสชุดนี้จึงเน้นเคส "ต้องไม่นับ" มากพอ ๆ กับ "ต้องนับ"
 *
 * แดง = ห้าม merge
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, it, expect } from 'vitest'

import {
  MIN_SHIPPED_FOR_RATE,
  summarizeBuyerReputation,
  type BuyerOrderEvidence,
} from '../buyer-reputation'
import { cancelReasonIsBuyerFault } from '../cancel-reason-buyer-fault'
import { cancelReasonCountsAgainstGuest } from '../lodging'

const ord = (o: Partial<BuyerOrderEvidence> = {}): BuyerOrderEvidence => ({
  status: 'CONFIRMED',
  cancelInitiator: null,
  cancelReason: null,
  activeShipmentCarrierStatus: 'delivered',
  hasShipment: true,
  ...o,
})

describe('summarizeBuyerReputation', () => {
  it('AC-BR-01 หลักฐานจากหลายร้านรวมเป็นก้อนเดียว — ตัวคำนวณไม่รู้จักคำว่าร้านเลย', () => {
    // ผู้เรียกส่งหลักฐานข้ามร้านมาให้ ⇒ ตีกลับ 2 ใบจาก 2 ร้านต้องได้ 2 ไม่ใช่ 1
    const r = summarizeBuyerReputation([
      ord({ status: 'SHIPPED', activeShipmentCarrierStatus: 'return_success' }),
      ord({ status: 'SHIPPED', activeShipmentCarrierStatus: 'return' }),
      ord(),
    ])
    expect(r.returned).toBe(2)
    expect(r.received).toBe(1)
    expect(r.orders).toBe(3)
  })

  it('AC-BR-03 ฐานน้อยกว่าเกณฑ์ → returnRate = null (ไม่ใช่ 0)', () => {
    const r = summarizeBuyerReputation([
      ord({ status: 'SHIPPED', activeShipmentCarrierStatus: 'return_success' }),
      ord(),
    ])
    expect(r.shipped).toBeLessThan(MIN_SHIPPED_FOR_RATE)
    // 🛑 null ≠ 0 — "ยังบอกไม่ได้" กับ "ไม่เคยตีกลับ" คนละการตัดสินใจ
    expect(r.returnRate).toBeNull()
    expect(r.riskLevel).toBe('WATCH')
  })

  it('AC-BR-04 ตัวหารคือใบที่เปิดพัสดุจริง ไม่ใช่ออเดอร์ทั้งหมด', () => {
    const evidence: BuyerOrderEvidence[] = [
      ...Array.from({ length: 2 }, () =>
        ord({ status: 'SHIPPED', activeShipmentCarrierStatus: 'return_success' }),
      ),
      ...Array.from({ length: 2 }, () => ord()),
      // ใบที่ไม่มีพัสดุเลย (รับหน้าร้าน/ดิจิทัล/บริการ) — ไม่มีทางตีกลับได้ ห้ามเข้าตัวหาร
      ...Array.from({ length: 6 }, () =>
        ord({ hasShipment: false, activeShipmentCarrierStatus: null }),
      ),
    ]
    const r = summarizeBuyerReputation(evidence)
    expect(r.orders).toBe(10)
    expect(r.shipped).toBe(4)
    expect(r.returnRate).toBeCloseTo(0.5) // ไม่ใช่ 0.2
    expect(r.riskLevel).toBe('HIGH')
  })

  it('AC-BR-05 ตีกลับแล้วถูกยกเลิกตาม = นับครั้งเดียว (ตีกลับชนะ)', () => {
    const r = summarizeBuyerReputation([
      ord({
        status: 'CANCELLED',
        cancelReason: 'BUYER_REQUESTED',
        cancelInitiator: 'buyer',
        activeShipmentCarrierStatus: 'return_success',
      }),
    ])
    expect(r.returned).toBe(1)
    expect(r.cancelledByBuyer).toBe(0) // ห้ามเป็น 1 — ใบเดียวไม่ใช่ปัญหาสองครั้ง
  })

  it('AC-BR-06 ความผิดร้านห้ามเข้าประวัติลูกค้า', () => {
    for (const reason of ['SHOP_ISSUE', 'MUTUAL']) {
      const r = summarizeBuyerReputation([
        ord({ status: 'CANCELLED', cancelReason: reason, activeShipmentCarrierStatus: null }),
      ])
      expect(r.cancelledByBuyer, reason).toBe(0)
    }
  })

  it('AC-BR-07 BUYER_NO_PAYMENT / BUYER_NO_SHOW ต้องถูกนับ (เดิมหายไปเงียบ ๆ)', () => {
    for (const reason of ['BUYER_NO_PAYMENT', 'BUYER_NO_SHOW', 'BUYER_NO_TRANSFER', 'BUYER_REQUESTED']) {
      expect(cancelReasonIsBuyerFault(reason), reason).toBe(true)
      const r = summarizeBuyerReputation([
        ord({ status: 'CANCELLED', cancelReason: reason, activeShipmentCarrierStatus: null }),
      ])
      expect(r.cancelledByBuyer, reason).toBe(1)
    }
  })

  it('[blocker] PARCEL_RETURNED ต้องไม่นับผ่านเหตุผล — ไม่งั้นใบเดียวนับ 2 ครั้ง', () => {
    expect(cancelReasonIsBuyerFault('PARCEL_RETURNED')).toBe(false)
  })

  it('[blocker] allow-list ต้อง fail-closed — เหตุผลที่ไม่รู้จักห้ามนับ', () => {
    for (const v of ['', null, undefined, 'SOMETHING_NEW', 'buyer_no_payment']) {
      expect(cancelReasonIsBuyerFault(v as string | null), String(v)).toBe(false)
    }
  })

  it('[blocker] ตัวตัดสินของที่พัก (BR-LODG-37) ต้องเดินผ่าน allow-list ตัวเดียวกัน', () => {
    // ถ้าสองที่แยกกันเมื่อไร ลูกค้าคนเดียวกันจะมีประวัติไม่ตรงกันสองหน้าจอ (HR16)
    for (const reason of ['BUYER_NO_TRANSFER', 'BUYER_REQUESTED', 'BUYER_NO_PAYMENT']) {
      expect(cancelReasonCountsAgainstGuest(reason), reason).toBe(true)
    }
    for (const reason of ['SHOP_ISSUE', 'MUTUAL', 'PARCEL_RETURNED']) {
      expect(cancelReasonCountsAgainstGuest(reason), reason).toBe(false)
    }
  })

  it('[blocker] ไม่เคยตีกลับ = NONE · ตีกลับแต่ยังไม่ถึงเกณฑ์ = WATCH', () => {
    expect(summarizeBuyerReputation([ord(), ord()]).riskLevel).toBe('NONE')
    // ตีกลับ 1 จาก 5 = 20% (ต่ำกว่าเกณฑ์อัตรา) และจำนวนไม่ถึง 2 ⇒ WATCH ไม่ใช่ HIGH
    const r = summarizeBuyerReputation([
      ord({ status: 'SHIPPED', activeShipmentCarrierStatus: 'return_success' }),
      ...Array.from({ length: 4 }, () => ord()),
    ])
    expect(r.returnRate).toBeCloseTo(0.2)
    expect(r.riskLevel).toBe('WATCH')
  })

  it('ไม่มีหลักฐาน = ค่าว่าง ไม่ใช่ throw', () => {
    const r = summarizeBuyerReputation([])
    expect(r.orders).toBe(0)
    expect(r.returnRate).toBeNull()
    expect(r.riskLevel).toBe('NONE')
  })
})

describe('[blocker] ข้อจำกัดเชิงความเป็นส่วนตัวของ service (D-2 · BR-BR-01/02)', () => {
  const src = readFileSync(join(process.cwd(), 'src/services/buyer-reputation.service.ts'), 'utf8')
    // 🛑 ตัดคอมเมนต์ก่อนสแกน — ไฟล์นี้อธิบายกฎข้อนี้ไว้เองด้วยคำว่า shopId
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
    .join('\n')

  it('AC-BR-02 ห้ามมี shopId โผล่ในโค้ดจริงของ service นี้เลย', () => {
    // ทั้ง where และ select — มีเมื่อไรแปลว่ากลายเป็นสถิติรายร้าน หรือรั่วชื่อร้านอื่นออกไป
    expect(src).not.toMatch(/shopId/)
    expect(src).not.toMatch(/shopName/)
  })

  it('AC-BR-10 ฟีเจอร์นี้ห้ามเขียนทับ User.trustScore (BR-BR-11 · R-3)', () => {
    expect(src).not.toMatch(/trustScore/)
    expect(src).not.toMatch(/\.update\(|\.updateMany\(|\.create\(/)
  })
})
