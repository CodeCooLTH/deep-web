// feature 00084 — แกะ body webhook ของ Flash (TFR-FLASH-016) รูป payload จริงยังรอพิสูจน์ (P0-9) จึงทนทุกรูป

import { hashWebhookSecret } from "./credential";

export type FlashWebhookKind = "status" | "weight" | "price" | "courier" | "routes";

/** webhookApiCode: status=0 weight=1 price=2 courier=3 routes=4 */
export const FLASH_WEBHOOK_KINDS: readonly FlashWebhookKind[] = ["status", "weight", "price", "courier", "routes"];

export interface ParsedWebhook {
  mchId: string | null;
  nonceStr: string | null;
  sign: string | null;
  /** data ที่แกะเป็น object แล้ว (null = ไม่ใช่ object) */
  data: Record<string, unknown> | null;
  /** ฟิลด์ระดับบนทั้งหมดไว้ให้ verifyWebhookSign */
  raw: Record<string, unknown>;
}

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const s = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v) : null);

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(text);
    return isRec(v) ? v : null;
  } catch {
    return null;
  }
}

/** JSON หรือ form-urlencoded; data เป็นสตริง JSON หรือ object; parse ไม่ได้ทั้งก้อน = null */
export function parseWebhookBody(contentType: string | null | undefined, text: string): ParsedWebhook | null {
  const ct = (contentType ?? "").toLowerCase();
  let raw: Record<string, unknown> | null = null;
  if (ct.includes("application/x-www-form-urlencoded")) raw = Object.fromEntries(new URLSearchParams(text));
  else raw = parseJsonObject(text) ?? (text.includes("=") && !text.trimStart().startsWith("{") ? Object.fromEntries(new URLSearchParams(text)) : null);
  if (!raw) return null;
  const d = typeof raw.data === "string" ? parseJsonObject(raw.data) : isRec(raw.data) ? raw.data : null;
  return { mchId: s(raw.mchId), nonceStr: s(raw.nonceStr), sign: s(raw.sign), data: d, raw };
}

const KIND_BY_HINT: Record<string, FlashWebhookKind> = {
  "0": "status", "1": "weight", "2": "price", "3": "courier", "4": "routes",
  status: "status", weight: "weight", price: "price", courier: "courier", routes: "routes",
};

/** ชนิดจากฟิลด์ใน data; ไม่ชัด → ใช้ hint (?k=) ถ้ามี ไม่งั้น null (ผู้เรียกตอบ success ไม่เขียน) */
export function inferFlashWebhookKind(data: unknown, hint?: string | null): FlashWebhookKind | null {
  const h = hint ? KIND_BY_HINT[hint.trim().toLowerCase()] : undefined;
  if (!isRec(data)) return h ?? null;
  const has = (k: string) => data[k] != null;
  // routes ต้องมาก่อน status เพราะ routes มีทุกอย่างของ status
  if (has("routedAction") || has("routeAction") || has("routedAt")) return "routes";
  if (has("ticketPickupId") || has("currentTicketPickupId")) return "courier";
  if (has("freightPrice") || has("chargableWeight") || has("pricePolicy") || has("priceAt")) return "price";
  if (has("weightTime") || (has("weight") && !has("state"))) return "weight";
  if (has("state") && has("pno")) return "status";
  return h ?? null;
}

export type WebhookUrlState = "EMPTY" | "OURS" | "OTHER_DEEP" | "EXTERNAL" | "UNKNOWN";

/**
 * จำแนก URL webhook ที่ Flash ตั้งไว้: ว่าง · เป็นของเรา (secret แฮชตรง) · Deep อื่น (path ของเราแต่ secret อื่น) ·
 * โฮสต์อื่น · อ่านไม่ออก
 */
export function classifyWebhookUrl(
  url: string | null | undefined,
  ours: { base: string; secretHash: string },
): { state: WebhookUrlState; host?: string } {
  const u = (url ?? "").trim();
  if (!u) return { state: "EMPTY" };
  let parsed: URL, base: URL;
  try {
    parsed = new URL(u);
    base = new URL(ours.base);
  } catch {
    return { state: "UNKNOWN" };
  }
  if (parsed.host !== base.host) return { state: "EXTERNAL", host: parsed.host };
  const m = /^\/api\/webhooks\/flash\/([^/]+)\/?$/.exec(parsed.pathname);
  if (!m) return { state: "EXTERNAL", host: parsed.host };
  return { state: hashWebhookSecret(decodeURIComponent(m[1])) === ours.secretHash ? "OURS" : "OTHER_DEEP", host: parsed.host };
}
