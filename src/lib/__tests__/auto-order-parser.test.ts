import { describe, it, expect } from "vitest";
import {
  parseAutoOrderMessage,
  parseItemLine,
  matchesTriggerPhrase,
} from "@/lib/auto-order-parser";

/** เทมเพลตมาตรฐานที่โชว์ให้ร้าน copy บนหน้า A (UX-Design-Spec §หน้า A) */
const TEMPLATE = [
  "สรุปคำสั่งซื้อ",
  "ชื่อ: สมชาย ใจดี",
  "เบอร์: 0812345678",
  "ที่อยู่: 99/1 ม.3 ต.บางรัก อ.เมือง จ.ชลบุรี 20000",
  "รายการ:",
  "- เสื้อยืดสีดำ x2 @250",
  "- กางเกงขาสั้น @390",
  "ส่วนลด: 50",
  "ยอดรวม: 840",
].join("\n");

describe("parseItemLine (TFR-007)", () => {
  it("[blocker] ไม่มี @ราคา ต้องได้ null ไม่ใช่ 0", () => {
    // 🛑 ถ้าเดาเป็น 0 ระบบจะสร้างออเดอร์ราคา ฿0 เงียบ ๆ แทนที่จะตกร่างให้ร้านมาเติมราคา
    const item = parseItemLine("- เสื้อยืดสีดำ x2");
    expect(item).not.toBeNull();
    expect(item!.price).toBeNull();
    expect(item!.price).not.toBe(0);
    expect(item!.qty).toBe(2);
    expect(item!.rawName).toBe("เสื้อยืดสีดำ");
  });

  it("ไม่ระบุจำนวน = 1", () => {
    expect(parseItemLine("- กางเกงขาสั้น @390")).toEqual({
      rawName: "กางเกงขาสั้น",
      qty: 1,
      price: 390,
    });
  });

  it("ราคามีคอมมา/ทศนิยม", () => {
    expect(parseItemLine("- โซฟา x1 @12,500.50")?.price).toBe(12500.5);
  });

  it("[blocker] ชื่อสินค้าที่มี x หรือ @ ในตัวต้องไม่ถูกตัดผิด", () => {
    // ชื่อรุ่นที่ลงท้ายด้วย x — ห้ามถูกอ่านเป็นตัวคูณจำนวน
    expect(parseItemLine("- iPhone 15 Pro Max @39900")).toEqual({
      rawName: "iPhone 15 Pro Max",
      qty: 1,
      price: 39900,
    });
    const withX = parseItemLine("- เคส iPhone x3 @150");
    expect(withX).toEqual({ rawName: "เคส iPhone", qty: 3, price: 150 });
  });

  it("บรรทัดที่ไม่ขึ้นต้นด้วย - ไม่ใช่รายการ", () => {
    expect(parseItemLine("เสื้อยืด x2 @250")).toBeNull();
    expect(parseItemLine("")).toBeNull();
  });
});

describe("matchesTriggerPhrase (TFR-005)", () => {
  it("เทียบข้อความดิบกับวลีที่ normalize แล้ว", () => {
    expect(matchesTriggerPhrase(TEMPLATE, ["สรุปคำสั่งซื้อ"])).toBe(
      "สรุปคำสั่งซื้อ",
    );
    expect(matchesTriggerPhrase("ลูกค้าถามราคา", ["สรุปคำสั่งซื้อ"])).toBeNull();
  });

  it("ผู้เรียกส่งวลีดิบ (ยังไม่ normalize) มาก็ยังทำงานถูก", () => {
    expect(matchesTriggerPhrase(TEMPLATE, ["  สรุป   คำสั่งซื้อ  "])).toBeNull();
    expect(matchesTriggerPhrase("SUMMARY ORDER now", ["  Summary Order  "])).toBe(
      "summary order",
    );
  });

  it("[blocker] /go ต้อง match เฉพาะ /go ไม่ใช่คำว่า go เปล่า ๆ", () => {
    expect(matchesTriggerPhrase("จัดให้ /go", ["/go"])).toBe("/go");
    expect(matchesTriggerPhrase("let's go now", ["/go"])).toBeNull();
  });
});

describe("parseAutoOrderMessage (TFR-006)", () => {
  it("แกะเทมเพลตมาตรฐานได้ครบทุกช่อง", () => {
    const p = parseAutoOrderMessage(TEMPLATE);
    expect(p.customerName).toBe("สมชาย ใจดี");
    expect(p.phone).toBe("0812345678");
    expect(p.province).toBe("ชลบุรี");
    expect(p.postcode).toBe("20000");
    expect(p.items).toHaveLength(2);
    expect(p.discount).toBe(50);
    expect(p.statedTotal).toBe(840);
  });

  it("[blocker] หัวข้อสเกลาร์ซ้ำ = ค่าหลังสุดชนะ", () => {
    const p = parseAutoOrderMessage(
      "สรุปคำสั่งซื้อ\nเบอร์: 0899999999\nชื่อ: ก\nเบอร์: 0812345678",
    );
    expect(p.phone).toBe("0812345678");
  });

  it("[blocker] รายการซ้ำ = สะสมต่อกัน ไม่ทับของเดิม", () => {
    // 🛑 ต่างจากสเกลาร์โดยตั้งใจ — overwrite = สินค้าที่พิมพ์ไว้ก่อนหน้าหายเงียบ (ขัด BR-ACO-19)
    const p = parseAutoOrderMessage(
      ["สรุป", "รายการ:", "- ก @10", "หมายเหตุ: x", "รายการ:", "- ข @20"].join(
        "\n",
      ),
    );
    expect(p.items.map((i) => i.rawName)).toEqual(["ก", "ข"]);
  });

  it("รายการ: ที่ไม่มีบรรทัด - ตามมา → items ว่าง ไม่ throw", () => {
    const p = parseAutoOrderMessage("สรุป\nรายการ:\nยอดรวม: 100");
    expect(p.items).toEqual([]);
    expect(p.statedTotal).toBe(100);
  });

  it("ที่อยู่หลายบรรทัดถูกต่อกันก่อนส่งให้ตัวแยกที่อยู่", () => {
    const p = parseAutoOrderMessage(
      ["สรุป", "ที่อยู่: 99/1 ม.3", "ต.บางรัก อ.เมือง", "จ.ชลบุรี 20000"].join(
        "\n",
      ),
    );
    expect(p.province).toBe("ชลบุรี");
    expect(p.postcode).toBe("20000");
  });

  it("คำพ้องของหัวข้อใช้ได้ และ 'ที่อยู่จัดส่ง' ไม่ชนกับ 'ที่อยู่'", () => {
    const p = parseAutoOrderMessage(
      "สรุป\nผู้รับ: สมหญิง\nTel: 0891112222\nที่อยู่จัดส่ง: 1 ถ.สุขุมวิท จ.ชลบุรี 20000",
    );
    expect(p.customerName).toBe("สมหญิง");
    expect(p.phone).toBe("0891112222");
    expect(p.province).toBe("ชลบุรี");
  });

  it("ไม่มีหัวข้อใดตรงเลย → ทุกช่องว่าง ไม่ throw", () => {
    const p = parseAutoOrderMessage("สรุปคำสั่งซื้อ ขอบคุณครับ");
    expect(p.phone).toBeNull();
    expect(p.items).toEqual([]);
  });
});
