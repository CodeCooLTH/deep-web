// ค่าที่ปุ่มส่งออกฝั่ง client ใช้ — แยกจาก order-export.ts ไม่ให้ client bundle ลาก lib คิดเงินทั้งกราฟ

/** เพดานต่อไฟล์ — กันคำตอบเกิน ≈4.5 MB ของ Vercel Function (BRD FR-EXP-14) */
export const EXPORT_MAX_ROWS = 5000

export type ExportFormat = 'csv' | 'xlsx'
export type ExportScope = 'filtered' | 'all'
