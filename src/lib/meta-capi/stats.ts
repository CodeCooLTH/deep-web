// feature 00089 — ตัวเลขผลการส่งของเพจ (แถวการ์ดสถิติ 4 ใบ) · อ่านอย่างเดียว ผูก shopId + เพจเสมอ
// ทำไมอยู่ที่นี่ ไม่ใช่ใน meta-capi-settings.service: รอบ UI ห้ามแตะ service ที่ทดสอบแล้ว — ย้ายเข้า service ได้ภายหลังโดยไม่เปลี่ยนสัญญา
import { prisma } from "@/lib/prisma";

const DAY = 864e5;
const BKK = 7 * 3600e3; // เขตเวลาไทย ไม่มี DST

export type CapiStatRow = {
  eventKey: string;
  dedupeKey: string;
  status: string;
  sentAt: Date | null;
  createdAt: Date;
  /** payload.value (บาท) — มีเฉพาะที่ผู้เรียกดึงมา */
  value: number | null;
};

export type CapiMetric = {
  total: number;
  prevTotal: number;
  /** % เทียบช่วงก่อนหน้ายาวเท่ากัน · null = ช่วงก่อนเป็น 0 (หารไม่ได้ — UI แสดง "ใหม่"/"—" ไม่ใช่ Infinity) */
  deltaPct: number | null;
  /** รายวันเรียงเก่า→ใหม่ ยาว = days · วันตามเวลาไทย */
  series: number[];
};

export type CapiStats = {
  days: number;
  pending: number;
  failed: number;
  oldestPendingAt: Date | null;
  lastSentAt: Date | null;
  sent: CapiMetric;
  sales: CapiMetric & { orders: number };
  leads: CapiMetric;
};

const deltaOf = (cur: number, prev: number) => (prev === 0 ? null : Math.round(((cur - prev) / prev) * 1000) / 10);

/**
 * rows → สถิติ · นับ dedupeKey ไม่ซ้ำ (เหตุการณ์ธุรกิจ 1 ครั้งที่ส่งเข้าหลายชุดข้อมูล = 1) ใช้ sentAt ที่เร็วสุดเป็นวันของมัน
 * ยอดขาย = ผลรวม value ของ PURCHASE ที่ SENT ต่อ dedupeKey ละ 1 ครั้ง
 */
export function aggregateCapiStats(rows: CapiStatRow[], days: number, now: Date = new Date()): CapiStats {
  const todayStart = Math.floor((now.getTime() + BKK) / DAY) * DAY - BKK;
  const start = todayStart - (days - 1) * DAY;
  const prevStart = start - days * DAY;
  const end = todayStart + DAY;

  const sentByKey = new Map<string, CapiStatRow>(); // dedupeKey → แถว SENT ที่เร็วสุด
  const pendingKeys = new Set<string>();
  const failedKeys = new Set<string>();
  let oldestPending: Date | null = null;
  let last: Date | null = null;
  for (const r of rows) {
    if (r.status === "SENT" && r.sentAt) {
      if (!last || r.sentAt > last) last = r.sentAt;
      const cur = sentByKey.get(r.dedupeKey);
      if (!cur || r.sentAt < cur.sentAt!) sentByKey.set(r.dedupeKey, r);
    } else if (r.status === "PENDING") {
      pendingKeys.add(r.dedupeKey);
      if (!oldestPending || r.createdAt < oldestPending) oldestPending = r.createdAt;
    } else if (r.status === "FAILED" && r.createdAt.getTime() >= start && r.createdAt.getTime() < end) failedKeys.add(r.dedupeKey);
  }

  const metric = (pick: (r: CapiStatRow) => boolean, amount: (r: CapiStatRow) => number): CapiMetric => {
    const series = Array<number>(days).fill(0);
    let total = 0;
    let prevTotal = 0;
    for (const r of sentByKey.values()) {
      if (!pick(r)) continue;
      const t = r.sentAt!.getTime();
      const a = amount(r);
      if (t >= start && t < end) {
        series[Math.floor((t - start) / DAY)] += a;
        total += a;
      } else if (t >= prevStart && t < start) prevTotal += a;
    }
    return { total, prevTotal, deltaPct: deltaOf(total, prevTotal), series };
  };
  const one = () => 1;
  const isPurchase = (r: CapiStatRow) => r.eventKey === "PURCHASE";
  const sales = metric(isPurchase, (r) => r.value ?? 0);
  return {
    days,
    pending: pendingKeys.size,
    failed: failedKeys.size,
    oldestPendingAt: oldestPending,
    lastSentAt: last,
    sent: metric(() => true, one),
    sales: { ...sales, orders: metric(isPurchase, one).total },
    leads: metric((r) => r.eventKey === "QUALIFIED_LEAD", one),
  };
}

const toNum = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export async function getCapiStats(shopId: string, channelId: string, days: 7 | 30, now: Date = new Date()): Promise<CapiStats> {
  const where = { shopId, dataset: { shopChannelId: channelId } };
  const since = new Date(now.getTime() - (2 * days + 1) * DAY); // ช่วงนี้ + ช่วงก่อน + กันขอบวันไทย
  const [recent, pending, last] = await Promise.all([
    prisma.metaCapiEvent.findMany({
      where: { ...where, OR: [{ status: "SENT", sentAt: { gte: since } }, { status: "FAILED", createdAt: { gte: since } }] },
      select: { eventKey: true, dedupeKey: true, status: true, sentAt: true, createdAt: true, payload: true },
    }),
    prisma.metaCapiEvent.findMany({ where: { ...where, status: "PENDING" }, select: { eventKey: true, dedupeKey: true, status: true, sentAt: true, createdAt: true } }),
    // ส่งล่าสุดอาจเก่ากว่าช่วงที่ดึง — ถามแยก (ไม่ให้การ์ดโชว์ "ยังไม่เคยส่ง" ทั้งที่เคย)
    prisma.metaCapiEvent.findFirst({ where: { ...where, status: "SENT" }, orderBy: { sentAt: "desc" }, select: { sentAt: true } }),
  ]);
  const rows: CapiStatRow[] = [
    ...recent.map(({ payload, ...r }) => ({ ...r, value: r.eventKey === "PURCHASE" ? toNum((payload as { value?: unknown } | null)?.value) : null })),
    ...pending.map((r) => ({ ...r, value: null })),
  ];
  const stats = aggregateCapiStats(rows, days, now);
  return { ...stats, lastSentAt: last?.sentAt ?? stats.lastSentAt };
}
