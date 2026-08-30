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
import { fmt } from '@/i18n/fmt'

// ─── คำ ──────────────────────────────────────────────────────────────────────
/**
 * 🛑 **คำทั้งหมดย้ายไป dictionary ของ 00047 แล้ว** (`src/i18n/dictionaries/{th,en}.ts` → `inbox.library*`)
 *
 * เดิมไฟล์นี้เคยถือ `LIBRARY_COPY` เป็นค่าคงที่ระดับ module ซึ่งเป็นรูปแบบที่บันทึกของ 00047
 * เขียนไว้เองว่า **"ค่าคงที่ระดับ module ฝังข้อความไทย = ค้างเป็นไทยตลอดไป"** — สลับภาษาแล้ว
 * คลังไฟล์จะยังเป็นไทยทั้งก้อน ซึ่งตรงกับเคสที่ 00047 ถูกสร้างมาแก้พอดี (Meta App Review ขอ UI EN)
 *
 * ที่ยังอยู่ในไฟล์นี้คือ **ตรรกะและค่าที่ไม่ใช่คำพูด** เท่านั้น (ไอคอน/เพดาน/เกณฑ์) เพราะ service
 * ฝั่ง server ก็ import ไฟล์นี้ — ยก `useT()` เข้ามาทั้งดุ้นไม่ได้
 */

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

// ─── สัญญาณข้ามแผง ───────────────────────────────────────────────────────────
/**
 * "คลังของเธรดนี้เพิ่งเปลี่ยน" — ปุ่มเก็บเข้าคลังอยู่ใน **เธรด** (`ChatThread`) ส่วนกริดที่ต้อง
 * อัปเดตอยู่ใน **แผงลูกค้า** (`CustomerFileLibrarySection`) ซึ่งเป็นพี่น้องกันคนละ subtree
 * บนเดสก์ท็อป — ส่ง prop ถึงกันต้องลากผ่าน page.tsx และยังไม่ครอบโหมด sheet บนมือถือที่แผงอยู่
 * *ข้างใน* เธรดอีกทรงหนึ่ง. ใช้ CustomEvent ด้วยเหตุผลเดียวกับ `JUMP_TO_MESSAGE_EVENT`
 * (ทิศตรงข้าม: แผง → เธรด) ซึ่งทำงานได้จริงกับทั้งสองทรงอยู่แล้ว
 *
 * 🛑 ที่มา (user เจอเองบน prod 2026-08-14): กด "เก็บเข้าคลัง" แล้ว toast ขึ้นว่าสำเร็จ แต่กริด
 * ในแผงยังเขียนว่า "ยังไม่มีไฟล์ที่เก็บไว้" จนกว่าจะรีเฟรช — เดิม `toggleLibrary` อัปเดตแค่
 * `savedFiles` (state ในเธรด) แล้วจบ ไม่มีใครบอกแผง ส่วนแผงโหลดครั้งเดียวตอน mount
 * ⇒ **ทุกทางที่แก้คลังจากในแผงเองรีเฟรชครบหมด ขาดทางเดียวคือทางที่ผู้ใช้ใช้จริง**
 *
 * ทำไมอยู่ในไฟล์นี้ทั้งที่ service ฝั่ง server ก็ import: เป็นค่าคงที่ + ฟังก์ชันที่แตะ `window`
 * *ในตัวฟังก์ชัน* เท่านั้น (มี guard) ไม่ใช่ตอน import — และนี่คือไฟล์ที่ทั้งเธรดและแผง import
 * อยู่แล้วทั้งคู่ การวางไว้ที่ component ฝั่งใดฝั่งหนึ่งจะลากไฟล์ก้อนใหญ่เข้า bundle ของอีกฝั่ง
 */
export const LIBRARY_CHANGED_EVENT = 'deep:library-changed'

