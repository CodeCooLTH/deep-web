/**
 * inbox-filter-pref.ts — SSOT ของ "ค่าเริ่มต้นของกล่องแชทที่ผู้ใช้บันทึกไว้"
 * (00018 ส่วนขยาย 2026-09-09 รอบสอง — ปุ่ม "บันทึกเป็นค่าเริ่มต้น" ในแผงตัวกรอง)
 *
 * user สั่งให้ปุ่มนี้จำ **ทุกอย่างในแผง**: การเรียง + ตัวกรองทั้งชุด + ช่องทาง + เพจ
 *
 * 🛑 ค่าเก็บเป็น JSONB ⇒ ฐานข้อมูลบังคับรูปร่างให้ไม่ได้เลย ด่านทั้งหมดอยู่ที่ไฟล์นี้ และต้อง
 * **fail-closed รายฟิลด์ ไม่ใช่ทั้งก้อน**: ตัวกรองของกล่องแชทงอกมาเรื่อย ๆ (tags/shipment/
 * readState เพิ่มทีหลังทั้งหมด) ค่าที่ผู้ใช้บันทึกไว้เมื่อ 3 เดือนก่อนจึงมีสิทธิ์ขาดคีย์ใหม่
 * หรือมีคีย์ที่ถูกถอดออกไปแล้วเสมอ — ตกทั้งก้อนเพราะคีย์เดียวไม่รู้จัก = ผู้ใช้เสียค่าที่ตั้งไว้
 * ทั้งชุดโดยไม่มีอะไรบอก
 *
 * ฟังก์ชันบริสุทธิ์ล้วน ไม่ import prisma — เหตุผลเดียวกับ inbox-sort.ts
 */
import {
  DEFAULT_CHAT_FILTER,
  type ChatFilterState,
  type ShipmentFilterValue,
} from '@/app/(paces)/seller/(chat)/inbox/components/chat-list-query'
import { parseInboxSortMode, DEFAULT_INBOX_SORT, type InboxSortMode } from '@/lib/inbox-sort'

/** ทุกอย่างที่แผงตัวกรองถืออยู่ — ตรงกับ state ที่ InboxList ส่งให้ InboxFilterPanel เป๊ะ */
export type InboxPreference = {
  sort: InboxSortMode
  filter: ChatFilterState
  /** แท็บช่องทาง: 'ALL' | 'DEEP' | 'MESSENGER' | 'INSTAGRAM' | 'LINE' */
  channelTab: string
  /** id ของ ShopChannel ที่เลือกในหัวข้อ "ช่องทาง" — '' = ทุกเพจ */
  pageFilter: string
}

export const DEFAULT_INBOX_PREFERENCE: InboxPreference = {
  sort: DEFAULT_INBOX_SORT,
  filter: DEFAULT_CHAT_FILTER,
  channelTab: 'ALL',
  pageFilter: '',
}

const STATUS_VALUES = ['open', 'resolved', 'all'] as const
const CUSTOMER_LINKED_VALUES = ['all', 'linked', 'unlinked'] as const
const READ_STATE_VALUES = ['all', 'unread', 'read'] as const
const SHIPMENT_VALUES = ['all', 'none', 'unprinted', 'printed', 'problem'] as const
const CHANNEL_TAB_VALUES = ['ALL', 'DEEP', 'MESSENGER', 'INSTAGRAM', 'LINE'] as const

function pick<T extends readonly string[]>(allowed: T, raw: unknown, fallback: T[number]): T[number] {
  return typeof raw === 'string' && (allowed as readonly string[]).includes(raw) ? (raw as T[number]) : fallback
}

function bool(raw: unknown, fallback: boolean): boolean {
  return typeof raw === 'boolean' ? raw : fallback
}

/**
 * แท็ก: จำกัดจำนวนและความยาวเหมือนด่านขาเข้าของ API (ChatConversationsQuerySchema)
 * ค่าที่บันทึกไว้เดินทางกลับเข้า query string ทุกครั้งที่โหลดหน้า ⇒ ต้องถูกจำกัดที่ขาอ่านด้วย
 * ไม่ใช่แค่ตอนเขียน (แถวเก่าที่เขียนไว้ก่อนมีด่าน หรือถูกแก้จากที่อื่น ยังต้องปลอดภัย)
 */
function tags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((t): t is string => typeof t === 'string')
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && t.length <= 40)
    .slice(0, 20)
}

