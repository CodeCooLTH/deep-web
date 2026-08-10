/**
 * shipping-speed.ts — SSOT ของ "ร้านนี้ใช้เวลาเท่าไหร่กว่าของจะออกจากร้าน"
 *
 * ใช้โดยเหรียญ FAST_SHIPPING (Speed Demon 24 ชม. / Same-Day Hero 12 ชม.)
 *
 * 🛑 ทำไมต้องแยกไฟล์เป็นฟังก์ชันบริสุทธิ์ (ไม่ฝังใน badge.service.ts เหมือนเดิม):
 * ตรรกะเดิมอยู่กลาง service ที่ต้องมี prisma ถึงจะรันได้ จึงไม่เคยมีเทสตัวไหนแตะ —
 * และมันคำนวณผิดมาตั้งแต่วันแรกโดยไม่มีอะไรฟ้อง (ดู 2 บั๊กด้านล่าง) `tsc`/build/detector
 * ผ่านหมดเพราะโค้ดถูกต้องทุกบรรทัด สิ่งที่ผิดคือ *ข้อมูลที่มันเลือกอ่าน*
 *
 * ─── บั๊กที่ 1: อ่านเลขพัสดุแค่ทางเดียว จากสองทาง ────────────────────────────
 * ระบบเก็บพัสดุ 2 ตารางตาม `docs/conventions/one-value-many-entry-points.md`:
 *   ส่งเอง  → `ShipmentTracking`  ·  ผ่าน iShip → `OrderShipment`
 * ของเดิมกรอง `shipmentTracking: { isNot: null }` อย่างเดียว ⇒
 *   - ร้านที่เปิดพัสดุผ่าน iShip ล้วน ได้ sample = 0 → ตกด่าน minOrders → **ไม่มีวันได้เหรียญ**
 *     ไม่ว่าจะส่งไวแค่ไหน และไม่มี error ไม่มี log อะไรเลย
 *   - ร้านที่ใช้ทั้งสองทาง ถูกวัดจาก subset ที่ไม่เป็นตัวแทน
 * วัดจริงบน prod 2026-08-10 (ออเดอร์สำเร็จ 73 ใบ): ทาง ShipmentTracking เห็น 31 ใบ
 * เฉลี่ย 153.4 ชม. · รวม iShip ด้วยเห็น 71 ใบ เฉลี่ย 64.9 ชม. — **คำถามเดียวกัน
 * คำตอบต่างกัน 2.4 เท่า** ขึ้นกับว่าอ่านตารางไหน
 *
 * ─── บั๊กที่ 2: ตัวตั้งเวลาเปลี่ยนความหมายไปแล้ว ───────────────────────────
 * ของเดิมวัดจาก `Order.createdAt` พร้อมคอมเมนต์ว่า "proxy สำหรับ confirmed→shipped"
 * ซึ่งจริงตอนที่เขียน เพราะคอลัมน์นั้นเคยแปลว่า "แถวถูกสร้างเมื่อไหร่"
 * feature 00033 (2026-08-06) เปลี่ยนมันเป็น **"วันที่ลูกค้าสั่ง" ที่ผู้ขายพิมพ์เอง**
 * ย้อนหลังได้ 90 วัน / ล่วงหน้าได้ 7 วัน ⇒
 *   - ลงย้อนหลัง = ตัวเลขบวมเอง ร้านดูส่งช้าทั้งที่ส่งไว (วัดบน prod: ต่างกัน 8.8 ชม.)
 *   - ลงล่วงหน้า = **ได้ค่าติดลบ** ถ่วง avg ลง ⇒ ได้เหรียญ "ส่งไว" ด้วยการลงวันที่ในอนาคต
 *     นี่คือช่องที่ปั่นง่ายที่สุดในระบบเหรียญ เพราะร้านพิมพ์เลขนั้นเองได้
 * ตัวตั้งที่ถูกคือ `OrderEvent(ORDER_CREATED).occurredAt` = **เวลาที่กดจริง** ซึ่ง 00033
 * จงใจแยกไว้ไม่ให้ย้อนตามค่าที่ผู้ใช้กรอก (วันที่สั่งไปอยู่ใน `meta.orderedAt` แทน)
 *
 * ─── บั๊กที่ 3: ตัวปลายเวลาก็ค้าง (พบตอน review 2026-08-10) ──────────────────
 * `OrderShipment.createdAt` คือเวลาที่ **พยายามเปิดพัสดุครั้งแรก** ไม่ใช่เวลาที่เปิดสำเร็จ —
 * `retryShipment` (`iship.service.ts`) **update แถวเดิม** กลับเป็น PENDING แล้วยิงใหม่
 * `@default(now())` ตั้งครั้งเดียวตอน insert จึงไม่เคยขยับตลอดวงจร ⇒ ร้านที่พัสดุล้มเพราะ
 * เครดิต iShip ไม่พอ แล้วเติมเงินลองใหม่สำเร็จอีก 3 วันให้หลัง จะถูกบันทึกว่า "ส่งไว"
 * ตามเวลาที่ล้มครั้งแรก **ความคลาดเคลื่อนไม่มีเพดาน และเอนไปทางเป็นคุณกับร้านเสมอ**
 * ตัวที่ถูกคือ `OrderEvent(SHIPMENT_CREATED).occurredAt` ซึ่งเขียนใหม่ทุกครั้งที่ transition
 * เป็น CREATED สำเร็จ (อยู่ใน tx เดียวกัน) — **หลักการเดียวกับบั๊กที่ 2 เป๊ะ: ย้ายจากคอลัมน์
 * ที่ค้าง/เขียนทับได้ ไปหา event log ที่นิ่ง**
 * วัดบน prod 2026-08-10: พัสดุสำเร็จ 151 ใบ มี 6 ใบที่เคย retry (สูงสุด 4 ครั้ง) ต่างกัน
 * สูงสุด 58 นาที · และ **55 ใบไม่มี event เลย** (เกิดก่อนฟีเจอร์ 00031) จึงต้องมี fallback
 */

