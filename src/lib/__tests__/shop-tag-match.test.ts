import { describe, it, expect } from "vitest";
import {
  matchTagKeywords,
  tagNameKey,
  variantsIn,
  cleanKeyword,
  dedupeKeywords,
  charLen,
  SHOP_TAG_LIMITS,
} from "@/lib/shop-tag-match";
import { matchesTriggerPhrase } from "@/lib/auto-order-parser";

const m = (body: string, kws: string[]) =>
  matchTagKeywords(body, [{ name: "T", keywords: kws }]);

describe("TC-001 substring", () => {
  it("match เฉพาะที่มีคำครบ", () => {
    expect(m("สรุปออเดอร์นะคะ ยอด 590", ["สรุปออเดอร์"])).toEqual([
      { name: "T", keyword: "สรุปออเดอร์" },
    ]);
    expect(m("ขอสรุป ออเดอร์", ["สรุปออเดอร์"])).toEqual([]);
    expect(m("สรุปออเดอ", ["สรุปออเดอร์"])).toEqual([]);
  });
});

describe("TC-002 case/space/NFC", () => {
  it("ไม่สนตัวพิมพ์ ช่องว่างซ้ำ หัวท้าย", () => {
    expect(m("  order    NOW ", ["Order Now"])).toHaveLength(1);
  });
  it("NFC: วรรณยุกต์/สระลำดับต่างกัน", () => {
    const a = "ก\u0e48\u0e38"; // วรรณยุกต์ก่อนสระล่าง — NFC จัดลำดับใหม่
    const b = "ก\u0e38\u0e48";
    expect(a.normalize("NFC")).toBe(b.normalize("NFC")); // precondition
    expect(m(a, [b])).toHaveLength(1);
    expect(m("éx", ["éx"])).toHaveLength(1);
  });
});

describe("TC-003 [blocker] สัญลักษณ์ไม่ถูกลบ", () => {
  it("/go ไม่ match go แต่ match ' /go '", () => {
    expect(m("go", ["/go"])).toEqual([]);
    expect(m("พิมพ์ /go เลย", ["/go"])).toHaveLength(1);
    expect(m("พิมพ์ go เลย", ["/go"])).toEqual([]);
  });
});

describe("TC-004 หลาย tag", () => {
  it("เรียงตามลำดับที่ส่งเข้า · keywords ว่างไม่ match", () => {
    const r = matchTagKeywords("vip และ cod ครับ", [
      { name: "B", keywords: ["cod"] },
      { name: "E", keywords: [] },
      { name: "A", keywords: ["vip"] },
    ]);
    expect(r.map((x) => x.name)).toEqual(["B", "A"]);
    expect(matchTagKeywords("", [{ name: "E", keywords: [] }])).toEqual([]);
  });
});

describe("TC-005 parity กับ matchesTriggerPhrase", () => {
  it("corpus 300 ข้อความ", () => {
    // PRNG คงที่ให้เทสซ้ำได้
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const atoms = ["สรุป", "ออเดอร์", "VIP", "vip", "/go", "go", "Order", "now", "590", "!", "?"];
    const gaps = [" ", "  ", " ", "​", "　", "\n", "\t", ""];
    const kwSets = [
      ["สรุป ออเดอร์"], ["vip"], ["/go"], ["order now"],
      ["สรุปออเดอร์", "go"], ["ออเดอร์ vip"], ["​​"],
    ];
    let hits = 0;
    let nbsp = 0;
    for (let i = 0; i < 300; i++) {
      let body = "";
      const n = 1 + Math.floor(rnd() * 6);
      for (let j = 0; j < n; j++) {
        body += atoms[Math.floor(rnd() * atoms.length)] + gaps[Math.floor(rnd() * gaps.length)];
      }
      if (/[ ​　]/.test(body)) nbsp++;
      for (const kws of kwSets) {
        const exp = matchesTriggerPhrase(body, kws);
        const got = matchTagKeywords(body, [{ name: "T", keywords: kws }]);
        expect(got).toEqual(exp ? [{ name: "T", keyword: exp }] : []);
        if (exp) hits++;
      }
    }
    expect(hits).toBeGreaterThan(50);
    expect(nbsp).toBeGreaterThan(50);
  });
  it("เคส NBSP/ZWSP/ideographic space ต้อง match", () => {
    expect(m("สรุป ออเดอร์", ["สรุป ออเดอร์"])).toHaveLength(1);
    expect(m("สรุป​ออเดอร์", ["สรุป ออเดอร์"])).toHaveLength(1);
    expect(m("สรุป　ออเดอร์", ["สรุป ออเดอร์"])).toHaveLength(1);
  });
});

describe("TC-006 tagNameKey / variantsIn", () => {
  it("key + variants", () => {
    expect(tagNameKey(" VIP ")).toBe("vip");
    expect(tagNameKey("é")).toBe(tagNameKey("é"));
    expect(variantsIn(["VIP", "vip", "x"], "vip")).toEqual(["VIP", "vip"]);
    expect(tagNameKey("ลูกค้าประจำ")).toBe("ลูกค้าประจำ");
  });
});

describe("TC-007 cleanKeyword / dedupeKeywords", () => {
  it("ยุบช่องว่าง + dedupe สะกดตัวแรก", () => {
    expect(cleanKeyword("  สรุป   ออเดอร์ ")).toBe("สรุป ออเดอร์");
    expect(dedupeKeywords(["VIP", "vip", "vip"])).toEqual(["VIP"]);
    expect(dedupeKeywords(["b", "a", "B"])).toEqual(["b", "a"]);
  });
});

describe("TC-008 charLen", () => {
  it("นับ code point", () => {
    const n = SHOP_TAG_LIMITS.nameMax;
    expect(charLen("😀".repeat(n))).toBe(n);
    expect("😀".repeat(n).length).toBe(n * 2);
    expect(charLen("😀".repeat(n + 1))).toBe(n + 1);
  });
});
