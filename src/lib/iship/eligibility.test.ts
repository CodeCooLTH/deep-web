// feature 00022 — unit test ของเงื่อนไขการเปิดพัสดุ (SRS §5, FR-ISHIP-023)

import { describe, expect, it } from "vitest";
import {
  checkEligibility,
  type EligibilityAccountLike,
  type EligibilityOrderLike,
} from "./eligibility";

const account: EligibilityAccountLike = {
  senderAddress: {
    name: "ร้านของฝากแม่ปุ๊ก",
    phone: "0875405557",
    address: "44/247 ซอยอ่อนนุช",
    subdistrict: "ประเวศ",
    district: "ประเวศ",
    province: "กรุงเทพมหานคร",
    postcode: "10250",
  },
};

const shippableOrder: EligibilityOrderLike = {
  fulfillmentMode: "SHIPPED",
  buyerName: "สมชาย ใจดี",
  buyerContact: "0891082095",
  shippingAddress: {
    line1: "91/83 ถ.สายไหม",
    subdistrict: "ออเงิน",
    district: "สายไหม",
    province: "กรุงเทพมหานคร",
    postcode: "10220",
  },
};

describe("checkEligibility — ออเดอร์ที่ส่งได้", () => {
  it("ออเดอร์สินค้าที่ต้องจัดส่งและข้อมูลครบ = ผ่าน", () => {
    expect(checkEligibility(shippableOrder, account)).toEqual({ eligible: true });
  });
});

describe("checkEligibility — ข้ามเงียบ (ห้ามรบกวนร้าน)", () => {
  it("ออเดอร์ที่ไม่ต้องจัดส่ง (ลูกค้ารับเอง)", () => {
    const r = checkEligibility(
      { ...shippableOrder, fulfillmentMode: "NO_SHIPPING" },
      account,
    );
    expect(r).toMatchObject({ eligible: false, kind: "SKIP_SILENT" });
  });

  // เดิมที่นี่เทสว่า type ที่ไม่ใช่ PHYSICAL ต้องถูกข้าม — กฎนั้นถูกถอดออกแล้ว
  // เพราะขัดกับ shipOrder() ที่ใช้ fulfillmentMode ตัดสิน (เจอจริงบน prod 2026-08-01:
  // ออเดอร์ SERVICE ที่ต้องจัดส่งจริงถูกปฏิเสธ) ตอนนี้เทสกลับด้าน: ต้อง "ผ่าน"
  it.each(["BOOKING", "DIGITAL", "SERVICE", "SUBSCRIPTION", "PHYSICAL"])(
    "ออเดอร์ประเภท %s ที่ fulfillmentMode = SHIPPED ต้องเปิดพัสดุได้",
    () => {
      expect(checkEligibility(shippableOrder, account)).toEqual({ eligible: true });
    },
  );

  it("ออเดอร์ที่ fulfillmentMode ไม่ใช่ SHIPPED ต้องข้ามเงียบ ไม่ว่าประเภทอะไร", () => {
    for (const fulfillmentMode of ["NO_SHIPPING", "PICKUP", "DIGITAL_DELIVERY"]) {
      const r = checkEligibility({ ...shippableOrder, fulfillmentMode }, account);
      expect(r).toMatchObject({ eligible: false, kind: "SKIP_SILENT" });
    }
  });

  it("ร้านยังไม่ได้เชื่อมต่อ iShip", () => {
    const r = checkEligibility(shippableOrder, null);
    expect(r).toMatchObject({ eligible: false, kind: "SKIP_SILENT" });
  });

  it("ออเดอร์ที่ไม่ต้องจัดส่งของร้านที่ยังไม่ตั้งที่อยู่ผู้ส่ง ต้องข้ามเงียบ ไม่ใช่ NEEDS_FIX", () => {
    // เคสนี้คือเหตุผลที่ลำดับการตรวจสำคัญ — ถ้าเช็คที่อยู่ผู้ส่งก่อน "ต้องส่งไหม"
    // ร้านขายของดิจิทัลจะเจอข้อความเตือนทุกออเดอร์ทั้งที่ไม่เกี่ยวกับตัวเองเลย
    const r = checkEligibility(
      { ...shippableOrder, fulfillmentMode: "NO_SHIPPING" },
      { senderAddress: {} },
    );
    expect(r).toMatchObject({ eligible: false, kind: "SKIP_SILENT" });
  });
});

