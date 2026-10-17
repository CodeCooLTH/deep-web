/**
 * shipping-cost — ต้นทุนค่าส่งขาไปของ "ใบเดียว" ตัวเดียวทั้งระบบ (00078 TD-009 · D-11)
 *
 * ผู้เรียก 3 พื้นผิว (pnl · dashboard/ชีต · /sales) เคยเขียนสูตรนี้ซ้ำคนละที่ — ที่นี่คือที่เดียว
 * ฟังก์ชันนี้ **ไม่นิยามว่าอะไรคือใบ iShip active** ผู้เรียกกรองด้วย ACTIVE_FORWARD_SHIPMENT/
 * LATEST_FORWARD_SHIPMENT เดิมแล้วส่งมา (forward = null เมื่อไม่มีใบ) ·
 * เกณฑ์ว่าร้านประเภทไหนนับค่าส่งเป็นของผู้เรียก (pnl เฉพาะร้านบริการ) ไม่ใช่ของที่นี่
 *
 * ลำดับ: ราคา iShip (จริง → ประมาณ) ชนะเสมอ แล้วร้านกรอกเอง ตามด้วย "ยังไม่ระบุ"
 * 🛑 null ≠ 0 — ไม่มีตัวเลขต้องบอกว่า pending ห้ามบวก 0 เงียบ ๆ (0 อ่านว่าส่งฟรี → กำไรสูงเกินจริง)
 * `codFee` เป็นเงินคนละก้อนกับค่าส่ง รู้ตั้งแต่สร้างพัสดุ จึงบวกเสมอเมื่อมีใบ iShip
 */
export type ForwardShippingPrice = {
  carrierPrice: unknown
  estimatedPrice: unknown
  codFee: unknown
}

export type OutboundShippingCost = {
  amount: number
  /** true = ตัวเลขยังไม่ใช่ราคาจริง/ยังไม่มี — ต้องติดป้าย ห้ามแสดงเงียบ ๆ */
  pending: boolean
  /** ESTIMATE = iShip ยังเป็นราคาประมาณ (ขนส่งยังไม่ชั่ง) · MISSING = ยังไม่มีตัวเลขเลย (ส่งเองที่ร้านยังไม่กรอก) — ป้ายต้องแยกกัน */
  pendingReason: 'ESTIMATE' | 'MISSING' | null
  source: 'ISHIP' | 'MANUAL' | 'NONE'
}

const num = (v: unknown): number | null => (v == null ? null : Number(v))

export function resolveOutboundShippingCost(input: {
  forward: ForwardShippingPrice | null
  manual: unknown
}): OutboundShippingCost {
  const manual = num(input.manual)
  const f = input.forward
  const codFee = num(f?.codFee) ?? 0
  const real = num(f?.carrierPrice)
  const price = real ?? num(f?.estimatedPrice)

  if (price != null) return { amount: price + codFee, pending: real == null, pendingReason: real == null ? 'ESTIMATE' : null, source: 'ISHIP' }
  // มีใบ iShip แต่ยังไม่มีราคาเลย = รอราคาจากขนส่ง (ESTIMATE) · ไม่มีใบ iShip เลย = ส่งเองที่ร้านยังไม่กรอก (MISSING)
  // D-11: ร้านรู้ตัวเลขจริงเอง ⇒ ไม่ pending
  if (manual != null) return { amount: manual + codFee, pending: false, pendingReason: null, source: 'MANUAL' }
  return { amount: codFee, pending: true, pendingReason: f ? 'ESTIMATE' : 'MISSING', source: 'NONE' }
}
