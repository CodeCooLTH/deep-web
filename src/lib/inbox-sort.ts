/**
 * inbox-sort.ts — SSOT ของ "กล่องแชทเรียงด้วยอะไร" (00018 ส่วนขยาย 2026-09-09)
 *
 * เอกสาร: docs/20 - Features/00018 - Facebook Chat Integration/EXTENSIONS-2026-09-09-inbox-sort-mode.md
 *
 * กล่องแชทเคยมีคีย์เรียงเดียว (`lastMessageAt`) ซึ่งปนคำถามสองข้อเข้าด้วยกัน:
 *   "ห้องไหนเพิ่งมีความเคลื่อนไหว"  → lastMessageAt
 *   "ใครรอเราอยู่ นานแค่ไหน"        → lastInboundAt
 * คีย์เดียวตอบได้ทีละข้อ จึงให้ผู้ใช้เลือก (ค่าตั้งเก็บรายคน × ร้าน ที่ SellerChatPreference)
 *
 * 🛑 ทุกอย่างในไฟล์นี้เป็นฟังก์ชันบริสุทธิ์ — ไม่ import prisma ไม่แตะ session
 * ตรรกะ keyset pagination ข้ามพรมแดน NULL อยู่ตรงนี้ทั้งหมดเพราะเป็นจุดที่ "เขียนกลับด้านแล้ว
 * ยังคอมไพล์ผ่านและหน้าจอดูปกติ" — ต้องมีที่ให้เทสจับ (docs/conventions/ui-boolean-needs-a-testable-home.md)
 */

export const INBOX_SORT_MODES = ['LAST_MESSAGE', 'LAST_CUSTOMER_MESSAGE'] as const
export type InboxSortMode = (typeof INBOX_SORT_MODES)[number]

/** D-SORT-2 — ไม่มีแถว pref / ค่าที่อ่านไม่ออก = โหมดเดิม (กล่องแชทหน้าตาไม่เปลี่ยนเองหลัง deploy) */
export const DEFAULT_INBOX_SORT: InboxSortMode = 'LAST_MESSAGE'

/**
 * fail-closed: ค่าที่ไม่รู้จักตกไปที่ค่าตั้งต้น ไม่ throw
 * คอลัมน์ในฐานเป็น TEXT (มี CHECK กั้นอีกชั้น) — ที่นี่กันฝั่งอ่าน เพราะแถวเก่า/ค่าจาก client
 * อาจเป็นอะไรก็ได้ และ "กล่องแชทพังทั้งหน้า" แพงกว่า "เรียงแบบตั้งต้น" เสมอ
 */
export function parseInboxSortMode(value: unknown): InboxSortMode {
  return INBOX_SORT_MODES.includes(value as InboxSortMode) ? (value as InboxSortMode) : DEFAULT_INBOX_SORT
}

/** แถวเท่าที่ตรรกะการเรียงต้องรู้จัก — ไม่ผูกกับ type ของ Prisma */
export type InboxSortRow = {
  isPinned?: boolean
  lastMessageAt: Date
  lastInboundAt?: Date | null
}

/**
 * orderBy ของ Prisma ต่อโหมด
 *
 * โหมด LAST_CUSTOMER_MESSAGE ต้องมี `lastMessageAt` เป็นคีย์รองเสมอ — `lastInboundAt` เป็น
 * nullable และบน prod มี 475 เธรดที่เป็น NULL (ลูกค้าไม่เคยพิมพ์: ห้องที่บอททักจากคอมเมนต์)
 * ถ้าไม่มีคีย์รอง แถวกลุ่มนั้นจะ "เสมอกันหมด" แล้ว keyset pagination ตกหล่น/วนซ้ำ (AC-SORT-07)
 */
export function buildInboxOrderBy(mode: InboxSortMode, pinnedFirst: boolean) {
  const pinned = pinnedFirst ? [{ isPinned: 'desc' as const }] : []
  return mode === 'LAST_CUSTOMER_MESSAGE'
    ? [...pinned, { lastInboundAt: { sort: 'desc' as const, nulls: 'last' as const } }, { lastMessageAt: 'desc' as const }]
    : [...pinned, { lastMessageAt: 'desc' as const }]
}

/**
 * cursor รูปแบบ v2: `v2|<mode>|<0|1 pinned>|<inbound ISO หรือ '-'>|<lastMessage ISO>`
 *
 * ฝัง mode ลงไปด้วยเพราะผู้ใช้สลับโหมดระหว่างเลื่อนรายการได้ — cursor ของโหมดเก่าตีความ
 * ด้วยกติกาของโหมดใหม่จะได้ผลลัพธ์ที่ "ดูเหมือนทำงาน" แต่ข้ามแถว ตัวถอดรหัสจึงปฏิเสธ
 * cursor ข้ามโหมดทิ้งไปเลย (คืน null = เริ่มหน้าแรก) ดีกว่าคืนหน้าที่ผิดเงียบ ๆ
 *
 * ตัวคั่นเป็น '|' ไม่ใช่ ':' — ISO datetime มี ':' อยู่ในตัวเอง (เหตุผลเดิมจาก S-7)
 */
