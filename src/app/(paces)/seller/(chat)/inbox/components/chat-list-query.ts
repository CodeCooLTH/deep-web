/**
 * chat-list-query — ค่าเริ่มต้นของตัวกรองรายการแชท + ตัวประกอบ query string ที่ผู้เรียก "ทุกจุด"
 * ต้องใช้ร่วมกัน (InboxList, ChatRail, และ SSR inbox/page.tsx ที่แปลงเป็น option ของ service)
 *
 * ทำไมต้องมีไฟล์นี้: invariant "ชุดข้อมูลชุดแรกต้องตรงกับ DEFAULT_CHAT_FILTER" เคยพังมาแล้ว 2 รอบ
 * เพราะมันถูกเขียนซ้ำอยู่ 3 ที่ (SSR + rail + refetch) แล้วแก้ไม่ครบ:
 *   - 2026-07-31 SSR (inbox/page.tsx) ดึงด้วย default 'open' → แก้แล้ว
 *   - 2026-08-01 ChatRail (คอลัมน์ซ้าย ≥1024px) ยัง fetch '/api/chat/conversations?take=20'
 *     เปล่า ๆ → backend ตกไป default 'open' (chat.service.ts:226) ทั้งที่แท็บไฮไลต์ "ทั้งหมด"
 *     อยู่ → เธรดที่ปิดงานแล้ว (resolvedAt != null) หายจากรายการตอนเข้าหน้าครั้งแรก แล้วโผล่
 *     หลังกดแท็บ "ปิดงาน" กลับมา "ทั้งหมด" (การสลับแท็บ = client refetch ที่ส่ง status=all)
 *
 * ห้ามประกอบ URL ของ GET /api/chat/conversations เองที่อื่นอีก — เรียกผ่าน builder นี้
 * เท่านั้น (มีเทสล็อกไว้ที่ __tests__/chat-list-query.test.ts)
 *
 * ไฟล์นี้เป็น plain TS โดยเจตนา (ไม่มี React/'use client') — เทสใน vitest environment 'node'
 * import ได้ตรง ๆ ไม่ต้องลาก tsx/iconify เข้ามาด้วย
 */

export type ShipmentFilterValue = 'all' | 'none' | 'unprinted' | 'printed' | 'problem'

export type ChatFilterState = {
  // status/spam ยังอยู่ใน state (แท็บในส่วนหัวเป็นคนตั้ง) แต่ไม่ได้ render ในแผงตัวกรอง
  status: 'open' | 'resolved' | 'all'
  spam: boolean
  customerLinked: 'all' | 'linked' | 'unlinked'
  hidden: boolean
  readState: 'all' | 'unread' | 'read'
  /** แท็กผู้ติดต่อ — "ติดอันใดก็ได้" (OR) ตามที่ user เลือก 2026-07-31 */
  tags: string[]
  /** สถานะพัสดุของออเดอร์ล่าสุด (เฉพาะร้านที่เชื่อม iShip) */
  shipment: ShipmentFilterValue
}

export const DEFAULT_CHAT_FILTER: ChatFilterState = {
  // ค่าเริ่มต้น = แท็บ "ทั้งหมด" ที่ถูกไฮไลต์ตอนเปิดหน้า จึงต้องเป็น 'all'
  // ไม่งั้นแท็บโชว์ว่าเลือก "ทั้งหมด" อยู่ แต่รายการกรองเฉพาะเธรดที่ยังไม่ปิดงาน
  status: 'all',
  spam: false,
  customerLinked: 'all',
  hidden: false,
  readState: 'all',
  tags: [],
  shipment: 'all',
}

type ChatListQueryOptions = {
  take?: number
  cursor?: string
  /** แท็บช่องทาง — 'ALL' = ไม่กรอง (ไม่ส่ง param) */
  channelTab?: string
  /** id ของ ShopChannel (ตัวกรอง "เพจ") */
  pageFilter?: string
  /** คำค้น (debounce มาแล้วจากผู้เรียก) */
  q?: string
  chatGroupId?: string | null
}

