/**
 * ต้นทุนผันแปรต่อออเดอร์ที่ร้านตั้งเอง (feature 00096 P2 · PRD §3.7 · BRD FR-016/017)
 *
 * เก็บที่ `Shop.variableCosts` (JSON · null = ยังไม่เคยตั้ง = 0 ทุกช่อง ตัวเลขทุกหน้าเท่าเดิม)
 * 🛑 สูตรเดียวทั้งระบบ (HR16) — หน้ากำไร · ชีตยอดขาย · กราฟการเงิน · รายงานโฆษณา เรียก `orderVariableCost` ตัวนี้
 * 🛑 ใบ iShip ที่มี `codFee` จริง: ใช้ตัวเลขจริงแทน % เสมอ · ถ้าค่าส่งขาไปถูกหักเป็นค่าใช้จ่ายอยู่แล้ว (ร้านบริการ — codFee รวมอยู่ในนั้น)
 *    ไม่คิดซ้ำ (= 0) · ร้านอื่นไม่หักค่าส่งขาไป (มติ 2026-10-02) ⇒ codFee จริงต้องเข้ามาทางนี้ ไม่งั้นหายเงียบ (review 2026-11-16)
 *
 * ไฟล์บริสุทธิ์ (ไม่แตะ prisma) — RSC · client · service ใช้ตัวเดียวกัน
 */
import * as v from 'valibot'

import { isCODPayment } from './order-display'

export type VariableCostSettings = {
  /** ค่าแพ็ก/กล่อง บาทต่อใบ */
  packagingPerOrder: number
  /** ค่าธรรมเนียมเก็บเงินปลายทาง % ของยอด — ใช้เฉพาะใบ COD ที่ไม่มี codFee จาก iShip */
  codFeePct: number
  /** ค่าธรรมเนียมรับชำระ (โอน/บัตร/ช่องทางอื่น) % ของยอด — ใบที่ไม่ใช่ COD และไม่ใช่เงินสด */
  paymentFeePct: number
  /** ค่าคอมมิชชัน % ของยอด — ทุกใบ */
  commissionPct: number
}

export const DEFAULT_VARIABLE_COSTS: Readonly<VariableCostSettings> = Object.freeze({
  packagingPerOrder: 0,
  codFeePct: 0,
  paymentFeePct: 0,
  commissionPct: 0,
})

const money = v.pipe(v.number(), v.finite(), v.minValue(0), v.maxValue(100000))
const pct = v.pipe(v.number(), v.finite(), v.minValue(0), v.maxValue(100))

export const VariableCostSchema = v.pipe(
  v.object({
    packagingPerOrder: money,
    codFeePct: pct,
    paymentFeePct: pct,
    commissionPct: pct,
  }),
  // % ที่หักจากใบเดียวรวมกันเกิน 100 = ต้นทุนเกินยอดขาย — พิมพ์ผิดแน่นอน
  v.check((s) => s.codFeePct + s.commissionPct <= 100 && s.paymentFeePct + s.commissionPct <= 100),
)

/** อ่านค่าจากแถว Shop — ค่าเสีย/ไม่ครบ = ค่าตั้งต้นของช่องนั้น (ไม่ทำให้หน้ารายงานพัง) */
export function resolveVariableCosts(raw: unknown): VariableCostSettings {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const pick = (k: keyof VariableCostSettings, s: typeof money | typeof pct) => {
    const r = v.safeParse(s, o[k])
    return r.success ? r.output : DEFAULT_VARIABLE_COSTS[k]
  }
  return {
    packagingPerOrder: pick('packagingPerOrder', money),
    codFeePct: pick('codFeePct', pct),
    paymentFeePct: pick('paymentFeePct', pct),
    commissionPct: pick('commissionPct', pct),
  }
}

/** ร้านตั้งอะไรไว้บ้างไหม — false = หน้ารายงานติดป้าย "ยังไม่ได้ตั้งค่าต้นทุนต่อออเดอร์" */
export const hasVariableCosts = (s: VariableCostSettings) =>
  s.packagingPerOrder > 0 || s.codFeePct > 0 || s.paymentFeePct > 0 || s.commissionPct > 0

const isCash = (m: string | null | undefined) => (m ?? '').toUpperCase() === 'CASH'

/**
 * ต้นทุนผันแปรของออเดอร์ **ใบเดียว**
 * `revenue` = ยอดที่นับเป็นยอดขายของใบนั้น (หลังหักคืนแล้ว) · `ishipCodFee` = codFee ของพัสดุขาไปที่ active (null = ไม่มี)
 */
export function orderVariableCost(
  s: VariableCostSettings,
  o: {
    revenue: number
    paymentMethod: string | null | undefined
    ishipCodFee: number | null
    /** true = ค่าส่งขาไป (ซึ่งรวม codFee ของ iShip) ถูกหักเป็นค่าใช้จ่ายที่อื่นแล้ว — ร้านบริการ */
    codFeeInShipping: boolean
  },
): number {
  if (!hasVariableCosts(s)) return 0
  const cod = isCODPayment(o.paymentMethod)
  const real = o.ishipCodFee ?? 0
  // COD: มีค่าจริงจาก iShip ใช้ค่าจริง (หรือ 0 ถ้าหักในค่าส่งแล้ว) · ไม่มีใช้ %
  const feeAmt = cod && real > 0 ? (o.codFeeInShipping ? 0 : real) : 0
  const feePct = cod ? (real > 0 ? 0 : s.codFeePct) : isCash(o.paymentMethod) ? 0 : s.paymentFeePct
  const amt = s.packagingPerOrder + feeAmt + (o.revenue * (feePct + s.commissionPct)) / 100
  return Math.round(amt * 100) / 100
}
