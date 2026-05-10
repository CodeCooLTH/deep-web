import { describe, it, expect, beforeEach } from "vitest";
import { prisma, cleanDatabase } from "../setup";
import {
  createProduct,
  updateProduct,
  serializeProduct,
} from "@/services/product.service";

describe("ProductService capability flags", () => {
  let shopId: string;

  beforeEach(async () => {
    await cleanDatabase();
    const user = await prisma.user.create({
      data: { displayName: "Cap Seller", username: "cap-seller", isShop: true },
    });
    const shop = await prisma.shop.create({
      data: { userId: user.id, shopName: "Cap Shop", businessType: "INDIVIDUAL" },
    });
    shopId = shop.id;
  });

  it("creates PHYSICAL product with default capability flags (SHIPPED + ONE_TIME)", async () => {
    const created = await createProduct(shopId, { name: "Physical X", price: 199, type: "PHYSICAL" });
    const ser = serializeProduct({ ...created, tags: [] });
    expect(ser.fulfillmentMode).toBe("SHIPPED");
    expect(ser.billingMode).toBe("ONE_TIME");
    expect(ser.billingPeriod).toBeNull();
    expect(ser.billingPeriodDays).toBeNull();
  });

  it("creates DIGITAL with NO_SHIPPING + ONE_TIME (explicit)", async () => {
    const created = await createProduct(shopId, {
      name: "Digital X", price: 99, type: "DIGITAL",
      fulfillmentMode: "NO_SHIPPING", billingMode: "ONE_TIME",
    });
    const ser = serializeProduct({ ...created, tags: [] });
    expect(ser.fulfillmentMode).toBe("NO_SHIPPING");
    expect(ser.billingMode).toBe("ONE_TIME");
    expect(ser.billingPeriod).toBeNull();
  });

  it("creates SERVICE with NO_SHIPPING + ONE_TIME", async () => {
    const created = await createProduct(shopId, {
      name: "Service X", price: 499, type: "SERVICE",
      fulfillmentMode: "NO_SHIPPING", billingMode: "ONE_TIME",
    });
    const ser = serializeProduct({ ...created, tags: [] });
    expect(ser.fulfillmentMode).toBe("NO_SHIPPING");
    expect(ser.billingMode).toBe("ONE_TIME");
  });

  it("creates SUBSCRIPTION + MONTHLY (NO_SHIPPING + RECURRING)", async () => {
    const created = await createProduct(shopId, {
      name: "Sub Monthly", price: 299, type: "SUBSCRIPTION",
      fulfillmentMode: "NO_SHIPPING", billingMode: "RECURRING", billingPeriod: "MONTHLY",
    });
    const ser = serializeProduct({ ...created, tags: [] });
    expect(ser.billingMode).toBe("RECURRING");
    expect(ser.billingPeriod).toBe("MONTHLY");
    expect(ser.billingPeriodDays).toBeNull();
  });

  it("creates SUBSCRIPTION + YEARLY", async () => {
    const created = await createProduct(shopId, {
      name: "Sub Yearly", price: 2999, type: "SUBSCRIPTION",
      fulfillmentMode: "NO_SHIPPING", billingMode: "RECURRING", billingPeriod: "YEARLY",
    });
    const ser = serializeProduct({ ...created, tags: [] });
    expect(ser.billingPeriod).toBe("YEARLY");
  });

  it("creates SUBSCRIPTION + CUSTOM with billingPeriodDays (sub box override SHIPPED)", async () => {
    const created = await createProduct(shopId, {
      name: "Sub Box 14d", price: 499, type: "SUBSCRIPTION",
      fulfillmentMode: "SHIPPED", billingMode: "RECURRING",
      billingPeriod: "CUSTOM", billingPeriodDays: 14,
    });
    const ser = serializeProduct({ ...created, tags: [] });
    expect(ser.fulfillmentMode).toBe("SHIPPED");
    expect(ser.billingMode).toBe("RECURRING");
    expect(ser.billingPeriod).toBe("CUSTOM");
    expect(ser.billingPeriodDays).toBe(14);
  });

  it("update flow — change billingPeriod from MONTHLY → YEARLY", async () => {
    const created = await createProduct(shopId, {
      name: "Sub", price: 299, type: "SUBSCRIPTION",
      fulfillmentMode: "NO_SHIPPING", billingMode: "RECURRING", billingPeriod: "MONTHLY",
    });
    const updated = await updateProduct(created.id, { billingPeriod: "YEARLY" });
    expect(updated.billingPeriod).toBe("YEARLY");
    expect(updated.billingMode).toBe("RECURRING"); // unchanged
  });

  it("update flow — clear billingPeriod (set null) when switching to ONE_TIME", async () => {
    const created = await createProduct(shopId, {
      name: "Was Sub", price: 299, type: "SUBSCRIPTION",
      fulfillmentMode: "NO_SHIPPING", billingMode: "RECURRING", billingPeriod: "MONTHLY",
    });
    const updated = await updateProduct(created.id, {
      billingMode: "ONE_TIME", billingPeriod: null,
    });
    expect(updated.billingMode).toBe("ONE_TIME");
    expect(updated.billingPeriod).toBeNull();
  });
});
