// feature 00078 — Valibot ของ API ส่งอัตโนมัติ (แยกไฟล์ ไม่แตะ validations.ts) ตาม API.md §4.2–4.5
import * as v from 'valibot'
import { AUTO_NOTIFY_KINDS, AUTO_NOTIFY_TEMPLATE_MAX_CHARS, AUTO_NOTIFY_DAILY_CAP, TRACKING_NOTICE_TIMINGS } from './ledger-constants'
import { countCodePoints, hasLoneSurrogate } from './variables'

export const AutoNotifyKindSchema = v.picklist(AUTO_NOTIFY_KINDS)

export const SetAutoNotifyCapSchema = v.object({
  dailyCapPerRoom: v.pipe(
    v.number(),
    v.integer(),
    v.minValue(AUTO_NOTIFY_DAILY_CAP.min),
    v.maxValue(AUTO_NOTIFY_DAILY_CAP.max),
  ),
})

/** PATCH settings (00080 TD-007): สองคีย์เป็น optional แต่ต้องมีอย่างน้อยหนึ่งคีย์ · คีย์เกิน = ตก */
export const AutoNotifySettingsPatchSchema = v.pipe(
  v.strictObject({
    dailyCapPerRoom: v.optional(SetAutoNotifyCapSchema.entries.dailyCapPerRoom),
    trackingNoticeTiming: v.optional(v.picklist(TRACKING_NOTICE_TIMINGS)),
  }),
  v.check((o) => o.dailyCapPerRoom !== undefined || o.trackingNoticeTiming !== undefined, 'EMPTY'),
)

export const AutoNotifySwitchBodySchema = v.object({ enabled: v.boolean() })

export const SaveAutoNotifyTemplateSchema = v.object({
  body: v.pipe(
    v.string(),
    v.check((s) => !s.includes('\u0000'), 'NUL'),
    v.check((s) => !hasLoneSurrogate(s), 'SURROGATE'),
    v.check((s) => countCodePoints(s) >= 1 && countCodePoints(s) <= AUTO_NOTIFY_TEMPLATE_MAX_CHARS, 'LENGTH'),
    v.check((s) => s.trim() !== '', 'BLANK'),
  ),
  expectedUpdatedAt: v.nullable(v.pipe(v.string(), v.isoTimestamp())), // null = ยังไม่เคยมีแถว
})

export const DeleteAutoNotifyTemplateQuerySchema = v.object({
  expectedUpdatedAt: v.pipe(v.string(), v.isoTimestamp()),
})
