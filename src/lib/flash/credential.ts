// feature 00084 — envelope ความลับของ Flash เก็บใน accessTokenEnc คอลัมน์เดียว (DD-3)
import { createHash, randomBytes } from "crypto";
import { decryptToken, encryptToken } from "@/lib/token-crypto";

export type FlashCredential = { secretKey: string; webhookSecret: string };

export const encodeCredential = (c: FlashCredential): string =>
  encryptToken(JSON.stringify({ v: 1, k: c.secretKey, w: c.webhookSecret }));

export function decodeCredential(enc: string): FlashCredential {
  const o = JSON.parse(decryptToken(enc)) as { v?: unknown; k?: unknown; w?: unknown };
  if (o.v !== 1 || typeof o.k !== "string" || !o.k || typeof o.w !== "string" || !o.w) {
    throw new Error("FLASH_CREDENTIAL_MALFORMED");
  }
  return { secretKey: o.k, webhookSecret: o.w };
}

/** แสดงแค่ท้าย 3 ตัวเมื่อยาวพอ — สั้นกว่านั้นปิดทั้งหมด */
export function maskMerchantId(mchId: string): string {
  return mchId.length <= 5 ? "•".repeat(mchId.length) : "•".repeat(mchId.length - 3) + mchId.slice(-3);
}

export const newWebhookSecret = (): string => randomBytes(24).toString("base64url");

export const hashWebhookSecret = (w: string): string => createHash("sha256").update(w, "utf8").digest("hex");
