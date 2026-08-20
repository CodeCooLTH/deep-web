/**
 * comment-tree-visibility — "คอมเมนต์ระดับบนอันไหนควรอยู่ในเธรด" (feature 00038)
 *
 * สกัดออกมาเป็นฟังก์ชันบริสุทธิ์เพราะกฎนี้เคยผิดแบบเงียบ ๆ และผิดในทางที่แพงที่สุด:
 * ตัวเลข "ยังไม่ตอบ" ที่แถวซ้าย (นับฝั่ง server จากคอมเมนต์ลูกค้า **ทุกชั้น**) ไม่ตรงกับสิ่งที่
 * เห็นในเธรด (client ตัดคอมเมนต์ระดับบนของเพจทิ้ง แล้วลูกหายไปพร้อมพ่อ) — ผู้ขายเปิดโพสต์ที่
 * บอกว่า "ยังไม่ตอบ 1" แล้วเจอเธรดว่าง และคำถามของลูกค้าคนนั้นตอบไม่ได้เลย
 *
 * 🛑 นี่คือคลาส "ซ้ายบอก 8 แต่ panel บอก 7" ที่ CommentsClient.tsx เขียนคอมเมนต์เตือนไว้ถึง 3 ที่
 * แล้วยังกลับมาทางประตูที่ไม่มีใครเฝ้า — คำเตือนสามอันไม่ได้กันอันที่สี่ เทสกัน
 * (impeccable critique 2026-08-09 รอบ 2 · P1)
 */

export type CommentVisibilityRow = {
  externalCommentId: string
  parentExternalId: string | null
  isFromPage: boolean
  isDeleted: boolean
}

/**
 * คอมเมนต์ระดับบนที่ต้องแสดงในเธรด
 *
 * กติกา:
 *   - คอมเมนต์ของลูกค้า → แสดงเสมอ
 *   - คอมเมนต์ของเพจ → ซ่อนเป็นค่าตั้งต้น (ผู้ขายไม่ต้องอ่านสิ่งที่ตัวเองเขียน)
 *   - **ยกเว้นคอมเมนต์ของเพจที่มีลูกค้ามาตอบอยู่ข้างใต้ → ต้องแสดง** ไม่งั้นคำถามของลูกค้า
 *     หายไปทั้งกิ่ง ทั้งจากหน้าจอและจากตัวนับในเธรด
 *   - `showShopComments` = แสดงคอมเมนต์ของเพจทั้งหมด (ผู้ใช้เปิดเอง)
 *
 * คอมเมนต์ที่ถูกลบไม่นับเป็น "ลูกค้ามาตอบ" — กิ่งที่เหลือแต่คำตอบที่ถูกลบไม่มีอะไรให้ทำต่อ
 *
 * 🛑 **"ระดับบน" = ไม่มีพ่อ *หรือ* พ่อไม่อยู่ในชุดข้อมูลนี้ (กำพร้า)** — ไม่ใช่ `parentExternalId == null`
 * เฉย ๆ. เพิ่มเมื่อ 2026-08-20 หลัง user เจอเองบน prod: ลูกค้าคอมเมนต์ใต้โพสต์อัลบั้ม 2 ใบ
 * **ระดับบนทั้งคู่** (ภาพจาก Facebook ยืนยัน) แต่ Meta ส่ง `parent_id` เป็น **id ของอัลบั้ม
 * ไม่ใช่ id ของคอมเมนต์** เราเลยบันทึกเป็น reply ของคอมเมนต์ที่ไม่มีอยู่จริง แล้วที่นี่ทิ้งทั้งคู่
 * ⇒ จอเดียวกันขึ้น "ยังไม่ตอบ 2" คู่กับ "ยังไม่มีความคิดเห็นในโพสต์นี้" และคำว่า "สนใจ" ของลูกค้า
 * ค้าง 7 วันโดยไม่มีใครเห็น (ทั้ง prod เจอ 8 ใบ · 9 โพสต์ · 3 เพจ)
 *
 * ตาข่ายนี้ตั้งใจให้แยกจากการแก้ตัวจำแนกตอน ingest: ตัวนั้นกันรูปแบบที่เรา **รู้จักแล้ว** ส่วนตัวนี้
 * กันรูปแบบที่ Meta ยังไม่เคยส่งมาให้เห็น — กติกาที่ต้องบังคับคือ **ทุกแถวที่ตัวนับนับ ต้องมีที่ยืน
 * บนหน้าจอเสมอ** ไม่ว่า payload จะหน้าตาอย่างไร
 *
 * การยกขึ้นเป็นระดับบน **ไม่ใช่ใบเบิกให้โผล่** — กติกาเดิมยังบังคับต่อ (กำพร้าที่เป็นของเพจเอง
 * และไม่มีลูกค้ามาตอบ ยังถูกซ่อนตามเดิม)
 */
export function visibleTopLevelComments<T extends CommentVisibilityRow>(
  list: T[],
  showShopComments: boolean,
): T[] {
  const known = new Set(list.map((c) => c.externalCommentId))
  const isTop = (c: CommentVisibilityRow) => !c.parentExternalId || !known.has(c.parentExternalId)

  const hasCustomerReply = new Set<string>()
  for (const c of list) {
    if (isTop(c) || c.isFromPage || c.isDeleted) continue
    hasCustomerReply.add(c.parentExternalId as string)
  }
  return list.filter(
    (c) => isTop(c) && (showShopComments || !c.isFromPage || hasCustomerReply.has(c.externalCommentId)),
  )
}

/**
 * จำนวนคอมเมนต์ลูกค้าที่ยังไม่มีคำตอบของเพจอยู่ข้างใต้ — **นับจากทุกชั้น ไม่สนใจว่าอยู่ลึกแค่ไหน**
 *
 * ต้องใช้นิยามเดียวกับ `countCommentPostStatesByShop()` ฝั่ง server เป๊ะ ๆ เพราะสองเลขนี้ขึ้นจอ
 * เดียวกัน (แถวซ้าย vs ชิปในเธรด). เทสผูกทั้งคู่ไว้กับ fixture ชุดเดียวกัน
 */
export function countUnansweredComments(list: CommentVisibilityRow[]): number {
  const answeredByPage = new Set<string>()
  for (const c of list) {
    if (c.isFromPage && c.parentExternalId) answeredByPage.add(c.parentExternalId)
  }
  return list.filter((c) => !c.isFromPage && !c.isDeleted && !answeredByPage.has(c.externalCommentId))
    .length
}
