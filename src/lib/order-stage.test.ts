// ป้ายขั้นตอนออเดอร์ในแถวรายการแชท — เน้นกติกาที่เคยพลาดมาแล้วจริง
//
// เคสที่ต้องกันไม่ให้กลับมา:
//   1. Order.status ทับสถานะขนส่ง → ออเดอร์ที่เพิ่งสร้างขึ้นป้าย "จัดส่งสำเร็จ" (2026-07-29)
//   2. พัสดุมีปัญหาถูกกลืนเป็น "สร้างพัสดุแล้ว" → ร้านมองไม่เห็นของที่ต้องรีบจัดการ (2026-07-31)

import { describe, expect, it } from "vitest";
import {
  deriveOrderStage,
  deriveShippingStage,
  resolveOrderStatusBadge,
  SHIPPING_STAGE_LABEL,
  orderStageChipLabel,
  shouldPromptCloseReturnedOrder,
} from "./order-stage";

const NOW = new Date("2026-07-31T12:00:00Z").getTime();
const base = {
  status: "PENDING",
  statusAt: new Date(NOW),
  labelPrintedAt: null,
  carrierStatus: null,
  hasShipment: true,
  // feature 00062 — fixture ทั้งไฟล์นี้เป็นออเดอร์ที่ส่งของจริง (เคสนัดรับมี describe แยกท้ายไฟล์)
  fulfillmentMode: "SHIPPED",
};

