/**
 * Valibot schemas สำหรับ route `/api/app/*` (Buyer App)
 * แยกไฟล์จาก lib/validations.ts เพื่อไม่ปนกับ schema ของเว็บเดิม.
 */
import * as v from 'valibot'

// ขอ OTP — phone เท่านั้น (แอป buyer ใช้เบอร์ + OTP)
export const AppRequestOtpSchema = v.object({
  phone: v.pipe(v.string(), v.regex(/^0[0-9]{9}$/, 'เบอร์โทรไม่ถูกต้อง')),
})

// ยืนยัน OTP — field ชื่อ `code` ให้ตรงกับที่แอปส่ง (Deep-App src/api/auth.ts)
export const AppVerifyOtpSchema = v.object({
  phone: v.pipe(v.string(), v.regex(/^0[0-9]{9}$/, 'เบอร์โทรไม่ถูกต้อง')),
  code: v.pipe(v.string(), v.length(6)),
  displayName: v.optional(v.pipe(v.string(), v.maxLength(80))),
})

// วางบิด
export const AppPlaceBidSchema = v.object({
  amount: v.pipe(v.number(), v.minValue(0.01)),
})

// รีวิวออเดอร์ — field ชื่อ `text` ให้ตรงกับที่แอปส่ง (Deep-App orderApi.ts)
export const AppReviewSchema = v.object({
  rating: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(5)),
  text: v.optional(v.pipe(v.string(), v.maxLength(1000))),
})

// ขอยืนยันตัวตน — L2 (เอกสารบุคคล) / L3 (ธุรกิจ). documents = array ของ fileId (optional ตอนนี้)
export const AppVerifyRequestSchema = v.object({
  level: v.picklist([2, 3]),
  type: v.optional(v.pipe(v.string(), v.maxLength(40))),
  documents: v.optional(v.array(v.string())),
})
