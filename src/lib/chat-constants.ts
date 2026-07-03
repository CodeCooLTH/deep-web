// Deep Chat (feature 00011) — constants ที่ chat.service.ts / API routes / UI ใช้ร่วมกัน
// เก็บแยกจาก inventory-addon.ts pattern ไม่ปน domain (SDS §3.2)
export const CHAT_BODY_MAX_LENGTH = 2000
export const CHAT_RATE_LIMIT_MAX = 30
export const CHAT_RATE_LIMIT_WINDOW_MS = 60_000
export const CHAT_IMAGE_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
// CHAT_IMAGE_MAX_SIZE ไม่ redefine — import MAX_SIZE จาก '@/lib/storage' ตรง ๆ ที่ route
