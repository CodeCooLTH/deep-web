/**
 * buyer-reputation — สถิติพฤติกรรมผู้ซื้อ **ระดับทั้งระบบ** (feature 00055)
 *
 * ต่างจาก `customer-behavior.ts` ที่ตอบว่า "ลูกค้าคนนี้เคยทำอะไรกับ *ร้านเรา*" —
 * ไฟล์นี้ตอบว่า "ลูกค้าคนนี้รับของจริงแค่ไหน *ทั้งแพลตฟอร์ม*" (BR-BR-01)
 * ทั้งสองอยู่คู่กันโดยตั้งใจ: ร้านต้องเห็นทั้งของตัวเองและภาพรวม แล้วตัดสินใจเอง
 *
 * pure module — ห้าม import prisma/server-only (ใช้ทั้งฝั่ง server และ client render)
 *
 * 🛑 ผลลัพธ์ของไฟล์นี้ **ห้ามมีอะไรที่ระบุร้านได้เลย** (BR-BR-02 · มติ D-2) ตัวเลขรวม
 * เท่านั้น — ชื่อร้านอื่นคือข้อมูลธุรกิจของร้านนั้น ไม่ใช่ของเรา และการบังคับต้องอยู่ที่
 * *ชนิดข้อมูล* ไม่ใช่ที่การ render (ถ้าปล่อยให้ shopId ไหลมาถึง client แล้วค่อยไม่แสดง
 * มันจะโผล่ใน flight payload ฟรี ๆ — feedback_rsc_pii_neutralize_at_source)
 */

import { cancelReasonIsBuyerFault } from './cancel-reason-buyer-fault'
import { isDeliveredCarrierStatus, isReturnedCarrierStatus } from './iship/status'

/** หลักฐานรายใบเท่าที่ตัวตัดสินใช้ — ผู้เรียก select มาให้เท่านี้พอ (และห้ามมากกว่านี้) */
export type BuyerOrderEvidence = {
  status: string
  cancelInitiator: string | null
  cancelReason: string | null
  /**
   * carrierStatus ของพัสดุ "ที่มีอยู่จริง" ของใบนี้ (`status='CREATED'`, ไม่ใช่ dry-run)
   * `null` = ใบนี้ไม่มีพัสดุที่นับได้ — **คนละความหมายกับ "มีพัสดุแต่ขนส่งยังไม่อัปเดต"**
   * จึงต้องมีธง `hasShipment` แยก ไม่ใช่อนุมานจาก null (BR-BR-05)
   */
  activeShipmentCarrierStatus: string | null
  /** ใบนี้เคยเปิดพัสดุจริงไหม — ตัวหารของอัตราตีกลับใช้ค่านี้ ไม่ใช่จำนวนออเดอร์ทั้งหมด */
  hasShipment: boolean
}

export type BuyerRiskLevel = 'NONE' | 'WATCH' | 'HIGH'

export type BuyerReputation = {
  /** ออเดอร์ทั้งหมดทั้งระบบ (รวมที่ยกเลิก) */
  orders: number
  /** ใบที่เคยเปิดพัสดุจริง — ตัวหารของ `returnRate` */
  shipped: number
  /** ของถึงมือแล้ว (ขนส่งยืนยัน หรือผู้ซื้อกดยืนยันรับของเอง) */
  received: number
  /** พัสดุตีกลับ (`return`/`return_success`) */
  returned: number
  /** ยกเลิกโดยต้นเรื่องมาจากฝั่งลูกค้า (ไม่นับใบที่ตีกลับ — BR-BR-03) */
  cancelledByBuyer: number
  /**
   * อัตราพัสดุตีกลับ 0–1 · `null` = ฐานน้อยเกินกว่าจะบอกอัตราได้ (BR-BR-06)
   *
   * 🛑 `null` ไม่ใช่ 0 — "ยังบอกไม่ได้" กับ "ไม่เคยตีกลับ" คนละเรื่องกันคนละการตัดสินใจ
   */
  returnRate: number | null
  riskLevel: BuyerRiskLevel
}

