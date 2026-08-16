import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma, deleteTestData } from "../setup";
// completeOrder ถูกลบใน OMS redesign Task 2 — ดู tests/services/order-state-machine.test.ts
import { createOrder, confirmOrder, shipOrder, VALID_TRANSITIONS } from "@/services/order.service";

describe("OrderService", () => {
  let shopId: string;
  let userIds: string[] = [];
  let shopIds: string[] = [];

  beforeEach(async () => {
    userIds = [];
    shopIds = [];
    const user = await prisma.user.create({
      data: { displayName: "Seller", username: "seller_order", isShop: true },
    });
    userIds.push(user.id);
    const shop = await prisma.shop.create({
      data: { userId: user.id, shopName: "TestShop", businessType: "INDIVIDUAL" },
    });
    shopIds.push(shop.id);
    shopId = shop.id;
  });

  afterEach(async () => {
    await deleteTestData({ userIds, shopIds });
  });

  it("creates order with PENDING status and public token", async () => {
    const order = await createOrder(shopId, {
      items: [{ name: "Widget", qty: 2, price: 100 }],
      type: "PHYSICAL",
      // item พิมพ์เอง (ไม่มี productId) + type=PHYSICAL → fulfillmentMode=SHIPPED (FR-6.5)
      // ต้องมีที่อยู่ครบ line1+province+postcode ไม่งั้น createOrder throw ShippingAddressRequiredError
      shippingAddress: { line1: "123 ถ.ทดสอบ", province: "กรุงเทพ", postcode: "10110" },
    });
    // status default ใหม่ = PENDING (เดิม CREATED — ตาม OMS redesign)
    expect(order.status).toBe("PENDING");
    expect(order.publicToken).toBeDefined();
    expect(order.totalAmount.toString()).toBe("200");
  });

  it("confirms order and sets buyer contact (PENDING → CONFIRMED)", async () => {
    // confirmOrder เช็ค ownership กับ order.buyerUserId (TD-004) — ต้องมี buyer จริงที่ตรงกัน
    // buyerContact ยังคงถูก set ตอน createOrder (ไม่ใช่ตอน confirmOrder อีกต่อไป — ดูคอมเมนต์
    // ใน order.service.ts confirmOrder: "ไม่เขียน buyerContact/buyerUserId ที่นี่อีกต่อไป")
    const buyer = await prisma.user.create({
      data: { displayName: "Buyer", username: "buyer_order_confirm" },
    });
    userIds.push(buyer.id);
    const order = await createOrder(shopId, {
      items: [{ name: "Widget", qty: 1, price: 50 }],
      type: "DIGITAL",
      buyerContact: "0812345678",
    });
    // จำลอง claim-time link ที่ route จริงทำผ่าน guaranteeOrderLink() ก่อนหน้า confirmOrder เสมอ
    await prisma.order.update({ where: { id: order.id }, data: { buyerUserId: buyer.id } });
    const confirmed = await confirmOrder(order.publicToken, buyer.id);
    expect(confirmed.status).toBe("CONFIRMED");
    expect(confirmed.buyerContact).toBe("0812345678");
  });

  it("rejects ship on NO_SHIPPING order (DIGITAL → fulfillmentMode=NO_SHIPPING)", async () => {
    const order = await createOrder(shopId, {
      items: [{ name: "Widget", qty: 1, price: 50 }],
      type: "DIGITAL",
    });
    await expect(shipOrder(order.publicToken, { provider: "Kerry", trackingNo: "123" }))
      .rejects.toThrow();
  });

  it("validates transition rules (new state machine)", () => {
    expect(VALID_TRANSITIONS["PENDING"]).toContain("CONFIRMED");
    expect(VALID_TRANSITIONS["PENDING"]).toContain("SHIPPED");
    expect(VALID_TRANSITIONS["PENDING"]).toContain("CANCELLED");
    expect(VALID_TRANSITIONS["SHIPPED"]).toContain("CONFIRMED");
    expect(VALID_TRANSITIONS["CONFIRMED"]).toHaveLength(0);
    expect(VALID_TRANSITIONS["CANCELLED"]).toHaveLength(0);
  });
});