export function parseInboxFilterPreference(rawFilter: unknown, rawSort: unknown): InboxPreference {
  const sort = parseInboxSortMode(rawSort)
  if (rawFilter === null || typeof rawFilter !== 'object' || Array.isArray(rawFilter)) {
    // ยังไม่เคยบันทึก (NULL) หรือค่าเสียหายทั้งก้อน — คงค่าตั้งต้นของหน้าจอไว้ แต่ยังเคารพ
    // โหมดเรียงที่เก็บอยู่คนละคอลัมน์ (ของเดิมจากรอบแรก ห้ามทิ้งไปด้วย)
    return { ...DEFAULT_INBOX_PREFERENCE, sort }
  }
  const o = rawFilter as Record<string, unknown>
  const f = (
    o.filter && typeof o.filter === 'object' && !Array.isArray(o.filter) ? o.filter : {}
  ) as Record<string, unknown>
  return {
    sort,
    filter: {
      status: pick(STATUS_VALUES, f.status, DEFAULT_CHAT_FILTER.status),
      spam: bool(f.spam, DEFAULT_CHAT_FILTER.spam),
      customerLinked: pick(CUSTOMER_LINKED_VALUES, f.customerLinked, DEFAULT_CHAT_FILTER.customerLinked),
      hidden: bool(f.hidden, DEFAULT_CHAT_FILTER.hidden),
      readState: pick(READ_STATE_VALUES, f.readState, DEFAULT_CHAT_FILTER.readState),
      tags: tags(f.tags),
      shipment: pick(SHIPMENT_VALUES, f.shipment, DEFAULT_CHAT_FILTER.shipment) as ShipmentFilterValue,
    },
    channelTab: pick(CHANNEL_TAB_VALUES, o.channelTab, CHANNEL_TAB_VALUES[0]),
    // pageFilter เป็น id ของ ShopChannel — ตรวจรูปร่างได้แค่ "เป็นสตริงสั้น ๆ" เท่านั้น
    // ความถูกต้องจริง (เพจนี้ยังอยู่ในร้านนี้ไหม) ตรวจที่นี่ไม่ได้ และไม่จำเป็น: service กรอง
    // ด้วย shopChannelId ที่ scope ด้วย shopId อยู่แล้ว เพจที่ถูกถอดไปแล้วจะได้รายการว่าง
    // ไม่ใช่ข้อมูลของร้านอื่น (BR-UNI-02)
    pageFilter: typeof o.pageFilter === 'string' && o.pageFilter.length <= 64 ? o.pageFilter : '',
  }
}

/** รูปร่างที่เขียนลงคอลัมน์ JSONB — เก็บเฉพาะ 3 คีย์นี้ (`sort` อยู่คอลัมน์ของตัวเอง) */
export function serializeInboxFilterPreference(pref: InboxPreference) {
  return { filter: pref.filter, channelTab: pref.channelTab, pageFilter: pref.pageFilter }
}

/**
 * ค่าที่บันทึกไว้ต่างจากค่าที่กำลังใช้อยู่ไหม — ใช้ตัดสินว่าปุ่ม "บันทึกเป็นค่าเริ่มต้น"
 * ควรกดได้ไหม (ไม่มีอะไรเปลี่ยน = ปุ่มไม่ควรชวนให้กด)
 *
 * เทียบ `tags` แบบไม่สนลำดับ — ผู้ใช้กดแท็กสลับลำดับได้โดยเจตนาเดียวกัน
 */
export function isSameInboxPreference(a: InboxPreference, b: InboxPreference): boolean {
  return (
    a.sort === b.sort &&
    a.channelTab === b.channelTab &&
    a.pageFilter === b.pageFilter &&
    a.filter.status === b.filter.status &&
    a.filter.spam === b.filter.spam &&
    a.filter.customerLinked === b.filter.customerLinked &&
    a.filter.hidden === b.filter.hidden &&
    a.filter.readState === b.filter.readState &&
    a.filter.shipment === b.filter.shipment &&
    a.filter.tags.length === b.filter.tags.length &&
    [...a.filter.tags].sort().join(' ') === [...b.filter.tags].sort().join(' ')
  )
}

/**
 * แปลงค่าเริ่มต้นที่บันทึกไว้ → options ของ `listConversationsForShops`
 *
 * 🛑 ต้องมีตัวเดียวและใช้ร่วมกันทั้ง SSR และ route — invariant "ชุดแรกที่ผู้ใช้เห็นต้องตรงกับ
 * ตัวกรองที่หน้าจอไฮไลต์อยู่" เคยพังมาแล้ว 2 รอบเพราะการประกอบ option ชุดนี้ถูกเขียนซ้ำหลายที่
 * (ดูหัวไฟล์ chat-list-query.ts) — ที่นั่นแก้ฝั่ง query string ไปแล้ว ตัวนี้คือฝั่ง service
 *
 * ค่าที่ "เท่ากับค่าตั้งต้นของ service อยู่แล้ว" ส่งเป็น undefined ไม่ใช่ส่งค่าไปตรง ๆ เพื่อให้
 * เส้นทางของผู้ใช้ที่ไม่เคยบันทึกอะไร เหมือนก่อนมีฟีเจอร์นี้ทุกประการ
 */
export function inboxPreferenceToListOptions(pref: InboxPreference) {
  const f = pref.filter
  return {
    sort: pref.sort,
    status: f.status,
    spam: f.spam,
    hidden: f.hidden,
    customerLinked: f.customerLinked,
    channel: pref.channelTab === 'ALL' ? undefined : pref.channelTab,
    shopChannelId: pref.pageFilter || undefined,
    readState: f.readState === 'all' ? undefined : f.readState,
    tags: f.tags.length > 0 ? f.tags : undefined,
    shipment: f.shipment === 'all' ? undefined : f.shipment,
  }
}
