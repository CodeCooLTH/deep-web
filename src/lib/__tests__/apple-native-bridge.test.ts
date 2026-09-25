/**
 * [blocker] สะพาน native ↔ เว็บ ของ Sign in with Apple (feature 00040 · ภาคผนวก 7)
 *
 * ## ทำไมต้องเป็น [blocker]
 *
 * สะพานนี้อยู่ **คนละรีโปกับคู่แฝดของมัน** (`deep-seller-app/src/features/apple-auth/`)
 * ไม่มี type ตัวไหนเชื่อมสองฝั่งให้ ⇒ ชื่อ event หรือชื่อฟิลด์ที่ต่างกันแม้ตัวเดียว
 * **จะเงียบสนิทโดยไม่มี error เลย** — ปุ่มกดแล้วไม่มีอะไรเกิดขึ้น ซึ่งคืออาการเดียวกับ
 * บั๊ก 2.1(a) ที่ Apple เคยตีกลับมาแล้ว · ค่าคงที่ทุกตัวจึงต้องถูกปักหมุดไว้
 *
 * และตัวที่สำคัญที่สุดคือ **เส้นทางถอย**: ผู้ใช้ที่ยังไม่อัปเดตแอปต้องล็อกอินได้เหมือนเดิม
 * ทุกประการ ถ้าเส้นนั้นพัง เราจะตัดผู้ขายจำนวนหนึ่งออกจากระบบโดยไม่มีใครรายงาน
 * (เขาจะคิดว่าแอปพัง ไม่ใช่คิดว่าเราปล่อยของใหม่)
 */
import { describe, expect, it, vi } from 'vitest'

import {
  APPLE_RESULT_EVENT,
  CAP_APPLE_SIGNIN,
  NATIVE_CAPS_EVENT,
  appleDisplayName,
  buildAppleSignInRequest,
  parseAppleSignInResult,
} from '@/lib/apple-bridge-protocol'
import {
  APPLE_NATIVE_TIMEOUT_MS,
  createAppleNativeClient,
  type AppleNativeTransport,
} from '@/lib/apple-native-client'
import {
  createWindowAppleTransport,
  nativeSupportsAppleSignIn,
  subscribeNativeCaps,
} from '@/lib/apple-native-transport'

const TOKEN = 'eyJhbGciOiJSUzI1NiJ9.payload.sig'

describe('[blocker] ค่าคงที่ที่ต้องตรงกับฝั่งแอป', () => {
  it('🛑 ชื่อ event และคำสั่ง ห้ามเปลี่ยนโดยไม่แก้อีกรีโปพร้อมกัน', () => {
    expect(APPLE_RESULT_EVENT).toBe('deep:apple-result')
    expect(NATIVE_CAPS_EVENT).toBe('deep:native-caps')
    expect(CAP_APPLE_SIGNIN).toBe('apple-signin')
    expect(buildAppleSignInRequest('r1', 'n1')).toEqual({
      type: 'deep:apple-signin',
      requestId: 'r1',
      nonce: 'n1',
    })
  })
})

