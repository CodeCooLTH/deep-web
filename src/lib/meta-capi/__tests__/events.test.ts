import { describe, expect, it } from "vitest";
import { CAPI_EVENTS, SELECTABLE_EVENTS } from "../events";

describe("รายการเหตุการณ์ (PRD 3.2)", () => {
  it("เลือกได้ 12 ตัว · ไม่มี PaymentSlipAttached (Q2)", () => {
    expect(SELECTABLE_EVENTS).toHaveLength(12);
    expect(SELECTABLE_EVENTS.map((e) => e.metaName)).not.toContain("PaymentSlipAttached");
  });
  it("Lead 2 ตัวจุดได้จากกฎแท็กเท่านั้น", () => {
    const tagOnly = CAPI_EVENTS.filter((e) => e.source === "TAG_RULE").map((e) => e.key);
    expect(tagOnly.sort()).toEqual(["LEAD_SUBMITTED", "QUALIFIED_LEAD"]);
  });
});
