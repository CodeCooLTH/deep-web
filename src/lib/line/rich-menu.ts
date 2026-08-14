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
  RICH_MENU_MAX_COLS_PER_ROW,
  RICH_MENU_MAX_ROWS,
  RICH_MENU_MIN_TAP_PX,
  RICH_MENU_WEIGHT_MAX,
  RICH_MENU_WEIGHT_MIN,
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

export type Bounds = { x: number; y: number; width: number; height: number }

/**
 * เลย์เอาต์ = โครงตาราง แถวเรียงบน→ล่าง ช่องเรียงซ้าย→ขวา
 *
 * `h` = น้ำหนักความสูงของแถว · `cols` = น้ำหนักความกว้างของแต่ละช่องในแถวนั้น
 * เช่น `[{ h: 2, cols: [1] }, { h: 1, cols: [2, 1] }]`
 *   = แถวบนสูง 2 ส่วน มีช่องเดียวเต็มความกว้าง / แถวล่างสูง 1 ส่วน แบ่งซ้าย 2 ส่วน ขวา 1 ส่วน
 *
 * 🛑 **ยังเป็นการปูกระเบื้อง ไม่ใช่กล่องลอยอิสระ** — นั่นคือทั้งหมดที่ทำให้ "รูโหว่" กับ "ช่องซ้อนกัน"
 * เป็นไปไม่ได้โดยโครงสร้าง ไม่ใช่ด้วยการตรวจทีหลัง. ถ้าวันไหนมีคนอยากเปลี่ยนเป็น x/y/w/h รายช่อง
 * ให้รู้ว่ากำลังแลกการันตีนี้ทิ้ง และเทส "ผลรวมพื้นที่ = พื้นที่ภาพเป๊ะ" จะใช้เป็นตาข่ายไม่ได้อีก
 * (LINE ไม่ปฏิเสธทั้งรูโหว่และช่องซ้อน — มันเงียบทั้งคู่ ผู้ขายจะไม่มีวันรู้)
 */
export type RichMenuLayoutRow = { h: number; cols: number[] }
export type RichMenuLayout = RichMenuLayoutRow[]

/** แปลงรูปย่อ "จำนวนคอลัมน์ต่อแถว" (สัดส่วนเท่ากันหมด) เป็นเลย์เอาต์เต็มรูป — ใช้กับเทมเพลตสำเร็จ */
export function uniformRows(colsPerRow: number[]): RichMenuLayout {
  return colsPerRow.map((n) => ({ h: 1, cols: Array.from({ length: n }, () => 1) }))
}

/** น้ำหนักต้องเป็นจำนวนเต็มบวกและไม่บานเกินจนสตริงยาวผิดปกติ */
function isWeight(n: unknown): n is number {
  return (
    typeof n === 'number' && Number.isInteger(n) && n >= RICH_MENU_WEIGHT_MIN && n <= RICH_MENU_WEIGHT_MAX
  )
}

/**
 * ตรวจว่าเลย์เอาต์ใช้ได้จริง — ต้องเรียกทุกครั้งที่รับเลย์เอาต์มาจากภายนอก (สตริงในฐาน / body ของ API)
 * fail-closed: อะไรที่ไม่เข้าเกณฑ์ = ใช้ไม่ได้ ไม่ใช่ซ่อมให้
 */
export function isValidLayout(layout: unknown): layout is RichMenuLayout {
  if (!Array.isArray(layout) || layout.length < 1 || layout.length > RICH_MENU_MAX_ROWS) return false
  let cells = 0
  for (const row of layout) {
    if (!row || typeof row !== 'object') return false
    const r = row as { h?: unknown; cols?: unknown }
    if (!isWeight(r.h)) return false
    if (!Array.isArray(r.cols) || r.cols.length < 1 || r.cols.length > RICH_MENU_MAX_COLS_PER_ROW) return false
    if (!r.cols.every(isWeight)) return false
    cells += r.cols.length
  }
  return cells >= 1 && cells <= RICH_MENU_MAX_AREAS
}

