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
import { canUseAppleNative, runAppleNativeSignIn } from '@/lib/apple-native-signin'

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

const jsonFetch = (body: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch

describe('[blocker] เส้นทางสำเร็จ', () => {
  it('ได้ตั๋วกลับมาเมื่อ native และเซิร์ฟเวอร์ผ่านทั้งคู่', async () => {
    const { win } = appWindow(okReply)
    const out = await runAppleNativeSignIn({
      win,
      fetchImpl: jsonFetch({ ok: true, ticket: 'tkt-1' }),
    })
    expect(out).toEqual({ kind: 'ticket', ticket: 'tkt-1' })
  })

  it('🛑 nonce ที่ส่งให้เซิร์ฟเวอร์ ต้องเป็นตัวที่ *เว็บ* สร้าง ไม่ใช่ที่ native ส่งกลับ', async () => {
    /* ถ้าส่งค่าจาก native แอปที่ถูกแก้ไขจะกำหนด nonce เองได้ ⇒ การกันเล่นโทเคนซ้ำ
       หมดความหมายทั้งอัน เพราะผู้โจมตีเลือกค่าที่ตัวเองเตรียมโทเคนไว้แล้วได้ */
    const { win, posted } = appWindow(okReply)
    const fetchImpl = jsonFetch({ ok: true, ticket: 'tkt-1' })
    await runAppleNativeSignIn({ win, fetchImpl })
    const body = JSON.parse(
      (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0][1]
        .body as string,
    )
    expect(posted).toHaveLength(1)
    expect(body.nonce).toBe(posted[0].nonce)
    expect(body.identityToken).toBe(TOKEN)
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
    const fetchImpl = jsonFetch({ ok: true, ticket: 'ไม่ควรถูกเรียก' })
    const out = await runAppleNativeSignIn({ win, fetchImpl })
    expect(out).toEqual({ kind: 'cancelled' })
    expect(fetchImpl).not.toHaveBeenCalled()
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
    const out = await runAppleNativeSignIn({
      win,
      fetchImpl: jsonFetch({ ok: false, reason: 'NO_ACCOUNT' }),
    })
    expect(out).toEqual({ kind: 'no-account' })
  })

  it('เซิร์ฟเวอร์ปฏิเสธโทเคน → ถอยไปทางเว็บ (ทางเว็บไม่ได้รับผลจากการตั้งค่าที่ผิด)', async () => {
    const { win } = appWindow(okReply)
    const out = await runAppleNativeSignIn({
      win,
      fetchImpl: jsonFetch({ ok: false, reason: 'INVALID_TOKEN' }, 401),
    })
    expect(out).toEqual({ kind: 'fallback-to-web' })
  })

  it('เน็ตหลุดตอนยิงเข้าเซิร์ฟเวอร์ → ถอยไปทางเว็บ ไม่ throw ออกไปให้หน้าพัง', async () => {
    const { win } = appWindow(okReply)
    const fetchImpl = vi.fn(async () => {
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
    const fetchImpl = jsonFetch({ ok: true, ticket: 'ไม่ควรถูกเรียก' })
    expect(await runAppleNativeSignIn({ win, fetchImpl })).toEqual({ kind: 'fallback-to-web' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('คำตอบรูปร่างแปลก (ok=true แต่ไม่มีตั๋ว) → ถอยไปทางเว็บ ห้ามเดินต่อทั้งที่ไม่มีตั๋ว', async () => {
    const { win } = appWindow(okReply)
    const out = await runAppleNativeSignIn({ win, fetchImpl: jsonFetch({ ok: true }) })
    expect(out).toEqual({ kind: 'fallback-to-web' })
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
})
