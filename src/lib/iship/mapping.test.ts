// feature 00022 — unit test ของตัวแปลงข้อมูลไป iShip
//
// เทสชุด "ตำบล/อำเภอ" (BR-ISHIP-32) เป็น blocker: ห้าม merge ถ้าไม่ผ่าน
// เพราะเป็นความผิดพลาดชนิดที่ผ่านทุกด่านตรวจแล้วไปโผล่เป็นพัสดุส่งผิดตำบลจริง

import { describe, expect, it } from "vitest";
import {
  buildCreateOrderPayload,
  buildIdempotencyKey,
  findMissingReceiverFields,
  findMissingSenderFields,
  isValidCategoryId,
  type BuildPayloadInput,
} from "./mapping";

const baseInput: BuildPayloadInput = {
  idempotencyKey: "order-123:1",
  courierCode: "FlashExpress",
  sender: {
    name: "ร้านของฝากแม่ปุ๊ก",
    phone: "0875405557",
    address: "44/247 ซอยอ่อนนุช",
    subdistrict: "ประเวศ", // ตำบล
    district: "ประเวศ", // อำเภอ
    province: "กรุงเทพมหานคร",
    postcode: "10250",
  },
  receiver: {
    name: "สมชาย ใจดี",
    phone: "0891082095",
    address: {
      line1: "91/83 ถ.สายไหม",
      subdistrict: "ออเงิน", // ตำบล
      district: "สายไหม", // อำเภอ
      province: "กรุงเทพมหานคร",
      postcode: "10220",
    },
  },
  parcel: { weight: 1.2, width: 17, length: 25, height: 9, categoryId: 4 },
  codAmount: 0,
};

describe("buildCreateOrderPayload — การจับคู่ตำบล/อำเภอ (BR-ISHIP-31, blocker)", () => {
  it("ตำบลของผู้รับต้องไปลงช่อง dst_district ไม่ใช่ dst_amphure", () => {
    const payload = buildCreateOrderPayload(baseInput);
    expect(payload.dst_district).toBe("ออเงิน"); // ตำบล
    expect(payload.dst_amphure).toBe("สายไหม"); // อำเภอ
  });

  it("อำเภอของผู้รับต้องไปลงช่อง dst_amphure — ห้ามจับคู่ตามชื่อฟิลด์", () => {
    const payload = buildCreateOrderPayload(baseInput);
    // ถ้ามีใครแก้เป็น dst_district = address.district (จับคู่ตามชื่อ) เทสนี้จะจับได้
    expect(payload.dst_district).not.toBe(baseInput.receiver.address.district);
    expect(payload.dst_amphure).toBe(baseInput.receiver.address.district);
  });

  it("ฝั่งผู้ส่งใช้กติกาเดียวกัน — subdistrict → src_district, district → src_amphure", () => {
    const payload = buildCreateOrderPayload({
      ...baseInput,
      sender: { ...baseInput.sender, subdistrict: "คลองเตย", district: "วัฒนา" },
    });
    expect(payload.src_district).toBe("คลองเตย"); // ตำบล
    expect(payload.src_amphure).toBe("วัฒนา"); // อำเภอ
  });

  it("จังหวัดและรหัสไปรษณีย์ไปตรงช่องของตัวเอง", () => {
    const payload = buildCreateOrderPayload(baseInput);
    expect(payload.dst_province).toBe("กรุงเทพมหานคร");
    expect(payload.dst_zipcode).toBe("10220");
    expect(payload.src_zipcode).toBe("10250");
  });
});

