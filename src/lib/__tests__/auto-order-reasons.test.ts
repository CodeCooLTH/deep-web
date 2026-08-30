import { describe, it, expect } from "vitest";
import {
  deriveDraftReasons,
  sortDraftReasons,
  computeItemsTotal,
  type DraftReasonInput,
} from "@/lib/auto-order-reasons";

const NOW = Date.UTC(2026, 7, 30, 5, 0, 0);

/** ครบทุกอย่าง = ต้องไม่มีเหตุผลตกร่างเลย (ตรงกับเทมเพลตมาตรฐานของหน้า A) */
function complete(over: Partial<DraftReasonInput> = {}): DraftReasonInput {
  return {
    phone: "0812345678",
    shipsGoods: true,
    address: { line1: "99/1 ม.3", province: "ชลบุรี", postcode: "20000" },
    items: [
      { rawName: "เสื้อยืดสีดำ", matchedProductId: "p1", qty: 2, price: 250 },
      { rawName: "กางเกงขาสั้น", matchedProductId: "p2", qty: 1, price: 390 },
    ],
    discount: 50,
    statedTotal: 840,
    messageAtMs: NOW,
    nowMs: NOW,
    ...over,
  };
}

describe("computeItemsTotal (HR16 — นิยามยอดรวมต้องตรงกับ createOrder)", () => {
  it("[blocker] ต้องหักส่วนลด — 2×250 + 390 − 50 = 840", () => {
    // 🛑 ถ้าลืมหักส่วนลด (คืน 890) เทมเพลตมาตรฐานของฟีเจอร์เองจะตกร่างทุกครั้ง
    // นิยาม "ยอดรวม" ของทั้งระบบคือ subtotal − discount + vat (order.service.ts:332-334)
    expect(computeItemsTotal({ items: complete().items, discount: 50 })).toBe(840);
  });

  it("ไม่มีส่วนลด = subtotal เปล่า", () => {
    expect(computeItemsTotal({ items: complete().items, discount: null })).toBe(890);
  });
});

describe("deriveDraftReasons — เคสครบ", () => {
  it("[blocker] เทมเพลตมาตรฐานต้องผ่าน ไม่มีเหตุผลตกร่างเลย", () => {
    expect(deriveDraftReasons(complete())).toEqual([]);
  });
});

describe("deriveDraftReasons — 8 เหตุผลเชิงเนื้อหา ยิงแยกทีละข้อ (AC-39)", () => {
  it("NO_PHONE — ไม่มีเบอร์", () => {
    expect(deriveDraftReasons(complete({ phone: null }))).toEqual(["NO_PHONE"]);
    expect(deriveDraftReasons(complete({ phone: "  " }))).toEqual(["NO_PHONE"]);
  });

  it("[blocker] INVALID_PHONE — มีเบอร์แต่ผิดรูป เป็นคนละเหตุผลกับ NO_PHONE", () => {
    // 🛑 ถ้ายุบสองข้อนี้เป็นข้อเดียว ร้านจะไม่รู้ว่าต้อง "เติม" หรือ "แก้"
    expect(deriveDraftReasons(complete({ phone: "021234567" }))).toEqual([
      "INVALID_PHONE",
    ]);
    expect(deriveDraftReasons(complete({ phone: "08123456789" }))).toEqual([
      "INVALID_PHONE",
    ]);
  });

  it("ADDRESS_INCOMPLETE — ขาดส่วนใดส่วนหนึ่งของ 3 ส่วนบังคับ", () => {
    for (const missing of ["line1", "province", "postcode"] as const) {
      const addr = { line1: "99/1", province: "ชลบุรี", postcode: "20000" };
      addr[missing] = "";
      expect(deriveDraftReasons(complete({ address: addr }))).toEqual([
        "ADDRESS_INCOMPLETE",
      ]);
    }
  });

  it("[blocker] ร้านที่ไม่ส่งของ ห้ามถูกบังคับที่อยู่", () => {
    expect(
      deriveDraftReasons(complete({ shipsGoods: false, address: null })),
    ).toEqual([]);
  });

  it("DATE_OUT_OF_WINDOW — ข้อความเก่ากว่าเพดาน 90 วัน", () => {
    const old = NOW - 91 * 24 * 60 * 60 * 1000;
    expect(deriveDraftReasons(complete({ messageAtMs: old }))).toEqual([
      "DATE_OUT_OF_WINDOW",
    ]);
  });

  it("NO_ITEMS — ไม่มีรายการสินค้า", () => {
    expect(
      deriveDraftReasons(complete({ items: [], statedTotal: null })),
    ).toEqual(["NO_ITEMS"]);
  });

  it("ITEM_PRICE_MISSING — มีรายการที่ไม่ได้พิมพ์ราคา", () => {
    const items = complete().items.map((i, n) =>
      n === 0 ? { ...i, price: null } : i,
    );
    expect(deriveDraftReasons(complete({ items }))).toEqual([
      "ITEM_PRICE_MISSING",
    ]);
  });

  it("ITEM_NOT_MATCHED — สินค้าไม่ตรงกับที่มีในร้าน", () => {
    const items = complete().items.map((i, n) =>
      n === 1 ? { ...i, matchedProductId: null } : i,
    );
    expect(deriveDraftReasons(complete({ items }))).toEqual([
      "ITEM_NOT_MATCHED",
    ]);
  });

  it("TOTAL_MISMATCH — ต่างแม้ 1 บาท", () => {
    expect(deriveDraftReasons(complete({ statedTotal: 839 }))).toEqual([
      "TOTAL_MISMATCH",
    ]);
  });

  it("ไม่พิมพ์ยอดรวมเลย = ไม่ใช่ข้อผิดพลาด", () => {
    expect(deriveDraftReasons(complete({ statedTotal: null }))).toEqual([]);
  });
});

