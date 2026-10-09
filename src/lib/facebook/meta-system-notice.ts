/**
 * ข้อความระบบที่ Meta Business Suite ใส่ลงเธรดในนามเพจ (เปลี่ยนสถานะลีด/ย้ายสแปม/มอบหมายแชท)
 * Graph คืนมาเหมือนข้อความที่ร้านพิมพ์เอง (from = เพจ, ไม่มีธงแยก) — prod 2026-10-09 พบ 1,563 แถว
 * ถูกเก็บเป็นข้อความ SHOP ⇒ ห้องดูเหมือนร้านตอบแล้ว · AI ร่างคำตอบข้ามเพราะข้อความล่าสุดไม่ใช่ลูกค้า
 * รายการนี้มาจากข้อความจริงบน prod เท่านั้น — เจอรูปใหม่ให้เพิ่มพร้อมเทส
 */
const PATTERNS = [
  /^Lead stage set to [A-Za-z ]{1,40}$/,
  /^This message was automatically moved to spam\.$/,
  /^.{1,80} assigned this conversation to .{1,80}\.$/,
]

export function isMetaSystemNotice(text: string | null | undefined): boolean {
  const t = text?.trim()
  return !!t && PATTERNS.some((re) => re.test(t))
}
