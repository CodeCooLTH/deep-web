// กฎตัดสินห้อง/โต๊ะ (BR-CD-01..10) — pure ไม่แตะ DB · client-safe
import { thaiTodayBounds } from '@/lib/date-range'
import { isSystemNoticeKind } from '@/lib/auto-reply-constants'
import { AWAITING_WINDOW_DAYS, MOBILE_BREAKPOINT_PX, RECENT_REPLY_WINDOW_SEC } from './constants'
import type { DeskRoom, DeskTarget, DeskViewMode, RoomClass } from './types'

type TimeLike = Date | number
const ms = (t: TimeLike) => (typeof t === 'number' ? t : t.getTime())

export type ClassifyInput = {
  resolvedAt: TimeLike | null
  isHidden: boolean
  isSpam: boolean
  lastSenderRole: 'BUYER' | 'SHOP' | null
  lastInboundAt: TimeLike | null
  /** เวลาข้อความฝั่งร้านล่าสุดที่ไม่ใช่บรรทัดระบบและไม่ถูกลบ (BR-CD-03/04) */
  lastShopMessageAt: TimeLike | null
}

/**
 * WAITING (เลานจ์) ถูกตรวจก่อน AT_DESK เสมอ (BR-CD-08): ข้อความล่าสุดเป็นลูกค้า = ยังไม่ถูกตอบ
 * ขอบเขตเป็น inclusive ทั้งคู่ (ภายใน 7 วัน / ภายใน 180 วินาที)
 */
export function classifyRoom(c: ClassifyInput, now: TimeLike): RoomClass {
  if (c.resolvedAt !== null || c.isHidden || c.isSpam) return 'NONE'
  const n = ms(now)
  if (c.lastSenderRole === 'BUYER') {
    if (c.lastInboundAt === null) return 'NONE'
    return n - ms(c.lastInboundAt) <= AWAITING_WINDOW_DAYS * 86_400_000 ? 'WAITING' : 'NONE'
  }
  if (c.lastSenderRole === 'SHOP' && c.lastShopMessageAt !== null) {
    return n - ms(c.lastShopMessageAt) <= RECENT_REPLY_WINDOW_SEC * 1000 ? 'AT_DESK' : 'NONE'
  }
  return 'NONE'
}

export type PickDeskInput = {
  autoReplyKind: string | null
  viaStandby: boolean
  senderUserId: string | null
}

/** ลำดับตัดสินโต๊ะ BOT > META_AI > ADMIN > EXTERNAL (BR-CD-06) — เปลี่ยนลำดับ = ลูกค้าไปผิดโต๊ะ */
export function pickDesk(m: PickDeskInput, memberIds: ReadonlySet<string> | readonly string[]): DeskTarget {
  // AUTO_NOTICE = ข้อความระบบแจ้ง ไม่ใช่บอทตอบแชท (00078 S-10) — ไม่นับโต๊ะบอท
  if (m.autoReplyKind && !isSystemNoticeKind(m.autoReplyKind)) return { kind: 'BOT' }
  if (m.viaStandby) return { kind: 'META_AI' }
  const isMember = (id: string) => (Array.isArray(memberIds) ? memberIds.includes(id) : (memberIds as ReadonlySet<string>).has(id))
  if (m.senderUserId && isMember(m.senderUserId)) return { kind: 'ADMIN', userId: m.senderUserId }
  return { kind: 'EXTERNAL' }
}

/** เกินเวลาตอบ = รอนานกว่า SLA เข้มงวด (`>` ไม่ใช่ `>=`) · ไม่มี askedAt = ไม่ตัดสินว่าเกิน */
export function isOverdue(askedAt: TimeLike | null, now: TimeLike, slaSec: number): boolean {
  if (askedAt === null) return false
  return (ms(now) - ms(askedAt)) / 1000 > slaSec
}

/** askedAt ว่างเพราะลูกค้าลบข้อความ (KL-1) → ใช้ lastInboundAt แทน */
export function roomAskedAt(r: Pick<DeskRoom, 'askedAt' | 'lastInboundAt'>): string | null {
  return r.askedAt ?? r.lastInboundAt
}

/** 00:00 เวลาไทยของวันที่ `now` — wrapper ของนิยามเดียวทั้งระบบ (`thaiTodayBounds`) ห้ามตัดวันเอง */
export function startOfBangkokDay(now: TimeLike): Date {
  return thaiTodayBounds(new Date(ms(now))).from
}

/** ข้อความที่แสดงในกล่องแชทอ่านอย่างเดียว (ไม่มี URL ไฟล์/รูป) */
export function previewBodyLabel(type: string, body: string | null, isDeleted: boolean): string {
  if (isDeleted) return 'ข้อความถูกลบ'
  if (type === 'TEXT') return body ?? ''
  const label: Record<string, string> = {
    IMAGE: 'ส่งรูปภาพ',
    VIDEO: 'ส่งวิดีโอ',
    AUDIO: 'ส่งเสียง',
    FILE: 'ส่งไฟล์',
    PRODUCT: 'ส่งการ์ดสินค้า',
    ORDER: 'ส่งการ์ดออเดอร์',
  }
  return label[type] ?? (body ? body : 'ข้อความ')
}

/** มุมมองตั้งต้น: ไม่มี WebGL → 2D เสมอ · ผู้ใช้เลือกใน URL ชนะความกว้าง · มือถือ (<768px) → 2D */
export function resolveInitialView(width: number, hasWebGL = true, urlView?: string | null): DeskViewMode {
  if (!hasWebGL) return '2d'
  if (urlView === '2d' || urlView === '3d') return urlView
  return width < MOBILE_BREAKPOINT_PX ? '2d' : '3d'
}
