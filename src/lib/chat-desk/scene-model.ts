// แปลง DeskSnapshot → โมเดลฉาก/2D (pure ไม่อ่านเวลาเอง ไม่ import three) · client-safe
import { DESK_LABELS, LOUNGE_SEATS, MAX_ANIMATED_EVENTS, MAX_SCENE_ADMIN_DESKS, PER_DESK } from './constants'
import { roomMatchesFilters } from './filters'
import { isOverdue, roomAskedAt } from './rules'
import type {
  DeskCustomer, DeskEvent, DeskFilters, DeskMember, DeskPlace, DeskRoom, DeskSnapshot, DeskSummary, DeskTable,
  DeskTarget, DeskView,
} from './types'

export const deskKeyOf = (t: DeskTarget): string =>
  t.kind === 'ADMIN' ? `admin:${t.userId}` : t.kind === 'EXTERNAL' ? 'external' : t.kind === 'META_AI' ? 'meta_ai' : 'bot'

/** ≤ perDesk คนยืนหน้าโต๊ะ ที่เหลือเป็น "+N" — ผู้เรียกเรียงลำดับมาแล้ว */
export function layoutDesk<T>(customers: readonly T[], perDesk = PER_DESK): { shown: T[]; overflow: number } {
  return { shown: customers.slice(0, perDesk), overflow: Math.max(0, customers.length - perDesk) }
}

/** เลานจ์ 24 ที่นั่ง ที่เหลือเป็นตัวเลข (BR-CD-32) */
export function layoutLounge<T>(customers: readonly T[], seats = LOUNGE_SEATS): { seats: T[]; overflow: number } {
  return { seats: customers.slice(0, seats), overflow: Math.max(0, customers.length - seats) }
}

const toCustomer = (r: DeskRoom, now: number, slaSec: number): DeskCustomer => {
  const asked = roomAskedAt(r)
  const overdue = r.state === 'WAITING' && isOverdue(asked === null ? null : Date.parse(asked), now, slaSec)
  return {
    id: r.id, name: r.name, platform: r.platform, pageId: r.pageId,
    status: r.state === 'AT_DESK' ? 'RECENT' : overdue ? 'OVERDUE' : 'WAITING',
    since: r.state === 'AT_DESK' ? r.repliedAt : asked,
  }
}

export type SummaryInput = {
  members: readonly DeskMember[]
  rooms: readonly DeskRoom[]
  /** null = presence ใช้ไม่ได้ → ออนไลน์/ว่าง เป็น null (ห้ามแสดง 0/N) */
  onlineKeys: ReadonlySet<string> | null
  now: number
  slaSec: number
  awaitingCapped?: boolean
}

export function summarizeDesk(p: SummaryInput): DeskSummary {
  const chatters = p.members.filter((m) => m.canChat)
  const hands = new Map<string, number>()
  let talking = 0
  let waiting = 0
  let overdue = 0
  for (const r of p.rooms) {
    if (r.state === 'WAITING') {
      waiting++
      const a = roomAskedAt(r)
      if (isOverdue(a === null ? null : Date.parse(a), p.now, p.slaSec)) overdue++
    } else if (r.desk?.kind === 'ADMIN') {
      talking++
      hands.set(r.desk.userId, (hands.get(r.desk.userId) ?? 0) + 1)
    } else if (r.desk?.kind === 'EXTERNAL') talking++
  }
  const online = p.onlineKeys ? chatters.filter((m) => p.onlineKeys!.has(m.presenceKey)) : null
  return {
    online: online ? online.length : null,
    chatters: chatters.length,
    free: online ? online.filter((m) => !hands.get(m.userId)).length : null,
    waiting, overdue, talking,
    awaitingCapped: p.awaitingCapped ?? false,
  }
}

const byAsked = (a: DeskRoom, b: DeskRoom) =>
  (Date.parse(roomAskedAt(a) ?? '') || Infinity) - (Date.parse(roomAskedAt(b) ?? '') || Infinity)
const byReplied = (a: DeskRoom, b: DeskRoom) => (Date.parse(b.repliedAt ?? '') || 0) - (Date.parse(a.repliedAt ?? '') || 0)

export type BuildDeskViewInput = {
  snapshot: DeskSnapshot
  filters: DeskFilters
  onlineKeys: ReadonlySet<string> | null
  /** เวลาปัจจุบันที่ชดเชย skew กับ serverNow แล้ว */
  now: number
}

