/**
 * [blocker] ขั้นตอนเต็มของ "กดปุ่ม Apple ในแอป" (feature 00040 · ภาคผนวก 7)
 *
 * ## ทำไมต้องเป็น [blocker]
 *
 * Apple ตีกลับ 2026-09-24 (Guideline 4) เพราะปุ่มนี้พาไปหน้าเว็บของ Apple · การแก้คือ
 * ให้ native เปิดแผ่นของระบบแทน — แต่ **ของที่แก้แล้วพังง่ายกว่าของเดิม** เพราะมันมี
 * เส้นทาง 6 เส้นแทนที่จะมีเส้นเดียว และ 5 ใน 6 เส้นคือ "ไม่สำเร็จ ต้องไปต่อยังไง"
 *
 * เทสนี้คุม 2 เรื่องคู่กัน:
 *   1. **ทุกเส้นทางจบที่มีอะไรเกิดขึ้น** — ปุ่มที่กดแล้วเงียบคือข้อ 2.1(a) ที่เคยโดนมาแล้ว
 *   2. **หน้าจอเรียกใช้จริง** — โค้ดที่ถูกทุกบรรทัดแต่ไม่มีใครเรียก คือรูปร่างของบั๊กเดิมเป๊ะ
 *      (บทเรียนซ้ำของโปรเจกต์นี้: 3.1.2(c) เมื่อ 2026-09-25 ก็เป็นแบบนี้)
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it, vi } from 'vitest'

import { APPLE_RESULT_EVENT, CAP_APPLE_SIGNIN } from '@/lib/apple-bridge-protocol'
import { APPLE_NATIVE_TIMEOUT_MS } from '@/lib/apple-native-client'
import {
  APPLE_NATIVE_API_TIMEOUT_MS,
  canUseAppleNative,
  runAppleNativeLink,
  runAppleNativeSignIn,
} from '@/lib/apple-native-signin'
import { linkOutcomeRedirect } from '@/lib/oauth-link-outcome'

const TOKEN = 'eyJhbGciOiJSUzI1NiJ9.payload.sig'

/**
 * หน้าต่างจำลองที่ "เปลือกแอปตอบกลับเอง" — ตั้งค่าลง window แล้วยิง event
 * ตามสัญญาจริง เพื่อให้เส้นทางที่เทสเดินเหมือนของจริงทุกขั้น
 */
function appWindow(reply: (req: { requestId: string; nonce: string }) => unknown | null) {
  const handlers: (() => void)[] = []
  const posted: { requestId: string; nonce: string }[] = []
  const win = {
    __DEEP_NATIVE_CAPS__: [CAP_APPLE_SIGNIN],
    ReactNativeWebView: {
      postMessage: (raw: string) => {
        const req = JSON.parse(raw) as { requestId: string; nonce: string }
        posted.push(req)
        const res = reply(req)
        if (res === null) return /* เปลือกเงียบ — ปล่อยให้หมดเวลา */
        ;(win as unknown as Record<string, unknown>).__DEEP_APPLE_RESULT__ = res
        /* ยิงแบบ async เหมือนของจริง: native ตอบหลัง promise ของผู้เรียกถูกสร้างแล้ว */
        queueMicrotask(() => handlers.forEach((h) => h()))
      },
    },
    addEventListener: (k: string, fn: () => void) => {
      if (k === APPLE_RESULT_EVENT) handlers.push(fn)
    },
    removeEventListener: (k: string, fn: () => void) => {
      if (k === APPLE_RESULT_EVENT) handlers.splice(handlers.indexOf(fn), 1)
    },
  }
  return { win: win as unknown as Window, posted }
}

const okReply = (req: { requestId: string; nonce: string }) => ({
  requestId: req.requestId,
  ok: true,
  identityToken: TOKEN,
  nonce: req.nonce,
})

