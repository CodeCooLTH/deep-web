/**
 * apple-bridge-protocol — รูปร่างข้อความระหว่างหน้าเว็บกับเปลือก native เรื่อง
 * Sign in with Apple (feature 00040 · ภาคผนวก 7)
 *
 * โมดูลบริสุทธิ์: ไม่แตะ `window` ไม่แตะ React ⇒ เทสได้ตรง ๆ และ **ใช้อ้างอิงข้ามรีโปได้**
 *
 * 🛑 **คู่แฝดของไฟล์นี้อยู่คนละรีโป**: `deep-seller-app/src/features/apple-auth/protocol.ts`
 * ไม่มี type ตัวไหนเชื่อมสองฝั่งให้ ⇒ ชื่อ event หรือชื่อฟิลด์ต่างกันแม้ตัวเดียว
 * **ทุกอย่างจะเงียบสนิทโดยไม่มี error** (บทเรียนเดียวกับ `deep:push-permission`
 * และ `deep:iap-result`) ค่าคงที่ทุกตัวจึงมีเทสปักหมุดไว้ทั้งสองฝั่ง
 *
 * ## ทำไมปุ่มอยู่เว็บแต่แผ่นล็อกอินอยู่ native
 *
 * Apple ตีกลับ 2026-09-24 (**Guideline 4**): แอป iOS ต้องเปิดแผ่นของระบบ ไม่ใช่หน้าเว็บ
 * `appleid.apple.com` ⇒ `ASAuthorizationAppleIDProvider` เรียกจากหน้าเว็บไม่ได้เลย
 * เป็นข้อเดียวของเรื่องนี้ที่ native จำเป็นจริง ๆ — **UI ทั้งหมดยังอยู่ในเว็บ**
 * ตามหลัก WebView-first (UI ซ้ำสองที่ = หลุด sync แน่นอน)
 *
 * ## 🛑 ของที่ native ส่งกลับมา ต้องตรวจก่อนเชื่อทุกครั้ง
 *
 * ค่ามาถึงเว็บผ่าน `injectJavaScript` ซึ่งเขียนลง `window` — โค้ดหน้าอื่นเขียนทับได้
 * และตัวแอปเองก็เป็นโค้ดที่อยู่ในมือผู้ใช้ ⇒ **ที่นี่ตรวจแค่ "รูปร่าง"**
 * ส่วนที่ตัดสินว่าเชื่อได้ไหมคือลายเซ็นของ Apple ซึ่งตรวจบนเซิร์ฟเวอร์
 * (`src/lib/apple/identity-token.ts`) เท่านั้น — ห้ามย้ายการตัดสินมาไว้ฝั่ง client
 */

/** ชื่อ event ที่ native ยิงหลังตั้ง `window.__DEEP_APPLE_RESULT__` — **ต้องตรงกับฝั่งแอปเป๊ะ** */
export const APPLE_RESULT_EVENT = 'deep:apple-result'

/**
 * event ที่ native ยิงหลังประกาศความสามารถลง `window.__DEEP_NATIVE_CAPS__`
 *
 * 🛑 ต้องมี event ไม่ใช่ให้เว็บอ่านตัวแปรตอน mount เฉย ๆ — native ตั้งค่าผ่าน
 * `injectJavaScript` ซึ่งรัน "หลังหน้าโหลดเสร็จ" ซึ่งอาจช้ากว่าที่ React hydrate เสร็จ
 * (บทเรียนตัวเดียวกับ `deep:push-permission` ที่ `native-bridge.ts` เขียนเตือนไว้แล้ว)
 */
export const NATIVE_CAPS_EVENT = 'deep:native-caps'

/**
 * ชื่อความสามารถ "เปิดแผ่น Sign in with Apple ของระบบได้"
 *
 * 🛑 **นี่คือสิ่งที่ทำให้แอปรุ่นเก่าไม่พัง** — บิลด์ที่ปล่อยไปก่อนรอบนี้ไม่มีโมดูล native
 * และ `onMessage` ของมันจะเมินคำสั่งเราเงียบ ๆ ⇒ ถ้าเว็บสั่งแล้วรอคำตอบ ผู้ใช้จะเห็น
 * ปุ่มหมุนจนหมดเวลาโดยไม่มีอะไรเกิดขึ้น · ถามความสามารถก่อนแล้ว **ถอยไปทางเว็บทันที**
 * เมื่อไม่มี ⇒ ผู้ใช้บิลด์เก่ายังล็อกอินได้เหมือนเดิมทุกประการ
 */
export const CAP_APPLE_SIGNIN = 'apple-signin'

/** ข้อความที่เว็บส่งไปให้ native — prefix `deep:apple-` คือสิ่งที่ฝั่งแอป allow-list ไว้ */
export interface AppleSignInRequest {
  type: 'deep:apple-signin'
  requestId: string
  /**
   * nonce **ดิบ** ที่ฝั่งเว็บสร้าง — ฝั่ง native ต้อง SHA-256 ก่อนส่งให้ Apple
   *
   * 🛑 **เว็บต้องเป็นคนสร้าง ไม่ใช่ native** — ตัวที่ตรวจคือเซิร์ฟเวอร์ ถ้า native สร้างเอง
   * โทเคนที่ถูกดักไว้จะถูกยิงซ้ำได้ตลอดอายุ 10 นาทีโดยเซิร์ฟเวอร์ไม่มีทางรู้
   */
  nonce: string
}

