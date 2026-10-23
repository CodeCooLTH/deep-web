// feature 00084 T10c/T11 — ตรรกะตัดสิน UI ของหน้ารายการคำสั่งซื้อ (pure: เทสได้ตรง ๆ ไม่แตะ DOM/เครือข่าย)
import { escapeHtml } from "@/lib/html-escape";
import { hasUsableShipment, shipmentApiBase } from "@/lib/shipping/provider";

export const FLASH_ONE_BY_ONE = "ใบปะหน้า Flash พิมพ์ได้ทีละใบ";

// ─── hover card ─────────────────────────────────────────────────────────────

export type HoverFetchPlan =
  | { kind: "none" }
  | { kind: "review" }
  | { kind: "fetch"; url: string };

/** NEEDS_REVIEW ไม่มี pno ⇒ ไม่ยิง traces · ไม่มี shipmentId (ร้านแจ้งเลขเอง) ⇒ ไม่มีอะไรให้ถาม */
export function hoverFetchPlan(s: {
  provider?: string | null;
  shipmentId: string | null;
  status?: string | null;
}): HoverFetchPlan {
  if (!s.shipmentId) return { kind: "none" };
  if (s.status === "NEEDS_REVIEW") return { kind: "review" };
  return { kind: "fetch", url: `${shipmentApiBase(s.provider)}/shipments/${s.shipmentId}/traces` };
}

// ─── พิมพ์ใบปะหน้าหลายใบ ────────────────────────────────────────────────────

export type BulkLabelRow = {
  /** token ที่ส่งให้ bulk (shortCode || publicToken) — server ใช้เป็น shipmentId ของใบที่ไม่พบ/ไม่มีพัสดุ */
  token: string
  orderLabel: string
  recipient: string | null
  shipmentId: string | null
  provider: string | null
  status: string | null
}

export type SkippedItem = { shipmentId: string; reason: string }

export type SkippedEntry = {
  orderLabel: string | null
  recipient: string | null
  reason: string
  /** มีค่า = ใบ Flash ที่เปิดทีละใบได้ */
  flashShipmentId: string | null
}

export type BulkPrintMode = "bulk" | "single-flash" | "flash-list";

const isFlash = (r: BulkLabelRow) => r.provider === "FLASH";

export function planBulkPrint(rows: BulkLabelRow[]): BulkPrintMode {
  if (rows.length === 0 || !rows.every(isFlash)) return "bulk";
  return rows.length === 1 ? "single-flash" : "flash-list";
}

/** อ่าน x-skipped-detail — พังหรือรูปไม่ตรง = [] (ผู้เรียกยังมีจำนวนจาก x-skipped-count) */
export function parseSkippedDetail(raw: string | null): SkippedItem[] {
  try {
    const arr = JSON.parse(decodeURIComponent(raw ?? "[]")) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (i): i is SkippedItem => !!i && typeof i.shipmentId === "string" && typeof i.reason === "string",
    );
  } catch {
    return [];
  }
}

/**
 * รายการที่ "ไม่ได้พิมพ์" ครบทุกใบ — จับคู่ x-skipped-detail กับแถวที่เลือก (ด้วย shipmentId หรือ token)
 * ใบ Flash ที่ server ไม่ได้รายงานก็ต้องขึ้น (ห้ามหายเงียบ) · printed นับเฉพาะที่พิมพ์จริง
 */
