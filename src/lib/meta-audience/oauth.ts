// feature 00092 — OAuth เชื่อมบัญชีโฆษณา (ads_management) · แยกจาก OAuth เชื่อมเพจโดยตั้งใจ (scope คนละชุด)
import { GRAPH_BASE, ADS_SCOPES } from "@/lib/facebook/constants";
import { encryptToken, decryptToken } from "@/lib/token-crypto";

export const AUDIENCE_STATE_COOKIE = "fb_audience_oauth_state";
/** token ที่พักไว้ระหว่างรอเลือกบัญชีโฆษณา — เข้ารหัส + httpOnly + path แคบ + 10 นาที (แบบเดียวกับ pending-connect) */
export const AUDIENCE_PENDING_COOKIE = "fb_audience_pending";
export const AUDIENCE_PENDING_PATH = "/api/shops/meta-audience";
const DEFAULT_TTL_S = 60 * 864e2; // Meta ไม่ส่ง expires_in = ถือว่า ~60 วัน

/** เฉพาะบัญชีที่มี role บนแอป (FB_CHAT_ROLE_USER_IDS) — ads_management ยังเป็น Standard, คนนอก role ต้องไม่เจอหน้า "ฟีเจอร์ไม่พร้อมใช้งาน" */
export function audienceScopeFor(userId: string | null): string | null {
  const roleUsers = (process.env.FB_CHAT_ROLE_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return userId && roleUsers.includes(userId) ? ADS_SCOPES : null;
}

/** code → short-lived → long-lived (~60 วัน) พร้อมเวลาหมดอายุ */
export async function exchangeAudienceCode(
  code: string, redirectUri: string, doFetch: typeof fetch = fetch,
): Promise<{ token: string; expiresAt: Date }> {
  const appId = process.env.FB_CHAT_APP_ID;
  const appSecret = process.env.FB_CHAT_APP_SECRET;
  if (!appId || !appSecret) throw new Error("FB_CHAT_APP_CREDENTIALS_MISSING");
  const get = async (q: Record<string, string>) => {
    const res = await doFetch(`${GRAPH_BASE}/oauth/access_token?${new URLSearchParams(q)}`);
    const j = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: { message?: string } };
    if (!res.ok || !j.access_token) throw new Error(j.error?.message ?? "exchange failed");
    return j;
  };
  const short = await get({ client_id: appId, client_secret: appSecret, redirect_uri: redirectUri, code });
  const long = await get({ grant_type: "fb_exchange_token", client_id: appId, client_secret: appSecret, fb_exchange_token: short.access_token! });
  return { token: long.access_token!, expiresAt: new Date(Date.now() + (long.expires_in ?? DEFAULT_TTL_S) * 1000) };
}

export interface AdAccountOption { adAccountId: string; name: string; accountStatus: number | null }

export async function listAdAccounts(token: string, doFetch: typeof fetch = fetch): Promise<AdAccountOption[]> {
  const res = await doFetch(`${GRAPH_BASE}/me/adaccounts?fields=id,name,account_status&limit=100`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const j = (await res.json().catch(() => ({}))) as { data?: { id: string; name?: string; account_status?: number }[]; error?: { message?: string } };
  if (!res.ok) throw new Error(j.error?.message ?? "list adaccounts failed");
  return (j.data ?? []).map((a) => ({ adAccountId: a.id.replace(/^act_/, ""), name: a.name ?? a.id, accountStatus: a.account_status ?? null }));
}

export const sealPending = (token: string, expiresAt: Date | null) =>
  encryptToken(JSON.stringify({ t: token, e: expiresAt?.toISOString() ?? null }));

export function openPending(raw: string | undefined): { token: string; expiresAt: Date | null } | null {
  if (!raw) return null;
  try {
    const j = JSON.parse(decryptToken(raw)) as { t: string; e: string | null };
    return { token: j.t, expiresAt: j.e ? new Date(j.e) : null };
  } catch {
    return null;
  }
}
