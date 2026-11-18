// 00095 BR-FA-12 — เงื่อนไข "รอ action ท้ายสุด" ฝั่ง SQL ที่เดียว (แถวกล่องแชท · ยกเลิก · ตัวแนบ · engine) ไม่ให้นิยามเพี้ยนกัน
// ตัวเดียวกับ finalPendingOf + ด่านบอท (ไม่ถูกลบ · ACTIVE หรือ TESTING เฉพาะห้องทดสอบ) ที่ decideFinalAction ใช้ตอนลงมือ
// r/b = alias ของ "SalesFollowRun"/"SalesFollowBot" ที่ผู้เรียก JOIN ไว้แล้ว · since = ขอบ MESSAGE_LOOKBACK_MS (ISO จาก Date — ไม่ใช่ input ผู้ใช้)
export const finalPendingSql = (r: string, b: string, sinceIso: string): string =>
  `(${r}."status" = 'DONE' AND ${r}."finalActionAt" IS NULL AND ${r}."lastSentAt" IS NOT NULL AND ${r}."lastSentAt" >= '${sinceIso}'::timestamptz` +
  ` AND ${b}."finalAction" <> 'NONE' AND ${b}."deletedAt" IS NULL AND (${b}."status" = 'ACTIVE' OR (${b}."status" = 'TESTING'` +
  ` AND EXISTS (SELECT 1 FROM "SalesFollowBotTestRoom" tr WHERE tr."botId" = ${b}."id" AND tr."conversationId" = ${r}."conversationId"))))`
