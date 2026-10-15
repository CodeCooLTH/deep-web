/**
 * confirm-detail-link — ด่านยืนยันก่อนเปิดปุ่มไปหน้าสรุปรายละเอียดสาธารณะ (feature 00070 EXT · spec B3-B5) · ตามแบบ confirm-expense
 *
 * ลิงก์ที่ส่งออกไปแล้วเรียกคืนไม่ได้ (BR-45) → ตั้ง focusCancel กัน Enter ค้างมือเปิดเผยชื่อลูกค้า
 * เทียบกับเทมเพลตที่ "บันทึกแล้ว" (server เทียบกับที่บันทึก) · ถามครั้งเดียวต่อเซสชัน (ผู้เรียกถือธง) · server เป็นด่านจริง
 */
import { pacesConfirm } from '@/lib/paces-swal'
import { deriveExposure, detailLinkBlocked, needsDetailLinkConfirm, type TemplateV1 } from '@/lib/line-report/template'

export const DETAIL_LINK_NEEDS_METRIC_HELPER = 'เปิดได้เมื่อข้อความมีจำนวนรายการหรือยอดขายอย่างน้อย 1 อย่าง'
export const DETAIL_LINK_DRAFT_REASON = 'ปุ่มเปิดหน้าสรุปรายละเอียดต้องมีบล็อกจำนวนรายการหรือยอดขาย เพิ่มบล็อก หรือปิดตัวเลือกนี้'
/** ต่อท้ายโน้ตของค่าใช้จ่ายเมื่อปลายทางปุ่มคือหน้าสรุป — เจ้าของต้องรู้ว่าโน้ตอิสระขึ้นหน้าสาธารณะ */
export const EXPENSE_DETAIL_NOTE = 'หน้าสรุปรายละเอียดจะแสดงโน้ตของแต่ละรายการด้วย ส่วนการ์ดใน LINE ยังไม่แสดงโน้ต'

/** รายการสิ่งที่ผู้ถือลิงก์จะเห็น — ประกอบตามบล็อกที่เปิดจริง */
export function detailExposureLines(next: TemplateV1): string[] {
  const sales = next.blocks.some((b) => b.type === 'sales')
  return [
    'รายการทั้งหมดของรอบนั้น พร้อมชื่อลูกค้าและเบอร์ที่ปิดบางส่วน (•••-•••-891)',
    `ชื่องานหรือสินค้า${sales ? ' และยอดเงินรายใบ' : ''}`,
    ...(deriveExposure(next).expense ? ['ค่าใช้จ่ายทุกรายการ พร้อมโน้ตที่คุณบันทึกไว้'] : []),
  ]
}

/** true = ไปต่อได้ (ไม่ต้องถาม หรือผู้ใช้ยืนยัน) · false = ผู้ใช้ยกเลิก ห้ามเปลี่ยน */
export async function confirmDetailLinkExposure(prevSaved: TemplateV1 | null, next: TemplateV1, alreadyConfirmed: boolean): Promise<boolean> {
  if (alreadyConfirmed || !needsDetailLinkConfirm(prevSaved, next)) return true
  // html ประกอบจากสตริงคงที่ล้วน ไม่มีข้อมูลผู้ใช้ → ไม่ต้อง escape
  const items = detailExposureLines(next).map((l) => `<li>${l}</li>`).join('')
  const html = `<div class="text-start text-sm text-default-700">
    <p class="mb-2">ใครก็ตามที่ได้ลิงก์จากกลุ่มนี้เปิดดูได้โดยไม่ต้องเข้าสู่ระบบ เขาจะเห็น</p>
    <ul class="mb-2 list-disc ps-5">${items}</ul>
    <p class="mb-0">ลิงก์ใช้ได้จนสิ้นวันถัดไปและส่งต่อได้ ปิดตัวเลือกนี้ได้ทุกเมื่อ แต่ลิงก์ที่ส่งไปแล้วจะยังเปิดได้จนหมดอายุ</p>
  </div>`
  return pacesConfirm.warning('เปิดหน้าสรุปรายละเอียดให้ทุกคนที่ได้รับลิงก์?', undefined, {
    html,
    confirmButtonText: 'เปิดหน้าสรุป',
    cancelButtonText: 'ยกเลิก',
    focusCancel: true,
    allowOutsideClick: false,
  })
}

/** สวิตช์ "ปุ่มเปิดหน้าสรุปรายละเอียด" — disabled/ข้อความรอง ตาม spec B4 (ลำดับ: อ่านอย่างเดียว > ซ่อนปุ่ม > ไม่มีตัวเลข) */
export function detailSwitchState(draft: TemplateV1, readOnly: boolean): { checked: boolean; disabled: boolean; sub: string | null } {
  const checked = draft.button.target === 'DETAIL'
  if (readOnly) return { checked, disabled: true, sub: null }
  if (!draft.button.show) return { checked, disabled: true, sub: 'เปิดแสดงปุ่มก่อน จึงตั้งปลายทางได้' }
  // เปิดอยู่แล้วแต่ไม่มีตัวเลข: ยังกดปิดได้ (ไม่ปิดให้เงียบ ๆ) — เหตุบล็อกการบันทึกอยู่ที่ analyzeDraft
  if (!checked && detailLinkBlocked(draft)) return { checked, disabled: true, sub: DETAIL_LINK_NEEDS_METRIC_HELPER }
  return { checked, disabled: false, sub: checked ? 'กดแล้วเห็นรายการ ยอดแยกตามสถานะ โดยไม่ต้องเข้าสู่ระบบ' : 'ตอนนี้ปุ่มเปิดหน้า Deep ของร้าน' }
}

/** แถบเสนอเปลี่ยนป้าย: เปิดหน้าสรุปแต่ป้ายยังเป็นค่าตั้งต้น "เปิด Deep" (ไม่เปลี่ยนเอง — ป้ายเป็นของเจ้าของ) */
export const DETAIL_SUGGESTED_LABEL = 'ดูสรุปรายละเอียด'
export const shouldSuggestDetailLabel = (draft: TemplateV1, defaultLabel: string): boolean => draft.button.target === 'DETAIL' && draft.button.label === defaultLabel
