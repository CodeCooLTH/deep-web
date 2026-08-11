/**
 * pickApiErrorMessage — เลือก "ข้อความที่ผู้ใช้จะได้อ่าน" จาก error response ของ API ฝั่งเรา
 *
 * 🛑 ทำไมต้องเป็นฟังก์ชันบริสุทธิ์ที่มีเทส ไม่ใช่เทอร์นารีกลาง JSX: ตรรกะนี้ตัดสินว่าผู้ใช้จะเห็น
 * ประโยคภาษาไทยหรือเห็น `RESOURCE_NOT_FOUND` — เขียนสลับลำดับแล้ว **ทุกอย่างยังคอมไพล์ผ่านและ
 * หน้าจอยังทำงาน** ไม่มี gate ไหนของโปรเจกต์จับได้ (บทเรียน ui-boolean-needs-a-testable-home;
 * ของจริงคือจอสร้างออเดอร์เขียน `data?.error ?? fallback` มาตลอดจน user เจอรหัสดิบบน prod 2026-08-11)
 *
 * 🛑 ทำไมไม่ใช่ `data.message ?? fallback` ง่าย ๆ: route ฝั่งเรามี **2 คอนเวนชันปนกันจริง**
 *   (ก) `{ error: "CODE", message: "ข้อความไทย" }`  — เช่น appointment-api.ts ส่วนใหญ่
 *   (ข) `{ error: "ข้อความไทยตรง ๆ" }` ไม่มี message เลย — เช่น ShippingAddressRequiredError,
 *       OutOfStockError, ORDER_DATE_OUT_OF_WINDOW_MESSAGE
 * เลือกแค่ `message` = กลุ่ม (ข) ร่วงไป fallback ทั้งกลุ่ม (regression ที่เงียบพอ ๆ กับบั๊กเดิม)
 * เกณฑ์จึงเป็น "สตริงนี้เป็นภาษาที่คนอ่านรู้เรื่องไหม" ไม่ใช่ "อยู่ในคีย์ไหน"
 *
 * `code` ที่คืนมาเป็นรหัสสำหรับ "บรรทัดอ้างอิง" บนจอ — คืน null เมื่อรหัสนั้นถูกใช้เป็นข้อความหลัก
 * ไปแล้ว (กลุ่ม ข) เพราะโชว์ซ้ำสองบรรทัดคือ noise ไม่ใช่ข้อมูล
 */

/** ช่วงอักขระไทย — ตัวตัดสินว่าสตริงนี้เขียนมาให้คนอ่าน ไม่ใช่รหัสภายใน */
const THAI = /[฀-๿]/;

const isHumanText = (value: unknown): value is string =>
  typeof value === "string" && THAI.test(value);

export interface ApiErrorDisplay {
  /** ข้อความหลักที่แสดงบนจอ — ไม่มีวันเป็นรหัสภาษาอังกฤษ */
  text: string;
  /** รหัสไว้อ้างอิงตอนแจ้งปัญหา (บรรทัดเล็กจาง) — null = ไม่มีอะไรให้อ้าง หรือแสดงไปแล้ว */
  code: string | null;
}

export function pickApiErrorMessage(data: unknown, fallback: string): ApiErrorDisplay {
  const body = (data ?? {}) as { error?: unknown; message?: unknown };
  const rawCode = typeof body.error === "string" ? body.error : null;

  if (isHumanText(body.message)) return { text: body.message, code: rawCode };
  // คอนเวนชัน (ข) — `error` คือข้อความไทยเอง จึงไม่ต้องมีบรรทัดรหัสซ้ำอีก
  if (isHumanText(body.error)) return { text: body.error, code: null };
  return { text: fallback, code: rawCode };
}
