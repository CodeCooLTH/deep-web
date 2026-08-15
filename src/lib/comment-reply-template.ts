/**
 * comment-reply-template — ตัวแทนชื่อลูกค้าในข้อความตอบกลับคอมเมนต์ (feature 00038, 2026-08-15)
 *
 * user สั่ง: *"เวลามัน reply มันแทรกชื่อ facebook ที่ reply ได้ไหม"* — ร้านพิมพ์ `{ชื่อ}` ลงใน
 * ข้อความตั้งค่า แล้วระบบแทนด้วย `PageComment.fromName` ตอนส่งจริง
 *
 * 🛑 นี่คือ **ที่เดียว** ที่รู้จักรูปแบบ placeholder — ทั้งฝั่งตอบใต้คอมเมนต์ ฝั่งทักแชทอัตโนมัติ
 * และช่องพิมพ์ของปุ่มทักแชทแบบแมนนวล ต้องเรียกตัวนี้ ห้ามใครเขียน `.replace('{ชื่อ}', …)` เอง
 * (HR16 — พิมพ์คำเดียวกันคนละที่แล้วแตกกันโดยไม่มีอะไรฟ้อง)
 *
 * ข้อจำกัดที่ต้องบอกร้านบนหน้าจอ: นี่คือ **ชื่อเป็นตัวหนังสือ ไม่ใช่การแท็ก** — แท็กตัวจริง
 * (@mention ที่กดแล้วเด้งไปโปรไฟล์) ต้องขอสิทธิ์เพิ่มจาก Meta ซึ่งเรายังไม่มี
 *
 * pure module — ไม่ import prisma/next ใช้ได้ทั้ง server และ client
 */

/** ตัวแทนชื่อลูกค้า — ภาษาไทยเพราะร้านเป็นคนพิมพ์เอง ไม่ใช่ token สำหรับโปรแกรมเมอร์ */
export const COMMENT_NAME_PLACEHOLDER = '{ชื่อ}'

/**
 * regex ของ placeholder พร้อมช่องว่าง (space/tab) ที่ติดมาทั้งสองข้าง
 *
 * 🛑 จับ `[ \t]` ไม่ใช่ `\s` — `\s` กิน `\n` ด้วย ซึ่งจะทำให้ข้อความ 2 ย่อหน้าของร้าน (ที่มี
 * บรรทัดว่างคั่นโดยตั้งใจ) ถูกยุบรวมเป็นย่อหน้าเดียวเมื่อลูกค้าไม่มีชื่อ
 */
const PLACEHOLDER_WITH_PADDING = /[ \t]*\{ชื่อ\}[ \t]*/g

/** ข้อความตั้งค่านี้มี `{ชื่อ}` อยู่ไหม (UI ใช้ตัดสินว่าจะโชว์ตัวอย่างหรือเปล่า) */
export function hasNamePlaceholder(template: string | null | undefined): boolean {
  return (template ?? '').includes(COMMENT_NAME_PLACEHOLDER)
}

/**
 * แทน `{ชื่อ}` ด้วยชื่อลูกค้า — คืนข้อความที่พร้อมส่งจริง
 *
 * `commenterName` ว่าง/null (คอมเมนต์ที่ดึงย้อนหลังผ่าน Graph ไม่มี `from` ติดมาเลย — ดู
 * docs/conventions/graph-access-depends-on-subject.md) → **ตัด placeholder ทิ้ง ห้ามปล่อยให้
 * ลูกค้าเห็นคำว่า `{ชื่อ}` โผล่ในคอมเมนต์สาธารณะ** ซึ่งจะดูเหมือนระบบพัง
 *
 * การตัดต้องเก็บกวาดช่องว่างด้วย ไม่ใช่ replace เป็นสตริงว่างเฉย ๆ:
 *   - มีช่องว่างขนาบสองข้าง (`แอดมิน {ชื่อ} ขออนุญาต`) → เหลือช่องว่างเดียว
 *   - ไม่มี/มีข้างเดียว (`แอดมิน{ชื่อ}ขออนุญาต`, `{ชื่อ} สนใจไหม`) → ตัดหมด ไม่เหลือช่องว่างลอย
 * แล้วค่อย trim หัวท้ายทั้งก้อนอีกที (กรณี placeholder อยู่ต้น/ท้ายข้อความ)
 */
export function renderCommentReplyText(
  template: string,
  commenterName?: string | null,
): string {
  if (!hasNamePlaceholder(template)) return template

  const name = (commenterName ?? '').trim()
  if (name) return template.split(COMMENT_NAME_PLACEHOLDER).join(name)

  return template
    .replace(PLACEHOLDER_WITH_PADDING, (matched) =>
      /^[ \t]/.test(matched) && /[ \t]$/.test(matched) ? ' ' : '',
    )
    .trim()
}
