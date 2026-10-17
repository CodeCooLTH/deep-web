// feature 00078 — ย่อข้อความให้พอดีเพดานของแต่ละช่องทาง (TFR-030 · D-12) · pure module
// ตัวเลขเพดานจากเอกสารแพลตฟอร์ม (SDS §5) — Messenger/LINE ยืนยันผ่านแหล่งรอง ให้เปิดต้นฉบับซ้ำก่อนเปลี่ยนค่า
export type FitChannel = 'MESSENGER' | 'INSTAGRAM' | 'LINE' | 'DEEP'

export const CHANNEL_LIMIT: Record<FitChannel, { unit: 'utf16' | 'utf8-bytes'; max: number }> = {
  MESSENGER: { unit: 'utf16', max: 2000 },
  INSTAGRAM: { unit: 'utf8-bytes', max: 1000 },
  LINE: { unit: 'utf16', max: 5000 },
  DEEP: { unit: 'utf16', max: 2000 }, // SendChatMessageSchema.body
}

const encoder = new TextEncoder()

/** หน่วยที่ช่องทางนับ — utf16 (.length) เข้มกว่า code point จึงปลอดภัยกว่า */
export function measureForChannel(text: string, channel: FitChannel): number {
  return CHANNEL_LIMIT[channel].unit === 'utf8-bytes' ? encoder.encode(text).length : text.length
}

const URL_RE = /https?:\/\//i
const ELLIPSIS = '…'

/**
 * เกิน → ย่อ "บรรทัดยาวสุดที่ไม่ใช่ลิงก์" ด้วย "…" ที่ขอบ code point (ไม่ตัดกลาง surrogate pair)
 * ย่อบรรทัดเดียวไม่พอ → บรรทัดนั้นเหลือ "…"/ถูกตัดทิ้ง แล้วไปบรรทัดยาวถัดไป · บรรทัด URL ไม่แตะเด็ดขาด
 * ถ้ามีแต่ลิงก์ล้นเพดาน คืนตามเดิม (ปล่อยให้ผู้ส่งล้มเป็น ledger FAILED ดีกว่าส่งลิงก์พัง)
 */
export function fitToChannelLimit(text: string, channel: FitChannel): string {
  const { max } = CHANNEL_LIMIT[channel]
  if (measureForChannel(text, channel) <= max) return text
  const lines = text.split('\n')
  const candidates = lines
    .map((l, i) => ({ i, len: measureForChannel(l, channel) }))
    .filter((c) => !URL_RE.test(lines[c.i]))
    .sort((a, b) => b.len - a.len || a.i - b.i)
  for (const { i } of candidates) {
    const total = measureForChannel(lines.join('\n'), channel)
    const budget = max - (total - measureForChannel(lines[i], channel))
    const chars = Array.from(lines[i])
    let lo = 0
    let hi = chars.length
    // ค้นหาแบบทวิภาค: ความยาวนำหน้ามากสุดที่ + "…" แล้วไม่เกินงบ (การวัดเพิ่มตามความยาวเสมอ)
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (measureForChannel(chars.slice(0, mid).join('') + ELLIPSIS, channel) <= budget) lo = mid
      else hi = mid - 1
    }
    const fits = measureForChannel(ELLIPSIS, channel) <= budget
    lines[i] = fits ? chars.slice(0, lo).join('') + ELLIPSIS : ''
    if (fits) break
  }
  return lines.join('\n')
}
