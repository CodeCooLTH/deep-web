/**
 * list-view — ตัดสินสิ่งที่หน้ารายการกลุ่ม LINE แสดง (00070 · addendum E §1) · pure
 *
 * ทำไมอยู่ใน lib: ลำดับแถว/เหตุที่เพิ่มกลุ่มไม่ได้/ข้อความ "ส่งถัดไป-ล่าสุด" เป็นสิ่งที่ตัดสินหน้าจอ
 * ต้องมีที่ให้เทสจับ (convention `ui-boolean-needs-a-testable-home`) · ป้ายสถานะมาจาก presenter ไม่ทำซ้ำที่นี่
 * `now` รับเข้ามาเสมอ — ห้ามอ่านนาฬิกาเอง (เทสกำหนดเวลาได้ + RSC ไม่ผูกกับ hydration)
 */
import { formatDayMonthTH, formatTimeHM, isSameBangkokDay } from '@/lib/format-date'
import { isExpired } from '@/lib/line-report/countdown'
import type { Tone } from '@/lib/line-report/presenter'
import type { LineReportGroupStatus } from '@/lib/line-report/types'

/** รูปที่ `listGroups()` คืน (เฉพาะ field ที่หน้านี้ใช้) */
export type ListGroupItem = {
  id: string
  groupName: string
  status: Extract<LineReportGroupStatus, 'PENDING' | 'ACTIVE' | 'INACTIVE'>
  paused: boolean
  shopCount: number
  mixedVertical: boolean
  shops: { id: string; name: string; vertical: string | null }[]
  nextSendAt: string | null
  lastDelivery: { at: string; kind: string; status: string } | null
  alert: { kind: string; at: string | null; acked: boolean } | null
  bind: { codeExpiresAt: string | null }
}

/** ชื่อแทนของกลุ่ม PENDING ที่ยังไม่เคยรู้ชื่อกลุ่ม LINE (groupName = '') — ใช้ร่วมรายการและหัวหน้ากลุ่ม */
export const PENDING_GROUP_FALLBACK_NAME = 'กลุ่มที่รอผูก'

export type ListMeta = { count: number; limit: number; canCreate: boolean; paused: boolean; botReady: boolean; unackedAlerts: number }

/** มีปัญหา (0) → รอผูก (1) → ปกติ (2) · ในชั้นเดียวกันเรียงเวลาส่งถัดไปใกล้สุดก่อน (ไม่มีเวลา = ท้ายชั้น) · เสมอกัน = คงลำดับเดิม */
function rank(g: ListGroupItem): number {
  if (g.status === 'INACTIVE' || (g.alert && !g.alert.acked)) return 0
  return g.status === 'PENDING' ? 1 : 2
}
export function sortGroups<T extends ListGroupItem>(groups: readonly T[]): T[] {
  const t = (g: T) => (g.nextSendAt ? Date.parse(g.nextSendAt) : Number.POSITIVE_INFINITY)
  return groups
    .map((g, i) => ({ g, i }))
    .sort((a, b) => rank(a.g) - rank(b.g) || (t(a.g) === t(b.g) ? 0 : t(a.g) < t(b.g) ? -1 : 1) || a.i - b.i)
    .map((x) => x.g)
}

/** เหตุที่ปุ่ม "เพิ่มกลุ่ม" กดไม่ได้ (null = กดได้) · เลือกประโยคเดียว: แพ็กเกจหยุด > บอทไม่พร้อม > ครบเพดาน */
export function createBlockedReason(meta: Pick<ListMeta, 'canCreate' | 'paused' | 'botReady' | 'count' | 'limit'>): string | null {
  if (meta.canCreate) return null
  if (meta.paused) return 'เพิ่มกลุ่มใหม่ได้เมื่อแพ็กเกจกลับมาใช้งาน'
  if (!meta.botReady) return 'ฟีเจอร์ยังไม่พร้อมใช้งาน'
  if (meta.count >= meta.limit) return `ครบ ${meta.limit} กลุ่มแล้ว ยกเลิกการผูกกลุ่มที่ไม่ได้ใช้ก่อน แล้วค่อยเพิ่มกลุ่มใหม่`
  return 'เพิ่มกลุ่มใหม่ไม่ได้ในขณะนี้'
}

/** "วันนี้ 18:00" · "เมื่อวาน 09:00" (เฉพาะ allowYesterday) · อื่น ๆ "6 ต.ค. 00:00" — เทียบวันตามปฏิทินไทย */
function whenText(iso: string, now: Date, allowYesterday: boolean): string {
  const hm = formatTimeHM(iso)
  if (isSameBangkokDay(iso, now)) return `วันนี้ ${hm}`
  if (allowYesterday && isSameBangkokDay(iso, new Date(now.getTime() - 24 * 60 * 60 * 1000))) return `เมื่อวาน ${hm}`
  return `${formatDayMonthTH(iso)} ${hm}`
}

