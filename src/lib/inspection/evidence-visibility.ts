// evidence-visibility.ts — server ตัดสินว่าหลักฐานชิ้นไหนเปิดสาธารณะได้ (feature 00060 · T10)
//
// 🛑 **allow-list ไม่ใช่ deny-list** — คีย์ใหม่ที่ใครเพิ่มในอนาคตแล้วลืมพิจารณาเรื่องนี้ จะตกไป
//    `PRIVATE` เอง ซึ่งเป็นด้านที่ผิดแล้วแก้ได้ ตรงข้ามกับ deny-list ที่ลืมแล้วบัตรประชาชน/โฉนด
//    ขึ้นหน้าโปรไฟล์สาธารณะ ซึ่งเป็นความเสียหายที่กู้ไม่ได้
//
// 🛑 **ไม่รับ `visibility` จาก client เด็ดขาด** — ทางที่ข้อมูลจะหลุดคือคำขอเดียวที่พิมพ์ "PUBLIC"
//    ไม่ใช่ช่องโหว่ที่ต้องหาให้เจอ

import { INSPECTION_CHECKS, type InspectionCheckKey } from './checks'

export type EvidenceKind = 'PHOTO' | 'VIDEO_STILL' | 'DOCUMENT' | 'GEO'
export type EvidenceVisibility = 'PUBLIC' | 'PRIVATE'

/** คู่ (kind, checkKey) ที่เปิดสาธารณะได้ — นอกรายการนี้ทั้งหมดเป็น PRIVATE */
const PUBLIC_PAIRS: ReadonlyArray<{ kind: EvidenceKind; checkKey: InspectionCheckKey }> = [
  // อัลบั้มภาพที่ผู้ตรวจของ Deep ถ่ายเอง — ภาพที่ไม่ผ่านมือร้านคือมูลค่าทั้งหมดของงานนี้ (AC-INS-15-2)
  { kind: 'PHOTO', checkKey: 'deep_photo_album' },
  // ภาพนิ่งจากวิดีโอคอลนำชม (AC-INS-15-1)
  { kind: 'VIDEO_STILL', checkKey: 'video_tour' },
  // พิกัดที่ผู้ตรวจไปยืนจริง (AC-INS-15-2)
  { kind: 'GEO', checkKey: 'location_exists' },
]

export type VisibilityDecision =
  | { ok: true; visibility: EvidenceVisibility }
  /** ชนิดหลักฐานขัดกับข้อตรวจ — ต้องตอบ 400 ไม่ใช่เงียบ ๆ ลดเป็น PRIVATE */
  | { ok: false; reason: 'EVIDENCE_VISIBILITY_FORBIDDEN' }

/**
 * 🛑 `DOCUMENT` เป็น `PRIVATE` เสมอไม่มีข้อยกเว้น — และถ้าถูกส่งมาคู่กับคีย์ที่อยู่ในกลุ่มสาธารณะ
 *    ให้ **ปฏิเสธ** แทนที่จะกลืนแล้วลดเป็น PRIVATE เพราะนั่นแปลว่าฝั่งเรียกเข้าใจผิดบางอย่าง
 *    และการกลืนไว้ทำให้ไม่มีใครรู้
 */
export function resolveEvidenceVisibility(
  kind: EvidenceKind,
  checkKey: InspectionCheckKey,
): VisibilityDecision {
  const isPublicPair = PUBLIC_PAIRS.some((p) => p.kind === kind && p.checkKey === checkKey)
  if (isPublicPair) return { ok: true, visibility: 'PUBLIC' }

  // ส่งเอกสารมาให้ข้อที่หลักฐานของมันเป็นของสาธารณะ = ฝั่งเรียกเข้าใจผิด
  if (kind === 'DOCUMENT' && INSPECTION_CHECKS[checkKey].publicEvidence) {
    return { ok: false, reason: 'EVIDENCE_VISIBILITY_FORBIDDEN' }
  }
  return { ok: true, visibility: 'PRIVATE' }
}
