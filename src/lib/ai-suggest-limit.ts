// Constants สำหรับ AI Suggestion Usage Limit & Credit (feature 00019 ext, 2026-07-29)
// Pure module — ห้าม import จาก service/prisma ใด ๆ (client-safe, ตาม pattern src/lib/business-package.ts)
// SSOT: docs/20 - Features/00019 - AI Reply Assistant/EXTENSIONS-2026-07-29-usage-limit.md

/** โควตาฟรี/วัน/ร้าน — เฉพาะร้านที่ไม่ใช่ paid plan (BR-AIQ-03) */
export const AI_SUGGEST_FREE_DAILY_LIMIT = 10

/** ราคาซื้อเพิ่มเกินโควตาฟรี ต่อ 1 ครั้ง (บาท) — credit path เท่านั้น (BR-AIQ-01) */
export const AI_SUGGEST_EXTRA_USE_PRICE_BAHT = 1

/** WalletTransaction.reason ใหม่สำหรับหัก/คืนเครดิต ai-suggest (ไม่มี DDL — แค่ค่า string ใหม่) */
export const WALLET_REASON_AI_SUGGEST = {
  AI_SUGGEST_EXTRA_USE: 'AI_SUGGEST_EXTRA_USE',
} as const
