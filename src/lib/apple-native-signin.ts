'use client'

/**
 * apple-native-signin — ขั้นตอนเต็มของ "กดปุ่ม Apple ในแอป" ฝั่งหน้าเว็บ
 * (feature 00040 · ภาคผนวก 7)
 *
 * รวมสามอย่างไว้ที่เดียว: สั่ง native เปิดแผ่น → ส่งโทเคนให้เซิร์ฟเวอร์ตรวจ → แปลผลเป็น
 * "สิ่งที่หน้าจอต้องทำต่อ"
 *
 * ## 🛑 ทำไมต้องเป็นตัวกลาง ไม่ให้แต่ละหน้าเขียนเอง
 *
 * มีผู้เรียก **2 ราย** — หน้าล็อกอินผู้ขาย และการ์ด "วิธีเข้าสู่ระบบ" ใน `/account` —
 * และทั้งคู่ต้องตัดสินใจเรื่องเดียวกันเป๊ะ ๆ ว่า "เมื่อไหร่ถอยไปใช้ทางเว็บ"
 * ปล่อยให้เขียนเอง = วันหนึ่งจะมีที่หนึ่งถอย อีกที่ค้าง แล้วไม่มี gate ไหนฟ้อง
 * (บทเรียนเดียวกับ `goAfterLogin` ที่รวม 8 จุดไว้ที่เดียวด้วยเหตุผลนี้)
 *
 * ## 🛑 ทุกเส้นทางต้องจบที่ "มีอะไรเกิดขึ้น"
 *
 * ปุ่มที่กดแล้วเงียบคือสิ่งที่ Apple ตีกลับมาแล้วด้วยข้อ 2.1(a) ⇒ ผลลัพธ์ทุกแบบของฟังก์ชันนี้
 * มีการกระทำที่ผู้เรียกต้องทำต่อเสมอ ไม่มีค่าไหนที่แปลว่า "ไม่ต้องทำอะไร" ยกเว้น
 * `cancelled` ซึ่งคือ **ผู้ใช้ตั้งใจ** ให้ไม่มีอะไรเกิดขึ้น
 */
import { createAppleNativeClient } from '@/lib/apple-native-client'
import { createWindowAppleTransport, nativeSupportsAppleSignIn } from '@/lib/apple-native-transport'

export type AppleNativeOutcome =
  /** ผ่านแล้ว — เอาตั๋วไปเรียก `signIn('mobile-ticket')` ต่อ */
  | { kind: 'ticket'; ticket: string }
  /** Apple ID นี้ไม่มีบัญชีผู้ขาย — ต้องขึ้นข้อความเดียวกับด่าน 3.1.1 */
  | { kind: 'no-account' }
  /** ผู้ใช้ปัดแผ่นทิ้งเอง — เงียบถูกแล้ว */
  | { kind: 'cancelled' }
  /** สั่ง native ไม่ได้/ล้มเหลว — ผู้เรียกต้อง **ถอยไปใช้ `signIn('apple')` ทางเว็บ** */
  | { kind: 'fallback-to-web' }

export interface AppleNativeSignInDeps {
  win?: Window
  /* ฉีดเข้ามาได้เพื่อเทส — ไม่ต้องมี DOM หรือเครือข่ายจริง */
  fetchImpl?: typeof fetch
  /** เพดานเวลารอ **แผ่นของระบบ** (ค่าตั้งต้น `APPLE_NATIVE_TIMEOUT_MS`) */
  timeoutMs?: number
  /** เพดานเวลารอ **เซิร์ฟเวอร์ของเรา** (ค่าตั้งต้น `APPLE_NATIVE_API_TIMEOUT_MS`) */
  apiTimeoutMs?: number
}

