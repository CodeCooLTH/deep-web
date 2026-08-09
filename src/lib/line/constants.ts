// ค่าคงที่กลางของ LINE Messaging API integration (feature 00025, S-3)
// รวมค่าคงที่ทั้งหมดของ LINE ไว้ที่ไฟล์นี้จุดเดียว — ห้ามกระจายไปไฟล์อื่น (ดู scope baseline S-3
// "ไม่ทำ": ห้ามกระจายค่าคงที่เหล่านี้ไปไฟล์อื่น) ไฟล์อื่นที่ต้องใช้ค่าพวกนี้ (S-4 LineAdapter,
// S-6 webhook, S-8 outbound, S-9 quota, S-12 auto-reply) import จากที่นี่เสมอ

/** endpoint หลักของ LINE Messaging API (reply/push/profile/quota/webhook info ฯลฯ) */
export const API_BASE = 'https://api.line.me'

/** endpoint แยกสำหรับเนื้อหาสื่อ (GET เนื้อหาไฟล์รูป/วิดีโอ/เสียงของข้อความ) — คืน binary ไม่ใช่ JSON
 *  ต้องยิงคนละ base URL กับ API_BASE (LINE แยก host ของสองงานนี้ตามเอกสาร Messaging API) */
export const DATA_API_BASE = 'https://api-data.line.me'

/** หน้าต่างเวลาที่ reply token ใช้ได้ (ms) นับจากเวลาที่ event เข้ามา — เกินนี้ reply token ใช้ไม่ได้
 *  แล้วต้องส่งด้วย push แทน (กินโควตา) ดู TFR-LINE-05/TD-009 */
export const REPLY_WINDOW_MS = 60_000

/** กันชนก่อนหน้าต่าง reply token หมดอายุจริง (ms) — เหลือเวลาน้อยกว่านี้ให้ถือว่า "ใช้ reply ไม่ได้แล้ว"
 *  แม้ทางทฤษฎียังไม่หมดอายุเป๊ะ ๆ เพื่อกันเคสยิงคำขอไปถึง LINE ช้ากว่าที่คำนวณไว้แล้วโดน 400 เพราะ token
 *  หมดอายุพอดีระหว่างทาง (เครือข่าย/queue delay) */
export const REPLY_SAFETY_MARGIN_MS = 5_000

/** จำนวนชิ้นข้อความ (message object) สูงสุดที่ยิงได้ใน 1 คำขอ reply/push เดียว (LINE Messaging API
 *  จำกัดไว้ที่ 5 ตาม array `messages`) — เกินนี้ต้องแบ่งเป็นคำขอถัดไปแบบไม่ขนาน (S-10, TD-004) */
export const MAX_PARTS = 5

/** อายุ cache ของโควตาที่ดึงจาก LINE (ms) — ไม่ยิง LINE ซ้ำถ้า cache ยังไม่หมดอายุ (TD-006) */
export const QUOTA_TTL_MS = 300_000

/** เพดานเวลาที่ระบบตอบอัตโนมัติต้องทำให้จบ นับจาก event.timestamp (ms) — เกินนี้ต้องยกเลิกงาน
 *  และห้าม fallback เป็น push โดยเด็ดขาด (NFR-8, TD-007, S-12) */
export const AUTO_REPLY_DEADLINE_MS = 40_000
