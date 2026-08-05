// ส่วนขยาย feature 00022 — unit test ของการรวมผลเทียบราคาหลายขนส่ง (ปุ่มเทียบราคา)
//
// จุดที่ห้ามพลาด: ตัวที่ reject/ราคาไม่ใช่เลข ต้องเข้า failed[] พร้อมชื่อ — ไม่หายเงียบ
// และห้ามล้มทั้งชุดเพราะขนส่งเจ้าเดียวไม่ตอบ

import { describe, expect, it } from "vitest";
import { assembleCompareResult } from "./compare";
import type { IShipPrice } from "./client";

const price = (over: Partial<IShipPrice>): IShipPrice => ({
  courier_code: "X",
  weight: 1000,
  weight_unit: "g",
  remote_area: "0",
  price: 10,
  total_price: 10,
  ...over,
});
const ok = (v: IShipPrice) =>
  ({ status: "fulfilled", value: v }) as PromiseSettledResult<IShipPrice>;
const bad = (m: string) =>
  ({ status: "rejected", reason: new Error(m) }) as PromiseSettledResult<IShipPrice>;

const couriers = [
  { code: "A", name: "Flash Thunder" },
  { code: "B", name: "SPX Express" },
  { code: "C", name: "KEX Express" },
];

describe("assembleCompareResult", () => {
  it("เรียงราคารวมถูก→แพง และตัวที่ reject เข้า failed พร้อมชื่อ", () => {
    const r = assembleCompareResult(couriers, [
      ok(price({ total_price: 89 })),
      bad("timeout"),
      ok(price({ total_price: 71 })),
    ]);
    expect(r.rows.map((x) => x.courierCode)).toEqual(["C", "A"]);
    expect(r.failed).toEqual([{ courierCode: "B", courierName: "SPX Express" }]);
  });

  it("ราคาเท่ากันคงลำดับตามรายการขนส่งเดิม (stable sort)", () => {
    const r = assembleCompareResult(couriers, [
      ok(price({ total_price: 50 })),
      ok(price({ total_price: 50 })),
      ok(price({ total_price: 40 })),
    ]);
    expect(r.rows.map((x) => x.courierCode)).toEqual(["C", "A", "B"]);
  });

  it("total_price ไม่ใช่เลข = ถือว่า fail ไม่ใช่การ์ดราคา 0", () => {
    const r = assembleCompareResult(couriers.slice(0, 1), [
      ok(price({ total_price: Number.NaN })),
    ]);
    expect(r.rows).toEqual([]);
    expect(r.failed).toEqual([{ courierCode: "A", courierName: "Flash Thunder" }]);
  });

  it("field ประกอบราคา: ไม่ส่ง/ศูนย์ → null (ช่องแสดง '—'), ส่งมา → ตัวเลข", () => {
    const r = assembleCompareResult(couriers.slice(0, 2), [
      ok(
        price({
          total_price: 71,
          price: 19,
          fuel_surcharge_fee: 2,
          remote_area: "50",
          estimate_shipping_date: "3",
        }),
      ),
      ok(price({ total_price: 30, price: 30, remote_area: 0 })),
    ]);
    const flash = r.rows.find((x) => x.courierCode === "A")!;
    expect(flash).toMatchObject({
      basePrice: 19,
      fuelFee: 2,
      remoteFee: 50,
      estimateDays: 3,
    });
    const spx = r.rows.find((x) => x.courierCode === "B")!;
    expect(spx).toMatchObject({
      basePrice: 30,
      fuelFee: null,
      remoteFee: null,
      estimateDays: null,
    });
  });

  it("รายการขนส่งว่าง = ผลว่างทั้งคู่ ไม่ throw", () => {
    expect(assembleCompareResult([], [])).toEqual({ rows: [], failed: [] });
  });
});
