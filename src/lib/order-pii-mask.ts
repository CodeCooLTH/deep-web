/**
 * order-pii-mask — มาสก์ PII ของออเดอร์สำหรับ guest view (feature 00041, SRS TFR-002)
 *
 * 🛑 pure module ห้าม import prisma/server-only — และ **ต้องเรียกจาก server component/service
 * เท่านั้น** ไม่ใช่จาก client component: ถ้า mask ที่ client ค่าดิบจะถูก serialize ลง RSC flight
 * payload ไปแล้วก่อนถูกซ่อน = ยังรั่วอยู่ (memory `feedback_rsc_pii_neutralize_at_source`)
 *
 * ระดับการเปิดเผยที่ user เคาะไว้ (BR-BOE-02/03):
 *   - เบอร์โทร  → โชว์ 3 หลักท้าย  `•••-•••-891`
 *   - ที่อยู่    → จังหวัด "เต็ม" + ท่อนอื่นโชว์ 3 ตัวท้าย
 *   - note ของที่อยู่ → ไม่เปิดเผยเลย (ไม่มีใน return type — ดู MaskedShippingAddress)
 */

import type { ShippingAddressLike } from '@/lib/shipping-address-status'
import { normalizePhone } from '@/lib/phone'

/** จำนวนตัวอักษรท้ายที่เปิดให้เห็น — SSOT ห้าม hardcode 3 ที่อื่น (BR-BOE-02/03) */
export const VISIBLE_TAIL = 3

const MASK_CHAR = '•'

/**
 * ตัดสตริงเป็น "ตัวอักษรที่คนอ่านเห็นเป็นตัวเดียว" (grapheme) ไม่ใช่ code unit
 *
 * 🛑 ทำไมไม่ใช้ `value.slice(-3)`: ภาษาไทยมีสระ/วรรณยุกต์ที่เป็น code point แยกแต่เกาะอยู่กับ
 * พยัญชนะตัวหน้า — ตัดด้วย index ดิบจะพรากมันออกจากฐาน แล้วเรนเดอร์เป็นสระลอย (◌ื) ซึ่งอ่านไม่ออก
 * และดูเหมือนหน้าจอพัง ตัวอย่างจริงจากข้อมูลของเรา: 'เมืองสมุทรปราการ', 'บางปูใหม่'
 */
function toGraphemes(value: string): string[] {
  // Intl.Segmenter มีใน Node 16+ และเบราว์เซอร์ยุคปัจจุบัน — fallback ไว้เผื่อ runtime ที่ไม่มี
  const Seg = (Intl as unknown as { Segmenter?: typeof Intl.Segmenter }).Segmenter
  if (!Seg) return Array.from(value)
  // ต้องเรียก .segment(value) ก่อน — ตัว Segmenter เองไม่ใช่ iterable (พลาดตรงนี้มาแล้วรอบหนึ่ง
  // แล้วได้ array ว่างทุกครั้ง = mask คืนค่าว่างล้วน ซึ่งดูเหมือน "ปลอดภัยไว้ก่อน" จนไม่มีใครสงสัย)
  return Array.from(new Seg('th', { granularity: 'grapheme' }).segment(value), (s) => s.segment)
}

/**
 * เหลือ 3 ตัวท้าย ที่เหลือแทนด้วย `•` หนึ่งตัวต่อหนึ่งตัวอักษรเดิม
 *
 * ยาว ≤ 3 → mask ทั้งหมด (ไม่มีอะไรให้เหลือ) — สำคัญ: ถ้าคืนค่าเดิมตอนสั้น ๆ จะกลายเป็นเปิดเผย
 * ทั้งคำสำหรับตำบล/อำเภอชื่อสั้น เช่น 'บาง' ซึ่งขัดเจตนาของ BR-BOE-03
 */
export function maskLast3(value: string): string {
  const g = toGraphemes(value ?? '')
  if (g.length === 0) return ''
  if (g.length <= VISIBLE_TAIL) return MASK_CHAR.repeat(g.length)
  return MASK_CHAR.repeat(g.length - VISIBLE_TAIL) + g.slice(-VISIBLE_TAIL).join('')
}

/**
 * เบอร์ไทย 10 หลัก → `•••-•••-891`
 *
 * ค่าที่ normalize ไม่ผ่าน (อีเมล/เบอร์ต่างประเทศ/ค่าว่าง) → **null** ไม่ใช่พยายาม mask ต่อ:
 * รูปแบบที่เราไม่รู้จักแปลว่าเราไม่รู้ว่าส่วนไหนอ่อนไหว การเดาแล้วโชว์บางส่วนอันตรายกว่าไม่โชว์เลย
 * (UI ที่รับ null ต้องไม่ render แถวเบอร์ ไม่ใช่แสดงคำว่า "ไม่ระบุ")
 */
export function maskPhoneForGuest(phone: string | null | undefined): string | null {
  if (!phone) return null
  const normalized = normalizePhone(phone)
  if (!normalized) return null
  return `${MASK_CHAR.repeat(3)}-${MASK_CHAR.repeat(3)}-${normalized.slice(-VISIBLE_TAIL)}`
}

/**
 * ที่อยู่ที่ guest เห็นได้ — **ไม่มี `note` โดยตั้งใจ**
 *
 * `note` เป็น free-text ที่ผู้ซื้อพิมพ์เอง มักมีเบอร์สำรอง/จุดสังเกตที่ระบุตัวตนได้ปนอยู่ และ
 * BR-BOE-01/03 ไม่ได้อนุญาตไว้ — การไม่ใส่ใน type ทำให้ "ลืมกรอง" เป็นไปไม่ได้ (tsc จับให้)
 */
export interface MaskedShippingAddress {
  /** ไม่ mask — ให้บริบทว่าออเดอร์ส่งไปทางไหน (BR-BOE-03) */
  province: string
  line1: string
  subdistrict: string
  district: string
  postcode: string
}

/**
 * mask ที่อยู่สำหรับ guest — จังหวัดเต็ม ที่เหลือโชว์ 3 ตัวท้าย
 *
 * ฟิลด์ที่ไม่มีค่า → คืน `''` (ไม่ throw, ไม่ใส่ `•` ปลอม) เพื่อให้ UI ตัดสินเองว่าจะซ่อนบรรทัดไหน
 */
export function maskShippingAddressForGuest(
  addr: ShippingAddressLike | null | undefined,
): MaskedShippingAddress | null {
  if (!addr) return null
  const keep = (v: string | null | undefined) => (v ?? '').trim()
  const mask = (v: string | null | undefined) => {
    const s = keep(v)
    return s ? maskLast3(s) : ''
  }
  return {
    province: keep(addr.province),
    line1: mask(addr.line1),
    subdistrict: mask(addr.subdistrict),
    district: mask(addr.district),
    postcode: mask(addr.postcode),
  }
}
