import { describe, expect, it } from "vitest";
import { FlashUnitError, bahtToSatang, gramToKg, kgToGram, parseSatangStrict, satangToBaht } from "../units";

describe("bahtToSatang", () => {
  it.each([[0, 0], [1, 100], [99.5, 9950], [0.1 + 0.2, 30], ["12.34", 1234], ["5", 500], [10_000_000, 1_000_000_000]])(
    "%s -> %s",
    (i, o) => expect(bahtToSatang(i)).toBe(o),
  );
  it("รับ Decimal-like (toString)", () => expect(bahtToSatang({ toString: () => "250.50" })).toBe(25050));
  it.each([1.005, "1.234", -1, NaN, Infinity, "abc", "", "1e3", 1e21, "-0.5"])("ปฏิเสธ %s", (x) =>
    expect(() => bahtToSatang(x)).toThrow(FlashUnitError),
  );
  it("round-trip ทุกสตางค์ในช่วงตัวอย่าง", () => {
    for (let s = 0; s <= 100_000; s += 7) expect(bahtToSatang(satangToBaht(s))).toBe(s);
    for (const s of [999_999_999, 1_000_000_000]) expect(bahtToSatang(satangToBaht(s))).toBe(s);
  });
});

describe("satangToBaht / parseSatangStrict", () => {
  it("รับเฉพาะจำนวนเต็มไม่ติดลบ", () => {
    expect(satangToBaht("12345")).toBe(123.45);
    expect(satangToBaht(0)).toBe(0);
    for (const x of ["12.5", "-1", -1, 1.5, "", "1e3", null, " 1"]) expect(() => satangToBaht(x)).toThrow(FlashUnitError);
    expect(parseSatangStrict("12.5")).toBeNull();
    expect(parseSatangStrict("007")).toBe(7);
  });
});

describe("kgToGram / gramToKg", () => {
  it("แปลงและปฏิเสธเกิน 2 ทศนิยม", () => {
    expect(kgToGram(1.5)).toBe(1500);
    expect(kgToGram("0.01")).toBe(10);
    expect(kgToGram(0.1 + 0.2)).toBe(300);
    expect(() => kgToGram(1.234)).toThrow(FlashUnitError);
    expect(() => kgToGram(-1)).toThrow(FlashUnitError);
  });
  it("gramToKg ปัดครึ่งขึ้น", () => {
    expect(gramToKg(1500)).toBe(1.5);
    expect(gramToKg("1234")).toBe(1.23);
    expect(gramToKg(1235)).toBe(1.24);
    expect(gramToKg(4)).toBe(0);
    expect(gramToKg(5)).toBe(0.01);
    expect(() => gramToKg("1.5")).toThrow(FlashUnitError);
  });
});
