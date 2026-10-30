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

// 00086 P3 — 4 ชนิดใหม่ + บรรทัดรอง (ชื่อ snapshot / จำนวนรูป) · 🛑 note ไม่อยู่ใน meta (TD-006)
describe('00086 เหตุการณ์ผู้รับผิดชอบ/ทำเสร็จ', () => {
  it('มีป้ายภาษาไทยครบทั้ง 4 ชนิด · ไม่ใช่สีเขียว (ยังไม่ใช่หลักฐานจากลูกค้า)', () => {
    for (const t of ['SERVICE_ASSIGNED', 'SERVICE_CLAIMED', 'SERVICE_UNASSIGNED', 'SERVICE_FINISHED'] as const) {
      expect(ORDER_EVENT_TYPES).toContain(t)
      expect(ORDER_EVENT_META[t].label).toMatch(/[ก-๙]/)
      expect(ORDER_EVENT_META[t].tone).toBe('neutral')
    }
    expect(ORDER_EVENT_META.SERVICE_CLAIMED.label).toBe('รับงานนี้')
    expect(ORDER_EVENT_META.SERVICE_FINISHED.label).toBe('ทำเสร็จแล้ว')
  })
  it('มอบงาน: "มอบงานให้ {ชื่อ}" (+ แทนคนเดิม) · ยกเลิก: คนเดิม + เหตุผลลบสมาชิก', () => {
    expect(describeOrderEvent({ type: 'SERVICE_ASSIGNED', meta: { assigneeNameSnapshot: 'ช่างนิด' } })).toBe('มอบงานให้ ช่างนิด')
    expect(
      describeOrderEvent({ type: 'SERVICE_ASSIGNED', meta: { assigneeNameSnapshot: 'ช่างนิด', previousAssigneeNameSnapshot: 'ช่างต้น' } }),
    ).toBe('มอบงานให้ ช่างนิด · แทน ช่างต้น')
    expect(
      describeOrderEvent({ type: 'SERVICE_UNASSIGNED', meta: { previousAssigneeNameSnapshot: 'ช่างต้น', reason: 'MEMBER_REMOVED' } }),
    ).toBe('เดิม ช่างต้น · ถูกนำออกจากร้าน')
  })
  it('00086 P3 — ยกเลิกเพราะไม่ได้เป็นช่างแล้ว (ROLE_REMOVED): "{ชื่อ} ไม่ได้เป็นช่างแล้ว" ไม่ซ้ำชื่อ', () => {
    expect(
      describeOrderEvent({ type: 'SERVICE_UNASSIGNED', meta: { previousAssigneeNameSnapshot: 'ช่างต้น', reason: 'ROLE_REMOVED' } }),
    ).toBe('ช่างต้น ไม่ได้เป็นช่างแล้ว')
    expect(describeOrderEvent({ type: 'SERVICE_UNASSIGNED', meta: { reason: 'ROLE_REMOVED' } })).toBe('ผู้รับผิดชอบไม่ได้เป็นช่างแล้ว')
    // MANUAL ไม่เปลี่ยน
    expect(describeOrderEvent({ type: 'SERVICE_UNASSIGNED', meta: { previousAssigneeNameSnapshot: 'ช่างต้น', reason: 'MANUAL' } })).toBe('เดิม ช่างต้น')
  })
  it('เริ่ม/ทำเสร็จ: บอกจำนวนรูป + มีบันทึก (ไม่มีตัวบันทึก) · ไม่มีอะไร = ไม่มีบรรทัดรองเหมือนเดิม', () => {
    expect(describeOrderEvent({ type: 'SERVICE_FINISHED', meta: { photoCount: 3, hasNote: true } })).toBe('รูป 3 รูป · มีบันทึก')
    expect(describeOrderEvent({ type: 'SERVICE_STARTED', meta: {} })).toBeNull()
    expect(describeOrderEvent({ type: 'SERVICE_STARTED', meta: { photoCount: 0, hasNote: false } })).toBeNull()
  })
  // 00086 critique P1-4 — ป้ายไม่บอกว่า "ร้าน" เป็นคนเริ่ม (คนกดอยู่บรรทัด "โดย …") · ชุดเดียวกับ "ทำเสร็จแล้ว"
  it('SERVICE_STARTED = "เริ่มงาน" (ไม่ใช่ "ร้านเริ่มงาน")', () => {
    expect(ORDER_EVENT_META.SERVICE_STARTED.label).toBe('เริ่มงาน')
  })
})
