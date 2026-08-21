// re-export จาก SSOT กลาง src/lib/badge-icons.ts — คง import path เดิมของหน้าเหรียญผู้ขาย
//
// 🛑 2026-08-21 (00052 P1): `LUCIDE_FOR_BADGE` และ `lucideForBadge` ถูกลบออกจาก SSOT แล้ว
// เพราะชื่อไอคอนถูกเขียนลงคอลัมน์ `Badge.icon` จริงแล้ว ⇒ ผู้เรียกต้อง thread ค่าจากฐานเข้ามา
// ผ่าน `badgeIconName(nameEN, icon)` ไม่ใช่ค้นจาก map ตามชื่อเหรียญ
export { FALLBACK_LUCIDE, badgeIconName, normalizeIconifyName } from '@/lib/badge-icons'
