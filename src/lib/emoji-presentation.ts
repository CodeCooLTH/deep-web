/**
 * emoji-presentation — บังคับให้อักขระที่ "เป็นได้ทั้งตัวหนังสือและอิโมจิ" แสดงเป็นอิโมจิสี
 *
 * user report 2026-08-03: หัวใจที่ลูกค้า react ในเธรดขึ้นเป็นหัวใจดำเล็ก ๆ แบบตัวหนังสือ
 * ไม่ใช่หัวใจแดงเหมือนใน Facebook
 *
 * ต้นเหตุ: Meta ส่ง `reaction.emoji` มาเป็น **โค้ดพอยต์เปล่า** — ตรวจของจริงใน prod ได้
 * `U+2764` (HEAVY BLACK HEART) ยาว 1 อักขระ 3 ไบต์ ไม่มี variation selector ต่อท้าย
 * ตามมาตรฐาน Unicode อักขระกลุ่มนี้ (U+2600–U+27BF, U+2B00–U+2BFF, U+00A9, U+00AE, U+2122)
 * มี "default presentation = text" เบราว์เซอร์จึงวาดด้วยฟอนต์ข้อความปกติเป็นสัญลักษณ์ขาวดำ
 * ต้องต่อท้ายด้วย `U+FE0F` (VARIATION SELECTOR-16) ถึงจะบังคับให้เป็นอิโมจิสี
 *
 * ทำไมต่อท้ายให้ทุกตัวเลยไม่แยกเช็ค: VS-16 ที่ต่อท้ายอักขระซึ่ง "เป็นอิโมจิสีอยู่แล้ว"
 * (เช่น U+1F606) ไม่มีผลใด ๆ ตามสเปก — ปลอดภัยกว่าการเดาว่าอักขระไหนอยู่กลุ่มไหน และ
 * ไม่ต้องไล่ตามตารางเมื่อ Meta เพิ่มรีแอ็กชันใหม่
 *
 * ไม่ขัด Hard Rule 12 (ห้าม emoji ใน UI): ค่านี้คือ **ข้อมูลของลูกค้า** ที่กด react มาจริง
 * เหมือนเนื้อความในบับเบิล ไม่ใช่ emoji ที่เราเลือกมาตกแต่งหน้าจอเอง — และในไฟล์นี้ประกอบ
 * อักขระด้วย `String.fromCodePoint` ไม่มี emoji ตัวจริงอยู่ในซอร์สเลย (grep gate ผ่าน)
 *
 * pure module — ไม่ import อะไรเลย ใช้ได้ทั้ง client/server
 */

/** VARIATION SELECTOR-16 (U+FE0F) — เขียนเป็น escape เพื่อไม่ให้มีอักขระล่องหนในซอร์ส */
const VS16 = String.fromCodePoint(0xfe0f)

/** ทำให้อิโมจิที่ได้จากภายนอก (Meta reaction) แสดงเป็นสีเสมอ; คืนค่าเดิมถ้ามี VS-16 อยู่แล้ว */
export function withEmojiPresentation(emoji: string | null | undefined): string {
  if (!emoji) return ''
  return emoji.includes(VS16) ? emoji : emoji + VS16
}
