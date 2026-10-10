/**
 * NoPermissionCard — หน้าแจ้ง "บทบาทนี้เข้าหน้านี้ไม่ได้" ที่ gatePage คืน ok:false (00071 FR-RP-02)
 *
 * ทำไมเป็นไฟล์ re-export: ทุกหน้าเรียกชื่อนี้ที่เดียว — ตอน ux ออกแบบ view ทั่วไปเสร็จ (prop ชื่อ/ข้อความ)
 * สลับเนื้อในไฟล์นี้ไฟล์เดียว ไม่ต้องไล่แก้ทุกหน้า · ตอนนี้ใช้การ์ด "ดูได้เฉพาะเจ้าของร้าน" ของหน้าการเงินไปก่อน
 */
export { default } from '@/app/(paces)/seller/(dashboard)/expenses/components/ExpenseLockedCard'
