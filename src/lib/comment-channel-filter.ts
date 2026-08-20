/**
 * comment-channel-filter — "ช่องทางไหนมีคอมเมนต์ได้บ้าง" ของกล่องข้อความแท็บความคิดเห็น
 *
 * 🛑 ข้อเท็จจริงข้อเดียวที่ทั้งไฟล์นี้มีอยู่: **`FacebookPost`/`PageComment` ผูกกับ `ShopChannel`
 * ที่เป็น `MESSENGER` เท่านั้นทั้งระบบ** (feature 00029 รับคอมเมนต์จากเพจ Facebook อย่างเดียว)
 * เดิมข้อเท็จจริงนี้ถูกเขียนไว้ในคอมเมนต์ของ `resolveCommentProvider()` ฝั่ง service เท่านั้น
 * ⇒ หน้าจอไม่มีทางรู้ และไปสร้าง segmented control 4 ปุ่มที่ **ไม่มีปุ่มไหนเปลี่ยนผลลัพธ์ได้เลย**:
 *   ALL → MESSENGER (ชุดเดียวกันเป๊ะ) · DEEP/INSTAGRAM → ไม่ match ช่องทางไหนเลย = ว่างทั้งจอ
 *
 * ย้ายมาที่นี่เพื่อให้ "ตัวที่ query" กับ "ตัวที่ตัดสินว่าจะแสดงปุ่มไหม" อ่านค่าเดียวกัน (HR16) —
 * ไฟล์นี้ต้องไม่มี dependency ใด ๆ เพราะถูก import ทั้งจาก service (Node) และ client component
 * (ถ้าดึง prisma ติดไปจะพัง bundle ของฝั่ง client)
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
 *   3. ไม่ต้องแตะ UI — segmented control จะโผล่กลับมาเองจาก `SHOW_COMMENT_CHANNEL_FILTER`
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

/**
 * แสดง segmented control "ช่องทาง" เหนือแท็บสถานะไหม
 *
 * 🛑 เกณฑ์คือ **"มีตัวเลือกที่ให้ผลต่างกันจริง ≥2 ตัว"** ไม่ใช่ "เหลือปุ่มกี่ปุ่ม" — ถ้าเหลือ
 * ALL กับ MESSENGER สองปุ่มก็ยังเป็น control หลอกอยู่ดี เพราะกดแล้วรายการเหมือนกันทุกแถว
 * (impeccable critique 2026-08-20 P2-E: 8–9 control ก่อนถึงคอมเมนต์ใบแรกบนมือถือ ซึ่ง 4 ใน
 * จำนวนนั้นเป็นแถวนี้ทั้งแถว)
 */
export const SHOW_COMMENT_CHANNEL_FILTER: boolean = COMMENT_CAPABLE_PROVIDERS.length > 1
