import { variantKey, type ImageVariant } from '@/lib/image-variants'

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
  if (isReadyUrl(value)) return value;

  return `/api/files/${value}`;
}

/**
 * ค่านี้เป็น URL ที่ใช้ได้เลยหรือยัง (ไม่ใช่ storage key ที่ต้องเติม prefix)
 *
 * - ค่าที่ขึ้นต้นด้วย `http` = URL ภายนอก (อวาตาร์ Facebook / CDN / seed)
 * - ค่าที่ขึ้นต้นด้วย `/` เป็น URL path ในเว็บเราอยู่แล้ว — ทั้ง `/images/badges/x.png` ที่มาจาก
 *   seed และ `/api/files/{id}` ที่หน้า /account เซฟลง `User.avatar` (ProfileForm.tsx)
 *   ถ้าเติม prefix ให้จะกลายเป็น `/api/files//api/files/...` ซึ่งพัง 404
 *
 * 🛑 เงื่อนไขนี้ต้องอยู่ที่เดียวในไฟล์ — `fileUrlOf` และ `variantUrlOf` (00054) ต่างต้องใช้
 * เกณฑ์เดียวกันเป๊ะ ถ้าก็อปไปเขียนซ้ำแล้ววันหนึ่งแก้ที่เดียว จะได้ระบบที่ "ต้นฉบับใช้ URL ภายนอก
 * แต่รูปย่อไปเดาคีย์ในบัคเก็ตเรา" ซึ่งยิง 404 ทุกใบเงียบ ๆ
 * (เทส `file-url.guards.test.ts` บังคับข้อนี้ด้วยการนับจำนวนครั้งที่เงื่อนไขปรากฏ)
 */
function isReadyUrl(value: string): boolean {
  return value.startsWith("http") || value.startsWith("/");
}

/**
 * URL ของรูปย่อ (feature 00054) — คืน `null` เมื่อค่าที่รับมา **ไม่ใช่คีย์ของบัคเก็ตเรา**
 *
 * 🛑 ต้องคืน null ให้ค่าเหล่านี้ เพราะเราไม่ได้เป็นคนสร้าง variant ให้มัน:
 *   - URL เต็ม (`https://…`) — รูปจาก Facebook/CDN ภายนอก
 *   - path ในเว็บเรา (`/images/badges/x.png` จาก seed, `/api/files/…` ที่บางหน้าเซฟไว้เต็ม ๆ)
 * ถ้าไม่กัน จะได้ URL อย่าง `https://scontent.xx.fbcdn.net/….thumb.webp` ที่ไม่มีวันมีอยู่จริง
 * ⇒ ทุกใบยิง 404 แล้วตกไป fallback = เสียคำขอเปล่าหนึ่งครั้งต่อรูปหนึ่งใบ **ทุกครั้งที่เปิดหน้า**
 *
 * ผู้เรียกต้องเตรียม fallback ไปต้นฉบับเสมอ (`onError`) — รูปเก่าที่ยังไม่ backfill และรูปที่
 * ย่อไม่สำเร็จ จะไม่มีไฟล์นี้อยู่จริง ซึ่งเป็นสถานะปกติ ไม่ใช่ความผิดพลาด
 */
export function variantUrlOf(
  value: string | null | undefined,
  variant: ImageVariant,
): string | null {
  if (!value) return null;
  if (isReadyUrl(value)) return null;
  return `/api/files/${variantKey(value, variant)}`;
}
