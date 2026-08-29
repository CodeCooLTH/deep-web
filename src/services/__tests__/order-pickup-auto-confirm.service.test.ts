import { describe, it, expect, vi, beforeEach } from "vitest";

// U10 (feature 00062) — mirror pattern ของ order-shipment-tracking.service.test.ts
// (mock เฉพาะ model ที่ใช้จริง) query ตรงจาก Order ไม่ผ่าน OrderShipment
vi.mock("@/lib/prisma", () => {
  const prismaMock: Record<string, unknown> = {
    order: { findMany: vi.fn(), updateMany: vi.fn() },
    orderEvent: { create: vi.fn() },
    user: { findUnique: vi.fn() },
  };
  return { prisma: prismaMock };
});

import { prisma } from "@/lib/prisma";
import { autoConfirmPickup } from "../order-pickup-auto-confirm.service";
import { PICKUP_AUTOCONFIRM_HOURS } from "@/lib/order-pickup";

const HOUR_MS = 60 * 60 * 1000;

function candidateOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "order-1",
    handedOverAt: new Date("2026-08-20T00:00:00Z"),
    disputeOpenedAt: null,
    disputeResolvedAt: null,
    ...overrides,
  };
}

describe("autoConfirmPickup", () => {
  beforeEach(() => vi.clearAllMocks());

  it("(1) ปิดใบที่พ้น 48 ชม.และไม่มีข้อพิพาท", async () => {
    (prisma.order.findMany as any).mockResolvedValue([candidateOrder()]);
    (prisma.order.updateMany as any).mockResolvedValue({ count: 1 });

    const now = new Date("2026-08-22T00:00:00Z");
    const result = await autoConfirmPickup(now);

    expect(result).toEqual({
      scanned: 1,
      confirmed: 1,
      skippedDispute: 0,
      skippedAlreadyClosed: 0,
      failed: 0,
    });
    // conditional update — where ต้องมี status: 'PENDING' เพื่อความ idempotent
    expect(prisma.order.updateMany).toHaveBeenCalledWith({
      where: { id: "order-1", status: "PENDING" },
      data: { status: "CONFIRMED" },
    });
    // ใช้ SYSTEM_CONFIRMED ที่มีอยู่แล้ว + meta.reason ระบุที่มา (ห้ามสร้าง event ชนิดใหม่)
    expect(prisma.orderEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderId: "order-1",
          type: "SYSTEM_CONFIRMED",
          meta: expect.objectContaining({ reason: "AUTO_CONFIRM_PICKUP" }),
        }),
      }),
    );
  });

  it("(2) ข้ามใบที่มีข้อพิพาทค้าง — ไม่แตะ DB เลย", async () => {
    (prisma.order.findMany as any).mockResolvedValue([
      candidateOrder({
        disputeOpenedAt: new Date("2026-08-20T01:00:00Z"),
        disputeResolvedAt: null,
      }),
    ]);

    const result = await autoConfirmPickup(new Date("2026-08-22T00:00:00Z"));

    expect(result.skippedDispute).toBe(1);
    expect(result.confirmed).toBe(0);
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
    expect(prisma.orderEvent.create).not.toHaveBeenCalled();
  });

  it("(3) ยังไม่ครบ 48 ชม. — cutoff ที่ส่งเข้า WHERE ต้องคำนวณจาก PICKUP_AUTOCONFIRM_HOURS จริง", async () => {
    // mock ไม่ได้กรองแถวจริงตาม WHERE (ต่างจาก DB จริง) — เทสนี้จึงยืนยันที่ "ค่า cutoff ที่ส่งเข้า
    // WHERE" แทน: ถ้าไม่ตรงกับ PICKUP_AUTOCONFIRM_HOURS ใบที่ยังไม่ครบชั่วโมงจะหลุดมาถูกปิดจริงบน DB
    (prisma.order.findMany as any).mockResolvedValue([]);
    const now = new Date("2026-08-22T00:00:00Z");
    await autoConfirmPickup(now);

    const call = (prisma.order.findMany as any).mock.calls[0][0];
    const expectedCutoff = new Date(now.getTime() - PICKUP_AUTOCONFIRM_HOURS * HOUR_MS);
    expect(call.where.handedOverAt).toEqual({ not: null, lte: expectedCutoff });
  });

  it("(4) idempotent — รันซ้ำ count=0 ได้ skippedAlreadyClosed ไม่สร้าง event ซ้ำ", async () => {
    (prisma.order.findMany as any).mockResolvedValue([candidateOrder()]);
    (prisma.order.updateMany as any).mockResolvedValue({ count: 0 });

    const result = await autoConfirmPickup(new Date("2026-08-22T00:00:00Z"));

    expect(result.confirmed).toBe(0);
    expect(result.skippedAlreadyClosed).toBe(1);
    expect(prisma.orderEvent.create).not.toHaveBeenCalled();
  });

  it("(5) ไม่แตะออเดอร์ fulfillmentMode='SHIPPED' — WHERE ต้องกรอง fulfillmentMode='PICKUP' และ status='PENDING' เสมอ", async () => {
    (prisma.order.findMany as any).mockResolvedValue([]);
    await autoConfirmPickup(new Date("2026-08-22T00:00:00Z"));

    const call = (prisma.order.findMany as any).mock.calls[0][0];
    expect(call.where.fulfillmentMode).toBe("PICKUP");
    expect(call.where.status).toBe("PENDING");
  });

  it("ล้มทีละใบ ไม่ล้มทั้ง batch — ใบที่เหลือยังถูกปิดต่อ", async () => {
    (prisma.order.findMany as any).mockResolvedValue([
      candidateOrder({ id: "order-err" }),
      candidateOrder({ id: "order-ok" }),
    ]);
    (prisma.order.updateMany as any)
      .mockRejectedValueOnce(new Error("db down"))
      .mockResolvedValueOnce({ count: 1 });

    const result = await autoConfirmPickup(new Date("2026-08-22T00:00:00Z"));

    expect(result.failed).toBe(1);
    expect(result.confirmed).toBe(1);
  });
});
