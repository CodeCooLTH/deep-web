/**
 * HMAC-signed ticket สำหรับ "เชื่อมบัญชี" ที่หน้าลิงก์คำสั่งซื้อ (feature 00015 S-5)
 *
 * สถานการณ์: ผู้ซื้อเคยสมัคร Deep ด้วยเบอร์ (OTP) มาก่อน แล้วรอบนี้กดลิงก์จากแชทและล็อกอิน
 * ด้วย Facebook จึงได้บัญชีใหม่คนละใบ พอยืนยันเบอร์ที่ใช้สั่งซื้อก็พบว่าเบอร์นั้นเป็นของบัญชีเดิม
 * ตามหลัก "เบอร์ = single source of truth" บัญชีที่ถือเบอร์คือเจ้าของตัวจริง จึงต้องย้าย
 * Facebook ไปผูกกับบัญชีเดิมแทนที่จะสร้างตัวตนซ้อน
 *
 * ทำไมต้องมี ticket แทนการยืนยัน OTP ซ้ำ: ตอนที่ตรวจพบ ผู้ใช้เพิ่งพิสูจน์ด้วย OTP ไปแล้วว่า
 * คุมเบอร์นั้นจริง (ดู verify-phone route) ซึ่งเป็นหลักฐานระดับเดียวกับที่ระบบใช้รีเซ็ตรหัสผ่าน
 * การบังคับขอ OTP ใหม่อีกรอบเพิ่มความหงุดหงิดโดยไม่ได้เพิ่มความปลอดภัย เพราะเป็นการพิสูจน์
 * สิ่งเดิมซ้ำสอง ticket จึงเป็นตัวส่งต่อผลการพิสูจน์นั้นข้ามคำขอ โดยที่ client ปลอมไม่ได้
 *
 * โดเมนแยกจาก link-intent.ts ด้วย prefix ใน HMAC — ticket ของที่นี่เอาไปใช้เป็น link-intent
 * ไม่ได้และกลับกันก็ไม่ได้ แม้จะใช้ NEXTAUTH_SECRET ตัวเดียวกัน
 *
 * Fail-closed แบบเดียวกับ link-intent.ts: ไม่มี SECRET → throw ตอน load, verify ทุก error
 * path → null, timingSafeEqual กัน timing side-channel, exp ฝังใน payload ให้ server บังคับเอง
 */
import crypto from "crypto";

const SECRET = process.env.NEXTAUTH_SECRET;
if (!SECRET) {
  throw new Error("[account-merge-ticket] NEXTAUTH_SECRET ไม่ได้ตั้งค่า — fail-closed");
}

// domain separation — กัน token จาก signLinkIntent ถูกนำมาใช้ที่นี่ (และกลับกัน)
const DOMAIN = "acct-merge.v1";

interface TicketPayload {
  /** บัญชีที่ล็อกอินอยู่ตอนนี้ (บัญชีใหม่ที่เกิดจาก OAuth) — ต้นทางที่จะย้าย provider ออก */
  fromUserId: string;
  /** บัญชีเดิมที่ถือเบอร์นั้นอยู่ — ปลายทางที่จะเอา provider ไปผูก */
  toUserId: string;
  /** ผูกกับออเดอร์ใบที่กำลังเปิด — ticket ใช้ข้ามออเดอร์ไม่ได้ */
  orderId: string;
  exp: number;
}

export function signAccountMergeTicket(params: {
  fromUserId: string;
  toUserId: string;
  orderId: string;
}): string {
  const payload: TicketPayload = {
    ...params,
    // 10 นาที — ยาวพอให้ผู้ใช้อ่านคำอธิบายแล้วตัดสินใจ สั้นพอไม่ค้างข้ามการใช้งานครั้งถัดไป
    exp: Date.now() + 10 * 60 * 1000,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto
    .createHmac("sha256", SECRET!)
    .update(`${DOMAIN}.${payloadB64}`)
    .digest("base64url");
  return `${payloadB64}.${sig}`;
}

export function verifyAccountMergeTicket(
  token: string,
): { fromUserId: string; toUserId: string; orderId: string } | null {
  if (!token) return null;
  try {
    const dot = token.indexOf(".");
    if (dot === -1) return null;

    const payloadB64 = token.slice(0, dot);
    const sigProvided = token.slice(dot + 1);

    const expectedSig = crypto
      .createHmac("sha256", SECRET!)
      .update(`${DOMAIN}.${payloadB64}`)
      .digest("base64url");

    const provided = Buffer.from(sigProvided);
    const expected = Buffer.from(expectedSig);
    if (provided.length !== expected.length) return null;
    if (!crypto.timingSafeEqual(provided, expected)) return null;

    // parse หลัง verify signature แล้วเท่านั้น
    const payload = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf8"),
    ) as TicketPayload;

    if (typeof payload.fromUserId !== "string" || !payload.fromUserId) return null;
    if (typeof payload.toUserId !== "string" || !payload.toUserId) return null;
    if (typeof payload.orderId !== "string" || !payload.orderId) return null;
    if (payload.fromUserId === payload.toUserId) return null; // ไม่มีอะไรให้ย้าย
    if (typeof payload.exp !== "number" || Date.now() > payload.exp) return null;

    return {
      fromUserId: payload.fromUserId,
      toUserId: payload.toUserId,
      orderId: payload.orderId,
    };
  } catch {
    return null;
  }
}