describe("checkEligibility — ต้องแจ้งให้แก้ พร้อมบอกช่องที่ขาด", () => {
  it("ร้านยังไม่ตั้งที่อยู่ผู้ส่ง — ต้องระบุว่าเป็นของผู้ส่ง ไม่ใช่ผู้รับ", () => {
    const r = checkEligibility(shippableOrder, { senderAddress: {} });
    expect(r).toMatchObject({ eligible: false, kind: "NEEDS_FIX", field: "SENDER" });
    if (r.eligible === false && r.kind === "NEEDS_FIX") {
      expect(r.missing.length).toBeGreaterThan(0);
      // ปลายทางใช้ field ตัดสินว่าจะพาไปหน้าตั้งค่าหรือให้กรอกที่อยู่ผู้รับตรงนั้น
      // ถ้าคำที่คืนมาเป็นของผู้รับ ร้านจะไปกรอกผิดที่แล้วสร้างพัสดุไม่ได้อยู่ดี
      expect(r.missing.some((m) => m.includes("ผู้รับ"))).toBe(false);
    }
  });

  it("ที่อยู่ผู้รับขาดตำบลกับรหัสไปรษณีย์ — ต้องระบุชื่อช่องได้ตรงตัว", () => {
    const r = checkEligibility(
      {
        ...shippableOrder,
        shippingAddress: {
          line1: "91/83",
          district: "สายไหม",
          province: "กรุงเทพมหานคร",
        },
      },
      account,
    );
    expect(r).toMatchObject({ eligible: false, kind: "NEEDS_FIX", field: "RECEIVER" });
    if (r.eligible === false && r.kind === "NEEDS_FIX") {
      expect(r.missing).toEqual(["ตำบล", "รหัสไปรษณีย์"]);
    }
  });

  it("ไม่มีเบอร์ผู้รับ", () => {
    const r = checkEligibility({ ...shippableOrder, buyerContact: null }, account);
    expect(r).toMatchObject({ eligible: false, kind: "NEEDS_FIX", field: "RECEIVER" });
    if (r.eligible === false && r.kind === "NEEDS_FIX") {
      expect(r.missing).toContain("เบอร์โทรผู้รับ");
    }
  });

  it("ไม่มีที่อยู่จัดส่งเลย", () => {
    const r = checkEligibility({ ...shippableOrder, shippingAddress: null }, account);
    expect(r).toMatchObject({ eligible: false, kind: "NEEDS_FIX" });
  });

  it("บอกปัญหาที่อยู่ผู้ส่งก่อนผู้รับ — เป็นปัญหาระดับร้านที่แก้ครั้งเดียวจบ", () => {
    const r = checkEligibility(
      { ...shippableOrder, shippingAddress: { line1: "91/83" } },
      { senderAddress: {} },
    );
    // ทั้งสองฝั่งขาด แต่ต้องได้รายการของ "ผู้ส่ง" ก่อน ไม่งั้นร้านจะไล่แก้ทีละออเดอร์
    // โดยไม่รู้ว่าต้นตออยู่ที่หน้าตั้งค่า
    expect(r).toMatchObject({ eligible: false, kind: "NEEDS_FIX", field: "SENDER" });
    if (r.eligible === false && r.kind === "NEEDS_FIX") {
      expect(r.missing).toContain("จังหวัด (ผู้ส่ง)");
      expect(r.missing).not.toContain("จังหวัด");
    }
  });
});
