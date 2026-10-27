import { describe, expect, it } from "vitest";
import { FlashServiceError } from "../errors";
import {
  buildCreateOrderParams, buildEstimateParams, buildFlashOutTradeNo, findMissingFlashParcelFields,
  foldCodItems, normalizeFlashProvince, type BuildFlashCreateInput,
} from "../mapping";

const base = (): BuildFlashCreateInput => ({
  outTradeNo: "Fabc123A1",
  sender: { name: "ร้านก", phone: "0812345678", address: "1 ถ.ส่ง", subdistrict: "ตำบลส่ง", district: "อำเภอส่ง", province: "เชียงใหม่", postcode: "50000" },
  receiver: { name: "คุณข", phone: "0898765432", address: { line1: "9 ถ.รับ", subdistrict: "ตำบลรับ", district: "อำเภอรับ", province: "กรุงเทพมหานคร", postcode: "10110" } },
  parcel: { weight: 1.25, categoryId: 4 },
});
const userMsg = (fn: () => unknown): string => {
  try { fn(); } catch (e) { return (e as FlashServiceError).userMessage; }
  throw new Error("ไม่ throw");
};
const items = (n: number, qty = 1) => Array.from({ length: n }, (_, i) => ({ name: `s${i + 1}`, qty }));

describe("[blocker] ตำบล -> *DistrictName, อำเภอ -> *CityName", () => {
  it("ผู้ส่งและผู้รับ", () => {
    const p = buildCreateOrderParams(base());
    expect(p.srcDistrictName).toBe("ตำบลส่ง");
    expect(p.srcCityName).toBe("อำเภอส่ง");
    expect(p.dstDistrictName).toBe("ตำบลรับ");
    expect(p.dstCityName).toBe("อำเภอรับ");
  });
  it("estimate: อำเภอ -> *CityName", () => {
    const p = buildEstimateParams({ sender: { province: "x", district: "อำเภอส่ง", postcode: "50000" }, receiver: { province: "y", district: "อำเภอรับ", postcode: "10110" }, weight: 1 });
    expect(p.srcCityName).toBe("อำเภอส่ง");
    expect(p.dstCityName).toBe("อำเภอรับ");
  });
});

describe("params พื้นฐาน", () => {
  it("หน่วยและค่าตั้งต้น", () => {
    const p = buildCreateOrderParams(base());
    expect(p).toMatchObject({ outTradeNo: "Fabc123A1", expressCategory: 1, articleCategory: 4, weight: 1250, insured: 0, codEnabled: 0, dstProvinceName: "กรุงเทพ" });
    expect(p.codAmount).toBeUndefined();
    expect(p.width).toBeUndefined();
  });
  it("onTime=2, มิติครบถึงส่ง, boxShield, remark ตัด 200", () => {
    const i = base();
    i.options = { onTime: true, boxShield: true };
    i.parcel = { ...i.parcel, width: 10, length: 20, height: 5 };
    i.remark = "ก".repeat(300);
    const p = buildCreateOrderParams(i);
    expect(p).toMatchObject({ expressCategory: 2, opdInsureEnabled: 1, width: 10, length: 20, height: 5 });
    expect(String(p.remark)).toHaveLength(200);
  });
  it("มิติไม่ครบ = ไม่ส่ง", () => {
    const i = base();
    i.parcel = { ...i.parcel, width: 10, length: 20 };
    expect(buildCreateOrderParams(i).width).toBeUndefined();
  });
});