export type StatusLine = { kind: 'text'; text: string } | { kind: 'countdown'; expiresAt: string }

/** บรรทัดใต้ป้ายสถานะ — ลำดับตามป้ายของ presenter: แพ็กเกจหยุด > บอทถูกนำออก > รอผูก > ผูกแล้ว */
export function statusLine(g: ListGroupItem, now: Date): StatusLine {
  if (g.paused) return { kind: 'text', text: 'รายงานหยุดส่งไว้ก่อน จนกว่าแพ็กเกจจะกลับมาใช้งาน' }
  if (g.status === 'INACTIVE') return { kind: 'text', text: 'เชิญบอทกลับเข้ากลุ่ม แล้วกดผูกใหม่' }
  if (g.status === 'PENDING') {
    const exp = g.bind.codeExpiresAt
    return exp && !isExpired(exp, now.getTime())
      ? { kind: 'countdown', expiresAt: exp }
      : { kind: 'text', text: 'รอผูก · โค้ดหมดอายุ ต้องสร้างโค้ดใหม่' }
  }
  return { kind: 'text', text: g.nextSendAt ? `ส่งถัดไป ${whenText(g.nextSendAt, now, false)}` : 'ยังไม่ได้ตั้งเวลาส่ง' }
}

export type DeliveryView = { label: string; icon: string; tone: Tone }

/** ผลการส่ง → ป้าย/ไอคอน/โทน (addendum §7) · เขียว = ส่งสำเร็จเท่านั้น · แดง = ส่งล้มจริง */
const DELIVERY_STATUS: Record<string, DeliveryView> = {
  SENT: { label: 'ส่งสำเร็จ', icon: 'circle-check', tone: 'success' },
  FAILED: { label: 'ส่งไม่สำเร็จ', icon: 'circle-x', tone: 'danger' },
  REPLY_FAILED: { label: 'ส่งไม่สำเร็จ', icon: 'circle-x', tone: 'danger' },
  SKIPPED_NO_ORDERS: { label: 'ข้าม', icon: 'info-circle', tone: 'neutral' },
  MISSED: { label: 'พลาดรอบ', icon: 'info-circle', tone: 'neutral' },
  RETRY_PENDING: { label: 'รอลองใหม่', icon: 'clock', tone: 'warning' },
  CLAIMED: { label: 'กำลังส่ง', icon: 'clock', tone: 'neutral' },
  NO_SENDABLE_SHOPS: { label: 'ร้านถูกล็อก', icon: 'lock', tone: 'warning' },
}
export function deliveryStatusView(status: string): DeliveryView {
  return DELIVERY_STATUS[status] ?? { label: '-', icon: 'info-circle', tone: 'neutral' }
}

const DELIVERY_KIND: Record<string, string> = {
  DAILY: 'รายวัน',
  MONTHLY: 'รายเดือน',
  TEST: 'ทดสอบ',
  COMMAND: 'คำสั่งในกลุ่ม',
  FINAL_NOTICE: 'แจ้งหยุดส่ง',
}
export const deliveryKindLabel = (kind: string): string => DELIVERY_KIND[kind] ?? kind

/** "ล่าสุด {when} · {ผล}" — null = ยังไม่เคยส่ง */
export function lastDeliveryView(last: ListGroupItem['lastDelivery'], now: Date): (DeliveryView & { when: string }) | null {
  if (!last) return null
  return { ...deliveryStatusView(last.status), when: whenText(last.at, now, true) }
}

export const groupKindLabel = (shopCount: number): string => (shopCount > 1 ? `กลุ่มรวม ${shopCount} ร้าน` : 'กลุ่มสาขา')

/** ส่วน "ข้าม: …" ของ Delivery.summary (ต่อท้ายด้วย ` · ข้าม: ` โดย line-report-send.service) — ไม่มี = null */
const SKIP_MARK = ' · ข้าม: '
export function skippedPart(summary: string | null | undefined): string | null {
  const i = summary ? summary.indexOf(SKIP_MARK) : -1
  return i < 0 ? null : (summary as string).slice(i + SKIP_MARK.length).trim() || null
}

/** บรรทัดสาเหตุของประวัติ: สาเหตุเดิม + "ข้าม: …" — ว่างทั้งคู่ = '' */
export function historyReasonText(reasonLabel: string | null | undefined, summary: string | null | undefined): string {
  const skip = skippedPart(summary)
  return [reasonLabel, skip ? `ข้าม: ${skip}` : null].filter(Boolean).join(' · ')
}