/**
 * เลย์เอาต์ที่รองรับ — อิงชุดเทมเพลตมาตรฐานของ LINE เอง (user เคาะ 2026-08-11)
 *
 * 🛑 **ต้องเป็น "คีย์ที่เลือก" ไม่ใช่ "เดาจากจำนวนช่อง"** — `top-1-bottom-2` กับ `row-3`
 * มี 3 ช่องเท่ากันทั้งคู่ ถ้าเดาจากจำนวนอย่างเดียวจะแยกไม่ออก แล้วภาพที่ร้านออกแบบมาเป็นสามช่อง
 * เรียงนอนจะถูกวางพื้นที่กดเป็น T-split ทับลงไป = **ลูกค้ากดโดนช่องผิด** โดยไม่มีอะไรฟ้อง
 * (นี่คือเหตุผลทั้งหมดที่ต้องรื้อจาก `layoutFor(count)` มาเป็นคีย์)
 */
export const RICH_MENU_LAYOUTS = {
  'grid-3x2': { rows: uniformRows([3, 3]), label: '3×2 — 6 ช่อง' },
  'grid-2x2': { rows: uniformRows([2, 2]), label: '2×2 — 4 ช่อง' },
  'top-1-bottom-2': { rows: uniformRows([1, 2]), label: '1 บน + 2 ล่าง — 3 ช่อง' },
  'row-3': { rows: uniformRows([3]), label: '1×3 — 3 ช่องเรียงนอน' },
  'row-2': { rows: uniformRows([2]), label: '1×2 — 2 ช่อง' },
  full: { rows: uniformRows([1]), label: 'เต็มใบ — 1 ช่อง' },
} satisfies Record<string, { rows: RichMenuLayout; label: string }>

export type RichMenuLayoutKey = keyof typeof RICH_MENU_LAYOUTS

export function isRichMenuLayoutKey(v: string): v is RichMenuLayoutKey {
  return v in RICH_MENU_LAYOUTS
}

/** จำนวนช่องของเลย์เอาต์ — นับจากเลย์เอาต์ตรง ๆ ไม่ใช่จากคีย์ เพราะเลย์เอาต์ที่ปรับสัดส่วนเองไม่มีคีย์ */
export function countCells(layout: RichMenuLayout): number {
  return layout.reduce((a, r) => a + r.cols.length, 0)
}

/** จำนวนช่องของเทมเพลตสำเร็จ (ยังใช้ได้เหมือนเดิม) */
export function layoutCellCount(key: RichMenuLayoutKey): number {
  return countCells(RICH_MENU_LAYOUTS[key].rows)
}

export function layoutRows(key: RichMenuLayoutKey): RichMenuLayout {
  return RICH_MENU_LAYOUTS[key].rows.map((r) => ({ h: r.h, cols: [...r.cols] }))
}

/** คีย์ของเทมเพลตสำเร็จที่หน้าตาตรงกับเลย์เอาต์นี้ (ใช้ไฮไลต์ตัวเลือกในหน้าจอ) — ไม่ตรงเลยคืน null */
export function matchPresetKey(layout: RichMenuLayout): RichMenuLayoutKey | null {
  const sig = (l: RichMenuLayout) => l.map((r) => `${r.h}*${r.cols.join('-')}`).join('|')
  const target = sig(layout)
  for (const key of Object.keys(RICH_MENU_LAYOUTS) as RichMenuLayoutKey[]) {
    if (sig(RICH_MENU_LAYOUTS[key].rows) === target) return key
  }
  return null
}

/**
 * เลย์เอาต์เริ่มต้นของ **เทมเพลตที่ระบบสร้างให้** (โหมด auto) — ยังเดาจากจำนวนปุ่มได้
 * เพราะโหมดนั้นเราเป็นคนกำหนดปุ่มเองทั้งหมด ไม่มีภาพของร้านให้ต้องตรงกัน
 *
 * 🛑 ห้ามใช้ตัวนี้กับโหมด "ภาพของร้านเอง" — ที่นั่นต้องใช้คีย์ที่ร้านเลือกเท่านั้น
 * คืน null เมื่อไม่มีเลย์เอาต์รองรับ (fail-closed ไม่เดาให้)
 */
export function defaultLayoutKeyForCount(count: number): RichMenuLayoutKey | null {
  switch (count) {
    case 1:
      return 'full'
    case 2:
      return 'row-2'
    case 3:
      return 'top-1-bottom-2'
    case 4:
      return 'grid-2x2'
    case 6:
      return 'grid-3x2'
    default:
      return null
  }
}

