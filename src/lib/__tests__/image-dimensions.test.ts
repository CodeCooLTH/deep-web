import { describe, expect, it } from "vitest";
import { imageBoxAttrs, normalizeImageSize } from "../image-dimensions";

describe("normalizeImageSize [blocker]", () => {
  it("รูปปกติคืนตามเดิม", () => {
    expect(normalizeImageSize({ width: 800, height: 600 })).toEqual({ width: 800, height: 600 });
  });
  // mutation: ถอดการสลับ orientation → เคสนี้ต้องแดง (w≠h เพื่อให้สลับแล้วต่าง)
  it("orientation 5–8 สลับกว้าง/สูง", () => {
    for (const o of [5, 6, 7, 8]) {
      expect(normalizeImageSize({ width: 800, height: 600, orientation: o })).toEqual({ width: 600, height: 800 });
    }
  });
  // ขอบ: 4 ยังไม่สลับ (เป็น flip แนวตั้ง) · 5 สลับ · 1 = ปกติ
  it("ขอบ orientation 4 ไม่สลับ, 5 สลับ", () => {
    expect(normalizeImageSize({ width: 800, height: 600, orientation: 4 })).toEqual({ width: 800, height: 600 });
    expect(normalizeImageSize({ width: 800, height: 600, orientation: 5 })).toEqual({ width: 600, height: 800 });
    expect(normalizeImageSize({ width: 800, height: 600, orientation: 1 })).toEqual({ width: 800, height: 600 });
  });
  // mutation: ถอด pageHeight → height รวมทุกเฟรม (1800) ต้องแดง
  it("GIF เคลื่อนไหวใช้ pageHeight", () => {
    expect(normalizeImageSize({ width: 300, height: 1800, pageHeight: 600 })).toEqual({ width: 300, height: 600 });
  });
  it("pageHeight + orientation ใช้ร่วมกันได้", () => {
    expect(normalizeImageSize({ width: 300, height: 1800, pageHeight: 600, orientation: 6 })).toEqual({ width: 600, height: 300 });
  });
  it("ไม่ clamp สัดส่วน (รูปยาวมาก)", () => {
    expect(normalizeImageSize({ width: 100, height: 10000 })).toEqual({ width: 100, height: 10000 });
  });
  it("ค่าผิดปกติ = null", () => {
    const bad: Array<Parameters<typeof normalizeImageSize>[0]> = [
      {},
      { width: 800 },
      { height: 600 },
      { width: 0, height: 600 },
      { width: 800, height: -1 },
      { width: NaN, height: 600 },
      { width: 800, height: Infinity },
      { width: 800.5, height: 600 },
      { width: 20001, height: 600 }, // เกินเพดาน
      { width: 800, height: 1800, pageHeight: 0 }, // pageHeight เสียห้ามถอยไปใช้ height รวม
    ];
    for (const m of bad) expect(normalizeImageSize(m)).toBeNull();
    // ขอบเพดาน: 20000 ยังผ่าน
    expect(normalizeImageSize({ width: 20000, height: 20000 })).toEqual({ width: 20000, height: 20000 });
  });
});

describe("imageBoxAttrs", () => {
  it("null → {}", () => expect(imageBoxAttrs(null)).toEqual({}));
  it("size → width/height", () => expect(imageBoxAttrs({ width: 1, height: 2 })).toEqual({ width: 1, height: 2 }));
});
