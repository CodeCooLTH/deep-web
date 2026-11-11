// feature 00089 — ตัวตัดสินฝั่งหน้าจอของ Conversions API (ย้ายออกจาก JSX ให้เทสจับได้ · conventions/ui-boolean-needs-a-testable-home)
// ไม่ import อะไรที่เป็น server-only — client component ใช้ได้

export type CapiPageStatus = "sending" | "problem" | "stopped" | "off";
export type CapiPurchaseAt = "CREATE" | "CONFIRM" | "PAYMENT";

type DsLite = { status: string };

/**
 * สถานะเพจบนป้าย (มติ U2): ปิด/ไม่มี dataset = off · หยุดทุกชุด = stopped (danger) · หยุดบางชุด = problem (warning) · นอกนั้น = sending
 * "ส่งอยู่" ≠ Meta รับแล้ว (D7) — จึงไม่มีสถานะเขียว
 */
export function capiPageStatus(s: { enabled: boolean; datasets: readonly DsLite[] }): CapiPageStatus {
  if (!s.enabled || s.datasets.length === 0) return "off";
  const stopped = s.datasets.filter((d) => d.status === "STOPPED").length;
  if (stopped === 0) return "sending";
  return stopped === s.datasets.length ? "stopped" : "problem";
}

export const stoppedCount = (ds: readonly DsLite[]) => ds.filter((d) => d.status === "STOPPED").length;

/** จังหวะ Purchase ที่จะโชว์ในรายการ — ไม่มี dataset ไหนเปิด PURCHASE = null ("ไม่ได้เปิด") */
export function purchaseTimingOf(s: { purchaseAt: string; datasets: readonly { events: readonly string[] }[] }): CapiPurchaseAt | null {
  if (!s.datasets.some((d) => d.events.includes("PURCHASE"))) return null;
  return s.purchaseAt === "CONFIRM" || s.purchaseAt === "PAYMENT" ? s.purchaseAt : "CREATE";
}

export type CapiReasonKey = "queued" | "retrying" | "waitToken" | "maxAttempts" | "rejected" | "tooOld" | "none";

/** แปลเหตุผลภายในของแถวคิวเป็นคีย์ข้อความไทย — ไม่ปล่อยรหัสดิบของ Meta ออกหน้าจอ */
export function capiReasonKey(r: { status: string; reason: string | null }): CapiReasonKey {
  if (r.status === "SENT") return "none";
  if (r.status === "SKIPPED") return r.reason === "TOO_OLD" ? "tooOld" : "none";
  if (r.status === "FAILED") return r.reason === "MAX_ATTEMPTS" ? "maxAttempts" : "rejected";
  if (r.status === "PENDING") return r.reason === "TOKEN_OR_PERMISSION" ? "waitToken" : r.reason === "RETRYING" ? "retrying" : "queued";
  return "none";
}

// ── กฎแท็ก → Lead ────────────────────────────────────────────────────────────────────────
export const MAX_RULES = 20;
export const MAX_VALUE_BAHT = 10_000_000;

export type RuleDraft = { tagId: string; value: string };
export type RuleSaved = { tagId: string; valueBaht?: number };

/** "" = ไม่ส่งมูลค่า · ไม่ใช่ตัวเลข/ติดลบ/เกินเพดาน = ไม่ผ่าน */
export function parseRuleValue(s: string): { ok: true; value: number | undefined } | { ok: false } {
  const t = s.trim().replace(/,/g, "");
  if (t === "") return { ok: true, value: undefined };
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return { ok: false };
  const n = Number(t);
  return n >= 0 && n <= MAX_VALUE_BAHT ? { ok: true, value: n } : { ok: false };
}

export const draftsOf = (rules: readonly RuleSaved[] | undefined): RuleDraft[] =>
  (rules ?? []).map((r) => ({ tagId: r.tagId, value: r.valueBaht === undefined ? "" : String(r.valueBaht) }));

/** แก้ค้างไหม — เทียบลำดับ+ค่า (ตัวเลขเทียบเป็นเลข "200" กับ "200.00" ไม่ถือว่าต่าง) */
export function rulesDirty(saved: readonly RuleSaved[] | undefined, drafts: readonly RuleDraft[]): boolean {
  const s = saved ?? [];
  if (s.length !== drafts.length) return true;
  return drafts.some((d, i) => {
    const p = parseRuleValue(d.value);
    return d.tagId !== s[i].tagId || (p.ok ? p.value : NaN) !== s[i].valueBaht;
  });
}

/** ผลตรวจก่อนบันทึก: แถวที่ไม่เลือกแท็ก / มูลค่าไม่ผ่าน (ดัชนีแถว) · แท็กซ้ำถือว่าไม่ผ่านด้วย (หนึ่งแท็กหนึ่งกฎ) */
export function validateRules(drafts: readonly RuleDraft[]): { noTag: number[]; badValue: number[]; duplicate: number[] } {
  const seen = new Set<string>();
  const out = { noTag: [] as number[], badValue: [] as number[], duplicate: [] as number[] };
  drafts.forEach((d, i) => {
    if (!d.tagId) out.noTag.push(i);
    else if (seen.has(d.tagId)) out.duplicate.push(i);
    else seen.add(d.tagId);
    if (!parseRuleValue(d.value).ok) out.badValue.push(i);
  });
  return out;
}

export const rulesValid = (v: ReturnType<typeof validateRules>) => !v.noTag.length && !v.badValue.length && !v.duplicate.length;

export const toSavedRules = (drafts: readonly RuleDraft[]): RuleSaved[] =>
  drafts.map((d) => {
    const p = parseRuleValue(d.value);
    return { tagId: d.tagId, ...(p.ok && p.value !== undefined ? { valueBaht: p.value } : {}) };
  });

/** กลุ่ม + ลำดับ 12 เหตุการณ์บนหน้า detail (Design-Spec §D) — ต้องครบทุกคีย์ใน CAPI_EVENTS (เทสคุม) */
export const CAPI_EVENT_GROUPS = [
  { id: "before", keys: ["VIEW_CONTENT", "LEAD_SUBMITTED", "QUALIFIED_LEAD", "CART_ABANDONED"] },
  { id: "buy", keys: ["PURCHASE", "ORDER_CREATED", "INITIATE_CHECKOUT", "ADD_PAYMENT_INFO"] },
  { id: "after", keys: ["ORDER_SHIPPED", "ORDER_DELIVERED", "ORDER_CANCELED", "ORDER_RETURNED"] },
] as const;

/** เหตุการณ์ที่มีตัวตั้งยอด (ปุ่ม "ตั้งยอด") — มียอด แต่ไม่ใช่ ViewContent (ราคาตามการ์ด) และไม่ใช่ Lead (ยอดตามกฎแท็ก) */
export const AMOUNT_EVENT_KEYS: ReadonlySet<string> = new Set([
  "PURCHASE", "ORDER_CREATED", "ADD_PAYMENT_INFO", "ORDER_SHIPPED", "ORDER_DELIVERED", "ORDER_CANCELED", "ORDER_RETURNED", "CART_ABANDONED",
]);
export const RULE_EVENT_KEYS = ["LEAD_SUBMITTED", "QUALIFIED_LEAD"] as const;
