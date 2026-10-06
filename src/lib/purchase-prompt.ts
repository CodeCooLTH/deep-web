/**
 * ข้อความ "ชวนสมัคร / อัปเกรด / ต่ออายุแพ็กเกจ" แสดงได้ไหม — กฎเดียวของทั้งโซนผู้ขาย
 *
 * | เปลือก | hidePayments | offerIap | ชวนซื้อได้ไหม | เพราะ |
 * |---|---|---|---|---|
 * | เว็บ | false | – | ได้ | ซื้อที่เว็บได้ตามปกติ |
 * | iOS | true | true | ได้ | ซื้อ Business Package ผ่าน Apple (IAP) ในแอปได้ |
 * | Android | true | false | **ไม่ได้** | ไม่มี Play Billing — คำว่า "ให้ไปสมัคร/อัปเกรด" = พาไปจ่ายนอก Play
 *
 * Google Payments policy ห้าม *"lead users to a payment method other than Google Play's billing
 * system … via in-app webviews, buttons, links, messaging"* — **ข้อความล้วนไม่มีลิงก์ก็นับ**
 * (เคสจริง 2026-10-05: ข้อความ error จัดการทีมบอก "ให้ X อัปเกรดแพ็กเกจก่อน" ขึ้นบน Android)
 *
 * 🛑 ใช้กับของที่ **ขายเป็น IAP บน iOS** เท่านั้น (Business Package) — Deep Stock ไม่มี IAP และถูก
 * ซ่อนทั้งฟีเจอร์บน iOS อยู่แล้ว ข้อความชวนซื้อ Deep Stock ให้ใช้ `hidePayments` ตรง ๆ (เข้มกว่า)
 */
export function canAskToBuy(hidePayments: boolean, offerIap: boolean): boolean {
  return !hidePayments || offerIap
}
