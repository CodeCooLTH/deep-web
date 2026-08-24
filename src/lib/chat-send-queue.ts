/**
 * chat-send-queue — กฎของคิวส่งข้อความขาออกฝั่งผู้ขาย (ฟังก์ชันบริสุทธิ์ ไม่แตะ DB/เครือข่าย)
 *
 * ที่มา 2026-08-23 (CR ของ 00018): ผู้ขายกดส่งแล้วปิดแอปก่อนเสร็จ ข้อความไม่ถึงลูกค้าแต่จอ
 * บอกว่าส่งสำเร็จ — ดู `docs/superpowers/specs/2026-08-23-chat-outbound-queue-design.md`
 *
 * 🛑 ทำไมกฎพวกนี้ต้องอยู่ในไฟล์ที่ไม่แตะ DB: ตรรกะที่อันตรายที่สุดของฟีเจอร์นี้เป็น boolean
 * สั้น ๆ ทั้งนั้น ถ้าฝังอยู่ใน service ที่ต้องมี Prisma ถึงจะรันได้ จะไม่มีใครเขียนเทสให้มัน
 * แล้วการเขียนกลับด้านจะผ่านทุกด่านของโปรเจกต์ (ui-boolean-needs-a-testable-home.md)
 */

/** เพดานเวลาที่ยอมให้แถวหนึ่ง "ถูก claim อยู่" ก่อนถือว่า worker ตายไปแล้ว (spec D-8) */
export const STALE_CLAIM_MS = 3 * 60 * 1000

/**
 * ถ้อยคำของแถวที่ปิดเพราะ claim ค้าง — **ต้องพูดความจริงว่าเราไม่รู้ผล**
 *
 * 🛑 ห้ามเปลี่ยนเป็นข้อความกลาง ๆ อย่าง "ส่งไม่สำเร็จ": แถวกลุ่มนี้คือแถวที่ *อาจ* ถึงลูกค้าไปแล้ว
 * การเชิญให้กดส่งใหม่ทันทีโดยไม่ตรวจ คือทางเดียวที่เหลืออยู่ที่จะทำให้ลูกค้าได้ข้อความซ้ำ
 *
 * 🛑 วรรคที่บอกว่า "ไปตรวจที่ไหน" เคยเขียนว่า **"เปิดดูในแชทของลูกค้า"** ซึ่งกำกวม (impeccable
 * clarify 2026-08-23 P2-2): ผู้ขายเปิดแชท *ของลูกค้า* ไม่ได้ ที่ที่เขาต้องไปดูคือแอปของช่องทางนั้น
 * เอง (Messenger / Instagram / LINE OA หรือ Business Suite) — ที่เดียวที่เห็นได้ว่าข้อความออกไปจริง
 * หรือเปล่า. ส่วนที่เหลือของประโยคไม่แตะ (ซื่อสัตย์ว่าเราไม่รู้ผล + บอกให้ตรวจก่อนกดส่งใหม่)
 *
 * 🛑 **ห้ามมี `—` ในประโยคนี้** (fix round 1): `describeSendFailure` มีกฎที่จับสตริงนี้แล้วเติม
 * **คำนำหน้าของตัวเอง** ("ตรวจก่อนส่งใหม่ — ") ⇒ ถ้าในนี้มีขีดอีกตัว ผู้ขายจะได้อ่านประโยคที่มี
 * `—` ซ้อนสองชั้น ซึ่งบนบรรทัดเดียวของ noti อ่านเป็นสองประโยคที่ไม่เกี่ยวกัน
 *
 * 🛑 ค่านี้ถูกอ้างอิงใน runbook rollback (`EXTENSIONS-2026-08-23-outbound-queue.md` §13 มี SQL ที่
 * ฝังสตริงนี้ตรง ๆ) — แก้ที่นี่แล้ว **ต้องตามไปแก้เอกสารในคอมมิตเดียวกัน** ไม่งั้นคำสั่งกู้คืนจะ
 * เลือกแถวไม่เจอในวันที่ต้องใช้จริง
 */
export const UNCERTAIN_SEND_REASON =
  'ไม่แน่ใจว่าข้อความออกไปหรือยัง เปิดดูในแอปของช่องทางนั้นก่อนกดส่งใหม่'

export type ClaimOwner = 'after' | 'sweep' | 'cron'

/** รูปร่างขั้นต่ำที่กฎในไฟล์นี้ต้องใช้ — ไม่ผูกกับ type ของ Prisma เพื่อให้เทสสร้างเองได้ */
export type QueueRow = {
  id: string
  conversationId: string
  createdAt: Date
  deliveryStatus: string | null
  sendLockedAt: Date | null
}

/**
 * แถวนี้หยิบไปยิงได้ไหม
 *
 * 🛑 `sendLockedAt === null` คือเกณฑ์ความปลอดภัยเดียวของทั้งฟีเจอร์ (spec D-6): มันแปลว่า
 * "ยังไม่เคยมีใครเริ่มยิงแถวนี้ออกไปเลย" ⇒ ยิงได้โดยไม่มีทางซ้ำ. แถวที่เคยถูก claim แล้ว
 * เราไม่มีทางรู้ว่า Meta ได้รับหรือยัง (ไม่มี idempotency key ฝั่ง Meta) จึงห้ามยิงซ้ำ
 */
export function isClaimable(row: QueueRow): boolean {
  return row.deliveryStatus === 'QUEUED' && row.sendLockedAt === null
}

/**
 * แถวที่ถูก claim แล้วค้างเกินเพดาน = worker ตายกลางทาง ต้องปิดเป็น FAILED (ไม่ใช่ยิงซ้ำ)
 *
 * หมายเหตุ: เงื่อนไข "เคย claim ไหม" (`sendLockedAt !== null`) รวมอยู่ในบรรทัด return เดียวกับ
 * การเทียบเวลา — ไม่แยกเป็น early-return คนละบรรทัด เพราะทั้งสองเงื่อนไขตอบคำถามเดียวกัน
 * ("ค้างจริงไหม") และต้องพังพร้อมกันถ้าใครลบส่วนใดส่วนหนึ่งออก (พิสูจน์ด้วย mutation M2 —
 * ดูรายงาน task-2-report.md)
 */
export function isStaleClaim(row: QueueRow, now: Date): boolean {
  if (row.deliveryStatus !== 'QUEUED') return false
  return row.sendLockedAt !== null && now.getTime() - row.sendLockedAt.getTime() > STALE_CLAIM_MS
}

/**
 * หัวคิวของห้อง — ใบเก่าสุดที่ยัง QUEUED และยังหยิบได้
 *
 * คืน `null` เมื่อใบเก่าสุด **ถูก claim ไปแล้ว** โดยตั้งใจ: ห้ามข้ามไปทำใบถัดไป ไม่งั้นลูกค้า
 * จะอ่านข้อความสลับลำดับกับที่ร้านพิมพ์ (spec D-3)
 */
export function headOfRoom(rows: QueueRow[]): QueueRow | null {
  const pending = rows
    .filter((r) => r.deliveryStatus === 'QUEUED')
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  const head = pending[0]
  if (!head) return null
  return isClaimable(head) ? head : null
}