export function encodeInboxCursor(row: InboxSortRow, mode: InboxSortMode, pinnedFirst: boolean): string {
  const pinned = pinnedFirst && row.isPinned ? '1' : '0'
  const inbound = row.lastInboundAt ? row.lastInboundAt.toISOString() : '-'
  return `v2|${mode}|${pinned}|${inbound}|${row.lastMessageAt.toISOString()}`
}

export type DecodedInboxCursor = {
  pinned: boolean
  lastInboundAt: Date | null
  lastMessageAt: Date
}

/**
 * คืน null เมื่อ cursor ไม่ใช่รูปแบบ v2 ของโหมดนี้ — ผู้เรียกต้องถอยไปใช้เส้นทางเดิม
 * (cursor รูปแบบเก่ายังต้องใช้ได้ระหว่าง deploy: client ที่เปิดค้างไว้ถือ cursor เก่าอยู่)
 */
export function decodeInboxCursor(cursor: string, mode: InboxSortMode): DecodedInboxCursor | null {
  const parts = cursor.split('|')
  if (parts.length !== 5 || parts[0] !== 'v2' || parts[1] !== mode) return null
  const lastMessageAt = new Date(parts[4]!)
  if (Number.isNaN(lastMessageAt.getTime())) return null
  let lastInboundAt: Date | null = null
  if (parts[3] !== '-') {
    const parsed = new Date(parts[3]!)
    if (Number.isNaN(parsed.getTime())) return null
    lastInboundAt = parsed
  }
  return { pinned: parts[2] === '1', lastInboundAt, lastMessageAt }
}

/**
 * เงื่อนไข "แถวที่อยู่หลัง cursor" ของโหมด LAST_CUSTOMER_MESSAGE
 *
 * 🛑 ใช้ได้เฉพาะ slot `OR` + คีย์ scalar ระดับบนสุด — ผู้เรียก spread ทับ where ของตัวเอง
 * ซึ่งใช้ `AND` ไปแล้ว (ดูคอมเมนต์ใน listConversations)
 *
 * ลำดับคือ inbound มาก→น้อย โดย NULL อยู่ท้ายสุด แล้ว lastMessageAt มาก→น้อยเป็นตัวตัดเสมอ
 * ⇒ "หลัง cursor" แปลว่า
 *   - inbound น้อยกว่า, หรือ
 *   - inbound เท่ากันแต่ lastMessageAt น้อยกว่า, หรือ
 *   - inbound เป็น NULL (อยู่หลังทุกค่าที่ไม่ NULL เสมอ)
 * และถ้า cursor อยู่ในเขต NULL แล้ว เหลือแค่เขต NULL ที่ lastMessageAt น้อยกว่า
 */
function afterCustomerConditions(c: DecodedInboxCursor): Record<string, unknown>[] {
  return c.lastInboundAt === null
    ? [{ lastInboundAt: null, lastMessageAt: { lt: c.lastMessageAt } }]
    : [
        { lastInboundAt: { lt: c.lastInboundAt } },
        { lastInboundAt: c.lastInboundAt, lastMessageAt: { lt: c.lastMessageAt } },
        { lastInboundAt: null },
      ]
}

/**
 * where ของหน้าถัดไปสำหรับโหมด LAST_CUSTOMER_MESSAGE (pinnedFirst = true เสมอฝั่งร้าน)
 *
 * เธรดปักหมุดมาก่อนทั้งหมด ⇒ ถ้าแถวสุดท้ายที่เห็นยังเป็นเธรดปักหมุด หน้าถัดไปต้องเห็น
 * "เธรดไม่ปักหมุดทั้งหมด" + "เธรดปักหมุดที่เหลือ" — ตรรกะเดียวกับ S-7 ของโหมดเดิม
 */
export function buildCustomerSortCursorWhere(
  c: DecodedInboxCursor,
  pinnedFirst: boolean,
): Record<string, unknown> {
  const alts = afterCustomerConditions(c)
  const one = alts.length === 1 ? alts[0]! : null
  if (!pinnedFirst) return one ?? { OR: alts }
  if (!c.pinned) return one ? { isPinned: false, ...one } : { isPinned: false, OR: alts }
  return { OR: [{ isPinned: false }, ...alts.map((a) => ({ isPinned: true, ...a }))] }
}
