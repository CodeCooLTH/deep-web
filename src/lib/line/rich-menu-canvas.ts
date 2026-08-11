/**
 * rich-menu-canvas — เรนเดอร์ภาพเมนูลัดในเบราว์เซอร์ของผู้ขาย (feature 00045, client-only)
 *
 * ทำไมต้องเรนเดอร์ฝั่ง client: server ไม่มีฟอนต์ Anuphan ติดตั้ง และการเพิ่ม headless renderer
 * บน Vercel function เป็นงานคนละขนาด (เหตุผลเดียวกับที่ preview วิดีโอที่ต้อง ffmpeg ยังไม่ทำ)
 * เบราว์เซอร์ของผู้ขายมีฟอนต์โหลดอยู่แล้วจากตัวหน้าเว็บเอง — TD-RM-1
 *
 * 🛑 พิกัดปุ่มมาจาก `layoutBounds()` **ตัวเดียวกับที่ประกอบ payload ส่ง LINE** — ถ้าสองฝั่งคำนวณ
 * คนละสูตร ภาพกับพื้นที่กดจะเหลื่อมกัน แล้ว **ลูกค้าจะกดโดนปุ่มผิด** โดยไม่มี tsc/เทส/ตาเปล่า
 * จับได้เลย (TD-RM-6)
 *
 * 🛑 ไม่มีไอคอนในรอบนี้ (user เคาะ 2026-08-11): โปรเจกต์ยังไม่เคยวาด SVG ลง canvas การดึง path
 * ของ tabler มาวาดเองเพิ่มจุดล้มเหลวใหม่บนเส้นทางที่มี font timing เป็นความเสี่ยงอยู่แล้ว
 */

import {
  RICH_MENU_CANVAS_HEIGHT,
  RICH_MENU_CANVAS_WIDTH,
  RICH_MENU_IMAGE_MAX_BYTES,
} from './constants'
import { layoutBounds, layoutFor, type RichMenuButton } from './rich-menu'

/**
 * พาเลตของภาพนี้ = **ฝั่งผู้ซื้อ** ไม่ใช่ Paces
 *
 * 🛑 ภาพนี้ไปโผล่ในแอป LINE ของ **ลูกค้า** ไม่ใช่บนหน้าจอผู้ขาย — precedent ตรงจากการ์ด Flex
 * ของ 00025 ที่ระบุไว้ว่า "สีการ์ดใช้พาเลตฝั่งผู้ซื้อ ห้าม paces-primary" ด้วยเหตุผลเดียวกันเป๊ะ
 * ค่าทั้งหมดคัดจาก `.impeccable/design.json` ไม่ได้เลือกเอง (canvas ใช้คลาส Tailwind ไม่ได้
 * จึงต้องเป็นค่าจริง — ไม่ใช่การละเมิด HR7 ซึ่งว่าด้วย arbitrary value ใน JSX)
 */
const COLOR = {
  /** พื้นหลัง — ขาวล้วน ให้เมนูกลืนไปกับพื้นห้องแชทของ LINE */
  bg: '#FFFFFF',
  /** เส้นแบ่งช่อง — neutral ramp ระดับอ่อน */
  divider: '#E4E3E9',
  /** ตัวหนังสือ — Ink Plum (ไม่ใช่ดำสนิท ตาม DESIGN.md) */
  ink: '#2F2B3D',
} as const

const FONT_FAMILY = '"Anuphan", system-ui, -apple-system, "Segoe UI", sans-serif'

/** ขนาดตัวอักษรเริ่มต้นเทียบกับความสูงช่อง — ย่อลงเองถ้าคำยาวเกิน */
const FONT_RATIO = 0.16
const FONT_MIN_PX = 40
/** ระยะขอบในช่อง (กันคำชนเส้นแบ่ง) */
const PADDING_RATIO = 0.12

/**
 * ย่อขนาดตัวอักษรจนคำพอดีช่อง แล้วคืนขนาดที่ใช้ได้
 *
 * ทำไมย่อแทนการตัดคำ: คำบนปุ่มเป็นสิ่งที่ผู้ขายพิมพ์เองเพื่อให้ลูกค้าอ่านรู้เรื่อง การตัดเป็น
 * "เช็คสถานะ…" ทำให้ปุ่มกำกวมกว่าการที่ตัวอักษรเล็กลงหน่อย — แต่มีพื้นต่ำสุดไว้ (ต่ำกว่านั้น
 * อ่านไม่ออกบนมือถือจริง) เกินพื้นแล้วค่อยตัดด้วย ellipsis
 */
