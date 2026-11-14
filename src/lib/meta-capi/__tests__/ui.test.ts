import { describe, expect, it } from "vitest";
import { capiPageStatus, capiReasonKey, draftsOf, eventHasSettings, eventSettingsDirty, eventSettingsKind, parseRuleValue, purchaseTimingOf, rulesDirty, toSavedRules, validateRules } from "../ui";

const A = { status: "ACTIVE" };
const S = { status: "STOPPED" };

describe("capiPageStatus (มติ U2)", () => {
  it("ปิด หรือไม่มี dataset = off", () => {
    expect(capiPageStatus({ enabled: false, datasets: [A] })).toBe("off");
    expect(capiPageStatus({ enabled: true, datasets: [] })).toBe("off");
  });
  it("เปิด + ปกติทุกชุด = sending", () => expect(capiPageStatus({ enabled: true, datasets: [A, A] })).toBe("sending"));
  it("หยุดบางชุด = problem · หยุดทุกชุด = stopped", () => {
    expect(capiPageStatus({ enabled: true, datasets: [A, S] })).toBe("problem");
    expect(capiPageStatus({ enabled: true, datasets: [S, S] })).toBe("stopped");
    expect(capiPageStatus({ enabled: true, datasets: [S] })).toBe("stopped");
  });
  it("ปิดอยู่ต่อให้มีชุดที่หยุดก็ยังเป็น off", () => expect(capiPageStatus({ enabled: false, datasets: [S] })).toBe("off"));
});

describe("purchaseTimingOf", () => {
  it("ไม่มีชุดไหนเปิด PURCHASE = null", () => expect(purchaseTimingOf({ purchaseAt: "PAYMENT", datasets: [{ events: ["ORDER_CREATED"] }] })).toBeNull());
  it("มี = ตามจังหวะของเพจ · ค่าแปลก = CREATE", () => {
    expect(purchaseTimingOf({ purchaseAt: "PAYMENT", datasets: [{ events: ["PURCHASE"] }] })).toBe("PAYMENT");
    expect(purchaseTimingOf({ purchaseAt: "x", datasets: [{ events: ["PURCHASE"] }] })).toBe("CREATE");
  });
});

describe("capiReasonKey", () => {
  it.each([
    ["PENDING", null, "queued"],
    ["PENDING", "RETRYING", "retrying"],
    ["PENDING", "TOKEN_OR_PERMISSION", "waitToken"],
    ["FAILED", "MAX_ATTEMPTS", "maxAttempts"],
    ["FAILED", "REJECTED", "rejected"],
    ["SKIPPED", "TOO_OLD", "tooOld"],
    ["SENT", null, "none"],
  ])("%s/%s -> %s", (status, reason, want) => expect(capiReasonKey({ status, reason })).toBe(want));
});

describe("กฎแท็ก", () => {
  it("parseRuleValue", () => {
    expect(parseRuleValue("")).toEqual({ ok: true, value: undefined });
    expect(parseRuleValue("1,200.50")).toEqual({ ok: true, value: 1200.5 });
    expect(parseRuleValue("10000000")).toEqual({ ok: true, value: 10000000 });
    expect(parseRuleValue("10000001").ok).toBe(false);
    expect(parseRuleValue("-1").ok).toBe(false);
    expect(parseRuleValue("abc").ok).toBe(false);
  });
  it("rulesDirty: ค่าเท่ากันแม้พิมพ์ต่างรูป = ไม่ dirty · เพิ่ม/ลบ/แก้ = dirty", () => {
    const saved = [{ tagId: "a", valueBaht: 200 }, { tagId: "b" }];
    expect(rulesDirty(saved, draftsOf(saved))).toBe(false);
    expect(rulesDirty(saved, [{ tagId: "a", value: "200.00" }, { tagId: "b", value: "" }])).toBe(false);
    expect(rulesDirty(saved, [{ tagId: "a", value: "300" }, { tagId: "b", value: "" }])).toBe(true);
    expect(rulesDirty(saved, [{ tagId: "a", value: "200" }])).toBe(true);
    expect(rulesDirty(undefined, [])).toBe(false);
  });
  it("validateRules: ไม่เลือกแท็ก/ยอดเสีย/แท็กซ้ำ", () => {
    const v = validateRules([{ tagId: "a", value: "" }, { tagId: "", value: "5" }, { tagId: "a", value: "x" }]);
    expect(v).toEqual({ noTag: [1], badValue: [2], duplicate: [2] });
  });
  it("toSavedRules ไม่ใส่ valueBaht เมื่อว่าง", () => expect(toSavedRules([{ tagId: "a", value: "" }, { tagId: "b", value: "5" }])).toEqual([{ tagId: "a" }, { tagId: "b", valueBaht: 5 }]));
});

import { AMOUNT_EVENT_KEYS, CAPI_EVENT_GROUPS, RULE_EVENT_KEYS } from "../ui";
import { CAPI_EVENTS } from "../events";

describe("กลุ่มเหตุการณ์บนหน้าจอ", () => {
  it("ครบทุกเหตุการณ์ใน CAPI_EVENTS คนละครั้ง (เพิ่มเหตุการณ์ใหม่แล้วลืมจัดกลุ่ม = แดง)", () => {
    const shown = CAPI_EVENT_GROUPS.flatMap((g) => [...g.keys]).sort();
    expect(shown).toEqual(CAPI_EVENTS.map((e) => e.key).sort());
  });
  it("ตัวตั้งยอด = เหตุการณ์ที่มียอดและไม่ใช่ Lead/ViewContent", () => {
    const want = CAPI_EVENTS.filter((e) => e.hasValue && e.key !== "VIEW_CONTENT" && !(RULE_EVENT_KEYS as readonly string[]).includes(e.key)).map((e) => e.key).sort();
    expect([...AMOUNT_EVENT_KEYS].sort()).toEqual(want);
  });
});

describe("eventSettingsKind / eventSettingsDirty", () => {
  it("จัดชนิดครบทุกคีย์", () => {
    expect(eventSettingsKind("PURCHASE")).toBe("purchase");
    expect(eventSettingsKind("ORDER_CREATED")).toBe("orderCreated");
    expect(eventSettingsKind("LEAD_SUBMITTED")).toBe("rules");
    expect(eventSettingsKind("ORDER_SHIPPED")).toBe("amount");
    expect(eventHasSettings("VIEW_CONTENT")).toBe(false);
    expect(eventHasSettings("INITIATE_CHECKOUT")).toBe(false);
  });
  const base = { valueMode: "NET" as const, sendContents: false, purchaseAt: "CREATE", countPromotedDraft: false, rules: [] };
  it("ไม่แก้ = ไม่ dirty · แก้ทีละช่อง = dirty", () => {
    expect(eventSettingsDirty(base, { ...base }, undefined)).toBe(false);
    for (const p of [{ valueMode: "NO_VAT" as const }, { sendContents: true }, { purchaseAt: "PAYMENT" }, { countPromotedDraft: true }, { rules: [{ tagId: "a", value: "" }] }])
      expect(eventSettingsDirty(base, { ...base, ...p }, undefined)).toBe(true);
  });
  it("กฎ 200 กับ 200.00 ไม่ถือว่าต่าง", () =>
    expect(eventSettingsDirty(base, { ...base, rules: [{ tagId: "a", value: "200.00" }] }, [{ tagId: "a", valueBaht: 200 }])).toBe(false));
});