/**
 * เพดานเวลาของคำขอที่ **เราเป็นเจ้าของเวลาเอง** (มิลลิวินาที)
 *
 * 🛑 **แยกจาก `APPLE_NATIVE_TIMEOUT_MS` (300 วิ) โดยตั้งใจ ห้ามยุบรวม** — ตัวนั้นคือเวลาที่
 * **Apple** เป็นเจ้าของ (ผู้ใช้กรอกรหัส Apple ID · รอ SMS ของ 2FA) ตั้งสั้นแล้วเราจะโกหก
 * ว่าล้มเหลวทั้งที่เขายังทำอยู่ · ตัวนี้คือเวลาที่ **เซิร์ฟเวอร์เรา** ใช้ตอบ
 * ซึ่งไม่มีมนุษย์อยู่ในนั้นเลย เกิน 15 วินาที = ไม่ได้ช้า แต่ไม่มา
 *
 * 🛑 **ไม่มีเพดาน = ปุ่มหมุนค้างตลอดกาล** — `fetch` ไม่ reject เมื่อซ็อกเก็ตค้าง (มือถือ
 * สลับ Wi-Fi↔เซลลูลาร์ทำท่านี้เป็นปกติ: ไม่มีใครปฏิเสธการเชื่อมต่อ มันแค่ไม่มีคำตอบ)
 * และ "ปุ่มหมุนแล้วไม่มีอะไรเกิดขึ้น" คือถ้อยคำที่ Apple ใช้ตีกลับข้อ **2.1(a)** เป๊ะ ๆ
 */
export const APPLE_NATIVE_API_TIMEOUT_MS = 15_000

/** คำตอบที่ได้กลับมาจริง — `null` = ไม่มีคำตอบเลย (เน็ตล้ม / หมดเวลา) */
type ApiReply = { ok: boolean; body: unknown }

/**
 * ยิง POST โดยมีเพดานเวลา
 *
 * 🛑 **นับเวลาคลุมการอ่านเนื้อคำตอบด้วย ไม่ใช่แค่ตอนเชื่อมต่อ** — เซิร์ฟเวอร์ที่ส่งหัวมาแล้ว
 * ค้างกลางเนื้อ ทำให้ `res.json()` ค้างได้เหมือนกัน กันแค่ครึ่งแรกจึงไม่ได้กันอะไร
 *
 * 🛑 **ต้องใช้ทั้ง `AbortController` และการแข่งกับตัวจับเวลา — อย่างใดอย่างเดียวไม่พอ**
 * `abort()` ปล่อยซ็อกเก็ตทิ้งได้ (ดีต่อเครื่อง) แต่ **มีผลเฉพาะเมื่อฝั่งรับ signal ทำตาม**
 * ส่วนการแข่งเป็นตัวรับประกันว่า "ผู้เรียกได้คำตอบแน่ ๆ ภายในเวลานี้" ซึ่งเป็นสิ่งเดียวที่
 * ผู้ใช้สนใจ (และเป็นสิ่งที่ผูกด้วยเทสได้ — ท่าที่พึ่ง `abort` ล้วนพิสูจน์ไม่ได้ว่ากันได้จริง)
 */
async function postWithTimeout(
  doFetch: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<ApiReply | null> {
  /* เปลือกเก่า/สภาพแวดล้อมเทสบางตัวไม่มี AbortController — ไม่มีก็ยิงต่อ ดีกว่าโยน error */
  const ctrl = typeof AbortController === 'undefined' ? null : new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined

  const expired = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      ctrl?.abort()
      resolve(null)
    }, timeoutMs)
  })

  /* 🛑 ตัวนี้ห้าม reject — ถ้า reject หลังการแข่งจบไปแล้วจะกลายเป็น unhandled rejection */
  const attempt = (async (): Promise<ApiReply | null> => {
    try {
      const res = await doFetch(url, ctrl ? { ...init, signal: ctrl.signal } : init)
      const body = await res.json().catch(() => null)
      return { ok: res.ok, body }
    } catch {
      return null
    }
  })()

  try {
    return await Promise.race([attempt, expired])
  } finally {
    clearTimeout(timer)
  }
}

/** เปลือกรุ่นนี้ทำได้ไหม — ผู้เรียกใช้ตัดสินว่าจะเรียกตัวล่างหรือไปทางเว็บเลย */
export function canUseAppleNative(win: Window | undefined): boolean {
  return nativeSupportsAppleSignIn(win)
}

