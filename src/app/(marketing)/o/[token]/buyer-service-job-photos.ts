/**
 * รูป + บันทึก "ก่อนทำ/หลังทำ" ที่ลูกค้าเห็นบนหน้า `/o/[token]` — feature 00086 P3 · T12 (S-13 · API §4.16)
 *
 * 🛑 หน้านี้เป็นหน้าสาธารณะ: ทุกคีย์ใน `PublicOrderData` ถูก serialize ลง flight payload ให้เปิดดูได้
 * จาก view-source ⇒ ด่าน "ร้านเปิดให้ลูกค้าเห็นไหม" ต้องตัดสิน **ก่อน query** ไม่ใช่ซ่อนตอน render
 * (docs/conventions/permission-gate-follows-the-row.md) · ไม่เข้าเงื่อนไข = ไม่ยิง query และไม่มีคีย์เลย
 *
 * 🛑 ไม่มีชื่อพนักงานใด ๆ (Controller Q1 2026-10-27) — select เป็น allow-list 4 คีย์
 * ห้ามเพิ่ม `createdByUserId` / `createdBy` / `shopId` / `id`
 */
import { fileUrlOf, variantUrlOf } from '@/lib/file-url'

/** ด่านเดียวของ "ลูกค้าเห็นรูปงาน" — ตัวเดียวกับที่ finishServiceJob ใช้ตัดสินส่งข้อความ SERVICE_FINISHED */
export function buyerSeesServiceJobPhotos(shop: {
  vertical: string
  serviceJobPhotosBuyerVisible: boolean
  serviceJobPhotoMode: string
}): boolean {
  return (
    shop.vertical === 'SERVICE_QUEUE' &&
    shop.serviceJobPhotosBuyerVisible === true &&
    shop.serviceJobPhotoMode !== 'NONE'
  )
}

/** allow-list ของแถว ServiceJobRecord ที่ลูกค้าได้ — ห้ามมีคีย์ผู้บันทึก */
export const BUYER_SERVICE_JOB_RECORD_SELECT = {
  phase: true,
  note: true,
  fileIds: true,
  createdAt: true,
} as const

export type BuyerServiceJobPhotoRecord = {
  phase: 'BEFORE' | 'AFTER'
  note: string | null
  /** URL ที่ `<img src>` ใช้ได้เลย (ผ่าน `fileUrlOf` — คีย์ storage ดิบใช้ไม่ได้) */
  photoUrls: string[]
  /**
   * รูปย่อ (00054 variant `thumb`) คู่กับ `photoUrls` ตำแหน่งเดียวกัน — ใช้ในกริด ประหยัดเน็ตลูกค้า
   * null = ค่าไม่ใช่คีย์ของบัคเก็ตเรา (ไม่มี variant) · ไฟล์รูปย่ออาจยังไม่มีจริง ⇒ ผู้ใช้ต้อง fallback ไปต้นฉบับ
   */
  thumbUrls: (string | null)[]
  createdAtIso: string
}

export type BuyerServiceJobPhotos = {
  records: BuyerServiceJobPhotoRecord[]
  /**
   * แสดง "รูปหลังทำจะขึ้นที่นี่เมื่อร้านทำเสร็จ" ได้ไหม — เป็นคำสัญญา จึงพูดได้เฉพาะเมื่อจริง:
   * โหมดบังคับรูป (ทำเสร็จต้องมีรูปหลังทำ) ∧ ยังไม่ทำเสร็จ ∧ ยังไม่ปิดงาน ∧ ไม่ถูกยกเลิก
   * (โหมด "ไม่บังคับ" ร้านทำเสร็จโดยไม่ถ่ายได้ — ไม่มีแถว AFTER เกิดเลย ประโยคนี้จะกลายเป็นคำโกหก)
   */
  afterPending: boolean
}

type RecordRow = { phase: string; note: string | null; fileIds: string[]; createdAt: Date }

/** แปลงแถว → ข้อมูลที่ส่งลงหน้า · แถวว่าง = null (ไม่มีคีย์ ไม่มีการ์ด) */
export function toBuyerServiceJobPhotos(
  rows: RecordRow[],
  order: {
    status: string
    serviceFinishedAt: Date | null
    serviceClosedAt: Date | null
    shopPhotoMode: string
  },
): BuyerServiceJobPhotos | null {
  const records = rows
    .filter((r): r is RecordRow & { phase: 'BEFORE' | 'AFTER' } => r.phase === 'BEFORE' || r.phase === 'AFTER')
    .sort((a, b) => (a.phase === b.phase ? 0 : a.phase === 'BEFORE' ? -1 : 1))
    .map((r) => ({
      phase: r.phase,
      note: r.note && r.note.trim() ? r.note : null,
      photoUrls: r.fileIds.filter(Boolean).map((k) => fileUrlOf(k)),
      thumbUrls: r.fileIds.filter(Boolean).map((k) => variantUrlOf(k, 'thumb')),
      createdAtIso: r.createdAt.toISOString(),
    }))
    .filter((r) => r.photoUrls.length > 0 || r.note !== null)

  if (records.length === 0) return null

  return {
    records,
    afterPending:
      order.shopPhotoMode === 'REQUIRED' &&
      order.serviceFinishedAt == null &&
      order.serviceClosedAt == null &&
      order.status !== 'CANCELLED',
  }
}