describe("deriveDraftReasons — พฤติกรรมรวม", () => {
  it("[blocker] หลายเหตุผลพร้อมกันต้องแสดงครบ ไม่ short-circuit", () => {
    const r = deriveDraftReasons(
      complete({ phone: null, address: null, items: [], statedTotal: null }),
    );
    expect(r).toEqual(["NO_PHONE", "ADDRESS_INCOMPLETE", "NO_ITEMS"]);
    expect(r).toHaveLength(3);
  });

  it("[blocker] ไม่เช็คยอดรวมเมื่อรายการยังไม่ครบ — กัน TOTAL_MISMATCH ปลอม", () => {
    // 🛑 ยอดที่คำนวณจากรายการที่ขาดราคาไม่มีความหมาย
    // เตือนไปก็ซ้ำเติมสิ่งที่ผู้ขายต้องแก้อยู่แล้วโดยไม่ให้ข้อมูลใหม่
    const items = complete().items.map((i, n) =>
      n === 0 ? { ...i, price: null } : i,
    );
    const r = deriveDraftReasons(complete({ items, statedTotal: 99999 }));
    expect(r).toEqual(["ITEM_PRICE_MISSING"]);
    expect(r).not.toContain("TOTAL_MISMATCH");
  });

  it("[blocker] เรียงตามลำดับช่องจริงในฟอร์ม — วันที่อยู่ตำแหน่งที่ 3", () => {
    const r = sortDraftReasons([
      "TOTAL_MISMATCH",
      "NO_ITEMS",
      "DATE_OUT_OF_WINDOW",
      "ADDRESS_INCOMPLETE",
      "NO_PHONE",
    ]);
    expect(r).toEqual([
      "NO_PHONE",
      "ADDRESS_INCOMPLETE",
      "DATE_OUT_OF_WINDOW",
      "NO_ITEMS",
      "TOTAL_MISMATCH",
    ]);
  });

  it("[blocker] deriveDraftReasons ไม่เคยผลิต PROCESSING_FAILED เอง", () => {
    // 🛑 เหตุผลระดับระบบเขียนได้จากที่เดียวคือ watchdog ซึ่งไม่มีช่องรับ reasons
    // ถ้าค่านี้หลุดมาปนได้ DB CHECK จะเป็นด่านแรกที่ผู้ใช้เจอเป็น 500 ดิบ
    const inputs: DraftReasonInput[] = [
      complete(),
      complete({ phone: null }),
      complete({ items: [], statedTotal: null }),
      complete({ messageAtMs: NOW - 999 * 24 * 3600 * 1000 }),
      complete({ address: null }),
    ];
    for (const i of inputs) {
      expect(deriveDraftReasons(i)).not.toContain("PROCESSING_FAILED");
    }
  });
});
