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

/**
 * แสดง **สถานะเงิน** (ยอดเครดิต · ประวัติเติมเงิน · ป้ายแพ็กเกจ/ต่ออายุไม่สำเร็จ) ได้ไหม
 *
 * ตอบเท่ากับ `canAskToBuy` ทุกกรณีวันนี้ แต่เป็น **คนละคำถาม** — แยกไว้ตามหลักห้ามยุบของสองอย่าง
 * ที่บังเอิญค่าเท่ากัน (`docs/conventions/domain-term-single-definition.md`):
 *   - iOS แสดงได้ตามมติ 2026-08-10 (สถานะบัญชีไม่ใช่ช่องทางจ่าย · ต่ออายุผ่าน Apple ได้)
 *   - **Android ซ่อน** (user สั่ง 2026-10-06: "ป้ายต่ออายุกับยอดเครดิตไม่ควรแสดง ซ่อนดีกว่า")
 *     ไม่มีทางเติม/ต่ออายุในแอป ⇒ ยอดเงินกับป้าย "ต่ออายุไม่สำเร็จ" มีแต่ชวนให้ไปจ่ายข้างนอก
 */
export function canShowMoneyStatus(hidePayments: boolean, offerIap: boolean): boolean {
  return !hidePayments || offerIap
}