/** ข้อมูลดิบของ 1 ออเดอร์ที่ต้องใช้ตัดสินความไว — ผู้เรียกดึงจาก DB มาป้อน */
export type ShippingSpeedRow = {
  /** `Order.createdAt` — ตั้งแต่ 00033 = "วันที่ลูกค้าสั่ง" ที่ผู้ขายกรอกเอง (ใช้เป็น fallback เท่านั้น) */
  orderCreatedAt: Date
  /** `OrderEvent(ORDER_CREATED).occurredAt` — เวลาที่กดสร้างจริง (ตัวตั้งที่ถูก) */
  keyedInAt: Date | null
  /**
   * `OrderEvent(SHIPMENT_CREATED).occurredAt` ของใบล่าสุด — **เวลาที่พัสดุเปิดสำเร็จจริง**
   * 🛑 นี่คือค่าที่ถูก ไม่ใช่ `OrderShipment.createdAt` (ดูบั๊กที่ 3 ที่หัวไฟล์)
   */
  ishipShipmentEventAt: Date | null
  /** `OrderShipment.createdAt` ของใบที่ status='CREATED' และไม่ใช่ dry-run — fallback เท่านั้น */
  ishipShipmentRowAt: Date | null
  /** `ShipmentTracking.createdAt` — กรณีร้านกรอกเลขพัสดุเอง */
  manualShipmentAt: Date | null
}

export type ShippingSpeed = {
  /** จำนวนออเดอร์ที่นับได้จริง (มีพัสดุ + ช่วงเวลาสมเหตุผล) */
  sampleSize: number
  /** ชั่วโมงเฉลี่ยจากกดสร้างออเดอร์ ถึงเปิดพัสดุ — 0 เมื่อ sampleSize = 0 */
  avgHours: number
  /** ออเดอร์ที่มีพัสดุแต่ถูกตัดทิ้งเพราะช่วงเวลาติดลบ (ดู resolveElapsedHours) */
  discarded: number
}

