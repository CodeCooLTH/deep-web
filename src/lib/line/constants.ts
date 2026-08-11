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

/** timeout ของคำขออ่านโควตา (ms) — สั้นกว่า DEFAULT_TIMEOUT_MS (10s) ของ line/client.ts โดยตั้งใจ
 *  เพราะการอ่านโควตาอยู่ "บนเส้นทางกดส่ง" ด้วย (TFR-LINE-06 ข้อ 5) ถ้า LINE อืด ผู้ใช้จะรู้สึกว่า
 *  ปุ่มส่งค้าง ทั้งที่ผลของการอ่านนี้ *ไม่มีอำนาจบล็อกการส่ง* อยู่แล้วเมื่ออ่านไม่สำเร็จ (TD-006) —
 *  ยอมแพ้เร็วแล้วปล่อยให้ LINE เป็นผู้ตัดสินตอนยิงจริง ดีกว่ารอค่าที่ไม่ได้ใช้ตัดสินอะไร */
export const QUOTA_FETCH_TIMEOUT_MS = 5_000

/** เกณฑ์ "โควตาเหลือน้อย" — เหลือ ≤ 20% ของเพดานเดือนนั้น (user เคาะเอง 2026-08-10)
 *  🛑 ค่านี้ตัดสิน *สิ่งที่ผู้ใช้เห็น* (มาตรวัดเปลี่ยนเป็นโทนเตือน) จึงต้องอยู่ที่เดียวและถูกอ่าน
 *  ผ่าน `classifyLineQuota()` ใน lib/line/quota.ts เท่านั้น — ห้ามเขียน `remaining / total < 0.2`
 *  เองที่ component ไหน (ui-boolean-needs-a-testable-home.md) */
export const QUOTA_LOW_RATIO = 0.2

/** เพดานเวลาที่ระบบตอบอัตโนมัติต้องทำให้จบ นับจาก event.timestamp (ms) — เกินนี้ต้องยกเลิกงาน
 *  และห้าม fallback เป็น push โดยเด็ดขาด (NFR-8, TD-007, S-12) */
export const AUTO_REPLY_DEADLINE_MS = 40_000

// ---------------------------------------------------------------------------
// Rich Menu (feature 00045)
// ---------------------------------------------------------------------------
// 🛑 ตัวเลขทุกตัวด้านล่างคัดจากซอร์สเอกสารทางการ `line/line-developers-docs-source`
// (`docs/en/reference/messaging-api/index.html.md`) เมื่อ 2026-08-11 — หน้า reference บนเว็บเป็น
// SPA ที่ดึงตรงไม่ได้ ถ้าจะแก้ตัวเลขพวกนี้ต้องกลับไปอ่านซอร์สนั้น **ห้ามแก้จากความจำ**
// สรุปที่มาแบบเต็มอยู่ใน `docs/20 - Features/00045 - LINE Rich Menu/PRD.md` §4.3

/** ภาพเมนู: ≤1MB (ทั้ง JPEG และ PNG) */
export const RICH_MENU_IMAGE_MAX_BYTES = 1024 * 1024
/** ความกว้างที่ LINE ยอมรับ */
export const RICH_MENU_IMAGE_MIN_WIDTH = 800
export const RICH_MENU_IMAGE_MAX_WIDTH = 2500
/** ความสูงขั้นต่ำ (ไม่มีเพดานบน — ถูกคุมด้วยอัตราส่วนแทน) */
export const RICH_MENU_IMAGE_MIN_HEIGHT = 250
/** อัตราส่วน กว้าง/สูง ขั้นต่ำ — ต่ำกว่านี้ LINE ปฏิเสธ */
export const RICH_MENU_IMAGE_MIN_ASPECT = 1.45

/** กรอบที่เราเรนเดอร์จริง — ขนาดที่เอกสาร LINE ใช้เป็นตัวอย่าง (อัตราส่วน ≈1.483 ผ่านเกณฑ์ 1.45)
 *  🛑 canvas ฝั่ง client กับตัวคำนวณพิกัดปุ่มต้องอ่านคู่นี้ **ตัวเดียวกัน** ไม่งั้นพื้นที่กดจะไม่ตรง
 *  กับสิ่งที่วาด แล้วลูกค้าจะกดโดนปุ่มผิดโดยไม่มี tsc/เทสตัวไหนฟ้อง (TD-RM-6) */
export const RICH_MENU_CANVAS_WIDTH = 2500
export const RICH_MENU_CANVAS_HEIGHT = 1686

/** คำบนแถบเปิด/ปิดเมนู — 🛑 **14 ตัวอักษร** เท่านั้น ภาษาไทยชนเพดานง่ายมาก
 *  ("แตะเพื่อเปิดเมนู" = 16 ตัว เกินแล้ว) และต้องนับเป็น code point ไม่ใช่ `String.length` */
export const RICH_MENU_CHAT_BAR_MAX = 14

/** ชื่อเมนู (ร้านไม่เห็น ใช้ภายในเพื่อระบุเจ้าของ) */
export const RICH_MENU_NAME_MAX = 300

/** จำนวนพื้นที่กดได้สูงสุดต่อเมนู — หมายเหตุ: MCP `line-bot` จำกัดที่ 6 แต่นั่นเป็นเพดานของเครื่องมือ
 *  ไม่ใช่ของ LINE ตัวจริงคือ 20 */
export const RICH_MENU_MAX_AREAS = 20
