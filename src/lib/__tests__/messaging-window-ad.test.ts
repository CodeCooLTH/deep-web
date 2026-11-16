import { describe, it, expect } from 'vitest'
import { getWindowState, MESSAGING_WINDOW_MS, AD_WINDOW_MS, HUMAN_AGENT_WINDOW_MS } from '@/lib/messaging-window'

// 00095 (user report 2026-11-16): ลูกค้าที่ทักจากโฆษณา Click-to-Messenger ได้กรอบ 7 วัน ไม่ใช่ 24 ชม.
const now = new Date('2026-11-16T12:00:00.000Z')
const ago = (ms: number) => new Date(now.getTime() - ms)
const H = 3_600_000

describe('getWindowState + กรอบโฆษณา', () => {
  it('ไม่ส่ง anchor = เหมือนเดิม (24 ชม.)', () => {
    expect(getWindowState(ago(26 * H), now).open).toBe(false)
    expect(getWindowState(ago(26 * H), now, null).open).toBe(false)
    expect(getWindowState(ago(1 * H), now).viaAd).toBe(false)
  })

  it('24 ชม.หมดแล้วแต่ anchor อยู่ใน 7 วัน − 1 ชม. → open + viaAd', () => {
    const s = getWindowState(ago(26 * H), now, ago(26 * H))
    expect(s.open).toBe(true)
    expect(s.viaAd).toBe(true)
    expect(s.msRemaining).toBe(AD_WINDOW_MS - 26 * H)
  })

  it('ยังอยู่ใน 24 ชม. → viaAd=false (กรอบมาตรฐานยังเปิด)', () => {
    const s = getWindowState(ago(1 * H), now, ago(1 * H))
    expect(s.open).toBe(true)
    expect(s.viaAd).toBe(false)
  })

  it('เลย AD_WINDOW_MS → ปิด', () => {
    const s = getWindowState(ago(AD_WINDOW_MS), now, ago(AD_WINDOW_MS))
    expect(s.open).toBe(false)
    expect(s.viaAd).toBe(false)
  })

  it('anchor เก่ากว่า lastInbound+24h → ใช้ค่าที่มากกว่า (lastInbound ชนะ)', () => {
    const s = getWindowState(ago(1 * H), now, ago(6.9 * 24 * H))
    expect(s.expiresAt?.getTime()).toBe(ago(1 * H).getTime() + MESSAGING_WINDOW_MS)
  })

  it('HUMAN_AGENT ไม่เปลี่ยน — นับจาก lastInbound เท่านั้น', () => {
    const s = getWindowState(ago(8 * 24 * H), now, ago(2 * H))
    expect(s.humanAgentOpen).toBe(false)
    expect(s.humanAgentExpiresAt?.getTime()).toBe(ago(8 * 24 * H).getTime() + HUMAN_AGENT_WINDOW_MS)
  })

  it('ไม่มี lastInbound → ปิด แม้มี anchor', () => {
    expect(getWindowState(null, now, ago(1 * H)).open).toBe(false)
  })
})
