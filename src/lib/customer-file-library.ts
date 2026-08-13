/**
 * feature 00048 — คลังไฟล์ต่อลูกค้า: SSOT ของ "คำ" + ตรรกะบริสุทธิ์ทั้งหมดของฟีเจอร์
 *
 * 🛑 ทำไมคำต้องอยู่ที่เดียว (Hard Rule 16): ฟีเจอร์นี้พูดถึงตัวเองใน 4 surface ที่อยู่คนละไฟล์
 * (เมนูกดค้าง · ปุ่ม hover เดสก์ท็อป · แถบเครื่องมือ lightbox · แผงลูกค้า+โมดัล) การพิมพ์คำซ้ำ
 * ทำให้เพี้ยนกันได้โดยไม่มี tsc/build/grep ตัวไหนฟ้อง เพราะทุกสตริง "ถูก" ในตัวเอง
 *
 * 🛑 ห้ามใช้คำว่า "บันทึก" กับการเก็บเข้าคลังเด็ดขาด — ในเธรดเดียวกันมี `MediaDownloadLink`
 * label="บันทึกวิดีโอ" และปุ่ม Download ของ Lightbox ที่แปลว่า "โหลดลงเครื่อง" อยู่แล้ว
 * คำเดียวสองความหมายในจอเดียวคือสิ่งที่ HR16 ห้าม (มีเทส [blocker] กันไว้)
 *
 * 🛑 ตรรกะในไฟล์นี้ห้ามย้ายกลับไปเป็นเทอร์นารีกลาง JSX — เกณฑ์ไม่ใช่ "ซับซ้อนพอไหม" แต่คือ
 * "ถ้าเขียนกลับด้านแล้วจะมีอะไรจับได้ไหม" (docs/conventions/ui-boolean-needs-a-testable-home.md)
 */
import { formatDateTH } from '@/lib/format-date'

// ─── คำ (SSOT) ────────────────────────────────────────────────────────────────
export const LIBRARY_COPY = {
  /** action ตอนไฟล์ยังไม่อยู่ในคลัง */
  save: 'เก็บเข้าคลัง',
  /** action ตอนไฟล์อยู่ในคลังแล้ว (toggle) */
  unsave: 'เอาออกจากคลัง',
  sectionTitle: 'คลังไฟล์',
  savedToast: 'เก็บเข้าคลังแล้ว',
  removedToast: 'เอาออกจากคลังแล้ว',
  saveFailed: 'เก็บเข้าคลังไม่สำเร็จ ลองใหม่อีกครั้ง',
  removeFailed: 'เอาออกจากคลังไม่สำเร็จ ลองใหม่อีกครั้ง',
  loadFailed: 'โหลดคลังไฟล์ไม่สำเร็จ',
  retry: 'ลองใหม่',
  emptyTitle: 'ยังไม่มีไฟล์ในคลัง',
  emptyBody: 'กดค้างที่รูป วิดีโอ หรือไฟล์ในแชท แล้วเลือก "เก็บเข้าคลัง"',
  /** สถานะเมื่อไฟล์จริงหายจาก storage — ห้ามปล่อยเป็นช่องเทาว่าง (BR-CFL-16) */
  missingFile: 'ไฟล์ถูกลบแล้ว',
  openFile: 'เปิดไฟล์',
  download: 'ดาวน์โหลด',
  edit: 'แก้ไข',
  /** ปุ่มกระโดดกลับข้อความต้นทาง — ซ่อนทั้งปุ่มเมื่อกระโดดไม่ได้จริง (BR-CFL-14) */
  seeInChat: 'ดูในแชท',
  editTitle: 'แก้ไขไฟล์',
  editNameLabel: 'ชื่อไฟล์',
  editNoteLabel: 'โน้ต',
  editNotePlaceholder: 'จดไว้ว่าทำไมถึงเก็บไฟล์นี้...',
  /** ปุ่มยืนยันฟอร์มแก้ไข — คำว่า "บันทึก" ใช้ได้เฉพาะที่นี่ (คนละบริบทกับ download/เก็บเข้าคลัง) */
  editSubmit: 'บันทึก',
  editSaved: 'บันทึกแล้ว',
  cancel: 'ยกเลิก',
  seeAll: (total: number) => `ดูไฟล์ทั้งหมด (${total})`,
  modalTitle: (customerName: string) => `คลังไฟล์ · ${customerName}`,
} as const

/**
 * ไอคอน (tabler) — `bookmark-filled` ไม่ใช่ `bookmark-off` สำหรับสถานะ "เก็บแล้ว"
 * เพราะ `-off` สื่อว่า "ปิดใช้งาน" ไม่ใช่ "อยู่ในคลังแล้ว" (ผู้ใช้เคาะ 2026-08-13)
 * `bookmark-off` ใช้ได้เฉพาะกับ **ปุ่มสั่งเอาออก** ในแถบรายละเอียด ซึ่งคำสั่งคือการถอดออกจริง ๆ
 */
export const LIBRARY_ICONS = {
  save: 'bookmark-plus',
  saved: 'bookmark-filled',
  remove: 'bookmark-off',
  empty: 'folder',
  missing: 'photo-off',
  video: 'video',
  file: 'file-text',
  play: 'player-play-filled',
} as const

