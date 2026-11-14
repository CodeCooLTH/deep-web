import { describe, expect, it } from "vitest";
import { audienceState, connectErrorKey, expiringDays, parseOauthReturn, showManualFormByDefault } from "../ui";

const base = { enabled: false, backfilledAt: null, status: "ACTIVE", stoppedReason: null, tokenSource: "MANUAL", tokenExpiresAt: null };

describe("audienceState", () => {
  it("ไม่มี connection = none", () => expect(audienceState(null)).toBe("none"));
  it("ACTIVE ปิด = off", () => expect(audienceState(base)).toBe("off"));
  it("เปิด + ยังไม่เติมเสร็จ = filling · เติมแล้ว = normal", () => {
    expect(audienceState({ ...base, enabled: true })).toBe("filling");
    expect(audienceState({ ...base, enabled: true, backfilledAt: "2026-11-14T00:00:00Z" })).toBe("normal");
  });
  it("STOPPED ชนะ enabled", () => {
    expect(audienceState({ ...base, enabled: true, status: "STOPPED", stoppedReason: "TERMS_NOT_ACCEPTED" })).toBe("terms");
    expect(audienceState({ ...base, enabled: true, status: "STOPPED", stoppedReason: "TOKEN_OR_PERMISSION" })).toBe("token");
    expect(audienceState({ ...base, status: "STOPPED", stoppedReason: null })).toBe("token");
  });
});

describe("expiringDays (S7)", () => {
  const now = new Date("2026-11-14T00:00:00Z");
  const oauth = { ...base, tokenSource: "OAUTH" };
  it("เหลือ <7 วัน = ปัดขึ้น", () => expect(expiringDays({ ...oauth, tokenExpiresAt: "2026-11-17T06:00:00Z" }, now)).toBe(4));
  it("เหลือ ≥7 วัน = null (ขอบ)", () => expect(expiringDays({ ...oauth, tokenExpiresAt: "2026-11-21T00:00:00Z" }, now)).toBeNull());
  it("เลยเวลาแล้ว = 0", () => expect(expiringDays({ ...oauth, tokenExpiresAt: "2026-11-13T00:00:00Z" }, now)).toBe(0));
  it("MANUAL / STOPPED / ไม่มีวันหมด = null", () => {
    expect(expiringDays({ ...base, tokenExpiresAt: "2026-11-15T00:00:00Z" }, now)).toBeNull();
    expect(expiringDays({ ...oauth, status: "STOPPED", tokenExpiresAt: "2026-11-15T00:00:00Z" }, now)).toBeNull();
    expect(expiringDays(oauth, now)).toBeNull();
  });
});

describe("misc", () => {
  it("manual form default = ไม่มี role", () => {
    expect(showManualFormByDefault(false)).toBe(true);
    expect(showManualFormByDefault(true)).toBe(false);
  });
  it("connectErrorKey", () => {
    expect(connectErrorKey("TOKEN_INVALID")).toBe("errToken");
    expect(connectErrorKey("AD_ACCOUNT_INVALID")).toBe("errAdAccount");
    expect(connectErrorKey("PENDING_EXPIRED")).toBe("errPending");
    expect(connectErrorKey("INVALID_INPUT")).toBe("errInput");
    expect(connectErrorKey(undefined)).toBe("errGeneric");
  });
  it("parseOauthReturn เมินค่าแปลก", () => {
    expect(parseOauthReturn("choose_account")).toBe("choose_account");
    expect(parseOauthReturn("hax")).toBeNull();
    expect(parseOauthReturn(null)).toBeNull();
  });
});
