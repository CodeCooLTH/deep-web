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
  return fileUrlOf(value);
}

/**
 * เหมือน `toFileUrl` ทุกประการ ต่างกันแค่ "สัญญาเรื่อง null" — ตัวนี้รับค่าที่ผู้เรียกกันไว้แล้วว่า
 * ไม่ว่าง (เช่นอยู่หลัง `x ? … : null` หรือเป็นพารามิเตอร์ที่ประกาศเป็น `string`) จึงคืน `string` เสมอ
 *
 * 🛑 มีสองตัวโดยตั้งใจ และวางติดกันตาม Hard Rule 16 — **ตรรกะอยู่ที่นี่ที่เดียว** `toFileUrl`
 * เรียกตัวนี้ต่อ ไม่ได้ก็อปเงื่อนไขไปเขียนซ้ำ ผลลัพธ์ของทั้งคู่จึงเหมือนกันเป๊ะเสมอสำหรับค่าที่ไม่ว่าง
 *
 * ทำไมไม่ให้ call site เขียน `toFileUrl(x)!` แทน: `!` คือ cast ที่ปิดตา tsc ไม่ให้ตรวจ ซึ่งเป็น
 * แพตเทิร์นที่รีโปนี้เคยเจ็บมาแล้ว (`session-exists-is-not-identity.md` — cast ทำให้ `undefined`
 * ไหลเข้า query จนทั้งหน้าเป็น 500 โดย tsc ไม่ฟ้องสักบรรทัด)
 */
export function fileUrlOf(value: string): string {
  // ค่าที่ขึ้นต้นด้วย "/" เป็น URL path ในเว็บเราอยู่แล้ว — ทั้ง /images/badges/x.png ที่มาจาก seed
  // และ /api/files/{id} ที่หน้า /account เซฟลง User.avatar (ProfileForm.tsx)
  // ถ้าเติม prefix ให้จะกลายเป็น /api/files//api/files/... ซึ่งพัง 404 — เช็คก่อนเสมอ
  if (value.startsWith("http") || value.startsWith("/")) return value;

  return `/api/files/${value}`;
}