/**
 * ตัดสินว่าจะใช้เลย์เอาต์ไหน — **จุดเดียวของทั้งระบบ**
 *
 * 🛑 ตัวเรนเดอร์ภาพ (`rich-menu-canvas.ts`) กับตัวประกอบ payload ต้องเรียกตัวนี้ตัวเดียวกัน
 * ถ้าสองฝั่งตัดสินคนละทาง ช่องที่วาดบนภาพกับพื้นที่ที่กดได้จะเหลื่อมกัน — ลูกค้าเห็นปุ่มหนึ่ง
 * แต่กดแล้วได้อีกปุ่ม และไม่มี error ที่ไหนเลย
 */
export function resolveLayout(layout: RichMenuLayout | undefined, buttonCount: number): RichMenuLayout {
  if (layout) {
    // เลย์เอาต์ที่ปรับเองมาจากฝั่งผู้ใช้ ต้องตรวจก่อนใช้เสมอ — ไม่ใช่เชื่อว่าฝั่งเรียกตรวจมาแล้ว
    if (!isValidLayout(layout)) throw new Error('RICH_MENU_LAYOUT_UNSUPPORTED')
    return layout
  }
  const key = defaultLayoutKeyForCount(buttonCount)
  if (!key) throw new Error('RICH_MENU_LAYOUT_UNSUPPORTED')
  return layoutRows(key)
}

/**
 * คำนวณกล่องของทุกช่องพร้อมกัน (เรียงบน→ล่าง ซ้าย→ขวา)
 *
 * 🛑 ช่องสุดท้ายของแต่ละแถว และแถวสุดท้าย ต้อง **กลืนเศษ** ไม่ใช่ปัดลงทุกช่อง — 2500/3 = 833.33
 * ถ้าปัดลงหมดจะได้ 833×3 = 2499 เหลือแถบกว้าง 1px ทางขวาที่กดแล้วไม่โดนอะไรเลย ผู้ใช้ที่กดขอบขวาสุด
 * จะเจอ "กดแล้วบางทีไม่ติด" ซึ่งเป็นอาการที่รายงานยากมากและไม่มีเครื่องมือไหนจับได้
 *
 * คืนทั้งชุดในครั้งเดียว (ไม่ใช่ทีละช่อง) เพื่อให้เทสตรวจ **ผลรวมพื้นที่ = พื้นที่ภาพเป๊ะ** ได้
 * ซึ่งจับได้ทั้ง "มีรูโหว่" และ "ช่องซ้อนกัน" ในเงื่อนไขเดียว
 */
