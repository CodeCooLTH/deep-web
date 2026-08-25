/**
 * order-stage-sql — สูตร "กองงานตามสถานะพัสดุ" ฉบับ SQL (CR 2026-08-25 · D-1 ตัวเลือก ก)
 *
 * pure module — สร้างแค่ *ข้อความ SQL* ไม่ได้ยิงอะไรเอง (ห้าม import prisma ที่นี่)
 *
 * ── ทำไมต้องมีสูตรฉบับที่สอง ──────────────────────────────────────────────────
 * ตัวจริงคือ `deriveShippingStage()` ใน `order-stage.ts` ซึ่งเป็น TypeScript
 * แต่หน้า `/seller/orders` ต้อง **กรองด้วยกองนี้ที่ฐานข้อมูล** ไม่งั้นต้องดึงออเดอร์ทั้งร้าน
 * ลงมากรองที่เครื่องผู้ใช้ (ข้อมูล prod 2026-08-25: **77% ของแถวตกกอง `DONE` ซึ่งไม่มีชิป
 * หรือไทล์ไหนพาไปดูเลย** — คือแถวที่ขนมาเปล่า ๆ ล้วน ๆ)
 *
 * ── 🛑 กติกาที่ห้ามละเมิด ────────────────────────────────────────────────────
 * 1. **รายชื่อสถานะทั้งหมดต้องมาจาก `iship/status.ts` เท่านั้น** — ไฟล์นี้ห้ามพิมพ์รหัสสถานะ
 *    ลงไปเองแม้แต่ตัวเดียว (คอมเมนต์ที่ `FINAL_CARRIER_STATUSES` บันทึกไว้แล้วว่าการเขียน
 *    รายชื่อซ้ำสองที่ "แก้ไม่ครบทั้งคู่มาแล้ว")
 * 2. **ลำดับของ branch ต้องตรงกับ `deriveShippingStage()` บรรทัดต่อบรรทัด** — ลำดับมีผลต่อ
 *    ผลลัพธ์จริง (เช่น `return_success` เป็น terminal ด้วย ถ้าเช็ค terminal ก่อนตีกลับ
 *    ของที่กลับมาถึงร้านจะกลายเป็น `DONE` แล้วหายจากทุกไทล์ — บั๊กที่เคยเกิดจริง)
 * 3. **มีเทสเทียบผลสองฝั่งเป็นด่าน** (`__tests__/order-stage-sql.test.ts`) — รัน SQL นี้กับ
 *    ชุดค่าสังเคราะห์ทุกคอมบิเนชันผ่าน `VALUES` แล้วเทียบกับผลของฟังก์ชัน TS ต้องตรงทุกแถว
 *    เทสนั้น **ไม่แตะตารางไหนเลย ไม่เขียนอะไรทั้งสิ้น** (SELECT บนค่าคงที่ล้วน)
 *
 * ถ้าจะแก้ตรรกะกอง ให้แก้ `deriveShippingStage()` ก่อนเสมอ แล้วรันเทสเทียบ — มันจะบอกเองว่า
 * ต้องตามมาแก้อะไรตรงนี้
 */

import { COD_PAYMENT_PATTERN } from './order-display'
import { APPOINTMENT_STAGE_KEYS } from './appointment-stage'
import {
  IN_TRANSIT_CARRIER_STATUSES,
  PROBLEM_CARRIER_STATUSES,
  RETURNED_CARRIER_STATUSES,
  TERMINAL_CARRIER_STATUSES,
} from './iship/status'

/** ชื่อคอลัมน์ที่สูตรต้องอ่าน — ผู้เรียกส่ง alias ของตัวเองเข้ามา */
export type StageSqlColumns = {
  /** `Order.status` */
  orderStatus: string
  /** boolean — มีพัสดุ active (CREATED + ไม่ dry-run) ไหม */
  hasShipment: string
  /** `OrderShipment.carrierStatus` ของใบล่าสุด (null ได้) */
  carrierStatus: string
  /** `Order.paymentMethod` */
  paymentMethod: string
  /** `Order.codReceivedAt` */
  codReceivedAt: string
}

