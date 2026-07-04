import { describe, expect, it } from "vitest";
import {
  DEFAULT_INVITE_EXPIRY_KEY,
  INVITE_EXPIRY_OPTIONS,
  buildInviteUrl,
  expiryKeyToDate,
  generateInviteSlug,
} from "@/lib/invite-link";

describe("generateInviteSlug", () => {
  it("คืน 12 ตัวอักษร [A-Za-z0-9] เท่านั้น", () => {
    expect(generateInviteSlug()).toMatch(/^[A-Za-z0-9]{12}$/);
  });

  it("สุ่มสองครั้งได้ค่าไม่ซ้ำกัน", () => {
    expect(generateInviteSlug()).not.toBe(generateInviteSlug());
  });
});

describe("buildInviteUrl", () => {
  it("ประกอบ URL รูปแบบ <base>/i/<slug>", () => {
    expect(buildInviteUrl("abc123")).toContain("/i/abc123");
  });

  it("ขึ้นต้นด้วย http", () => {
    expect(buildInviteUrl("abc123")).toMatch(/^https?:\/\//);
  });
});

describe("INVITE_EXPIRY_OPTIONS", () => {
  it("มี key ตรงตาม default", () => {
    expect(
      INVITE_EXPIRY_OPTIONS.find((o) => o.key === DEFAULT_INVITE_EXPIRY_KEY),
    ).toBeTruthy();
  });

  it("มีครบ 3 ตัวเลือก 24h/7d/30d พร้อม label ภาษาไทย", () => {
    const keys = INVITE_EXPIRY_OPTIONS.map((o) => o.key);
    expect(keys).toEqual(["24h", "7d", "30d"]);
    expect(INVITE_EXPIRY_OPTIONS.find((o) => o.key === "24h")?.label).toBe(
      "24 ชั่วโมง",
    );
    expect(INVITE_EXPIRY_OPTIONS.find((o) => o.key === "7d")?.label).toBe(
      "7 วัน",
    );
    expect(INVITE_EXPIRY_OPTIONS.find((o) => o.key === "30d")?.label).toBe(
      "30 วัน",
    );
  });
});

describe("expiryKeyToDate", () => {
  it("'24h' ให้เวลาประมาณ now + 24 ชั่วโมง", () => {
    const before = Date.now();
    const result = expiryKeyToDate("24h");
    const after = Date.now();
    const expectedMs = 24 * 60 * 60 * 1000;
    expect(result.getTime()).toBeGreaterThanOrEqual(before + expectedMs);
    expect(result.getTime()).toBeLessThanOrEqual(after + expectedMs + 1000);
  });
});
