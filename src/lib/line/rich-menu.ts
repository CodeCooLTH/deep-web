/**
 * rich-menu — ตัวประกอบ payload และตัวตรวจของเมนูลัดใน LINE (feature 00045, ฟังก์ชันบริสุทธิ์)
 *
 * ข้อบังคับ: pure — ห้าม import prisma/storage/fetch. ไฟล์นี้ถูกเรียกทั้งจาก service ฝั่ง server
 * และจากตัวเรนเดอร์ canvas ฝั่ง client (กริดพิกัดต้องเป็นชุดเดียวกันทั้งสองฝั่ง — TD-RM-6)
 *
 * ตัวเลขทั้งหมดอยู่ที่ `constants.ts` ที่เดียวตามกติกาของ 00025 (S-3) ห้ามพิมพ์ซ้ำที่นี่
 */

import {
  RICH_MENU_CANVAS_HEIGHT,
  RICH_MENU_CANVAS_WIDTH,
  RICH_MENU_CHAT_BAR_MAX,
  RICH_MENU_IMAGE_MAX_BYTES,
  RICH_MENU_IMAGE_MAX_WIDTH,
  RICH_MENU_IMAGE_MIN_ASPECT,
  RICH_MENU_IMAGE_MIN_HEIGHT,
  RICH_MENU_IMAGE_MIN_WIDTH,
  RICH_MENU_MAX_AREAS,
} from './constants'

// ---------------------------------------------------------------------------
// ชนิดข้อมูล
// ---------------------------------------------------------------------------

/** action ที่รอบนี้รองรับ — allow-list, fail-closed (ชนิดอื่นที่ LINE มีเช่น `richmenuswitch`
 *  จงใจยังไม่เปิดเพราะยังไม่มีตัวรับ ตาม BR-RM-03 "ห้ามมีปุ่มที่ปลายทางยังไม่ทำงาน") */
export type RichMenuAction =
  | { type: 'uri'; uri: string }
  | { type: 'message'; text: string }
  | { type: 'postback'; data: string }
  | { type: 'location' }
  | { type: 'datetimepicker'; data: string; mode: 'date' | 'time' | 'datetime' }

export type RichMenuButton = {
  /** คีย์ภายในของปุ่ม ใช้เป็น `action=` ใน postback และใช้อ้างในเทมเพลต */
  key: string
  /** คำที่ผู้ขายแก้ได้ และเป็นคำที่ถูกวาดลงภาพ */
  label: string
  action: RichMenuAction
}

/** โครงที่ยิงให้ LINE (`POST /v2/bot/richmenu`) */
export type LineRichMenuObject = {
  size: { width: number; height: number }
  selected: boolean
  name: string
  chatBarText: string
  areas: { bounds: { x: number; y: number; width: number; height: number }; action: Record<string, unknown> }[]
}

// ---------------------------------------------------------------------------
// ชื่อเมนู — ใช้เป็นกลไกเก็บกวาด
// ---------------------------------------------------------------------------

/**
 * 🛑 ชื่อเมนูคือ **กลไกเก็บกวาด** ไม่ใช่ของประดับ (TD-RM-3)
 *
 * LINE ไม่มี endpoint แก้เมนู และอัปโหลดรูปซ้ำลงใบเดิมไม่ได้ ⇒ ทุกการแก้ไขคือสร้างใบใหม่แล้วต้อง
 * ลบใบเก่าทิ้ง. การจำ id ใบเก่าไว้ในคอลัมน์ใช้ไม่ได้ผลจริง เพราะใบที่สร้างสำเร็จแล้วล้มตอนอัปโหลดรูป
 * (ก่อนที่เราจะได้บันทึกอะไร) จะไม่มีใครจำ — แต่มันมีอยู่จริงบน LINE และกินโควตา 1000 ใบ
 * การไล่ลบจาก **prefix ของชื่อ** เก็บได้ทั้งใบที่บันทึกแล้วและใบที่ค้างจากรอบที่ล้มกลางทาง
 */
export function richMenuNamePrefix(shopChannelId: string): string {
  return `deep:${shopChannelId}:`
}

export function buildRichMenuName(shopChannelId: string, stampMs: number): string {
  return `${richMenuNamePrefix(shopChannelId)}${stampMs}`
}

/** true = เมนูใบนี้เป็นของเพจนี้ที่ระบบเราสร้าง (ปลอดภัยที่จะลบ)
 *  🛑 ต้องเทียบแบบ "ขึ้นต้นด้วย prefix ของ shopChannel นี้" เท่านั้น — เมนูของเพจอื่นหรือของ
 *  LINE OA Manager ต้องไม่ถูกแตะ (TC-08) */
