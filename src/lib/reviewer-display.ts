import { maskPhone } from "@/lib/phone-mask";

/**
 * ชื่อผู้รีวิวที่แสดงบนหน้าร้านสาธารณะ — SSOT ของการ mask
 *
 * user สั่ง 2026-08-11: "ต้องแสดงลูกค้า พร้อม mask ข้อมูลทุกอย่าง"
 *
 * 🛑 หน้านี้เป็นหน้า **สาธารณะ** ใครก็เปิดได้โดยไม่ต้องล็อกอิน — ชื่อ/เบอร์/อีเมลของผู้ซื้อ
 * ต้องถูก mask **ที่ฝั่งเซิร์ฟเวอร์ก่อนข้าม RSC boundary** ไม่ใช่ mask ตอน render
 * เพราะ Next จะ serialize ค่าดิบลง flight payload ให้ทุกคนอ่านได้จาก view-source
 * (บทเรียนจริง 2026-06-06 — ดู memory feedback_rsc_pii_neutralize_at_source)
 *
 * ⚠️ ฟังก์ชันนี้จึงต้องถูกเรียก **ที่ page/service** เท่านั้น ห้ามส่งค่าดิบไปให้ component แล้ว mask ที่นั่น
 */

/** ชื่อจริง → เห็นตัวแรกของแต่ละคำ ที่เหลือเป็นจุด: "สมชาย ใจดี" → "ส••••• ใ•••" */
function maskName(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      const chars = [...word];
      if (chars.length <= 1) return chars.join("");
      return chars[0] + "•".repeat(chars.length - 1);
    })
    .join(" ");
}

/**
 * อีเมลรูปแบบมาตรฐานเท่านั้น — ไม่ใช่ "มี @ ก็พอ"
 *
 * 🛑 เทส [blocker] จับได้ตอนเขียน: `LINE:@somchai_shop` มี `@` จึงเข้าทางอีเมล แล้ว **โชว์
 * `@somchai_shop` เต็ม ๆ** ซึ่งคือ LINE ID ของลูกค้า — หลุด PII บนหน้าสาธารณะโดยที่โค้ด
 * "ทำงานถูกต้อง" ทุกบรรทัด · เงื่อนไขต้องแคบพอที่ค่าที่ไม่ใช่อีเมลจะตกไปทาง "ผู้ซื้อ"
 */
const EMAIL_RE = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/;

/** อีเมล → เห็น 2 ตัวแรกของ local part + โดเมน: "somchai@gmail.com" → "so•••••@gmail.com" */
function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "•••";
  const local = email.slice(0, at);
  const domain = email.slice(at);
  if (local.length <= 2) return "•".repeat(local.length) + domain;
  return local.slice(0, 2) + "•".repeat(local.length - 2) + domain;
}

/**
 * @param name    ชื่อจากบัญชีผู้ใช้ (`User.name`) — null เมื่อรีวิวมาจาก guest
 * @param contact ค่าที่ผู้ซื้อกรอกตอนยืนยันรับของ (`Review.reviewerContact`) เบอร์หรืออีเมล
 *
 * ลำดับความชอบ: ชื่อบัญชี → เบอร์ → อีเมล → "ผู้ซื้อ"
 *
 * 🛑 ไม่เคยคืนค่าดิบไม่ว่ากรณีใด — รูปแบบที่ไม่รู้จักคืน "ผู้ซื้อ" ไม่ใช่พยายาม mask ต่อ
 * (รูปแบบที่เราไม่รู้จักแปลว่าเราไม่รู้ว่าส่วนไหนอ่อนไหว การเดาแล้วโชว์บางส่วนอันตรายกว่าไม่โชว์เลย
 *  — หลักเดียวกับ maskPhoneForGuest ใน order-pii-mask.ts)
 */
export function maskedReviewerName(
  name: string | null | undefined,
  contact: string | null | undefined,
): string {
  const trimmedName = name?.trim();
  if (trimmedName) return maskName(trimmedName);

  const trimmedContact = contact?.trim();
  if (!trimmedContact) return "ผู้ซื้อ";

  if (/^\d{10}$/.test(trimmedContact)) return maskPhone(trimmedContact);
  if (EMAIL_RE.test(trimmedContact)) return maskEmail(trimmedContact);

  return "ผู้ซื้อ";
}
