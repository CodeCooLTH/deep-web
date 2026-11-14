// feature 00092 — ตัวตนลูกค้าที่ออกนอกระบบ (BR-CA-01): PSID+เพจ หรือเบอร์แฮช เท่านั้น
import { createHash } from "node:crypto";
import { normalizePhone } from "@/lib/phone";

/** ชื่อ schema ของรหัสผู้ใช้ Facebook (page-scoped) — ที่เดียว แก้ได้ทันทีถ้าทดสอบจริงแล้ว Meta ใช้ชื่ออื่น */
export const UID_SCHEMA = "UID";
export const PHONE_SCHEMA = "PHONE";
/** เพดานต่อ 1 request ของ Meta */
export const MAX_BATCH = 10_000;

export type IdentityType = "PSID" | "PHONE";

/** เบอร์ไทย 0XXXXXXXXX → sha256(66XXXXXXXXX) เป็น hex · ไม่ใช่เบอร์ไทย = null (ไม่ส่งของที่แมตช์ไม่ได้) */
export function phoneHash(raw: string | null | undefined): string | null {
  const p = normalizePhone(raw ?? "");
  return p ? createHash("sha256").update(`66${p.slice(1)}`).digest("hex") : null;
}

export function buildUsersPayload(type: IdentityType, data: string[], pageId?: string) {
  return type === "PSID"
    ? { schema: UID_SCHEMA, data, page_ids: [pageId ?? ""] }
    : { schema: PHONE_SCHEMA, data };
}
