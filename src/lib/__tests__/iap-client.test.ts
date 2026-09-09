/**
 * ตัวเรียกฝั่งเว็บ — ขอของจาก native แล้วรอคำตอบ (feature 00064)
 *
 * ## ทำไมต้องจับคู่ด้วย requestId
 *
 * ช่องทางกลับจาก native เป็น **event เดียวร่วมกันทั้งหน้า** ไม่ใช่ callback ต่อคำขอ ⇒ ถ้าไม่
 * จับคู่ คำตอบของ "ขอราคา" จะไปปลุกคำขอ "กดซื้อ" ที่ค้างอยู่ · ผู้ใช้กดซื้อแล้วจอบอกว่าสำเร็จ
 * ทั้งที่ยังไม่ได้จ่ายเงิน — ผิดพลาดที่แพงที่สุดเท่าที่ฟีเจอร์นี้จะทำได้
 *
 * ## ทำไมต้องมี timeout
 *
 * native อาจไม่ตอบเลย (แอปเวอร์ชันเก่าที่ยังไม่รู้จักข้อความนี้ · StoreKit ค้าง) ถ้าไม่มี
 * timeout ปุ่มจะหมุนตลอดกาลโดยไม่มีอะไรบอกผู้ใช้ — ซึ่งคือบั๊ก 2.1(a) แบบเดียวกับที่ Apple
 * เพิ่งตีกลับมา
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

import { createIapClient } from '@/lib/iap-client'
import type { IapRequest } from '@/lib/iap-bridge-protocol'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

/** ท่อจำลอง — เก็บสิ่งที่ถูกส่งออกไป และให้เทสยิงคำตอบกลับเองได้ */
function fakeTransport() {
  const sent: IapRequest[] = []
  let listener: ((raw: unknown) => void) | null = null
  return {
    sent,
    reply: (raw: unknown) => listener?.(raw),
    get subscribers() {
      return listener ? 1 : 0
    },
    transport: {
      post: (msg: IapRequest) => void sent.push(msg),
      subscribe: (fn: (raw: unknown) => void) => {
        listener = fn
        return () => {
          listener = null
        }
      },
    },
  }
}

describe('ขอรายการสินค้า', () => {
  it('ส่งข้อความถูกรูปแบบ แล้วคืนราคาที่ native ตอบมา', async () => {
    const t = fakeTransport()
    const client = createIapClient(t.transport, { newId: () => 'r1' })

    const p = client.request({ kind: 'products' })
    expect(t.sent).toEqual([{ type: 'deep:iap-products', requestId: 'r1' }])

    t.reply({
      requestId: 'r1',
      ok: true,
      kind: 'products',
      products: [{ productId: 'com.x.growth', displayName: 'Growth', displayPrice: '฿249' }],
    })

    await expect(p).resolves.toMatchObject({ ok: true, kind: 'products' })
  })
})

describe('🛑 จับคู่คำขอกับคำตอบ', () => {
  it('คำตอบของคำขออื่น → ต้องไม่ปลุกคำขอนี้', async () => {
    const t = fakeTransport()
    const client = createIapClient(t.transport, { newId: () => 'mine', timeoutMs: 5000 })

    let settled = false
    const p = client.request({ kind: 'purchase', productId: 'com.x.pro' }).then((r) => {
      settled = true
      return r
    })

    t.reply({ requestId: 'someone-else', ok: true, kind: 'purchase', jws: 'a.b.c', transactionId: '1' })
    await vi.advanceTimersByTimeAsync(0)
    expect(settled, 'คำตอบคนอื่นไม่ควรทำให้คำขอนี้จบ').toBe(false)

    t.reply({ requestId: 'mine', ok: true, kind: 'purchase', jws: 'x.y.z', transactionId: '2' })
    await expect(p).resolves.toEqual({ requestId: 'mine', ok: true, kind: 'purchase', jws: 'x.y.z', transactionId: '2' })
  })

  it('ข้อความรูปร่างพัง → เมินเฉย ไม่จบคำขอ ไม่ throw', async () => {
    const t = fakeTransport()
    const client = createIapClient(t.transport, { newId: () => 'r', timeoutMs: 5000 })
    let settled = false
    const p = client.request({ kind: 'restore' }).then((r) => ((settled = true), r))

    for (const bad of [null, 'x', 0, {}, { requestId: 'r' }, { requestId: 'r', ok: true, kind: '???' }]) {
      expect(() => t.reply(bad)).not.toThrow()
    }
    await vi.advanceTimersByTimeAsync(0)
    expect(settled).toBe(false)

    t.reply({ requestId: 'r', ok: true, kind: 'restore', items: [] })
    await expect(p).resolves.toMatchObject({ ok: true, kind: 'restore' })
  })
})

