import { describe, it, expect } from 'vitest'
import { describeLineChannelHealth, isGreenState } from '@/lib/line/channel-health-presentation'
import type { LineChannelHealth } from '@/lib/line/channel-health'

// (00025 ส่วนขยาย 2026-08-12 — AC-CH-23/24)

const ALL: LineChannelHealth[] = [
  'SECRET_MISMATCH',
  'TOKEN_INVALID',
  'WEBHOOK_NOT_SET',
  'WEBHOOK_INACTIVE',
  'WEBHOOK_POINTS_ELSEWHERE',
  'TOKEN_EXPIRING',
  'HEALTHY',
]

describe('describeLineChannelHealth', () => {
  it('[blocker] มีคำครบทุกสถานะ — ไม่มีป้ายว่าง ไม่มีสถานะที่ตกไป default', () => {
    // 🛑 ป้ายว่างบนหน้าจอคือความล้มเหลวที่เงียบที่สุด: ผู้ขายเห็นกล่องสีที่ไม่มีข้อความ
    // แล้วไม่รู้ว่าต้องทำอะไร และไม่มี error ให้ใครเห็น
    for (const h of ALL) {
      const p = describeLineChannelHealth(h)
      expect(p.label.trim().length, `${h} ไม่มี label`).toBeGreaterThan(0)
      expect(p.icon.trim().length, `${h} ไม่มี icon`).toBeGreaterThan(0)
    }
  })

  it('[blocker] เขียวได้เฉพาะ HEALTHY — Verified-Means-Green', () => {
    // mutation: เปลี่ยน isGreenState เป็น `tone === 'success'` หรือให้สถานะอื่นคืน true → ข้อนี้แดง
    for (const h of ALL) {
      expect(isGreenState(h), `${h} ไม่ควรเขียว`).toBe(h === 'HEALTHY')
      if (h !== 'HEALTHY') {
        expect(describeLineChannelHealth(h).tone, `${h} ใช้ tone success ไม่ได้`).not.toBe('success')
      }
    }
  })

  it('[blocker] ทุกสถานะที่ไม่ HEALTHY ต้องมีทางออกที่กดได้ 1 ทาง ไม่ใช่แค่ป้ายบอกอาการ', () => {
    for (const h of ALL) {
      const p = describeLineChannelHealth(h)
      if (h === 'HEALTHY') {
        expect(p.action).toBeNull()
        expect(p.detail).toBeNull() // ไม่มีอะไรต้องทำ = ไม่ต้องอธิบายตัวเอง
      } else {
        expect(p.action, `${h} ไม่มีปุ่มทางออก`).not.toBeNull()
        expect(p.actionLabel?.trim().length, `${h} ปุ่มไม่มีคำ`).toBeGreaterThan(0)
        expect(p.detail?.trim().length, `${h} ไม่มีบรรทัดอธิบาย`).toBeGreaterThan(0)
      }
    }
  })

  it('[blocker] TOKEN_EXPIRING ต้องบอกวันที่จริง ไม่ใช่คำว่า "ใกล้หมดอายุ" ลอย ๆ', () => {
    // "ใกล้หมดอายุ" ไม่บอกว่าต้องรีบแค่ไหน — ร้านจะเลื่อนไปเรื่อย ๆ จนถึงวันที่ส่งไม่ออก
    const p = describeLineChannelHealth('TOKEN_EXPIRING', { expiryText: '8 ก.ย. 2569', daysLeft: 27 })
    expect(p.label).toContain('8 ก.ย. 2569')
    expect(p.detail).toContain('27')
  })

  it('ไม่มีวันที่ส่งมา → ยังคืนคำที่อ่านรู้เรื่อง ไม่ใช่ "undefined" โผล่บนจอ', () => {
    const p = describeLineChannelHealth('TOKEN_EXPIRING')
    expect(p.label).not.toContain('undefined')
    expect(p.detail ?? '').not.toContain('undefined')
  })

  it('[blocker] ไม่มีสถานะไหนใช้คำซ้ำกับสถานะอื่น — ป้ายต้องแยกออกจากกันได้', () => {
    // ถ้าสองสถานะพูดเหมือนกัน ผู้ขายจะแก้ผิดจุดแล้วกลับมาเจอป้ายเดิม
    const labels = ALL.map((h) => describeLineChannelHealth(h).label)
    expect(new Set(labels).size).toBe(ALL.length)
  })
})
