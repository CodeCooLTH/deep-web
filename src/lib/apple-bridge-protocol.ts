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
 * ## 🛑 ตอนนี้ฝั่งเว็บ **ไม่มีตัวฟัง** — และนั่นถูกต้องแล้ว
 *
 * ปุ่มอ่าน `__DEEP_NATIVE_CAPS__` **ตอนผู้ใช้กด** ซึ่งเกิดหลัง inject เสมอ ⇒ ไม่ต้องรอ event
 * (เคยมี `subscribeNativeCaps` ไว้ แต่ไม่มีใครเรียก ⇒ ถอดออก 2026-09-25)
 *
 * ## แล้วทำไมยังให้แอปยิง
 *
 * **เพราะเว็บแก้ได้ตลอด แต่แอปแก้ไม่ได้** — การเปลี่ยนเปลือกต้อง build ใหม่ + ผ่าน App Review
 * และผู้ใช้ที่ไม่อัปเดตจะค้างอยู่กับบิลด์เก่าตลอดไป (บทเรียนที่เพิ่งเจอกับรอบนี้ทั้งรอบ)
 * ⇒ สัญญาณที่ **แอปส่งไว้ก่อน** คือสิ่งเดียวที่เว็บเวอร์ชันอนาคตหยิบไปใช้ได้โดยไม่ต้องรอบิลด์ใหม่
 *
 * นี่ไม่ใช่ "เผื่อไว้" แบบลอย ๆ — มันเป็นการชดเชยความไม่สมมาตรที่พิสูจน์แล้วว่ามีจริง
 * ค่าคงที่นี้จึงยังถูกปักหมุดด้วยเทสทั้งสองฝั่ง
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

/**
 * ชื่อที่ Apple ส่งมา — **ครั้งแรกสุดครั้งเดียวตลอดชีพของบัญชี** ครั้งถัดไปเป็น null
 *
 * ## 🛑 หนี้ที่รู้ตัว: ตอนนี้ฝั่งเว็บ **รับมาแล้วไม่ได้ใช้**
 *
 * เพราะเส้นทาง native **ไม่สร้างบัญชีใหม่** (ดู `/api/login/apple-native`) ⇒ ไม่มีที่ให้เก็บชื่อ
 *
 * **ผลข้างเคียงที่ตามมา และมันเป็นของใหม่ที่รอบนี้สร้างขึ้น:** Apple ให้ชื่อเฉพาะ
 * *การอนุญาตครั้งแรก* ของ Apple ID นั้นกับกลุ่ม identifier ของเรา ⇒ ถ้าผู้ใช้ใหม่กดปุ่ม
 * Apple **ในแอป** ก่อน (ได้ `NO_ACCOUNT` แล้วเราทิ้งชื่อ) แล้วค่อยไปสมัครทางเว็บทีหลัง
 * Apple จะ **ไม่ส่งชื่อมาอีก** ⇒ บัญชีนั้นได้ `displayName` เป็น "User" แล้วระบบต้องไปถามชื่อ
 * ทีหลัง ซึ่งคือข้อที่ Apple ตีกลับมาแล้ว 2 รอบ (Guideline 4 · 2026-08-19 และ 08-21)
 *
 * **ก่อนรอบนี้ไม่มีปัญหานี้** เพราะการกดปุ่มในแอปสร้างบัญชี (พร้อมชื่อ) ให้เลย —
 * แลกกับการได้ "บัญชีค้าง" ที่เจ้าตัวแก้เองไม่ได้ ซึ่งเป็นทางตันที่ภาคผนวก 6 ใช้เวลาทั้งวันแก้
 *
 * **ทางแก้จริงคือเก็บชื่อแบบถาวรโดยคีย์ด้วย `sub`** แล้วให้ `takeAppleSignupName()` อ่านตอน
 * สมัครทางเว็บ — ที่เก็บปัจจุบันเป็นหน่วยความจำ TTL 2 นาที ซึ่ง **ข้ามอุปกรณ์ไม่ได้**
 * (ผู้ใช้ต้องเปลี่ยนไปเปิดเบราว์เซอร์) ⇒ ต้องมีตารางใหม่ = migration ซึ่งยังไม่ทำในรอบนี้
 *
 * ⚠️ **ไม่กระทบผลการรีวิว** — ทีมรีวิวใช้บัญชี `appreview` (ชื่อผู้ใช้+รหัสผ่าน) และถ้าเขา
 * กดปุ่ม Apple ก็จะได้ `NO_ACCOUNT` ซึ่งเป็นพฤติกรรมที่ตั้งใจและเขียนไว้ในโน้ตแล้ว
 *
 * 🛑 **ห้ามถอด field นี้ออกจากสัญญาเพื่อ "ลดโค้ดที่ไม่มีใครเรียก"** — วันที่ทำที่เก็บถาวร
 * เราจะต้องใช้มัน และการเติมกลับต้อง **build แอปใหม่** ซึ่งแพงกว่าการปล่อยไว้มาก
 */
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