export function emitLibraryChanged(conversationId: string): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(LIBRARY_CHANGED_EVENT, { detail: { conversationId } }))
}

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
  /**
   * fileId/นามสกุลของไฟล์ที่ mirror ไว้ (2026-08-27) — ใช้กัน **GIF** ออกจากคลัง
   *
   * ธง `isSticker` กันได้เฉพาะสติกเกอร์ แต่ GIF ของ GIPHY ไม่ใช่สติกเกอร์โดยตั้งใจ (มันต้องกว้าง
   * เท่ารูปปกติ ดู hidesDownloadAffordance) ⇒ ถ้าไม่ดูนามสกุลด้วย GIF จะยังเก็บเข้าคลังไฟล์ลูกค้าได้
   * ซึ่งคลังนั้นมีไว้เก็บ **สลิป/รูปสินค้า/เอกสาร** ไม่ใช่ของเล่นในบทสนทนา (user สั่ง 2026-08-27)
   *
   * ไม่ส่งมา = พฤติกรรมเดิมทุกประการ (ผู้เรียกเก่าที่ยังไม่อัปเดตจึงไม่พัง)
   */
  storageKey?: string | null
}): boolean {
  if (!m.hasFile) return false
  if (m.fromCard === true) return false
  if (m.storageKey && /\.gif$/i.test(m.storageKey.split('?')[0])) return false
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
 * ชุดคำที่ฟังก์ชันในไฟล์นี้ต้องใช้ — ประกาศเป็น structural type ของคีย์ที่ต้องใช้จริง
 * ผู้เรียกส่ง `t.inbox` เข้ามาตรง ๆ ได้เลย (tsc ตรวจให้ว่าคีย์ครบ)
 */
export type LibraryLabelCopy = {
  libraryAriaImage: string
  libraryAriaVideo: string
  libraryAriaFile: string
  libraryFileFallbackName: string
  librarySenderBuyer: string
  librarySenderShop: string
}

/**
 * ชื่อผู้ส่งที่แสดงได้เสมอ — snapshot อาจว่าง (ผู้ติดต่อที่ Meta ยังไม่ให้ชื่อ) จึงต้องมีตัวสำรอง
 * ที่ผูกกับ "ฝั่ง" ไม่ใช่คำว่า "ไม่ทราบ"
 */
export function librarySenderLabel(
  item: { senderName: string | null; senderRole: string },
  copy: Pick<LibraryLabelCopy, 'librarySenderBuyer' | 'librarySenderShop'>,
): string {
  const name = item.senderName?.trim()
  if (name) return name
  return item.senderRole === 'SHOP' ? copy.librarySenderShop : copy.librarySenderBuyer
}

/**
 * `aria-label` ของแต่ละช่องในกริด — ช่องเป็นปุ่มรูปเปล่าที่ไม่มีข้อความเลย ถ้าไม่มี label
 * screen reader จะอ่านไม่ออกทั้งกริด (docs/conventions/aria-name-requires-supporting-role.md)
 *
 * 🛑 ต้องผันตามชนิดจริง ห้าม hardcode "รูปจาก" — คลังมีวิดีโอและไฟล์เอกสารด้วย
 * 🛑 ประกอบด้วย fmt() ไม่ใช่ต่อสตริงเอง — ลำดับคำของ TH/EN ไม่ตรงกัน (ดู src/i18n/fmt.ts)
 */
export function libraryTileAriaLabel(
  item: {
    kind: LibraryKind
    fileName: string | null
    senderName: string | null
    senderRole: string
    sentAt: string | Date
  },
  copy: LibraryLabelCopy,
): string {
  const who = librarySenderLabel(item, copy)
  const when = formatDateTH(item.sentAt)
  if (item.kind === 'IMAGE') return fmt(copy.libraryAriaImage, { who, when })
  if (item.kind === 'VIDEO') return fmt(copy.libraryAriaVideo, { who, when })
  const name = item.fileName?.trim() || copy.libraryFileFallbackName
  return fmt(copy.libraryAriaFile, { name, who, when })
}

/** ค่าที่ผู้ใช้กรอกแล้วเหลือแต่ช่องว่าง = ไม่มีค่า (ไม่ใช่สตริงว่างที่แสดงเป็นชื่อว่าง ๆ) */
export function normalizeLibraryText(raw: string | null | undefined, max: number): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  return trimmed.slice(0, max)
}
