// feature 00097 — ตรรกะล้วนของ "บรรทัดเหตุการณ์ CAPI" ในห้องแชท/การ์ดคำสั่งซื้อ (ย้ายออกจาก JSX ให้เทสจับได้ ·
// conventions/ui-boolean-needs-a-testable-home) · ใช้ร่วมเว็บ + bundle ให้แชท Native (HR18) — ห้าม import server-only
import { capiReasonKey, type CapiReasonKey } from "@/lib/meta-capi/ui";

export type CapiStatus = "PENDING" | "SENT" | "FAILED" | "SKIPPED";

export interface CapiDatasetResult {
  label: string | null;
  datasetId: string;
  status: CapiStatus;
  reasonKey: CapiReasonKey;
  attempts: number;
  sentAt: string | null;
}

export interface CapiLineGroup {
  /** id แถวแรกของกลุ่ม — ใช้เป็น React key (ไม่ใช่ dedupeKey) */
  id: string;
  eventKey: string;
  /** min(createdAt) ของกลุ่ม — เวลาเข้าคิวที่เก่าสุด */
  at: string;
  value: number | null;
  datasets: CapiDatasetResult[];
}

/** แถว MetaCapiEvent เท่าที่ select (ไม่มี psid/lastRequest/lastResponse) */
export interface CapiRowLite {
  id: string;
  dedupeKey: string;
  eventKey: string;
  status: string;
  reason: string | null;
  attempts: number;
  sentAt: Date | string | null;
  createdAt: Date | string;
  payload: unknown;
  dataset: { label: string | null; datasetId: string };
}

const ms = (d: Date | string) => new Date(d).getTime();
const iso = (d: Date | string) => new Date(d).toISOString();
const dsName = (d: { label: string | null; datasetId: string }) => d.label ?? d.datasetId;

