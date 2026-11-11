import { describe, expect, it } from "vitest";
import { buildCapiBody, orderValue } from "../payload";

describe("orderValue — ยอดตามวิธีที่ร้านเลือก (FR-007 · HR16: totalAmount เดียวกับหน้าคำสั่งซื้อ)", () => {
  it("NET = totalAmount ตรง ๆ", () => {
    expect(orderValue({ totalAmount: "1070.00", vatAmount: "70.00" }, "NET")).toBe(1070);
  });
  it("NO_VAT = totalAmount − vatAmount · ไม่มี VAT = เท่ากัน", () => {
    expect(orderValue({ totalAmount: "1070.00", vatAmount: "70.00" }, "NO_VAT")).toBe(1000);
    expect(orderValue({ totalAmount: "500.50", vatAmount: null }, "NO_VAT")).toBe(500.5);
  });
  it("ไม่ติดลบ + ปัด 2 ตำแหน่ง", () => {
    expect(orderValue({ totalAmount: "10", vatAmount: "20" }, "NO_VAT")).toBe(0);
    expect(orderValue({ totalAmount: "0.105", vatAmount: null }, "NET")).toBe(0.11);
  });
});

describe("buildCapiBody — รูปแบบ Business Messaging (BR-CAPI-04)", () => {
  const base = {
    eventName: "Purchase",
    eventTime: new Date("2026-11-11T05:00:00Z"),
    pageId: "111",
    psid: "222",
  };

  it("ส่งแค่ page_id + PSID เป็นตัวตนลูกค้า · action_source business_messaging · เวลาเป็นวินาที", () => {
    const body = buildCapiBody({ ...base, value: 1070 });
    expect(body).toEqual({
      data: [
        {
          event_name: "Purchase",
          event_time: 1794373200,
          action_source: "business_messaging",
          messaging_channel: "messenger",
          user_data: { page_id: "111", page_scoped_user_id: "222" },
          custom_data: { currency: "THB", value: 1070 },
        },
      ],
    });
  });

  it("ไม่มียอด = ไม่มี custom_data · มี test code = แนบ test_event_code", () => {
    const body = buildCapiBody({ ...base, eventName: "InitiateCheckout", testEventCode: "TEST123" });
    expect(body.data[0]).not.toHaveProperty("custom_data");
    expect(body.test_event_code).toBe("TEST123");
  });

  it("แนบสินค้า: contents + num_items + order_id", () => {
    const body = buildCapiBody({
      ...base,
      value: 300,
      orderId: "ORD-1",
      items: [
        { id: "p1", quantity: 2, price: 100 },
        { id: "p2", quantity: 1, price: 100 },
      ],
    });
    expect(body.data[0].custom_data).toEqual({
      currency: "THB",
      value: 300,
      order_id: "ORD-1",
      num_items: 3,
      contents: [
        { id: "p1", quantity: 2, item_price: 100 },
        { id: "p2", quantity: 1, item_price: 100 },
      ],
    });
  });

  it("สินค้าเกิน 100 รายการ = ไม่แนบ contents (ยังแนบ num_items/order_id)", () => {
    const items = Array.from({ length: 101 }, (_, i) => ({ id: `p${i}`, quantity: 1, price: 1 }));
    const cd = buildCapiBody({ ...base, value: 101, orderId: "O", items }).data[0].custom_data!;
    expect(cd).not.toHaveProperty("contents");
    expect(cd.num_items).toBe(101);
  });
});
