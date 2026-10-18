/**
 * manual-shipping-note — ตัดสินว่าการ์ดการจัดส่งของ "ส่งเอง" ควรพูดอะไร (00080 Design-Spec §1)
 * pure เพื่อให้เทสจับได้ (ui-boolean-needs-a-testable-home)
 *
 * 'AWAITING'      PENDING — ยังไม่ได้ส่งออก
 * 'DISPATCHED'    SHIPPED/CONFIRMED — มีเวลา "แจ้งจัดส่ง" จริง
 * 'RECORDED_ONLY' อย่างอื่น (CANCELLED ฯลฯ) — ห้ามอ้างว่าจัดส่งแล้ว พูดแค่ว่าบันทึกเลขเมื่อไร
 */
export type ManualShippingNote = 'AWAITING' | 'DISPATCHED' | 'RECORDED_ONLY'

export function manualShippingNote(status: string | undefined): ManualShippingNote {
  if (status === 'PENDING') return 'AWAITING'
  if (status === 'SHIPPED' || status === 'CONFIRMED') return 'DISPATCHED'
  return 'RECORDED_ONLY'
}
