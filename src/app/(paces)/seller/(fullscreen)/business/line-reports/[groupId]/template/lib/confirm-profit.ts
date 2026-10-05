/**
 * confirm-profit — ด่านยืนยันก่อนเปิดกำไร (feature 00070 EXT · FR-EXT-11 AC-8 · spec §6.3) · ตัวเดียวสามทางเข้า
 *   1) ลาก/＋ บล็อกกำไร  2) ติ๊ก "กำไรต่อร้าน"  3) แทรกโทเคน {กำไร}
 *
 * ทำไมตัดสินที่ "ทางเข้า" ไม่ใช่ตอนกดบันทึก: ยกเลิก = ไม่ลง และฉบับร่างไม่ค้างสถานะ "กำไรเปิดแต่ยังไม่ยืนยัน"
 * (ยกเว้นพิมพ์ {กำไร} เอง → แถบ inline บนบล็อก + บันทึกปิดจนยืนยัน — `profitNeedsConfirmation`)
 */
import { pacesConfirm } from '@/lib/paces-swal'
import type { DerivedFlags } from '@/lib/line-report/template'

type ProfitFlag = Pick<DerivedFlags, 'showProfit'>

/** เทมเพลตนี้เปิดกำไรเพิ่ม (false→true) และยังไม่ยืนยันในเซสชันหน้านี้ */
export const needsProfitConfirm = (prev: ProfitFlag, next: ProfitFlag, alreadyConfirmed: boolean): boolean =>
  !prev.showProfit && next.showProfit && !alreadyConfirmed

/** true = ไปต่อได้ (ไม่ต้องถาม หรือผู้ใช้ยืนยัน) · false = ผู้ใช้ยกเลิก ห้ามลง */
export async function confirmProfitExposure(prev: ProfitFlag, next: ProfitFlag, alreadyConfirmed: boolean): Promise<boolean> {
  if (!needsProfitConfirm(prev, next, alreadyConfirmed)) return true
  return pacesConfirm.warning('แสดงกำไรในกลุ่ม LINE?', 'ทุกคนในกลุ่มนี้จะเห็นตัวเลขกำไรของร้านที่เลือก ปิดได้ทุกเมื่อ', {
    confirmButtonText: 'แสดงกำไร',
    cancelButtonText: 'ยกเลิก',
  })
}

/**
 * ฉบับร่างเปิดกำไรอยู่ แต่ยังไม่เคยผ่านด่านยืนยัน (เช่นพิมพ์ {กำไร} เอง) และของที่บันทึกไว้ก็ยังไม่มีกำไร
 * → บันทึกไม่ได้ (server จะตอบ PROFIT_CONFIRM_REQUIRED อยู่ดี)
 */
export const profitNeedsConfirmation = (saved: ProfitFlag, draft: ProfitFlag, confirmed: boolean): boolean =>
  draft.showProfit && !saved.showProfit && !confirmed