describe('[blocker] แปลผลจาก native — รูปร่างไม่ครบ = ทิ้งทั้งใบ', () => {
  const ok = { requestId: 'r1', ok: true, identityToken: TOKEN, nonce: 'n1' }

  it('ผลที่ครบถ้วนผ่าน', () => {
    expect(parseAppleSignInResult(ok)).toEqual({
      requestId: 'r1',
      ok: true,
      identityToken: TOKEN,
      nonce: 'n1',
      fullName: undefined,
      email: undefined,
    })
  })

  it('🛑 ไม่มี identityToken → null (พิสูจน์กับเซิร์ฟเวอร์ไม่ได้ ห้ามนับเป็นสำเร็จ)', () => {
    expect(parseAppleSignInResult({ ...ok, identityToken: undefined })).toBeNull()
    expect(parseAppleSignInResult({ ...ok, identityToken: '' })).toBeNull()
  })

  it('🛑 ไม่มี nonce → null (จับคู่กับคำขอไม่ได้ = กันเล่นซ้ำไม่ได้)', () => {
    expect(parseAppleSignInResult({ ...ok, nonce: undefined })).toBeNull()
  })

  it('ไม่มี requestId → null', () => {
    expect(parseAppleSignInResult({ ...ok, requestId: undefined })).toBeNull()
  })

  it('เหตุผลที่ไม่รู้จักถูกยุบเป็น FAILED', () => {
    expect(parseAppleSignInResult({ requestId: 'r1', ok: false, reason: 'อะไรก็ไม่รู้' })).toEqual({
      requestId: 'r1',
      ok: false,
      reason: 'FAILED',
    })
  })

  it('🛑 TIMEOUT ส่งมาจากสายไม่ได้ — ถูกยุบเป็น FAILED', () => {
    /* ถ้ารับค่านี้จากสาย แอปที่ถูกแก้ไขจะแกล้งบอกว่า "หมดเวลา" เพื่อบังคับให้เว็บ
       ถอยไปทางที่มันเลือกได้ตามใจ — TIMEOUT ต้องเป็นข้อสรุปของฝั่งเราเท่านั้น */
    expect(parseAppleSignInResult({ requestId: 'r1', ok: false, reason: 'TIMEOUT' })).toEqual({
      requestId: 'r1',
      ok: false,
      reason: 'FAILED',
    })
  })

  it('CANCELLED ผ่านตามจริง — ผู้ใช้ตั้งใจยกเลิก ไม่ใช่ความผิดพลาด', () => {
    expect(parseAppleSignInResult({ requestId: 'r1', ok: false, reason: 'CANCELLED' })).toEqual({
      requestId: 'r1',
      ok: false,
      reason: 'CANCELLED',
    })
  })

  it('ชื่อที่ว่างทั้งคู่ → undefined ไม่ใช่อ็อบเจกต์เปล่า', () => {
    const r = parseAppleSignInResult({ ...ok, fullName: { givenName: '', familyName: '' } })
    expect(r && r.ok && r.fullName).toBeUndefined()
  })

  it('ชื่อที่มาบางส่วนเก็บเท่าที่มี', () => {
    const r = parseAppleSignInResult({ ...ok, fullName: { givenName: 'สมชาย' } })
    expect(r && r.ok && r.fullName).toEqual({ givenName: 'สมชาย' })
  })

  it('appleDisplayName ประกอบชื่อที่เดียวทั้งระบบ (HR16)', () => {
    expect(appleDisplayName({ givenName: 'สมชาย', familyName: 'ใจดี' })).toBe('สมชาย ใจดี')
    expect(appleDisplayName({ familyName: 'ใจดี' })).toBe('ใจดี')
    expect(appleDisplayName(undefined)).toBeNull()
  })
})

// ─── ท่อจำลอง ───────────────────────────────────────────────────────────────

function fakeTransport() {
  const listeners: ((raw: unknown) => void)[] = []
  const sent: unknown[] = []
  const transport: AppleNativeTransport = {
    post: (m) => sent.push(m),
    subscribe: (fn) => {
      listeners.push(fn)
      return () => listeners.splice(listeners.indexOf(fn), 1)
    },
  }
  return { transport, sent, emit: (raw: unknown) => listeners.forEach((l) => l(raw)), listeners }
}

