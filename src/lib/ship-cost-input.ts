/**
 * parse ช่อง "ค่าส่งที่ร้านจ่ายขนส่ง" ใน ShipForm (00078) — กฎตรงกับ OutboundShippingCostValue ใน validations.ts
 * ว่าง = null (ยังไม่ระบุ) ซึ่ง ≠ 0 · ผิดรูป = ok:false · ไม่ใช้ Number() ตรง ๆ เพราะ "1e3"/"0x10" จะผ่าน
 */
export type ShipCostParse = { ok: true; value: number | null } | { ok: false }

export function parseShipCostInput(raw: string | null | undefined): ShipCostParse {
  const s = (raw ?? '').trim().replace(/,/g, '')
  if (s === '') return { ok: true, value: null }
  // จำนวนเต็ม ≤5 หลัก + ทศนิยม ≤2 ตำแหน่ง ⇒ 0–99999.99 พอดี
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(s)) return { ok: false }
  return { ok: true, value: Number(s) }
}
