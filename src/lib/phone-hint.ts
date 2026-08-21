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

/**
 * บรรทัดนำเหนือแถว chip
 *
 * 🛑 ปุ่ม chip เขียนแค่ **ตัวเลขล้วน** (มติ user 2026-08-21: ต้องตรงกับค่าที่บันทึกจริงเป๊ะ
 * ไม่จัดกลุ่มด้วยขีด) ⇒ ตัวปุ่มเองบอกไม่ได้ว่า *ระบบทำอะไรให้* และ *กดแล้วได้อะไรต่อ*
 * บรรทัดนี้เป็นคนบอกแทน — ถ้าไม่มี ผู้ใช้ที่พิมพ์ `092-0791649` เองจะเห็นแค่ "เลขเดิมของฉัน"
 * วางอยู่เฉย ๆ แล้วไม่มีเหตุผลให้กด (critique P1-5, กลุ่มเป้าหมายตาม PRODUCT.md คือผู้สูงวัย/
 * digital-literacy ต่ำ)
 *
 * @param count จำนวน chip · @param blocked กดบันทึกแล้วติด error อยู่หรือยัง
 */
export function chipsHeadline(count: number, blocked: boolean): string {
  if (blocked) return 'เบอร์นี้ยังบันทึกไม่ได้ — กดเพื่อใช้เบอร์ที่ตัดอักขระแล้ว'
  if (count > 1) return `เจอ ${count} เบอร์ในข้อความ — เลือก 1 เบอร์`
  return 'ตัดอักขระให้แล้ว — กดเพื่อใช้เบอร์นี้และค้นหาลูกค้าเดิม'
}

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
/**
 * ข้อความตอนค้นแล้วไม่เจอลูกค้าเดิมในชีตค้นหา
 *
 * 🛑 "ไม่พบลูกค้าเดิม" ลอย ๆ **โกหกในสองกรณี** (impeccable critique P0-2ข / P1-4):
 *
 * 1. **ยังไม่ได้ค้นด้วยเบอร์ที่ถูก** — ชีตค้นด้วยคำค้นดิบเสมอ ⇒ พิมพ์ `0 8 6 5 3 5 2960`
 *    ได้จอที่พูดขัดกันเอง: chip บอก "กดเพื่อใช้ 0865352960" แต่กลางจอประกาศว่าไม่พบ
 *    ทั้งที่ยังไม่เคยค้นด้วยเลขนั้นเลย (คลาสเดียวกับ `partial-data-must-be-labeled-or-filled.md`
 *    — ผลลัพธ์ที่ยังไม่ครบเงื่อนไข ห้ามแสดงหน้าตาเหมือนผลที่จบแล้ว)
 *
 * 2. **เบอร์หลักไม่ครบ** — `09207916` (8 หลัก) ไม่มี chip (ต่ำกว่าเกณฑ์เตือน) และปุ่ม
 *    "ใช้เป็นลูกค้าใหม่" ก็ถูกซ่อนตาม `canUseAsNewCustomer` ⇒ จอที่ปฏิเสธผู้ใช้แล้ว
 *    **ไม่เหลืออะไรให้กดหรือให้อ่านเลย**
 *
 * ตรงนี้ต่างจากคำเตือนใต้ช่อง: "ค้นจบแล้วไม่เจอ" เป็นสถานะที่จบแล้วจริง จึงบอกเหตุผลได้
 * โดยไม่ขัดมติ "เงียบระหว่างพิมพ์" (user เคาะ threshold 9 หลักไว้สำหรับ *ระหว่างพิมพ์*)
 */
export function emptyStateMessage(raw: string): string {
  const typed = (raw ?? '').trim()
  if (hasPhoneSuggestion(typed)) {
    return 'ยังไม่ได้ค้นด้วยเบอร์ — กดเบอร์ที่แนะนำด้านบนเพื่อค้นหาลูกค้าเดิม'
  }
  const { reason, digitCount } = suggestThaiMobile(typed)
  if (reason === 'too-short' && digitCount > 0) {
    return `ไม่พบลูกค้าเดิม — เบอร์ที่พิมพ์มี ${digitCount} หลัก เบอร์มือถือต้องมี 10 หลัก`
  }
  if (reason === 'too-long') {
    return `ไม่พบลูกค้าเดิม — เบอร์ที่พิมพ์มี ${digitCount} หลัก เบอร์มือถือต้องมี 10 หลัก`
  }
  if (reason === 'not-mobile') {
    return 'ไม่พบลูกค้าเดิม — เบอร์มือถือไทยขึ้นต้นด้วย 06, 08 หรือ 09'
  }
  return 'ไม่พบลูกค้าเดิม'
}

export function canUseAsNewCustomer(raw: string): boolean {
  const typed = (raw ?? '').trim()
  if (!typed) return false
  if (MOBILE_PHONE_RE.test(typed)) return true
  return !/[0-9]/.test(typed)
}
