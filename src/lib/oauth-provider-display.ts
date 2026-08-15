/**
 * oauth-provider-display — SSOT ของ "ชื่อ/ไอคอน/สี ของผู้ให้บริการล็อกอิน" ที่ผู้ใช้เห็น
 *
 * ## ทำไมต้องมี
 *
 * ชื่อผู้ให้บริการถูกเขียนซ้ำอยู่หลายหน้าจอ และทุกครั้งที่เพิ่ม provider ใหม่ **สาขาของตัวใหม่
 * ถูกลืมเสมอ** โดยที่ไม่มี `tsc`/build/เทสตัวไหนฟ้อง เพราะทุกสาขาเป็นสตริงที่ถูกต้องทั้งคู่:
 *
 *   2026-08-12 `/account` — ternary ตกท้ายเป็น 'Instagram' ⇒ เชื่อม Apple สำเร็จแล้วขึ้นว่า
 *              "เชื่อมต่อ Instagram สำเร็จ"
 *   2026-08-15 `/register` — if/else รู้จักแค่ line/ig แล้ว **ตกท้ายเป็น Facebook**
 *              ⇒ คนที่สมัครด้วย Apple เห็นชิป "เข้าสู่ระบบด้วย Facebook" (user เจอเอง)
 *
 * คลาสเดียวกันเป๊ะ ห่างกัน 3 วัน คนละไฟล์ — เพราะความรู้เรื่องนี้ไม่เคยมีเจ้าของที่เดียว
 * (Hard Rule 16: ศัพท์ที่ผู้ใช้เห็นต้องมีนิยามเดียวทั้งระบบ)
 *
 * 🛑 **ห้ามมีค่า default ที่เป็นชื่อ provider ตัวใดตัวหนึ่ง** — นั่นคือรูปร่างของบั๊กทั้งสองครั้ง
 * ไม่รู้จัก = คืน `null` ให้ผู้เรียกตัดสินใจ (fail-closed) ดีกว่าเดาแล้วบอกผู้ใช้ผิด
 */

export type OAuthProviderKey = 'apple' | 'facebook' | 'line' | 'instagram'

/** ชื่อที่ผู้ใช้เห็น — ที่เดียวทั้งระบบ */
export const OAUTH_PROVIDER_LABEL: Record<OAuthProviderKey, string> = {
  apple: 'Apple',
  facebook: 'Facebook',
  line: 'LINE',
  instagram: 'Instagram',
}

/**
 * prefix ของ username ที่ระบบตั้งให้ตอนสมัครผ่าน provider นั้น
 *
 * 🛑 ต้องตรงกับ `oauthMap` ใน `src/lib/auth.ts` เป๊ะ — ที่นั่นคือที่ที่ค่าถูก *เขียนลงฐาน*
 * ส่วนที่นี่คือที่ที่ค่าถูก *อ่านกลับ* ผิดกันเมื่อไหร่ = อ่านชื่อคนผิดโดยไม่มีอะไรฟ้อง
 * (เทส [blocker] ใน `oauth-provider-parity.test.ts` เทียบสองที่นี้ให้)
 */
export const OAUTH_USERNAME_PREFIX: Record<OAuthProviderKey, string> = {
  apple: 'apple',
  facebook: 'fb',
  line: 'line',
  instagram: 'ig',
}

/**
 * เดา provider จาก username ที่ระบบตั้งให้ — คืน `null` เมื่อไม่รู้จัก **ห้ามเดาเป็นเจ้าใดเจ้าหนึ่ง**
 *
 * ใช้เมื่อไม่มีข้อมูล provider ตรง ๆ (เช่นหน้า `/register` ที่มีแต่ session)
 * ⚠️ เป็นการอนุมาน ไม่ใช่ความจริง — username ที่ผู้ใช้เปลี่ยนเองภายหลังจะอ่านไม่ออก
 * แต่หน้าที่ใช้ตัวนี้เป็นหน้าที่ผู้ใช้ยังตั้งชื่อเองไม่ได้ (ยังลงทะเบียนไม่จบ) จึงยังเชื่อถือได้
 *
 * 🛑 เรียง 'apple' ก่อน — ไม่มี prefix ตัวไหนเป็นส่วนขึ้นต้นของอีกตัว จึงไม่มีปัญหาลำดับ
 * ตอนนี้ แต่ถ้าวันหนึ่งเพิ่ม provider ที่ prefix ซ้อนกัน (เช่น 'line' กับ 'linkedin')
 * ต้องเรียงตัวยาวก่อน ไม่งั้นตัวสั้นจะกลืนตัวยาว
 */
export function providerFromUsername(username: string | null | undefined): OAuthProviderKey | null {
  const u = username ?? ''
  if (!u) return null
  const entries = (Object.entries(OAUTH_USERNAME_PREFIX) as [OAuthProviderKey, string][]).sort(
    (a, b) => b[1].length - a[1].length,
  )
  for (const [key, prefix] of entries) {
    if (u.startsWith(prefix)) return key
  }
  return null
}
