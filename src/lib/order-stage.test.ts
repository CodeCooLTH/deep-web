// ป้ายขั้นตอนออเดอร์ในแถวรายการแชท — เน้นกติกาที่เคยพลาดมาแล้วจริง
//
// เคสที่ต้องกันไม่ให้กลับมา:
//   1. Order.status ทับสถานะขนส่ง → ออเดอร์ที่เพิ่งสร้างขึ้นป้าย "จัดส่งสำเร็จ" (2026-07-29)
//   2. พัสดุมีปัญหาถูกกลืนเป็น "สร้างพัสดุแล้ว" → ร้านมองไม่เห็นของที่ต้องรีบจัดการ (2026-07-31)

import { describe, expect, it } from "vitest";
import { deriveOrderStage } from "./order-stage";

const NOW = new Date("2026-07-31T12:00:00Z").getTime();
const base = {
  status: "PENDING",
  statusAt: new Date(NOW),
  labelPrintedAt: null,
  carrierStatus: null,
  hasShipment: true,
};

describe("deriveOrderStage — พัสดุมีปัญหาต้องเด่นกว่าทุกขั้น", () => {
  const problems = ["issue", "cannot_pickup", "return", "is_expired", "cod_refund"];

  for (const code of problems) {
    it(`${code} → ป้ายพัสดุมีปัญหา ไม่ใช่ "สร้างพัสดุแล้ว"`, () => {
      const r = deriveOrderStage({ ...base, carrierStatus: code }, NOW);
      expect(r?.key).toBe("PARCEL_PROBLEM");
      expect(r?.cls).toContain("danger");
    });
  }

  it("ปัญหาชนะแม้ร้านกดแจ้งจัดส่งไปแล้ว — ของตีกลับอยู่ ไม่ใช่กำลังส่ง", () => {
    const r = deriveOrderStage(
      { ...base, status: "SHIPPED", carrierStatus: "return" },
      NOW,
    );
    expect(r?.key).toBe("PARCEL_PROBLEM");
  });

  it("ปัญหาชนะแม้พิมพ์ใบปะหน้าแล้ว", () => {
    const r = deriveOrderStage(
      { ...base, labelPrintedAt: new Date(NOW), carrierStatus: "issue" },
      NOW,
    );
    expect(r?.key).toBe("PARCEL_PROBLEM");
  });

  it("ป้ายปัญหาไม่หมดอายุ — ต่อให้ผ่านไป 30 วันก็ยังต้องเห็น", () => {
    const old = new Date(NOW - 30 * 24 * 60 * 60 * 1000);
    const r = deriveOrderStage(
      { ...base, statusAt: old, carrierStatus: "issue" },
      NOW,
    );
    expect(r?.key).toBe("PARCEL_PROBLEM");
  });

  it("ยกเลิกทั้งออเดอร์ยังชนะปัญหาพัสดุ — งานจบแล้ว ไม่ต้องให้ไปตามของ", () => {
    const r = deriveOrderStage(
      { ...base, status: "CANCELLED", carrierStatus: "issue" },
      NOW,
    );
    expect(r?.key).toBe("CANCELLED");
  });

  it("สถานะปกติไม่โดนเหมาเป็นปัญหา", () => {
    expect(deriveOrderStage({ ...base, carrierStatus: "in_transit" }, NOW)?.key).toBe(
      "SHIPPING",
    );
    expect(deriveOrderStage({ ...base, carrierStatus: "delivered" }, NOW)?.key).toBe(
      "DELIVERED",
    );
    expect(deriveOrderStage({ ...base, carrierStatus: null }, NOW)?.key).toBe(
      "PARCEL_CREATED",
    );
  });
});
