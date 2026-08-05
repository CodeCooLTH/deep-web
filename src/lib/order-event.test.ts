// ล็อกกฎผัน label ของ timeline (feature 00030 rework 2026-08-05) — กฎ copy กลายเป็น logic แล้ว
// ต้องมีเทสกันถอย โดยเฉพาะ "เปิดบิลเข้าพัก" ที่ห้ามประกอบเป็น "สร้าง"+noun (UX-Copy §3)
import { describe, expect, it } from 'vitest'

import { ORDER_EVENT_META, ORDER_EVENT_TYPES, resolveOrderEventLabel } from './order-event'
import { ORDER_VOCAB } from './seller-menu'

describe('resolveOrderEventLabel', () => {
  it('ORDER_CREATED ใช้ createLabel ตรง ๆ — LODGING ต้องเป็น "เปิดบิลเข้าพัก" ไม่ใช่ "สร้างบิลเข้าพัก"', () => {
    expect(resolveOrderEventLabel('ORDER_CREATED', ORDER_VOCAB.ONLINE_SALES)).toBe('สร้างคำสั่งซื้อ')
    expect(resolveOrderEventLabel('ORDER_CREATED', ORDER_VOCAB.LODGING)).toBe('เปิดบิลเข้าพัก')
    expect(resolveOrderEventLabel('ORDER_CREATED', ORDER_VOCAB.LODGING)).not.toContain('สร้าง')
  })

  it('แก้ไข/ยกเลิก ผันเป็น กริยา+noun ตาม pattern เดียวกับ order-action-set', () => {
    expect(resolveOrderEventLabel('ORDER_EDITED', ORDER_VOCAB.SERVICE_QUEUE)).toBe('แก้ไขการเข้ารับบริการ')
    expect(resolveOrderEventLabel('ORDER_CANCELLED', ORDER_VOCAB.SERVICE_QUEUE)).toBe('ยกเลิกการเข้ารับบริการ')
    expect(resolveOrderEventLabel('ORDER_CANCELLED', ORDER_VOCAB.LODGING)).toBe('ยกเลิกบิลเข้าพัก')
  })

  it('โดเมนพัสดุ/SMS/BUYER_CONFIRMED ไม่ผัน — คืน label กลางเดิมทุก vertical (BR-BKU-11)', () => {
    const nonLifecycle = ORDER_EVENT_TYPES.filter(
      (t) => t !== 'ORDER_CREATED' && t !== 'ORDER_EDITED' && t !== 'ORDER_CANCELLED',
    )
    for (const type of nonLifecycle) {
      expect(resolveOrderEventLabel(type, ORDER_VOCAB.LODGING)).toBe(ORDER_EVENT_META[type].label)
      expect(resolveOrderEventLabel(type, ORDER_VOCAB.SERVICE_QUEUE)).toBe(ORDER_EVENT_META[type].label)
    }
  })
})
