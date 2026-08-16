import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma, deleteTestData } from "../setup";
import {
  createOrder,
  confirmOrder,
  shipOrder,
  cancelOrder,
  VALID_TRANSITIONS,
} from "@/services/order.service";

// ─── id ที่เทสสร้าง — เก็บไว้ลบเฉพาะของตัวเองใน afterEach (Hard Rule 13) ────────

let userIds: string[] = [];
let shopIds: string[] = [];

function resetTrackedIds() {
  userIds = [];
  shopIds = [];
}

async function cleanupTrackedIds() {
  await deleteTestData({ userIds, shopIds });
}

// ─── Seed helper ──────────────────────────────────────────────────────────────

/**
 * สร้าง user + shop + product 1 ชิ้น
 * fulfillmentMode ของ product ควบคุม order-level fulfillmentMode ที่ createOrder จะ snapshot
 */
async function seedShopProduct(fulfillmentMode: "SHIPPED" | "NO_SHIPPING") {
  const user = await prisma.user.create({
    data: { displayName: "ร้านค้าทดสอบ", username: `shop_${Date.now()}`, isShop: true },
  });
  userIds.push(user.id);
  const shop = await prisma.shop.create({
    data: { userId: user.id, shopName: "Shop Test", businessType: "INDIVIDUAL" },
  });
  shopIds.push(shop.id);
  const product = await prisma.product.create({
    data: {
      shopId: shop.id,
      name: "สินค้าทดสอบ",
      price: 100,
      type: fulfillmentMode === "SHIPPED" ? "PHYSICAL" : "DIGITAL",
      fulfillmentMode,
    },
  });
  return { user, shop, product };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("OMS State Machine — createOrder", () => {
  beforeEach(resetTrackedIds);
  afterEach(cleanupTrackedIds);

  it("createOrder → status = PENDING", async () => {
    const { shop } = await seedShopProduct("SHIPPED");
    const order = await createOrder(shop.id, {
      items: [{ name: "กล่องสินค้า", qty: 1, price: 200 }],
      type: "PHYSICAL",
    });
    expect(order.status).toBe("PENDING");
  });

  it("createOrder with SHIPPED product → fulfillmentMode = SHIPPED", async () => {
    const { shop, product } = await seedShopProduct("SHIPPED");
    const order = await createOrder(shop.id, {
      items: [{ productId: product.id, name: product.name, qty: 1, price: 100 }],
      type: "PHYSICAL",
    });
    // fulfillmentMode อยู่ใน column ที่ยังไม่ใน generated client (Task 1 authored-not-applied)
    // cast ผ่าน unknown เพื่ออ่านค่า — จะ type-safe หลัง cutover
    const fm = (order as unknown as { fulfillmentMode?: string }).fulfillmentMode;
    // snapshot จาก product.fulfillmentMode = SHIPPED
    expect(fm).toBe("SHIPPED");
  });

  it("createOrder with NO_SHIPPING product → fulfillmentMode = NO_SHIPPING", async () => {
    const { shop, product } = await seedShopProduct("NO_SHIPPING");
    const order = await createOrder(shop.id, {
      items: [{ productId: product.id, name: product.name, qty: 1, price: 100 }],
      type: "DIGITAL",
    });
    const fm = (order as unknown as { fulfillmentMode?: string }).fulfillmentMode;
    expect(fm).toBe("NO_SHIPPING");
  });

  it("createOrder with manual item (no productId) + PHYSICAL type → fulfillmentMode = SHIPPED", async () => {
    const { shop } = await seedShopProduct("NO_SHIPPING");
    const order = await createOrder(shop.id, {
      // item พิมพ์เอง (productId=null) + type=PHYSICAL → fallback SHIPPED
      items: [{ name: "สินค้าพิมพ์เอง", qty: 2, price: 150 }],
      type: "PHYSICAL",
    });
    const fm = (order as unknown as { fulfillmentMode?: string }).fulfillmentMode;
    expect(fm).toBe("SHIPPED");
  });
});

describe("OMS State Machine — NO_SHIPPING flow", () => {
  beforeEach(resetTrackedIds);
  afterEach(cleanupTrackedIds);

  it("PENDING → confirmOrder → CONFIRMED (direct terminal สำหรับ NO_SHIPPING)", async () => {
    const { shop, product } = await seedShopProduct("NO_SHIPPING");
    const order = await createOrder(shop.id, {
      items: [{ productId: product.id, name: product.name, qty: 1, price: 100 }],
      type: "DIGITAL",
    });
    expect(order.status).toBe("PENDING");
    const confirmed = await confirmOrder(order.publicToken, "0899999999");
    expect(confirmed.status).toBe("CONFIRMED");
    expect(confirmed.buyerContact).toBe("0899999999");
  });
});

describe("OMS State Machine — SHIPPED flow", () => {
  beforeEach(resetTrackedIds);
  afterEach(cleanupTrackedIds);

  it("PENDING → shipOrder → SHIPPED → confirmOrder → CONFIRMED", async () => {
    const { shop, product } = await seedShopProduct("SHIPPED");
    const order = await createOrder(shop.id, {
      items: [{ productId: product.id, name: product.name, qty: 1, price: 100 }],
      type: "PHYSICAL",
    });
    expect(order.status).toBe("PENDING");

    // step 1: ship
    const shipped = await shipOrder(order.publicToken, { provider: "Kerry", trackingNo: "KR001" });
    expect(shipped.status).toBe("SHIPPED");

    // step 2: buyer confirm
    const confirmed = await confirmOrder(order.publicToken, "0811111111");
    expect(confirmed.status).toBe("CONFIRMED");
  });

  it("shipOrder on NO_SHIPPING order → rejects (ออเดอร์นี้ไม่ต้องจัดส่ง)", async () => {
    const { shop, product } = await seedShopProduct("NO_SHIPPING");
    const order = await createOrder(shop.id, {
      items: [{ productId: product.id, name: product.name, qty: 1, price: 100 }],
      type: "DIGITAL",
    });
    await expect(
      shipOrder(order.publicToken, { provider: "Kerry", trackingNo: "KR002" }),
    ).rejects.toThrow("ออเดอร์นี้ไม่ต้องจัดส่ง");
  });
});

describe("OMS State Machine — cancelOrder", () => {
  beforeEach(resetTrackedIds);
  afterEach(cleanupTrackedIds);

  it("cancelOrder(seller) จาก PENDING → CANCELLED + cancelInitiator = seller", async () => {
    const { shop } = await seedShopProduct("SHIPPED");
    const order = await createOrder(shop.id, {
      items: [{ name: "สินค้า", qty: 1, price: 100 }],
      type: "PHYSICAL",
    });
    const cancelled = await cancelOrder(order.publicToken, "seller");
    expect(cancelled.status).toBe("CANCELLED");
    // cancelInitiator ใน column ที่ยังไม่ใน generated client — cast ผ่าน unknown
    const ci = (cancelled as unknown as { cancelInitiator?: string }).cancelInitiator;
    expect(ci).toBe("seller");
  });

  it("cancelOrder(buyer) จาก PENDING → CANCELLED + cancelInitiator = buyer", async () => {
    const { shop } = await seedShopProduct("SHIPPED");
    const order = await createOrder(shop.id, {
      items: [{ name: "สินค้า", qty: 1, price: 100 }],
      type: "PHYSICAL",
    });
    const cancelled = await cancelOrder(order.publicToken, "buyer");
    const ci = (cancelled as unknown as { cancelInitiator?: string }).cancelInitiator;
    expect(ci).toBe("buyer");
  });

  it("cancel หลัง CONFIRMED → rejects (terminal ยกเลิกไม่ได้)", async () => {
    const { shop, product } = await seedShopProduct("NO_SHIPPING");
    const order = await createOrder(shop.id, {
      items: [{ productId: product.id, name: product.name, qty: 1, price: 100 }],
      type: "DIGITAL",
    });
    await confirmOrder(order.publicToken, "0822222222");
    // CONFIRMED เป็น terminal — VALID_TRANSITIONS["CONFIRMED"] = [] → ต้อง throw
    await expect(cancelOrder(order.publicToken, "seller")).rejects.toThrow();
  });
});

describe("VALID_TRANSITIONS ค่าใหม่", () => {
  it("PENDING → SHIPPED, CONFIRMED, CANCELLED เท่านั้น", () => {
    expect(VALID_TRANSITIONS["PENDING"]).toEqual(
      expect.arrayContaining(["SHIPPED", "CONFIRMED", "CANCELLED"]),
    );
    expect(VALID_TRANSITIONS["PENDING"]).toHaveLength(3);
  });

  it("SHIPPED → CONFIRMED, CANCELLED เท่านั้น", () => {
    expect(VALID_TRANSITIONS["SHIPPED"]).toEqual(
      expect.arrayContaining(["CONFIRMED", "CANCELLED"]),
    );
    expect(VALID_TRANSITIONS["SHIPPED"]).toHaveLength(2);
  });

  it("CONFIRMED = terminal (ไม่มี transition)", () => {
    expect(VALID_TRANSITIONS["CONFIRMED"]).toHaveLength(0);
  });

  it("CANCELLED = terminal (ไม่มี transition)", () => {
    expect(VALID_TRANSITIONS["CANCELLED"]).toHaveLength(0);
  });

  it("ไม่มี CREATED หรือ COMPLETED ใน map", () => {
    expect(VALID_TRANSITIONS["CREATED"]).toBeUndefined();
    expect(VALID_TRANSITIONS["COMPLETED"]).toBeUndefined();
  });
});
