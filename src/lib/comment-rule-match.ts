/**
 * comment-rule-match — "คอมเมนต์ใบนี้เข้ากฎไหน" (feature 00038 ส่วนขยาย E2, 2026-08-15)
 *
 * ที่มา: นับจากฐาน prod คอมเมนต์ระดับบนของลูกค้า 472 ใบ **ถามราคาตรง ๆ 164 ใบ (35%)** และ
 * บอกว่าสนใจ/ขอให้ทัก 92 ใบ (20%) — คำตอบใบเดียวจึงตอบตรงคำถามได้จริงแค่กลุ่มเดียว
 *
 * 🛑 ฟังก์ชันบริสุทธิ์ล้วน ไม่แตะ DB ไม่ยิงเน็ต — เพราะนี่คือตรรกะที่ "เขียนกลับด้านแล้วไม่มีอะไร
 * จับได้": ทุกกิ่งคืนกฎที่มีอยู่จริงเสมอ ผลลัพธ์จึงดูถูกต้องเสมอไม่ว่าจะเลือกใบไหน
 * (`docs/conventions/ui-boolean-needs-a-testable-home.md`)
 *
 * การ normalize ใช้ `normalizeMessage()` ตัวเดียวกับกลุ่มคำของแชท (HR16) — ผู้เรียกเป็นคน
 * normalize มาก่อนแล้วส่งเข้ามา ที่นี่ไม่ normalize ซ้ำ (idempotent อยู่แล้วแต่เสียเวลาเปล่า)
 */

/** รูปร่างขั้นต่ำที่ตัวเลือกกฎต้องใช้ — รับ superset ได้ (แถว CommentReplyRule ตรง ๆ) */
export type CommentRuleCandidate = {
  id: string
  /** null = กฎของทุกเพจ */
  shopChannelId: string | null
  /** ผ่าน normalizeMessage() มาแล้วตั้งแต่ตอนบันทึก */
  normalizedPhrases: string[]
  priority: number
  createdAt: string | Date
}

/**
 * เลือกกฎที่คอมเมนต์ใบนี้เข้าเงื่อนไข — **คืนกฎเดียว** (D-EXT2-3)
 *
 * เกณฑ์เรียงตามลำดับ (เกณฑ์แรกที่ต่างกันชนะ):
 *   1. **เจาะจงเพจก่อนเสมอ** — กฎที่ระบุ `shopChannelId` ตรงกับเพจนี้ ชนะกฎ "ทุกเพจ" (D-EXT2-2)
 *      ถ้าไม่มีข้อนี้ ตัวเลือก "ต่อเพจ" บนหน้าจอจะไม่มีความหมายเลย
 *   2. `priority` มากกว่าชนะ
 *   3. **กฎที่เก่ากว่าชนะ** (`createdAt` น้อยกว่า) — ต้องมีตัวตัดสินที่นิ่ง ไม่งั้นกฎที่ priority
 *      เท่ากันจะสลับกันชนะไปมาตามลำดับที่ Postgres บังเอิญคืนมา แล้วร้านจะเห็นคำตอบไม่เหมือนเดิม
 *      กับคอมเมนต์ที่หน้าตาเหมือนกัน โดยไม่มีอะไรอธิบายได้
 *   4. `id` น้อยกว่าชนะ — กันเคส `createdAt` เท่ากันเป๊ะ (สร้างพร้อมกันใน seed/import)
 *
 * 🛑 **สตริงว่างเป็นตัวอันตรายที่สุดของฟังก์ชันนี้** เพราะ `x.includes('')` เป็น **true เสมอ**
 * ⇒ อะไรก็ตามที่กลายเป็นสตริงว่างจะกินคอมเมนต์ทุกใบทันที และกินไปจาก fallback ของเพจด้วย
 * (บน prod มีคอมเมนต์ที่ไม่มีข้อความเลย 22 ใบ — แท็กเพื่อน/สติกเกอร์)
 *
 * กันสองชั้น และ **ทั้งสองชั้นพิสูจน์แล้วว่าไม่ซ้ำซ้อน** (mutation testing 2026-08-15):
 *   1. ตัดคำว่างออกจากลิสต์ของกฎ — ถอดออกแล้วเทสแดง 2 ข้อ
 *   2. ตัดข้อความว่างตั้งแต่ต้นฟังก์ชัน — ถอดออกเดี่ยว ๆ ไม่มีเทสแดง (ชั้นที่ 1 คลุมอยู่)
 *      **แต่มันคือชั้นเดียวที่กันเคส "สลับทิศ includes"** (`p.includes(text)` แทน
 *      `text.includes(p)` — ความผิดพลาดเรื่องลำดับอาร์กิวเมนต์ที่เกิดง่ายมาก) ซึ่งจะทำให้
 *      คอมเมนต์เปล่าเข้ากฎทุกใบ ⇒ ห้ามถอดออกเพราะ "ดูซ้ำซ้อน"
 *
 * `activeOnly` ไม่มีที่นี่โดยตั้งใจ — ผู้เรียกกรอง `isActive` ที่ชั้น query แล้ว (index รองรับ)
 * ถ้ารับ flag เข้ามาที่นี่ด้วยจะกลายเป็นกติกาเดียวกันสองที่ ซึ่งเป็นที่ที่มันจะแตกกันเงียบ ๆ
 */
