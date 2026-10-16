// ตัวกรองหน้าโต๊ะแชทใน URL (FR-CD-15) — ค่าผิดรูปถูกทิ้งเงียบ ไม่ throw (URL มาจากใครก็ได้) · client-safe
import * as v from 'valibot'
import { MAX_FILTER_IDS, PLATFORMS } from './constants'
import type { DeskFilters, DeskPlatform, DeskRoom } from './types'

export const EMPTY_FILTERS: DeskFilters = { platforms: [], pages: [], admins: [] }

const uuidSchema = v.pipe(v.string(), v.uuid())
const platformSchema = v.picklist(PLATFORMS)
// รับ string | string[] | undefined (searchParams ของ Next)
const rawSchema = v.optional(v.union([v.string(), v.array(v.string())]))

const csv = (raw: unknown): string[] => {
  const r = v.safeParse(rawSchema, raw)
  if (!r.success || r.output === undefined) return []
  const s = Array.isArray(r.output) ? r.output.join(',') : r.output
  return s.split(',').map((x) => x.trim()).filter(Boolean)
}
const uniq = <T>(a: T[]) => [...new Set(a)]

export type DeskFilterInput = Record<string, string | string[] | undefined> | URLSearchParams

export function parseDeskFilters(input: DeskFilterInput): DeskFilters {
  const get = (k: string) => (input instanceof URLSearchParams ? input.get(k) ?? undefined : input[k])
  const ids = (k: string) =>
    uniq(csv(get(k)).filter((x) => v.is(uuidSchema, x))).slice(0, MAX_FILTER_IDS)
  return {
    platforms: uniq(csv(get('platforms')).filter((x): x is DeskPlatform => v.is(platformSchema, x))),
    pages: ids('pages'),
    admins: ids('admins'),
  }
}

/** ทิ้ง id ที่ไม่ได้อยู่ในร้านนี้ — ทิ้งหมด = ไม่กรอง (SDS TD-15) */
export function sanitizeDeskFilters(
  f: DeskFilters,
  known: { channelIds: Iterable<string>; memberIds: Iterable<string> },
): DeskFilters {
  const ch = new Set(known.channelIds)
  const mem = new Set(known.memberIds)
  return {
    platforms: f.platforms,
    pages: f.pages.filter((x) => ch.has(x)),
    admins: f.admins.filter((x) => mem.has(x)),
  }
}

/** คืนเฉพาะคีย์ที่มีค่า (CSV) — ผู้เรียกผสมกับ shop/view เอง */
export function serializeDeskFilters(f: DeskFilters): Record<string, string> {
  const out: Record<string, string> = {}
  if (f.platforms.length) out.platforms = f.platforms.join(',')
  if (f.pages.length) out.pages = f.pages.join(',')
  if (f.admins.length) out.admins = f.admins.join(',')
  return out
}

/**
 * แพลตฟอร์ม/เพจ กรองทุกห้อง · แอดมินกรองเฉพาะห้องหน้าโต๊ะแอดมิน — เลานจ์ไม่ใช่ของใคร จึงไม่ถูกกรองด้วยแอดมิน (S-10)
 * โต๊ะที่ไม่ใช่แอดมิน (ตอบนอก Deep/Meta AI/บอท) ก็ไม่ถูกกรองด้วยแอดมินเช่นกัน
 */
export function roomMatchesFilters(room: Pick<DeskRoom, 'platform' | 'pageId' | 'state' | 'desk'>, f: DeskFilters): boolean {
  if (f.platforms.length && !f.platforms.includes(room.platform)) return false
  if (f.pages.length && !(room.pageId && f.pages.includes(room.pageId))) return false
  if (f.admins.length && room.state === 'AT_DESK' && room.desk?.kind === 'ADMIN') {
    return f.admins.includes(room.desk.userId)
  }
  return true
}
