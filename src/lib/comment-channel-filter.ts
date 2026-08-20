/**
 * comment-channel-filter — "ช่องทางไหนมีคอมเมนต์ได้บ้าง" ของกล่องข้อความแท็บความคิดเห็น
 *
 * 🛑 ข้อเท็จจริงข้อเดียวที่ทั้งไฟล์นี้มีอยู่: **`FacebookPost`/`PageComment` ผูกกับ `ShopChannel`
 * ที่เป็น `MESSENGER` เท่านั้นทั้งระบบ** (feature 00029 รับคอมเมนต์จากเพจ Facebook อย่างเดียว)
 * เดิมข้อเท็จจริงนี้ถูกเขียนไว้ในคอมเมนต์ของ `resolveCommentProvider()` ฝั่ง service เท่านั้น
 * ⇒ หน้าจอไม่มีทางรู้ และไปสร้าง segmented control 4 ปุ่มที่ **ไม่มีปุ่มไหนเปลี่ยนผลลัพธ์ได้เลย**:
 *   ALL → MESSENGER (ชุดเดียวกันเป๊ะ) · DEEP/INSTAGRAM → ไม่ match ช่องทางไหนเลย = ว่างทั้งจอ
 *
 * แยกออกมาจาก `page-comment.service.ts` เพื่อให้ข้อเท็จจริงข้อนี้มีที่อยู่ที่เทสจับได้ (HR16)
 * — ไฟล์นี้ต้องไม่มี dependency ใด ๆ เพราะเป็น pure lib ที่ทั้งฝั่ง Node และฝั่ง client
 * import ได้ (ถ้าดึง prisma ติดไปจะพัง bundle ของฝั่ง client)
 *
 * หมายเหตุ 2026-08-20: เคยมี `SHOW_COMMENT_CHANNEL_FILTER` อยู่ในไฟล์นี้ด้วย ให้หน้าจอ
 * ซ่อนพิลล์ช่องทางที่กดแล้วไม่เปลี่ยนอะไร — **ถอดออกแล้ว** เพราะ user เลือกให้หัวคอลัมน์ของ
 * แท็บความคิดเห็นเหมือนแท็บข้อความไว้ก่อน (สองแท็บนี้ต้องหน้าตาเดียวกัน สั่งไว้ 2 ครั้ง)
 */

/**
 * ค่าของพิลล์ช่องทางบนหัวคอลัมน์ซ้าย — ต้องเป็นชนิดเดียวกับที่ client ใช้ เพื่อให้ `tsc` บังคับ
 * ให้ทุกที่ที่เพิ่มค่าใหม่ (เช่นวันที่ LINE OA เข้ามา) ต้องแก้ครบทั้งสองฝั่ง
 */
export type CommentChannelFilter = 'ALL' | 'DEEP' | 'MESSENGER' | 'INSTAGRAM'

/**
 * ช่องทางที่ "มีคอมเมนต์ได้จริง" ณ วันนี้
 *
 * 🛑 วันที่รายการนี้ยาวขึ้น (เช่น Instagram comments เปิดใช้) ต้องแก้ **3 ที่พร้อมกัน** และเทส
 * `comment-channel-filter.test.ts` จะแดงเตือนให้เอง:
 *   1. `resolveCommentProvider()` ข้างล่าง — ตอนนี้คืน "ค่าเดียว" เพราะมีผู้เข้าแข่งขันรายเดียว
 *      หลายรายเมื่อไหร่ต้องเปลี่ยนเป็นรายการแล้วให้ SQL ใช้ `IN`
 *   2. `sc.provider = ${...}` ใน page-comment.service.ts (4 จุด) → `sc.provider IN (...)`
 *   3. พิลล์ช่องทางบนหัวคอลัมน์ `/inbox/comments` — วันนี้ 2 ใน 4 ปุ่ม (DEEP/INSTAGRAM)
 *      รับประกันว่าได้ผลว่างเสมอ และ ALL ≡ MESSENGER; พอมีช่องทางที่สองจริง ปุ่มพวกนั้น
 *      ถึงจะเริ่มมีความหมาย
 */
export const COMMENT_CAPABLE_PROVIDERS = ['MESSENGER'] as const

/**
 * แปลงพิลล์ช่องทาง → `ShopChannel.provider` ที่ใช้ query จริง
 *
 * 'ALL' → ช่องทางเดียวที่มีคอมเมนต์ได้ (วันนี้คือ MESSENGER) — ไม่ใช่การเดา แต่เป็นผลของ
 * `COMMENT_CAPABLE_PROVIDERS` ที่มีสมาชิกตัวเดียว
 * 'DEEP'/'INSTAGRAM' → คืนค่าตรงตัว ซึ่งจะไม่ match ShopChannel ที่มีโพสต์เลย = ได้ 0 ทั้งรายการ
 * และตัวนับพร้อมกัน ซึ่งเป็นความจริงที่ถูกต้อง (ไม่ใช่การ hardcode ว่า "ช่องทางนี้ว่าง")
 */
export function resolveCommentProvider(filter: CommentChannelFilter | undefined): string {
  return !filter || filter === 'ALL' ? COMMENT_CAPABLE_PROVIDERS[0] : filter
}