/** ผลของขั้น "ขอโทเคนจากแผ่นของระบบ" — ส่วนที่ผู้เรียกทั้งสองรายใช้ร่วมกัน */
type TokenStep =
  | { kind: 'token'; identityToken: string; doFetch: typeof fetch; apiTimeoutMs: number }
  | { kind: 'cancelled' }
  | { kind: 'fallback-to-web' }

/**
 * ขอ nonce → เปิดแผ่น → ได้โทเคน
 *
 * 🛑 แยกออกมาเพราะมี **ผู้เรียก 2 ราย** (ล็อกอิน · เชื่อมบัญชีที่ `/account`) ที่ต้อง
 * ตัดสินใจเรื่องเดียวกันเป๊ะว่า "เมื่อไหร่ถอยไปใช้ทางเว็บ" — ปล่อยให้เขียนเอง วันหนึ่ง
 * จะมีที่หนึ่งถอย อีกที่ค้าง แล้วไม่มี gate ไหนฟ้อง (Hard Rule 16)
 */
async function obtainAppleToken(deps: AppleNativeSignInDeps): Promise<TokenStep> {
  const win = deps.win ?? (typeof window === 'undefined' ? undefined : window)
  const transport = createWindowAppleTransport(win)
  if (!transport) return { kind: 'fallback-to-web' }

  const doFetch = deps.fetchImpl ?? fetch
  const apiTimeoutMs = deps.apiTimeoutMs ?? APPLE_NATIVE_API_TIMEOUT_MS

  /**
   * ขอ nonce จากเซิร์ฟเวอร์ก่อนเปิดแผ่น
   *
   * 🛑 เซิร์ฟเวอร์เก็บค่าเดียวกันไว้ในคุกกี้ httpOnly แล้วใช้ค่านั้นเป็นตัวเทียบ ⇒ หน้าเว็บ
   * แก้ไม่ได้ และโทเคนเก่าที่ขโมยมาถือ nonce ของรอบอื่นจึงไม่มีวันตรง
   * (ร่างแรกให้หน้าเว็บสุ่มเอง — เป็นด่านที่ดูเหมือนมีแต่ไม่กันอะไร ดู `start/route.ts`)
   */
  const startReply = await postWithTimeout(
    doFetch,
    '/api/login/apple-native/start',
    { method: 'POST', credentials: 'include' },
    apiTimeoutMs,
  )
  const startBody = startReply?.body as { nonce?: string } | null | undefined
  if (!startReply?.ok || typeof startBody?.nonce !== 'string' || startBody.nonce.length < 8) {
    return { kind: 'fallback-to-web' }
  }
  const nonce = startBody.nonce

  const client = createAppleNativeClient(transport, { timeoutMs: deps.timeoutMs })
  const result = await client.signIn(nonce)

  if (!result.ok) {
    /* ผู้ใช้ปัดทิ้งเอง = เขาเลือกที่จะไม่ล็อกอิน · เด้งไปหน้าเว็บของ Apple ต่อคือการ
       ไม่ฟังสิ่งที่เขาเพิ่งบอก และเป็นพฤติกรรมที่น่ารำคาญที่สุดที่ปุ่มนี้ทำได้ */
    return result.reason === 'CANCELLED' ? { kind: 'cancelled' } : { kind: 'fallback-to-web' }
  }

  return { kind: 'token', identityToken: result.identityToken, doFetch, apiTimeoutMs }
}

