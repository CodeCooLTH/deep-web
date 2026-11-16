// 00095 — ค่าคงที่/enum ของบอทติดตามยอดขาย (SRS TFR-FB-02/04/06) · ที่เดียวทั้งระบบ
// ตัวเลขทุกตัวต้องตรง DB CHECK ของ S-1 (SalesFollowBot/Run/Send) — ขยายเพดานต้องไล่ CHECK พร้อมกัน (บทเรียน #4)
// pure module: ห้าม import prisma

export const DAY_MS = 24 * 60 * 60 * 1000
export const MIN_MS = 60 * 1000

/** สถานะการขาย 7 ค่า — ห้ามตั้งชื่อ CONFIRMED (ชนกับ Order.status='CONFIRMED' ที่แปลว่าผู้ซื้อยืนยันรับ) */
export const SALES_STAGE_KEYS = [
  'NOT_BOUGHT',
  'BILLED',
  'ORDER_CONFIRMED',
  'SHIPPED',
  'COMPLETED',
  'PARCEL_PROBLEM',
  'CANCELLED',
] as const
export type SalesStageKey = (typeof SALES_STAGE_KEYS)[number]

export const SALES_STAGE_LABEL: Record<SalesStageKey, string> = {
  NOT_BOUGHT: 'ยังไม่ซื้อ',
  BILLED: 'เปิดบิล',
  ORDER_CONFIRMED: 'ยืนยันแล้ว',
  SHIPPED: 'ส่งแล้ว',
  COMPLETED: 'สำเร็จ',
  PARCEL_PROBLEM: 'พัสดุมีปัญหา',
  CANCELLED: 'ยกเลิก',
}

export const BOT_STATUSES = ['CLOSED', 'TESTING', 'ACTIVE'] as const
export type BotStatus = (typeof BOT_STATUSES)[number]

export const TAG_MATCHES = ['ANY', 'ALL'] as const
export type TagMatch = (typeof TAG_MATCHES)[number]

/**
 * ชนิดชิ้นในรอบ (TFR-FB-25 — 1 รอบ = ชุดชิ้น 1..5): ข้อความ · รูป (1..5 รูปต่อชิ้น) · ข้อความที่ใช้บ่อย
 * เลิกชนิด TEXT_IMAGE · การ์ดสินค้า ฯลฯ เป็น P2 (เพิ่มค่าอย่างเดียว BR-FB-81)
 */
export const PART_KINDS = ['TEXT', 'IMAGES', 'QUICK_MESSAGE'] as const
export type PartKind = (typeof PART_KINDS)[number]

/** ช่องทางที่บอทใช้ได้ — ไม่มี DEEP (ห้องแชทในแอป) */
export const FOLLOW_PROVIDERS = ['MESSENGER', 'INSTAGRAM', 'LINE'] as const
export type FollowProvider = (typeof FOLLOW_PROVIDERS)[number]
/** กรอบโฆษณา/Meta AI ใช้ได้เฉพาะ Meta — LINE ไม่มี (BR-FB-23 ก) */
export const META_PROVIDERS = ['MESSENGER', 'INSTAGRAM'] as const

export const RUN_STATUSES = ['ACTIVE', 'DONE', 'STOPPED'] as const
export type RunStatus = (typeof RUN_STATUSES)[number]

/** ต้องตรง CHECK ของ SalesFollowRun.stopReason */
export const STOP_REASONS = [
  'STAGE_CHANGED',
  'TAG_REMOVED',
  'BOT_DISABLED',
  'BOT_EDITED',
  'BOT_DELETED',
  'CUSTOMER_REPLIED',
  'WINDOW_CLOSED',
  'NOT_INTERESTED',
  'OUT_OF_SCOPE',
  'CONTACT_BLOCKED',
  'ADMIN_STOPPED',
] as const
export type StopReason = (typeof STOP_REASONS)[number]

/** ต้องตรง CHECK ของ SalesFollowRun.holdReason */
export const HOLD_REASONS = ['SHOP_NOT_ENABLED', 'META_AI_HOLDING', 'AUTO_REPLY_OFF', 'CHANNEL_NOT_ACTIVE'] as const
export type HoldReason = (typeof HOLD_REASONS)[number]

export const SEND_STATUSES = ['SENDING', 'SENT', 'FAILED', 'SKIPPED'] as const
export type SendStatus = (typeof SEND_STATUSES)[number]

/** ต้องตรง CHECK ของ SalesFollowSend.reason */
export const SEND_REASONS = [
  'PLATFORM_REJECTED',
  'UNCERTAIN_SEND',
  'OTHER_APP_CONTROLS',
  'LINE_QUOTA_FULL',
  'META_WINDOW_REJECTED',
  'IMAGE_MISSING',
  'EMPTY_MESSAGE',
] as const
export type SendReason = (typeof SEND_REASONS)[number]

