// feature 00022 ส่วนขยาย 2026-08-06 — ให้ "วิธีชำระเงินของคำสั่งซื้อ" ตรงกับ "พัสดุที่เปิดจริง"
//
// ที่มา (user 2026-08-06): "ถ้า user เลือกขอ track iShip เป็น COD แต่พบว่าตอนสร้างไม่ใช่ COD
// ก็แจ้งเตือนเปลี่ยนให้ user เลย สะดวก"
//
// เคสจริงที่เจอบน prod: พัสดุ TH140290UGSM3H เปิดแบบเก็บเงินปลายทาง ฿360 จริง แต่คำสั่งซื้อ
// บันทึก paymentMethod = "CASH" — ใบนี้จึงหลุดจากกอง "รอเงิน COD" และหลุดจากการปิดงาน
// อัตโนมัติทั้งที่ขนส่งกำลังจะเก็บเงินให้จริง ๆ
//
// หลักคิด: **พัสดุคือหลักฐานที่แข็งแรงกว่า** — ยอด COD บนพัสดุคือสิ่งที่ขนส่งจะไปเก็บเงินจริง
// ส่วน paymentMethod เป็นข้อความที่ร้านพิมพ์เอง (ค่าที่พบจริงมีทั้ง COD/CASH/TRANSFER/
// "พร้อมเพย์ 081-xxx" ที่ร้านกรอกอิสระ) เมื่อสองอย่างขัดกัน ให้พัสดุชนะ
//
// pure module — ไม่ import prisma เพื่อให้เทสเงื่อนไขได้โดยไม่ต้องมีฐานข้อมูล

import { isCODPayment } from "@/lib/order-display";

export type PaymentSyncAction =
  /** ไม่ต้องทำอะไร — ตรงกันอยู่แล้ว */
  | { action: "NONE" }
  /**
   * พัสดุเก็บเงินปลายทาง แต่คำสั่งซื้อไม่ได้บอกอย่างนั้น → แก้คำสั่งซื้อให้ตรงความจริง
   * แล้วบอกร้านว่าแก้ให้แล้ว (ไม่ใช่แก้เงียบ ๆ — เป็นข้อมูลเรื่องเงิน)
   */
  | { action: "SET_COD"; from: string | null; codAmount: number; message: string }
  /**
   * คำสั่งซื้อบอกว่าเก็บเงินปลายทาง แต่พัสดุเปิดแบบไม่เก็บเงิน → **เตือนอย่างเดียว ห้ามแก้**
   *
   * ทิศนี้ไม่สมมาตรกับข้างบนโดยเจตนา: การแก้คำสั่งซื้อให้เป็น "ไม่เก็บปลายทาง" คือการกลบ
   * ความผิดพลาดที่ร้านต้องไปแก้ที่พัสดุ ผลคือของออกไปโดยไม่มีใครเก็บเงินแล้วไม่มีใครรู้ตัว
   */
  | { action: "WARN_NO_COD"; message: string };

/**
 * resolvePaymentSync — ตัดสินว่าต้องทำอะไรเมื่อพัสดุกับคำสั่งซื้อพูดไม่ตรงกันเรื่องการเก็บเงิน
 *
 * ตั้งใจรับ `codAmount` เป็นตัวเลขของ *พัสดุ* ไม่ใช่ของคำสั่งซื้อ — ผู้เรียกต้องส่งยอดที่
 * จะยิงไป iShip จริง (หรือที่อ่านกลับมาจากพัสดุที่ผูก) ไม่ใช่ยอดรวมของบิล
 */
export function resolvePaymentSync(input: {
  orderPaymentMethod: string | null | undefined;
  parcelCodAmount: number;
}): PaymentSyncAction {
  const parcelIsCod = Number.isFinite(input.parcelCodAmount) && input.parcelCodAmount > 0;
  const orderIsCod = isCODPayment(input.orderPaymentMethod);

  if (parcelIsCod && !orderIsCod) {
    return {
      action: "SET_COD",
      from: input.orderPaymentMethod ?? null,
      codAmount: input.parcelCodAmount,
      // "เก็บเงินปลายทาง" ต้องไม่โผล่ 2 ครั้งในประโยคเดียว (ux clarify gate 2026-08-06)
      message: `พัสดุใบนี้เก็บเงินปลายทาง ฿${input.parcelCodAmount.toLocaleString("th-TH")} — ปรับคำสั่งซื้อให้ตรงกันแล้ว`,
    };
  }
  if (!parcelIsCod && orderIsCod) {
    return {
      action: "WARN_NO_COD",
      message:
        "คำสั่งซื้อนี้ระบุเก็บเงินปลายทาง แต่พัสดุใบนี้เปิดแบบไม่เก็บเงิน — ขนส่งจะไม่เก็บเงินให้ ตรวจสอบก่อนส่งของ",
    };
  }
  return { action: "NONE" };
}

/**
 * resolveDefaultCodAmount — ยอดเก็บปลายทางของพัสดุ **เมื่อผู้ขายไม่ได้ระบุยอดมาเอง**
 *
 * 🛑 บั๊กเงินบน prod 2026-09-04 (ออเดอร์ DP2569091C7BA99F ฿590): ก่อนหน้านี้ผู้เรียกตกไปใช้
 * `ShopShippingAccount.defaultCodEnabled ? ยอดบิล : 0` — ค่าตั้งต้น "ระดับร้าน" จึงชนะข้อมูล
 * "ระดับใบ" ที่เจาะจงกว่า ผลคือออเดอร์ที่ลูกค้าโอนมาแล้วถูกเปิดพัสดุเป็นเก็บเงินปลายทางเท่า
 * ยอดบิล แล้ว `resolvePaymentSync` ก็เขียน `paymentMethod = "COD"` ทับตามกติกา "พัสดุชนะ"
 * (ถูกต้องตามกติกา — ของที่ผิดคือยอดบนพัสดุที่ไม่มีใครสั่งให้เกิด)
 *
 * กติกาเดียวทั้งระบบ: **วิธีชำระเงินของคำสั่งซื้อเป็นตัวตัดสิน ไม่ใช่ค่าตั้งต้นของร้าน**
 * — ผู้ขายที่อยากเก็บปลายทางสวนกับที่บันทึกไว้ ยังพิมพ์ยอดเองได้ (นั่นคือ `override.codAmount`)
 *
 * ตัวนี้คือ SSOT ตัวเดียวกับที่ฟอร์มใช้ prefill (`ShipmentContext.codSuggested`) — สองค่านั้น
 * ต้องมาจากฟังก์ชันนี้ทั้งคู่ ไม่งั้นเลขที่ร้านเห็นบนจอกับเลขที่ยิงออกไปจะไม่ใช่ตัวเดียวกัน
 */
export function resolveDefaultCodAmount(input: {
  orderPaymentMethod: string | null | undefined;
  orderTotal: number;
}): number {
  if (!isCODPayment(input.orderPaymentMethod)) return 0;
  return Number.isFinite(input.orderTotal) && input.orderTotal > 0 ? input.orderTotal : 0;
}
