// เงื่อนไขจองกล่องรูปแชทล่วงหน้า (M3) — แยกเป็นฟังก์ชันบริสุทธิ์ให้เทสจับได้
// (ui-boolean-needs-a-testable-home.md) · ไม่วัด DOM: ขนาดมาจาก server เท่านั้น

/** ทรงช่องของอัลบั้ม — 3 แบบตายตัว */
export type TileShape = 'PORTRAIT' | 'SQUARE' | 'LANDSCAPE'

/** เกณฑ์กว้าง ๆ — รูปที่เกือบจัตุรัส (0.85–1.2) ให้เป็นจัตุรัสไปเลย */
export function shapeFromRatio(ratio: number): TileShape {
  if (ratio <= 0.85) return 'PORTRAIT'
  if (ratio >= 1.2) return 'LANDSCAPE'
  return 'SQUARE'
}

const pos = (n: number | null | undefined): n is number => typeof n === 'number' && n > 0

/** รู้ขนาด = ทั้งกว้างและสูง > 0 (ขาดข้างเดียวถือว่าไม่รู้ ไม่จองครึ่งเดียว) */
export function knownChatImageSize(
  w: number | null | undefined,
  h: number | null | undefined,
): { width: number; height: number } | null {
  return pos(w) && pos(h) ? { width: w, height: h } : null
}

/**
 * ทรงเริ่มต้นของอัลบั้มจากรูปนำ — ไม่รู้ขนาด = SQUARE (พฤติกรรมเดิม แล้ว onMeasure ปรับทีหลัง)
 */
export function initialAlbumShape(w: number | null | undefined, h: number | null | undefined): TileShape {
  const s = knownChatImageSize(w, h)
  return s ? shapeFromRatio(s.width / s.height) : 'SQUARE'
}

/**
 * พื้นหลัง placeholder ของรูปเดี่ยว: ใส่เฉพาะ "รู้ขนาด + รูปธรรมดา + ยังไม่โหลด"
 * (สติกเกอร์โปร่งใส ไม่ต้องมีพื้น · โหลดแล้วถอดออกกันพื้นโผล่ใต้รูปโปร่งใส)
 */
export function shouldShowImagePlaceholder(opts: { known: boolean; isSticker: boolean; loaded: boolean }): boolean {
  return opts.known && !opts.isSticker && !opts.loaded
}
