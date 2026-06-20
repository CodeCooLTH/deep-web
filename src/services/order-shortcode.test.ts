import { describe, it, expect } from "vitest";
import { genShortCode } from "../services/order.service";

const CHARSET_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]+$/;

describe("genShortCode", () => {
  it("ยาว 8 ตัวเป็น default", () => {
    expect(genShortCode()).toHaveLength(8);
  });

  it("อยู่ใน charset (ไม่มี 0/O/1/I)", () => {
    for (let i = 0; i < 200; i++) {
      const code = genShortCode();
      expect(code).toMatch(CHARSET_RE);
      expect(code).not.toMatch(/[01OI]/);
    }
  });

  it("รับ len param ได้", () => {
    expect(genShortCode(12)).toHaveLength(12);
  });

  it("ไม่ซ้ำกันบ่อย (เชิงสถิติ) ใน 500 ครั้ง", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) seen.add(genShortCode());
    expect(seen.size).toBe(500); // 40-bit → ชนใน 500 ครั้ง ~0
  });
});