function fitFontSize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, startPx: number): number {
  let size = startPx
  while (size > FONT_MIN_PX) {
    ctx.font = `600 ${size}px ${FONT_FAMILY}`
    if (ctx.measureText(text).width <= maxWidth) return size
    size -= 4
  }
  return FONT_MIN_PX
}

/** ตัดท้ายด้วย … เมื่อย่อจนถึงพื้นแล้วยังไม่พอ */
function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text
  const chars = Array.from(text)
  let out = chars
  while (out.length > 1 && ctx.measureText(out.join('') + '…').width > maxWidth) {
    out = out.slice(0, -1)
  }
  return out.join('') + '…'
}

export type RenderRichMenuResult = { blob: Blob; width: number; height: number }

/**
 * เรนเดอร์ภาพเมนูจากรายการปุ่ม
 *
 * โยน error เมื่อจำนวนปุ่มไม่มีเลย์เอาต์รองรับ — ตัวเรียกต้องกัน UI ไม่ให้ไปถึงจุดนั้นอยู่แล้ว
 */
export async function renderRichMenuImage(
  buttons: Pick<RichMenuButton, 'label'>[],
): Promise<RenderRichMenuResult> {
  const layout = layoutFor(buttons.length)
  if (!layout) throw new Error('RICH_MENU_LAYOUT_UNSUPPORTED')

  /**
   * 🛑 ต้องรอฟอนต์ก่อนวาด — ถ้าไม่รอ ตัวอักษรไทยจะถูกวาดด้วยฟอนต์ fallback แล้ว **ฝังลงภาพจริง**
   * ที่ส่งไปให้ลูกค้า โดยที่ไม่มีอะไรผิดพลาดให้เห็นเลย (ภาพออกมาแล้ว แค่ผิดฟอนต์) เป็นความล้มเหลว
   * เงียบชนิดที่ต้องมีคนสังเกตเองบนเครื่องจริงถึงจะรู้
   */
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    await document.fonts.ready
  }

  const canvas = document.createElement('canvas')
  canvas.width = RICH_MENU_CANVAS_WIDTH
  canvas.height = RICH_MENU_CANVAS_HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('RICH_MENU_CANVAS_UNAVAILABLE')

  ctx.fillStyle = COLOR.bg
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const cells = layoutBounds(layout)

  // เส้นแบ่ง — วาดตามขอบของแต่ละช่อง แล้วเส้นรอบนอกจะถูกทับด้วยขอบภาพเอง
  ctx.strokeStyle = COLOR.divider
  ctx.lineWidth = 4
  for (const c of cells) {
    ctx.strokeRect(c.x, c.y, c.width, c.height)
  }

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = COLOR.ink

  cells.forEach((c, i) => {
    const label = buttons[i]?.label?.trim() ?? ''
    if (!label) return
    const maxWidth = c.width * (1 - PADDING_RATIO * 2)
    const size = fitFontSize(ctx, label, maxWidth, Math.round(c.height * FONT_RATIO))
    ctx.font = `600 ${size}px ${FONT_FAMILY}`
    ctx.fillText(ellipsize(ctx, label, maxWidth), c.x + c.width / 2, c.y + c.height / 2)
  })

  const blob = await toJpegUnderCap(canvas)
  return { blob, width: canvas.width, height: canvas.height }
}

/**
 * แปลงเป็น JPEG ให้ไม่เกินเพดาน 1MB ของ LINE
 *
 * 🛑 ไม่เขียนบันไดคุณภาพยาว ๆ แบบเผื่อไว้ — บทเรียน P-7 จาก retro 2026-08-11 (บันได 4 ขั้นของ
 * `buildLinePreviewJpeg` ที่ขั้น 2–4 ไม่มีทางถูกเรียกเลย) ภาพนี้เป็นพื้นขาวกับตัวหนังสือล้วน
 * ซึ่งบีบอัดได้ดีมาก คุณภาพ 0.92 ที่ 2500×1686 ออกมาราวหลักสิบ KB เท่านั้น — ขั้นที่สองมีไว้เป็น
 * ตาข่ายกันเหนียวเผื่อวันที่ภาพมีรูปประกอบ ถ้าวันนั้นมาถึงแล้วยังไม่พอ ค่อยวัดจริงแล้วเพิ่ม
 */
async function toJpegUnderCap(canvas: HTMLCanvasElement): Promise<Blob> {
  for (const quality of [0.92, 0.75]) {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality),
    )
    if (!blob) throw new Error('RICH_MENU_ENCODE_FAILED')
    if (blob.size <= RICH_MENU_IMAGE_MAX_BYTES) return blob
  }
  throw new Error('RICH_MENU_IMAGE_TOO_LARGE')
}
