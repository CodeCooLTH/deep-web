import { describe, it, expect } from 'vitest'
import { getWindowState, MESSAGING_WINDOW_MS, HUMAN_AGENT_WINDOW_MS } from '@/lib/messaging-window'
import * as svc from '@/services/channel-chat.service'

const T0 = new Date('2026-10-01T00:00:00Z')
const at = (ms: number) => new Date(T0.getTime() + ms)

describe('getWindowState', () => {
  it('ไม่มี inbound = ปิด', () => {
    const w = getWindowState(null, T0)
    expect(w.open).toBe(false)
    expect(w.humanAgentOpen).toBe(false)
  })
  it('23:59:59 ยังเปิด', () => expect(getWindowState(T0, at(MESSAGING_WINDOW_MS - 1000)).open).toBe(true))
  it('24:00:00 ปิด (ขอบ)', () => expect(getWindowState(T0, at(MESSAGING_WINDOW_MS)).open).toBe(false))
  it('24:00:01 ปิด แต่ human agent ยังเปิด', () => {
    const w = getWindowState(T0, at(MESSAGING_WINDOW_MS + 1000))
    expect(w.open).toBe(false)
    expect(w.msRemaining).toBe(0)
    expect(w.humanAgentOpen).toBe(true)
  })
  it('7 วันเป๊ะ human agent ปิด', () =>
    expect(getWindowState(T0, at(HUMAN_AGENT_WINDOW_MS)).humanAgentOpen).toBe(false))
  it('channel-chat.service re-export ตัวเดียวกัน', () => {
    expect(svc.getWindowState).toBe(getWindowState)
    expect(svc.MESSAGING_WINDOW_MS).toBe(MESSAGING_WINDOW_MS)
  })
})
