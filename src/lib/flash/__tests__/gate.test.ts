import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TRAINING_VECTOR_VERIFIED, flashBaseUrl, flashWebhookBase, isFlashDirectEnabled, isFlashDryRun } from "../gate";
import { signParams } from "../sign";

afterEach(() => vi.unstubAllEnvs());

// [blocker] ธงพลิกเป็น true ได้ก็ต่อเมื่อมีไฟล์ vector จริง ≥6 รายการและผ่านทั้งหมด (BR-FLASH-63)
describe("TRAINING_VECTOR_VERIFIED blocker", () => {
  it("true => training-vectors.json ต้องมี ≥6 vector และ signParams ตรงทุกอัน", () => {
    if (!TRAINING_VECTOR_VERIFIED) return;
    const file = join(__dirname, "training-vectors.json");
    expect(existsSync(file)).toBe(true);
    const vs = JSON.parse(readFileSync(file, "utf8")) as { params: Record<string, string>; key: string; expectedSign: string }[];
    expect(vs.length).toBeGreaterThanOrEqual(6);
    for (const v of vs) expect(signParams(v.params, v.key)).toBe(v.expectedSign);
  });
  it("ยังเป็น false จนกว่าจะมีไฟล์ (V11)", () => {
    if (!existsSync(join(__dirname, "training-vectors.json"))) expect(TRAINING_VECTOR_VERIFIED).toBe(false);
  });
});

describe("isFlashDirectEnabled", () => {
  it("ต้องมี FLASH_DIRECT_ENABLED=1", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(isFlashDirectEnabled()).toBe(false);
    vi.stubEnv("FLASH_DIRECT_ENABLED", "true");
    expect(isFlashDirectEnabled()).toBe(false);
    vi.stubEnv("FLASH_DIRECT_ENABLED", "1");
    expect(isFlashDirectEnabled()).toBe(true);
  });
  it("production ต้องผ่านค่าคงที่ด้วย (ตอนนี้ false => ปิด)", () => {
    vi.stubEnv("FLASH_DIRECT_ENABLED", "1");
    vi.stubEnv("NODE_ENV", "production");
    expect(isFlashDirectEnabled()).toBe(TRAINING_VECTOR_VERIFIED);
  });
});

describe("isFlashDryRun", () => {
  it("production ไม่มีทางเข้า", () => {
    vi.stubEnv("FLASH_DRY_RUN", "1");
    vi.stubEnv("NODE_ENV", "production");
    expect(isFlashDryRun()).toBe(false);
    vi.stubEnv("NODE_ENV", "development");
    expect(isFlashDryRun()).toBe(true);
    vi.stubEnv("FLASH_DRY_RUN", "");
    expect(isFlashDryRun()).toBe(false);
  });
});

describe("base urls", () => {
  it("default = production, ตัด / ท้าย", () => {
    vi.stubEnv("FLASH_API_BASE_URL", "");
    expect(flashBaseUrl()).toBe("https://open-api.flashexpress.com");
    vi.stubEnv("FLASH_API_BASE_URL", " https://open-api-tra.flashexpress.com// ");
    expect(flashBaseUrl()).toBe("https://open-api-tra.flashexpress.com");
  });
  it("webhook base: FLASH_WEBHOOK_BASE_URL ก่อน NEXTAUTH_URL", () => {
    vi.stubEnv("NEXTAUTH_URL", "https://a.test/");
    vi.stubEnv("FLASH_WEBHOOK_BASE_URL", "");
    expect(flashWebhookBase()).toBe("https://a.test");
    vi.stubEnv("FLASH_WEBHOOK_BASE_URL", "https://tunnel.test");
    expect(flashWebhookBase()).toBe("https://tunnel.test");
  });
});