describe("deriveOrderStage — พัสดุมีปัญหาต้องเด่นกว่าทุกขั้น", () => {
  // 🛑 ไม่มี "return" ในรายชื่อแล้ว (2026-08-24) — สายตีกลับไม่ขึ้นชิปในแถวแชทอีกต่อไป
  // เพราะชิปพฤติกรรม "ตีกลับ N รายการ" พูดเรื่องเดียวกันอยู่แล้ว ดูเทส [blocker] ด้านล่าง
  const problems = ["issue", "cannot_pickup", "is_expired", "cod_refund"];

  for (const code of problems) {
    it(`${code} → ป้ายพัสดุมีปัญหา ไม่ใช่ "สร้างพัสดุแล้ว"`, () => {
      const r = deriveOrderStage({ ...base, carrierStatus: code }, NOW);
      expect(r?.key).toBe("PARCEL_PROBLEM");
      expect(r?.cls).toContain("danger");
    });
  }

  it("ปัญหาชนะแม้ร้านกดแจ้งจัดส่งไปแล้ว — ของติดปัญหาอยู่ ไม่ใช่กำลังส่ง", () => {
    const r = deriveOrderStage(
      { ...base, status: "SHIPPED", carrierStatus: "cannot_pickup" },
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
const shipped = { status: "SHIPPED", hasShipment: true, fulfillmentMode: "SHIPPED" };

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
        fulfillmentMode: "SHIPPED",
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

  /**
   * แยกกอง 2026-08-24 — user เจอบน prod ว่าใบที่ iShip บอก "ส่งคืนสำเร็จ" ไปแล้ว ยังค้างอยู่ใน
   * ไทล์/ชิป "พัสดุมีปัญหา" ทั้งที่เรื่องกับขนส่งจบแล้ว เหลือแต่ร้านตัดสินใจ (คืนเงิน/ส่งใหม่)
   *
   * เคส COD สำคัญเป็นพิเศษ: `return_success` เป็น terminal ⇒ ถ้าด่านตีกลับหลุดไปอยู่ใต้สาขา
   * terminal มันจะกลายเป็น AWAITING_COD "รอเงิน COD" = ชวนร้านไปตามเก็บเงินจากของที่ไม่เคยส่งถึง
   */
  it("ตีกลับทั้งสองสถานะ → RETURNED (ไม่ใช่ PROBLEM และไม่ใช่ AWAITING_COD/DONE)", () => {
    expect(
      deriveShippingStage({ ...shipped, carrierStatus: "return_success", paymentMethod: "COD" }),
    ).toBe("RETURNED");
    expect(
      deriveShippingStage({ ...shipped, carrierStatus: "return", paymentMethod: "TRANSFER" }),
    ).toBe("RETURNED");
  });

  it("ยกเลิกทั้งใบ → DONE เสมอ ไม่ว่าพัสดุอยู่สถานะไหน", () => {
    expect(
      deriveShippingStage({ status: "CANCELLED", carrierStatus: "delivered", hasShipment: true, paymentMethod: "COD", fulfillmentMode: "SHIPPED" }),
    ).toBe("DONE");
  });

  it("พัสดุมีปัญหาต้องชนะทุกอย่าง", () => {
    expect(deriveShippingStage({ ...shipped, carrierStatus: "issue", paymentMethod: "COD" })).toBe("PROBLEM");
  });

  it("กองงานเดิม 3 กองไม่เปลี่ยนพฤติกรรม", () => {
    expect(deriveShippingStage({ status: "PENDING", carrierStatus: null, hasShipment: false, fulfillmentMode: "SHIPPED" })).toBe("AWAITING_PARCEL");
    expect(deriveShippingStage({ status: "PENDING", carrierStatus: null, hasShipment: true, fulfillmentMode: "SHIPPED" })).toBe("AWAITING_PICKUP");
    expect(deriveShippingStage({ status: "PENDING", carrierStatus: "in_transit", hasShipment: true, fulfillmentMode: "SHIPPED" })).toBe("SHIPPING");
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
    fulfillmentMode: "SHIPPED",
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
        fulfillmentMode: "SHIPPED",
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

/**
 * [blocker] "พัสดุมีปัญหา" ต้องนับทุกใบของลูกค้า ไม่ใช่ใบล่าสุดใบเดียว (user report 2026-08-20)
 *
 * อาการที่ user เจอบน prod: หน้า /orders ขึ้น "พัสดุมีปัญหา 10" แต่ชิปในกล่องแชทขึ้น 3
 * สองสาเหตุที่เทสชุดนี้ปักหมุดไว้:
 *   1. ป้าย/ตัวกรองฝั่งแชทอ่านจาก **ใบล่าสุดใบเดียว** ⇒ ใบที่ติดปัญหาแล้วลูกค้าสั่งใบใหม่ทับ
 *      หายไปทั้งจากป้ายและตัวกรอง ทั้งที่ของยังค้างอยู่จริง
 *   2. `return_success` (ตีกลับถึงร้านแล้ว) นับเป็นปัญหาที่ /orders แต่ไม่นับที่แชท
 */
describe('พัสดุมีปัญหา — นับทุกใบ + return_success', () => {
  const shipped = { ...base, status: 'SHIPPED', hasShipment: true }

  /**
   * 🛑 แถวรายการแชท: ตีกลับ = **ไม่ขึ้นชิปสถานะเลย** (user สั่ง 2026-08-24)
   *
   * เพราะแถวเดียวกันมีชิปพฤติกรรม "ตีกลับ N รายการ" (customer-behavior.ts) อยู่แล้ว —
   * เดิมขึ้นทั้งสองอันพร้อมกันโดยพูดถึงพัสดุใบเดียวกัน
   *
   * ต้องเป็น `null` ไม่ใช่ค่าอื่น: `labelPrintedAt` ไม่เคยถูกล้าง ⇒ ถ้าปล่อยให้ตกไปสาขาล่าง
   * ใบที่ตีกลับมาแล้วจะขึ้น "พิมพ์เอกสารแล้ว" ซึ่งผิดยิ่งกว่าป้ายเดิม
   */
  it('[blocker] ตีกลับ → ไม่มีชิปสถานะในแถวแชท แต่ยังเป็นกอง RETURNED ในหน้า /orders', () => {
    for (const code of ['return', 'return_success']) {
      // labelPrintedAt ต้องมีค่า — ไม่ใช่ของประดับ: มันคือ input ที่ทำให้ "ถอดด่านตีกลับออก"
      // แล้วเทสแดงด้วยอาการจริง (ได้ 'LABEL_PRINTED') ถ้าปล่อย null จะได้ 'PARCEL_CREATED'
      // ซึ่งก็ผิดเหมือนกันแต่ไม่ใช่อาการที่คอมเมนต์ข้างบนอ้าง
      // (docs/conventions/mutation-silence-means-weak-corpus.md)
      const o = { ...shipped, labelPrintedAt: new Date(NOW), carrierStatus: code }
      expect(deriveOrderStage(o, NOW)).toBeNull()
      expect(
        deriveShippingStage({
          fulfillmentMode: "SHIPPED",
          status: 'SHIPPED',
          carrierStatus: code,
          hasShipment: true,
          paymentMethod: 'TRANSFER',
        }),
      ).toBe('RETURNED')
    }
  })

  it('[blocker] มีใบเก่าติดปัญหาอยู่ แม้ใบล่าสุดจะปกติ → ป้ายต้องขึ้น "พัสดุมีปัญหา"', () => {
    // ใบล่าสุด = เพิ่งสั่ง ยังไม่มีพัสดุ (เดิมได้ "สั่งซื้อแล้ว" แล้วปัญหาหายไปเงียบ ๆ)
    const s = deriveOrderStage(
      { ...base, hasShipment: false, problemOrderCount: 1 },
      NOW,
    )
    expect(s?.key).toBe('PARCEL_PROBLEM')
    expect(s?.problemCount).toBeUndefined() // ใบเดียวไม่ต้องบอกจำนวน
  })

  it('[blocker] ใบล่าสุดถูกยกเลิก แต่ยังมีใบอื่นค้างปัญหา → ปัญหาชนะ "ยกเลิกแล้ว"', () => {
    expect(
      deriveOrderStage(
        { ...base, status: 'CANCELLED', statusAt: new Date(NOW), problemOrderCount: 2 },
        NOW,
      )?.key,
    ).toBe('PARCEL_PROBLEM')
  })

  it('[blocker] ปิดการขายไปแล้วก็ยังต้องเห็นปัญหา — CONFIRMED ไม่กลบของที่ค้าง', () => {
    expect(
      deriveOrderStage(
        { ...base, status: 'CONFIRMED', hasShipment: false, problemOrderCount: 1 },
        NOW,
      )?.key,
    ).toBe('PARCEL_PROBLEM')
  })

  it('[blocker] 2 ใบขึ้นไป → ติดจำนวนมาให้ป้าย ("พัสดุมีปัญหา ×2")', () => {
    const s = deriveOrderStage({ ...shipped, carrierStatus: 'issue', problemOrderCount: 2 }, NOW)
    expect(s?.problemCount).toBe(2)
    expect(orderStageChipLabel(s!)).toBe('พัสดุมีปัญหา ×2')
  })

  it('[blocker] ผู้เรียกที่ยังไม่ได้นับมาให้ (undefined) ต้องได้พฤติกรรมเดิมทุกประการ', () => {
    // undefined ≠ 0: ห้ามตีความว่า "รู้แล้วว่าไม่มีปัญหา" แล้วไปกลบสถานะของใบล่าสุด
    expect(deriveOrderStage({ ...base, hasShipment: false }, NOW)?.key).toBe('ORDERED')
    expect(deriveOrderStage({ ...shipped, carrierStatus: 'issue' }, NOW)?.key).toBe('PARCEL_PROBLEM')
  })

  it('[blocker] ป้ายที่ไม่ใช่กองปัญหา ห้ามมี ×N ติดมา', () => {
    const s = deriveOrderStage({ ...shipped, carrierStatus: 'in_transit' }, NOW)
    expect(s?.key).toBe('SHIPPING')
    expect(orderStageChipLabel(s!)).toBe('กำลังจัดส่ง')
  })
})

/**
 * feature 00062 — ออเดอร์ที่ไม่มีการจัดส่งเลย (นัดรับ/ดิจิทัล) ต้องไม่ถูกลากเข้ากองพัสดุ
 *
 * ที่มา: BRD §7.3 หนี้ข้อ 1 — `deriveShippingStage()` เดิมไม่เคยอ่าน `fulfillmentMode` เลย
 * ออเดอร์นัดรับที่ยัง PENDING จึงตกไป `AWAITING_PARCEL` ("รอเลขพัสดุ") ทั้งบนไทล์หน้าแรก
 * และตัวกรอง `/orders?stage=` ทั้งที่ไม่มีพัสดุให้รอเลขเลย
 *
 * และที่มาของการ *ไม่* ยืมค่า `'DONE'` มาใช้: Controller review (SDS §11) — `'DONE'` มี badge
 * ของตัวเองคือ "ส่งถึงแล้ว" สีเขียว ⇒ ออเดอร์ที่ลูกค้ายังไม่มารับจะขึ้นว่าส่งถึงแล้ว
 */
describe("[blocker] deriveShippingStage — ออเดอร์ที่ไม่มีการจัดส่ง (feature 00062)", () => {
  const NON_SHIPPED = ["PICKUP", "NO_SHIPPING"];
  const STATUSES = ["PENDING", "SHIPPED", "CONFIRMED", "CANCELLED", "RETURNED"];

  it("ทุกคอมบิเนชันของ status/พัสดุ → NOT_SHIPPING เสมอ (ห้ามหลุดไป AWAITING_PARCEL หรือ DONE)", () => {
    for (const fulfillmentMode of NON_SHIPPED) {
      for (const status of STATUSES) {
        for (const hasShipment of [true, false]) {
          for (const carrierStatus of [null, "in_transit", "delivered", "issue", "return_success"]) {
            const stage = deriveShippingStage({
              status,
              hasShipment,
              carrierStatus,
              paymentMethod: "COD",
              codReceivedAt: null,
              fulfillmentMode,
            });
            expect(stage).toBe("NOT_SHIPPING");
          }
        }
      }
    }
  });

  it("ออเดอร์ที่ส่งของจริงต้องไม่ถูกกระทบ — ยังได้กองเดิมทุกประการ", () => {
    expect(
      deriveShippingStage({ status: "PENDING", hasShipment: false, carrierStatus: null, fulfillmentMode: "SHIPPED" }),
    ).toBe("AWAITING_PARCEL");
    expect(
      deriveShippingStage({ status: "PENDING", hasShipment: true, carrierStatus: null, fulfillmentMode: "SHIPPED" }),
    ).toBe("AWAITING_PICKUP");
  });

  /**
   * 🛑 ด่านนี้คือสิ่งที่กันไม่ให้คนถัดไป "เติมคำให้ครบ" ตามสัญชาตญาณ
   *
   * ถ้ามีคำใน `SHIPPING_STAGE_LABEL` ⇒ `?stage=NOT_SHIPPING` จะกลายเป็นตัวกรองที่ใช้ได้จริง
   * แต่ไม่มีชิปไหนพาไป · ถ้ามีใน `STAGE_BADGE_OVERRIDE` ⇒ ออเดอร์นัดรับได้ป้ายพัสดุปลอม
   */
  it("ต้องไม่มีคำใน SHIPPING_STAGE_LABEL (ไม่งั้นจะกลายเป็นตัวกรองที่ไม่มีชิปพาไป)", () => {
    expect("NOT_SHIPPING" in SHIPPING_STAGE_LABEL).toBe(false);
  });

  it("resolveOrderStatusBadge ต้องตกกลับไปใช้ป้ายของ Order.status ไม่ใช่ป้ายพัสดุ", () => {
    const pickup = resolveOrderStatusBadge("PENDING", "NOT_SHIPPING");
    // ห้ามเป็นป้ายเขียว "ส่งถึงแล้ว" ของกอง DONE — นั่นคือบั๊กที่ Controller review จับได้
    expect(pickup.label).not.toBe("ส่งถึงแล้ว");
    expect(pickup.cls).not.toContain("success");
    // ต้องเท่ากับป้ายของสถานะล้วน ๆ (stage ที่ไม่มี override ให้ผลเดียวกัน)
    expect(pickup).toEqual(resolveOrderStatusBadge("PENDING", "AWAITING_PARCEL"));
  });
});
