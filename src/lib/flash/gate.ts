// feature 00084 — สวิตช์เปิดฟีเจอร์ + เลือกระบบ Flash (BR-FLASH-18/63) และโหมดทดสอบ (TFR-FLASH-022)

/** URL ฝังในโค้ด — ฝั่งเซิร์ฟเวอร์เท่านั้น ห้ามรับจากผู้ใช้ (BR-FLASH-18) */
const FLASH_URLS = {
  prod: "https://open-api.flashexpress.com",
  uat: "https://open-api-tra.flashexpress.com",
} as const;

export type FlashEnv = keyof typeof FLASH_URLS;

/** OPEN_FLASH_EXPRESS=prod|uat — ไม่ตั้ง/ค่าอื่น = ปิดฟีเจอร์ */
export function flashEnv(): FlashEnv | null {
  const v = (process.env.OPEN_FLASH_EXPRESS || "").trim().toLowerCase();
  return v === "prod" || v === "uat" ? v : null;
}

/** FLASH_PILOT_SHOP_IDS (คั่น comma) — ตั้งไว้ = เปิดเฉพาะร้านในรายชื่อ · ไม่ตั้ง = ทุกร้าน */
export const flashPilotShopIds = (): string[] =>
  (process.env.FLASH_PILOT_SHOP_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);

/** ไม่ส่ง shopId = ถามระดับระบบ (มีรายชื่อนำร่อง ⇒ false เพราะไม่รู้ว่าร้านไหน) */
export function isFlashDirectEnabled(shopId?: string | null): boolean {
  if (!flashEnv()) return false;
  const pilots = flashPilotShopIds();
  return pilots.length === 0 || (!!shopId && pilots.includes(shopId));
}

/** production ไม่มีทางเข้าโหมดนี้ แม้ตั้ง env ผิด */
export const isFlashDryRun = (): boolean =>
  process.env.FLASH_DRY_RUN === "1" && process.env.NODE_ENV !== "production";

const trimSlash = (s: string) => s.trim().replace(/\/+$/, "");

/** ปิดฟีเจอร์อยู่ก็คืน prod — ทางที่ยังทำงานตอนปิด (ถอน/รับ webhook/poll) ต้องคุยกับระบบเดิมของร้าน */
export const flashBaseUrl = (): string => FLASH_URLS[flashEnv() ?? "prod"];

export const flashWebhookBase = (): string =>
  trimSlash(process.env.FLASH_WEBHOOK_BASE_URL || process.env.NEXTAUTH_URL || "");
