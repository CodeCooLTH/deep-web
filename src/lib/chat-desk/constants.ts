// ค่าคงที่ของโต๊ะแชท 3D (00077) — ที่เดียว (SDS §6.1) · client-safe ห้าม import server
export const POLL_INTERVAL_MS = 8000
export const SIGNAL_DEBOUNCE_MS = 2000
/** ร้านตอบภายในกี่วินาทีถึงยังนับว่า "เพิ่งตอบ" (ยืนหน้าโต๊ะ) */
export const RECENT_REPLY_WINDOW_SEC = 180
export const AWAITING_WINDOW_DAYS = 7
export const AWAITING_CAP = 200
export const LOUNGE_SEATS = 24
export const PER_DESK = 3
/** โต๊ะแอดมินบนฉากสูงสุด (Design Spec มติข้อ 7: 2 แถว) เกินนี้เป็น "+N โต๊ะ" */
export const MAX_SCENE_ADMIN_DESKS = 8
export const MAX_ANIMATED_EVENTS = 20
export const PREVIEW_LIMIT = 30
export const DAILY_CACHE_TTL_MS = 60000
export const PRESENCE_READY_TIMEOUT_MS = 10000
export const FEED_MAX = 12
export const MAX_FILTER_IDS = 50
/** มือถือ (< 768px) ตั้งต้น 2D */
export const MOBILE_BREAKPOINT_PX = 768

export const PLATFORMS = ['DEEP', 'MESSENGER', 'INSTAGRAM', 'LINE'] as const

/** ชื่อโต๊ะที่ไม่ใช่แอดมิน — "ตอบจากนอกระบบ" (คำเดียวกับ MetricGlossary · มติ Controller ข้อ 5) ห้ามเรียก AI/บอท (BR-CD-07) */
export const DESK_LABELS = {
  EXTERNAL: 'ตอบจากนอกระบบ',
  META_AI: 'Meta AI / กล่องของเพจ',
  BOT: 'บอท Deep',
} as const

/** ช่องสัญญาณ presence ของร้าน (SDS §8) */
export const presenceTopic = (shopId: string) => `presence:chat:${shopId}`