export function matchCommentRule<T extends CommentRuleCandidate>(
  normalizedText: string,
  rules: T[],
  shopChannelId: string,
): T | null {
  const text = normalizedText.trim()
  if (!text) return null

  const hits = rules.filter(
    (r) =>
      (r.shopChannelId === null || r.shopChannelId === shopChannelId) &&
      r.normalizedPhrases.some((p) => p.trim() !== '' && text.includes(p)),
  )
  if (hits.length === 0) return null

  return hits.reduce((best, cur) => (compareRules(cur, best) < 0 ? cur : best))
}

/** < 0 = a ชนะ — ลำดับเกณฑ์ตาม docstring ของ matchCommentRule */
function compareRules(a: CommentRuleCandidate, b: CommentRuleCandidate): number {
  const aPage = a.shopChannelId !== null ? 1 : 0
  const bPage = b.shopChannelId !== null ? 1 : 0
  if (aPage !== bPage) return bPage - aPage
  if (a.priority !== b.priority) return b.priority - a.priority
  const at = new Date(a.createdAt).getTime()
  const bt = new Date(b.createdAt).getTime()
  if (at !== bt) return at - bt
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/**
 * กฎนี้สั่งให้ทำอะไรบ้าง — ใช้ทั้งฝั่งบันทึก (กันกฎที่ไม่ทำอะไรเลย) และฝั่งรัน
 *
 * 🛑 ตัวนี้คือเหตุผลที่ D-EXT2-4 ปลอดภัย: เมื่อกฎ match แล้วสั่งเฉพาะ "ตอบใต้คอมเมนต์"
 * ฝั่งทักแชท **ต้องไม่ตกกลับไปใช้ข้อความ fallback ของเพจ** ไม่งั้นร้านที่ตั้งใจว่า "คนพิมพ์ว่าสวย
 * ขอบคุณพอ ไม่ต้องทัก" จะยังโดนทักอยู่ดี ซึ่งตรงข้ามกับสิ่งที่สั่งไว้เป๊ะ ๆ
 * fallback ของเพจใช้เฉพาะตอน **ไม่มีกฎไหน match เลย** เท่านั้น
 */
export function ruleHasSomethingToSend(rule: {
  publicReplyText?: string | null
  publicReplyFileId?: string | null
  privateReplyText?: string | null
}): boolean {
  return (
    !!rule.publicReplyText?.trim() || !!rule.publicReplyFileId || !!rule.privateReplyText?.trim()
  )
}