// ─── ค่าคงที่ ─────────────────────────────────────────────────────────────────
/** กริดพรีวิวในแผงลูกค้า = 3×3 (BR-CFL-13 — ไม่ขยายตามจำนวนไฟล์) */
export const LIBRARY_PREVIEW_TAKE = 9
/** โมดัล "ดูไฟล์ทั้งหมด" โหลดเพิ่มหน้าละเท่านี้ (ไม่มีเพดานจำนวนรวม) */
export const LIBRARY_PAGE_TAKE = 60
/** เพดานความยาวที่ผู้ใช้แก้เองได้ */
export const LIBRARY_NAME_MAX = 120
export const LIBRARY_NOTE_MAX = 500

export type LibraryKind = 'IMAGE' | 'VIDEO' | 'FILE'

/** 3 ชนิดที่เก็บเข้าคลังได้ — allow-list, ห้ามเขียนเป็น deny-list (ค่าที่ 4 จะหลุดเข้ามาเงียบ ๆ) */
const LIBRARY_KINDS: readonly string[] = ['IMAGE', 'VIDEO', 'FILE']

// ─── ตรรกะ ────────────────────────────────────────────────────────────────────

/**
 * เกณฑ์เดียวของ "ข้อความนี้เก็บเข้าคลังได้ไหม" (FR-CFL-02) — **fail-closed**
 *
 * ที่ต้องระวัง 2 อย่างซึ่งไม่เห็นจากชื่อ field:
 * - สติกเกอร์ถูกเก็บเป็น `type = 'IMAGE'` เหมือนรูปทุกประการ แยกได้ด้วยธง `isSticker` เท่านั้น
 * - รูปในการ์ด carousel ของ Facebook มาจาก `ChatMessage.cards[].imageFileId` ไม่ใช่ `imageUrl`
 *   → ผู้เรียกต้องส่ง `fromCard: true` มาเอง (lightbox ใช้ชุดสไลด์ร่วมกันจึงต้องแยกให้ออก)
 */
export function isLibraryEligible(m: {
  type: string
  isSticker?: boolean | null
  fromCard?: boolean | null
  hasFile: boolean
}): boolean {
  if (!m.hasFile) return false
  if (m.fromCard === true) return false
  if (m.type === 'IMAGE') return m.isSticker !== true
  if (m.type === 'VIDEO' || m.type === 'FILE') return true
  // AUDIO / PRODUCT / ORDER / TEXT / ชนิดที่ยังไม่มีในวันนี้ → ปิดไว้ก่อนเสมอ
  return false
}

/** ชนิดที่จะเขียนลง DB — คืน null เมื่อไม่เข้าเกณฑ์ (ผู้เรียกตัดสินใจต่อ ไม่ throw) */
export function toLibraryKind(type: string): LibraryKind | null {
  return LIBRARY_KINDS.includes(type) ? (type as LibraryKind) : null
}

/**
 * เจ้าของคลังของเธรดหนึ่ง — หนึ่งใน 2 คีย์เสมอ ไม่มีทางเป็นทั้งคู่หรือไม่เป็นอะไรเลย
 * (DB มี CHECK บังคับซ้ำอีกชั้น)
 *
 * ผูกกับ ExternalContact ก่อนเสมอเมื่อมี เพราะ "คน" อยู่ทนกว่า "เธรด" และรองรับการรวมโปรไฟล์
 * ข้ามช่องทางในอนาคต; เธรด DEEP ไม่มี ExternalContact เลยจึงตกมาที่ conversation
 */
export type LibraryOwner =
  | { externalContactId: string; conversationId?: undefined }
  | { conversationId: string; externalContactId?: undefined }

export function resolveLibraryOwner(c: {
  id: string
  externalContactId: string | null
}): LibraryOwner {
  if (c.externalContactId) return { externalContactId: c.externalContactId }
  return { conversationId: c.id }
}

/**
 * ชื่อผู้ส่งที่แสดงได้เสมอ — snapshot อาจว่าง (ผู้ติดต่อที่ Meta ยังไม่ให้ชื่อ) จึงต้องมีตัวสำรอง
 * ที่ผูกกับ "ฝั่ง" ไม่ใช่คำว่า "ไม่ทราบ"
 */
export function librarySenderLabel(item: { senderName: string | null; senderRole: string }): string {
  const name = item.senderName?.trim()
  if (name) return name
  return item.senderRole === 'SHOP' ? 'ร้าน' : 'ลูกค้า'
}

/**
 * `aria-label` ของแต่ละช่องในกริด — ช่องเป็นปุ่มรูปเปล่าที่ไม่มีข้อความเลย ถ้าไม่มี label
 * screen reader จะอ่านไม่ออกทั้งกริด (docs/conventions/aria-name-requires-supporting-role.md)
 *
 * 🛑 ต้องผันตามชนิดจริง ห้าม hardcode "รูปจาก" — คลังมีวิดีโอและไฟล์เอกสารด้วย
 */
export function libraryTileAriaLabel(item: {
  kind: LibraryKind
  fileName: string | null
  senderName: string | null
  senderRole: string
  sentAt: string | Date
}): string {
  const who = librarySenderLabel(item)
  const when = formatDateTH(item.sentAt)
  if (item.kind === 'IMAGE') return `รูปจาก ${who} · ${when}`
  if (item.kind === 'VIDEO') return `วิดีโอจาก ${who} · ${when}`
  const name = item.fileName?.trim() || 'ไฟล์แนบ'
  return `${name} จาก ${who} · ${when}`
}

/** ค่าที่ผู้ใช้กรอกแล้วเหลือแต่ช่องว่าง = ไม่มีค่า (ไม่ใช่สตริงว่างที่แสดงเป็นชื่อว่าง ๆ) */
export function normalizeLibraryText(raw: string | null | undefined, max: number): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  return trimmed.slice(0, max)
}