export async function runAppleNativeSignIn(
  deps: AppleNativeSignInDeps = {},
): Promise<AppleNativeOutcome> {
  const step = await obtainAppleToken(deps)
  if (step.kind !== 'token') return step
  const { identityToken, doFetch, apiTimeoutMs } = step

  /* ไม่มีคำตอบ (เน็ตหลุด/หมดเวลา) — ทางเว็บใช้เครือข่ายเดียวกันและน่าจะล้มเหมือนกัน
     แต่อย่างน้อยผู้ใช้จะได้เห็นข้อความจากที่นั่น ไม่ใช่ปุ่มที่กดแล้วเงียบ */
  const reply = await postWithTimeout(
    doFetch,
    '/api/login/apple-native',
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      /**
       * 🛑 **ไม่ส่ง nonce ไปด้วย** — เซิร์ฟเวอร์อ่านจากคุกกี้ httpOnly ที่ตัวเองตั้งไว้
       * ค่าที่ client ส่งมาจะถูกเมินทั้งหมด ซึ่งเป็นเหตุผลทั้งหมดที่ด่านนี้กันอะไรได้จริง
       */
      body: JSON.stringify({ identityToken }),
    },
    apiTimeoutMs,
  )

  const body = reply?.body as { ok?: boolean; ticket?: string; reason?: string } | null | undefined

  if (body?.ok === true && typeof body.ticket === 'string' && body.ticket.length > 0) {
    return { kind: 'ticket', ticket: body.ticket }
  }
  if (body?.reason === 'NO_ACCOUNT') return { kind: 'no-account' }

  /**
   * โทเคนไม่ผ่าน (`INVALID_TOKEN`) หรือคำตอบรูปร่างแปลก
   *
   * ⚠️ ถอยไปทางเว็บโดยตั้งใจ: สาเหตุที่เป็นไปได้มากที่สุดในวันแรกคือ **ตั้งค่าใน
   * พอร์ทัล Apple ยังไม่ครบ** (identifier ยังไม่ถูกจัดกลุ่ม) ซึ่งทางเว็บไม่ได้รับผลกระทบ
   * ⇒ ผู้ใช้ยังล็อกอินได้ ส่วนเราเห็นเหตุผลจริงใน log ของเซิร์ฟเวอร์
   */
  return { kind: 'fallback-to-web' }
}

/** ผลของ "เชื่อมบัญชี Apple" ในแอป */
export type AppleNativeLinkOutcome =
  /** จบแล้ว — พาไป `redirect` เพื่อให้แถบผลลัพธ์ (`?linked=` / `?link_error=`) ถูกอ่าน */
  | { kind: 'done'; redirect: string }
  | { kind: 'cancelled' }
  /** ถอยไปใช้ทางเว็บ (`signIn('apple')` + คุกกี้ link-intent) เหมือนเดิมทุกประการ */
  | { kind: 'fallback-to-web' }

/**
 * เชื่อม Apple เข้าบัญชีที่ล็อกอินอยู่ ด้วยแผ่นของระบบ
 *
 * 🛑 ต้องมีทางนี้ ไม่ใช่แก้แค่หน้าล็อกอิน — ปุ่ม "เชื่อมบัญชี Apple" ที่ `/account`
 * พาไป `appleid.apple.com` เหมือนกัน และทีมรีวิวของ Apple เดินเข้าหน้านั้นแน่นอน
 * เพราะปุ่ม "ลบบัญชี" อยู่ที่นั่น ซึ่ง Guideline 5.1.1(v) บังคับให้เขาไปตรวจ
 */
export async function runAppleNativeLink(
  deps: AppleNativeSignInDeps = {},
): Promise<AppleNativeLinkOutcome> {
  const step = await obtainAppleToken(deps)
  if (step.kind !== 'token') return step
  const { identityToken, doFetch, apiTimeoutMs } = step

  const reply = await postWithTimeout(
    doFetch,
    '/api/account/link/apple-native',
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identityToken }),
    },
    apiTimeoutMs,
  )

  const body = reply?.body as { ok?: boolean; redirect?: string } | null | undefined
  if (body?.ok === true && typeof body.redirect === 'string' && body.redirect.length > 0) {
    return { kind: 'done', redirect: body.redirect }
  }
  /* โทเคนไม่ผ่าน / คำตอบรูปร่างแปลก → ทางเว็บยังใช้ได้ (ไม่ได้รับผลจากการตั้งค่าที่ผิด) */
  return { kind: 'fallback-to-web' }
}