/** nonce ที่ "เซิร์ฟเวอร์" ออกให้ในเทส — ของจริงมาจากคุกกี้ httpOnly ที่ client แตะไม่ได้ */
const SERVER_NONCE = 'nonce-ที่เซิร์ฟเวอร์ออกให้-0123456789'

/**
 * fetch จำลองที่ตอบ **สอง** ปลายทางตามของจริง:
 *   `/start` → ออก nonce · ปลายทางหลัก → ผลการตรวจโทเคน
 *
 * คืนตัวนับแยกให้ด้วย เพราะเทสหลายเคสต้องพิสูจน์ว่า **ไม่เคยยิง** ปลายทางหลัก
 */
function fakeFetch(verifyBody: unknown, status = 200) {
  const verifyCalls: RequestInit[] = []
  const fn = vi.fn(async (url: unknown, init?: RequestInit) => {
    if (String(url).endsWith('/start')) {
      return new Response(JSON.stringify({ nonce: SERVER_NONCE }))
    }
    verifyCalls.push(init ?? {})
    return new Response(JSON.stringify(verifyBody), { status })
  })
  return { fetchImpl: fn as unknown as typeof fetch, verifyCalls }
}

describe('[blocker] เส้นทางสำเร็จ', () => {
  it('ได้ตั๋วกลับมาเมื่อ native และเซิร์ฟเวอร์ผ่านทั้งคู่', async () => {
    const { win } = appWindow(okReply)
    const { fetchImpl } = fakeFetch({ ok: true, ticket: 'tkt-1' })
    expect(await runAppleNativeSignIn({ win, fetchImpl })).toEqual({
      kind: 'ticket',
      ticket: 'tkt-1',
    })
  })

  it('🛑 nonce ที่ส่งให้ native ต้องเป็นตัวที่ *เซิร์ฟเวอร์* ออกให้ ไม่ใช่สุ่มเองฝั่งเว็บ', async () => {
    /**
     * ร่างแรกให้หน้าเว็บสุ่ม nonce เอง แล้วส่งมาพร้อมโทเคน — **กันการเล่นโทเคนซ้ำไม่ได้เลย**
     * เพราะผู้โจมตีคุมทั้งสองฝั่งของการเทียบ (ส่งโทเคนที่ขโมยมา พร้อมค่า nonce ที่อ่านออกมา
     * จากโทเคนใบนั้นเอง) · ตอนนี้เซิร์ฟเวอร์เก็บค่าไว้ในคุกกี้ httpOnly ที่หน้าเว็บแตะไม่ได้
     */
    const { win, posted } = appWindow(okReply)
    const { fetchImpl, verifyCalls } = fakeFetch({ ok: true, ticket: 'tkt-1' })
    await runAppleNativeSignIn({ win, fetchImpl })
    expect(posted).toHaveLength(1)
    expect(posted[0].nonce).toBe(SERVER_NONCE)

    /* 🛑 และ **ห้ามส่ง nonce กลับไปใน body** — ค่าที่ client ส่งมาต้องไม่มีผลต่อการตัดสิน */
    const body = JSON.parse(verifyCalls[0].body as string)
    expect(body).toEqual({ identityToken: TOKEN })
  })

  it('🛑 ขอ nonce ไม่สำเร็จ → ถอยไปทางเว็บ และห้ามเปิดแผ่นโดยไม่มี nonce', async () => {
    const { win, posted } = appWindow(okReply)
    const fetchImpl = vi.fn(async () => new Response('boom', { status: 500 })) as unknown as typeof fetch
    expect(await runAppleNativeSignIn({ win, fetchImpl })).toEqual({ kind: 'fallback-to-web' })
    expect(posted, 'เปิดแผ่นทั้งที่ยังไม่มี nonce = เปิดรอบที่เซิร์ฟเวอร์ตรวจไม่ได้').toHaveLength(0)
  })
})

