import { beforeAll, describe, expect, it } from "vitest";
import { decryptToken, encryptToken } from "@/lib/token-crypto";
import { decodeCredential, encodeCredential, hashWebhookSecret, maskMerchantId, newWebhookSecret } from "../credential";

beforeAll(() => {
  process.env.CHANNEL_TOKEN_KEY ||= "00".repeat(32); // key เทสเท่านั้น
});

describe("credential envelope", () => {
  it("round-trip และ plaintext เป็น envelope v1", () => {
    const enc = encodeCredential({ secretKey: "K1", webhookSecret: "W1" });
    expect(enc).not.toContain("K1");
    expect(JSON.parse(decryptToken(enc))).toEqual({ v: 1, k: "K1", w: "W1" });
    expect(decodeCredential(enc)).toEqual({ secretKey: "K1", webhookSecret: "W1" });
  });
  it("envelope ผิดรูป/เวอร์ชันอื่น -> throw", () => {
    for (const bad of ['{"v":2,"k":"a","w":"b"}', '{"v":1,"k":"","w":"b"}', '{"v":1,"k":"a"}']) {
      expect(() => decodeCredential(encryptToken(bad))).toThrow("FLASH_CREDENTIAL_MALFORMED");
    }
    expect(() => decodeCredential("junk")).toThrow();
  });
});

describe("mask / webhook secret", () => {
  it("maskMerchantId ไม่เผยเกินท้าย 3 ตัว", () => {
    expect(maskMerchantId("AB1234567")).toBe("••••••567");
    expect(maskMerchantId("M1")).toBe("••");
    expect(maskMerchantId("ABCDE")).toBe("•••••");
  });
  it("newWebhookSecret >=128 บิต url-safe ไม่ซ้ำ; hash = sha256 hex", () => {
    const w = newWebhookSecret();
    expect(w).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(newWebhookSecret()).not.toBe(w);
    // sha256("abc") จาก openssl
    expect(hashWebhookSecret("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