export function buildSkippedEntries(
  rows: BulkLabelRow[],
  skipped: SkippedItem[],
  skippedCountHeader = 0,
): { entries: SkippedEntry[]; printed: number } {
  const covered = new Set<BulkLabelRow>();
  const entries: SkippedEntry[] = [];
  const entryOf = (row: BulkLabelRow | undefined, reason: string): SkippedEntry => ({
    orderLabel: row?.orderLabel ?? null,
    recipient: row?.recipient ?? null,
    reason,
    flashShipmentId: row && isFlash(row) && row.shipmentId && hasUsableShipment(row.status) ? row.shipmentId : null,
  });

  for (const item of skipped) {
    const row = rows.find((r) => !covered.has(r) && (r.shipmentId === item.shipmentId || r.token === item.shipmentId));
    if (row) covered.add(row);
    entries.push(entryOf(row, item.reason));
  }
  for (const row of rows) {
    if (!isFlash(row) || covered.has(row)) continue;
    covered.add(row);
    entries.push(
      entryOf(row, row.shipmentId && hasUsableShipment(row.status) ? FLASH_ONE_BY_ONE : "ยังไม่มีพัสดุ Flash ที่ใช้ได้ (ไม่มีใบปะหน้า)"),
    );
  }
  // header บอกว่าข้ามมากกว่าที่ detail ระบุ (detail พัง) — ใช้ตัวมากกว่า ไม่นับพิมพ์เกินจริง
  const skippedTotal = Math.max(entries.length, skippedCountHeader);
  return { entries, printed: Math.max(0, rows.length - skippedTotal) };
}

/** HTML ของรายการใน Swal — ข้อมูลผู้ใช้ผ่าน escapeHtml · ลิงก์ ≥44px (min-h-11) เปิดแท็บใหม่ Swal ไม่ปิด */
export function skippedListHtml(entries: SkippedEntry[], intro: string): string {
  const li = entries
    .map((e) => {
      const who = [e.orderLabel, e.recipient].filter(Boolean).map((t) => escapeHtml(t as string)).join(" · ");
      const action = e.flashShipmentId
        ? `<a href="/api/seller/flash/shipments/${encodeURIComponent(e.flashShipmentId)}/label" target="_blank" rel="noopener noreferrer" class="btn bg-primary/15 text-primary-ink hover:bg-primary/25 inline-flex min-h-11 shrink-0 items-center gap-1 text-nowrap">เปิดใบปะหน้า</a>`
        : `<span class="text-default-700 text-xs">${escapeHtml(e.reason)}</span>`;
      return `<li class="border-default-200 flex items-center justify-between gap-3 border-b border-dashed py-2 text-start last:border-b-0"><span class="text-default-900 min-w-0 break-words text-sm">${who || escapeHtml(e.reason)}</span>${action}</li>`;
    })
    .join("");
  return `<p class="text-default-700 mb-3 text-sm">${escapeHtml(intro)}</p><ul class="mb-0 max-h-72 list-none overflow-y-auto ps-0">${li}</ul>`;
}

// ─── POD ────────────────────────────────────────────────────────────────────

export type PodView = {
  signer: string | null
  signerTypeText: string | null
  podUrl: string | null
  photos: string[]
  lat: number | null
  lng: number | null
  deliveredAt: string | null
}

export function podMapUrl(lat: number | null, lng: number | null): string | null {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

/** บรรทัด POD สำหรับ "คัดลอกทั้งหมด" — format เวลาส่งเข้ามา (lib ไม่ผูก formatDateTime) */
export function podCopyLines(pod: PodView, fmt: (iso: string) => string): string[] {
  const lines: string[] = [];
  if (pod.signer) lines.push(`  ผู้เซ็นรับ: ${pod.signer}${pod.signerTypeText ? ` (${pod.signerTypeText})` : ""}`);
  const at = podTimeIso(pod.deliveredAt);
  if (at) lines.push(`  ส่งถึงเมื่อ: ${fmt(at)}`);
  if (pod.lat != null && pod.lng != null) lines.push(`  ตำแหน่งพนักงานตอนส่ง: ${pod.lat}, ${pod.lng}`);
  if (pod.podUrl) lines.push(`  ลิงก์หลักฐาน: ${pod.podUrl}`);
  pod.photos.forEach((u, i) => lines.push(`  รูปที่ ${i + 1}: ${u}`));
  return lines;
}

/** deliveredAt อาจเป็น ISO หรือ stateDate ของ Flash (epoch วินาที/มิลลิวินาทีเป็นสตริง) — อ่านไม่ออก = null (ไม่โชว์ "Invalid Date") */
export function podTimeIso(raw: string | null): string | null {
  if (!raw) return null;
  const t = /^\d{9,13}$/.test(raw) ? Number(raw) * (raw.length <= 10 ? 1000 : 1) : Date.parse(raw);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}
