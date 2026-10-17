/**
 * customer-signal — สัญญาณ "เป็นลูกค้าของร้าน" บนรูปโปรไฟล์ในรายการแชท (00078 S-6)
 * pure: รับ `counted` จาก `summarizeCustomerBehavior` (ห้ามนับเอง) · UI ขอบรูปอยู่ที่ T23
 */
export type CustomerSignalKind = 'NONE' | 'NEW' | 'REGULAR'

export type CustomerAvatarSignal = {
  ring: boolean
  /** NEW = ตะกร้า · ซื้อซ้ำ = จำนวน (≥10 ย่อเป็น '9+') · null = ไม่มีแผ่น */
  plate: null | 'cart' | number | '9+'
  kind: CustomerSignalKind
}

const NONE: CustomerAvatarSignal = { ring: false, plate: null, kind: 'NONE' }

export function customerAvatarSignal(counted: number | null | undefined): CustomerAvatarSignal {
  if (counted == null || !(counted >= 1)) return NONE
  if (counted === 1) return { ring: true, plate: 'cart', kind: 'NEW' }
  return { ring: true, plate: counted >= 10 ? '9+' : counted, kind: 'REGULAR' }
}
