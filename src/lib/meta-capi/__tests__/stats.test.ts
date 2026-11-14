import { describe, expect, it } from "vitest";
import { aggregateCapiStats, type CapiStatRow } from "../stats";

// now = 14 พ.ย. 2569(2026) 12:00 เวลาไทย = 05:00Z · วันนี้ไทยเริ่ม 2026-11-13T17:00Z
const NOW = new Date("2026-11-14T05:00:00Z");
const sent = (eventKey: string, dedupeKey: string, sentAt: string, value: number | null = null): CapiStatRow => ({
  eventKey, dedupeKey, status: "SENT", sentAt: new Date(sentAt), createdAt: new Date(sentAt), value,
});

describe("aggregateCapiStats", () => {
  it("เหตุการณ์เดียวกันที่ส่งเข้า 2 ชุดข้อมูล นับ 1 และยอดนับครั้งเดียว", () => {
    const s = aggregateCapiStats(
      [sent("PURCHASE", "purchase:o1", "2026-11-14T01:00:00Z", 500), sent("PURCHASE", "purchase:o1", "2026-11-14T01:00:05Z", 500), sent("PURCHASE", "purchase:o2", "2026-11-13T05:00:00Z", 300)],
      7, NOW,
    );
    expect(s.sent.total).toBe(2);
    expect(s.sales.total).toBe(800);
    expect(s.sales.orders).toBe(2);
  });

  it("ขอบวันเวลาไทย: 16:59Z ยังเป็นเมื่อวาน · 17:00Z เป็นวันนี้", () => {
    const s = aggregateCapiStats([sent("QUALIFIED_LEAD", "a", "2026-11-13T16:59:59Z"), sent("QUALIFIED_LEAD", "b", "2026-11-13T17:00:00Z")], 7, NOW);
    expect(s.leads.series).toEqual([0, 0, 0, 0, 0, 1, 1]);
    expect(s.leads.total).toBe(2);
  });

  it("ช่วงก่อนหน้า: ไม่ปนกับช่วงนี้ และคิด delta %", () => {
    const rows = [
      sent("QUALIFIED_LEAD", "c1", "2026-11-14T01:00:00Z"),
      sent("QUALIFIED_LEAD", "c2", "2026-11-12T01:00:00Z"),
      sent("QUALIFIED_LEAD", "c3", "2026-11-05T01:00:00Z"), // ก่อนช่วงนี้ (ช่วงนี้เริ่ม 8 พ.ย.)
      sent("QUALIFIED_LEAD", "c4", "2026-11-04T01:00:00Z"),
      sent("QUALIFIED_LEAD", "c5", "2026-11-03T01:00:00Z"),
      sent("QUALIFIED_LEAD", "c6", "2026-11-02T01:00:00Z"),
      sent("QUALIFIED_LEAD", "c7", "2026-10-20T01:00:00Z"), // เก่ากว่าสองช่วง
    ];
    const l = aggregateCapiStats(rows, 7, NOW).leads;
    expect([l.total, l.prevTotal, l.deltaPct]).toEqual([2, 4, -50]);
  });

  it("ช่วงก่อนเป็น 0 -> deltaPct = null (ไม่ใช่ Infinity)", () => {
    const s = aggregateCapiStats([sent("QUALIFIED_LEAD", "x", "2026-11-14T01:00:00Z")], 7, NOW);
    expect(s.leads.deltaPct).toBeNull();
    expect(aggregateCapiStats([], 7, NOW).sent.deltaPct).toBeNull();
  });

  it("รอส่ง = PENDING ตอนนี้ไม่ผูกช่วง (distinct) + เก่าสุด · ล้มเหลวนับเฉพาะในช่วง", () => {
    const p = (k: string, at: string): CapiStatRow => ({ eventKey: "PURCHASE", dedupeKey: k, status: "PENDING", sentAt: null, createdAt: new Date(at), value: null });
    const f = (k: string, at: string): CapiStatRow => ({ eventKey: "PURCHASE", dedupeKey: k, status: "FAILED", sentAt: null, createdAt: new Date(at), value: null });
    const s = aggregateCapiStats([p("a", "2026-11-14T03:00:00Z"), p("a", "2026-11-14T03:00:01Z"), p("b", "2026-11-10T00:00:00Z"), f("c", "2026-11-13T00:00:00Z"), f("d", "2026-10-01T00:00:00Z")], 7, NOW);
    expect(s.pending).toBe(2);
    expect(s.oldestPendingAt).toEqual(new Date("2026-11-10T00:00:00Z"));
    expect(s.failed).toBe(1);
  });

  it("ยอดขายรายวันรวมต่อวัน · แถว SENT ไม่มี sentAt ถูกข้าม", () => {
    const rows = [sent("PURCHASE", "p1", "2026-11-14T01:00:00Z", 100), sent("PURCHASE", "p2", "2026-11-14T02:00:00Z", 50.5), { ...sent("PURCHASE", "p3", "2026-11-14T02:00:00Z", 9), sentAt: null }];
    const s = aggregateCapiStats(rows, 7, NOW);
    expect(s.sales.series[6]).toBe(150.5);
    expect(s.sales.total).toBe(150.5);
    expect(s.lastSentAt).toEqual(new Date("2026-11-14T02:00:00Z"));
  });

  it("30 วัน: series ยาว 30", () => expect(aggregateCapiStats([], 30, NOW).sent.series).toHaveLength(30));
});
