// สัญญา type ของโต๊ะแชท 3D (00077) — ตรง docs API.md · client-safe
import type { PLATFORMS } from './constants'

export type DeskPlatform = (typeof PLATFORMS)[number]
export type DeskRoomState = 'WAITING' | 'AT_DESK'
/** ผลของ classifyRoom — NONE = ไม่อยู่ในฉาก */
export type RoomClass = DeskRoomState | 'NONE'

export type DeskTarget =
  | { kind: 'ADMIN'; userId: string }
  | { kind: 'EXTERNAL' }
  | { kind: 'META_AI' }
  | { kind: 'BOT' }

export type DeskRoom = {
  id: string
  name: string
  platform: DeskPlatform
  pageId: string | null
  state: DeskRoomState
  askedAt: string | null
  lastInboundAt: string | null
  repliedAt: string | null
  desk: DeskTarget | null
}

export type DeskMember = {
  userId: string
  name: string
  role: 'OWNER' | 'ADMIN'
  canChat: boolean
  presenceKey: string
}

export type DeskDaily = {
  status: 'OK' | 'UNAVAILABLE'
  asOf: string
  firstResponseAvgSec: number | null
  responseAvgSec: number | null
  responseSampleCount: number
  unattributedReplyCount: number
  answeredOutsideSystemConversations: number
  resolvedToday: number
}

export type DeskChannel = { id: string; name: string; provider: string }

export type DeskFilters = {
  platforms: DeskPlatform[]
  pages: string[]
  admins: string[]
}

export type DeskSnapshot = {
  v: 1
  serverNow: number
  shop: { id: string; name: string; kind: 'PERSONAL' | 'BUSINESS' }
  sla: { firstResponseSec: number; source: string }
  filters: DeskFilters
  awaiting: { capped: boolean }
  rooms: DeskRoom[]
  members: DeskMember[]
  channels: DeskChannel[]
  daily: DeskDaily
}

export type DeskViewMode = '2d' | '3d'

/** สถานะตัวลูกค้า (กำหนดสี) — WAITING รอ · RECENT ร้านเพิ่งตอบ · OVERDUE เกินเวลาตอบ */
export type DeskCustomerStatus = 'WAITING' | 'RECENT' | 'OVERDUE'

export type DeskCustomer = {
  id: string
  name: string
  platform: DeskPlatform
  pageId: string | null
  status: DeskCustomerStatus
  /** ISO: askedAt (WAITING) หรือ repliedAt (AT_DESK) */
  since: string | null
}

export type DeskTableKind = DeskTarget['kind']

export type DeskTable = {
  /** `admin:<userId>` · `external` · `meta_ai` · `bot` */
  key: string
  kind: DeskTableKind
  userId: string | null
  name: string
  role: 'OWNER' | 'ADMIN' | null
  /** null = ตรวจสถานะไม่ได้ (presence ล่ม) หรือไม่ใช่แอดมิน */
  online: boolean | null
  canChat: boolean | null
  /** ≤ PER_DESK คนที่ยืนหน้าโต๊ะ */
  shown: DeskCustomer[]
  overflow: number
  total: number
}

export type DeskSummary = {
  /** n — null = presence ใช้ไม่ได้ (ห้ามแสดง 0/N) */
  online: number | null
  /** N — สมาชิกที่ canChat */
  chatters: number
  /** ว่างรับแชท = ออนไลน์ ∧ แชทในมือ 0 */
  free: number | null
  waiting: number
  overdue: number
  /** กำลังคุย = AT_DESK โต๊ะแอดมิน + ตอบนอก Deep (ไม่นับ Meta AI/บอท) */
  talking: number
  awaitingCapped: boolean
}

export type DeskView = {
  lounge: { seats: DeskCustomer[]; overflow: number; total: number }
  /** โต๊ะบนฉาก: แอดมิน ≤ MAX_SCENE_ADMIN_DESKS แล้วตามด้วยตอบนอก Deep / Meta AI / บอท */
  tables: DeskTable[]
  /** โต๊ะแอดมินที่เกินฉาก — แสดง "+N โต๊ะ" เปิดรายการ */
  hiddenAdminTables: DeskTable[]
  summary: DeskSummary
}

export type DeskPlace = { kind: 'LOUNGE' } | { kind: 'DESK'; key: string }

export type DeskEventType = 'ENTER' | 'TO_DESK' | 'TO_LOUNGE' | 'LEAVE'

/** key ของเหตุการณ์ = id ห้อง (กันซ้ำ) */
export type DeskEvent = {
  type: DeskEventType
  roomId: string
  room: DeskRoom
  from: DeskPlace | null
  to: DeskPlace | null
}

export type DeskCanvasProps = {
  view: DeskView
  shopName: string
  /** เหตุการณ์ที่เล่นอนิเมชัน (≤ MAX_ANIMATED_EVENTS) ที่เหลือวางทันที */
  events: DeskEvent[]
  /** ห้อง/โต๊ะที่เลือกอยู่ (ไฮไลต์) */
  selectedRoomId: string | null
  selectedTableKey: string | null
  hideNumbers: boolean
  reducedMotion: boolean
  /** แท็บซ่อน → frameloop='never' */
  paused: boolean
  onSelectRoom: (roomId: string) => void
  onSelectTable: (tableKey: string) => void
  onOpenLounge: () => void
  onOpenHiddenTables: () => void
}
