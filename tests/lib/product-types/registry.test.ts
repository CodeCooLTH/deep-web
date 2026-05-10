import { describe, it, expect } from "vitest";
import {
  PRODUCT_TYPES,
  PRODUCT_TYPE_IDS,
  FULFILLMENT_MODES,
  BILLING_MODES,
  BILLING_PERIODS,
  type ProductTypeId,
} from "@/lib/product-types/registry";

describe("product-types/registry", () => {
  it("exposes 4 type presets — PHYSICAL/DIGITAL/SERVICE/SUBSCRIPTION", () => {
    expect(PRODUCT_TYPE_IDS).toEqual(["PHYSICAL", "DIGITAL", "SERVICE", "SUBSCRIPTION"]);
  });

  it("PHYSICAL preset = SHIPPED + ONE_TIME", () => {
    expect(PRODUCT_TYPES.PHYSICAL.defaults).toEqual({
      fulfillmentMode: "SHIPPED",
      billingMode: "ONE_TIME",
    });
  });

  it("DIGITAL preset = NO_SHIPPING + ONE_TIME", () => {
    expect(PRODUCT_TYPES.DIGITAL.defaults).toEqual({
      fulfillmentMode: "NO_SHIPPING",
      billingMode: "ONE_TIME",
    });
  });

  it("SERVICE preset = NO_SHIPPING + ONE_TIME", () => {
    expect(PRODUCT_TYPES.SERVICE.defaults).toEqual({
      fulfillmentMode: "NO_SHIPPING",
      billingMode: "ONE_TIME",
    });
  });

  it("SUBSCRIPTION preset = NO_SHIPPING + RECURRING + MONTHLY", () => {
    expect(PRODUCT_TYPES.SUBSCRIPTION.defaults).toEqual({
      fulfillmentMode: "NO_SHIPPING",
      billingMode: "RECURRING",
      billingPeriod: "MONTHLY",
    });
  });

  it("every preset has emoji + label + ariaLabel + description", () => {
    for (const id of PRODUCT_TYPE_IDS) {
      const meta = PRODUCT_TYPES[id];
      expect(meta.emoji).toBeTruthy();
      expect(meta.label).toBeTruthy();
      expect(meta.ariaLabel).toBeTruthy();
      expect(meta.description).toBeTruthy();
    }
  });

  it("ProductTypeId type accepts only registered ids", () => {
    const valid: ProductTypeId = "PHYSICAL";
    expect(PRODUCT_TYPE_IDS.includes(valid)).toBe(true);
  });

  it("FULFILLMENT_MODES = [SHIPPED, NO_SHIPPING]", () => {
    expect([...FULFILLMENT_MODES]).toEqual(["SHIPPED", "NO_SHIPPING"]);
  });

  it("BILLING_MODES = [ONE_TIME, RECURRING]", () => {
    expect([...BILLING_MODES]).toEqual(["ONE_TIME", "RECURRING"]);
  });

  it("BILLING_PERIODS = [MONTHLY, YEARLY, CUSTOM]", () => {
    expect([...BILLING_PERIODS]).toEqual(["MONTHLY", "YEARLY", "CUSTOM"]);
  });

  it("SUBSCRIPTION has price baseOverride (label + unit)", () => {
    const meta = PRODUCT_TYPES.SUBSCRIPTION;
    expect(meta.baseOverrides?.price?.label).toBeTruthy();
    expect(meta.baseOverrides?.price?.unit).toBe("บาท");
  });
});