/** ฐานขั้นต่ำก่อนจะพูดเป็น "อัตรา" ได้ — สั่ง 1 ตีกลับ 1 = 100% ซึ่งอ่านว่าเลวร้ายที่สุดในระบบ */
export const MIN_SHIPPED_FOR_RATE = 3
/** เกณฑ์ HIGH — ต้องผ่านทั้งจำนวนและอัตรา ไม่ใช่อย่างใดอย่างหนึ่ง (BR-BR-07) */
export const HIGH_RISK_MIN_RETURNED = 2
export const HIGH_RISK_MIN_RATE = 0.3

const EMPTY: BuyerReputation = {
  orders: 0,
  shipped: 0,
  received: 0,
  returned: 0,
  cancelledByBuyer: 0,
  returnRate: null,
  riskLevel: 'NONE',
}

export function summarizeBuyerReputation(orders: BuyerOrderEvidence[]): BuyerReputation {
  if (orders.length === 0) return EMPTY

  let shipped = 0
  let received = 0
  let returned = 0
  let cancelledByBuyer = 0

  for (const o of orders) {
    if (o.hasShipment) shipped += 1

    /**
     * ลำดับสำคัญ: **ตีกลับชนะยกเลิกเสมอ** (BR-BR-03 — กติกาเดียวกับ customer-behavior.ts)
     * ใบที่ตีกลับแล้วร้านกดยกเลิกตามคือเหตุการณ์ *เดียว* ไม่ใช่สอง ถ้านับแยกทั้งสองถัง
     * ร้านจะอ่านว่า "ยกเลิก 1 · ตีกลับ 1" แล้วเข้าใจว่าลูกค้ามีปัญหา 2 ครั้งจากใบเดียว
     */
    if (isReturnedCarrierStatus(o.activeShipmentCarrierStatus)) {
      returned += 1
      continue
    }

    if (o.status === 'CANCELLED') {
      // ต้นเรื่องมาจากฝั่งลูกค้าไหม — 2 ทาง (initiator ที่ระบบ derive เอง / เหตุผลที่ร้านบันทึก)
      // 🛑 บน prod ไม่มีใบไหนเลยที่ initiator='buyer' (ลูกค้าแจ้งในแชท ร้านกดให้) เกณฑ์ที่
      // ทำงานจริงคือ cancelReason — ดูเหตุผลเต็มใน customer-behavior.ts
      if (o.cancelInitiator === 'buyer' || cancelReasonIsBuyerFault(o.cancelReason)) {
        cancelledByBuyer += 1
      }
      continue
    }

    // ของถึงมือแล้ว: ขนส่งยืนยัน หรือผู้ซื้อกดยืนยันรับของเอง (CONFIRMED = ความจริงระดับสูงสุด)
    if (isDeliveredCarrierStatus(o.activeShipmentCarrierStatus) || o.status === 'CONFIRMED') {
      received += 1
    }
  }

  /**
   * ตัวหาร = ใบที่ **มีโอกาสตีกลับได้จริง** เท่านั้น (BR-BR-05)
   * ใบที่ไม่เคยเปิดพัสดุ (รับหน้าร้าน/สินค้าดิจิทัล/บริการ) ไม่มีทางตีกลับ เอาไปหารด้วย
   * จะได้อัตราที่ต่ำกว่าความจริงเสมอ (feedback_subtrahend_must_match_minuend_scope)
   */
  const returnRate = shipped >= MIN_SHIPPED_FOR_RATE ? returned / shipped : null

  const riskLevel: BuyerRiskLevel =
    returned === 0
      ? 'NONE'
      : returned >= HIGH_RISK_MIN_RETURNED && returnRate !== null && returnRate >= HIGH_RISK_MIN_RATE
        ? 'HIGH'
        : 'WATCH'

  return { orders: orders.length, shipped, received, returned, cancelledByBuyer, returnRate, riskLevel }
}
