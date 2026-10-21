import { describe, it, expect } from "vitest";
import * as v from "valibot";
import {
  ShopTagCreateSchema as C,
  ShopTagPatchSchema as P,
  ShopTagIdSchema,
} from "@/lib/shop-tag-schemas";

const ok = (s: v.GenericSchema, x: unknown) => v.safeParse(s, x).success;

describe("TC-009 name", () => {
  it("ขอบเขต 1..30 หลัง trim", () => {
    expect(ok(C, { name: "" })).toBe(false);
    expect(ok(C, { name: "   " })).toBe(false);
    expect(ok(C, { name: "a" })).toBe(true);
    expect(ok(C, { name: "a".repeat(30) })).toBe(true);
    expect(ok(C, { name: "a".repeat(31) })).toBe(false);
    expect(ok(C, { name: "  " + "a".repeat(30) + "  " })).toBe(true);
    expect(ok(C, { name: "😀".repeat(30) })).toBe(true);
    expect(ok(C, { name: "😀".repeat(31) })).toBe(false);
  });
});

describe("TC-010 keywords", () => {
  const kw = (keywords: string[]) => ok(C, { name: "x", keywords });
  it("จำนวน/ความยาว", () => {
    expect(kw(Array.from({ length: 10 }, (_, i) => `คำ${i}`))).toBe(true);
    expect(kw(Array.from({ length: 11 }, (_, i) => `คำ${i}`))).toBe(false);
    expect(kw(["a"])).toBe(false);
    expect(kw(["ab"])).toBe(true);
    expect(kw(["a".repeat(50)])).toBe(true);
    expect(kw(["a".repeat(51)])).toBe(false);
  });
  it("ZWSP ล้วนตก · นับก่อน dedupe · dedupe หลังผ่าน", () => {
    expect(kw(["​​"])).toBe(false);
    expect(kw(Array.from({ length: 11 }, () => "vip"))).toBe(false);
    const r = v.parse(C, { name: " x ", keywords: ["VIP", " vip ", "ab  cd"] });
    expect(r).toEqual({ name: "x", keywords: ["VIP", "ab cd"], removeOnOrderCreate: false });
  });
});

describe("TC-011 strictObject / PATCH / tagId", () => {
  it("คีย์เกินตก", () => {
    expect(ok(C, { name: "x", shopId: "s" })).toBe(false);
    expect(ok(C, { name: "x", foo: 1 })).toBe(false);
    expect(ok(P, { removeOnOrderCreate: true, shopId: "s" })).toBe(false);
  });
  it("PATCH ต้องมี ≥1 คีย์", () => {
    expect(ok(P, {})).toBe(false);
    expect(ok(P, { removeOnOrderCreate: true })).toBe(true);
    expect(ok(P, { removeOnOrderCreate: false })).toBe(true);
    expect(ok(P, { keywords: [] })).toBe(true);
  });
  it("tagId uuid", () => {
    expect(ok(ShopTagIdSchema, "nope")).toBe(false);
    expect(ok(ShopTagIdSchema, "3f2b8c1e-9d4a-4b6e-8f1a-2c3d4e5f6a7b")).toBe(true);
  });
});
