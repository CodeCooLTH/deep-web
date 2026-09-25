/**
 * stale-auth-cookies — คุกกี้ที่ต้องล้างตอนออกจากระบบ (แก้ 2026-09-17)
 *
 * ## ทำไมต้องมีไฟล์นี้
 *
 * `signOut()` ของ next-auth **ล้างแค่คุกกี้ session ตัวเดียว** (`sessionStore.clean()` ใน
 * `core/routes/signout.js`) ⇒ ที่เหลือค้างอยู่ทั้งหมด และเคยทำให้เกิดบั๊กจริงมาแล้ว:
 *
 * - `callback-url` ค้างเป็น `/auth/sign-in` ⇒ ล็อกอิน Apple สำเร็จแล้วถูกส่งกลับหน้าล็อกอิน
 *   (บั๊ก prod 2026-09-17 · แก้ที่ `post-auth-redirect.ts` ไปแล้ว แต่ต้นตอคือคุกกี้ค้าง)
 * - `state` / `nonce` / `pkce.code_verifier` เป็นของ **ใช้ครั้งเดียวทิ้ง** อายุ 15 นาที
 *   ค้างไว้ไม่มีประโยชน์ มีแต่โอกาสให้รอบถัดไปหยิบของเก่าไปเทียบ
 *
 * ## 🛑 สามตัวที่ห้ามล้างเด็ดขาด
 *
 * | คุกกี้ | ทำไมห้าม |
 * |---|---|
 * | `deep_shell` | เป็นตัวบอกว่า "อยู่ในแอป" — ล้างแล้ว **ด่าน App Store ทั้งชุดหลุดทันที** (ปุ่มจ่ายเงิน/สมัคร โผล่กลับมาในแอป) |
 * | `csrf-token` | เพิ่งแก้บั๊ก "กดครั้งแรกไม่ไปไหน" ด้วยการอุ่นคุกกี้นี้ไว้ (2026-09-16) ล้างทิ้ง = ต้องสร้างใหม่ตอนกด = บั๊กเดิมกลับมา |
 * | `session-token` | next-auth ล้างเองอยู่แล้ว — ล้างซ้ำจากที่อื่นเสี่ยงชนจังหวะกัน |
 */

import { APPLE_NONCE_COOKIE } from '@/lib/apple/native-nonce'

/** ชื่อคุกกี้ที่ค้างหลัง `signOut` และไม่มีประโยชน์ต่อรอบถัดไป */
export const STALE_AUTH_COOKIES: readonly string[] = [
  /* ปลายทางหลังล็อกอินของรอบก่อน — ตัวที่ทำให้เกิดบั๊ก 2026-09-17 */
  '__Secure-next-auth.callback-url',
  'next-auth.callback-url',
  /* ของใช้ครั้งเดียวทิ้งระหว่างเดินทาง OAuth */
  '__Secure-next-auth.state',
  'next-auth.state',
  '__Secure-next-auth.nonce',
  'next-auth.nonce',
  '__Secure-next-auth.pkce.code_verifier',
  'next-auth.pkce.code_verifier',
  /* ความตั้งใจ "จะเชื่อมบัญชี" ของรอบก่อน — ค้างไว้ = รอบหน้าถูกตีความว่ากำลังเชื่อม */
  'deep_link_intent',
  /* nonce ของรอบล็อกอินด้วยแผ่นของระบบ (feature 00040) — ของใช้ครั้งเดียวทิ้งเหมือน pkce/state
     ตัวตรวจลบให้อยู่แล้วทุกทางออก แต่ถ้าผู้ใช้กดออกจากระบบ **กลางทาง** มันจะค้างไว้ 10 นาที */
  APPLE_NONCE_COOKIE,
]

/**
 * 🛑 รายชื่อที่ **ห้าม** อยู่ใน `STALE_AUTH_COOKIES` — มีไว้ให้เทสจับ ไม่ใช่ไว้ให้โค้ดอ่าน
 *
 * เขียนไว้เป็นข้อมูลเพราะ "ห้ามล้าง" เป็นกฎที่พังเงียบที่สุด: ล้าง `deep_shell` แล้วทุกอย่าง
 * ยังทำงานปกติทุกประการ **ยกเว้นว่าปุ่มจ่ายเงินโผล่กลับมาในแอป** ซึ่งไม่มีใครสังเกตจนถูกตีกลับ
 */
export const NEVER_CLEAR_COOKIES: readonly string[] = [
  'deep_shell',
  '__Host-next-auth.csrf-token',
  'next-auth.csrf-token',
  '__Secure-next-auth.session-token',
  'next-auth.session-token',
]