describe('[blocker] ทุกเส้นทางที่ไม่สำเร็จต้องไปต่อได้ ไม่มีทางที่ปุ่มกดแล้วเงียบ', () => {
  it('ไม่ได้อยู่ในแอป (เบราว์เซอร์) → ถอยไปทางเว็บ', async () => {
    const out = await runAppleNativeSignIn({ win: undefined })
    expect(out).toEqual({ kind: 'fallback-to-web' })
  })

  it('🛑 แอปรุ่นเก่าที่ยังไม่มีโมดูล native → ถอยไปทางเว็บ ไม่ใช่รอจนหมดเวลา', async () => {
    const win = { ReactNativeWebView: { postMessage: () => {} } } as unknown as Window
    expect(canUseAppleNative(win)).toBe(false)
    expect(await runAppleNativeSignIn({ win })).toEqual({ kind: 'fallback-to-web' })
  })

  it('🛑 ผู้ใช้ปัดแผ่นทิ้ง → เงียบ และ **ห้ามยิงเข้าเซิร์ฟเวอร์**', async () => {
    /* เด้งไปหน้าเว็บของ Apple ต่อ = ไม่ฟังสิ่งที่ผู้ใช้เพิ่งบอก */
    const { win } = appWindow((req) => ({ requestId: req.requestId, ok: false, reason: 'CANCELLED' }))
    const { fetchImpl, verifyCalls } = fakeFetch({ ok: true, ticket: 'ไม่ควรถูกเรียก' })
    expect(await runAppleNativeSignIn({ win, fetchImpl })).toEqual({ kind: 'cancelled' })
    expect(verifyCalls, 'ยิงโทเคนเข้าเซิร์ฟเวอร์ทั้งที่ผู้ใช้ยกเลิก').toHaveLength(0)
  })

  it('แผ่นระบบล้ม (FAILED) → ถอยไปทางเว็บ', async () => {
    const { win } = appWindow((req) => ({ requestId: req.requestId, ok: false, reason: 'FAILED' }))
    expect(await runAppleNativeSignIn({ win })).toEqual({ kind: 'fallback-to-web' })
  })

  it('เปลือกเงียบ → หมดเวลาแล้วถอยไปทางเว็บ', async () => {
    const { win } = appWindow(() => null)
    const out = await runAppleNativeSignIn({ win, timeoutMs: 20 })
    expect(out).toEqual({ kind: 'fallback-to-web' })
  })

  it('🛑 Apple ID ที่ไม่มีบัญชีผู้ขาย → no-account (ไม่ใช่ fallback)', async () => {
    /* ถ้าตอบ fallback ผู้ใช้จะถูกพาไปหน้าเว็บของ Apple แล้ววนกลับมาที่เดิม
       — ทีมรีวิวของ Apple เดินเส้นนี้เสมอ เพราะเขาไม่มีบัญชี Deep */
    const { win } = appWindow(okReply)
    const { fetchImpl } = fakeFetch({ ok: false, reason: 'NO_ACCOUNT' })
    expect(await runAppleNativeSignIn({ win, fetchImpl })).toEqual({ kind: 'no-account' })
  })

  it('เซิร์ฟเวอร์ปฏิเสธโทเคน → ถอยไปทางเว็บ (ทางเว็บไม่ได้รับผลจากการตั้งค่าที่ผิด)', async () => {
    const { win } = appWindow(okReply)
    const { fetchImpl } = fakeFetch({ ok: false, reason: 'INVALID_TOKEN' }, 401)
    expect(await runAppleNativeSignIn({ win, fetchImpl })).toEqual({ kind: 'fallback-to-web' })
  })

  it('เน็ตหลุดตอนยิงเข้าเซิร์ฟเวอร์ → ถอยไปทางเว็บ ไม่ throw ออกไปให้หน้าพัง', async () => {
    const { win } = appWindow(okReply)
    const fetchImpl = vi.fn(async (url: unknown) => {
      if (String(url).endsWith('/start')) return new Response(JSON.stringify({ nonce: SERVER_NONCE }))
      throw new Error('offline')
    }) as unknown as typeof fetch
    expect(await runAppleNativeSignIn({ win, fetchImpl })).toEqual({ kind: 'fallback-to-web' })
  })

  it('🛑 เปลือกตอบ nonce คนละตัวกับที่ขอไป → ถอยไปทางเว็บ ห้ามยิงโทเคนนั้นเข้าเซิร์ฟเวอร์', async () => {
    /**
     * เปลือกที่ถูกแก้ไขจะกำหนด nonce เองได้ถ้าเราไม่เทียบ ⇒ ผู้โจมตีเตรียมโทเคนที่ผูกกับ
     * nonce ที่ตัวเองรู้ไว้ล่วงหน้าแล้วเล่นซ้ำได้
     *
     * 🛑 เคสนี้ถูกเพิ่มเพราะ mutation "ส่ง `result.nonce` แทน `nonce` ที่เว็บสร้าง" **ไม่แดง** —
     * ตรวจแล้วพบว่าเป็น mutation ที่ไม่เปลี่ยนพฤติกรรม เพราะบนเส้นทางสำเร็จสองค่านี้เท่ากันเสมอ
     * *ด้วยผลของด่านเทียบ nonce ในตัว client* · เทสนี้จึงมาปักด่านนั้นไว้ในเส้นทางนี้โดยตรง
     * ถ้าใครถอดด่านออก การส่งค่าจาก native จะกลายเป็นช่องโหว่จริงทันที และตรงนี้จะแดง
     * (ดู `docs/conventions/mutation-silence-means-weak-corpus.md`)
     */
    const { win } = appWindow((req) => ({
      requestId: req.requestId,
      ok: true,
      identityToken: TOKEN,
      nonce: 'nonce-ที่เปลือกกำหนดเอง',
    }))
    const { fetchImpl, verifyCalls } = fakeFetch({ ok: true, ticket: 'ไม่ควรถูกเรียก' })
    expect(await runAppleNativeSignIn({ win, fetchImpl })).toEqual({ kind: 'fallback-to-web' })
    expect(verifyCalls).toHaveLength(0)
  })

  it('คำตอบรูปร่างแปลก (ok=true แต่ไม่มีตั๋ว) → ถอยไปทางเว็บ ห้ามเดินต่อทั้งที่ไม่มีตั๋ว', async () => {
    const { win } = appWindow(okReply)
    const { fetchImpl } = fakeFetch({ ok: true })
    expect(await runAppleNativeSignIn({ win, fetchImpl })).toEqual({ kind: 'fallback-to-web' })
  })
})

