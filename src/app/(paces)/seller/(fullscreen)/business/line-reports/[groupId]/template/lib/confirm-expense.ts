/**
 * confirm-expense — ด่านยืนยันก่อนเปิดค่าใช้จ่าย/ยอดขายหลังหักค่าใช้จ่าย (feature 00070 EXT-EXP · FR-EXP-05) · ตามแบบ confirm-profit
 *
 * ตัดสินที่ "ทางเข้า" (ลาก/＋ บล็อก) · ยกเลิก = ไม่ลง · ถามครั้งเดียวต่อเซสชัน (ผู้เรียกถือธง) ·
 * server เป็นด่านจริง (EXPENSE_CONFIRM_REQUIRED) — ที่นี่แค่ไม่ให้ผู้ใช้ไปเจอ 400 ตอนกดบันทึก
 */
import { pacesConfirm } from '@/lib/paces-swal'
import { needsExpenseConfirm } from '@/lib/line-report/template'
import type { TemplateV1 } from '@/lib/line-report/template'
import { EXPENSE_DETAIL_NOTE } from './confirm-detail-link'

/** true = ไปต่อได้ (ไม่ต้องถาม หรือผู้ใช้ยืนยัน) · false = ผู้ใช้ยกเลิก ห้ามลง */
export async function confirmExpenseExposure(prev: TemplateV1, next: TemplateV1, alreadyConfirmed: boolean): Promise<boolean> {
  if (alreadyConfirmed || !needsExpenseConfirm(prev, next)) return true
  const base = 'ทุกคนในกลุ่มนี้จะเห็นค่าใช้จ่ายและยอดขายหลังหักค่าใช้จ่ายของร้านที่เลือก ปิดได้ทุกเมื่อ'
  // ปุ่มชี้หน้าสรุป → โน้ตอิสระของแต่ละรายการขึ้นหน้าสาธารณะด้วย ต้องบอกก่อนยืนยัน
  const text = next.button.target === 'DETAIL' ? `${base} ${EXPENSE_DETAIL_NOTE}` : base
  return pacesConfirm.warning('แสดงค่าใช้จ่ายในกลุ่ม LINE?', text, {
    confirmButtonText: 'แสดงค่าใช้จ่าย',
    cancelButtonText: 'ยกเลิก',
  })
}