describe('[blocker] ตัวขอ — จับคู่คำขอและเส้นทางถอย', () => {
  it('🛑 ไม่มีท่อ (เบราว์เซอร์ / เปลือกเก่า) → UNAVAILABLE ทันที ไม่รอหมดเวลา', async () => {
    const client = createAppleNativeClient(null)
    const started = Date.now()
    const { result } = await client.signIn()
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('UNAVAILABLE')
    /* ถ้าตรงนี้ช้า แปลว่าผู้ใช้บนเบราว์เซอร์จะเห็นปุ่มหมุนห้านาทีก่อนถอยไปทางเว็บ */
    expect(Date.now() - started).toBeLessThan(1000)
  })

  it('ส่งคำสั่งพร้อม nonce แล้วคืนผลเมื่อ native ตอบ', async () => {
    const { transport, sent, emit } = fakeTransport()
    const client = createAppleNativeClient(transport, { newId: () => 'r1', newNonce: () => 'n1' })
    const p = client.signIn()
    expect(sent).toEqual([{ type: 'deep:apple-signin', requestId: 'r1', nonce: 'n1' }])
    emit({ requestId: 'r1', ok: true, identityToken: TOKEN, nonce: 'n1' })
    const { result, nonce } = await p
    expect(result.ok).toBe(true)
    /* 🛑 ต้องเป็น nonce ที่ **เราสร้าง** ไม่ใช่ที่ native ส่งกลับ */
    expect(nonce).toBe('n1')
  })

  it('🛑 คำตอบของคำขออื่นต้องถูกเมิน ไม่ใช่เอามาจบคำขอนี้', async () => {
    const { transport, emit } = fakeTransport()
    const client = createAppleNativeClient(transport, {
      newId: () => 'r1',
      newNonce: () => 'n1',
      timeoutMs: 40,
    })
    const p = client.signIn()
    emit({ requestId: 'ของคำขออื่น', ok: true, identityToken: TOKEN, nonce: 'n1' })
    const { result } = await p
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('TIMEOUT')
  })

  it('🛑 nonce ที่ตอบกลับไม่ตรงกับที่ส่งไป → ปฏิเสธ ไม่ส่งต่อให้เซิร์ฟเวอร์', async () => {
    const { transport, emit } = fakeTransport()
    const client = createAppleNativeClient(transport, { newId: () => 'r1', newNonce: () => 'n1' })
    const p = client.signIn()
    emit({ requestId: 'r1', ok: true, identityToken: TOKEN, nonce: 'nonce-ของคนอื่น' })
    const { result } = await p
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('FAILED')
  })

  it('native เงียบ → TIMEOUT แล้วเลิกฟัง (ห้ามทิ้ง listener ค้าง)', async () => {
    const { transport, listeners } = fakeTransport()
    const client = createAppleNativeClient(transport, { timeoutMs: 20 })
    const { result } = await client.signIn()
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('TIMEOUT')
    expect(listeners).toHaveLength(0)
  })

  it('คำตอบที่มาหลังหมดเวลาแล้ว ต้องไม่เขียนทับผลที่จบไปแล้ว', async () => {
    const { transport, emit } = fakeTransport()
    const client = createAppleNativeClient(transport, {
      newId: () => 'r1',
      newNonce: () => 'n1',
      timeoutMs: 15,
    })
    const { result } = await client.signIn()
    expect(result.ok).toBe(false)
    emit({ requestId: 'r1', ok: true, identityToken: TOKEN, nonce: 'n1' })
    expect(result.ok).toBe(false)
  })

  it('🛑 เพดานเวลาต้องยาวพอให้ผู้ใช้ผ่าน 2FA ของ Apple ได้', () => {
    /* บทเรียนจาก TestFlight 2026-09-10: 60 วินาทีสั้นเกินไปสำหรับจอที่ Apple เป็นเจ้าของ
       ผู้ใช้กำลังกรอกรหัส/รอ SMS อยู่ แล้วเราขึ้นว่า "แอปไม่ตอบสนอง" */
    expect(APPLE_NATIVE_TIMEOUT_MS).toBeGreaterThanOrEqual(120_000)
  })

  it('nonce ตั้งต้นต้องสุ่มจริง ไม่ซ้ำกันระหว่างสองครั้ง', async () => {
    const client = createAppleNativeClient(null)
    const a = await client.signIn()
    const b = await client.signIn()
    expect(a.nonce).not.toBe(b.nonce)
    expect(a.nonce.length).toBeGreaterThanOrEqual(32)
  })
})

// ─── ท่อที่ต่อกับ window จริง ────────────────────────────────────────────────

function fakeWindow(over: Record<string, unknown> = {}) {
  const handlers = new Map<string, ((e?: unknown) => void)[]>()
  return {
    addEventListener: (k: string, fn: () => void) => {
      handlers.set(k, [...(handlers.get(k) ?? []), fn])
    },
    removeEventListener: (k: string, fn: () => void) => {
      handlers.set(k, (handlers.get(k) ?? []).filter((f) => f !== fn))
    },
    dispatch: (k: string) => (handlers.get(k) ?? []).forEach((f) => f()),
    handlers,
    ...over,
  } as unknown as Window & { dispatch: (k: string) => void; handlers: Map<string, unknown[]> }
}

