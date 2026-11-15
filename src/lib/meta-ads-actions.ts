/**
 * meta-ads-actions — ชื่อ action ของ Meta + ตัวอ่านค่า action (ใช้ร่วม meta-ads-insights / meta-ads-quality)
 * แยกออกมาเพื่อตัด import วนระหว่างสองไฟล์นั้น · 🛑 action ที่ไม่มีในคำตอบ = null ไม่ใช่ 0 (BR-AIQ-07)
 */
type Raw = Record<string, unknown>
const num = (v: unknown): number | null => {
  if (v === undefined || v === null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export const ACTION = {
  started: 'onsite_conversion.messaging_conversation_started_7d',
  replied: 'onsite_conversion.messaging_conversation_replied_7d',
  depth2: 'onsite_conversion.messaging_user_depth_2_message_send',
  depth3: 'onsite_conversion.messaging_user_depth_3_message_send',
  block: 'onsite_conversion.messaging_block',
} as const

/** actions[] → ค่าของ action_type ที่ขอ · ไม่มี action นั้น (หรือไม่มี actions เลย) = null */
export function actionValue(actions: unknown, type: string): number | null {
  if (!Array.isArray(actions)) return null
  const hit = actions.find((a) => (a as Raw)?.action_type === type) as Raw | undefined
  return hit ? num(hit.value) : null
}