describe("buildCreateOrderPayload — ตัวเลือกเสริม", () => {
  it("ไม่ส่ง field ของบริการเสริมเลยเมื่อไม่ได้เปิดใช้", () => {
    const payload = buildCreateOrderPayload(baseInput);
    expect(payload.on_time).toBeUndefined();
    expect(payload.box_shield).toBeUndefined();
    expect(payload.is_insured).toBeUndefined();
    // service_type ที่ไม่ส่ง = ให้ iShip ใช้ค่าตั้งต้นของร้านเอง (ตามเอกสารผู้ให้บริการ)
    expect(payload.service_type).toBeUndefined();
  });

  it("ส่ง product_value เฉพาะเมื่อเปิดประกันสินค้า", () => {
    const withInsurance = buildCreateOrderPayload({
      ...baseInput,
      options: { isInsured: true, productValue: 1500 },
    });
    expect(withInsurance.is_insured).toBe(1);
    expect(withInsurance.product_value).toBe(1500);

    // ตั้งมูลค่าไว้แต่ไม่ได้เปิดประกัน → ต้องไม่ส่งทั้งคู่
    const withoutInsurance = buildCreateOrderPayload({
      ...baseInput,
      options: { isInsured: false, productValue: 1500 },
    });
    expect(withoutInsurance.is_insured).toBeUndefined();
    expect(withoutInsurance.product_value).toBeUndefined();
  });

  it("ตัดช่องว่างของหมายเหตุ และไม่ส่งเมื่อว่างเปล่า", () => {
    expect(buildCreateOrderPayload({ ...baseInput, remark: "   " }).remark).toBeUndefined();
    expect(
      buildCreateOrderPayload({ ...baseInput, remark: " ห้ามโยน " }).remark,
    ).toBe("ห้ามโยน");
  });
});

describe("buildCreateOrderPayload — รายการสินค้า", () => {
  it("เฉลี่ยน้ำหนักต่อชิ้นจากจำนวนรวม ไม่ใช่จำนวนรายการ", () => {
    const payload = buildCreateOrderPayload({
      ...baseInput,
      parcel: { ...baseInput.parcel, weight: 1.2 },
      items: [
        { name: "เสื้อยืด", qty: 2, price: 350 },
        { name: "กางเกง", qty: 1, price: 590 },
      ],
    });
    // 3 ชิ้นรวม 1.2 กก. → 0.4 ต่อชิ้น (ถ้าใช้จำนวน "รายการ" = 2 จะได้ 0.6 ซึ่งผิด)
    expect(payload.products?.[0].product_weight).toBe(0.4);
    expect(payload.products?.[1].product_weight).toBe(0.4);
  });

  it("ส่ง products มาด้วยแม้ไม่ใช่ COD — ใช้เป็นหลักฐานของในกล่องตอนเคลม", () => {
    const payload = buildCreateOrderPayload({
      ...baseInput,
      codAmount: 0,
      items: [{ name: "เสื้อยืด", qty: 1, price: 350 }],
    });
    expect(payload.products).toHaveLength(1);
    expect(payload.products?.[0].product_name).toBe("เสื้อยืด");
  });

  it("ไม่มี key products เลยเมื่อไม่มีรายการสินค้า", () => {
    expect(buildCreateOrderPayload(baseInput).products).toBeUndefined();
    expect(buildCreateOrderPayload({ ...baseInput, items: [] }).products).toBeUndefined();
  });
});

describe("findMissingReceiverFields — บอกช่องที่ขาดเป็นข้อ ๆ (FR-ISHIP-023)", () => {
  it("ที่อยู่ครบ = ไม่มีช่องที่ขาด", () => {
    expect(
      findMissingReceiverFields(
        baseInput.receiver.address,
        baseInput.receiver.name,
        baseInput.receiver.phone,
      ),
    ).toEqual([]);
  });

  it("ระบุชื่อช่องที่ขาดได้ตรงตัว ไม่ใช่บอกรวม ๆ ว่าไม่ครบ", () => {
    const missing = findMissingReceiverFields(
      { line1: "91/83", province: "กรุงเทพมหานคร" },
      "สมชาย",
      "0891082095",
    );
    expect(missing).toEqual(["ตำบล", "อำเภอ", "รหัสไปรษณีย์"]);
  });

  it("นับช่องว่างล้วนว่าเป็นค่าที่ขาด", () => {
    const missing = findMissingReceiverFields(
      { ...baseInput.receiver.address, subdistrict: "   " },
      baseInput.receiver.name,
      baseInput.receiver.phone,
    );
    expect(missing).toContain("ตำบล");
  });

  it("ที่อยู่เป็น null ทั้งก้อน = ขาดทุกช่องของที่อยู่", () => {
    const missing = findMissingReceiverFields(null, "สมชาย", "0891082095");
    expect(missing).toEqual(["ที่อยู่", "ตำบล", "อำเภอ", "จังหวัด", "รหัสไปรษณีย์"]);
  });
});

