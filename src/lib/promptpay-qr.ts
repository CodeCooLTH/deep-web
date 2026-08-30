/**
 * promptpay-qr — EMVCo payload builder ของ QR พร้อมเพย์ (feature 00062, TFR-011)
 *
 * 🛑 **นี่คือไฟล์ที่เสี่ยงที่สุดของฟีเจอร์นี้** — payload ผิดจุดใดจุดหนึ่ง (tag/length/CRC)
 * = ผู้ซื้อสแกนแล้วโอนผิดยอด/ผิดบัญชี ซึ่งกู้คืนไม่ได้ (`docs/conventions/external-payload-schema.md`)
 * fail-closed เสมอ: encode ล้มเหลว → คืน `null` ห้ามคืน payload ที่อาจผิด (SRS TFR-011)
 *
 * ## ที่มาของสเปก
 * รูปแบบตามมาตรฐาน "Thai QR Payment" ของสมาคมธนาคารไทย ซึ่งอิงมาตรฐาน EMVCo QR Code
 * Specification for Payment Systems (Merchant Presented Mode). โครงสร้าง/tag id ที่ใช้ในไฟล์นี้
 * ตรงกับ implementation อ้างอิงที่นักพัฒนาไทยใช้กันแพร่หลายมานาน (`dtinth/promptpay-qr`
 * บน npm — เปิด source ตรวจสอบได้, ผ่านการยืนยันกับแอปธนาคารจริงมาแล้วโดยชุมชน) ซึ่งเป็น
 * ความรู้ที่มีอยู่ในโมเดลนี้อยู่แล้ว — **session นี้ไม่มีเครื่องมือ WebSearch/WebFetch ให้ตรวจซ้ำ
 * กับเอกสารต้นทางสด ๆ** จึงต้องพิสูจน์ความถูกต้องด้วย 2 ทาง: (1) เทส CRC16-CCITT-FALSE
 * เทียบกับ known-answer test vector ที่เผยแพร่กว้างมาก ("123456789" → CRC `29B1`,
 * ตาม reveng CRC catalogue: width=16 poly=0x1021 init=0xFFFF refin/refout=false xorout=0)
 * (2) parser อิสระในไฟล์เทส decode payload กลับแล้วเทียบยอดเงิน — **ทั้งสองข้อยังไม่ทดแทน
 * การสแกนด้วยแอปธนาคารจริงตามที่ SRS TFR-011 บังคับ** ซึ่งเป็นขั้นตอนที่ Controller ต้องทำ
 * ต่อจาก `scripts/promptpay-qr-sample.ts` ก่อน mark FR-BANK-05 ว่าเสร็จ — ห้ามข้าม
 *
 * Tag ที่ใช้ (EMVCo Merchant Presented Mode):
 *   00 = Payload Format Indicator ("01")
 *   01 = Point of Initiation Method ("12" = dynamic, มียอดเงินฝัง)
 *   29 = Merchant Account Information — พร้อมเพย์
 *     00 = GUID พร้อมเพย์ = "A000000677010111"
 *     01 = เบอร์มือถือ (13 หลัก: "00" + "66" + เบอร์ 9 หลักท้าย, pad ซ้ายด้วย 0 ให้ครบ 13)
 *     02 = เลขบัตรประชาชน/เลขผู้เสียภาษี (13 หลัก ใช้ตรง ๆ ไม่แปลง)
 *   53 = Transaction Currency = "764" (THB, ISO 4217 numeric)
 *   54 = Transaction Amount (ทศนิยม 2 ตำแหน่งเสมอ)
 *   58 = Country Code = "TH"
 *   63 = CRC (tag+length ของ tag 63 เอง ("6304") ต้องรวมอยู่ในข้อมูลที่คำนวณ CRC ด้วย
 *        แต่ตัวค่า CRC เองไม่รวม) — ต้องเป็น tag สุดท้ายเสมอ
 *
 * ทุกฟังก์ชันในไฟล์นี้เป็น **ฟังก์ชันบริสุทธิ์** — ห้าม import prisma/React
 */

import { MOBILE_PHONE_RE } from '@/lib/phone'

/** GUID ของพร้อมเพย์ตามสเปก EMVCo — ค่าคงที่ ไม่มีการแปรผัน */
const PROMPTPAY_AID = 'A000000677010111'

