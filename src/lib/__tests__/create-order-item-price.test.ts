// [blocker] ราคารายการในออเดอร์ต้องรับ ฿0 ได้ — ร้านคิวงาน (SERVICE_QUEUE) รับจองไว้ก่อน
// โดยยังไม่เก็บเงิน/ไม่เก็บมัดจำ (user 2026-08-10). เดิมเป็น minValue(0.01) → บันทึกไม่ได้เลย
//
// เทสนี้ผูกไว้ที่ Valibot ซึ่งเป็น **ด่านจริง** (ฟอร์มเป็นแค่ UX surface — ยิง API ตรงก็ต้องผ่าน
// กฎเดียวกัน) และครอบทั้งสองทิศ: 0 ต้องผ่าน / ติดลบต้องไม่ผ่าน. ถ้าใครกลับไปเป็น 0.01
// เทสข้อแรกจะแดงทันที (พิสูจน์ด้วย mutation แล้ว)
import { describe, it, expect } from "vitest";
import * as v from "valibot";
import { CreateOrderSchema } from "../validations";

const base = {
  type: "SERVICE",
  buyerContact: "0812345678",
  buyerName: "ลูกค้าทดสอบ",
};

const withPrice = (price: number) => ({
  ...base,
  items: [{ name: "จองคิว", qty: 1, price }],
});

describe("CreateOrderSchema — ราคารายการ", () => {
  it("รับราคา ฿0 (จองไว้ก่อน ยังไม่เก็บเงิน)", () => {
    const parsed = v.safeParse(CreateOrderSchema, withPrice(0));
    expect(parsed.success).toBe(true);
  });

  it("ยังรับราคาปกติ", () => {
    expect(v.safeParse(CreateOrderSchema, withPrice(350)).success).toBe(true);
  });

  it("ปฏิเสธราคาติดลบ", () => {
    const parsed = v.safeParse(CreateOrderSchema, withPrice(-1));
    expect(parsed.success).toBe(false);
  });
});
