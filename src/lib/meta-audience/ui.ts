// feature 00092 — ตัวตัดสินฝั่งหน้าจอของการ์ด audience (ย้ายออกจาก JSX ให้เทสจับได้ · conventions/ui-boolean-needs-a-testable-home)
// ไม่ import อะไรที่เป็น server-only — client component ใช้ได้

/** S0 ยังไม่เชื่อม · S2 ปิดอยู่ · S3 กำลังเติม · S4 ปกติ · S5 รอยอมรับข้อตกลง · S6 หยุดเพราะ token (S1/S7/S8 ไม่ใช่สถานะของ payload) */
export type AudienceState = "none" | "off" | "filling" | "normal" | "terms" | "token";

export type AudienceConn = {
  enabled: boolean;
  backfilledAt: string | null;
  status: string;
  stoppedReason: string | null;
  tokenSource: string;
  tokenExpiresAt: string | null;
};

/** STOPPED ชนะทุกอย่าง (สวิตช์ล็อก) · เปิดแต่ยังไม่เติมย้อนหลังเสร็จ = filling · เปิด+เติมแล้ว = normal */
export function audienceState(c: AudienceConn | null): AudienceState {
  if (!c) return "none";
  if (c.status === "STOPPED") return c.stoppedReason === "TERMS_NOT_ACCEPTED" ? "terms" : "token";
  if (!c.enabled) return "off";
  return c.backfilledAt === null ? "filling" : "normal";
}

export const EXPIRY_WARN_DAYS = 7;

/** S7: เหลืออีกกี่วัน (ปัดขึ้น) ถ้า OAUTH + ยังใช้งานอยู่ + หมดใน <7 วัน · MANUAL (null) ไม่เตือน */
export function expiringDays(c: Pick<AudienceConn, "status" | "tokenSource" | "tokenExpiresAt">, now: Date = new Date()): number | null {
  if (c.tokenSource !== "OAUTH" || c.status !== "ACTIVE" || !c.tokenExpiresAt) return null;
  const ms = new Date(c.tokenExpiresAt).getTime() - now.getTime();
  if (Number.isNaN(ms)) return null;
  if (ms >= EXPIRY_WARN_DAYS * 864e5) return null;
  return Math.max(0, Math.ceil(ms / 864e5));
}

/** ปุ่มเชื่อม Facebook โชว์เมื่อ role อนุญาต · ไม่อนุญาต = กางฟอร์มกรอกเองเลย (มติ Controller #1) */
export const showManualFormByDefault = (oauthAvailable: boolean) => !oauthAvailable;

export type ConnectErrorKey = "errToken" | "errAdAccount" | "errPending" | "errInput" | "errGeneric";

export function connectErrorKey(code?: string): ConnectErrorKey {
  switch (code) {
    case "TOKEN_INVALID": return "errToken";
    case "AD_ACCOUNT_INVALID": return "errAdAccount";
    case "PENDING_EXPIRED": return "errPending";
    case "INVALID_INPUT": return "errInput";
    default: return "errGeneric";
  }
}

export type OauthReturn = "choose_account" | "cancelled" | "state_mismatch" | "no_code" | "no_ad_account" | "error";
const OAUTH_RETURNS: readonly string[] = ["choose_account", "cancelled", "state_mismatch", "no_code", "no_ad_account", "error"];

/** ค่า `?audience=` ที่รู้จักเท่านั้น — ค่าแปลก = เมินเหมือนไม่มี */
export const parseOauthReturn = (v: string | null | undefined): OauthReturn | null => (v && OAUTH_RETURNS.includes(v) ? (v as OauthReturn) : null);