export function isOwnRichMenuName(name: string | null | undefined, shopChannelId: string): boolean {
  if (!name) return false
  return name.startsWith(richMenuNamePrefix(shopChannelId))
}

// ---------------------------------------------------------------------------
// chatBarText
// ---------------------------------------------------------------------------

/**
 * นับความยาวของ `chatBarText` แบบที่ตรงกับที่ LINE นับ
 *
 * 🛑 `'ก'.length` ในภาษาไทยที่มีสระ/วรรณยุกต์จะไม่ตรงกับจำนวนตัวอักษรที่คนอ่านเห็น และ
 * `String.length` ของ JS นับเป็น UTF-16 code unit (อิโมจิ 1 ตัว = 2) — ใช้ `Array.from` เพื่อให้ได้
 * จำนวน code point ซึ่งใกล้เคียงกับที่ LINE นับที่สุด
 */
export function countChatBarText(s: string): number {
  return Array.from(s).length
}

export function isChatBarTextValid(s: string): boolean {
  const n = countChatBarText(s.trim())
  return n > 0 && n <= RICH_MENU_CHAT_BAR_MAX
}

// ---------------------------------------------------------------------------
// กริดพิกัดปุ่ม — SSOT ของทั้ง canvas และ payload
// ---------------------------------------------------------------------------

export type RichMenuGrid = { rows: number; cols: number }

/**
 * กริดที่รองรับ — จำนวนปุ่มที่ไม่อยู่ในตารางนี้ = **ปฏิเสธ** (fail-closed)
 *
 * ไม่รองรับ 5 ปุ่มโดยตั้งใจ: กริด 5 ช่องต้องมีช่องที่ขนาดไม่เท่าเพื่อน ซึ่งทำให้ภาพที่วาดกับพิกัดที่
 * ส่งไปมีโอกาสไม่ตรงกันสูงมาก และผลของการไม่ตรงคือ **ลูกค้ากดโดนปุ่มผิด** ซึ่งไม่มีอะไรฟ้อง
 */
const GRIDS: Record<number, RichMenuGrid> = {
  2: { rows: 1, cols: 2 },
  3: { rows: 1, cols: 3 },
  4: { rows: 2, cols: 2 },
  6: { rows: 2, cols: 3 },
}

export function gridFor(buttonCount: number): RichMenuGrid | null {
  return GRIDS[buttonCount] ?? null
}

/**
 * คำนวณกล่องของแต่ละปุ่มจากกริด
 *
 * 🛑 ช่องสุดท้ายของแต่ละแถว/คอลัมน์ต้อง **กลืนเศษ** ไม่ใช่ปัดลงทุกช่อง — 2500/3 = 833.33
 * ถ้าปัดลงหมดจะได้ 833×3 = 2499 เหลือแถบกว้าง 1px ทางขวาที่กดแล้วไม่โดนอะไรเลย
 * (ผู้ใช้ที่กดขอบขวาสุดจะเจอปุ่มไม่ทำงานเป็นบางครั้ง ซึ่งเป็นอาการที่ report ยากมาก)
 */
export function cellBounds(
  grid: RichMenuGrid,
  index: number,
  canvasWidth = RICH_MENU_CANVAS_WIDTH,
  canvasHeight = RICH_MENU_CANVAS_HEIGHT,
): { x: number; y: number; width: number; height: number } {
  const row = Math.floor(index / grid.cols)
  const col = index % grid.cols
  const baseW = Math.floor(canvasWidth / grid.cols)
  const baseH = Math.floor(canvasHeight / grid.rows)
  const x = col * baseW
  const y = row * baseH
  const isLastCol = col === grid.cols - 1
  const isLastRow = row === grid.rows - 1
  return {
    x,
    y,
    width: isLastCol ? canvasWidth - x : baseW,
    height: isLastRow ? canvasHeight - y : baseH,
  }
}

/** แปลง action ของเราเป็นรูปที่ LINE รับ (คีย์ต่างกันบางตัว) */
function toLineAction(a: RichMenuAction, label: string): Record<string, unknown> {
  switch (a.type) {
    case 'uri':
      return { type: 'uri', label, uri: a.uri }
    case 'message':
      return { type: 'message', label, text: a.text }
    case 'postback':
      return { type: 'postback', label, data: a.data }
    case 'location':
      return { type: 'location', label }
    case 'datetimepicker':
      return { type: 'datetimepicker', label, data: a.data, mode: a.mode }
  }
}

