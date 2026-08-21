/**
 * SSOT ของ **สิ่งที่หน้าจอแสดงใต้ช่องเบอร์** — chip แนะนำ / ข้อความเตือน / ไม่แสดงอะไร
 *
 * แยกจาก `phone.ts` (ซึ่งเป็น SSOT ของ *กฎเบอร์*) ด้วยเหตุผลเดียวกับที่
 * `order-profit-presentation.ts` แยกจาก `order-profit.ts`: ไฟล์นี้ถือ **คำ** และ
 * **การตัดสินใจว่าจะพูดหรือเงียบ** ซึ่งต้องเหมือนกันทุกจอ (Hard Rule 16) —
 * เพิ่ม surface ใหม่ที่พูดถึงเบอร์ต้องเรียกตัวนี้ ห้ามก็อปคำไปเขียนซ้ำ
 *
 * 🛑 ตรรกะทั้งหมดอยู่ที่นี่ ไม่ใช่ในเทอร์นารีกลาง JSX —
 * `docs/conventions/ui-boolean-needs-a-testable-home.md`: เกณฑ์ไม่ใช่ "ซับซ้อนพอไหม"
 * แต่คือ "ถ้าเขียนกลับด้านแล้วจะมีอะไรจับได้ไหม" ตัวนี้ตัดสินว่าผู้ใช้เห็น/ไม่เห็นคำแนะนำ
 * ที่ชี้นำให้กดเปลี่ยนเบอร์ลูกค้า ⇒ ต้องมีเทสจับ
 */

import { suggestThaiMobile, MOBILE_PHONE_RE } from '@/lib/phone'

export type PhoneHint =
  | { kind: 'chips'; suggestions: string[] }
  | { kind: 'warning'; message: string }
  | { kind: 'none' }

/**
 * ต่ำกว่านี้ถือว่า "ยังพิมพ์ไม่เสร็จ" ไม่ใช่ "พิมพ์ผิด" — เงียบไว้
 *
 * 🛑 ระหว่างพิมพ์เบอร์ปกติ ผู้ใช้ไล่ผ่าน 1→9 หลักก่อนถึง 10 เสมอ ถ้าเตือนทุกหลัก
 * จะกระพริบเป็นสิบครั้งต่อเบอร์เดียว แล้วร้านจะเลิกอ่านคำเตือนภายในวันเดียว
 * (ที่ 9 หลัก = ใกล้ครบแต่ขาด ซึ่งเป็นจังหวะที่คำเตือนมีประโยชน์จริง)
 *
 * ใช้กับ `too-short` เท่านั้น — `too-long`/`not-mobile` เตือนทันทีเสมอ เพราะเป็น
 * สถานะที่จบแล้ว พิมพ์เพิ่มไม่มีทางถูก
 */
const WARN_FROM_DIGITS = 9

const lengthMessage = (n: number) =>
  `เบอร์นี้มี ${n} หลัก เบอร์มือถือไทยต้องมี 10 หลักพอดี — ลองตรวจตัวเลขอีกครั้ง`

const NOT_MOBILE_MESSAGE = 'เบอร์นี้ไม่ใช่เบอร์มือถือ — เบอร์มือถือไทยขึ้นต้นด้วย 06, 08 หรือ 09'

/** คำบนปุ่ม chip — เลขติดกันตรงกับค่าที่บันทึกจริงเป๊ะ ไม่จัดกลุ่มด้วยขีด */
export const chipLabel = (phone: string) => `ใช้เบอร์ ${phone}`

/**
 * ตัดสินว่าใต้ช่องเบอร์ต้องแสดงอะไร
 *
 * @param raw ค่าที่ผู้ใช้พิมพ์อยู่ในช่องตอนนี้
 */
export function phoneHint(raw: string): PhoneHint {
  const typed = (raw ?? '').trim()
  const { suggestions, reason, digitCount } = suggestThaiMobile(typed)

  // 🛑 ตัดตัวที่ "ตรงกับที่พิมพ์อยู่แล้ว" ทิ้ง — ถ้าตัดอักขระแล้วได้ค่าเดิมเป๊ะ
  // แปลว่าไม่มีอะไรต้องแก้ chip ที่ยืนยันตัวเองซ้ำคือ noise ล้วน ๆ
  const visible = suggestions.filter((s) => s !== typed)
  if (visible.length > 0) return { kind: 'chips', suggestions: visible }

  if (reason === 'not-mobile') return { kind: 'warning', message: NOT_MOBILE_MESSAGE }
  if (reason === 'too-long') return { kind: 'warning', message: lengthMessage(digitCount) }
  if (reason === 'too-short' && digitCount >= WARN_FROM_DIGITS) {
    return { kind: 'warning', message: lengthMessage(digitCount) }
  }

  // 'no-digits' (พิมพ์ชื่อคน — ช่องค้นหารับชื่อด้วย) และ too-short ที่ยังสั้นมาก = เงียบสนิท
  return { kind: 'none' }
}

/**
 * มี chip ค้างให้ร้านกดอยู่ไหม
 *
 * ใช้กันไม่ให้ชีตค้นหาเต็มจอเปิดทับ chip (user เคาะ 2026-08-21) — **ไม่ใช่**ตัวเดียวกับ
 * `hasPhoneHint` ข้างล่าง: ค่าที่ขึ้น *คำเตือน* ไม่ต้องกันชีต เพราะมันไม่มีอะไรให้กด
 * ร้านต้องแก้เอง และการค้นด้วยค่านั้นก็ยังมีประโยชน์ (อาจเป็นชื่อ/เบอร์บางส่วน)
 */
export function hasPhoneSuggestion(raw: string): boolean {
  return phoneHint(raw).kind === 'chips'
}

/** สล็อตใต้ช่องมีเนื้อหาไหม — ผู้เรียกใช้ตัดสิน `aria-describedby` (ชี้กล่องว่างไม่ได้) */
export function hasPhoneHint(raw: string): boolean {
  return phoneHint(raw).kind !== 'none'
}

/**
 * คำที่พิมพ์อยู่ เอาไปสร้างลูกค้าใหม่ได้เลยไหม (FR-CUS-E1-07)
 *
 * ปุ่ม "ใช้ … เป็นลูกค้าใหม่" ในชีตค้นหาเขียนค่าลงฟอร์มทันทีโดยไม่ถามอะไรอีก จึงต้องรับ
 * เฉพาะค่าที่ **ลงช่องใดช่องหนึ่งได้จริง**:
 *   - เป็นมือถือที่ถูกต้อง → ลงช่องเบอร์
 *   - ไม่มีตัวเลขเลย → เป็นชื่อคน ลงช่องชื่อ
 *
 * 🛑 "มีตัวเลขแต่ไม่ใช่เบอร์ที่ถูก" ต้องคืน false — ไม่งั้นปุ่มจะเอา `09207916` ไปใส่
 * **ช่องชื่อลูกค้า** (เพราะมันไม่ผ่านเกณฑ์เบอร์) แล้วร้านจะได้ลูกค้าชื่อ "09207916"
 * โดยไม่มีอะไรฟ้อง — กรณีนี้ให้ chip/คำเตือนทำงานแทน
 */
export function canUseAsNewCustomer(raw: string): boolean {
  const typed = (raw ?? '').trim()
  if (!typed) return false
  if (MOBILE_PHONE_RE.test(typed)) return true
  return !/[0-9]/.test(typed)
}