function valueOf(payload: unknown): number | null {
  const v = payload && typeof payload === "object" ? (payload as { value?: unknown }).value : undefined;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * รวมแถวตาม dedupeKey = 1 เหตุการณ์ธุรกิจที่ส่งหลายชุดข้อมูล · คืนเรียง at เก่า → ใหม่
 * ผู้เรียกต้อง scope แถวด้วย shopId มาแล้ว (คีย์ไม่ชนข้ามร้าน — SRS §7.3)
 */
export function groupCapiRows(rows: readonly CapiRowLite[]): CapiLineGroup[] {
  const byKey = new Map<string, CapiRowLite[]>();
  for (const r of rows) byKey.set(r.dedupeKey, [...(byKey.get(r.dedupeKey) ?? []), r]);
  const groups: CapiLineGroup[] = [];
  for (const g of byKey.values()) {
    const ordered = [...g].sort((a, b) => dsName(a.dataset).localeCompare(dsName(b.dataset)) || a.dataset.datasetId.localeCompare(b.dataset.datasetId));
    groups.push({
      // แถวแรกตามลำดับชื่อชุดข้อมูล — เสถียรเมื่อ createdAt เท่ากัน
      id: ordered[0].id,
      eventKey: ordered[0].eventKey,
      at: iso(new Date(Math.min(...g.map((r) => ms(r.createdAt))))),
      value: valueOf(ordered[0].payload),
      datasets: ordered.map((r) => ({
        label: r.dataset.label,
        datasetId: r.dataset.datasetId,
        status: r.status as CapiStatus,
        reasonKey: capiReasonKey({ status: r.status, reason: r.reason }),
        attempts: r.attempts,
        sentAt: r.sentAt ? iso(r.sentAt) : null,
      })),
    });
  }
  return groups.sort((a, b) => ms(a.at) - ms(b.at) || a.id.localeCompare(b.id));
}

/** ลำดับ "แย่สุด" — ล้มเหลว > รอ > ข้าม > Meta รับแล้ว (BR-GRP-01) */
const WORST_ORDER: readonly CapiStatus[] = ["FAILED", "PENDING", "SKIPPED", "SENT"];

export type CapiGroupResult =
  | { kind: "sending"; status: "PENDING"; worst: "PENDING"; okCount: 0; total: number; shortReasonKey: null; sentAt: null }
  | { kind: "uniform" | "mixed"; status: CapiStatus | null; worst: CapiStatus; okCount: number; total: number; shortReasonKey: CapiReasonKey | null; sentAt: string | null };

/** ผลของกลุ่ม: ทุกชุดยังไม่เคยยิง = sending · สถานะเดียวกันหมด = uniform · นอกนั้น = mixed (queued+SENT ก็ mixed) */
export function capiGroupResult(g: Pick<CapiLineGroup, "datasets">): CapiGroupResult {
  const ds = g.datasets;
  const total = ds.length;
  if (total > 0 && ds.every((d) => d.reasonKey === "queued")) {
    return { kind: "sending", status: "PENDING", worst: "PENDING", okCount: 0, total, shortReasonKey: null, sentAt: null };
  }
  const okCount = ds.filter((d) => d.status === "SENT").length;
  const worst = WORST_ORDER.find((s) => ds.some((d) => d.status === s)) ?? "SENT";
  const uniform = total > 0 && ds.every((d) => d.status === ds[0].status);
  const first = ds[0]?.reasonKey;
  const allSent = uniform && ds[0].status === "SENT";
  return {
    kind: uniform ? "uniform" : "mixed",
    status: uniform ? ds[0].status : null,
    worst,
    okCount,
    total,
    shortReasonKey: uniform && first && first !== "none" ? first : null,
    // ไม่มี sentAt สักชุด (แถวเก่า/ข้อมูลไม่ครบ) = null ไม่ใช่ 1970
    sentAt: allSent && ds.some((d) => d.sentAt) ? iso(new Date(Math.max(...ds.map((d) => (d.sentAt ? ms(d.sentAt) : 0))))) : null,
  };
}

/** มีชุดที่กำลังรอยิง/ลองใหม่ = ควรดึงถี่ (10 วิ) · waitToken (ชุดหยุด) ไม่นับ */
export const capiNeedsFastRefresh = (groups: readonly Pick<CapiLineGroup, "datasets">[]): boolean =>
  groups.some((g) => g.datasets.some((d) => d.reasonKey === "queued" || d.reasonKey === "retrying"));

export type CapiTimelineItem<M> = { type: "message"; m: M } | { type: "capi"; groups: CapiLineGroup[] };

// วันตามเขตเวลาไทย (UTC+7 ไม่มี DST) — ใช้แยก "วันเดียวกัน" ของบรรทัดรวม
const thaiDay = (d: Date | string) => new Date(ms(d) + 7 * 3600_000).toISOString().slice(0, 10);

/**
 * แทรกกลุ่มในรายการข้อความตามเวลา (เวลาเท่ากัน ข้อความมาก่อน) แล้วรวมกลุ่มที่ติดกัน+วันเดียวกันเป็น item เดียว
 * hasOlder = ยังมีข้อความเก่ากว่าที่โหลด → ตัดกลุ่มที่เก่ากว่าข้อความแรกที่โหลดทิ้ง · ข้อความที่ไม่มี createdAt (optimistic) อยู่ท้ายเสมอ
 */
export function buildCapiTimeline<M extends { createdAt?: Date | string | null }>(
  messages: readonly M[],
  groups: readonly CapiLineGroup[],
  opts: { hasOlder: boolean },
): CapiTimelineItem<M>[] {
  const firstTime = messages.find((m) => m.createdAt)?.createdAt;
  const cut = opts.hasOlder && firstTime ? ms(firstTime) : -Infinity;
  const pending = [...groups].filter((g) => ms(g.at) >= cut).sort((a, b) => ms(a.at) - ms(b.at));
  const out: CapiTimelineItem<M>[] = [];
  let gi = 0;
  const pushGroup = (g: CapiLineGroup) => {
    const last = out[out.length - 1];
    if (last?.type === "capi" && thaiDay(last.groups[0].at) === thaiDay(g.at)) last.groups.push(g);
    else out.push({ type: "capi", groups: [g] });
  };
  for (const m of messages) {
    const t = m.createdAt ? ms(m.createdAt) : Infinity;
    while (gi < pending.length && ms(pending[gi].at) < t) pushGroup(pending[gi++]);
    out.push({ type: "message", m });
  }
  while (gi < pending.length) pushGroup(pending[gi++]);
  return out;
}

export type CapiDayItem<R> = { type: "row"; r: R } | { type: "capi"; groups: CapiLineGroup[] };

/**
 * จัดห้องเป็น "วัน → แถว/บรรทัด CAPI" — แถว = บับเบิลเดี่ยวหรืออัลบั้ม (พร้อมแถว meta ของมัน) เป็นหน่วยเดียว
 * `at` ของแถว = เวลาของข้อความท้ายแถว ⇒ บรรทัด CAPI ไม่มีทางแทรกกลางบับเบิล/อัลบั้ม และเวลาเท่ากันตามหลังแถว
 * วันที่มีแต่เหตุการณ์ได้หัววันของตัวเอง (dayOf = คีย์วันเดียวกับที่ใช้ของแถว)
 */
export function layoutCapiDays<R>(
  rows: readonly { day: string; at: Date | string | null; r: R }[],
  groups: readonly CapiLineGroup[],
  opts: { hasOlder: boolean },
  dayOf: (iso: string) => string,
): { day: string; items: CapiDayItem<R>[] }[] {
  const out: { day: string; items: CapiDayItem<R>[] }[] = [];
  const push = (day: string, item: CapiDayItem<R>) => {
    const last = out[out.length - 1];
    if (last?.day === day) last.items.push(item);
    else out.push({ day, items: [item] });
  };
  for (const it of buildCapiTimeline(rows.map((x) => ({ createdAt: x.at, x })), groups, opts)) {
    if (it.type === "message") push(it.m.x.day, { type: "row", r: it.m.x.r });
    else push(dayOf(it.groups[0].at), it);
  }
  return out;
}

export interface CapiLineSummary {
  /** ทุกเหตุการณ์ยังไม่เคยยิงทั้งก้อน = แถว "กำลังส่ง" ไม่มีผล/ปุ่ม */
  sending: boolean;
  allReceived: boolean;
  worst: CapiStatus;
  okCount: number;
  total: number;
}

/** สรุปของบรรทัดรวม (≥1 เหตุการณ์): ok = เหตุการณ์ที่ทุกชุด Meta รับแล้ว · worst = ล้มเหลว > รอ > ข้าม > รับแล้ว (BR-GRP-01) */
export function capiLineSummary(groups: readonly Pick<CapiLineGroup, "datasets">[]): CapiLineSummary {
  const rs = groups.map(capiGroupResult);
  const okCount = rs.filter((r) => r.worst === "SENT").length;
  return {
    sending: rs.length > 0 && rs.every((r) => r.kind === "sending"),
    allReceived: rs.length > 0 && okCount === rs.length,
    worst: WORST_ORDER.find((s) => rs.some((r) => r.worst === s)) ?? "SENT",
    okCount,
    total: rs.length,
  };
}