/** ข้อความไทยของทุกรหัส (TC-108) — Record บังคับให้เพิ่มรหัสแล้วต้องมีคำ ไม่โชว์รหัสดิบให้ผู้ใช้ */
export const STOP_REASON_TEXT: Record<StopReason, string> = {
  STAGE_CHANGED: 'สถานะการขายเปลี่ยน',
  TAG_REMOVED: 'แท็กถูกเอาออก',
  BOT_DISABLED: 'บอทถูกปิด',
  BOT_EDITED: 'บอทถูกแก้ไข',
  BOT_DELETED: 'บอทถูกลบ',
  CUSTOMER_REPLIED: 'ลูกค้าตอบแล้ว',
  WINDOW_CLOSED: 'เลยกรอบเวลา',
  NOT_INTERESTED: 'ลูกค้าไม่สนใจ',
  OUT_OF_SCOPE: 'ห้องหลุดขอบเขต',
  CONTACT_BLOCKED: 'ลูกค้าบล็อก/เลิกติดตาม',
  ADMIN_STOPPED: 'หยุดโดยแอดมิน',
}
export const HOLD_REASON_TEXT: Record<HoldReason, string> = {
  SHOP_NOT_ENABLED: 'ร้านยังไม่เปิดใช้',
  META_AI_HOLDING: 'Meta AI กำลังตอบห้องนี้',
  AUTO_REPLY_OFF: 'ร้านปิดตอบอัตโนมัติห้องนี้',
  CHANNEL_NOT_ACTIVE: 'ช่องทางหลุด',
}
export const SEND_REASON_TEXT: Record<SendReason, string> = {
  PLATFORM_REJECTED: 'ผู้ให้บริการปฏิเสธ',
  UNCERTAIN_SEND: 'ไม่ทราบผล (ค้างส่งเกินเวลา)',
  OTHER_APP_CONTROLS: 'แอปอื่นคุมห้องนี้',
  LINE_QUOTA_FULL: 'โควตา LINE เต็ม',
  META_WINDOW_REJECTED: 'Meta ไม่ให้ส่งนอกกรอบ',
  IMAGE_MISSING: 'ไม่พบรูป',
  EMPTY_MESSAGE: 'ข้อความว่างหลังแทนตัวแปร',
}

/** ขีดจำกัดฟอร์ม (ใช้ทั้ง schemas.ts และ `options.limits` ของ API §4.7 — TC-107) */
export const SALES_FOLLOW_LIMITS = {
  maxSteps: 10,
  /** ชิ้นต่อรอบ */
  maxParts: 5,
  /** รูปต่อชิ้นชนิด IMAGES */
  maxImagesPerPart: 5,
  maxText: 1000,
  /** ความยาวสูงสุดของ fileId / quickMessageId ที่รับจาก client */
  maxIdLength: 120,
  maxName: 60,
  maxTestRooms: 20,
  maxChannels: 50,
  maxTags: 20,
  minDelayMin: 1,
  /** 6 วัน 23 ชม. = เพดานกรอบโฆษณา 7 วันหัก 1 ชม. เผื่อคิว (AD_WINDOW_MS) */
  maxTotalDelayMin: 10_020,
  /** ขั้นที่เวลาสะสม > 23 ชม. ส่งได้เฉพาะลูกค้า Meta ที่ทักจากโฆษณา → ป้าย adOnly (คำนวณ ไม่เก็บ) */
  adOnlyAfterMin: 1_380,
} as const

/** ตัวแปรที่อนุญาตในข้อความขั้น (TFR-FB-04) */
export const ALLOWED_VARIABLES = ['ชื่อ'] as const

/**
 * ค่าพักก่อนข้อความใหม่ของลูกค้านับเป็น "รอบใหม่" (TFR-FB-02) — เทียบแบบ "เกินจริง" `>` ไม่ใช่ `>=`
 * สถานะที่ไม่อยู่ในตารางนี้ไม่จบรอบเอง (BILLED/ORDER_CONFIRMED/PARCEL_PROBLEM/NOT_BOUGHT)
 */
export const HOLD_MS: Partial<Record<SalesStageKey, number>> = {
  COMPLETED: 7 * DAY_MS,
  SHIPPED: 14 * DAY_MS,
  CANCELLED: 0,
}

/** ขอบเวลาของทุก query ที่อ่าน ChatMessage (AC-FB-47) */
export const MESSAGE_LOOKBACK_MS = 30 * DAY_MS

// ── engine (ใช้โดย S-4 · วางที่นี่เพื่อให้ตัวเลขอยู่ที่เดียว) ──
export const TICK_BUDGET_MS = 40_000
export const EVALUATE_LIMIT = 50
export const ATTACH_ROOM_LIMIT = 200
/** SENDING ที่ยังไม่มี chatMessageId เกินเวลานี้ = ไม่รู้ผล → UNCERTAIN_SEND (ไม่ยิงซ้ำ) */
export const SENDING_STALE_MS = 10 * MIN_MS
