/**
 * ท่อจริงที่ต่อ `iap-client` เข้ากับ `window` (feature 00064)
 *
 * รับ `window` เข้ามาทางพารามิเตอร์แทนที่จะอ้างของโลก ⇒ เทสได้ใน node ไม่ต้องมี DOM
 * และที่สำคัญกว่า: **บังคับให้เขียนโค้ดที่ทำงานได้ตอนไม่มี window** (SSR ของ Next รันบนเซิร์ฟเวอร์)
 *
 * ## 🛑 ต้องอ่านค่าตอน event ยิง ไม่ใช่ตอน subscribe
 *
 * native ตั้งค่าลง `window.__DEEP_IAP_RESULT__` **แล้วค่อย** ยิง event · ถ้าอ่านตอน subscribe
 * จะได้ค่าของคำขอครั้งก่อน (หรือ undefined) ตลอดกาล — บั๊กคลาสเดียวกับที่ `native-bridge`
 * เขียนเตือนไว้เองเรื่อง `__DEEP_PUSH_PERMISSION__`
 */
import { describe, expect, it, vi } from 'vitest'

import { createWindowIapTransport } from '@/lib/iap-transport'

type Handler = (e: Event) => void

/** window จำลอง — คุมได้ว่ามี ReactNativeWebView ไหม และค่าที่ native ฝากไว้คืออะไร */
function fakeWindow(opts: { inApp: boolean }) {
  const posted: string[] = []
  const handlers = new Map<string, Set<Handler>>()
  const win = {
    __DEEP_IAP_RESULT__: undefined as unknown,
    ReactNativeWebView: opts.inApp ? { postMessage: (m: string) => void posted.push(m) } : undefined,
    addEventListener: (type: string, fn: Handler) => {
      if (!handlers.has(type)) handlers.set(type, new Set())
      handlers.get(type)!.add(fn)
    },
    removeEventListener: (type: string, fn: Handler) => void handlers.get(type)?.delete(fn),
  }
  return {
    win,
    posted,
    listenerCount: (type: string) => handlers.get(type)?.size ?? 0,
    /** จำลอง native: ตั้งค่าก่อน แล้วค่อยยิง event — ลำดับเดียวกับของจริง */
    nativeReplies: (value: unknown) => {
      win.__DEEP_IAP_RESULT__ = value
      handlers.get('deep:iap-result')?.forEach((fn) => fn(new Event('deep:iap-result')))
    },
  }
}

describe('ไม่ได้อยู่ในแอป', () => {
  it('🛑 ไม่มี ReactNativeWebView → คืน null (client จะตอบ UNAVAILABLE ทันที)', () => {
    const { win } = fakeWindow({ inApp: false })
    expect(createWindowIapTransport(win as unknown as Window)).toBeNull()
  })

  it('🛑 ไม่มี window เลย (SSR) → null ไม่ throw', () => {
    expect(() => createWindowIapTransport(undefined)).not.toThrow()
    expect(createWindowIapTransport(undefined)).toBeNull()
  })
})

describe('อยู่ในแอป', () => {
  it('ส่งข้อความออกเป็น JSON string ผ่าน ReactNativeWebView', () => {
    const f = fakeWindow({ inApp: true })
    const t = createWindowIapTransport(f.win as unknown as Window)!
    t.post({ type: 'deep:iap-products', requestId: 'r1' })
    expect(f.posted).toEqual([JSON.stringify({ type: 'deep:iap-products', requestId: 'r1' })])
  })

  it('🛑 อ่านค่าตอน event ยิง ไม่ใช่ตอน subscribe', () => {
    const f = fakeWindow({ inApp: true })
    const t = createWindowIapTransport(f.win as unknown as Window)!
    const seen: unknown[] = []
    t.subscribe((raw) => void seen.push(raw))

    /* ตอน subscribe ค่ายังเป็น undefined — ถ้าอ่านตอนนั้นจะได้ undefined ตลอดกาล */
    f.nativeReplies({ requestId: 'r1', ok: true, kind: 'restore', items: [] })
    expect(seen).toEqual([{ requestId: 'r1', ok: true, kind: 'restore', items: [] }])

    f.nativeReplies({ requestId: 'r2', ok: false, reason: 'CANCELLED' })
    expect(seen[1]).toEqual({ requestId: 'r2', ok: false, reason: 'CANCELLED' })
  })

  it('🛑 เลิกฟังแล้วต้องไม่เหลือ listener ค้าง', () => {
    const f = fakeWindow({ inApp: true })
    const t = createWindowIapTransport(f.win as unknown as Window)!
    const onRaw = vi.fn()
    const off = t.subscribe(onRaw)
    expect(f.listenerCount('deep:iap-result')).toBe(1)

    off()
    expect(f.listenerCount('deep:iap-result')).toBe(0)
    f.nativeReplies({ requestId: 'r', ok: false, reason: 'FAILED' })
    expect(onRaw).not.toHaveBeenCalled()
  })

  it('🛑 postMessage ที่ throw ต้องไม่ทำให้หน้าเว็บพัง', () => {
    const f = fakeWindow({ inApp: true })
    f.win.ReactNativeWebView = {
      postMessage: () => {
        throw new Error('WebView หายไประหว่างทาง')
      },
    }
    const t = createWindowIapTransport(f.win as unknown as Window)!
    expect(() => t.post({ type: 'deep:iap-restore', requestId: 'r' })).not.toThrow()
  })
})
