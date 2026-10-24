import { afterEach, describe, expect, it, vi } from "vitest";
import { flashBaseUrl, flashEnv, flashWebhookBase, isFlashDirectEnabled, isFlashDryRun } from "../gate";

afterEach(() => vi.unstubAllEnvs());

describe("OPEN_FLASH_EXPRESS — สวิตช์เปิด + เลือกระบบ", () => {
  it("ไม่ตั้ง/ค่าอื่น = ปิด", () => {
    for (const v of ["", "1", "true", "production", "training"]) {
      vi.stubEnv("OPEN_FLASH_EXPRESS", v);
      expect(flashEnv()).toBeNull();
      expect(isFlashDirectEnabled("s1")).toBe(false);
    }
  });
  it("prod/uat (ไม่สนตัวพิมพ์/ช่องว่าง) = เปิด แม้ NODE_ENV=production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OPEN_FLASH_EXPRESS", " UAT ");
    expect(flashEnv()).toBe("uat");
    expect(isFlashDirectEnabled("s1")).toBe(true);
    vi.stubEnv("OPEN_FLASH_EXPRESS", "prod");
    expect(isFlashDirectEnabled()).toBe(true);
  });
  it("FLASH_PILOT_SHOP_IDS ตั้งไว้ = เฉพาะร้านในรายชื่อ · ไม่ส่ง shopId = ปิด", () => {
    vi.stubEnv("OPEN_FLASH_EXPRESS", "uat");
    vi.stubEnv("FLASH_PILOT_SHOP_IDS", " s1 , s2 ");
    expect(isFlashDirectEnabled("s1")).toBe(true);
    expect(isFlashDirectEnabled("s2")).toBe(true);
    expect(isFlashDirectEnabled("s3")).toBe(false);
    expect(isFlashDirectEnabled()).toBe(false);
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
  it("URL มาจากโหมด · ปิดอยู่ = production", () => {
    vi.stubEnv("OPEN_FLASH_EXPRESS", "");
    expect(flashBaseUrl()).toBe("https://open-api.flashexpress.com");
    vi.stubEnv("OPEN_FLASH_EXPRESS", "uat");
    expect(flashBaseUrl()).toBe("https://open-api-tra.flashexpress.com");
    vi.stubEnv("OPEN_FLASH_EXPRESS", "prod");
    expect(flashBaseUrl()).toBe("https://open-api.flashexpress.com");
  });
  it("webhook base: FLASH_WEBHOOK_BASE_URL ก่อน NEXTAUTH_URL", () => {
    vi.stubEnv("NEXTAUTH_URL", "https://a.test/");
    vi.stubEnv("FLASH_WEBHOOK_BASE_URL", "");
    expect(flashWebhookBase()).toBe("https://a.test");
    vi.stubEnv("FLASH_WEBHOOK_BASE_URL", "https://tunnel.test");
    expect(flashWebhookBase()).toBe("https://tunnel.test");
  });
});
