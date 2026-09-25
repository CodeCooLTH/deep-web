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

export async function runAppleNativeSignIn(
  deps: AppleNativeSignInDeps = {},
): Promise<AppleNativeOutcome> {
  const win = deps.win ?? (typeof window === 'undefined' ? undefined : window)
  const transport = createWindowAppleTransport(win)
  if (!transport) return { kind: 'fallback-to-web' }

  const client = createAppleNativeClient(transport, { timeoutMs: deps.timeoutMs })
  const { result, nonce } = await client.signIn()

  if (!result.ok) {
    /* ผู้ใช้ปัดทิ้งเอง = เขาเลือกที่จะไม่ล็อกอิน · เด้งไปหน้าเว็บของ Apple ต่อคือการ
       ไม่ฟังสิ่งที่เขาเพิ่งบอก และเป็นพฤติกรรมที่น่ารำคาญที่สุดที่ปุ่มนี้ทำได้ */
    return result.reason === 'CANCELLED' ? { kind: 'cancelled' } : { kind: 'fallback-to-web' }
  }

  const doFetch = deps.fetchImpl ?? fetch
  let res: Response
  try {
    res = await doFetch('/api/login/apple-native', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      /**
       * 🛑 ส่ง `nonce` ที่ **เราสร้าง** ไม่ใช่ `result.nonce` ที่ native ส่งกลับมา —
       * ถ้าใช้ค่าจาก native แอปที่ถูกแก้ไขจะกำหนด nonce เองได้ ซึ่งทำให้การกันเล่นซ้ำ
       * หมดความหมายทั้งอัน (ตัว client เทียบสองค่านี้ให้แล้ว แต่การส่งค่าที่ถูกต้อง
       * ต้องไม่พึ่งว่าด่านนั้นยังอยู่)
       */
      body: JSON.stringify({ identityToken: result.identityToken, nonce }),
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