export function layoutBounds(
  layout: RichMenuLayout,
  canvasWidth = RICH_MENU_CANVAS_WIDTH,
  canvasHeight = RICH_MENU_CANVAS_HEIGHT,
): Bounds[] {
  const out: Bounds[] = []
  const totalH = layout.reduce((a, r) => a + r.h, 0)
  let y = 0
  for (let r = 0; r < layout.length; r++) {
    const row = layout[r]!
    // แถวสุดท้ายกลืนเศษความสูงที่เหลือทั้งหมด — ไม่ใช่ปัดลงแล้วเหลือแถบว่างท้ายภาพ
    const height = r === layout.length - 1 ? canvasHeight - y : Math.floor((canvasHeight * row.h) / totalH)
    const totalW = row.cols.reduce((a, w) => a + w, 0)
    let x = 0
    for (let c = 0; c < row.cols.length; c++) {
      // ช่องสุดท้ายของแถวกลืนเศษความกว้าง ด้วยเหตุผลเดียวกัน
      const width = c === row.cols.length - 1 ? canvasWidth - x : Math.floor((canvasWidth * row.cols[c]!) / totalW)
      out.push({ x, y, width, height })
      x += width
    }
    y += height
  }
  return out
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
  /** เลย์เอาต์ที่ร้านเลือก/ปรับเอง — ไม่ส่งมา = โหมด auto ให้เดาจากจำนวนปุ่ม (ดู defaultLayoutKeyForCount) */
  layout?: RichMenuLayout
}): LineRichMenuObject {
  if (!isChatBarTextValid(input.chatBarText)) {
    throw new Error('RICH_MENU_CHAT_BAR_INVALID')
  }
  if (input.buttons.length > RICH_MENU_MAX_AREAS) {
    throw new Error('RICH_MENU_TOO_MANY_AREAS')
  }
  const layout = resolveLayout(input.layout, input.buttons.length)
  // 🛑 จำนวนปุ่มต้องเท่ากับจำนวนช่องของเลย์เอาต์เป๊ะ — ไม่งั้นจะมีช่องที่ไม่มี action (กดแล้วเงียบ)
  // หรือปุ่มที่ไม่มีช่อง (หายไปเฉย ๆ) ทั้งสองอย่างเงียบสนิทถ้าไม่ตรวจ
  if (input.buttons.length !== countCells(layout)) {
    throw new Error('RICH_MENU_BUTTON_COUNT_MISMATCH')
  }
  if (input.buttons.some((b) => !b.label.trim())) {
    throw new Error('RICH_MENU_LABEL_REQUIRED')
  }
  const bounds = layoutBounds(layout)

  return {
    size: { width: RICH_MENU_CANVAS_WIDTH, height: RICH_MENU_CANVAS_HEIGHT },
    // false = ให้เมนูหุบไว้ตอนลูกค้าเปิดห้องแชทครั้งแรก ลูกค้าแตะแถบเองเพื่อเปิด
    // (true = กางค้าง ซึ่งกินพื้นที่จอครึ่งหนึ่งและบังบทสนทนา)
    selected: false,
    name: input.name,
    chatBarText: input.chatBarText.trim(),
    areas: input.buttons.map((b, i) => ({
      bounds: bounds[i]!,
      action: toLineAction(b.action, b.label.trim()),
    })),
  }
}

// ---------------------------------------------------------------------------
// ตรวจภาพ
// ---------------------------------------------------------------------------

export type RichMenuImageMeta = { bytes: number; width: number; height: number; mime: string }

/**
 * อ่านขนาดภาพจากไบต์หัวไฟล์ (PNG + JPEG)
 *
 * 🛑 อยู่ในไฟล์ pure โดยตั้งใจเพื่อให้ **เทสจับได้** — JPEG เก็บ **ความสูงก่อนความกว้าง** ซึ่งสลับ
 * กันได้ง่ายมากเวลาเขียน และถ้าสลับ ภาพ 2500×1686 จะถูกอ่านเป็น 1686×2500 → สัดส่วน 0.67
 * → `validateRichMenuImage` ตีตกทุกใบ แปลว่า **ร้านจะเปิดเมนูไม่ได้เลยสักร้าน** โดยที่ tsc/build
 * ผ่านหมดและข้อความ error ก็ดูสมเหตุสมผล ("ภาพแบนเกินไป")
 *
 * ไม่ใช้ sharp ที่มีอยู่แล้ว: ตรงนี้อ่านแค่เลขสองตัวไม่ได้แปลงภาพ การปลุก sharp แพงกว่าที่ได้
 * และมันเป็น optional dependency ที่เคยมีปัญหาเรื่อง binary บนบางแพลตฟอร์ม
 *
 * คืน null เมื่ออ่านไม่ออก → ผู้เรียกส่ง 0×0 เข้า `validateRichMenuImage` แล้วถูกตีตกพร้อมเหตุผล
 * ซึ่งเป็นผลลัพธ์ที่ถูกต้อง (ไฟล์ที่อ่านหัวไม่ออกไม่ควรถูกส่งขึ้น LINE อยู่แล้ว)
 */
export function readImageSize(
  buf: Uint8Array,
  mime: string,
): { width: number; height: number } | null {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  try {
    if (mime === 'image/png') {
      // PNG: IHDR อยู่ที่ byte 16 เสมอ (8 signature + 4 length + 4 type) width ก่อน height
      if (buf.byteLength < 24) return null
      return { width: view.getUint32(16), height: view.getUint32(20) }
    }
    // JPEG: เดินทีละ marker หา SOFn (0xC0–0xCF ยกเว้น C4/C8/CC ซึ่งไม่ใช่ frame header)
    // โครง SOF จาก marker: [FF][Cn][len:2][precision:1][height:2][width:2]
    let i = 2
    while (i + 9 < buf.byteLength) {
      if (buf[i] !== 0xff) {
        i++
        continue
      }
      const marker = buf[i + 1]!
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: view.getUint16(i + 5), width: view.getUint16(i + 7) }
      }
      i += 2 + view.getUint16(i + 2)
    }
    return null
  } catch {
    return null
  }
}

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