/** เลขบัตรประชาชน/เลขผู้เสียภาษีไทย — 13 หลักล้วน (ไม่มี SSOT เดิมในระบบสำหรับ 13 หลัก — สร้างใหม่ตาม SRS §5) */
export const NATIONAL_ID_RE = /^[0-9]{13}$/

/** ประกอบ TLV field เดียว (tag id 2 หลัก + ความยาว 2 หลัก + ค่า) */
function tlv(id: string, value: string): string {
  if (value.length > 99) {
    // ป้องกันความยาวเกิน 2 หลักที่ฟิลด์ length รองรับ — ไม่ควรเกิดกับข้อมูลของฟีเจอร์นี้จริง
    throw new Error(`[promptpay-qr] tag ${id} ยาวเกิน 99 ตัวอักษร (${value.length})`)
  }
  return `${id}${String(value.length).padStart(2, '0')}${value}`
}

/**
 * CRC-16/CCITT-FALSE — poly `0x1021`, init `0xFFFF`, ไม่ reflect, xorout `0x0000`
 *
 * ยืนยันด้วย known-answer test vector: `crc16ccitt('123456789') === '29B1'`
 * (ดูเทส `promptpay-qr.test.ts`)
 */
export function crc16ccitt(data: string): string {
  let crc = 0xffff
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

type PromptPayTarget = { tag: '01'; value: string } | { tag: '02'; value: string }

/**
 * จำแนก + แปลง promptPayId เป็นรูปที่ EMVCo ต้องการ
 * มือถือ 10 หลัก (`MOBILE_PHONE_RE`) → tag `01`, ค่า 13 หลัก ("0066" + เบอร์ 9 หลักท้าย)
 * เลขบัตร ปชช. 13 หลัก (`NATIONAL_ID_RE`) → tag `02`, ค่าตรงตัว
 * ผิดรูปแบบทั้งคู่ → `null`
 */
function classifyPromptPayId(raw: string): PromptPayTarget | null {
  const digits = (raw ?? '').replace(/\D/g, '')

  if (MOBILE_PHONE_RE.test(digits)) {
    // '0812345678' → ตัด 0 นำหน้า ใส่ 66 แทน → '66812345678' (11 หลัก) → pad ซ้ายด้วย 0 ให้ครบ 13
    const withCountryCode = digits.replace(/^0/, '66')
    return { tag: '01', value: withCountryCode.padStart(13, '0') }
  }

  if (NATIONAL_ID_RE.test(digits)) {
    return { tag: '02', value: digits }
  }

  return null
}

export interface BuildPromptPayPayloadInput {
  /** เบอร์มือถือ 10 หลัก หรือเลขบัตร ปชช./เลขผู้เสียภาษี 13 หลัก */
  promptPayId: string
  /** ยอดเงินของออเดอร์ ณ ปัจจุบัน (บาท) — ต้อง > 0 */
  amount: number
}

/**
 * สร้าง EMVCo payload string ของ QR พร้อมเพย์ — fail-closed: คืน `null` เมื่อ input ผิดรูปแบบ
 *
 * 🛑 ห้ามแก้ให้ throw แทน `null` — ผู้เรียก (`/o/[token]`) ใช้ `null` เป็นสัญญาณ "ไม่แสดง QR เลย"
 * (SRS TFR-011: "ไม่มี block ว่าง/QR เสียเมื่อ encode ล้มเหลว")
 */
export function buildPromptPayPayload({ promptPayId, amount }: BuildPromptPayPayloadInput): string | null {
  if (!Number.isFinite(amount) || amount <= 0) return null

  const target = classifyPromptPayId(promptPayId)
  if (!target) return null

  const amountStr = amount.toFixed(2)

  const merchantAccountInfo = tlv('00', PROMPTPAY_AID) + tlv(target.tag, target.value)

  const body =
    tlv('00', '01') + // Payload Format Indicator
    tlv('01', '12') + // Point of Initiation Method — dynamic QR (มียอดเงินฝังอยู่)
    tlv('29', merchantAccountInfo) + // Merchant Account Info — พร้อมเพย์
    tlv('53', '764') + // Transaction Currency — THB
    tlv('54', amountStr) + // Transaction Amount
    tlv('58', 'TH') // Country Code

  // tag+length ของ CRC เอง ("6304") ต้องรวมอยู่ในข้อมูลที่คำนวณ CRC ด้วย ตัวค่า CRC เองไม่รวม
  const withCrcHeader = `${body}6304`
  const crc = crc16ccitt(withCrcHeader)

  return withCrcHeader + crc
}
