/**
 * byVertical — อ่านคำแปลที่ผันตามประเภทกิจการของร้าน (feature 00047)
 *
 *   byVertical(t.vocab.orderNoun, shopVertical)   // "คำสั่งซื้อ" / "order"
 *
 * 🛑 ทำไมต้องมีตัวกลาง ไม่เขียน `t.vocab.orderNoun[vertical]` ตรง ๆ
 * `Shop.vertical` เป็นคอลัมน์ `String` ใน Prisma (มี CHECK constraint ที่ฐาน แต่ไม่มี type ให้ TS
 * บังคับ) ⇒ ค่าที่ไหลมาถึงหน้าจอเป็น `string` เสมอ การ index ตรง ๆ จะได้ `undefined` เงียบ ๆ
 * แล้วโผล่เป็นช่องว่างบนหัวการ์ด ซึ่งไม่มีอะไรฟ้อง — ที่นี่ถอยไป `ONLINE_SALES` แบบ fail-closed
 * ตรงกับที่ `seller-menu.ts` ทำอยู่แล้วกับ `VERTICAL_VISIBLE_SLUGS` (Hard Rule 16: กติกาเดียวกัน
 * ต้องตัดสินเหมือนกันทุกที่)
 */
import type { Dictionary } from './dictionaries/th'

/** รูปร่างของ map ที่ผันตาม vertical — ทุกตัวใน `t.vocab` ใช้คีย์ชุดเดียวกันนี้ */
export type VerticalMap = Dictionary['vocab']['orderNoun']

export function byVertical(map: VerticalMap, vertical: string | null | undefined): string {
  return (map as Record<string, string | undefined>)[vertical ?? ''] ?? map.ONLINE_SALES
}