describe('[blocker] เส้นทางถอย — บิลด์เก่าและเบราว์เซอร์ต้องใช้ทางเว็บได้เหมือนเดิม', () => {
  it('ไม่มี window (SSR) → ไม่รองรับ', () => {
    expect(nativeSupportsAppleSignIn(undefined)).toBe(false)
    expect(createWindowAppleTransport(undefined)).toBeNull()
  })

  it('เบราว์เซอร์ปกติ (ไม่มี ReactNativeWebView) → ไม่รองรับ', () => {
    expect(nativeSupportsAppleSignIn(fakeWindow())).toBe(false)
  })

  it('🛑 อยู่ในแอปแต่เป็นบิลด์เก่า (ไม่ประกาศความสามารถ) → ไม่รองรับ', () => {
    /* บิลด์เก่าจะเมินคำสั่งเราเงียบ ๆ ⇒ ถ้าตรงนี้ตอบ true ผู้ใช้ที่ยังไม่อัปเดตจะเห็น
       ปุ่มหมุนห้านาทีแล้วล็อกอินไม่ได้ ทั้งที่ทางเว็บยังใช้ได้ปกติ */
    const w = fakeWindow({ ReactNativeWebView: { postMessage: () => {} } })
    expect(nativeSupportsAppleSignIn(w)).toBe(false)
    expect(createWindowAppleTransport(w)).toBeNull()
  })

  it('อยู่ในแอปแต่ประกาศความสามารถอื่น → ยังไม่รองรับ', () => {
    const w = fakeWindow({
      ReactNativeWebView: { postMessage: () => {} },
      __DEEP_NATIVE_CAPS__: ['push', 'iap'],
    })
    expect(nativeSupportsAppleSignIn(w)).toBe(false)
  })

  it('เปลือกใหม่ที่ประกาศครบ → รองรับ และต่อท่อได้', () => {
    const post = vi.fn()
    const w = fakeWindow({
      ReactNativeWebView: { postMessage: post },
      __DEEP_NATIVE_CAPS__: ['push', CAP_APPLE_SIGNIN],
    })
    expect(nativeSupportsAppleSignIn(w)).toBe(true)
    const t = createWindowAppleTransport(w)
    expect(t).not.toBeNull()
    t!.post({ type: 'deep:apple-signin', requestId: 'r1', nonce: 'n1' })
    expect(JSON.parse(post.mock.calls[0][0])).toEqual({
      type: 'deep:apple-signin',
      requestId: 'r1',
      nonce: 'n1',
    })
  })

  it('🛑 อ่านผลตอน event ยิง ไม่ใช่ตอน subscribe', () => {
    /* native ตั้งค่าลง window **แล้วค่อย** ยิง event — อ่านตอน subscribe จะได้ค่าของ
       คำขอครั้งก่อน (หรือ undefined) ตลอดกาล */
    const w = fakeWindow({
      ReactNativeWebView: { postMessage: () => {} },
      __DEEP_NATIVE_CAPS__: [CAP_APPLE_SIGNIN],
    })
    const seen: unknown[] = []
    const t = createWindowAppleTransport(w)!
    const off = t.subscribe((raw) => seen.push(raw))
    expect(seen).toHaveLength(0)
    ;(w as unknown as Record<string, unknown>).__DEEP_APPLE_RESULT__ = { requestId: 'r1' }
    w.dispatch(APPLE_RESULT_EVENT)
    expect(seen).toEqual([{ requestId: 'r1' }])
    off()
    w.dispatch(APPLE_RESULT_EVENT)
    expect(seen).toHaveLength(1)
  })

  it('🛑 ต้องฟังประกาศความสามารถที่มาช้ากว่า hydrate', () => {
    /* inject เกิดหลังหน้าโหลดเสร็จ ซึ่งอาจช้ากว่าที่ React hydrate ⇒ ปุ่มที่อ่านครั้งเดียว
       ตอน mount จะสรุปว่า "ไม่รองรับ" ทุกครั้ง แล้วถอยไปทางเว็บ = บั๊กที่ Apple ตีกลับพอดี */
    const w = fakeWindow({ ReactNativeWebView: { postMessage: () => {} } })
    const seen: boolean[] = []
    const off = subscribeNativeCaps(w, (s) => seen.push(s))
    ;(w as unknown as Record<string, unknown>).__DEEP_NATIVE_CAPS__ = [CAP_APPLE_SIGNIN]
    w.dispatch(NATIVE_CAPS_EVENT)
    expect(seen).toEqual([true])
    off()
  })
})
