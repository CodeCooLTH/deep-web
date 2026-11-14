/**
 * ad-quality-formulas — สูตร F-01…F-13 + กฎป้ายของรายงานคุณภาพโฆษณา (00093) · pure ไม่มี React/DB
 * 🛑 นิยามเดียว (HR16): ตัวหาร 0 หรือไม่มีค่า → null ("—") ห้ามคืน 0 · action ที่ไม่มีในคำตอบ = null ไม่ใช่ 0 (BR-AIQ-07)
 * ค่าเกิน 100% เก็บตามจริง (Meta นับคนละวิธี) · แถวรวม = ผลรวมตัวตั้ง ÷ ผลรวมตัวหาร ห้ามเฉลี่ย %
 */

/** BR-AIQ-05 — ค่าคงที่เดียวของเกณฑ์ "ส่วนต่างสูง" */
export const HIGH_GAP_PCT = 20
export const HIGH_GAP_MIN_META_CHATS = 20

const round2 = (n: number) => Math.round(n * 100) / 100

/** ตัวตั้ง ÷ ตัวหาร × scale — ตัวใดตัวหนึ่งไม่มีค่า หรือตัวหาร ≤ 0 → null */
export function ratio(num: number | null, den: number | null, scale = 100): number | null {
  if (num === null || den === null || den <= 0) return null
  return round2((num / den) * scale)
}

/** F-01 ส่วนต่างแชทรายแอด (ติดลบ = Deep เห็นมากกว่า) */
export function gapPct(meta: number | null, deep: number): number | null {
  if (meta === null || meta <= 0) return null
  return round2(((meta - deep) / meta) * 100)
}

/** F-03 CTR · F-05…F-08 · F-13 ThruPlay% ใช้ตัวนี้ทั้งหมด (ตัวตั้ง ÷ ตัวหาร × 100) */
export const ratePct = (num: number | null, den: number | null) => ratio(num, den, 100)

/** F-04 CPC · F-10 · F-11 ต้นทุนต่อหน่วย (บาท) */
export const unitCost = (spend: number | null, units: number | null) => ratio(spend, units, 1)

/** F-12 ความถี่ = impressions ÷ reach (reach = 0 → null) */
export const frequency = (impressions: number | null, reach: number | null) => ratio(impressions, reach, 1)

/** F-09 อัตราปิดการขาย = คำสั่งซื้อ ÷ แชท (Deep) */
export const closeRatePct = (orders: number, chatsDeep: number) => ratio(orders, chatsDeep, 100)

export type GapBadge = 'HIGH' | 'NO_DEEP' | 'DEEP_MORE' | 'LOW_SAMPLE' | null

/**
 * ป้ายของแถวเทียบแชท (BRD FR-004 + มติ O4)
 * - Meta ≥ 20 เท่านั้นจึงติดป้ายเตือน (ตัวอย่างน้อยเกินไปไม่ตัดสิน) · ต่ำกว่านั้นแต่ส่วนต่าง ≥ 20% = LOW_SAMPLE
 * - Meta > 0 และ Deep = 0 → NO_DEEP (ส่วนต่าง 100%) ใช้เกณฑ์ Meta ≥ 20 เหมือนกัน
 * - ส่วนต่างติดลบ = DEEP_MORE (โทนกลาง ไม่ใช่ข้อผิดพลาด)
 */
export function gapBadge(meta: number | null, deep: number): GapBadge {
  if (meta === null || meta <= 0) return null
  // ตัดสินด้วยค่าดิบ ไม่ใช่ค่าที่ปัด 2 ตำแหน่ง (19.996% ต้องไม่ถูกปัดเป็น 20% แล้วติดป้าย)
  const gap = ((meta - deep) / meta) * 100
  if (gap < 0) return 'DEEP_MORE'
  if (gap < HIGH_GAP_PCT) return null
  if (meta < HIGH_GAP_MIN_META_CHATS) return 'LOW_SAMPLE'
  return deep === 0 ? 'NO_DEEP' : 'HIGH'
}

/** null = ไม่มีค่าเลย (ไม่ใช่ 0) · รวมเฉพาะแถวที่มีค่า */
export function sumKnown(values: (number | null)[]): number | null {
  let s = 0
  let any = false
  for (const v of values) {
    if (v === null) continue
    s += v
    any = true
  }
  return any ? s : null
}

/**
 * อัตรารวมกลุ่ม (แถวแคมเปญ/แถวรวม): Σ ตัวตั้ง ÷ Σ ตัวหาร เฉพาะแถวที่ "มีทั้งคู่" — ตัวลบนับจากชุดเดียวกับตัวตั้ง
 * ไม่ใช่การเฉลี่ย % ของแต่ละแถว
 */
export function groupRatePct<T>(rows: T[], num: (r: T) => number | null, den: (r: T) => number | null) {
  const both = rows.filter((r) => num(r) !== null && den(r) !== null)
  return { pct: ratePct(sumKnown(both.map(num)), sumKnown(both.map(den))), num: sumKnown(both.map(num)), den: sumKnown(both.map(den)) }
}

/** BR-AIQ-08 แอดวิดีโอ = มี p25 หรือ ThruPlay ที่ค่า > 0 */
export const isVideoAd = (v: { p25: number | null; thruplay: number | null }) => (v.p25 ?? 0) > 0 || (v.thruplay ?? 0) > 0

/** BR-AIQ-09 ชื่อตำแหน่งภาษาไทย — ค่านอกตารางแสดงดิบ (ไม่ทิ้งแถว) */
const PLACEMENT: Record<string, string> = {
  'facebook|feed': 'Facebook ฟีด',
  'facebook|facebook_reels': 'Facebook Reels',
  'facebook|facebook_stories': 'Facebook Stories',
  'facebook|marketplace': 'Facebook Marketplace',
  'facebook|video_feeds': 'Facebook วิดีโอ',
  'instagram|stream': 'Instagram ฟีด',
  'instagram|story': 'Instagram Stories',
  'instagram|reels': 'Instagram Reels',
  'instagram|explore': 'Instagram Explore',
  'messenger|messenger_inbox': 'Messenger กล่องข้อความ',
  'messenger|messenger_stories': 'Messenger Stories',
}
export function placementLabel(platform: string, position: string): string {
  if (platform === 'audience_network') return 'Audience Network'
  return PLACEMENT[`${platform}|${position}`] ?? `${platform} · ${position}`
}

/** ชื่อแพลตฟอร์มสำหรับ donut (จัดกลุ่มตาม publisher_platform) */
export const PLATFORM_LABEL: Record<string, string> = {
  facebook: 'Facebook', instagram: 'Instagram', messenger: 'Messenger', audience_network: 'Audience Network',
}
export const platformLabel = (p: string) => PLATFORM_LABEL[p] ?? p

export const GENDER_ORDER = ['male', 'female', 'unknown'] as const
