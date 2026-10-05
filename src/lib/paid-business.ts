/**
 * ร้านนี้นับเป็น "ธุรกิจที่จ่ายแล้ว" ไหม (00069 TFR-002)
 * 🛑 ตัวตัดสินสุดท้าย — WHERE ใน service เป็นแค่การตัดแถวล่วงหน้า · ไม่มีแถว subscription = FREE = ไม่นับ
 * ต้องครบทั้ง 3 เงื่อนไข: ลบข้อใดข้อหนึ่งแล้วเทสต้องแดง (paid-business.test.ts)
 */
export function isPaidBusinessShop(input: {
  kind: string
  packageLockedAt: Date | null | undefined
  ownerSubscriptionStatus: string | null | undefined
}): boolean {
  return (
    input.kind === 'BUSINESS' &&
    input.packageLockedAt == null &&
    input.ownerSubscriptionStatus === 'ACTIVE'
  )
}
