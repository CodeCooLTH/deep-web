// feature 00084 — ลายเซ็น Flash (TFR-FLASH-001): SHA256(ASCII-sorted "k=v&..." + "&key=") → HEX ใหญ่
import { createHash, randomBytes, timingSafeEqual } from "crypto";

// ค่า "ว่าง" ไม่เข้าลายเซ็นแต่ยังส่งใน body ("0" ไม่ใช่ค่าว่าง)
const BLANK = /^[\t\n\v\f\r \u001C-\u001F]*$/;
export const isBlankValue = (v: string): boolean => BLANK.test(v);

export type FlashParams = Record<string, string | number | boolean | null | undefined>;

/** ตัด sign/undefined/null แล้วแปลงเป็น string; NaN/Infinity/object = throw */
function normalize(params: FlashParams): [string, string][] {
  const out: [string, string][] = [];
  for (const [k, v] of Object.entries(params)) {
    if (k === "sign" || v === undefined || v === null) continue;
    if (typeof v === "number" && !Number.isFinite(v)) throw new Error(`FLASH_SIGN_NON_FINITE:${k}`);
    if (typeof v === "object") throw new Error(`FLASH_SIGN_BAD_VALUE:${k}`);
    out.push([k, String(v)]);
  }
  return out;
}

/** สตริงที่ถูก hash — export ไว้ให้เทส/พิสูจน์กับ vector ด้วยเครื่องมืออื่น (มี key ปนอยู่ ห้าม log) */
export function signingString(params: FlashParams, key: string): string {
  const parts = normalize(params)
    .filter(([, v]) => !isBlankValue(v))
    // เทียบ code unit ตรง ๆ — ห้าม localeCompare (case-sensitive ตามสเปก Flash)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`);
  parts.push(`key=${key}`);
  return parts.join("&");
}

export function signParams(params: FlashParams, key: string): string {
  return createHash("sha256").update(signingString(params, key), "utf8").digest("hex").toUpperCase();
}

/** params ต้องมี mchId/nonceStr อยู่แล้ว · คืน body ที่ urlencode แล้ว + sign ต่อท้าย (ค่าว่างยังส่ง) */
export function buildFormBody(params: FlashParams, key: string): string {
  const pairs = normalize(params);
  pairs.push(["sign", signParams(params, key)]);
  return pairs.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
}

export const newNonce = (): string => randomBytes(16).toString("hex");

/** webhook เซ็นเฉพาะ mchId+nonceStr; ความยาวไม่เท่าไม่ throw */
export function verifyWebhookSign(
  p: { mchId: string; nonceStr: string; sign: string },
  key: string,
): boolean {
  if (typeof p.sign !== "string") return false;
  const expected = Buffer.from(signParams({ mchId: p.mchId, nonceStr: p.nonceStr }, key));
  const got = Buffer.from(p.sign.toUpperCase());
  return got.length === expected.length && timingSafeEqual(got, expected);
}