/** ชื่อที่ Apple ส่งมา — **ครั้งแรกสุดครั้งเดียวตลอดชีพของบัญชี** ครั้งถัดไปเป็น null */
export interface AppleFullName {
  givenName?: string
  familyName?: string
}

/**
 * เหตุผลที่ทำไม่สำเร็จ
 *
 * 🛑 `TIMEOUT` เป็นของ **ฝั่งเว็บล้วน** — เกิดตอนเรารอ native แล้วไม่มีคำตอบ ไม่ใช่ค่าที่
 * native ส่งมาได้ · `parseAppleSignInResult` จึงไม่รับค่านี้จากสาย มิฉะนั้นแอปที่ถูกแก้ไข
 * จะแกล้งบอกว่า "หมดเวลา" เพื่อบังคับให้เว็บถอยไปทางอื่นได้ตามใจ
 * (กติกาเดียวกับ `IapFailure` ใน `iap-bridge-protocol.ts`)
 */
export type AppleSignInFailure = 'CANCELLED' | 'UNAVAILABLE' | 'FAILED' | 'TIMEOUT'

/** ค่าที่ **สาย** ส่งมาได้จริง — TIMEOUT ไม่อยู่ในนี้โดยตั้งใจ */
const WIRE_FAILURES = ['CANCELLED', 'UNAVAILABLE', 'FAILED'] as const

export interface AppleSignInSuccess {
  requestId: string
  ok: true
  /** JWT ที่ Apple เซ็น — ของจริงที่ใช้พิสูจน์ตัวตน ตรวจบนเซิร์ฟเวอร์เท่านั้น */
  identityToken: string
  /** ต้องส่งกลับมาด้วยเพื่อให้เว็บจับคู่กับคำขอที่ตัวเองสร้าง */
  nonce: string
  fullName?: AppleFullName
  email?: string
}

export type AppleSignInResult =
  | AppleSignInSuccess
  | { requestId: string; ok: false; reason: AppleSignInFailure }

export function buildAppleSignInRequest(requestId: string, nonce: string): AppleSignInRequest {
  return { type: 'deep:apple-signin', requestId, nonce }
}

const str = (v: unknown): v is string => typeof v === 'string' && v.length > 0

function readFullName(v: unknown): AppleFullName | undefined {
  if (typeof v !== 'object' || v === null) return undefined
  const n = v as Record<string, unknown>
  const givenName = str(n.givenName) ? n.givenName : undefined
  const familyName = str(n.familyName) ? n.familyName : undefined
  /* ทั้งคู่ว่าง = Apple ไม่ได้ส่งชื่อมา (ครั้งที่ 2 เป็นต้นไป) ⇒ ไม่มีก็คือไม่มี
     ห้ามคืนอ็อบเจกต์เปล่า เพราะผู้เรียกจะแยกไม่ออกจาก "ส่งมาแต่ว่าง" */
  if (!givenName && !familyName) return undefined
  return { ...(givenName ? { givenName } : {}), ...(familyName ? { familyName } : {}) }
}

/**
 * แปลของที่ native ส่งกลับมา — `null` = รูปร่างไม่น่าเชื่อถือ ทิ้งทั้งใบ
 *
 * 🛑 ห้าม throw: ตัวเรียกอยู่ใน event handler ของ `window` การ throw ที่นั่นไม่มีใครรับ
 * และจะทำให้คำขอที่รออยู่ค้างตลอดกาลแทนที่จะถอยไปทางเว็บ
 */
export function parseAppleSignInResult(raw: unknown): AppleSignInResult | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  if (!str(r.requestId)) return null

  if (r.ok === false) {
    const reason: AppleSignInFailure = WIRE_FAILURES.find((k) => k === r.reason) ?? 'FAILED'
    return { requestId: r.requestId, ok: false, reason }
  }
  if (r.ok !== true) return null

  /* ไม่มีโทเคน = พิสูจน์กับเซิร์ฟเวอร์ไม่ได้ · ไม่มี nonce = จับคู่กับคำขอไม่ได้
     ⇒ ขาดอย่างใดอย่างหนึ่งก็ไม่ใช่ความสำเร็จ ห้ามเติมค่าเริ่มต้นให้เอง */
  if (!str(r.identityToken) || !str(r.nonce)) return null

  return {
    requestId: r.requestId,
    ok: true,
    identityToken: r.identityToken,
    nonce: r.nonce,
    fullName: readFullName(r.fullName),
    email: str(r.email) ? r.email : undefined,
  }
}

/**
 * ประกอบชื่อที่แสดง จากชื่อที่ Apple ส่งมา — `null` เมื่อไม่มีอะไรให้ใช้
 *
 * 🛑 อยู่ที่นี่ไม่ใช่ที่ผู้เรียก เพราะมี **ผู้เรียก 2 ราย** (หน้าล็อกอิน · endpoint เชื่อมบัญชี)
 * และชื่อที่ประกอบต่างกันสองที่ = ผู้ขายคนเดียวได้ชื่อคนละแบบแล้วแต่ว่าเข้าทางไหน (HR16)
 */
export function appleDisplayName(name: AppleFullName | undefined): string | null {
  if (!name) return null
  const joined = [name.givenName, name.familyName].filter(Boolean).join(' ').trim()
  return joined.length > 0 ? joined : null
}
