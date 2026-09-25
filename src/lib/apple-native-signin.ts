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
  timeoutMs?: number
}

/** เปลือกรุ่นนี้ทำได้ไหม — ผู้เรียกใช้ตัดสินว่าจะเรียกตัวล่างหรือไปทางเว็บเลย */
export function canUseAppleNative(win: Window | undefined): boolean {
  return nativeSupportsAppleSignIn(win)
}

/** ผลของขั้น "ขอโทเคนจากแผ่นของระบบ" — ส่วนที่ผู้เรียกทั้งสองรายใช้ร่วมกัน */
type TokenStep =
  | { kind: 'token'; identityToken: string; doFetch: typeof fetch }
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

  /**
   * ขอ nonce จากเซิร์ฟเวอร์ก่อนเปิดแผ่น
   *
   * 🛑 เซิร์ฟเวอร์เก็บค่าเดียวกันไว้ในคุกกี้ httpOnly แล้วใช้ค่านั้นเป็นตัวเทียบ ⇒ หน้าเว็บ
   * แก้ไม่ได้ และโทเคนเก่าที่ขโมยมาถือ nonce ของรอบอื่นจึงไม่มีวันตรง
   * (ร่างแรกให้หน้าเว็บสุ่มเอง — เป็นด่านที่ดูเหมือนมีแต่ไม่กันอะไร ดู `start/route.ts`)
   */
  let nonce: string
  try {
    const startRes = await doFetch('/api/login/apple-native/start', {
      method: 'POST',
      credentials: 'include',
    })
    const startBody = (await startRes.json().catch(() => null)) as { nonce?: string } | null
    if (!startRes.ok || typeof startBody?.nonce !== 'string' || startBody.nonce.length < 8) {
      return { kind: 'fallback-to-web' }
    }
    nonce = startBody.nonce
  } catch {
    return { kind: 'fallback-to-web' }
  }

  const client = createAppleNativeClient(transport, { timeoutMs: deps.timeoutMs })
  const result = await client.signIn(nonce)

  if (!result.ok) {
    /* ผู้ใช้ปัดทิ้งเอง = เขาเลือกที่จะไม่ล็อกอิน · เด้งไปหน้าเว็บของ Apple ต่อคือการ
       ไม่ฟังสิ่งที่เขาเพิ่งบอก และเป็นพฤติกรรมที่น่ารำคาญที่สุดที่ปุ่มนี้ทำได้ */
    return result.reason === 'CANCELLED' ? { kind: 'cancelled' } : { kind: 'fallback-to-web' }
  }

  return { kind: 'token', identityToken: result.identityToken, doFetch }
}

export async function runAppleNativeSignIn(
  deps: AppleNativeSignInDeps = {},
): Promise<AppleNativeOutcome> {
  const step = await obtainAppleToken(deps)
  if (step.kind !== 'token') return step
  const { identityToken, doFetch } = step

  let res: Response
  try {
    res = await doFetch('/api/login/apple-native', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      /**
       * 🛑 **ไม่ส่ง nonce ไปด้วย** — เซิร์ฟเวอร์อ่านจากคุกกี้ httpOnly ที่ตัวเองตั้งไว้
       * ค่าที่ client ส่งมาจะถูกเมินทั้งหมด ซึ่งเป็นเหตุผลทั้งหมดที่ด่านนี้กันอะไรได้จริง
       */
      body: JSON.stringify({ identityToken }),
    })
  } catch {
    /* เน็ตหลุดตอนยิงเข้าเซิร์ฟเวอร์ — ทางเว็บใช้เครือข่ายเดียวกันและน่าจะล้มเหมือนกัน
       แต่อย่างน้อยผู้ใช้จะได้เห็นข้อความจากที่นั่น ไม่ใช่ปุ่มที่กดแล้วเงียบ */
    return { kind: 'fallback-to-web' }
  }

  const body = (await res.json().catch(() => null)) as
    | { ok?: boolean; ticket?: string; reason?: string }
    | null

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
  const { identityToken, doFetch } = step

  let res: Response
  try {
    res = await doFetch('/api/account/link/apple-native', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identityToken }),
    })
  } catch {
    return { kind: 'fallback-to-web' }
  }

  const body = (await res.json().catch(() => null)) as { ok?: boolean; redirect?: string } | null
  if (body?.ok === true && typeof body.redirect === 'string' && body.redirect.length > 0) {
    return { kind: 'done', redirect: body.redirect }
  }
  /* โทเคนไม่ผ่าน / คำตอบรูปร่างแปลก → ทางเว็บยังใช้ได้ (ไม่ได้รับผลจากการตั้งค่าที่ผิด) */
  return { kind: 'fallback-to-web' }
}