/**
 * เวลาที่พัสดุถูกเปิด — **iShip ชนะเมื่อมีทั้งคู่**
 * เหตุผลเดียวกับที่ฝั่งแสดงผลใช้ (`docs/conventions/one-value-many-entry-points.md`):
 * ใบที่ผ่าน iShip มีสถานะจริงจากขนส่ง ส่วนช่องกรอกเองเป็นสิ่งที่ร้านพิมพ์ลงไป
 */
export function resolveShippedAt(row: ShippingSpeedRow): Date | null {
  return row.ishipShipmentEventAt ?? row.ishipShipmentRowAt ?? row.manualShipmentAt ?? null
}

/**
 * เวลาเริ่มนับ — เวลาที่ "กดสร้างออเดอร์" จริงเสมอ
 * fallback ไป `orderCreatedAt` ได้เฉพาะออเดอร์เก่าที่เกิดก่อนมีตาราง `OrderEvent`
 * (feature 00031) ซึ่งตอนนั้น 2 ค่านี้ยังเท่ากันเสมอ — จึงเป็น fallback ที่ถูกต้อง
 * ไม่ใช่การเดา. บน prod วันนี้ออเดอร์สำเร็จ 73/73 ใบมี ORDER_CREATED ครบ
 */
export function resolveStartedAt(row: ShippingSpeedRow): Date {
  return row.keyedInAt ?? row.orderCreatedAt
}

/**
 * ชั่วโมงที่ใช้ไป — คืน `null` เมื่อนับไม่ได้ หรือ **เมื่อค่าติดลบ**
 *
 * 🛑 ติดลบต้อง "ตัดทิ้ง" ไม่ใช่ "ปัดเป็น 0" และไม่ใช่ปล่อยผ่าน:
 *   - ปล่อยผ่าน = ค่าลบถ่วง avg ลง → เหรียญส่งไวแจกฟรีให้คนที่ทำข้อมูลเพี้ยน
 *   - ปัดเป็น 0 = นับว่า "ส่งทันที" ซึ่งดีที่สุดเท่าที่เป็นไปได้ → ยิ่งแย่กว่าเดิม
 * ค่าติดลบแปลว่าข้อมูลแถวนั้นขัดกันเอง (พัสดุถูกเปิดก่อนออเดอร์ถูกกดสร้าง)
 * ⇒ ไม่รู้ความจริง จึงไม่เอามาตัดสิน ไม่ใช่เดาไปทางที่เป็นคุณกับร้าน
 */
export function resolveElapsedHours(row: ShippingSpeedRow): number | null {
  const shippedAt = resolveShippedAt(row)
  if (!shippedAt) return null
  const diffMs = shippedAt.getTime() - resolveStartedAt(row).getTime()
  if (diffMs < 0) return null
  return diffMs / (1000 * 60 * 60)
}

/** รวมทุกแถวเป็นค่าเฉลี่ย — ฟังก์ชันบริสุทธิ์ ไม่แตะ DB ไม่ดูนาฬิกา */
export function computeShippingSpeed(rows: ShippingSpeedRow[]): ShippingSpeed {
  let total = 0
  let sampleSize = 0
  let discarded = 0

  for (const row of rows) {
    if (!resolveShippedAt(row)) continue // ไม่มีพัสดุเลย = ไม่เกี่ยวกับความไว ไม่นับเป็นทั้งตัวตั้งและตัวหาร
    const hours = resolveElapsedHours(row)
    if (hours === null) {
      discarded++
      continue
    }
    total += hours
    sampleSize++
  }

  return { sampleSize, avgHours: sampleSize === 0 ? 0 : total / sampleSize, discarded }
}
