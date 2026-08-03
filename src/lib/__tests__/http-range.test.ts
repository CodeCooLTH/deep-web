import { describe, it, expect } from "vitest";
import {
  parseRangeHeader,
  contentRangeHeader,
  MAX_RANGE_CHUNK,
} from "../http-range";

const SIZE = 1000;

describe("parseRangeHeader", () => {
  it("ไม่มี header → none (ตอบ 200 ทั้งไฟล์ตามเดิม)", () => {
    expect(parseRangeHeader(null, SIZE)).toEqual({ kind: "none" });
    expect(parseRangeHeader(undefined, SIZE)).toEqual({ kind: "none" });
    expect(parseRangeHeader("", SIZE)).toEqual({ kind: "none" });
  });

  it("unit ที่ไม่ใช่ bytes → none", () => {
    expect(parseRangeHeader("items=0-10", SIZE)).toEqual({ kind: "none" });
  });

  // เคสจริงที่ทำให้บั๊กนี้เกิด: iOS ยิง probe นี้ก่อนเล่นวิดีโอเสมอ
  it("iOS probe `bytes=0-1` → ok 2 ไบต์แรก", () => {
    expect(parseRangeHeader("bytes=0-1", SIZE)).toEqual({
      kind: "ok",
      range: { start: 0, end: 1 },
    });
  });

  it("ช่วงปิดปกติ", () => {
    expect(parseRangeHeader("bytes=100-199", SIZE)).toEqual({
      kind: "ok",
      range: { start: 100, end: 199 },
    });
  });

  it("ช่วงเปิดท้าย `bytes=500-` → ถึงไบต์สุดท้าย", () => {
    expect(parseRangeHeader("bytes=500-", SIZE)).toEqual({
      kind: "ok",
      range: { start: 500, end: 999 },
    });
  });

  it("suffix `bytes=-100` → 100 ไบต์สุดท้าย", () => {
    expect(parseRangeHeader("bytes=-100", SIZE)).toEqual({
      kind: "ok",
      range: { start: 900, end: 999 },
    });
  });

  it("suffix ใหญ่กว่าไฟล์ → ทั้งไฟล์ (ไม่ติดลบ)", () => {
    expect(parseRangeHeader("bytes=-5000", SIZE)).toEqual({
      kind: "ok",
      range: { start: 0, end: 999 },
    });
  });

  it("end เกินท้ายไฟล์ → clamp ลงมาที่ไบต์สุดท้าย", () => {
    expect(parseRangeHeader("bytes=900-99999", SIZE)).toEqual({
      kind: "ok",
      range: { start: 900, end: 999 },
    });
  });

  it("start เลยท้ายไฟล์ → unsatisfiable (416 ไม่ใช่ 200)", () => {
    expect(parseRangeHeader("bytes=1000-1100", SIZE)).toEqual({
      kind: "unsatisfiable",
    });
    expect(parseRangeHeader("bytes=5000-", SIZE)).toEqual({
      kind: "unsatisfiable",
    });
  });

  it("suffix 0 ไบต์ → unsatisfiable", () => {
    expect(parseRangeHeader("bytes=-0", SIZE)).toEqual({
      kind: "unsatisfiable",
    });
  });

  it("end < start → unsatisfiable", () => {
    expect(parseRangeHeader("bytes=500-100", SIZE)).toEqual({
      kind: "unsatisfiable",
    });
  });

  it("ไฟล์ว่าง → unsatisfiable ทุกช่วง", () => {
    expect(parseRangeHeader("bytes=0-1", 0)).toEqual({ kind: "unsatisfiable" });
  });

  it("multi-range → none (degrade เป็น 200 ทั้งไฟล์)", () => {
    expect(parseRangeHeader("bytes=0-99,200-299", SIZE)).toEqual({
      kind: "none",
    });
  });

  it("รูปแบบพัง → none ไม่ throw", () => {
    expect(parseRangeHeader("bytes=abc-def", SIZE)).toEqual({ kind: "none" });
    expect(parseRangeHeader("bytes=", SIZE)).toEqual({ kind: "none" });
    expect(parseRangeHeader("bytes=100", SIZE)).toEqual({ kind: "none" });
    expect(parseRangeHeader("bytes=-1.5", SIZE)).toEqual({ kind: "none" });
  });

  it("cap ที่ MAX_RANGE_CHUNK เมื่อขอช่วงยาวเกิน", () => {
    const big = 25 * 1024 * 1024;
    const result = parseRangeHeader("bytes=0-", big);
    expect(result).toEqual({
      kind: "ok",
      range: { start: 0, end: MAX_RANGE_CHUNK - 1 },
    });
  });

  it("cap นับจาก start ไม่ใช่จาก 0", () => {
    const big = 25 * 1024 * 1024;
    const result = parseRangeHeader(`bytes=${MAX_RANGE_CHUNK}-`, big);
    expect(result).toEqual({
      kind: "ok",
      range: {
        start: MAX_RANGE_CHUNK,
        end: MAX_RANGE_CHUNK * 2 - 1,
      },
    });
  });
});

describe("contentRangeHeader", () => {
  it("ประกอบตามรูปแบบ RFC", () => {
    expect(contentRangeHeader({ start: 0, end: 1 }, 1000)).toBe(
      "bytes 0-1/1000",
    );
  });
});