/**
 * ประกอบ payload ที่ยิงให้ `POST /v2/bot/richmenu`
 *
 * โยน error เมื่อข้อมูลไม่ผ่าน — ตัวเรียกต้องแปลงเป็น 400 ไม่ใช่ปล่อยไปให้ LINE ตัดสิน
 * (ถ้าปล่อย เราจะได้ error ภาษาอังกฤษของ LINE ที่ผู้ขายอ่านไม่ออกและแก้ไม่ถูก)
 */
export function buildRichMenuPayload(input: {
  name: string
  chatBarText: string
  buttons: RichMenuButton[]
}): LineRichMenuObject {
  if (!isChatBarTextValid(input.chatBarText)) {
    throw new Error('RICH_MENU_CHAT_BAR_INVALID')
  }
  if (input.buttons.length > RICH_MENU_MAX_AREAS) {
    throw new Error('RICH_MENU_TOO_MANY_AREAS')
  }
  const grid = gridFor(input.buttons.length)
  if (!grid) throw new Error('RICH_MENU_LAYOUT_UNSUPPORTED')
  if (input.buttons.some((b) => !b.label.trim())) {
    throw new Error('RICH_MENU_LABEL_REQUIRED')
  }

  return {
    size: { width: RICH_MENU_CANVAS_WIDTH, height: RICH_MENU_CANVAS_HEIGHT },
    // false = ให้เมนูหุบไว้ตอนลูกค้าเปิดห้องแชทครั้งแรก ลูกค้าแตะแถบเองเพื่อเปิด
    // (true = กางค้าง ซึ่งกินพื้นที่จอครึ่งหนึ่งและบังบทสนทนา)
    selected: false,
    name: input.name,
    chatBarText: input.chatBarText.trim(),
    areas: input.buttons.map((b, i) => ({
      bounds: cellBounds(grid, i),
      action: toLineAction(b.action, b.label.trim()),
    })),
  }
}

// ---------------------------------------------------------------------------
// ตรวจภาพ
// ---------------------------------------------------------------------------

export type RichMenuImageMeta = { bytes: number; width: number; height: number; mime: string }

/**
 * ตรวจภาพให้ครบทุกเกณฑ์แล้วคืน **เหตุผลทุกข้อที่ไม่ผ่านพร้อมกัน** ไม่ใช่ข้อแรกที่เจอ
 *
 * เหตุผล: ผู้ขายที่ภาพไม่ผ่าน 3 ข้อ จะต้องแก้แล้วลองใหม่ 3 รอบถ้าเราบอกทีละข้อ
 * 🛑 ต้องถูกเรียกที่ **server** ก่อนยิง LINE เสมอ — ค่าที่ client ส่งมาไม่ใช่ด่าน (NFR-RM-2,
 * บทเรียนเดียวกับ `docs/conventions/upload-body-size-limit.md`)
 */
export function validateRichMenuImage(meta: RichMenuImageMeta): { ok: true } | { ok: false; reasons: string[] } {
  const reasons: string[] = []
  if (meta.mime !== 'image/jpeg' && meta.mime !== 'image/png') {
    reasons.push('ต้องเป็นไฟล์ JPEG หรือ PNG')
  }
  if (meta.bytes > RICH_MENU_IMAGE_MAX_BYTES) {
    reasons.push('ไฟล์ต้องไม่เกิน 1 MB')
  }
  if (meta.width < RICH_MENU_IMAGE_MIN_WIDTH || meta.width > RICH_MENU_IMAGE_MAX_WIDTH) {
    reasons.push(`ความกว้างต้องอยู่ระหว่าง ${RICH_MENU_IMAGE_MIN_WIDTH}–${RICH_MENU_IMAGE_MAX_WIDTH} พิกเซล`)
  }
  if (meta.height < RICH_MENU_IMAGE_MIN_HEIGHT) {
    reasons.push(`ความสูงต้องไม่น้อยกว่า ${RICH_MENU_IMAGE_MIN_HEIGHT} พิกเซล`)
  }
  // ป้องกันหารด้วยศูนย์ก่อนคิดอัตราส่วน — ภาพสูง 0 ถูกจับด้วยเกณฑ์ความสูงข้างบนแล้ว
  if (meta.height > 0 && meta.width / meta.height < RICH_MENU_IMAGE_MIN_ASPECT) {
    reasons.push('ภาพแบนเกินไป (ความกว้างต้องเป็นอย่างน้อย 1.45 เท่าของความสูง)')
  }
  return reasons.length === 0 ? { ok: true } : { ok: false, reasons }
}
