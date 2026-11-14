// feature 00092 FR-002/FR-008 — ตั้งค่า/เชื่อมบัญชีโฆษณาของร้าน (เรียกจาก API ที่ครอบด้วย X9 เท่านั้น)
//
// 🛑 tokenEnc ไม่เคยออกจากไฟล์นี้ — คำตอบมีแค่ hasToken/tokenSource/tokenExpiresAt
import { prisma } from "@/lib/prisma";
import { isMetaAudienceEnabled } from "@/lib/meta-audience/gate";
import { classifyAudienceResult, adsManagerUrl, termsUrl } from "@/lib/meta-audience/classify";
import { listAdAccounts } from "@/lib/meta-audience/oauth";
import { GRAPH_BASE } from "@/lib/facebook/constants";
import { encryptToken } from "@/lib/token-crypto";
import { resetSynced } from "@/services/meta-audience.service";

export type AudienceErrorCode =
  | "FEATURE_DISABLED" | "NOT_FOUND" | "INVALID_INPUT" | "TOKEN_INVALID" | "AD_ACCOUNT_INVALID"
  | "NOT_CONNECTED" | "CONNECTION_STOPPED" | "PENDING_EXPIRED";

export class AudienceError extends Error {
  constructor(public code: AudienceErrorCode, message: string) {
    super(message);
  }
}

function assertOpen(shopId: string) {
  if (!isMetaAudienceEnabled(shopId)) throw new AudienceError("FEATURE_DISABLED", "ฟีเจอร์ยังไม่เปิดให้ร้านนี้");
}

export async function getAudienceStatus(shopId: string) {
  assertOpen(shopId);
  const c = await prisma.metaAudienceConnection.findUnique({
    where: { shopId },
    select: {
      adAccountId: true, adAccountName: true, tokenSource: true, tokenExpiresAt: true, audienceId: true, audienceName: true,
      enabled: true, enabledAt: true, backfilledAt: true, status: true, stoppedReason: true, lastSyncedAt: true,
    },
  });
  if (!c) return { connection: null };
  const [synced, pending] = await Promise.all([
    prisma.metaAudienceMember.count({ where: { shopId, desired: "IN", syncedState: "IN" } }),
    // ค้างส่ง = desired ≠ syncedState (เพิ่มรอส่ง หรือถอนรอส่ง)
    prisma.metaAudienceMember.count({ where: { shopId, OR: [{ desired: "IN", syncedState: "OUT" }, { desired: "OUT", syncedState: "IN" }] } }),
  ]);
  return {
    connection: {
      ...c,
      hasToken: true,
      counts: { synced, pending },
      adsManagerUrl: c.audienceId ? adsManagerUrl(c.adAccountId, c.audienceId) : null,
      termsUrl: c.stoppedReason === "TERMS_NOT_ACCEPTED" ? termsUrl(c.adAccountId) : null,
    },
  };
}

/** ตรวจว่า token ใช้กับบัญชีโฆษณานี้ได้จริง ก่อนเก็บ */
async function verifyAdAccount(adAccountId: string, token: string, doFetch: typeof fetch): Promise<string> {
  let status = 0;
  let json: { name?: string } | null = null;
  try {
    const res = await doFetch(`${GRAPH_BASE}/act_${adAccountId}?fields=name,account_status`, { headers: { Authorization: `Bearer ${token}` } });
    status = res.status;
    json = await res.json().catch(() => null);
  } catch {
    /* ต่อไม่ติด = status 0 → ถือว่าตรวจไม่ผ่าน */
  }
  const outcome = classifyAudienceResult(status, json);
  if (outcome === "OK") return json?.name ?? `act_${adAccountId}`;
  throw outcome === "STOP"
    ? new AudienceError("TOKEN_INVALID", "token ใช้ไม่ได้หรือไม่มีสิทธิ์ ads_management")
    : new AudienceError("AD_ACCOUNT_INVALID", "ตรวจบัญชีโฆษณานี้ไม่ผ่าน — เช็ค Ad Account ID และสิทธิ์ของ token");
}

