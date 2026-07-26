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
  type: "PHYSICAL",
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

  it.each(["BOOKING", "DIGITAL", "SERVICE", "SUBSCRIPTION"])(
    "ออเดอร์ประเภท %s ไม่มีพัสดุให้ส่ง",
    (type) => {
      const r = checkEligibility({ ...shippableOrder, type }, account);
      expect(r).toMatchObject({ eligible: false, kind: "SKIP_SILENT" });
    },
  );

  it("ร้านยังไม่ได้เชื่อมต่อ iShip", () => {
    const r = checkEligibility(shippableOrder, null);
    expect(r).toMatchObject({ eligible: false, kind: "SKIP_SILENT" });
  });

  it("ออเดอร์ดิจิทัลของร้านที่ยังไม่ตั้งที่อยู่ผู้ส่ง ต้องยังข้ามเงียบ ไม่ใช่ NEEDS_FIX", () => {
    // เคสนี้คือเหตุผลที่ลำดับการตรวจสำคัญ — ถ้าเช็คที่อยู่ผู้ส่งก่อนประเภทออเดอร์
    // ร้านขายของดิจิทัลจะเจอข้อความเตือนทุกออเดอร์ทั้งที่ไม่เกี่ยวกับตัวเองเลย
    const r = checkEligibility(
      { ...shippableOrder, type: "DIGITAL" },
      { senderAddress: {} },
    );
    expect(r).toMatchObject({ eligible: false, kind: "SKIP_SILENT" });
  });
});

describe("checkEligibility — ต้องแจ้งให้แก้ พร้อมบอกช่องที่ขาด", () => {
  it("ร้านยังไม่ตั้งที่อยู่ผู้ส่ง", () => {
    const r = checkEligibility(shippableOrder, { senderAddress: {} });
    expect(r).toMatchObject({ eligible: false, kind: "NEEDS_FIX" });
    if (r.eligible === false && r.kind === "NEEDS_FIX") {
      expect(r.missing.length).toBeGreaterThan(0);
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
    expect(r).toMatchObject({ eligible: false, kind: "NEEDS_FIX" });
    if (r.eligible === false && r.kind === "NEEDS_FIX") {
      expect(r.missing).toEqual(["ตำบล", "รหัสไปรษณีย์"]);
    }
  });

  it("ไม่มีเบอร์ผู้รับ", () => {
    const r = checkEligibility({ ...shippableOrder, buyerContact: null }, account);
    expect(r).toMatchObject({ eligible: false, kind: "NEEDS_FIX" });
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
    expect(r).toMatchObject({ eligible: false, kind: "NEEDS_FIX" });
    if (r.eligible === false && r.kind === "NEEDS_FIX") {
      expect(r.missing).toContain("จังหวัด");
    }
  });
});
