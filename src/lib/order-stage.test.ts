// ป้ายขั้นตอนออเดอร์ในแถวรายการแชท — เน้นกติกาที่เคยพลาดมาแล้วจริง
//
// เคสที่ต้องกันไม่ให้กลับมา:
//   1. Order.status ทับสถานะขนส่ง → ออเดอร์ที่เพิ่งสร้างขึ้นป้าย "จัดส่งสำเร็จ" (2026-07-29)
//   2. พัสดุมีปัญหาถูกกลืนเป็น "สร้างพัสดุแล้ว" → ร้านมองไม่เห็นของที่ต้องรีบจัดการ (2026-07-31)

import { describe, expect, it } from "vitest";
import {
  deriveOrderStage,
  deriveShippingStage,
  shouldPromptCloseReturnedOrder,
} from "./order-stage";

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

// ─── กองงานตามสถานะพัสดุ (Command Center + ตัวกรอง /orders) ───────────────
//
// บั๊กจริง 2026-08-04: ร้านผูกพัสดุ iShip ที่ขนส่ง "ส่งถึงแล้ว" เข้ากับออเดอร์ COD ที่ร้านยังไม่ได้
// รับเงิน → ใบนั้นหายไปจากทุกไทล์ทันที เพราะ deriveShippingStage คืน DONE จาก
// carrierStatus='delivered' โดยไม่ดูว่าร้านยังมีงานค้างอยู่ไหม
// (ยืนยันจากฐาน prod: DP2569085F97153B ผู้ซื้อ "มงคล บับภาเอก")
const shipped = { status: "SHIPPED", hasShipment: true };

describe("deriveShippingStage — พัสดุจบเส้นทางแล้ว ไม่ได้แปลว่างานของร้านจบ", () => {
  it("COD ส่งถึงแล้ว แต่ร้านยังไม่กดรับเงิน → รอเงิน COD (ห้ามหายจากทุกไทล์)", () => {
    expect(
      deriveShippingStage({ ...shipped, carrierStatus: "delivered", paymentMethod: "COD" }),
    ).toBe("AWAITING_COD");
  });

  it("COD ส่งถึงแล้ว + ร้านกดรับเงินแล้ว → DONE", () => {
    expect(
      deriveShippingStage({
        ...shipped,
        carrierStatus: "delivered",
        paymentMethod: "COD",
        codReceivedAt: new Date("2026-08-04T10:00:00Z"),
      }),
    ).toBe("DONE");
  });

  it("ผู้ซื้อยืนยันรับของแล้วก็ยังต้องรอเงิน COD ถ้าร้านยังไม่กด (เงินคนละแกนกับสถานะออเดอร์)", () => {
    expect(
      deriveShippingStage({
        status: "CONFIRMED",
        hasShipment: true,
        carrierStatus: "delivered",
        paymentMethod: "เก็บเงินปลายทาง (COD)",
      }),
    ).toBe("AWAITING_COD");
  });

  it("โอนเงินล่วงหน้า + ส่งถึงแล้ว → DONE (ได้เงินแล้ว ของถึงแล้ว ไม่มีงานเหลือ)", () => {
    expect(
      deriveShippingStage({ ...shipped, carrierStatus: "delivered", paymentMethod: "TRANSFER" }),
    ).toBe("DONE");
  });

  it("ของตีกลับถึงร้านแล้ว → พัสดุมีปัญหา (กองเดียวกับ return ที่กำลังตีกลับ)", () => {
    expect(
      deriveShippingStage({ ...shipped, carrierStatus: "return_success", paymentMethod: "COD" }),
    ).toBe("PROBLEM");
  });

  it("ยกเลิกทั้งใบ → DONE เสมอ ไม่ว่าพัสดุอยู่สถานะไหน", () => {
    expect(
      deriveShippingStage({ status: "CANCELLED", carrierStatus: "delivered", hasShipment: true, paymentMethod: "COD" }),
    ).toBe("DONE");
  });

  it("พัสดุมีปัญหาต้องชนะทุกอย่าง", () => {
    expect(deriveShippingStage({ ...shipped, carrierStatus: "issue", paymentMethod: "COD" })).toBe("PROBLEM");
  });

  it("กองงานเดิม 3 กองไม่เปลี่ยนพฤติกรรม", () => {
    expect(deriveShippingStage({ status: "PENDING", carrierStatus: null, hasShipment: false })).toBe("AWAITING_PARCEL");
    expect(deriveShippingStage({ status: "PENDING", carrierStatus: null, hasShipment: true })).toBe("AWAITING_PICKUP");
    expect(deriveShippingStage({ status: "PENDING", carrierStatus: "in_transit", hasShipment: true })).toBe("SHIPPING");
  });
});