// ---------------------------------------------------------------------------
// โหมดภาพ: ระบบวาดให้ (AUTO) vs ร้านอัปโหลดเอง (CUSTOM)  — D-RM-2b
// ---------------------------------------------------------------------------

/**
 * เก็บโหมด+เลย์เอาต์ลง `templateKey` แทนการเพิ่มคอลัมน์ใหม่
 *
 * 🛑 ทำไมไม่เพิ่มคอลัมน์: `LineRichMenu.templateKey` เป็น String ที่มีหน้าที่ "บอกว่าเมนูนี้ประกอบ
 * จากอะไร" อยู่แล้ว โหมด CUSTOM ก็คือ "ประกอบจากภาพของร้าน + เลย์เอาต์ที่เลือก" ซึ่งเป็นคำตอบของ
 * คำถามเดียวกัน — เพิ่มคอลัมน์ = ข้อมูลสองที่ที่ต้องคอยให้ตรงกัน (เคยพลาดคลาสนี้มาแล้วหลายรอบ)
 *
 * รูปแบบ: `custom:<layoutKey>` เช่น `custom:grid-3x2` · ค่าอื่นทั้งหมด = โหมด AUTO (เทมเพลตของระบบ)
 */
const CUSTOM_PREFIX = 'custom:'
/** รูปแบบที่สองของโหมด CUSTOM — เลย์เอาต์ที่ร้านปรับสัดส่วนเอง จึงไม่มีคีย์เทมเพลตให้อ้าง */
const GRID_PREFIX = 'g:'

/** `2*1|1*2-1` = แถวบนสูง 2 ส่วนช่องเดียว / แถวล่างสูง 1 ส่วน แบ่ง 2:1 */
function encodeGrid(layout: RichMenuLayout): string {
  return layout.map((r) => `${r.h}*${r.cols.join('-')}`).join('|')
}

function decodeGrid(spec: string): RichMenuLayout | null {
  const layout: RichMenuLayout = []
  for (const part of spec.split('|')) {
    const [hRaw, colsRaw] = part.split('*')
    if (hRaw === undefined || colsRaw === undefined) return null
    const h = Number(hRaw)
    const cols = colsRaw.split('-').map(Number)
    layout.push({ h, cols })
  }
  return isValidLayout(layout) ? layout : null
}

/**
 * เก็บเลย์เอาต์ลง `templateKey` ตามกติกาเดิมของไฟล์นี้ (ไม่เพิ่มคอลัมน์ — ดูเหตุผลด้านล่าง)
 *
 * 🛑 เลย์เอาต์ที่ "ตรงกับเทมเพลตสำเร็จพอดี" ยังเขียนเป็น `custom:<key>` แบบเดิมเป๊ะ ๆ
 * เพื่อให้แถวที่มีอยู่แล้วบน prod อ่านได้เหมือนเดิมและไม่เกิดสตริงสองแบบที่หมายถึงของเดียวกัน
 */
export function encodeCustomTemplateKey(layout: RichMenuLayout): string {
  const preset = matchPresetKey(layout)
  if (preset) return `${CUSTOM_PREFIX}${preset}`
  return `${CUSTOM_PREFIX}${GRID_PREFIX}${encodeGrid(layout)}`
}

export type TemplateKeyInfo =
  | { mode: 'AUTO'; layoutKey: null; layout: null }
  /** `layoutKey` ไม่ null เฉพาะตอนที่เลย์เอาต์ตรงกับเทมเพลตสำเร็จ — `layout` มีเสมอ ใช้ตัวนี้คำนวณ */
  | { mode: 'CUSTOM'; layoutKey: RichMenuLayoutKey | null; layout: RichMenuLayout }

