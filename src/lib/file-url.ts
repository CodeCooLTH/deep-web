/**
 * แปลงค่ารูปที่เก็บใน DB ให้เป็น URL ที่ <img src> ใช้ได้จริง
 *
 * ค่าที่เก็บมีสองแบบปนกันทั้งระบบ:
 *   - storage key จาก saveFile() เช่น "2026/07/25/uuid.png" หรือ "uuid.png" (ไฟล์เก่าก่อนชาร์ดโฟลเดอร์)
 *   - URL เต็มจาก seed / CDN / avatar ของ OAuth provider
 *
 * ทำไมต้องเป็น helper กลาง: เขียนแสดงรูปโดยสมมติว่าค่าที่เก็บเป็น URL เต็ม แล้วรูปไม่ขึ้นทั้งหน้า
 * เป็นความผิดพลาดที่เกิดซ้ำมาแล้วในรอบเดียวกัน (หน้าลิงก์คำสั่งซื้อ แล้วก็หน้าร้านสาธารณะ)
 * การมีจุดเดียวให้เรียกทำให้จุดที่สามไม่พลาดอีก
 *
 * guard เดิมกระจายอยู่หลายที่ — ดู src/app/(paces)/seller/i/[slug]/components/InviteLandingClient.tsx
 * และ src/app/(paces)/seller/(dashboard)/products/page.tsx ที่ใช้เงื่อนไขเดียวกันนี้
 */
export function toFileUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.startsWith("http") ? value : `/api/files/${value}`;
}
