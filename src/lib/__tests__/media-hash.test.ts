/**
 * src/lib/__tests__/media-hash.test.ts — feature 00051 (Chat Media Deduplication), S-2
 *
 * unit ล้วน — ไม่แตะ DB/storage/network (TestCase.md §2.1)
 */
import { describe, it, expect } from "vitest";
import { sha256Hex } from "@/lib/media-hash";

describe("sha256Hex", () => {
  // TC-HASH-01: deterministic — hash เนื้อหาเดียวกันต้องเท่ากันเสมอ
  it("TC-HASH-01: คืนค่าเท่ากันทุกครั้งสำหรับ buffer เดียวกัน และยาว 64 hex chars", () => {
    const buf = Buffer.from("สวัสดีชาวโลก — เนื้อหาไฟล์ทดสอบ".repeat(10), "utf8");
    const h1 = sha256Hex(buf);
    const h2 = sha256Hex(buf);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  // TC-HASH-02 (mandatory #4, blocker): 1 ไบต์ต่าง = hash คนละค่าเสมอ
  it("TC-HASH-02 (blocker): 1 ไบต์ต่างกลางไฟล์ทำให้ hash ต่างกันเสมอ", () => {
    const bufferA = Buffer.alloc(1000);
    for (let i = 0; i < bufferA.length; i++) bufferA[i] = i % 256;
    const bufferB = Buffer.from(bufferA);
    // แก้ไบต์กลางไฟล์ (ไม่ใช่ header/trailer) — กันเคสที่บังเอิญ hash คำนวณข้ามไบต์นั้น
    const mid = Math.floor(bufferB.length / 2);
    bufferB[mid] = (bufferB[mid]! + 1) % 256;

    const hashA = sha256Hex(bufferA);
    const hashB = sha256Hex(bufferB);
    expect(hashA).not.toBe(hashB);
  });

  // TC-HASH-03: buffer ว่างเปล่า (edge) — ไม่ throw, ตรงกับ sha256 มาตรฐานของ empty buffer
  it("TC-HASH-03: buffer ว่างเปล่าไม่ throw และตรงกับค่า sha256 มาตรฐาน", () => {
    const h = sha256Hex(Buffer.alloc(0));
    expect(h).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("ยอมรับ ArrayBuffer ได้เหมือน Buffer (signature ของ TFR-CMD-01)", () => {
    const text = "arraybuffer-input-test";
    const ab = new TextEncoder().encode(text).buffer;
    const buf = Buffer.from(text, "utf8");
    expect(sha256Hex(ab)).toBe(sha256Hex(buf));
  });
});