// เคสที่ 3 ที่ต้องกันไม่ให้กลับมา: ปลายทางที่ "ไกลกว่า delivered" ถูกลืม
// (user เจอบน prod 2026-08-06 — TH069306110878 ได้เงิน COD แล้วแต่แถบอยู่จุดแรก)
describe("payment_success = ปลายทาง ไม่ใช่ระหว่างทาง", () => {
  const shipped = {
    status: "SHIPPED",
    carrierStatus: "payment_success",
    hasShipment: true,
    paymentMethod: "COD",
  };

  it("ได้เงิน COD แล้ว → DONE ไม่ใช่ AWAITING_PICKUP (ไทม์ไลน์ห้ามถอยกลับจุดแรก)", () => {
    expect(deriveShippingStage({ ...shipped, codReceivedAt: new Date(NOW) })).toBe("DONE");
  });

  it("ขนส่งบอกว่าเงินเข้าแล้ว แต่เรายังไม่ได้บันทึก → AWAITING_COD (ยังต้องตามเรื่องเงิน)", () => {
    expect(deriveShippingStage({ ...shipped, codReceivedAt: null })).toBe("AWAITING_COD");
  });

  it("ป้ายในรายการแชท = จัดส่งสำเร็จ ไม่ใช่ 'สร้างพัสดุแล้ว'", () => {
    const r = deriveOrderStage(
      { ...base, status: "CONFIRMED", carrierStatus: "payment_success" },
      NOW,
    );
    expect(r?.key).toBe("DELIVERED");
  });

  it("close (id 99 ปิดงาน) จบเส้นทางแล้วเช่นกัน — ห้ามค้างเป็น 'รอรับเข้า'", () => {
    expect(
      deriveShippingStage({
        status: "SHIPPED",
        carrierStatus: "close",
        hasShipment: true,
        paymentMethod: "TRANSFER",
      }),
    ).toBe("DONE");
  });
});

/**
 * [blocker] กล่อง "พัสดุถูกตีกลับมาที่ร้าน — ปิดงานได้เลย" ต้องขึ้นเฉพาะใบที่ยังไม่ปิด
 *
 * ที่มา: user report 2026-08-20 (TH068661575518) — ของตีกลับถึงร้านแล้วแต่คำสั่งซื้อค้าง
 * เป็น "จัดส่งแล้ว" ตลอดไปเพราะไม่มีอะไรบอกร้านว่าปิดงานยังไง
 */
describe('shouldPromptCloseReturnedOrder', () => {
  it('[blocker] ของตีกลับ + ใบยังเดินอยู่ → ชวนปิดงาน', () => {
    expect(shouldPromptCloseReturnedOrder({ status: 'SHIPPED', parcelReturned: true })).toBe(true)
    expect(shouldPromptCloseReturnedOrder({ status: 'PENDING', parcelReturned: true })).toBe(true)
  })

  it('[blocker] ใบที่ปิดไปแล้วห้ามชวน — CONFIRMED มีหลักฐานที่แข็งแรงกว่า, CANCELLED จบแล้ว', () => {
    expect(shouldPromptCloseReturnedOrder({ status: 'CONFIRMED', parcelReturned: true })).toBe(false)
    expect(shouldPromptCloseReturnedOrder({ status: 'CANCELLED', parcelReturned: true })).toBe(false)
  })

  it('[blocker] ไม่มีพัสดุตีกลับ = ไม่ชวน ไม่ว่าสถานะไหน', () => {
    for (const status of ['PENDING', 'SHIPPED', 'CONFIRMED', 'CANCELLED']) {
      expect(shouldPromptCloseReturnedOrder({ status, parcelReturned: false })).toBe(false)
    }
  })
})