describe('[blocker] เซิร์ฟเวอร์ไม่ตอบ (ไม่ใช่ปฏิเสธ) ต้องหมดเวลา ไม่ใช่หมุนตลอดกาล', () => {
  /**
   * 🛑 นี่คือรูปร่างของ **2.1(a) ที่ Apple ตีกลับ 2026-09-27** เป๊ะที่สุด: ไม่มี error
   * ไม่มีอะไรบนจอเปลี่ยน ปุ่มหมุนแล้วจบ · `fetch` **ไม่ reject** เมื่อซ็อกเก็ตค้าง
   * (มือถือสลับ Wi-Fi↔เซลลูลาร์ทำท่านี้เป็นปกติ) ⇒ `try/catch` ไม่มีอะไรให้จับ
   *
   * เทสนี้ผูก **พฤติกรรม** ไม่ใช่การมีอยู่ของ `AbortController` — ถอด timeout ออกแล้ว
   * เทสจะค้างจนหมดเวลาของ vitest ซึ่งนับเป็นแดง
   */
  const hang = () => new Promise<Response>(() => {})

  it('🛑 ขอ nonce แล้วเซิร์ฟเวอร์ไม่ตอบ → ถอยไปทางเว็บ และห้ามเปิดแผ่น', async () => {
    const { win, posted } = appWindow(okReply)
    const fetchImpl = vi.fn(hang) as unknown as typeof fetch
    expect(await runAppleNativeSignIn({ win, fetchImpl, apiTimeoutMs: 20 })).toEqual({
      kind: 'fallback-to-web',
    })
    expect(posted, 'เปิดแผ่นทั้งที่ยังไม่มี nonce').toHaveLength(0)
  })

  it('🛑 ส่งโทเคนไปตรวจแล้วเซิร์ฟเวอร์ไม่ตอบ → ถอยไปทางเว็บ', async () => {
    const { win } = appWindow(okReply)
    const fetchImpl = vi.fn(async (url: unknown) => {
      if (String(url).endsWith('/start')) return new Response(JSON.stringify({ nonce: SERVER_NONCE }))
      return hang()
    }) as unknown as typeof fetch
    expect(await runAppleNativeSignIn({ win, fetchImpl, apiTimeoutMs: 20 })).toEqual({
      kind: 'fallback-to-web',
    })
  })

  it('🛑 ตอบหัวมาแล้วค้างกลางเนื้อ → ต้องหมดเวลาด้วย (กันแค่ตอนเชื่อมต่อไม่พอ)', async () => {
    const { win } = appWindow(okReply)
    const fetchImpl = vi.fn(async (url: unknown) => {
      if (String(url).endsWith('/start')) return new Response(JSON.stringify({ nonce: SERVER_NONCE }))
      /* Response ที่มีหัวครบแต่ `json()` ไม่ยอม settle — เลียนแบบสตรีมที่ค้างกลางทาง */
      return { ok: true, json: () => new Promise(() => {}) } as unknown as Response
    }) as unknown as typeof fetch
    expect(await runAppleNativeSignIn({ win, fetchImpl, apiTimeoutMs: 20 })).toEqual({
      kind: 'fallback-to-web',
    })
  })

  it('🛑 เชื่อมบัญชีที่ /account ก็ต้องมีเพดานเดียวกัน', async () => {
    const { win } = appWindow(okReply)
    const fetchImpl = vi.fn(async (url: unknown) => {
      if (String(url).endsWith('/start')) return new Response(JSON.stringify({ nonce: SERVER_NONCE }))
      return hang()
    }) as unknown as typeof fetch
    expect(await runAppleNativeLink({ win, fetchImpl, apiTimeoutMs: 20 })).toEqual({
      kind: 'fallback-to-web',
    })
  })

  it('🛑 เพดานของ "เซิร์ฟเวอร์เรา" ต้องสั้นกว่าเพดานของ "แผ่นที่ Apple เป็นเจ้าของ" มาก', () => {
    /**
     * สองค่านี้ตอบคนละคำถาม และเคยมีคนอยากยุบรวม: `APPLE_NATIVE_TIMEOUT_MS` ยาว 300 วิ
     * เพราะผู้ใช้กำลังรอ SMS ของ 2FA (ตั้งสั้น = โกหกว่าล้มเหลว — บทเรียน TestFlight
     * 2026-09-10) ส่วนตัวนี้ไม่มีมนุษย์อยู่ในนั้นเลย · เอาค่ายาวมาใช้กับ API
     * = ปุ่มหมุน 5 นาทีก่อนบอกอะไรผู้ใช้ ซึ่งคือ 2.1(a) กลับมาอีกรอบ
     */
    expect(APPLE_NATIVE_API_TIMEOUT_MS).toBeLessThanOrEqual(30_000)
    expect(APPLE_NATIVE_API_TIMEOUT_MS).toBeGreaterThanOrEqual(5_000)
    expect(APPLE_NATIVE_API_TIMEOUT_MS).toBeLessThan(APPLE_NATIVE_TIMEOUT_MS)
  })
})

