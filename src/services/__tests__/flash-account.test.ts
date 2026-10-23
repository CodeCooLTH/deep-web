import { describe, expect, it } from "vitest";
import { appendAudit, unpackFlashAccount, type FlashAccountRow } from "../flash-account";
import { encodeCredential } from "@/lib/flash/credential";

process.env.CHANNEL_TOKEN_KEY ??= "0".repeat(64);

const row = (o: Partial<FlashAccountRow>) =>
  ({ status: "ACTIVE", merchantId: "M1", accessTokenEnc: encodeCredential({ secretKey: "K1", webhookSecret: "W1" }), ...o }) as FlashAccountRow;

describe("appendAudit", () => {
  it("เก็บล่าสุด 50 รายการ และไม่พังเมื่อค่าเดิมไม่ใช่ array", () => {
    let log: unknown = { junk: true };
    for (let i = 0; i < 60; i++) log = appendAudit(log, { at: String(i), userId: "u", action: "x" });
    const list = log as { at: string }[];
    expect(list).toHaveLength(50);
    expect(list[0].at).toBe("10");
    expect(list[49].at).toBe("59");
  });
});

describe("unpackFlashAccount", () => {
  it("ถอด envelope เป็น cred + webhookSecret", () => {
    expect(unpackFlashAccount(row({}))).toMatchObject({ cred: { mchId: "M1", secretKey: "K1" }, webhookSecret: "W1" });
  });
  it.each([
    ["ไม่มีแถว", null],
    ["DISCONNECTED", row({ status: "DISCONNECTED" })],
    ["ไม่มี mchId", row({ merchantId: null })],
    ["envelope ว่าง", row({ accessTokenEnc: "" })],
  ])("%s → null", (_, r) => {
    expect(unpackFlashAccount(r as FlashAccountRow | null)).toBeNull();
  });
  it("TOKEN_INVALID ยังถอดได้ (ใช้ verify/ถอน/รับ webhook ต่อ)", () => {
    expect(unpackFlashAccount(row({ status: "TOKEN_INVALID" }))).not.toBeNull();
  });
});
