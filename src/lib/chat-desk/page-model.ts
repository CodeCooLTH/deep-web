// โมเดลฝั่งหน้า "โต๊ะแชท" (00077) — pure ไม่แตะ DOM/เวลา · client-safe
// ทำไมแยกไฟล์: ค่าที่ตัดสินสิ่งที่ผู้ใช้เห็น (ความสด/ฟีด/สัดส่วนช่องทาง) ต้องมีเทส (ui-boolean-needs-a-testable-home)
import { DESK_LABELS, FEED_MAX } from './constants'
import { roomMatchesFilters } from './filters'
import { byAsked, byReplied, deskKeyOf, toCustomer } from './scene-model'
import type { DeskCustomer, DeskEvent, DeskFilters, DeskPlatform, DeskSnapshot } from './types'

export type Freshness = 'ok' | 'old' | 'lost'

/** ข้อมูลเก่า > 30 วินาที · เชื่อมต่อไม่ได้ > 60 วินาที (Design Spec การ์ด ①) — ขอบเขตเป็น `>` ไม่ใช่ `>=` */
export function freshnessOf(ageSec: number): Freshness {
  if (ageSec > 60) return 'lost'
  if (ageSec > 30) return 'old'
  return 'ok'
}

/** จำนวนกลุ่มตัวกรองที่ถูกใช้ (ไม่ใช่จำนวนค่า) — ตัวเลขบน badge ปุ่มตัวกรอง ตามแนว InboxFilterPanel */
export function countActiveFilterGroups(f: DeskFilters): number {
  return Number(f.platforms.length > 0) + Number(f.pages.length > 0) + Number(f.admins.length > 0)
}

export type ActivityKind = 'ENTER_LOUNGE' | 'TO_DESK' | 'LEAVE'
export type ActivityItem = { key: string; kind: ActivityKind; roomId: string; name: string; deskName: string | null; at: number }

const deskNameOf = (key: string, snapshot: DeskSnapshot): string => {
  if (key === 'external') return DESK_LABELS.EXTERNAL
  if (key === 'meta_ai') return DESK_LABELS.META_AI
  if (key === 'bot') return DESK_LABELS.BOT
  const id = key.replace(/^admin:/, '')
  return snapshot.members.find((m) => m.userId === id)?.name ?? DESK_LABELS.EXTERNAL
}

/**
 * เหตุการณ์จาก diffSnapshots → แถวฟีด "ความเคลื่อนไหวล่าสุด" (ล่าสุดบน)
 * ปลายทางเลานจ์ (ลูกค้าใหม่/ทักกลับ) = "เข้ามารอคำตอบ" · ปลายทางโต๊ะ = "ไปที่โต๊ะ X" · หายไป = "ออกจากฉาก" (ห้ามใช้คำว่าปิดงาน BR-CD-26)
 */
export function eventsToActivity(events: readonly DeskEvent[], snapshot: DeskSnapshot): ActivityItem[] {
  return events
    .map((e): ActivityItem => {
      const to = e.to
      const kind: ActivityKind = e.type === 'LEAVE' || !to ? 'LEAVE' : to.kind === 'DESK' ? 'TO_DESK' : 'ENTER_LOUNGE'
      return {
        key: `${e.roomId}:${e.type}:${snapshot.serverNow}`,
        kind,
        roomId: e.roomId,
        name: e.room.name,
        deskName: to && to.kind === 'DESK' ? deskNameOf(to.key, snapshot) : null,
        at: snapshot.serverNow,
      }
    })
    .reverse()
}

/** ต่อแถวใหม่หน้าฟีด · ตัดที่ FEED_MAX */
export const prependActivity = (prev: readonly ActivityItem[], next: readonly ActivityItem[]): ActivityItem[] =>
  [...next, ...prev].slice(0, FEED_MAX)

export type DeskRoomLists = {
  /** เลานจ์ เรียงรอนานสุดก่อน */
  lounge: DeskCustomer[]
  /** key โต๊ะ → ลูกค้าทุกคนที่โต๊ะนั้น (ไม่ตัดที่ PER_DESK — โหมดรายการต้องครบ AC-CD-45) */
  byTable: Record<string, DeskCustomer[]>
  byId: Map<string, DeskCustomer>
  /** ห้องบนฉากทั้งหมดหลังกรอง (รอ + เพิ่งตอบ) */
  all: DeskCustomer[]
}

export function listDeskRooms(snapshot: DeskSnapshot, filters: DeskFilters, now: number): DeskRoomLists {
  const slaSec = snapshot.sla.firstResponseSec
  const rooms = snapshot.rooms.filter((r) => roomMatchesFilters(r, filters))
  const lounge = rooms.filter((r) => r.state === 'WAITING').sort(byAsked).map((r) => toCustomer(r, now, slaSec))
  const byTable: Record<string, DeskCustomer[]> = {}
  for (const r of rooms.filter((x) => x.state === 'AT_DESK' && x.desk).sort(byReplied)) {
    const k = deskKeyOf(r.desk!)
    ;(byTable[k] ??= []).push(toCustomer(r, now, slaSec))
  }
  const all = [...lounge, ...Object.values(byTable).flat()]
  return { lounge, byTable, byId: new Map(all.map((c) => [c.id, c])), all }
}

export type ChannelMixRow = { platform: DeskPlatform; count: number; pct: number }

/** สัดส่วนต่อช่องทางของห้องบนฉาก — ช่องทางที่ไม่มีห้องไม่มีแถว · เรียงมากไปน้อย (เท่ากัน = ตามชื่อช่องทาง เพื่อไม่ให้ลำดับสลับทุกรอบ) */
export function channelMix(customers: readonly DeskCustomer[]): ChannelMixRow[] {
  const n = new Map<DeskPlatform, number>()
  for (const c of customers) n.set(c.platform, (n.get(c.platform) ?? 0) + 1)
  return [...n.entries()]
    .map(([platform, count]) => ({ platform, count, pct: Math.round((count / customers.length) * 100) }))
    .sort((a, b) => b.count - a.count || a.platform.localeCompare(b.platform))
}

/** ตัวเลขจำนวนเต็มคั่นหลักพัน */
export const fmtInt = (n: number): string => n.toLocaleString('en-US')
