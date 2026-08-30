import { describe, it, expect } from "vitest";
import {
  normalizeTriggerPhrase,
  computeContentHash,
} from "@/lib/auto-order-normalize";

describe("normalizeTriggerPhrase (00061 TFR-002)", () => {
  it("[blocker] /go ต้องไม่กลายเป็น go — สัญลักษณ์ห้ามถูกลบ", () => {
    // 🛑 เคสนี้คือทั้งหมดที่กันไม่ให้ใครแก้ไปเรียก normalizeMessage() ของ 00023
    // ไฟล์นั้นขั้น 6 แทน `/` ด้วยช่องว่าง ⇒ '/go' -> 'go' แล้วชนกับคำว่า go เปล่า ๆ
    expect(normalizeTriggerPhrase("/go")).toBe("/go");
    expect(normalizeTriggerPhrase("  /go  ")).toBe("/go");
  });

  it("[blocker] วรรณยุกต์/สระไทยต้องอยู่ครบทุกตัว", () => {
    expect(normalizeTriggerPhrase("สรุปคำสั่งซื้อ")).toBe("สรุปคำสั่งซื้อ");
    expect(normalizeTriggerPhrase("ยืนยันออเดอร์")).toBe("ยืนยันออเดอร์");
  });

  it("lowercase เฉพาะอังกฤษ + ยุบช่องว่างซ้ำ", () => {
    expect(normalizeTriggerPhrase("SUMMARY Order")).toBe("summary order");
    expect(normalizeTriggerPhrase("สรุป   คำสั่งซื้อ")).toBe("สรุป คำสั่งซื้อ");
  });

  it("idempotent", () => {
    for (const s of ["/go", "สรุป  คำสั่งซื้อ", " Total ", "#สรุป!"]) {
      expect(normalizeTriggerPhrase(normalizeTriggerPhrase(s))).toBe(
        normalizeTriggerPhrase(s),
      );
    }
  });

  it("[blocker] วรรคตอนอื่นก็ห้ามถูกลบ (ไม่ใช่แค่ /)", () => {
    expect(normalizeTriggerPhrase("#สรุป!")).toBe("#สรุป!");
    expect(normalizeTriggerPhrase("order.now")).toBe("order.now");
  });
});

describe("computeContentHash (00061 TFR-015)", () => {
  it("[blocker] ต้องฮาชจากข้อความดิบ — ห้าม normalize ก่อน", () => {
    // 🛑 พิสูจน์ด้วยเคสที่ "การ normalize จะทำให้ผลต่างออกไป" ไม่ใช่แค่ยืนยันว่า hash เสถียร
    // (เทสแบบหลังจะเขียวต่อให้มีคนใส่ normalize เข้าไปภายหลัง)
    expect(computeContentHash("สรุปคำสั่งซื้อ A")).not.toBe(
      computeContentHash("สรุปคำสั่งซื้อ  A"),
    );
    expect(computeContentHash("/go")).not.toBe(computeContentHash("go"));
    expect(computeContentHash("Order")).not.toBe(computeContentHash("order"));
  });

  it("เนื้อหาเดียวกันได้ hash เดียวกันเสมอ (ไม่มีเวลาปนอยู่ในคีย์)", () => {
    const a = computeContentHash("สรุปคำสั่งซื้อ\nเบอร์: 0812345678");
    const b = computeContentHash("สรุปคำสั่งซื้อ\nเบอร์: 0812345678");
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });
});
