/**
 * giphy-message-kind — แยก "สติกเกอร์" ออกจาก "GIF" ของข้อความที่มาจาก GIPHY
 *
 * ทำไมต้องมี: Meta ส่งสติกเกอร์ **และ** GIF ของ Instagram มาเป็น `attachment.type = "image"`
 * เหมือนกันหมด (เหมือนรูปถ่ายจริงด้วย) ⇒ รายการแชทเลยขึ้น **"[รูปภาพ]"** กับทุกอย่าง
 * ผู้ขายอ่านแล้วนึกว่าลูกค้าส่งรูปสินค้ามา ทั้งที่เป็นสติกเกอร์ (user แจ้ง 2026-08-27)
 *
 * ตัวแยกที่เชื่อได้: GIPHY ฝังพารามิเตอร์ของตัวเองไว้ใน path เป็น base64url —
 *   `…/media/v1.<base64>/…` → decode ได้ `cid=…&ep=v1_gifs_gifId&**ct=s**`
 *   `ct=s` = sticker · `ct=g` = gif  (ยืนยันกับ payload จริงบน prod ทั้งสองแบบ)
 *
 * 🛑 **fail-open เสมอ** — อ่านไม่ออก/ไม่ใช่ GIPHY → คืน `null` แล้วผู้เรียกใช้คำเดิม `[รูปภาพ]`
 * พารามิเตอร์นี้ไม่ได้อยู่ในเอกสารสาธารณะของใคร GIPHY เปลี่ยนรูปแบบเมื่อไหร่ก็ได้ ⇒ ห้ามให้
 * การอ่านไม่ออกกลายเป็นข้อความว่างหรือ throw (คลาสเดียวกับบทเรียน external payload ทั้งหมดในรีโปนี้)
 */

export type GiphyMessageKind = 'sticker' | 'gif'

/** host ของ GIPHY ที่เห็นจริงใน payload ของ Meta (`media0..N.giphy.com`) */
const GIPHY_HOST = /(^|\.)giphy\.com$/i

export function giphyMessageKind(url: string | null | undefined): GiphyMessageKind | null {
  if (!url) return null

  let host: string
  try {
    host = new URL(url).hostname
  } catch {
    return null
  }
  if (!GIPHY_HOST.test(host)) return null

  const seg = /\/media\/v1\.([A-Za-z0-9_-]+)\//.exec(url)
  // ไม่มีส่วน base64 = URL คนละรูปแบบ (เก่ากว่า/ใหม่กว่า) — รู้แค่ว่ามาจาก GIPHY แต่แยกชนิดไม่ได้
  // คืน null ให้ผู้เรียกใช้คำกลาง ดีกว่าเดาว่าเป็นสติกเกอร์แล้วเรียก GIF ผิดชื่อ
  if (!seg) return null

  let decoded: string
  try {
    const b64 = seg[1] + '='.repeat((4 - (seg[1].length % 4)) % 4)
    decoded = Buffer.from(b64, 'base64url').toString('utf8')
  } catch {
    return null
  }

  // อ่าน `ct=` ตัวสุดท้าย (เผื่อรูปแบบเปลี่ยนไปมีหลายตัว) — ค่าที่ไม่ใช่ s/g ถือว่าไม่รู้จัก
  const ct = /(?:^|&)ct=([a-z])/i.exec(decoded)?.[1]?.toLowerCase()
  if (ct === 's') return 'sticker'
  if (ct === 'g') return 'gif'
  return null
}

/** คำที่ใช้ในรายการแชท — สั้นเสมอ (คอลัมน์ซ้ายมีที่จำกัด) */
export function giphyPreviewLabel(kind: GiphyMessageKind): string {
  return kind === 'sticker' ? '[สติกเกอร์]' : '[GIF]'
}
