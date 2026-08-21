/**
 * apple-signup-name — เก็บ "ชื่อจริง" ที่ Apple ส่งมาตอน Sign in with Apple ครั้งแรก
 *
 * ## 🛑 ทำไมต้องมีไฟล์นี้ ทั้งที่ next-auth ควรจัดการให้เอง
 *
 * Apple **ไม่ได้ใส่ชื่อไว้ใน ID token** — มันส่งมาเป็น **form field ชื่อ `user`** ในตัว POST ที่
 * ยิงกลับมาที่ callback และ **ส่งครั้งเดียวตลอดชีวิตของบัญชี** คือครั้งแรกที่ผู้ใช้กดอนุญาต
 * เท่านั้น (กดครั้งที่สองเป็นต้นไป Apple ไม่ส่งมาอีก ไม่ว่าจะถอนสิทธิ์แล้วต่อใหม่หรือไม่)
 *
 * ส่วน `next-auth/providers/apple` อ่านชื่อจาก `profile.name` (ดู `node_modules/next-auth/
 * providers/apple.js`) ซึ่งเป็น claim ที่ **ไม่มีอยู่จริงใน ID token ของ Apple** ⇒ ได้
 * `undefined` ทุกครั้ง ⇒ `signIn` callback ตกไปใช้ค่าสำรอง `"User"` แล้วผู้ใช้ทุกคนที่สมัคร
 * ด้วย Apple มีชื่อว่า "User" เหมือนกันหมด
 *
 * นั่นคือสิ่งที่ Apple ตีกลับ **2 รอบ** (Guideline 4 - Design, 2026-08-19 และ 2026-08-21):
 *   *"users are required to provide their name and/or email address after using Sign in with
 *   Apple even though that information is already provided by the Authentication Services
 *   framework"*
 * — เราไม่ได้เก็บชื่อที่เขาให้มา ระบบเลยต้องไปถามผู้ใช้เอาเองทีหลัง ซึ่งคือข้อที่เขาห้ามตรงตัว
 *
 * ## ทำไมเก็บในหน่วยความจำ ไม่ใช่คุกกี้
 *
 * ตัวอ่านคือ `signIn` callback ซึ่งทำงาน **ในคำขอเดียวกัน** กับที่ Apple ยิง POST เข้ามา
 * คุกกี้ที่เพิ่งตั้งใน response ยังอ่านไม่ได้ในคำขอนั้น (คุกกี้ที่อ่านได้คือของ *request*)
 * ⇒ ต้องเป็นที่เก็บฝั่งเซิร์ฟเวอร์ที่มีชีวิตข้ามภายในคำขอเดียว
 *
 * ใช้ `globalThis` แบบเดียวกับ `api-rate-limit.ts`/`sms-consume-rl.ts` ของรีโปนี้ — ยอมรับ
 * ข้อจำกัดเดียวกันคือ per-instance บน serverless ซึ่ง **ไม่เป็นปัญหาที่นี่** เพราะผู้เขียนกับ
 * ผู้อ่านอยู่ในคำขอเดียวกันเสมอ (ไม่ใช่คนละคำขอเหมือน rate-limit)
 *
 * 🛑 มี TTL สั้น + เพดานจำนวน เพราะถ้าเก็บค้างโดยไม่มีใครมาอ่าน (เช่น token exchange ล้ม
 * กลางทาง) มันคือหน่วยความจำที่รั่วทีละนิดพร้อม **ชื่อจริงของคน** ค้างอยู่ในนั้น
 */

type Entry = { name: string; at: number }

/** 2 นาที — token exchange ของ next-auth เกิดในวินาทีเดียวกัน ค่านี้เผื่อไว้เยอะแล้ว */
const TTL_MS = 2 * 60 * 1000

/** เพดานกันโตไม่จำกัดถ้ามีคำขอที่ไม่มีใครมาอ่าน — เกินแล้วล้างตัวที่หมดอายุก่อน */
const MAX_ENTRIES = 500

const store: Map<string, Entry> = ((globalThis as { __appleSignupNames?: Map<string, Entry> })
  .__appleSignupNames ??= new Map())

function sweep(now: number) {
  for (const [k, v] of store) if (now - v.at > TTL_MS) store.delete(k)
}

/**
 * ประกอบชื่อจาก payload ของ Apple — คืน `null` เมื่อไม่มีชื่อจริง ๆ
 *
 * 🛑 คืน `null` ไม่ใช่สตริงว่าง เพราะผู้เรียกใช้ `??` เลือกค่าสำรอง สตริงว่างจะผ่าน `??` ไปได้
 * แล้วผู้ใช้จะได้ชื่อว่าง ซึ่งแย่กว่าค่าสำรองที่ตั้งใจไว้
 */
export function parseAppleUserField(raw: string | null | undefined): string | null {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const name = (parsed as { name?: { firstName?: unknown; lastName?: unknown } }).name
    if (!name || typeof name !== 'object') return null
    const first = typeof name.firstName === 'string' ? name.firstName.trim() : ''
    const last = typeof name.lastName === 'string' ? name.lastName.trim() : ''
    const full = `${first} ${last}`.trim()
    return full || null
  } catch {
    // Apple ส่ง JSON เสมอ — พังแปลว่า payload ไม่ใช่ที่เราคิด ให้ตกไปใช้ค่าสำรอง ห้าม throw
    // เพราะ throw ตรงนี้ = ล็อกอิน Apple พังทั้งเส้นเพื่อแลกกับ "ชื่อ" ซึ่งไม่คุ้มกันเลย
    return null
  }
}

/**
 * อ่าน `sub` จาก ID token โดย **ไม่ตรวจลายเซ็น** — ใช้เป็นกุญแจเท่านั้น
 *
 * 🛑 ปลอดภัยเพราะค่านี้ไม่ได้ถูกใช้ตัดสินสิทธิ์อะไรเลย มันเป็นแค่กุญแจของ Map ชั่วคราว
 * ตัวที่ตรวจลายเซ็นจริงคือ next-auth ซึ่งทำต่อจากนี้ — ถ้า token ปลอม มันจะตกที่นั่น
 * และรายการใน Map นี้จะหมดอายุทิ้งไปเองโดยไม่มีใครอ่าน
 */
export function subFromIdToken(idToken: string | null | undefined): string | null {
  if (!idToken) return null
  const part = idToken.split('.')[1]
  if (!part) return null
  try {
    const json = Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    const sub = (JSON.parse(json) as { sub?: unknown }).sub
    return typeof sub === 'string' && sub ? sub : null
  } catch {
    return null
  }
}

export function rememberAppleSignupName(sub: string, name: string) {
  const now = Date.now()
  if (store.size >= MAX_ENTRIES) sweep(now)
  store.set(sub, { name, at: now })
}

/**
 * อ่านแล้วลบทิ้งทันที — ชื่อจริงของคนไม่ควรค้างในหน่วยความจำนานกว่าที่จำเป็น
 * และการอ่านซ้ำไม่มีความหมายอยู่แล้ว (ใช้ตอนสร้างบัญชีครั้งเดียว)
 */
export function takeAppleSignupName(sub: string | null | undefined): string | null {
  if (!sub) return null
  const now = Date.now()
  const hit = store.get(sub)
  store.delete(sub)
  if (!hit) return null
  return now - hit.at > TTL_MS ? null : hit.name
}
