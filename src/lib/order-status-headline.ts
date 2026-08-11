import { resolveOrderStatusBadge, type ShippingStageKey } from '@/lib/order-stage'

/**
 * order-status-headline — "หัวเรื่องสถานะ" ของหน้าลิงก์คำสั่งซื้อ `/o/[token]`
 *
 * หน้านั้นมีสองแกนที่ผู้ซื้อถามคนละคำถาม และโปรเจกต์นี้ถือว่าเป็นคนละแกนอยู่แล้ว
 * (`/orders` ของผู้ขายคง `?status=` กับ `?stage=` ไว้ด้วยกันด้วยเหตุผลเดียวกัน):
 *   - **สถานะออเดอร์** — รอดำเนินการ / ยืนยันแล้ว / ยกเลิก (เรื่องของดีล)
 *   - **สถานะพัสดุ**   — รอเลขพัสดุ / กำลังจัดส่ง / พัสดุมีปัญหา (เรื่องของกล่อง)
 *
 * 🛑 ทั้งสองค่าอ่านจาก `resolveOrderStatusBadge` ตัวเดียวกัน ต่างกันแค่ส่งหรือไม่ส่ง `stage`
 *    ห้ามตั้งคำเองที่หน้าจอ (HR16) — และห้ามใช้ `SHIPPING_STAGE_LABEL` ตรง ๆ เพราะ map ตัวนั้น
 *    **ไม่มีคีย์ `DONE`** จะได้ `undefined` เงียบ ๆ ตอนพัสดุส่งถึงแล้ว ซึ่งเป็นสถานะที่ผู้ซื้อ
 *    เปิดหน้านี้บ่อยที่สุดพอดี
 *
 * 🛑 ทำไมเป็นฟังก์ชันแยกไฟล์แทนเทอร์นารีใน JSX: เกณฑ์ของ
 *    `docs/conventions/ui-boolean-needs-a-testable-home.md` ไม่ใช่ "ซับซ้อนพอไหม" แต่คือ
 *    "ถ้าเขียนกลับด้านแล้วจะมีอะไรจับได้ไหม" — เขียน `showStatusPill` กลับด้านจะได้ป้ายซ้ำ
 *    สองอันที่พูดคำเดียวกัน หรือหายไปทั้งคู่ ซึ่งผ่าน tsc/build/detector ครบทุกด่าน
 */
export type OrderStatusHeadline = {
  /** บรรทัดใหญ่ — สิ่งที่ผู้ซื้อต้องอ่านได้จากระยะแขน */
  headline: string
  /** ป้ายเล็กของแกนสถานะออเดอร์ — `null` = ซ้ำกับ headline แล้ว ไม่ต้องแสดง */
  statusPill: string | null
}

export function resolveOrderStatusHeadline(args: {
  status: string
  stage: ShippingStageKey
  hasShipment: boolean
}): OrderStatusHeadline {
  const statusLabel = resolveOrderStatusBadge(args.status).label

  // ไม่มีพัสดุ → ยังไม่มีเรื่องของกล่องให้เล่า หัวเรื่องคือสถานะออเดอร์ล้วน
  if (!args.hasShipment) return { headline: statusLabel, statusPill: null }

  const stageLabel = resolveOrderStatusBadge(args.status, args.stage).label

  // ออเดอร์ที่ปิดจบแล้ว (ยืนยัน/ยกเลิก) `resolveOrderStatusBadge` คืนค่าเดิมทั้งสองครั้งโดยตั้งใจ
  // → เข้าเงื่อนไขนี้ แล้วเราซ่อนป้ายที่ซ้ำแทนที่จะโชว์คำเดียวกันสองที่
  if (stageLabel === statusLabel) return { headline: statusLabel, statusPill: null }

  return { headline: stageLabel, statusPill: statusLabel }
}