describe("findMissingSenderFields — ที่อยู่ผู้ส่งบังคับครบ (BR-ISHIP-30)", () => {
  it("ที่อยู่ผู้ส่งครบ = ผ่าน", () => {
    expect(findMissingSenderFields(baseInput.sender)).toEqual([]);
  });

  it("ยังไม่ตั้งที่อยู่ผู้ส่งเลย = ขาดทุกช่อง", () => {
    expect(findMissingSenderFields(null).length).toBeGreaterThan(0);
  });

  // เคยพลาดจริง: ฝั่งผู้ส่งยืมคำของผู้รับมาใช้ ทำให้ร้านที่ยังไม่ตั้งที่อยู่ผู้ส่งเห็น
  // "ยังขาด ชื่อผู้รับ, เบอร์โทรผู้รับ, …" ทั้งที่ข้อมูลผู้รับครบ แล้วไล่แก้ผิดที่จนวนไม่จบ
  it("คำที่คืนต้องเป็นของผู้ส่ง ห้ามมีคำว่า 'ผู้รับ' ปนแม้แต่คำเดียว", () => {
    const missing = findMissingSenderFields(null);
    expect(missing).toEqual([
      "ชื่อผู้ส่ง",
      "เบอร์โทรผู้ส่ง",
      "ที่อยู่ผู้ส่ง",
      "ตำบล (ผู้ส่ง)",
      "อำเภอ (ผู้ส่ง)",
      "จังหวัด (ผู้ส่ง)",
      "รหัสไปรษณีย์ (ผู้ส่ง)",
    ]);
    expect(missing.some((m) => m.includes("ผู้รับ"))).toBe(false);
  });

  it("ขาดเฉพาะบางช่อง = คืนเฉพาะช่องนั้นด้วยคำของผู้ส่ง", () => {
    expect(
      findMissingSenderFields({ ...baseInput.sender, phone: "", postcode: null }),
    ).toEqual(["เบอร์โทรผู้ส่ง", "รหัสไปรษณีย์ (ผู้ส่ง)"]);
  });
});

describe("buildIdempotencyKey", () => {
  it("ประกอบจาก orderId กับ attemptGroup", () => {
    expect(buildIdempotencyKey("abc", 1)).toBe("abc:1");
  });

  it("attemptGroup เดิม = คีย์เดิม (retry ต้องไม่เปิดใบที่สอง)", () => {
    expect(buildIdempotencyKey("abc", 2)).toBe(buildIdempotencyKey("abc", 2));
  });

  it("attemptGroup ต่างกัน = คนละคีย์ (ยกเลิกแล้วเปิดใหม่ได้)", () => {
    expect(buildIdempotencyKey("abc", 1)).not.toBe(buildIdempotencyKey("abc", 2));
  });
});

describe("isValidCategoryId", () => {
  it("รับเฉพาะรหัสหมวดที่ iShip กำหนด", () => {
    expect(isValidCategoryId(0)).toBe(true);
    expect(isValidCategoryId(11)).toBe(true);
    expect(isValidCategoryId(99)).toBe(true);
    expect(isValidCategoryId(12)).toBe(false);
    expect(isValidCategoryId(-1)).toBe(false);
  });
});
