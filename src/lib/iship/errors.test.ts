// feature 00022 — unit test ของ error taxonomy
//
// เทสชุดนี้มีไว้กันหนี้ชนิดที่ระเบิดเงียบ: การผูกตรรกะกับ "โครงประโยค" ของข้อความ
// จากผู้ให้บริการ ซึ่งเขาแก้คำเมื่อไหร่ก็ได้แล้วเราจะแมป error ผิดโดยไม่มีอะไรฟ้อง
// (บทเรียน feedback_spike_must_match_production_path)

import { describe, expect, it } from "vitest";
import { IShipError, classifyUpstream, redactToken } from "./errors";

describe("classifyUpstream — ตัดสินจาก HTTP status ก่อนเสมอ", () => {
  it("401 และ 403 = token ใช้ไม่ได้ ไม่ว่าข้อความจะเขียนว่าอะไร", () => {
    expect(classifyUpstream(401)).toBe("TOKEN_INVALID");
    expect(classifyUpstream(403, "ข้อความอะไรก็ไม่รู้")).toBe("TOKEN_INVALID");
  });

  it("status ที่ไม่มีความหมายชัด ตกไปที่ UPSTREAM_ERROR เมื่อไม่มีคำสำคัญ", () => {
    expect(classifyUpstream(500, "internal server error")).toBe("UPSTREAM_ERROR");
    expect(classifyUpstream(200)).toBe("UPSTREAM_ERROR");
  });
});

describe("classifyUpstream — คำสำคัญ ทน 2 ภาษา", () => {
  it.each([
    ["invalid token", "TOKEN_INVALID"],
    ["Unauthorized access", "TOKEN_INVALID"],
    ["ไม่มีสิทธิเข้าถึง", "TOKEN_INVALID"],
    ["insufficient balance", "INSUFFICIENT_BALANCE"],
    ["ยอดเงินคงเหลือไม่เพียงพอ", "INSUFFICIENT_BALANCE"],
    ["invalid address zipcode", "ADDRESS_INVALID"],
    ["รหัสไปรษณีย์ไม่ถูกต้อง", "ADDRESS_INVALID"],
    ["ตำบลไม่ตรงกับอำเภอ", "ADDRESS_INVALID"],
    ["courier service not available", "COURIER_UNAVAILABLE"],
    ["ขนส่งไม่รองรับพื้นที่นี้", "COURIER_UNAVAILABLE"],
    ["cannot cancel this order", "SHIPMENT_NOT_CANCELLABLE"],
    ["ยกเลิกไม่ได้ เนื่องจากรับพัสดุแล้ว", "SHIPMENT_NOT_CANCELLABLE"],
  ])("แปล %s เป็น %s", (message, expected) => {
    expect(classifyUpstream(400, message)).toBe(expected);
  });

  it("ไม่แคร์ตัวพิมพ์เล็กใหญ่", () => {
    expect(classifyUpstream(400, "INVALID TOKEN")).toBe("TOKEN_INVALID");
  });

  it("ทนข้อความที่คำสำคัญอยู่กลางประโยค — ไม่ผูกกับโครงประโยค", () => {
    expect(
      classifyUpstream(400, "ระบบแจ้งว่า ยอดเงิน ของคุณไม่เพียงพอ กรุณาเติมเงิน"),
    ).toBe("INSUFFICIENT_BALANCE");
  });
});

describe("IShipError — พฤติกรรมที่ระบบพึ่งพา", () => {
  it("มีเฉพาะ TOKEN_INVALID ที่ทำให้ต้องเปลี่ยนสถานะการเชื่อมต่อ", () => {
    expect(new IShipError("TOKEN_INVALID").invalidatesConnection).toBe(true);
    expect(new IShipError("INSUFFICIENT_BALANCE").invalidatesConnection).toBe(false);
    expect(new IShipError("ADDRESS_INVALID").invalidatesConnection).toBe(false);
  });

  it("timeout กับ upstream error กดลองใหม่ได้ ส่วนที่อยู่ผิด/เงินไม่พอ กดไปก็ไม่หาย", () => {
    expect(new IShipError("UPSTREAM_TIMEOUT").retryable).toBe(true);
    expect(new IShipError("UPSTREAM_ERROR").retryable).toBe(true);
    expect(new IShipError("COURIER_UNAVAILABLE").retryable).toBe(true);
    expect(new IShipError("ADDRESS_INVALID").retryable).toBe(false);
    expect(new IShipError("INSUFFICIENT_BALANCE").retryable).toBe(false);
  });

  it("ทุกรหัสมีข้อความไทยที่บอกทั้งสิ่งที่เกิดและสิ่งที่ต้องทำต่อ", () => {
    const codes = [
      "TOKEN_INVALID",
      "INSUFFICIENT_BALANCE",
      "ADDRESS_INVALID",
      "COURIER_UNAVAILABLE",
      "SHIPMENT_NOT_CANCELLABLE",
      "UPSTREAM_TIMEOUT",
      "UPSTREAM_ERROR",
    ] as const;
    for (const code of codes) {
      const msg = new IShipError(code).userMessage;
      expect(msg.length).toBeGreaterThan(10);
      // ต้องไม่ใช่รหัสดิบหลุดออกไปให้ร้านอ่าน
      expect(msg).not.toContain(code);
    }
  });
});

describe("redactToken — token ห้ามหลุดลง log/DB (BR-ISHIP-12)", () => {
  it("ตัด token ที่รู้ค่าออกจากข้อความ", () => {
    const token = "n2vGGmNIuggqbB896zB2ENW3ov6PeORs";
    const text = `request failed with Authorization: Bearer ${token} at step 2`;
    const out = redactToken(text, token);
    expect(out).not.toContain(token);
    expect(out).toContain("[REDACTED]");
  });

  it("ตัด Bearer token ที่ไม่รู้ค่าได้ด้วย — กันกรณี upstream สะท้อน header กลับมา", () => {
    const out = redactToken("Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456");
    expect(out).not.toContain("abcdefghijklmnopqrstuvwxyz123456");
  });

  it("ตัดทุกที่ที่ token โผล่ ไม่ใช่แค่ครั้งแรก", () => {
    const token = "abcdefgh12345678";
    const out = redactToken(`${token} ... ${token}`, token);
    expect(out).not.toContain(token);
  });

  it("ข้อความที่ไม่มี token ต้องไม่ถูกแก้", () => {
    expect(redactToken("ยอดเงินไม่พอ", "abcdefgh12345678")).toBe("ยอดเงินไม่พอ");
  });

  it("token สั้นผิดปกติไม่ทำให้ redact ทำลายข้อความทั้งก้อน", () => {
    // กันเคสขอบ: ถ้ารับ token สั้น ๆ มาแล้วไป split ตรง ๆ ข้อความจะพรุนไปหมด
    expect(redactToken("ยอดเงินไม่พอ", "อ")).toBe("ยอดเงินไม่พอ");
  });
});