async function saveConnection(
  shopId: string, adAccountId: string, adAccountName: string, token: string,
  source: "OAUTH" | "MANUAL", expiresAt: Date | null,
) {
  const cur = await prisma.metaAudienceConnection.findUnique({ where: { shopId }, select: { adAccountId: true } });
  const fields = {
    adAccountId, adAccountName, tokenEnc: encryptToken(token), tokenSource: source, tokenExpiresAt: expiresAt,
    expiryWarnedAt: null, status: "ACTIVE", stoppedReason: null, stoppedAt: null, lockedAt: null,
  };
  if (!cur) {
    await prisma.metaAudienceConnection.create({ data: { shopId, ...fields } });
    return;
  }
  const changed = cur.adAccountId !== adAccountId;
  await prisma.metaAudienceConnection.update({
    where: { shopId },
    // เปลี่ยนบัญชีโฆษณา = audience ใหม่ในบัญชีใหม่ (ตัวเก่าไม่ลบ — BR-CA-04) → เติมทั้งหมดใหม่
    data: { ...fields, ...(changed ? { audienceId: null, audienceName: null } : {}) },
  });
  if (changed) await resetSynced(shopId);
}

/** ทางรอง: กรอก Ad Account ID + System User token เอง (ไม่หมดอายุ) */
export async function connectManual(shopId: string, input: { adAccountId: string; token: string }, doFetch: typeof fetch = fetch) {
  assertOpen(shopId);
  const name = await verifyAdAccount(input.adAccountId, input.token, doFetch);
  await saveConnection(shopId, input.adAccountId, name, input.token, "MANUAL", null);
}

/** ทางหลัก: เลือกบัญชีโฆษณาจากรายการที่ token ของ OAuth เข้าถึงได้ (ห้ามเลือกนอกรายการ) */
export async function connectOAuthAccount(
  shopId: string, adAccountId: string, pending: { token: string; expiresAt: Date | null }, doFetch: typeof fetch = fetch,
) {
  assertOpen(shopId);
  const accounts = await listAdAccounts(pending.token, doFetch).catch(() => {
    throw new AudienceError("TOKEN_INVALID", "token ใช้ไม่ได้ — เริ่มเชื่อมใหม่");
  });
  const acc = accounts.find((a) => a.adAccountId === adAccountId);
  if (!acc) throw new AudienceError("AD_ACCOUNT_INVALID", "ไม่พบบัญชีโฆษณานี้ในรายการที่เข้าถึงได้");
  await saveConnection(shopId, adAccountId, acc.name, pending.token, "OAUTH", pending.expiresAt);
}

/** เปิด/ปิด — ปิด = หยุดส่ง ไม่ลบ audience ใน Meta (BR-CA-04) · เปิดครั้งแรกตั้ง enabledAt (cron เติมย้อนหลัง FR-007) */
export async function setAudienceEnabled(shopId: string, enabled: boolean) {
  assertOpen(shopId);
  const c = await prisma.metaAudienceConnection.findUnique({ where: { shopId }, select: { enabledAt: true, status: true } });
  if (!c) throw new AudienceError("NOT_CONNECTED", "ยังไม่ได้เชื่อมบัญชีโฆษณา");
  if (enabled && c.status === "STOPPED") throw new AudienceError("CONNECTION_STOPPED", "การเชื่อมหยุดอยู่ — เชื่อมบัญชีโฆษณาใหม่ก่อน");
  await prisma.metaAudienceConnection.update({
    where: { shopId },
    data: { enabled, ...(enabled && !c.enabledAt ? { enabledAt: new Date() } : {}) },
  });
}

/** ตัดการเชื่อม — audience ใน Meta คงอยู่ (BR-CA-04) · ล้างแถวสมาชิกของร้านนี้ เชื่อมใหม่จะเติมย้อนหลังใหม่ */
export async function disconnectAudience(shopId: string) {
  assertOpen(shopId);
  await prisma.metaAudienceMember.deleteMany({ where: { shopId } });
  await prisma.metaAudienceConnection.deleteMany({ where: { shopId } });
}
