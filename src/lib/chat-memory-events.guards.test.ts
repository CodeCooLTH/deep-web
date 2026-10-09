/**
 * สัญญาณข้ามแผง (00019-ext-mem): helper ต้องยิง event ชื่อตามค่าคงที่ + detail ตรงสัญญา
 * และต้องไม่พังตอนไม่มี window (SSR) — vitest เป็น node จึงจำลอง window เอง
 */
import { afterEach, describe, expect, it } from 'vitest'
import {
  MEMORY_POKE_EVENT,
  PRODUCT_TRAY_OPEN_EVENT,
  dispatchMemoryPoke,
  dispatchProductTrayOpen,
} from '@/lib/chat-memory-events'

const g = globalThis as unknown as { window?: unknown }
afterEach(() => {
  delete g.window
})

function fakeWindow() {
  const events: Event[] = []
  g.window = { dispatchEvent: (e: Event) => (events.push(e), true) }
  return events
}

describe('chat-memory-events', () => {
  it('ชื่อ event ไม่ซ้ำกันและขึ้นต้น deep:', () => {
    expect(PRODUCT_TRAY_OPEN_EVENT).not.toBe(MEMORY_POKE_EVENT)
    expect(PRODUCT_TRAY_OPEN_EVENT).toBe('deep:product-tray-open')
    expect(MEMORY_POKE_EVENT).toBe('deep:memory-poke')
  })
  it('dispatchProductTrayOpen ส่ง productId ใน detail', () => {
    const ev = fakeWindow()
    dispatchProductTrayOpen('p1')
    expect(ev).toHaveLength(1)
    expect(ev[0].type).toBe(PRODUCT_TRAY_OPEN_EVENT)
    expect((ev[0] as CustomEvent).detail).toEqual({ productId: 'p1' })
  })
  it('dispatchMemoryPoke ยิง MEMORY_POKE_EVENT', () => {
    const ev = fakeWindow()
    dispatchMemoryPoke()
    expect(ev.map((e) => e.type)).toEqual([MEMORY_POKE_EVENT])
  })
  it('ไม่มี window = ไม่ throw', () => {
    expect(() => dispatchMemoryPoke()).not.toThrow()
    expect(() => dispatchProductTrayOpen('p1')).not.toThrow()
  })
})
