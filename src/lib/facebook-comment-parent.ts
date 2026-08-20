/**
 * facebook-comment-parent — ตัดสินว่าคอมเมนต์ที่ Meta ส่งมาเป็น "reply ของคอมเมนต์อื่น" หรือไม่
 *
 * 🛑 SSOT ของกติกานี้ (Hard Rule 16) — ทั้งฝั่ง webhook และฝั่ง Graph backfill ต้องเรียกตัวนี้
 * ห้ามเขียนเงื่อนไขเอง เพราะค่าที่ได้ไปลงคอลัมน์ `PageComment.parentExternalId` ซึ่งเป็นตัวตัดสิน
 * ว่าคอมเมนต์จะมีที่ยืนบนหน้าจอหรือไม่
 *
 * ## ทำไมเกณฑ์เดิมผิด
 *
 * เดิมเขียนว่า `parent_id !== post_id ⇒ เป็น reply` พร้อมคอมเมนต์ว่า "ยืนยันจาก payload จริง"
 * — **จริงเฉพาะโพสต์รูปเดียว** สำหรับโพสต์อัลบั้ม/หลายรูป Meta ส่ง `post_id` เป็นสตอรีของ *รูปย่อย*
 * แต่ `parent_id` เป็นสตอรีของ *อัลบั้มแม่* ⇒ สองค่าไม่เท่ากันทั้งที่เป็นคอมเมนต์ระดับบน
 * ⇒ ถูกบันทึกเป็น "reply ของคอมเมนต์ที่ไม่มีอยู่จริง" ⇒ ตัวประกอบต้นไม้ทิ้งทั้งใบ
 * ⇒ ผู้ขายเห็น "ยังไม่ตอบ 2" คู่กับ "ยังไม่มีความคิดเห็นในโพสต์นี้" บนจอเดียวกัน และคำว่า "สนใจ"
 * ของลูกค้าค้าง 7 วันโดยไม่มีใครเห็น (user เจอเองบน prod 2026-08-20 พร้อมภาพเทียบกับ Facebook)
 *
 * ## เกณฑ์ที่ถูก
 *
 * id ของ Meta อยู่ในรูป `{objectId}_{n}` และ **reply ต้องอยู่บน object เดียวกับตัวมันเอง**
 * ⇒ เป็น reply ก็ต่อเมื่อ `parent_id` กับ `comment_id` มี objectId ตัวหน้าเหมือนกัน
 *
 * ## พิสูจน์แล้วกับข้อมูล prod จริง (2026-08-20, 510 แถวที่มาจาก webhook และมี parent_id)
 *
 *   | prefix ตรง | หาแถวแม่เจอ | แถว | ความหมาย                                    |
 *   |-----------|------------|-----|---------------------------------------------|
 *   | ✗         | ✗          |   8 | ไม่ใช่ reply — `parent_id` เป็น id ของอัลบั้ม |
 *   | ✓         | ✗          |   6 | reply จริง แต่เราไม่เคยเก็บแม่ (backfill ตัน) |
 *   | ✓         | ✓          | 496 | reply ปกติ                                   |
 *
 * **ไม่มีแถวไหนที่ prefix ตรงแต่ไม่ใช่ reply และไม่มีแถวไหนที่ prefix ไม่ตรงแต่แม่มีอยู่จริง**
 * (เกณฑ์เดิมจะตอบผิดกับ 8 แถวแรก — และตอบผิดในทางที่ทำให้คอมเมนต์หายจากจอ ไม่ใช่แค่ป้ายผิด)
 *
 * ## ยังไม่พอ ต้องมีตาข่ายอีกชั้น
 *
 * เกณฑ์นี้กันรูปแบบที่เรา **รู้จักแล้ว** — รูปแบบที่ Meta ยังไม่เคยส่งมาให้เห็นต้องพึ่ง
 * `visibleTopLevelComments()` ที่ยกคอมเมนต์กำพร้าขึ้นเป็นระดับบนแทนที่จะทิ้ง (คนละไฟล์ คนละชั้น
 * โดยตั้งใจ — ดู `src/lib/comment-tree-visibility.ts`)
 */

/** objectId ตัวหน้าของ id รูป `{objectId}_{n}` — คืน null ถ้าไม่ใช่รูปนั้น */
function objectIdOf(id: string | null | undefined): string | null {
  if (!id) return null
  const i = id.indexOf('_')
  if (i <= 0) return null
  return id.slice(0, i)
}

/**
 * คืนค่าที่ควรลง `PageComment.parentExternalId`
 *
 * - `null` = คอมเมนต์ระดับบน (รวมกรณีที่ Meta ส่ง `parent_id` มาแต่เป็น id ของโพสต์/อัลบั้ม)
 * - สตริง = id ของคอมเมนต์แม่จริง ๆ
 *
 * fail-closed: อ่าน objectId ไม่ออกฝั่งไหนก็ตาม ⇒ ถือว่าเป็นระดับบน เพราะการเดาผิดทางนั้น
 * ทำให้คอมเมนต์ "โผล่เกิน" (เห็นแล้วกดตอบได้ แค่ไม่ซ้อนใต้ใคร) ส่วนเดาผิดอีกทางทำให้ **หายไปเลย**
 */
export function resolveCommentParentId(params: {
  parentId: string | null | undefined
  commentId: string | null | undefined
}): string | null {
  const { parentId, commentId } = params
  if (!parentId) return null
  const parentObj = objectIdOf(parentId)
  const commentObj = objectIdOf(commentId)
  if (!parentObj || !commentObj) return null
  return parentObj === commentObj ? parentId : null
}
