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

/**
 * ประโยคที่ใช้แทน "อัตราตีกลับ" เมื่อฐานยังไม่ถึง `MIN_SHIPPED_FOR_RATE`
 *
 * 🛑 **ต้องอยู่ติดกับตัวเลขที่บังคับมัน** — เดิมเขียนกระจาย 2 ที่คนละคำ ("ยังบอกอัตราไม่ได้"
 * ใน `CustomerTrustBar` กับ "ยังบอกไม่ได้" ในหน้าโปรไฟล์) ทั้งที่เป็นเกณฑ์เดียวกันเป๊ะ
 * และ **ไม่มีอันไหนบอกว่าต้องทำยังไงถึงจะรู้** ทั้งที่คำตอบสั้นมาก (ต้องมีพัสดุครบ N ใบ)
 * ⇒ ถ้าวันหนึ่งแก้ `MIN_SHIPPED_FOR_RATE` แล้วประโยคอยู่คนละไฟล์ มันจะโกหกทันที (HR16)
 */
export const rateUnavailableText = () => `ยังบอกอัตราไม่ได้ (ต้องมีพัสดุครบ ${MIN_SHIPPED_FOR_RATE} ใบ)`
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

  /**
   * 🛑 **ระดับความเสี่ยงตัดสินด้วย "จำนวน" ไม่ใช่ "อัตรา"** (user เคาะ 2026-08-26)
   *
   * เดิมเงื่อนไข HIGH ต้องผ่าน `returnRate !== null` ซึ่งต้องมีพัสดุครบ `MIN_SHIPPED_FOR_RATE`
   * แต่วัด prod แล้ว **ไม่มีลูกค้าคนไหนในระบบมีพัสดุถึง 3 ใบเลยสักคน** (0 ใบ 16% · 1 ใบ 82% ·
   * 2 ใบ 0.9% · สูงสุดในระบบ = 2) ⇒ `returnRate` เป็น `null` เสมอ ⇒ **กิ่ง HIGH ไม่มีทางถูกเลือก**
   * ⇒ ทุกจอที่นับ "ลูกค้าเสี่ยงสูง" เป็น 0 ถาวร = ไทล์ที่ไม่มีวันติด
   * (`feedback_dead_tile_change_what_it_counts`)
   *
   * ปมคือโค้ดเอา **เกณฑ์แสดงผล** กับ **เกณฑ์ตัดสินความเสี่ยง** มารวมกัน ทั้งที่ตอบคนละคำถาม:
   *   · "อัตรา 33%" เป็น **สถิติ** → ต้องมีฐาน ไม่งั้น 1/1 = 100% อ่านว่าเลวร้ายที่สุดในระบบ
   *   · "ตีกลับ 2 ครั้ง" เป็น **ข้อเท็จจริง** → ไม่ต้องมีฐาน ตีกลับ 2 ครั้งก็คือ 2 ครั้ง
   * ⇒ แยกออกจากกัน: ระดับใช้จำนวนล้วน · `returnRate` ยังคง gate ที่ 3 ใบเหมือนเดิม
   *
   * 🛑 `NONE` ยังเป็น `returned === 0` เหมือนเดิมเป๊ะ ⇒ `shouldWarnCodReturnRisk`
   * (ซึ่งเช็คแค่ `!== 'NONE'`) **ไม่เปลี่ยนพฤติกรรมบน prod** สิ่งที่เปลี่ยนคือลูกค้าที่ตีกลับ ≥2
   * ย้ายจากป้าย WATCH เป็น HIGH เท่านั้น — และทั้งสองระดับใช้สีเหลืองเหมือนกันอยู่แล้ว
   * (`BuyerReputationRow.RISK_META` — ห้ามแดง BR-BR-08/09)
   *
   * `HIGH_RISK_MIN_RATE` ยังคงไว้เป็นค่าคงที่เพราะยังใช้อธิบายเกณฑ์บนหน้าจอ
   * แต่ **ไม่ได้อยู่ในเงื่อนไขตัดสินอีกแล้ว** — ห้ามเอากลับเข้ามาโดยไม่แก้คอมเมนต์นี้
   */
  const riskLevel: BuyerRiskLevel =
    returned === 0 ? 'NONE' : returned >= HIGH_RISK_MIN_RETURNED ? 'HIGH' : 'WATCH'

  return { orders: orders.length, shipped, received, returned, cancelledByBuyer, returnRate, riskLevel }
}

