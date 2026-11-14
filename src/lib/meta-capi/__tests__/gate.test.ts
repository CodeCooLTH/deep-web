import { afterEach, describe, expect, it, vi } from "vitest";
import { isMetaCapiEnabled } from "../gate";

afterEach(() => vi.unstubAllEnvs());

describe("OPEN_META_CAPI + META_CAPI_PILOT_SHOP_IDS (FR-001)", () => {
  it("ไม่ตั้งสวิตช์ = ปิดทุกร้าน แม้มีรายชื่อทดลอง", () => {
    vi.stubEnv("OPEN_META_CAPI", "");
    vi.stubEnv("META_CAPI_PILOT_SHOP_IDS", "s1");
    expect(isMetaCapiEnabled("s1")).toBe(false);
  });
  it("เปิด + มีรายชื่อ = เฉพาะร้านในรายชื่อ · ไม่ส่ง shopId = ปิด", () => {
    vi.stubEnv("OPEN_META_CAPI", "1");
    vi.stubEnv("META_CAPI_PILOT_SHOP_IDS", " s1 , s2 ");
    expect(isMetaCapiEnabled("s1")).toBe(true);
    expect(isMetaCapiEnabled("s2")).toBe(true);
    expect(isMetaCapiEnabled("s3")).toBe(false);
    expect(isMetaCapiEnabled()).toBe(false);
  });
  it("เปิด + ไม่มีรายชื่อ = ทุกร้าน", () => {
    vi.stubEnv("OPEN_META_CAPI", "1");
    vi.stubEnv("META_CAPI_PILOT_SHOP_IDS", "");
    expect(isMetaCapiEnabled("s9")).toBe(true);
  });
  it("ค่าอื่นที่ไม่ใช่ 1 = ปิด", () => {
    vi.stubEnv("META_CAPI_PILOT_SHOP_IDS", "");
    for (const v of ["0", "true", "yes", " "]) {
      vi.stubEnv("OPEN_META_CAPI", v);
      expect(isMetaCapiEnabled("s1")).toBe(false);
    }
  });
});
