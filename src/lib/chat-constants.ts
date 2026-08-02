// Deep Chat (feature 00011) — constants ที่ chat.service.ts / API routes / UI ใช้ร่วมกัน
// เก็บแยกจาก inventory-addon.ts pattern ไม่ปน domain (SDS §3.2)
export const CHAT_BODY_MAX_LENGTH = 2000
// เพดานฝั่งผู้ซื้อ — ค่าเดิมของ BR-CHAT-07 ที่ SRS feat 00011 lock ไว้ เจตนาคือ "กัน buyer สแปมร้าน"
// (ดู PRD 00011 ตาราง Risks: "Seller ถูก buyer สแปมทักซ้ำ ๆ")
export const CHAT_RATE_LIMIT_MAX = 30
// เพดานฝั่งร้าน (2026-08-02) — multi-attachment ทำให้ 1 ไฟล์ = 1 ข้อความ ร้านที่แนบ 40 ไฟล์
// รวดเดียวจะโดนกฎที่ตั้งไว้กันลูกค้าสแปม เล่นงานตัวเอง. แยกเพดานแทนการขึ้นค่าเดียวทั้งระบบ
// เพื่อไม่ให้การป้องกันฝั่ง buyer อ่อนลงตามไปด้วย
export const CHAT_RATE_LIMIT_MAX_SHOP = 120
export const CHAT_RATE_LIMIT_WINDOW_MS = 60_000
export const CHAT_IMAGE_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
// CHAT_IMAGE_MAX_SIZE ไม่ redefine — import MAX_SIZE จาก '@/lib/storage' ตรง ๆ ที่ route