/** ระดับที่หน้าจอใช้ — รวม "ยังบอกไม่ได้" ซึ่งไม่ใช่ระดับความเสี่ยง แต่เป็นสถานะข้อมูล */
export type CustomerRiskTier = 'high' | 'watch' | 'ok' | 'new'

/**
 * แปลง `BuyerReputation` เป็นระดับที่หน้ารายชื่อลูกค้าใช้จัดกลุ่ม/ลงสี
 *
 * 🛑 `ok` ("ประวัติดี") ต้องมีฐานพอ — ส่งครบ 3 ใบแล้วไม่ตีกลับเลย ถึงจะเรียกว่าดีได้
 * ส่งใบเดียวแล้วถึงมือ **ไม่ใช่ประวัติดี มันคือยังไม่รู้** (นี่คือเหตุผลเดียวกับที่อัตรามี gate)
 * ⇒ ไม่ถึงฐาน = `new` ไม่ใช่ `ok` — เขียวสงวนให้สิ่งที่ยืนยันแล้วจริง (Verified-Means-Green)
 */
export function classifyCustomerRiskTier(rep: BuyerReputation | null): CustomerRiskTier {
  if (!rep || rep.shipped === 0) return 'new'
  if (rep.riskLevel === 'HIGH') return 'high'
  if (rep.riskLevel === 'WATCH') return 'watch'
  return rep.shipped >= MIN_SHIPPED_FOR_RATE ? 'ok' : 'new'
}

/**
 * shouldWarnCodReturnRisk — ควรขึ้นคำเตือนก่อนเปิดพัสดุเก็บเงินปลายทางไหม (BR-BR-08 · D-3)
 *
 * 🛑 อยู่ที่นี่ไม่ใช่เทอร์นารีกลาง JSX ตาม `docs/conventions/ui-boolean-needs-a-testable-home.md`
 * — เกณฑ์ไม่ใช่ "ซับซ้อนพอไหม" แต่คือ "ถ้าเขียนกลับด้านแล้วจะมีอะไรจับได้ไหม" ซึ่งอันนี้เขียน
 * กลับด้านได้ง่ายมาก แล้วผลคือ **เตือนทุกใบจนร้านเลิกอ่าน** หรือ **ไม่เตือนเลยสักใบ** โดย
 * `tsc`/build ผ่านทั้งคู่เพราะเป็น boolean ที่ถูกต้องตามชนิดทุกประการ
 *
 * เตือนเฉพาะเมื่อ **เป็นใบ COD จริง** — ใบที่โอนมาแล้วไม่มีความเสี่ยงเรื่องค่าส่งไป-กลับ
 * แบบเดียวกัน (ร้านได้เงินไปแล้ว) การเตือนตรงนั้นคือเสียงรบกวนที่ทำให้คำเตือนที่จำเป็นถูกมองข้าม
 *
 * ⚠️ นี่เป็น "คำเตือน" ไม่ใช่ "ด่าน" — ผู้เรียกต้องยังกดสร้างพัสดุต่อได้เสมอ (BR-BR-08)
 * เราไม่รู้บริบท (อาจเป็นลูกค้าประจำที่บ้านเลขที่ผิดครั้งเดียว)
 */
export function shouldWarnCodReturnRisk(
  reputation: BuyerReputation | null | undefined,
  codAmount: number,
): boolean {
  if (!reputation) return false
  if (!(codAmount > 0)) return false
  return reputation.riskLevel !== 'NONE'
}