/** ใส่ quote ให้ literal สตริงแบบปลอดภัย — ใช้กับค่าคงที่ในโค้ดเท่านั้น ไม่ใช่ input ผู้ใช้ */
function lit(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function inList(column: string, values: readonly string[]): string {
  if (values.length === 0) return 'false'
  return `${column} IN (${values.map(lit).join(', ')})`
}

/**
 * คืน SQL expression ที่ให้ค่าเดียวกับ `deriveShippingStage()`
 *
 * ผลลัพธ์เป็นสตริงของ `CASE … END` ที่เอาไปวางใน `SELECT`, `WHERE` หรือ `GROUP BY` ได้
 * ค่าที่คืน: `AWAITING_PARCEL` | `AWAITING_PICKUP` | `SHIPPING` | `AWAITING_COD`
 *          | `PROBLEM` | `RETURNED` | `DONE`
 */
export function buildShippingStageSql(c: StageSqlColumns): string {
  const isCod = `${c.paymentMethod} ~* ${lit(COD_PAYMENT_PATTERN)}`
  return `CASE
    -- 1) ยกเลิก/คืนของ = ไม่ใช่งานค้าง ไม่ว่าพัสดุจะอยู่สถานะไหน
    WHEN ${c.orderStatus} IN ('CANCELLED', 'RETURNED') THEN 'DONE'
    -- 2) มีพัสดุ — เรียงตาม deriveShippingStage เป๊ะ: ตีกลับ → มีปัญหา → ปลายทาง → ระหว่างทาง
    WHEN ${c.hasShipment} THEN (
      CASE
        WHEN ${inList(c.carrierStatus, RETURNED_CARRIER_STATUSES)} THEN 'RETURNED'
        WHEN ${inList(c.carrierStatus, PROBLEM_CARRIER_STATUSES)} THEN 'PROBLEM'
        WHEN ${inList(c.carrierStatus, TERMINAL_CARRIER_STATUSES)} THEN (
          -- ของถึงแล้วแต่ยังไม่ได้เงินปลายทาง = ยังมีงานค้างจริง (ตามเงิน)
          CASE WHEN ${isCod} AND ${c.codReceivedAt} IS NULL THEN 'AWAITING_COD' ELSE 'DONE' END
        )
        -- SHIPPED = ร้านยืนยันเองว่าของออกไปแล้ว ชนะการที่ขนส่งยังไม่อัปเดต
        WHEN ${inList(c.carrierStatus, IN_TRANSIT_CARRIER_STATUSES)}
          OR ${c.orderStatus} = 'SHIPPED' THEN 'SHIPPING'
        ELSE 'AWAITING_PICKUP'
      END
    )
    -- 3) ไม่มีพัสดุ
    WHEN ${c.orderStatus} = 'SHIPPED' THEN 'SHIPPING'
    WHEN ${c.orderStatus} = 'CONFIRMED' THEN 'DONE'
    ELSE 'AWAITING_PARCEL'
  END`
}

/**
 * สูตร "สถานะนัดหมาย" ฉบับ SQL — คู่ขนานกับ `deriveAppointmentStage()`
 *
 * ตัวนี้ง่ายกว่ามากเพราะอ่านคอลัมน์บน `Order` ตรง ๆ ไม่ต้อง join อะไรเลย
 * `NULL` = ใบที่ไม่มีนัด (walk-in) ซึ่ง **ไม่เหมือน "อยู่ในกองที่ว่าง"** — ผู้เรียกต้องแยกเอง
 */
export function buildAppointmentStageSql(c: {
  serviceStart: string
  appointmentStatus: string
}): string {
  return `CASE
    WHEN ${c.serviceStart} IS NULL THEN NULL
    WHEN ${inList(c.appointmentStatus, APPOINTMENT_STAGE_KEYS)} THEN ${c.appointmentStatus}
    ELSE 'SCHEDULED'
  END`
}

