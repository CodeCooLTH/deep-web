/**
 * validations.ts — Valibot schemas ของ owner API (SRS §8) · ไฟล์ feature-local (SDS TD-008)
 * กฎข้ามฟิลด์ (เช่น เปิดรายวันต้องมีเวลา) ตรวจที่ service บน state ที่รวมแล้ว ไม่ใช่ที่นี่
 */
import * as v from 'valibot'

export const ShopIdsSchema = v.pipe(
  v.array(v.pipe(v.string(), v.minLength(1), v.maxLength(64))),
  v.minLength(1, 'เลือกร้านได้ 1–10 ร้าน'),
  v.maxLength(10, 'เลือกร้านได้ 1–10 ร้าน'),
  v.check((a) => new Set(a).size === a.length, 'เลือกร้านซ้ำกันไม่ได้'),
)

export const SlotMinutesSchema = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(30),
  v.maxValue(1440),
  v.check((n) => n % 30 === 0, 'เวลาต้องเป็นทีละ 30 นาที'),
)

export const DailyTimesSchema = v.pipe(
  v.array(SlotMinutesSchema),
  v.maxLength(4, 'ตั้งได้ไม่เกิน 4 เวลา'),
  v.check((a) => new Set(a).size === a.length, 'เลือกเวลาซ้ำกันไม่ได้'),
)

/** null = สิ้นเดือน */
export const CutoffDaySchema = v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(31)))

export const CreateBindCodeSchema = v.object({
  shopIds: ShopIdsSchema,
  acknowledged: v.literal(true, 'ต้องยืนยันรับทราบก่อนสร้างโค้ด'),
})

export const UpdateSettingsSchema = v.pipe(
  v.strictObject({
    dailyEnabled: v.optional(v.boolean()),
    dailyTimes: v.optional(DailyTimesSchema),
    monthlyEnabled: v.optional(v.boolean()),
    cutoffDay: v.optional(CutoffDaySchema),
    showOrders: v.optional(v.boolean()),
    showSales: v.optional(v.boolean()),
    showCancelled: v.optional(v.boolean()),
    showTopProducts: v.optional(v.boolean()),
    showProfit: v.optional(v.boolean()),
    skipWhenNoOrders: v.optional(v.boolean()),
    attachCycleToDaily: v.optional(v.boolean()),
    confirmProfit: v.optional(v.boolean()),
  }),
  v.check((o) => Object.values(o).some((x) => x !== undefined), 'ต้องส่งอย่างน้อย 1 ค่า'),
)

export const ReplaceShopsSchema = v.object({ shopIds: ShopIdsSchema })
export const GroupIdParam = v.pipe(v.string(), v.minLength(1), v.maxLength(64))

export type CreateBindCodeInput = v.InferOutput<typeof CreateBindCodeSchema>
export type UpdateSettingsInput = v.InferOutput<typeof UpdateSettingsSchema>
export type ReplaceShopsInput = v.InferOutput<typeof ReplaceShopsSchema>
