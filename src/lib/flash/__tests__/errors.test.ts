import { describe, expect, it } from "vitest";
import {
  FlashError, FlashServiceError, classifyFlashRetryUX, flashUserMessage, mapFlashCode, redactFlash,
  type FlashErrorCode,
} from "../errors";

// Appendix A: [รหัสดิบ, code, ux]
const TABLE: [string, FlashErrorCode, string][] = [
  ["1001", "MERCHANT_NOT_FOUND", "connection"], ["1002", "SIGN_INVALID", "connection"],
  ["1003", "DUPLICATE_ORDER", "review"], ["1004", "SENDER_ADDRESS_INVALID", "fix-data"],
  ["1005", "RECEIVER_ADDRESS_INVALID", "fix-data"], ["1006", "PARCEL_NOT_FOUND", "none"],
  ["1007", "INVALID_REQUEST", "fix-data"], ["1008", "COD_NOT_ENABLED", "fix-data"],
  ["1009", "INVALID_REQUEST", "fix-data"], ["1010", "PICKUP_PENDING", "none"],
  ["1011", "PICKUP_NOT_CANCELLABLE", "none"], ["1015", "NOT_CANCELLABLE", "none"],
  ["1018", "INVALID_REQUEST", "fix-data"], ["1019", "NOT_MERCHANT_PARCEL", "none"],
  ["1020", "INVALID_REQUEST", "fix-data"], ["1021", "POSTCODE_INVALID", "fix-data"],
  ["1022", "SENDER_OUT_OF_AREA", "fix-data"], ["0", "UPSTREAM_ERROR", "retry"],
  ["1000", "UPSTREAM_ERROR", "retry"], ["9999", "UNKNOWN_CODE", "retry"],
];

describe("mapFlashCode + ข้อความ + UX ครบ Appendix A", () => {
  it.each(TABLE)("%s -> %s (%s)", (raw, code, ux) => {
    expect(mapFlashCode(raw)).toBe(code);
    expect(mapFlashCode(Number(raw))).toBe(code);
    const e = new FlashError(code, { flashCode: raw });
    expect(e.userMessage).toMatch(/[฀-๿]/);
    expect(classifyFlashRetryUX(code)).toBe(ux);
  });
  it("INVALID_REQUEST แต่ละรหัสดิบได้ข้อความต่างกัน; ไม่ระบุรหัส = ข้อความทั่วไป", () => {
    const msgs = new Set(["1007", "1009", "1018", "1020"].map((c) => flashUserMessage("INVALID_REQUEST", c)));
    expect(msgs.size).toBe(4);
    expect(flashUserMessage("INVALID_REQUEST")).not.toBe([...msgs][0]);
    expect(flashUserMessage("INVALID_REQUEST", { flashCode: 1009 })).toBe(flashUserMessage("INVALID_REQUEST", "1009"));
  });
  it("รหัสไม่รู้จัก/ว่าง -> UNKNOWN_CODE และเก็บ flashCode ดิบ", () => {
    expect(mapFlashCode(undefined)).toBe("UNKNOWN_CODE");
    expect(mapFlashCode("")).toBe("UNKNOWN_CODE");
    expect(new FlashError("UNKNOWN_CODE", { flashCode: 4242 }).flashCode).toBe("4242");
  });
  it("ทุก FlashErrorCode มี userMessage และ ux", () => {
    for (const c of new Set(TABLE.map((t) => t[1]).concat("UPSTREAM_TIMEOUT"))) {
      expect(flashUserMessage(c)).toBeTruthy();
      expect(classifyFlashRetryUX(c)).toBeTruthy();
    }
    expect(classifyFlashRetryUX("UPSTREAM_TIMEOUT")).toBe("retry");
  });
});

describe("invalidatesConnection (BR-FLASH-14)", () => {
  it("เฉพาะ 1001/1002", () => {
    const all: FlashErrorCode[] = [...new Set([...TABLE.map((t) => t[1]), "UPSTREAM_TIMEOUT" as const])];
    const hits = all.filter((c) => new FlashError(c).invalidatesConnection).sort();
    expect(hits).toEqual(["MERCHANT_NOT_FOUND", "SIGN_INVALID"]);
  });
  it("retryable เฉพาะ upstream", () => {
    expect(new FlashError("UPSTREAM_TIMEOUT").retryable).toBe(true);
    expect(new FlashError("UPSTREAM_ERROR").retryable).toBe(true);
    expect(new FlashError("DUPLICATE_ORDER").retryable).toBe(false);
  });
});

describe("redactFlash", () => {
  const HEX = "A".repeat(34) + "0123456789".repeat(3);
  it("ตัด key / sign / hex 64", () => {
    expect(HEX).toHaveLength(64);
    const out = redactFlash(`mchId=M1&sign=${HEX}&key=SECRET9 {"sign":"${HEX}","secretKey":"S3CR3T"} raw ${HEX}`);
    for (const leak of ["SECRET9", "S3CR3T", HEX]) expect(out).not.toContain(leak);
    expect(out).toContain("mchId=M1");
  });
  it("ไม่แตะข้อความปกติ/คำที่ลงท้ายด้วย key", () => {
    expect(redactFlash("ที่อยู่ไม่ถูกต้อง monkey=1")).toBe("ที่อยู่ไม่ถูกต้อง monkey=1");
  });
  it("FlashError redact upstreamMessage ตอนสร้าง", () => {
    const e = new FlashError("SIGN_INVALID", { upstreamMessage: `bad key=SECRET9 ${HEX}`, httpStatus: 200 });
    expect(e.upstreamMessage).not.toMatch(/SECRET9|[A-F0-9]{64}/i);
    expect(JSON.stringify(e)).not.toContain("SECRET9");
  });
});

it("FlashServiceError เก็บ code/userMessage/missing", () => {
  const e = new FlashServiceError("INCOMPLETE_DATA", "ข้อมูลไม่ครบ", ["weight"]);
  expect([e.code, e.userMessage, e.missing]).toEqual(["INCOMPLETE_DATA", "ข้อมูลไม่ครบ", ["weight"]]);
});
