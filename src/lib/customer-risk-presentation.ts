/**
 * customer-risk-presentation — SSOT ของ **คำ / สี / ไอคอน** ของระดับความเสี่ยงลูกค้า
 * (feature 00057 · แพตเทิร์นเดียวกับ `order-profit-presentation.ts`)
 *
 * 🛑 ทำไมต้องแยกไฟล์: ระดับความเสี่ยงถูกวาดพร้อมกัน **5 ที่** บนหน้าเดียว — hero มือถือ,
 * แถบ "ต้องจัดการก่อน", การ์ดสถิติเดสก์ท็อป, badge บนอวตาร์ในลิสต์, และเซลล์ในตาราง
 * ถ้าแต่ละที่พิมพ์คำ/คลาสเอง วันหนึ่งจอเดียวจะเรียกคนคนเดียวกันด้วยคำต่างกัน (HR16)
 *
 * 🛑 **ห้ามใช้แดงกับระดับความเสี่ยงลูกค้า** — `CustomerBadgeTone = 'info' | 'warning'`
 * บังคับไว้ที่ตัว type แล้ว และ `customer-behavior.ts` / `CustomerTrustBar.tsx` /
 * `BuyerReputationRow.tsx` เขียนเหตุผลตรงกันว่า *"เตือน ไม่ตัดสิน — ร้านยังตัดสินใจเองได้เสมอ"*
 * แดงในระบบนี้สงวนให้ "ทำไม่สำเร็จ/ระบบพัง" ไม่ใช่ "คนน่าสงสัย"
 * (ม็อกอัพรอบแรกใช้แดง — user ยืนยัน 2026-08-26 ให้คงกฎเดิม แยกความหนักด้วย
 *  ไอคอน + คำ + ลำดับ แทนการเพิ่มสี)
 */
import { MIN_SHIPPED_FOR_RATE, type BuyerReputation, type CustomerRiskTier } from './buyer-reputation'

export const RISK_TIER_LABEL: Record<CustomerRiskTier, string> = {
  high: 'เสี่ยงสูง',
  watch: 'ต้องเฝ้าระวัง',
  /** 🛑 ไม่ใช้คำว่า "ลูกค้าประจำ" — ชนกับ badge `REGULAR` ที่เกณฑ์คนละอัน (completed >= 3) */
  ok: 'ประวัติดี',
  new: 'ยังบอกไม่ได้',
}

/** solar duotone — ชุดเดียวกับไทล์ dashboard (`OrderStatusBand`) ไม่ใช่ tabler เส้นบาง */
export const RISK_TIER_ICON: Record<CustomerRiskTier, string> = {
  high: 'solar:danger-triangle-bold-duotone',
  watch: 'solar:eye-bold-duotone',
  ok: 'solar:check-circle-bold-duotone',
  new: 'solar:question-circle-bold-duotone',
}

/** สีตัวอักษร/ไอคอนล้วน (ไม่มีพื้น) */
export const RISK_TIER_TONE: Record<CustomerRiskTier, string> = {
  high: 'text-warning',
  watch: 'text-warning',
  /** เขียว = ยืนยันแล้วจริง (ส่งครบฐานแล้วไม่ตีกลับเลย) — Verified-Means-Green */
  ok: 'text-success',
  new: 'text-default-300',
}

/** พื้น + ตัวอักษรสำหรับ badge (`bg-{semantic}/15 text-{semantic}-ink` ตาม HR7) */
export const RISK_TIER_BADGE: Record<CustomerRiskTier, string> = {
  high: 'bg-warning/15 text-warning-ink',
  watch: 'bg-warning/15 text-warning-ink',
  ok: 'bg-success/15 text-success-ink',
  new: 'bg-light text-default-600',
}

/**
 * สรุป "ตีกลับข้ามร้าน" ให้อยู่ในรูปที่หน้าจอใช้ได้ทันที
 *
 * 🛑 คืนเป็น **สถานะ ไม่ใช่สตริง** เพื่อให้ผู้เรียกจัดรูปเองตามพื้นที่ (บรรทัดเดียวบนมือถือ
 * vs เซลล์ 2 บรรทัดบนตาราง) แต่ยัง **ตัดสินใจเรื่องเกณฑ์ที่เดียว** — ถ้าคืนเป็นสตริงสำเร็จรูป
 * มือถือกับเดสก์ท็อปจะเริ่มแตกคำกันเองเมื่อมีคนแก้ที่ใดที่หนึ่ง
 *
 * 🛑 `insufficient` ต้องคืน `base` มาด้วย — ฐานคือสิ่งที่บอกว่าเชื่อเลขนั้นได้แค่ไหน
 * ห้ามซ่อนทิ้งแล้วแสดงแค่ `—` เปล่า ๆ (ผู้ขายต้องรู้ว่าต้องรออีกกี่ใบ)
 */
export type CrossShopReturnSummary =
  | { state: 'none' }
  | { state: 'insufficient'; base: number; min: number }
  | { state: 'rate'; base: number; returned: number; pct: number }

export function crossShopReturnSummary(rep: BuyerReputation | null): CrossShopReturnSummary {
  if (!rep || rep.shipped === 0) return { state: 'none' }
  if (rep.returnRate === null) {
    return { state: 'insufficient', base: rep.shipped, min: MIN_SHIPPED_FOR_RATE }
  }
  return {
    state: 'rate',
    base: rep.shipped,
    returned: rep.returned,
    pct: Math.round(rep.returnRate * 100),
  }
}

/**
 * สีของตัวเลขอัตรา — เข้มขึ้นตามความรุนแรง แต่ **ยังไม่ใช่แดง**
 * 0% ได้เขียวเพราะเป็นข้อเท็จจริงที่ยืนยันแล้ว (ส่งครบฐานแล้วไม่ตีกลับเลย)
 */
export function returnRateTone(pct: number): string {
  if (pct >= 30) return 'text-warning-ink'
  if (pct > 0) return 'text-warning-ink'
  return 'text-success'
}
