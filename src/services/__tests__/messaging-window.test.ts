import { describe, it, expect } from 'vitest'
import { getWindowState, MESSAGING_WINDOW_MS, HUMAN_AGENT_WINDOW_MS } from '@/services/channel-chat.service'

/**
 * หน้าต่างตอบกลับของ Meta 3 ระดับ (feature 00018, ไล่จากเอกสาร Messaging Policy 2026-08-01)
 *   ≤24 ชม.        → ส่งได้ปกติ (รวมเนื้อหาโปรโมชัน)
 *   24 ชม.–7 วัน   → ส่งได้เฉพาะ "คนพิมพ์เอง" ผ่าน HUMAN_AGENT tag ห้ามโปรโมชัน
 *   >7 วัน         → ส่งไม่ได้ ต้องรอลูกค้าทักมาใหม่
 */
describe('getWindowState — 3 ระดับตามนโยบาย Meta', () => {
  const now = new Date('2026-08-01T12:00:00.000Z')
  const ago = (ms: number) => new Date(now.getTime() - ms)

  it('ลูกค้ายังไม่เคยทัก → ปิดทุกระดับ (ไม่มีจุดตั้งต้นให้นับ)', () => {
    const s = getWindowState(null, now)
    expect(s.open).toBe(false)
    expect(s.humanAgentOpen).toBe(false)
    expect(s.expiresAt).toBeNull()
    expect(s.humanAgentExpiresAt).toBeNull()
  })

  it('ทักมา 1 ชม.ที่แล้ว → หน้าต่างปกติเปิด และเหลือเวลา 23 ชม.', () => {
    const s = getWindowState(ago(60 * 60 * 1000), now)
    expect(s.open).toBe(true)
    expect(s.humanAgentOpen).toBe(true)
    expect(s.msRemaining).toBe(23 * 60 * 60 * 1000)
  })

  it('ขอบ 24 ชม.พอดี → ปิดหน้าต่างปกติ แต่ HUMAN_AGENT ยังเปิด', () => {
    const s = getWindowState(ago(MESSAGING_WINDOW_MS), now)
    expect(s.open).toBe(false)
    expect(s.msRemaining).toBe(0)
    expect(s.humanAgentOpen).toBe(true)
  })

  it('ผ่านมา 3 วัน → ปกติปิด แต่คนยังตอบเองได้ (ระดับกลาง)', () => {
    const s = getWindowState(ago(3 * 24 * 60 * 60 * 1000), now)
    expect(s.open).toBe(false)
    expect(s.humanAgentOpen).toBe(true)
  })

  it('ขอบ 7 วันพอดี → ปิดหมดทุกระดับ', () => {
    const s = getWindowState(ago(HUMAN_AGENT_WINDOW_MS), now)
    expect(s.open).toBe(false)
    expect(s.humanAgentOpen).toBe(false)
  })

  it('เกิน 7 วัน → ปิดหมด และเวลาหมดอายุยังคำนวณให้ (ไว้บอกผู้ใช้ว่าหมดไปเมื่อไหร่)', () => {
    const last = ago(8 * 24 * 60 * 60 * 1000)
    const s = getWindowState(last, now)
    expect(s.open).toBe(false)
    expect(s.humanAgentOpen).toBe(false)
    expect(s.humanAgentExpiresAt?.getTime()).toBe(last.getTime() + HUMAN_AGENT_WINDOW_MS)
  })
})
