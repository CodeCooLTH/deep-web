/**
 * service-reference.ts — "ข้อมูลอ้างอิง" ของงานร้านบริการ (SERVICE_QUEUE เท่านั้น · 2026-10-04)
 *
 * ช่องข้อความสั้น 1 ช่องที่ร้านพิมพ์ไว้จำ/ค้นหางาน เช่น ทะเบียนรถ รุ่นมือถือ ชื่อสัตว์เลี้ยง
 * ที่มา: ร้าน BT Premium พิมพ์ทะเบียนรถรวมไว้ในช่องชื่อลูกค้า ("4กฐ9100 คุณบุญคอง") เพราะไม่มีที่ให้กรอก
 *
 * 🛑 คนละช่องกับ `internalNote` ("หมายเหตุ") — หมายเหตุเป็นข้อความยาวที่ **จงใจไม่ให้ค้นหา** (00058 D-2)
 *    ส่วนช่องนี้มีไว้ค้นหาโดยเฉพาะ ⇒ ห้ามยุบรวมกัน (HR16)
 * 🛑 ฝั่งร้านเท่านั้น — ห้ามส่งถึงผู้ซื้อ (ทะเบียนรถระบุตัวคนได้) · ร้านขายของ/บ้านพักไม่มีช่องนี้
 */
import { resolveShopVertical } from '@/lib/lodging'

export const SERVICE_REFERENCE_LABEL = 'ข้อมูลอ้างอิง'
/** ข้อความในช่องตอนยังไม่กรอก — user เลือกแบบ A3-2 (2026-10-04) */
export const SERVICE_REFERENCE_PLACEHOLDER = 'ค้นหางานด้วยคำนี้ได้ เช่น ทะเบียนรถ รุ่นมือถือ ฯลฯ'
/** ตรงกับ `@db.VarChar(100)` ของ `Order.serviceReference` */
export const SERVICE_REFERENCE_MAX = 100

/** ร้านนี้มีช่องข้อมูลอ้างอิงไหม — ตัวตัดสินเดียวทั้งฟอร์ม/API/service/การแสดงผล */
export function acceptsServiceReference(vertical: string | null | undefined): boolean {
  return resolveShopVertical(vertical) === 'SERVICE_QUEUE'
}

/** ตัดช่องว่างหัวท้าย + ยุบช่องว่างซ้อน · ว่าง = null (ไม่เก็บสตริงว่าง) */
export function normalizeServiceReference(raw: string | null | undefined): string | null {
  if (raw == null) return null
  const v = raw.replace(/\s+/g, ' ').trim()
  return v ? v.slice(0, SERVICE_REFERENCE_MAX) : null
}

/**
 * รูปที่ใช้เทียบตอนค้นหา — ตัวเล็ก + ตัดช่องว่าง/ขีด/จุด/ทับ
 * ⇒ "4กฐ 9100" · "4กฐ-9100" · "4กฐ9100" เจอกันหมด (แต่ละใบพิมพ์รูปแบบไม่เหมือนกัน)
 */
export function compactForReferenceSearch(value: string): string {
  return value.toLowerCase().replace(/[\s\-._/]/g, '')
}

/** คำค้นตรงกับข้อมูลอ้างอิงของงานนี้ไหม (เทียบแบบตัดช่องว่าง/ขีด) */
export function referenceMatchesQuery(reference: string | null | undefined, query: string): boolean {
  if (!reference) return false
  const q = compactForReferenceSearch(query)
  return q.length > 0 && compactForReferenceSearch(reference).includes(q)
}

/**
 * ข้อความในช่องค้นหาหน้ารายการงาน — ร้านบริการได้ "/ ข้อมูลอ้างอิง" ต่อท้าย
 * 🛑 ร้านอื่นต้องได้ข้อความเดิมทุกตัวอักษร (ไม่มีช่องนี้ = ไม่บอกว่าค้นได้)
 */
export function orderSearchPlaceholder(noun: string, vertical: string | null | undefined): string {
  const base = `ค้นหาเลข${noun} / ชื่อลูกค้า / เบอร์ / เลขพัสดุ / สินค้า`
  return acceptsServiceReference(vertical) ? `${base} / ${SERVICE_REFERENCE_LABEL}` : base
}

/**
 * ตัดข้อมูลอ้างอิงออกจากแถว Order ก่อนส่งถึงผู้ซื้อ
 *
 * 🛑 มี endpoint ที่ผู้ซื้อเรียกได้แล้วคืน Order ทั้งแถว (ไม่มี select): ยืนยันรับ · ยกเลิก · รายการของผู้ซื้อ
 *    คอลัมน์ใหม่จึงหลุดไปถึงผู้ซื้อทันทีถ้าไม่ตัดที่ขาออก (ทะเบียนรถระบุตัวคนได้ — ฝั่งร้านเท่านั้น)
 *    ตัดเฉพาะคีย์นี้ — ไม่เปลี่ยนรูปของ response เดิม (ร้านทุกประเภทใช้ endpoint ชุดนี้ร่วมกัน)
 */
export function omitServiceReference<T extends object>(row: T): Omit<T, 'serviceReference'> {
  if (!row || typeof row !== 'object' || !('serviceReference' in row)) return row
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { serviceReference, ...rest } = row as T & { serviceReference?: unknown }
  return rest
}
