/**
 * safe-callback-url.ts — sanitize `?callbackUrl=` / `?next=` ก่อนนำไป redirect (feature 00012 ext)
 *
 * ทำไมต้องมี: หน้า sign-in / OAuth callback รับปลายทางมาจาก query string ซึ่งผู้โจมตีแก้ได้อิสระ
 * ถ้า push ตรง ๆ จะกลายเป็น open-redirect (ส่งเหยื่อไป evil.com ทั้งที่โดเมนต้นทางเป็นของเรา —
 * ใช้ทำ phishing ต่อได้ทันทีเพราะลิงก์ที่ผู้ใช้กดคือโดเมนจริงของ Deep)
 *
 * นโยบาย: อนุญาตเฉพาะ **path ภายในเว็บเดียวกัน** เท่านั้น — ไม่รับ absolute URL แม้จะเป็นโดเมนเราเอง
 * (session แยกตาม subdomain อยู่แล้ว การข้าม subdomain ผ่าน callbackUrl ไม่มี use case ที่ถูกต้อง)
 *
 * ห้าม import prisma / มี side effect ตอน import — ไฟล์นี้ต้อง client-safe (ใช้ทั้งใน client form
 * และ RSC/route handler)
 */

/** ปลายทาง default เมื่อไม่มี callbackUrl หรือค่าที่ส่งมาไม่ผ่านเกณฑ์ */
export const DEFAULT_SELLER_CALLBACK = "/dashboard";

/**
 * คืน path ที่ปลอดภัยต่อการ redirect หรือ `fallback` เมื่อค่าที่ส่งมาไม่ผ่านเกณฑ์
 *
 * ผ่านเกณฑ์เมื่อ: ขึ้นต้นด้วย `/` ตัวเดียว และไม่มี backslash
 *
 * เคสที่ถูก reject (ทั้งหมดคือ open-redirect vector จริง ไม่ใช่ paranoia):
 * - `//evil.com` — protocol-relative URL, เบราว์เซอร์ตีความเป็น host ไม่ใช่ path
 * - `/\evil.com` — บาง parser (และ Chrome ในอดีต) ปฏิบัติกับ `\` เหมือน `/` → protocol-relative
 * - `https://evil.com`, `javascript:…`, `data:…` — มี scheme
 * - `dashboard` (ไม่มี `/` นำหน้า) — relative ต่อ path ปัจจุบัน คาดเดาปลายทางไม่ได้
 *
 * หมายเหตุ: ไม่ตรวจว่า route มีจริงไหม — ถ้าไม่มีจะได้ 404 ซึ่งไม่ใช่ปัญหาความปลอดภัย
 */
export function safeCallbackUrl(
  raw: string | null | undefined,
  fallback: string = DEFAULT_SELLER_CALLBACK,
): string {
  if (!raw) return fallback;

  // decode เผื่อ caller ส่งค่าที่ยัง encode อยู่ (เช่น %2F%2Fevil.com ที่ decode แล้วเป็น //evil.com)
  // decodeURIComponent throw ได้เมื่อเจอ % ที่ตามด้วยอักขระไม่ใช่ hex → ถือว่าไม่ผ่าน
  let value: string;
  try {
    value = decodeURIComponent(raw);
  } catch {
    return fallback;
  }

  // control character (รวม \n \r \t) — ตรวจ "ก่อน" trim โดยเจตนา: ถ้า trim ก่อน ค่าอย่าง
  // "/i/abc\r\n" จะถูกตัดหางจนดูสะอาดแล้วผ่าน ทั้งที่ input ที่มี CR/LF ติดมาแปลว่าไม่ปกติ
  // (ผู้เรียกที่สุจริตไม่เคยส่งมา) — reject ทิ้งตรง ๆ ปลอดภัยกว่าและอธิบายง่ายกว่า
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F]/.test(value)) return fallback;

  value = value.trim();
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//")) return fallback;
  if (value.includes("\\")) return fallback;

  return value;
}