// ─── หน้าจอต้องเรียกใช้จริง ──────────────────────────────────────────────────

/** ตัดคอมเมนต์ก่อนสแกน — ไฟล์พวกนี้อ้างชื่อฟังก์ชันในคำอธิบายบั๊กของตัวเอง */
function code(rel: string): string {
  return readFileSync(rel, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

const SIGN_IN_FORM = 'src/app/(paces)/seller/auth/sign-in/components/SignInForm.tsx'
const ACCOUNT_CARD =
  'src/app/(paces)/seller/(dashboard)/account/components/ConnectedAccountsClient.tsx'

describe('[blocker] เชื่อมบัญชี Apple ที่ /account ก็ต้องใช้แผ่นของระบบ', () => {
  it('🛑 ผ่านแล้วต้องได้ปลายทางที่หน้าจออ่านผลลัพธ์ได้', async () => {
    const { win } = appWindow(okReply)
    const { fetchImpl } = fakeFetch({ ok: true, kind: 'linked', redirect: '/account?linked=apple' })
    expect(await runAppleNativeLink({ win, fetchImpl })).toEqual({
      kind: 'done',
      redirect: '/account?linked=apple',
    })
  })

  it('🛑 ผู้ใช้ปัดแผ่นทิ้ง → เงียบ ห้ามยิงเข้าเซิร์ฟเวอร์และห้ามเด้งหน้าเว็บ Apple', async () => {
    const { win } = appWindow((req) => ({ requestId: req.requestId, ok: false, reason: 'CANCELLED' }))
    const { fetchImpl, verifyCalls } = fakeFetch({ ok: true, redirect: '/account?linked=apple' })
    expect(await runAppleNativeLink({ win, fetchImpl })).toEqual({ kind: 'cancelled' })
    expect(verifyCalls).toHaveLength(0)
  })

  it('เบราว์เซอร์ / บิลด์เก่า → ถอยไปทางเว็บ (คุกกี้ link-intent + signIn)', async () => {
    expect(await runAppleNativeLink({ win: undefined })).toEqual({ kind: 'fallback-to-web' })
  })

  it('เซิร์ฟเวอร์ปฏิเสธ หรือคำตอบไม่มีปลายทาง → ถอยไปทางเว็บ', async () => {
    const { win } = appWindow(okReply)
    const { fetchImpl } = fakeFetch({ ok: false, reason: 'INVALID_TOKEN' }, 401)
    expect(await runAppleNativeLink({ win, fetchImpl })).toEqual({ kind: 'fallback-to-web' })

    const { win: w2 } = appWindow(okReply)
    const { fetchImpl: f2 } = fakeFetch({ ok: true })
    expect(await runAppleNativeLink({ win: w2, fetchImpl: f2 })).toEqual({ kind: 'fallback-to-web' })
  })

  it('🛑 ปลายทางต้องมาจาก SSOT เดียวกับทางเว็บ ไม่ใช่สตริงที่ endpoint แต่งเอง', () => {
    /* ถ้าสองทางพาไปคนละที่ ผู้ใช้จะเห็นผลลัพธ์บ้างไม่เห็นบ้างแล้วแต่ว่าเข้าทางไหน (HR16) */
    expect(linkOutcomeRedirect('apple', { kind: 'linked' })).toBe('/account?linked=apple')
    expect(linkOutcomeRedirect('apple', { kind: 'already-linked' })).toBe('/account?linked=apple')
    expect(linkOutcomeRedirect('apple', { kind: 'taken' })).toBe('/account?link_error=taken')
    expect(linkOutcomeRedirect('apple', { kind: 'reclaimable', ticket: 'a b/c' })).toBe(
      '/account?link_error=reclaimable&ticket=a%20b%2Fc',
    )
  })
})

describe('[blocker] ปุ่มในหน้าล็อกอินต้องเรียกใช้จริง ไม่ใช่แค่มีโมดูล', () => {
  it('🛑 หน้าล็อกอินต้องเรียก runAppleNativeSignIn — import เฉย ๆ คือบั๊กเดิมที่ Apple ตีกลับ', () => {
    const src = code(SIGN_IN_FORM)
    expect(src).toMatch(/canUseAppleNative\(/)
    expect(src).toMatch(/await runAppleNativeSignIn\(/)
  })

  it('🛑 ต้องยังมีทางถอยไป signIn(\'apple\') อยู่ — ถอดออก = แอปรุ่นเก่าล็อกอินไม่ได้', () => {
    /* ผู้ใช้ที่ยังไม่อัปเดตแอป และผู้ใช้เบราว์เซอร์ทุกคน เดินเส้นนี้ทั้งหมด */
    expect(code(SIGN_IN_FORM)).toMatch(/signIn\('apple',/)
  })

  it('🛑 เส้นทาง no-account ต้องใช้ธงเดียวกับด่าน 3.1.1 ไม่ mint ข้อความใหม่ (HR16)', () => {
    expect(code(SIGN_IN_FORM)).toMatch(/app_no_account=1/)
  })

  it('🛑 การ์ด "วิธีเข้าสู่ระบบ" ที่ /account ต้องเรียกทาง native ด้วย', () => {
    /* แก้เฉพาะหน้าล็อกอินแล้วยังโดนข้อเดิมได้ — ปุ่มนี้พาไป appleid.apple.com เหมือนกัน
       และทีมรีวิวเดินเข้าหน้านี้แน่นอนเพราะปุ่ม "ลบบัญชี" อยู่ที่นี่ (Guideline 5.1.1(v)) */
    const src = code(ACCOUNT_CARD)
    expect(src).toMatch(/canUseAppleNative\(/)
    expect(src).toMatch(/await runAppleNativeLink\(/)
  })

  it('🛑 การ์ดนั้นต้องยังมีทางถอยไป signIn ทางเว็บอยู่', () => {
    expect(code(ACCOUNT_CARD)).toMatch(/await signIn\(provider,/)
  })

  it('🛑 ผู้ใช้ยกเลิกแผ่น → ต้องหยุด **ก่อน** ถึงทางเว็บ ไม่ใช่เด้งหน้า Apple ตาม', () => {
    /**
     * เคสนี้ถูกเพิ่มเพราะ mutation "ลบสาขา cancelled ทิ้ง" **ไม่แดง** — ตรวจแล้วพบว่า
     * เทสชุดเดิมคุมแค่ "เรียกทาง native ไหม" ไม่ได้คุมว่า "ทำอะไรกับผลลัพธ์แต่ละแบบ"
     * ⇒ ชุดข้อมูลทดสอบอ่อนจริง ไม่ใช่ mutation ไม่เกี่ยว
     * (`docs/conventions/mutation-silence-means-weak-corpus.md`)
     *
     * ⚠️ ยอมรับข้อจำกัด: รีโปไม่มี jsdom ⇒ mount การ์ดนี้ในเทสไม่ได้ · สแกนซอร์สจับได้แค่
     * "สาขานั้นมีอยู่และอยู่ก่อนทางเว็บ" ซึ่งเป็นสิ่งที่หายไปจริงตอน mutation
     */
    const src = code(ACCOUNT_CARD)
    const at = src.indexOf("outcome.kind === 'cancelled'")
    expect(at, 'ไม่มีสาขารับ "ผู้ใช้ยกเลิก" — กดยกเลิกแล้วจะถูกเด้งไปหน้าเว็บของ Apple').toBeGreaterThan(-1)
    const web = src.indexOf('await signIn(provider,')
    expect(web, 'หาเส้นทางถอยไม่เจอ').toBeGreaterThan(-1)
    expect(at, 'สาขายกเลิกอยู่หลังทางเว็บ = ไม่มีผล').toBeLessThan(web)
  })
})