describe('🛑 ไม่ตอบ → ต้องจบด้วยตัวเอง', () => {
  it('ครบเวลาแล้วเงียบ → `TIMEOUT` ไม่ใช่หมุนตลอดกาล', async () => {
    const t = fakeTransport()
    const client = createIapClient(t.transport, { newId: () => 'r', timeoutMs: 30_000 })
    const p = client.request({ kind: 'products' })

    await vi.advanceTimersByTimeAsync(30_000)
    await expect(p).resolves.toEqual({ requestId: 'r', ok: false, reason: 'TIMEOUT' })
  })

  it('คำตอบมาก่อนหมดเวลา → ไม่ถูก TIMEOUT ทับทีหลัง', async () => {
    const t = fakeTransport()
    const client = createIapClient(t.transport, { newId: () => 'r', timeoutMs: 10_000 })
    const p = client.request({ kind: 'purchase', productId: 'p' })

    t.reply({ requestId: 'r', ok: false, reason: 'CANCELLED' })
    await expect(p).resolves.toEqual({ requestId: 'r', ok: false, reason: 'CANCELLED' })

    await vi.advanceTimersByTimeAsync(60_000)
    await expect(p).resolves.toEqual({ requestId: 'r', ok: false, reason: 'CANCELLED' })
  })
})

describe('🛑 ไม่ได้เปิดอยู่ในแอป', () => {
  it('ไม่มีท่อ → `UNAVAILABLE` ทันที ไม่ต้องรอหมดเวลา', async () => {
    const client = createIapClient(null, { newId: () => 'r', timeoutMs: 30_000 })
    await expect(client.request({ kind: 'products' })).resolves.toEqual({
      requestId: 'r',
      ok: false,
      reason: 'UNAVAILABLE',
    })
  })
})

describe('🛑 ไม่ทิ้งขยะไว้', () => {
  it('จบแล้วต้องเลิกฟัง — ทั้งกรณีสำเร็จและกรณีหมดเวลา', async () => {
    const t = fakeTransport()
    const client = createIapClient(t.transport, { newId: () => 'a', timeoutMs: 5000 })

    const done = client.request({ kind: 'products' })
    t.reply({ requestId: 'a', ok: true, kind: 'products', products: [] })
    await done
    expect(t.subscribers, 'สำเร็จแล้วยังฟังอยู่ = ทุกครั้งที่กดปุ่มจะทิ้ง listener ค้างไว้').toBe(0)

    const client2 = createIapClient(t.transport, { newId: () => 'b', timeoutMs: 5000 })
    const timedOut = client2.request({ kind: 'products' })
    await vi.advanceTimersByTimeAsync(5000)
    await timedOut
    expect(t.subscribers).toBe(0)
  })
})

/**
 * ── สั่งปิดธุรกรรม — ยิงแล้วจบ ไม่รอคำตอบ ───────────────────────────────
 *
 * 🛑 ถ้าใช้ `request()` กับคำสั่งนี้ จะมีคำขอค้างรอคำตอบที่ไม่มีวันมา แล้วกิน listener กับ
 * ตัวจับเวลาไว้ 60 วินาทีต่อการซื้อหนึ่งครั้ง · ตอนกู้คืนที่ปิดทีเดียวหลายใบจะยิ่งกองกัน
 */
describe('🛑 ปิดธุรกรรม', () => {
  it('ส่งคำสั่งออกไปโดยไม่สร้าง listener และไม่ตั้งตัวจับเวลา', async () => {
    const t = fakeTransport()
    const client = createIapClient(t.transport, { newId: () => 'f1', timeoutMs: 5000 })

    client.finish('2000000123')

    expect(t.sent).toEqual([{ type: 'deep:iap-finish', requestId: 'f1', transactionId: '2000000123' }])
    expect(t.subscribers, 'ยิงแล้วจบ ไม่ต้องรอใครตอบ').toBe(0)
    /* ถ้ามีตัวจับเวลาค้าง การเดินเวลาไปข้างหน้าจะทำให้เทสอื่นรวน */
    await vi.advanceTimersByTimeAsync(60_000)
    expect(t.sent).toHaveLength(1)
  })

  it('ไม่ได้อยู่ในแอป → เงียบ ไม่พัง', () => {
    const client = createIapClient(null, { newId: () => 'f' })
    expect(() => client.finish('200')).not.toThrow()
  })
})
