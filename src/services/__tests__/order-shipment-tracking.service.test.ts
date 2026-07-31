import { describe, it, expect, vi, beforeEach } from "vitest";

// S-12 — updateShipmentTracking() ต้อง update อย่างเดียว ไม่แตะ order.status
// mock prisma ตาม pattern shop-slug.service.test.ts (mock เฉพาะ model ที่ใช้จริง)
vi.mock("@/lib/prisma", () => ({
  prisma: {
    order: { findFirst: vi.fn() },
    shipmentTracking: { update: vi.fn() },
  },
}));
import { prisma } from "@/lib/prisma";
import {
  updateShipmentTracking,
  OrderNotShippedError,
  ShipmentTrackingNotFoundError,
  IShipManagedShipmentError,
} from "../order.service";

function baseOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "order-1",
    status: "SHIPPED",
    shipmentTracking: { id: "st-1", orderId: "order-1", provider: "kerry", trackingNo: "OLD123" },
    shipments: [],
    ...overrides,
  };
}

describe("updateShipmentTracking", () => {
  beforeEach(() => vi.clearAllMocks());

  it("แก้เลขพัสดุสำเร็จเมื่อ status=SHIPPED และมี shipmentTracking แบบ MANUAL", async () => {
    (prisma.order.findFirst as any).mockResolvedValue(baseOrder());
    (prisma.shipmentTracking.update as any).mockResolvedValue({
      id: "st-1",
      provider: "flash",
      trackingNo: "NEW999",
    });

    const result = await updateShipmentTracking("token-1", { provider: "flash", trackingNo: "NEW999" });

    expect(result).toMatchObject({ provider: "flash", trackingNo: "NEW999" });
    expect(prisma.shipmentTracking.update).toHaveBeenCalledWith({
      where: { orderId: "order-1" },
      data: { provider: "flash", trackingNo: "NEW999" },
    });
  });

  it("throw Order not found เมื่อไม่พบ order", async () => {
    (prisma.order.findFirst as any).mockResolvedValue(null);
    await expect(
      updateShipmentTracking("missing-token", { provider: "flash", trackingNo: "X" }),
    ).rejects.toThrow("Order not found");
    expect(prisma.shipmentTracking.update).not.toHaveBeenCalled();
  });

  it("throw OrderNotShippedError เมื่อ status ไม่ใช่ SHIPPED (เช่น PENDING/CONFIRMED)", async () => {
    (prisma.order.findFirst as any).mockResolvedValue(baseOrder({ status: "CONFIRMED" }));
    await expect(
      updateShipmentTracking("token-1", { provider: "flash", trackingNo: "X" }),
    ).rejects.toThrow(OrderNotShippedError);
    expect(prisma.shipmentTracking.update).not.toHaveBeenCalled();
  });

  it("throw ShipmentTrackingNotFoundError เมื่อไม่มีแถว shipmentTracking (MANUAL) เลย", async () => {
    (prisma.order.findFirst as any).mockResolvedValue(baseOrder({ shipmentTracking: null }));
    await expect(
      updateShipmentTracking("token-1", { provider: "flash", trackingNo: "X" }),
    ).rejects.toThrow(ShipmentTrackingNotFoundError);
    expect(prisma.shipmentTracking.update).not.toHaveBeenCalled();
  });

  it("throw IShipManagedShipmentError เมื่อมี OrderShipment (iShip) ที่ยัง active อยู่", async () => {
    (prisma.order.findFirst as any).mockResolvedValue(
      baseOrder({ shipments: [{ id: "os-1" }] }),
    );
    await expect(
      updateShipmentTracking("token-1", { provider: "flash", trackingNo: "X" }),
    ).rejects.toThrow(IShipManagedShipmentError);
    expect(prisma.shipmentTracking.update).not.toHaveBeenCalled();
  });
});