/**
 * อ่านโหมดจาก `templateKey`
 *
 * 🛑 `custom:` ที่ตามด้วยคีย์ที่ไม่รู้จัก ต้องตกเป็น **AUTO** ไม่ใช่ CUSTOM ที่มี layout พัง —
 * fail-closed: แถวที่ข้อมูลเพี้ยน (แก้มือ/ของเก่า/คีย์ถูกถอดออกภายหลัง) ต้องถอยไปทางที่ยังใช้ได้
 * ไม่ใช่พาไปสู่สถานะที่ประกอบ payload ไม่ได้
 */
export function parseTemplateKey(templateKey: string): TemplateKeyInfo {
  const auto = { mode: 'AUTO', layoutKey: null, layout: null } as const
  if (!templateKey.startsWith(CUSTOM_PREFIX)) return auto
  const rest = templateKey.slice(CUSTOM_PREFIX.length)

  if (rest.startsWith(GRID_PREFIX)) {
    const layout = decodeGrid(rest.slice(GRID_PREFIX.length))
    // สเปกที่อ่านไม่ออก/เกินเพดาน = ถอยไป AUTO ตามเจตนา fail-closed เดิม ไม่ใช่ซ่อมให้เดา
    if (!layout) return auto
    return { mode: 'CUSTOM', layoutKey: matchPresetKey(layout), layout }
  }

  if (!isRichMenuLayoutKey(rest)) return auto
  return { mode: 'CUSTOM', layoutKey: rest, layout: layoutRows(rest) }
}

// ---------------------------------------------------------------------------
// การแก้โครงช่องจากหน้าจอ (D-RM-2c) — ฟังก์ชันบริสุทธิ์ทั้งหมด
//
// 🛑 ตรรกะพวกนี้ต้องอยู่ที่นี่ ไม่ใช่ในเทอร์นารีกลาง JSX — เกณฑ์ไม่ใช่ "ซับซ้อนพอไหม" แต่คือ
// "ถ้าเขียนกลับด้านแล้วจะมีอะไรจับได้ไหม" (`docs/conventions/ui-boolean-needs-a-testable-home.md`)
// ทุกตัวคืน layout ใหม่เสมอ ไม่แก้ของเดิม เพื่อให้ React เห็นการเปลี่ยนแปลง
// ---------------------------------------------------------------------------

const clone = (l: RichMenuLayout): RichMenuLayout => l.map((r) => ({ h: r.h, cols: [...r.cols] }))

/** เพิ่มแถวใหม่ได้ไหม — ติดได้ 2 เพดานคนละเหตุผล ต้องบอกร้านให้ตรงเหตุ */
export function canAddRow(layout: RichMenuLayout): boolean {
  return layout.length < RICH_MENU_MAX_ROWS && countCells(layout) < RICH_MENU_MAX_AREAS
}

/** เพิ่มช่องในแถวนี้ได้ไหม */
export function canAddCell(layout: RichMenuLayout, rowIndex: number): boolean {
  const row = layout[rowIndex]
  if (!row) return false
  return row.cols.length < RICH_MENU_MAX_COLS_PER_ROW && countCells(layout) < RICH_MENU_MAX_AREAS
}

/** 🛑 ลบแถวสุดท้ายทิ้งไม่ได้ — เมนูที่ไม่มีช่องเลยประกอบ payload ไม่ได้ */
export function canRemoveRow(layout: RichMenuLayout): boolean {
  return layout.length > 1
}

/** 🛑 ลบช่องสุดท้ายของแถวไม่ได้ — แถวที่ไม่มีช่องเป็นสถานะที่ `isValidLayout` ปฏิเสธอยู่แล้ว */
export function canRemoveCell(layout: RichMenuLayout, rowIndex: number): boolean {
  const row = layout[rowIndex]
  return Boolean(row && row.cols.length > 1)
}

export function addRow(layout: RichMenuLayout): RichMenuLayout {
  if (!canAddRow(layout)) return layout
  return [...clone(layout), { h: 1, cols: [1] }]
}

export function removeRow(layout: RichMenuLayout, rowIndex: number): RichMenuLayout {
  if (!canRemoveRow(layout) || !layout[rowIndex]) return layout
  return clone(layout).filter((_, i) => i !== rowIndex)
}

