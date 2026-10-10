// ล็อกกฎผัน label ของ timeline (feature 00030 rework 2026-08-05) — กฎ copy กลายเป็น logic แล้ว
// ต้องมีเทสกันถอย โดยเฉพาะ "เปิดบิลเข้าพัก" ที่ห้ามประกอบเป็น "สร้าง"+noun (UX-Copy §3)
import { describe, expect, it } from 'vitest'

import { ORDER_EVENT_META, ORDER_EVENT_TYPES, describeOrderEvent, resolveOrderEventLabel } from './order-event'
import { ORDER_VOCAB } from './seller-menu'

describe('resolveOrderEventLabel', () => {
  it('ORDER_CREATED ใช้ createLabel ตรง ๆ — LODGING ต้องเป็น "เปิดบิลเข้าพัก" ไม่ใช่ "สร้างบิลเข้าพัก"', () => {
    expect(resolveOrderEventLabel('ORDER_CREATED', ORDER_VOCAB.ONLINE_SALES)).toBe('สร้างคำสั่งซื้อ')
    expect(resolveOrderEventLabel('ORDER_CREATED', ORDER_VOCAB.LODGING)).toBe('เปิดบิลเข้าพัก')
    expect(resolveOrderEventLabel('ORDER_CREATED', ORDER_VOCAB.LODGING)).not.toContain('สร้าง')
  })

  it('แก้ไข/ยกเลิก ผันเป็น กริยา+noun ตาม pattern เดียวกับ order-action-set', () => {
    expect(resolveOrderEventLabel('ORDER_EDITED', ORDER_VOCAB.SERVICE_QUEUE)).toBe('แก้ไขงานบริการ')
    expect(resolveOrderEventLabel('ORDER_CANCELLED', ORDER_VOCAB.SERVICE_QUEUE)).toBe('ยกเลิกงานบริการ')
    expect(resolveOrderEventLabel('ORDER_CANCELLED', ORDER_VOCAB.LODGING)).toBe('ยกเลิกบิลเข้าพัก')
  })

  it('โดเมนพัสดุ/SMS/BUYER_CONFIRMED ไม่ผัน — คืน label กลางเดิมทุก vertical (BR-BKU-11)', () => {
    const nonLifecycle = ORDER_EVENT_TYPES.filter(
      (t) => t !== 'ORDER_CREATED' && t !== 'ORDER_EDITED' && t !== 'ORDER_CANCELLED',
    )
    for (const type of nonLifecycle) {
      expect(resolveOrderEventLabel(type, ORDER_VOCAB.LODGING)).toBe(ORDER_EVENT_META[type].label)
      // ไม่ส่งคลังคำเต็ม (ร้านบริการเท่านั้นที่ส่ง) = label กลางเดิม
      expect(resolveOrderEventLabel(type, ORDER_VOCAB.SERVICE_QUEUE)).toBe(ORDER_EVENT_META[type].label)
    }
  })

  it('ร้านบริการ (ส่ง service vocab) — ไทม์ไลน์ไม่มี "ผู้ซื้อ/คำสั่งซื้อ/ของ" ของร้านขายของ', () => {
    const sv = ORDER_VOCAB.SERVICE_QUEUE
    const label = (t: Parameters<typeof resolveOrderEventLabel>[0]) => resolveOrderEventLabel(t, sv, sv)
    expect(label('BUYER_CONFIRMED')).toBe('ลูกค้ายืนยันรับบริการแล้ว')
    expect(label('SYSTEM_CONFIRMED')).toBe('ระบบยืนยันงานบริการอัตโนมัติ')
    expect(label('ORDER_DATE_CHANGED')).toBe('เปลี่ยนวันที่สร้าง')
    expect(label('ORDER_DISPUTE_OPENED')).toBe('ลูกค้าแจ้งว่ายังไม่ได้รับบริการ')
    expect(label('ORDER_DISPUTE_RESOLVED')).toBe('ปิดเรื่องที่ลูกค้าแจ้งไว้')
    expect(label('ORDER_CREATED')).toBe('สร้างงานบริการ')
    for (const t of ['BUYER_CONFIRMED', 'SYSTEM_CONFIRMED', 'ORDER_DATE_CHANGED', 'ORDER_DISPUTE_OPENED', 'ORDER_DISPUTE_RESOLVED'] as const) {
      expect(label(t)).not.toMatch(/ผู้ซื้อ|คำสั่งซื้อ|ของ$/)
    }
  })

  it('describeOrderEvent — ร้านบริการผันคำ · ไม่ส่ง vocab = คำเดิม', () => {
    const sv = ORDER_VOCAB.SERVICE_QUEUE
    const cancelled = { type: 'ORDER_CANCELLED' as const, meta: { initiatorRole: 'buyer' } }
    expect(describeOrderEvent(cancelled)).toBe('ยกเลิกโดยผู้ซื้อ')
    expect(describeOrderEvent(cancelled, sv)).toBe('ยกเลิกโดยลูกค้า')
    const created = { type: 'ORDER_CREATED' as const, meta: { orderedAt: '2026-10-01T00:00:00Z' } }
    expect(describeOrderEvent(created)).toMatch(/^ลงวันที่สั่งซื้อ /)
    expect(describeOrderEvent(created, sv)).toMatch(/^ลงวันที่สร้าง /)
  })
})
