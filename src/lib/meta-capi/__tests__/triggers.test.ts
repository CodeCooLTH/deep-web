import { describe, expect, it } from "vitest";
import { eventsForTrigger } from "../triggers";

const s = (purchaseAt: "CREATE" | "CONFIRM" | "PAYMENT", countPromotedDraft = true) => ({ purchaseAt, countPromotedDraft });

describe("eventsForTrigger — การกระทำในระบบ → เหตุการณ์ (FR-006 · FR-008)", () => {
  it("สร้างคำสั่งซื้อ: OrderCreated เสมอ · Purchase เฉพาะจังหวะ CREATE", () => {
    expect(eventsForTrigger("CREATED", s("CREATE"))).toEqual(["ORDER_CREATED", "PURCHASE"]);
    expect(eventsForTrigger("CREATED", s("PAYMENT"))).toEqual(["ORDER_CREATED"]);
  });
  it("ออเดอร์ร่างที่ยืนยัน: เหมือนสร้าง ถ้าร้านนับ · ไม่นับ = ไม่มีอะไร", () => {
    expect(eventsForTrigger("DRAFT_PROMOTED", s("CREATE", true))).toEqual(["ORDER_CREATED", "PURCHASE"]);
    expect(eventsForTrigger("DRAFT_PROMOTED", s("CREATE", false))).toEqual([]);
  });
  it("ยืนยันรับ: Purchase เฉพาะจังหวะ CONFIRM", () => {
    expect(eventsForTrigger("CONFIRMED", s("CONFIRM"))).toEqual(["PURCHASE"]);
    expect(eventsForTrigger("CONFIRMED", s("PAYMENT"))).toEqual([]);
    expect(eventsForTrigger("CONFIRMED", s("CREATE"))).toEqual([]);
  });
  it("ชำระครบ: Purchase เมื่อจังหวะ CONFIRM (อันไหนก่อน) หรือ PAYMENT", () => {
    expect(eventsForTrigger("FULLY_PAID", s("CONFIRM"))).toEqual(["PURCHASE"]);
    expect(eventsForTrigger("FULLY_PAID", s("PAYMENT"))).toEqual(["PURCHASE"]);
    expect(eventsForTrigger("FULLY_PAID", s("CREATE"))).toEqual([]);
  });
  it("ขั้นออเดอร์อื่น map ตรงตัว ไม่ขึ้นกับจังหวะ Purchase", () => {
    expect(eventsForTrigger("SLIP", s("CREATE"))).toEqual(["ADD_PAYMENT_INFO"]);
    expect(eventsForTrigger("SHIPPED", s("CREATE"))).toEqual(["ORDER_SHIPPED"]);
    expect(eventsForTrigger("DELIVERED", s("CREATE"))).toEqual(["ORDER_DELIVERED"]);
    expect(eventsForTrigger("CANCELED", s("CREATE"))).toEqual(["ORDER_CANCELED"]);
    expect(eventsForTrigger("RETURNED", s("CREATE"))).toEqual(["ORDER_RETURNED"]);
  });
});
