/**
 * comment-focus-target — "เปิดโพสต์แล้วควรจ่อตอบคอมเมนต์ใบไหน" (feature 00038)
 *
 * ที่มา (user 2026-08-15): *"ทำไมตอนกดเข้าไปในแต่ละคอมเมนต์ มันไม่ auto scroll ไปหา comment
 * นั้น ๆ และ focus ที่ panel reply ให้"*
 *
 * ต้นเหตุ: คอมมิต `feb297d4` เปลี่ยนคอลัมน์ซ้ายเป็น **1 แถว = 1 คอมเมนต์** และเก็บ id ของแถวที่
 * ถูกกดไว้ใน `highlightCommentId` แล้ว — แต่ **effect ที่เลือกเป้าหมายไม่เคยถูกแก้ตาม** มันยังใช้
 * กฎของยุค "1 แถว = 1 โพสต์" อยู่ (เลือกคอมเมนต์ลูกค้าที่ใหม่สุดที่ยังไม่มีคำตอบของเพจ) และ
 * `highlightCommentId` ถูกอ่านที่เดียวคือสีพื้นของแถวซ้าย คอลัมน์ขวาไม่เคยรู้เลยว่าผู้ใช้กดใบไหน
 * ⇒ กดคอมเมนต์ที่ 40 ของโพสต์ที่มี 199 คอมเมนต์ แล้วจอเด้งไปหาคอมเมนต์ใบล่าสุดแทน
 *
 * 🛑 แยกออกมาเป็นฟังก์ชันบริสุทธิ์ เพราะนี่คือตรรกะที่ "เขียนกลับด้านแล้วไม่มีอะไรจับได้" —
 * ทุกกิ่งคืนคอมเมนต์ที่มีอยู่จริงในเธรดเสมอ ผลลัพธ์จึงดูถูกต้องเสมอไม่ว่าจะเลือกใบไหน
 * (`docs/conventions/ui-boolean-needs-a-testable-home.md`)
 *
 * pure module — ไม่ import อะไรเลย
 */

/** รูปร่างขั้นต่ำที่ตัวเลือกเป้าหมายต้องใช้ — รับ superset ได้ (ThreadData['comments'][number]) */
export type FocusCandidate = {
  id: string
  externalCommentId: string
  parentExternalId: string | null
  isFromPage: boolean
  isDeleted: boolean
  createdTime: string | Date
}

/**
 * เลือกคอมเมนต์ที่ควร "จ่อตอบ + เลื่อนจอไปหา" หลังเธรดโหลดเสร็จ
 *
 * ลำดับความสำคัญ:
 *  1. **ใบที่ผู้ใช้กดมาเอง** — ชนะทุกกฎ ต่อให้ใบนั้นถูกตอบไปแล้วก็ตาม เพราะการกดคือการบอก
 *     เจตนาตรง ๆ ระบบไม่มีสิทธิ์เดาแทนว่าเขา "น่าจะอยากได้ใบอื่นมากกว่า"
 *     (ยังกันคอมเมนต์ของเพจเอง/ที่ถูกลบอยู่ — จ่อตอบตัวเองหรือตอบใบที่หายไปแล้วไม่มีความหมาย)
 *  2. คอมเมนต์ลูกค้าที่ใหม่สุด **และยังไม่มีคำตอบของเพจ** — กฎเดิมสำหรับกรณีที่ไม่ได้กดมาจากแถว
 *     (เช่นเปิดจากลิงก์ตรง) ยังถูกอยู่: ล่าสุดเฉย ๆ อาจเป็นคำตอบของเพจเอง
 *  3. คอมเมนต์ลูกค้าที่ใหม่สุด — ตอบครบหมดแล้วก็ยังตอบเสริมได้
 *  4. ไม่มีอะไรให้จ่อ → `null`
 *
 * `clickedCommentId` ที่หาไม่เจอในเธรด (ถูกลบระหว่างทาง) ตกไปข้อ 2 เอง — ไม่ throw ไม่คืน null
 */
export function pickCommentFocusTarget<T extends FocusCandidate>(
  comments: T[],
  clickedCommentId: string | null | undefined,
): T | null {
  const answerable = comments.filter((c) => !c.isFromPage && !c.isDeleted)

  if (clickedCommentId) {
    const clicked = answerable.find((c) => c.id === clickedCommentId)
    if (clicked) return clicked
  }

  const byNewest = [...answerable].sort(
    (a, b) => new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime(),
  )
  const unanswered = byNewest.find(
    (c) => !comments.some((r) => r.isFromPage && r.parentExternalId === c.externalCommentId),
  )
  return unanswered ?? byNewest[0] ?? null
}
