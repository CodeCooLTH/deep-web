/**
 * ตัดยอดขาย (`revenue`) ออกจาก payload รายงานแอดมินที่ขอบ response (00071 D-3)
 *
 * ทำไม deep-walk: revenue อยู่หลายชั้น (overview/previous/metrics/leaderboard[]/trend[]) —
 * เดินทั้งก้อนกันตกชั้นที่เพิ่มทีหลัง · ค่าเป็น null ไม่ใช่ 0 (0 = โกหกว่าขายไม่ได้)
 */
export function redactAgentRevenue<T>(value: T): T {
  if (Array.isArray(value)) return value.map(redactAgentRevenue) as unknown as T
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, k === 'revenue' ? null : redactAgentRevenue(v)]),
    ) as T
  }
  return value
}
