import { describe, expect, it } from "vitest";
import * as v from "valibot";
import {
  FlashCreateOverrideSchema,
  FlashSettingsSchema,
  IShipCreateShipmentSchema,
  IShipPriceCompareSchema,
  IShipSettingsSchema,
} from "@/lib/validations";
import { buildCheckPricePayload } from "@/lib/iship/mapping";
import { buildCreateOrderParams, buildEstimateParams } from "@/lib/flash/mapping";

// user report 2026-10-23: กล่อง 20.8×42.2×15 บน iShip โดนด่านของเราเองตีกลับ
// "Invalid integer: Received 20.8" — ขนาดต้องรับทศนิยม ≤2 ตำแหน่ง (Decimal(6,2)) ทุกทางเข้า
const box = { weight: 7.01, width: 20.8, length: 42.2, height: 15 };
const receiver = { subdistrict: "เทพารักษ์", district: "เมืองสมุทรปราการ", province: "สมุทรปราการ", postcode: "10270" };

describe("ขนาดกล่องรับทศนิยม ≤2 ตำแหน่ง ทุก schema", () => {
  it("เทียบราคา iShip รับ 20.8 (เคสที่ user เจอ)", () => {
    expect(v.safeParse(IShipPriceCompareSchema, { receiver, ...box }).success).toBe(true);
  });

  it("ทศนิยม 3 ตำแหน่ง / นอกช่วง 1–300 ยังถูกปฏิเสธ", () => {
    for (const width of [20.855, 0.5, 300.01]) {
      expect(v.safeParse(IShipPriceCompareSchema, { receiver, ...box, width }).success).toBe(false);
    }
  });

  it("ค่าตั้งต้นร้าน + สร้างพัสดุ ทั้ง iShip และ Flash รับทศนิยม", () => {
    expect(v.safeParse(IShipSettingsSchema, { defaultWidth: 20.8 }).success).toBe(true);
    expect(v.safeParse(FlashSettingsSchema, { defaultWidth: 20.8 }).success).toBe(true);
    expect(v.safeParse(FlashCreateOverrideSchema, { width: 20.8 }).success).toBe(true);
    const create = v.safeParse(IShipCreateShipmentSchema, { orderToken: "abcd1234", override: { width: 20.8 } });
    expect(create.success ? true : create.issues.map((i) => i.message)).toBe(true);
  });
});

describe("payload iShip ส่งขนาดทศนิยมตามจริง ไม่ปัด", () => {
  it("check-price", () => {
    const sender = { name: "ร้าน", phone: "0812345678", address: "1", subdistrict: "ก", district: "ข", province: "กรุงเทพมหานคร", postcode: "10220" };
    const p = buildCheckPricePayload(sender, receiver, box);
    expect([p.width, p.length, p.height]).toEqual([20.8, 42.2, 15]);
  });
});

describe("payload Flash ปัดขึ้นเป็นจำนวนเต็ม — Flash รับ ซม. จำนวนเต็ม", () => {
  const sender = { name: "ร้าน", phone: "0812345678", address: "1", subdistrict: "ก", district: "ข", province: "เชียงใหม่", postcode: "50000" };
  const flashReceiver = { name: "คุณข", phone: "0898765432", address: { line1: "9", ...receiver } };

  it("create และ estimate ปัดขึ้นทั้งคู่ (ปัดลง = ราคาต่ำกว่าจริง)", () => {
    const c = buildCreateOrderParams({ outTradeNo: "Fabc123A1", sender, receiver: flashReceiver, parcel: { categoryId: 4, ...box } });
    expect([c.width, c.length, c.height]).toEqual([21, 43, 15]);
    const e = buildEstimateParams({ sender, receiver, ...box });
    expect([e.width, e.length, e.height]).toEqual([21, 43, 15]);
  });
});
