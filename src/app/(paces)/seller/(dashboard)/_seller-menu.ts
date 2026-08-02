/**
 * เนื้อไฟล์ย้ายไป `src/lib/seller-menu.ts` แล้ว (feature 00027 TFR-001)
 *
 * เหลือไว้เป็น re-export เพราะมีที่อื่น import path นี้อยู่ (layout.tsx, getSellerPageTitle.ts,
 * SellerMobileHeader.tsx) — ลบไฟล์นี้ทิ้งเลยจะได้ diff ที่ใหญ่โดยไม่จำเป็นและเสี่ยงพลาดที่เรียก
 *
 * โค้ดใหม่ให้ import จาก `@/lib/seller-menu` ตรง ๆ
 */
export * from '@/lib/seller-menu'
