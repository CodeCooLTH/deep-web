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
  PROBLEM_HOLD_RELEASE_STATUSES,
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
  /**
   * `Order.fulfillmentMode` (feature 00062, TD-007) — ต้องเช็คก่อนทุกกิ่ง คู่ขนานกับ
   * `deriveShippingStage()` ฝั่ง TS เป๊ะ ห้ามลืมแก้ฝั่งใดฝั่งหนึ่ง (เทส parity จะจับ)
   */
  fulfillmentMode: string
  /**
   * `OrderShipment.problemAt` ของใบล่าสุด — "เคยมีปัญหาครั้งแรกเมื่อไร" (null ได้)
   *
   * 🛑 ผู้เรียกต้อง join คอลัมน์นี้เข้ามาให้ด้วย ไม่ใช่ส่ง `'NULL'` เพื่อให้คอมไพล์ผ่าน —
   * ส่ง NULL = กองบนหน้ารายการจะกลับไปเป็นพฤติกรรมก่อนแก้ ขณะที่การ์ดในแชท (ฝั่ง TS)
   * ค้างมีปัญหาอยู่ ⇒ จอสองจอบอกคนละกองสำหรับใบเดียวกัน
   */
  problemAt: string
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
 * ตรงข้ามกับ `inList` — 🛑 **ต้องกัน NULL เอง ห้ามเขียน `NOT (x IN (...))`**
 *
 * ใน SQL `NULL IN (...)` ให้ `NULL` แล้ว `NOT NULL` ก็ยัง `NULL` ⇒ `WHEN` ไม่ match
 * และตกไปสาขาถัดไปเงียบ ๆ ขณะที่ฝั่ง TypeScript (`!releasesProblemHold(null)`) ได้ `true`
 * = สองสูตรตอบคนละกองสำหรับแถวที่ `carrierStatus` ยังว่าง (เทส parity จับได้ แต่ต้องเขียน
 * ให้ถูกตั้งแต่แรก ไม่ใช่รอให้เทสสอน)
 */
function notInList(column: string, values: readonly string[]): string {
  if (values.length === 0) return 'true'
  return `(${column} IS NULL OR NOT (${column} IN (${values.map(lit).join(', ')})))`
}

/**
 * buildProblemHoldSql — ฉบับ SQL ของ `holdsParcelProblem()` (`lib/iship/status.ts`)
 *
 * 🛑 export ออกไปให้ใช้นอกไฟล์นี้ด้วยโดยตั้งใจ — คำถาม "ใบนี้อยู่กองพัสดุมีปัญหาไหม" ถูกถาม
 * จาก **3 ที่ที่ไม่เคยเรียกหากัน**: สูตรกองข้างล่างนี้ · ตัวนับป้ายในแถวรายการแชท
 * (`order-stage.service.ts`) · ตัวกรอง `state=problem` ของกล่องแชท (`chat.service.ts`)
 * ทั้งสามเคยเขียนเงื่อนไขเองคนละที่ (`carrierStatus = ANY(PROBLEM…)`) ⇒ พอเติมเรื่อง
 * "ค้างเหนียว" เข้าไป ถ้าไม่รวมเป็นก้อนเดียว จะมีที่ใดที่หนึ่งตกหล่นโดยไม่มีอะไรฟ้อง
 *
 * ต้องให้ผลตรงกับ `holdsParcelProblem()` ทุกอินพุต — มีเทส parity เป็นด่าน
 */
export function buildProblemHoldSql(carrierStatus: string, problemAt: string): string {
  return (
    `(${inList(carrierStatus, PROBLEM_CARRIER_STATUSES)}` +
    ` OR (${problemAt} IS NOT NULL` +
    ` AND ${notInList(carrierStatus, RETURNED_CARRIER_STATUSES)}` +
    ` AND ${notInList(carrierStatus, PROBLEM_HOLD_RELEASE_STATUSES)}))`
  )
}

/**
 * คืน SQL expression ที่ให้ค่าเดียวกับ `deriveShippingStage()`
 *
 * ผลลัพธ์เป็นสตริงของ `CASE … END` ที่เอาไปวางใน `SELECT`, `WHERE` หรือ `GROUP BY` ได้
 * ค่าที่คืน: `DRAFT` | `NOT_SHIPPING` | `AWAITING_PARCEL` | `AWAITING_PICKUP` | `SHIPPING`
 *          | `AWAITING_COD` | `PROBLEM` | `RETURNED` | `DONE`
 */
export function buildShippingStageSql(c: StageSqlColumns): string {
  const isCod = `${c.paymentMethod} ~* ${lit(COD_PAYMENT_PATTERN)}`
  return `CASE
    -- [สำคัญ] -1) ร่างจากแชท (00061) — ต้องอยู่ **เหนือสาขา fulfillmentMode** ไม่ใช่แค่เหนือสาขาพัสดุ
    --       ร่างไม่เคยผ่านการคำนวณ fulfillmentMode เลย (คอลัมน์เป็น default 'SHIPPED' ของสคีมา)
    --       วันที่ตัวเขียนร่างคำนวณค่านั้นจริง ร่างของสินค้าที่ไม่ต้องส่งจะกลายเป็น NOT_SHIPPING
    --       แล้วหายจากชิป "ร่าง" ทั้งกองเงียบ ๆ — ดูคอมเมนต์เต็มที่ deriveShippingStage()
    WHEN ${c.orderStatus} = 'DRAFTED' THEN 'DRAFT'
    -- 0) ไม่มีการจัดส่งเลย (feature 00062) — เช็คก่อนทุกอย่างรวมทั้งยกเลิก/คืนของ ตรงกับ
    -- deriveShippingStage() เป๊ะ (ดูคอมเมนต์ที่นั่นว่าทำไม 'NOT_SHIPPING' ไม่ใช่ 'DONE')
    WHEN ${c.fulfillmentMode} <> 'SHIPPED' THEN 'NOT_SHIPPING'
    -- 1) ยกเลิก/คืนของ = ไม่ใช่งานค้าง ไม่ว่าพัสดุจะอยู่สถานะไหน
    WHEN ${c.orderStatus} IN ('CANCELLED', 'RETURNED') THEN 'DONE'
    -- 2) มีพัสดุ — เรียงตาม deriveShippingStage เป๊ะ:
    --    ตีกลับ → มีปัญหา(รวม "เคยมีปัญหา" ที่ค้างเหนียว) → ปลายทาง → ระหว่างทาง
    WHEN ${c.hasShipment} THEN (
      CASE
        WHEN ${inList(c.carrierStatus, RETURNED_CARRIER_STATUSES)} THEN 'RETURNED'
        -- ค้างเหนียว (2026-09-14): "เคยมีปัญหา" นับเป็นกองนี้ต่อ จนกว่าของจะถึงที่ใดที่หนึ่ง
        -- [สำคัญ] ต้องอยู่ **ใต้** กิ่งตีกลับเหมือนฝั่ง TS เป๊ะ — สองเงื่อนไขนี้เป็นจริงพร้อมกันได้
        WHEN ${buildProblemHoldSql(c.carrierStatus, c.problemAt)} THEN 'PROBLEM'
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