/**
 * ประกอบ query string ของ GET /api/chat/conversations
 *
 * ส่งเฉพาะค่าที่ "ไม่ใช่ default ของ backend" เพื่อไม่ให้ query string รกโดยเปล่าประโยชน์ —
 * default ฝั่ง backend คือ status=open, customerLinked=all, hidden=false, spam=false,
 * readState=all, shipment=all (ดู chat.service.ts) ซึ่ง **ไม่เท่ากับ** DEFAULT_CHAT_FILTER
 * ของหน้าจอในเรื่อง status นี่คือเหตุผลที่ต้องคำนวณจาก filter จริงเสมอ ห้าม hardcode
 */
export function buildChatListParams(
  filter: ChatFilterState,
  opts: ChatListQueryOptions = {},
): URLSearchParams {
  const params = new URLSearchParams()
  if (opts.take) params.set('take', String(opts.take))
  if (opts.cursor) params.set('cursor', opts.cursor)
  if (opts.channelTab && opts.channelTab !== 'ALL') params.set('channel', opts.channelTab)
  if (opts.pageFilter) params.set('shopChannelId', opts.pageFilter)
  if (opts.q) params.set('q', opts.q)
  if (filter.status !== 'open') params.set('status', filter.status)
  if (filter.customerLinked !== 'all') params.set('customerLinked', filter.customerLinked)
  if (filter.hidden) params.set('hidden', 'true')
  if (filter.spam) params.set('spam', 'true')
  // แท็ก: ส่งเป็น CSV (route แยกเอง) — ไม่ส่งเมื่อไม่ได้เลือก
  if (filter.tags.length > 0) params.set('tags', filter.tags.join(','))
  if (filter.shipment !== 'all') params.set('shipment', filter.shipment)
  if (opts.chatGroupId) params.set('chatGroupId', opts.chatGroupId)
  if (filter.readState !== 'all') params.set('readState', filter.readState)
  return params
}

/**
 * ผู้ใช้กำลังกรองอะไรอยู่หรือเปล่า (feature 00018 bugfix 2026-08-13)
 *
 * 🛑 ต้องเป็นฟังก์ชันบริสุทธิ์ ไม่ใช่เทอร์นารีกลาง JSX
 * มันตัดสินว่ารายการที่ว่างจะพูดว่า "ยังไม่มีใครทักเลย" หรือ "กรองแล้วไม่เจอ" ซึ่งเป็นคนละ
 * ความหมายกันสิ้นเชิง — ถ้าเขียนกลับด้าน ผู้ใช้ที่ยังไม่เคยมีลูกค้าจะถูกบอกให้ "ล้างตัวกรอง"
 * ที่เขาไม่เคยตั้ง และไม่มี gate ไหนจับได้เพราะเป็น boolean ที่ถูกต้องตามชนิดทุกประการ
 * (docs/conventions/ui-boolean-needs-a-testable-home.md)
 *
 * นับ "กำลังกรอง" จากทุกแกนที่ผู้ใช้กดได้เอง — ตัวกรองหลัก, แท็บช่องทาง, เพจ, คำค้นหา, กลุ่ม
 */
export function isChatListFiltering(input: {
  filter: ChatFilterState
  channelTab: string
  pageFilter: string
  query: string
  chatGroupId: string | null
}): boolean {
  const { filter, channelTab, pageFilter, query, chatGroupId } = input
  if (channelTab !== 'ALL') return true
  if (pageFilter !== '') return true
  if (query.trim() !== '') return true
  if (chatGroupId !== null) return true

  return (
    filter.status !== DEFAULT_CHAT_FILTER.status ||
    filter.spam !== DEFAULT_CHAT_FILTER.spam ||
    filter.customerLinked !== DEFAULT_CHAT_FILTER.customerLinked ||
    filter.hidden !== DEFAULT_CHAT_FILTER.hidden ||
    filter.readState !== DEFAULT_CHAT_FILTER.readState ||
    filter.shipment !== DEFAULT_CHAT_FILTER.shipment ||
    filter.tags.length > 0
  )
}