export function addCell(layout: RichMenuLayout, rowIndex: number): RichMenuLayout {
  if (!canAddCell(layout, rowIndex)) return layout
  const next = clone(layout)
  next[rowIndex]!.cols.push(1)
  return next
}

export function removeCell(layout: RichMenuLayout, rowIndex: number, colIndex: number): RichMenuLayout {
  if (!canRemoveCell(layout, rowIndex) || layout[rowIndex]!.cols[colIndex] === undefined) return layout
  const next = clone(layout)
  next[rowIndex]!.cols.splice(colIndex, 1)
  return next
}

/** ปรับน้ำหนัก — 🛑 ตัดที่เพดานเงียบ ๆ ไม่วนกลับ (วนกลับ = กด + แล้วช่องหดลง ซึ่งอ่านว่าเสีย) */
export function bumpRowHeight(layout: RichMenuLayout, rowIndex: number, delta: number): RichMenuLayout {
  const row = layout[rowIndex]
  if (!row) return layout
  const h = Math.min(RICH_MENU_WEIGHT_MAX, Math.max(RICH_MENU_WEIGHT_MIN, row.h + delta))
  if (h === row.h) return layout
  const next = clone(layout)
  next[rowIndex]!.h = h
  return next
}

export function bumpCellWidth(
  layout: RichMenuLayout,
  rowIndex: number,
  colIndex: number,
  delta: number,
): RichMenuLayout {
  const cur = layout[rowIndex]?.cols[colIndex]
  if (cur === undefined) return layout
  const w = Math.min(RICH_MENU_WEIGHT_MAX, Math.max(RICH_MENU_WEIGHT_MIN, cur + delta))
  if (w === cur) return layout
  const next = clone(layout)
  next[rowIndex]!.cols[colIndex] = w
  return next
}

/**
 * ลำดับของช่องนี้ในรายการปุ่ม (แบน เรียงบน→ล่าง ซ้าย→ขวา)
 *
 * 🛑 ต้องใช้ตัวนี้เวลาจะบอกร้านว่า "ลบช่องนี้แล้วปุ่มไหนจะหาย" — นับเองในหน้าจอแล้วพลาด
 * = ร้านเห็นชื่อปุ่มผิดในกล่องยืนยัน แล้วกดตกลงทั้งที่กำลังลบของที่ไม่ได้ตั้งใจ
 */
export function cellIndexOf(layout: RichMenuLayout, rowIndex: number, colIndex: number): number {
  let n = 0
  for (let r = 0; r < rowIndex; r++) n += layout[r]?.cols.length ?? 0
  return n + colIndex
}

/** สัดส่วนของแถว/ช่องเป็นเปอร์เซ็นต์ (ไว้แสดงบนหน้าจอ) — ปัดเป็นจำนวนเต็ม */
export function rowHeightPct(layout: RichMenuLayout, rowIndex: number): number {
  const total = layout.reduce((a, r) => a + r.h, 0)
  return Math.round(((layout[rowIndex]?.h ?? 0) / total) * 100)
}

export function cellWidthPct(layout: RichMenuLayout, rowIndex: number, colIndex: number): number {
  const row = layout[rowIndex]
  if (!row) return 0
  const total = row.cols.reduce((a, w) => a + w, 0)
  return Math.round(((row.cols[colIndex] ?? 0) / total) * 100)
}

/**
 * ช่องไหนเล็กจนนิ้วกดไม่ค่อยโดน — คืน index (แบน) ของช่องเหล่านั้น
 *
 * 🛑 วัดจาก **พิกเซลจริงที่ `layoutBounds()` คำนวณ** ไม่ใช่จากเปอร์เซ็นต์โดยประมาณ
 * เพราะช่องแคบในแถวที่เตี้ยด้วยจะเล็กสองทาง ซึ่งเปอร์เซ็นต์แกนเดียวมองไม่เห็น
 * เป็น **คำเตือน ไม่ใช่ตัวบล็อก** — LINE รับเมนูแบบนี้ตามปกติ
 */
export function tooSmallCellIndexes(layout: RichMenuLayout): number[] {
  return layoutBounds(layout)
    .map((b, i) => (b.width < RICH_MENU_MIN_TAP_PX || b.height < RICH_MENU_MIN_TAP_PX ? i : -1))
    .filter((i) => i >= 0)
}