export function buildDeskView({ snapshot, filters, onlineKeys, now }: BuildDeskViewInput): DeskView {
  const slaSec = snapshot.sla.firstResponseSec
  const rooms = snapshot.rooms.filter((r) => roomMatchesFilters(r, filters))
  const members = filters.admins.length ? snapshot.members.filter((m) => filters.admins.includes(m.userId)) : snapshot.members

  const waiting = rooms.filter((r) => r.state === 'WAITING').sort(byAsked)
  const lounge = layoutLounge(waiting.map((r) => toCustomer(r, now, slaSec)))

  const atDesk = new Map<string, DeskRoom[]>()
  for (const r of rooms) {
    if (r.state !== 'AT_DESK' || !r.desk) continue
    const k = deskKeyOf(r.desk)
    atDesk.set(k, [...(atDesk.get(k) ?? []), r])
  }
  const make = (base: Pick<DeskTable, 'key' | 'kind' | 'userId' | 'name' | 'role'> & { m?: DeskMember }): DeskTable => {
    const list = (atDesk.get(base.key) ?? []).sort(byReplied)
    const { shown, overflow } = layoutDesk(list.map((r) => toCustomer(r, now, slaSec)))
    return {
      key: base.key, kind: base.kind, userId: base.userId, name: base.name, role: base.role,
      online: base.m && onlineKeys ? onlineKeys.has(base.m.presenceKey) : null,
      canChat: base.m ? base.m.canChat : null,
      shown, overflow, total: list.length,
    }
  }
  // โต๊ะที่มีลูกค้ายืนก่อน แล้วคนออนไลน์ แล้วชื่อ — ไม่ให้ลูกค้าหายไปอยู่หลัง "+N โต๊ะ"
  const admin = members
    .map((m) => make({ key: `admin:${m.userId}`, kind: 'ADMIN', userId: m.userId, name: m.name, role: m.role, m }))
    .sort((a, b) => Number(b.total > 0) - Number(a.total > 0) || Number(!!b.online) - Number(!!a.online) || a.name.localeCompare(b.name, 'th'))
  const others = [
    make({ key: 'external', kind: 'EXTERNAL', userId: null, name: DESK_LABELS.EXTERNAL, role: null }),
    make({ key: 'meta_ai', kind: 'META_AI', userId: null, name: DESK_LABELS.META_AI, role: null }),
    make({ key: 'bot', kind: 'BOT', userId: null, name: DESK_LABELS.BOT, role: null }),
  ].filter((t) => t.kind === 'EXTERNAL' || t.total > 0)

  return {
    lounge: { seats: lounge.seats, overflow: lounge.overflow, total: waiting.length },
    tables: [...admin.slice(0, MAX_SCENE_ADMIN_DESKS), ...others],
    hiddenAdminTables: admin.slice(MAX_SCENE_ADMIN_DESKS),
    summary: summarizeDesk({ members, rooms, onlineKeys, now, slaSec, awaitingCapped: snapshot.awaiting.capped }),
  }
}

const placeOf = (r: DeskRoom): DeskPlace =>
  r.state === 'WAITING' || !r.desk ? { kind: 'LOUNGE' } : { kind: 'DESK', key: deskKeyOf(r.desk) }
const samePlace = (a: DeskPlace, b: DeskPlace) => a.kind === b.kind && (a.kind === 'LOUNGE' || (b.kind === 'DESK' && a.key === b.key))

/**
 * เทียบ snapshot ต่อห้อง (key = room id) · prev=null (snapshot แรก) = [] วางตำแหน่งทันที
 * ⚠ เปลี่ยนตัวกรอง = ผู้เรียกต้องรีเซ็ต prev เป็น null เอง ไม่งั้นห้องที่โผล่/หายจากตัวกรองกลายเป็นเหตุการณ์
 */
export function diffSnapshots(prev: DeskSnapshot | null, next: DeskSnapshot): DeskEvent[] {
  if (!prev) return []
  const before = new Map(prev.rooms.map((r) => [r.id, r]))
  const events: DeskEvent[] = []
  const seen = new Set<string>()
  for (const r of next.rooms) {
    seen.add(r.id)
    const old = before.get(r.id)
    const to = placeOf(r)
    if (!old) {
      events.push({ type: 'ENTER', roomId: r.id, room: r, from: null, to })
      continue
    }
    const from = placeOf(old)
    if (samePlace(from, to)) continue
    events.push({ type: to.kind === 'LOUNGE' ? 'TO_LOUNGE' : 'TO_DESK', roomId: r.id, room: r, from, to })
  }
  for (const old of prev.rooms) {
    if (!seen.has(old.id)) events.push({ type: 'LEAVE', roomId: old.id, room: old, from: placeOf(old), to: null })
  }
  return events
}

/** เล่นอนิเมชันไม่เกิน max รายการ ที่เหลือวางตำแหน่งทันที (AC-CD-37) */
export function splitEvents(events: readonly DeskEvent[], max = MAX_ANIMATED_EVENTS) {
  return { animate: events.slice(0, max), settle: events.slice(max) }
}
