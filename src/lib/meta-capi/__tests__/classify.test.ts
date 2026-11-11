import { describe, expect, it } from "vitest";
import { classifySendResult } from "../classify";

const err = (code: number, message = "x") => ({ error: { code, message } });

describe("classifySendResult — ตัดสินผลจาก Meta (BR-CAPI-05/06 · FR-011/012)", () => {
  it("200 + events_received ≥ 1 = OK", () => {
    expect(classifySendResult(200, { events_received: 1 })).toBe("OK");
  });
  it("200 แต่ events_received < 1 หรือไม่มี = FAIL", () => {
    expect(classifySendResult(200, { events_received: 0 })).toBe("FAIL");
    expect(classifySendResult(200, {})).toBe("FAIL");
  });
  it("token เสีย/ไม่มีสิทธิ์ = STOP", () => {
    for (const c of [190, 102, 10, 200, 250, 299]) expect(classifySendResult(400, err(c))).toBe("STOP");
  });
  it("(#100) Missing Permission = STOP ไม่ใช่ param ผิด", () => {
    expect(classifySendResult(400, err(100, "(#100) Missing Permission"))).toBe("STOP");
  });
  it("code 100 อื่น = FAIL (param ผิด ลองใหม่ไม่ช่วย)", () => {
    expect(classifySendResult(400, err(100, "Invalid parameter"))).toBe("FAIL");
  });
  it("รหัสชั่วคราว / 5xx / 429 / ต่อไม่ติด = RETRY", () => {
    for (const c of [1, 2, 4, 17, 32, 341, 613, 80004]) expect(classifySendResult(400, err(c))).toBe("RETRY");
    expect(classifySendResult(503, {})).toBe("RETRY");
    expect(classifySendResult(429, {})).toBe("RETRY");
    expect(classifySendResult(0, null)).toBe("RETRY");
  });
});
