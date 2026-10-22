// feature 00084 — ประตูปล่อย (BR-FLASH-63) และโหมดทดสอบ (TFR-FLASH-022)

/**
 * พลิกเป็น true ได้เฉพาะคอมมิตที่เพิ่ม __tests__/training-vectors.json จริง
 * (gate.test.ts บังคับ: true ⇒ ไฟล์ต้องมี ≥6 vector และ signParams ผ่านทุกอัน)
 */
export const TRAINING_VECTOR_VERIFIED = false;

export function isFlashDirectEnabled(): boolean {
  return (
    process.env.FLASH_DIRECT_ENABLED === "1" &&
    (TRAINING_VECTOR_VERIFIED || process.env.NODE_ENV !== "production")
  );
}

/** production ไม่มีทางเข้าโหมดนี้ แม้ตั้ง env ผิด */
export const isFlashDryRun = (): boolean =>
  process.env.FLASH_DRY_RUN === "1" && process.env.NODE_ENV !== "production";

const trimSlash = (s: string) => s.trim().replace(/\/+$/, "");

/** ฝั่งเซิร์ฟเวอร์เท่านั้น ห้ามรับจากผู้ใช้ (BR-FLASH-18); training = https://open-api-tra.flashexpress.com */
export const flashBaseUrl = (): string =>
  trimSlash(process.env.FLASH_API_BASE_URL || "") || "https://open-api.flashexpress.com";

export const flashWebhookBase = (): string =>
  trimSlash(process.env.FLASH_WEBHOOK_BASE_URL || process.env.NEXTAUTH_URL || "");