describe("COD", () => {
  it("ส่ง codAmount เป็นสตางค์ · ไม่ส่ง subItemTypes (Flash: ใช้เฉพาะพัสดุหลายกล่อง — UAT 2026-10-27)", () => {
    const i = { ...base(), codAmount: 350.5, items: [{ name: "เสื้อ", qty: 2 }] };
    const p = buildCreateOrderParams(i);
    expect(p).toMatchObject({ codEnabled: 1, codAmount: 35050 });
    expect(p).not.toHaveProperty("subItemTypes");
  });
  it("พับ 12 รายการ -> 10 รายการ รายการที่ 10 = สินค้าอื่น ๆ ผลรวมเท่าเดิม", () => {
    const f = foldCodItems(items(12, 3));
    expect(f).toHaveLength(10);
    expect(f[9]).toEqual({ itemName: "สินค้าอื่น ๆ", itemQuantity: 9 }); // เหลือ 3 รายการ x 3
  });
  it("ผลรวมจำนวนทั้งหมดไม่เปลี่ยนหลังพับ", () => {
    const src = items(15, 2);
    const f = foldCodItems(src);
    expect(f.reduce((s, x) => s + x.itemQuantity, 0)).toBe(30);
    expect(f.slice(0, 9).map((x) => x.itemName)).toEqual(src.slice(0, 9).map((x) => x.name));
  });
  it("พอดี 10 ไม่พับ", () => expect(foldCodItems(items(10))).toHaveLength(10));
  it("จำนวน >999 ปฏิเสธพร้อมชื่อ", () => {
    expect(userMsg(() => foldCodItems([{ name: "ของแพง", qty: 1000 }]))).toMatch(/ของแพง/);
    expect(foldCodItems([{ name: "a", qty: 999 }])[0].itemQuantity).toBe(999);
  });
  it("ผลรวม 'อื่น ๆ' >999 ปฏิเสธ", () => {
    expect(() => foldCodItems(items(12, 500))).toThrow(FlashServiceError);
  });
  it("COD ไม่มีรายการยังส่งได้ (ไม่ใช้ subItemTypes แล้ว) · ยอดติดลบ ปฏิเสธ", () => {
    expect(buildCreateOrderParams({ ...base(), codAmount: 100 })).toMatchObject({ codEnabled: 1, codAmount: 10000 });
    expect(() => buildCreateOrderParams({ ...base(), codAmount: -1, items: items(1) })).toThrow(FlashServiceError);
  });
});

describe("ปฏิเสธก่อนส่ง", () => {
  it("ประกันไม่มีมูลค่า", () => {
    for (const v of [undefined, null, 0]) {
      expect(userMsg(() => buildCreateOrderParams({ ...base(), options: { isInsured: true, productValue: v } }))).toMatch(/มูลค่า/);
    }
    const p = buildCreateOrderParams({ ...base(), options: { isInsured: true, productValue: 500 } });
    expect(p).toMatchObject({ insured: 1, insureDeclareValue: 50000 });
  });
  it.each(["1011", "101100", "abcde", ""])("postcode %j ผู้รับ", (zip) => {
    const i = base();
    i.receiver.address.postcode = zip;
    expect(() => buildCreateOrderParams(i)).toThrow(FlashServiceError);
  });
  it("postcode ผู้ส่งไม่ 5 หลัก", () => {
    const i = base();
    i.sender.postcode = "5000";
    expect(userMsg(() => buildCreateOrderParams(i))).toMatch(/รหัสไปรษณีย์ \(ผู้ส่ง\)/);
  });
  it("เบอร์ไม่ใช่มือถือ, ที่อยู่ไม่ครบ, น้ำหนัก 0", () => {
    const a = base(); a.receiver.phone = "021234567";
    expect(userMsg(() => buildCreateOrderParams(a))).toMatch(/เบอร์โทรผู้รับ/);
    const b = base(); b.receiver.address.subdistrict = "";
    expect(userMsg(() => buildCreateOrderParams(b))).toMatch(/ตำบล/);
    const c = base(); c.parcel.weight = 0;
    expect(userMsg(() => buildCreateOrderParams(c))).toMatch(/น้ำหนัก/);
  });
});

describe("จังหวัด / outTradeNo / parcel", () => {
  it("จังหวัดผ่านตาราง Flash ไม่ใช่ normalizeProvince ของ iShip", () => {
    expect(normalizeFlashProvince("กรุงเทพมหานคร")).toBe("กรุงเทพ");
    expect(normalizeFlashProvince(" กรุงเทพ ")).toBe("กรุงเทพ"); // iShip จะแปลงเป็น กรุงเทพมหานคร
    expect(normalizeFlashProvince("เชียงใหม่")).toBe("เชียงใหม่");
    expect(normalizeFlashProvince(null)).toBe("");
  });
  it("outTradeNo", () => {
    expect(buildFlashOutTradeNo("3f2a-9c-b1", 1)).toBe("F3f2a9cb1A1");
    expect(buildFlashOutTradeNo("123e4567-e89b-12d3-a456-426614174000", 12)).toMatch(/^[A-Za-z0-9]{1,64}$/);
    expect(() => buildFlashOutTradeNo("x".repeat(70), 1)).toThrow(FlashServiceError);
    expect(() => buildFlashOutTradeNo("---", 1)).toThrow(FlashServiceError);
  });
  it("findMissingFlashParcelFields", () => {
    expect(findMissingFlashParcelFields({ categoryId: 4, weight: 1 })).toEqual([]);
    expect(findMissingFlashParcelFields({ categoryId: 77, weight: 0 })).toEqual(["ประเภทสินค้า", "น้ำหนัก"]);
  });
});
