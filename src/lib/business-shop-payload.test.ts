import { describe, expect, it } from "vitest";
import { buildCreateBusinessShopPayload } from "./business-shop-payload";
import { verticalRequiresStorefrontLocation } from "./lodging";

/**
 * เทสชุดนี้ปักหมุดบั๊กจริงบน prod 2026-08-14: ผู้ใช้กรอก URL ร้าน (slug) ครบจนขั้นตรวจทาน
 * โชว์ `deepthailand.app/b/{slug}` แล้ว แต่ `onSubmit` ไม่ได้ใส่ `slug` ลง body ที่ยิงไป
 * `POST /api/business/shops` เลย ⇒ เข้า /shop แล้วการ์ด "ตั้ง URL หน้าร้าน" ยังว่าง
 *
 * ที่หายไปพร้อมกันจากจุดเดียวกัน: logo / address / latitude / longitude
 * ผลจริงจากฐาน prod ณ วันที่พบ: ร้าน BUSINESS 4 ใบ **ไม่มีใบไหนมีพิกัดเลยสักใบ** ทั้งที่
 * 2 ใบเป็น SERVICE_QUEUE ซึ่งวิซาร์ด **บังคับ** ปักหมุดก่อนกดถัดไปได้
 *
 * mutation ที่เทสชุดนี้ต้องจับได้ (พิสูจน์แล้วทีละข้อ):
 *   1. ลบ `payload.slug = slug` ออก
 *   2. ลบ `payload.logo = logo` ออก
 *   3. ลบทั้งบล็อก `if (verticalRequiresStorefrontLocation(...))` ออก
 *   4. เปลี่ยน lat/lng จาก "ต้องมาคู่กัน" เป็น "ส่งตัวไหนก็ได้ที่มี"
 *   5. ส่ง address/พิกัดของร้านขายออนไลน์ไปด้วย (ค่าค้างจากตอนย้อนกลับไปเปลี่ยน vertical)
 */

const base = {
  shopName: "MetaReview",
  businessType: "INDIVIDUAL",
  vertical: "ONLINE_SALES",
  categories: ["electronics"],
  description: "Meta Review Account",
};

describe("buildCreateBusinessShopPayload", () => {
  it("[blocker] ส่ง slug ที่ผู้ใช้กรอกไปด้วยเสมอ — บั๊ก 2026-08-14 ทิ้งคีย์นี้ไปทั้งดุ้น", () => {
    const payload = buildCreateBusinessShopPayload({ ...base, slug: "metareview" });
    expect(payload.slug).toBe("metareview");
  });

  it("[blocker] ส่ง logo ที่อัปโหลดสำเร็จไปด้วย", () => {
    const payload = buildCreateBusinessShopPayload({ ...base, logo: "file_abc123" });
    expect(payload.logo).toBe("file_abc123");
  });

  it("[blocker] ร้านที่ต้องมีหน้าร้านจริง ต้องส่งทั้งที่อยู่และพิกัด", () => {
    const payload = buildCreateBusinessShopPayload({
      ...base,
      vertical: "SERVICE_QUEUE",
      slug: "bt-premium",
      address: "123 ถ.สุขสวัสดิ์ กรุงเทพฯ",
      latitude: 13.65,
      longitude: 100.5,
    });
    expect(payload.address).toBe("123 ถ.สุขสวัสดิ์ กรุงเทพฯ");
    expect(payload.latitude).toBe(13.65);
    expect(payload.longitude).toBe(100.5);
  });

  it("[blocker] บ้านพักก็ต้องส่งพิกัดเหมือนกัน ไม่ใช่เฉพาะคิวงาน", () => {
    const payload = buildCreateBusinessShopPayload({
      ...base,
      vertical: "LODGING",
      address: "9 หมู่ 3 เขาใหญ่",
      latitude: 14.44,
      longitude: 101.37,
    });
    expect(payload.latitude).toBe(14.44);
    expect(payload.longitude).toBe(101.37);
  });

  it("[blocker] ครบทุกคีย์ที่วิซาร์ดถาม — กันคีย์ใหม่หลุดตอนมีคนเพิ่มขั้นในอนาคต", () => {
    const payload = buildCreateBusinessShopPayload({
      shopName: "ร้านทดสอบ",
      businessType: "COMPANY",
      vertical: "LODGING",
      categories: ["hotel"],
      description: "คำอธิบาย",
      logo: "file_x",
      slug: "test-shop",
      address: "ที่อยู่",
      latitude: 13,
      longitude: 100,
    });
    expect(Object.keys(payload).sort()).toEqual(
      [
        "address",
        "businessType",
        "categories",
        "description",
        "latitude",
        "logo",
        "longitude",
        "shopName",
        "slug",
        "vertical",
      ].sort(),
    );
  });

  it("lat/lng ต้องมาคู่กัน — มีตัวเดียวห้ามส่งทั้งคู่ (กติกาเดียวกับ XOR ใน /api/shops/update)", () => {
    const onlyLat = buildCreateBusinessShopPayload({
      ...base,
      vertical: "SERVICE_QUEUE",
      latitude: 13.65,
      longitude: null,
    });
    expect(onlyLat.latitude).toBeUndefined();
    expect(onlyLat.longitude).toBeUndefined();

    const onlyLng = buildCreateBusinessShopPayload({
      ...base,
      vertical: "SERVICE_QUEUE",
      latitude: null,
      longitude: 100.5,
    });
    expect(onlyLng.latitude).toBeUndefined();
    expect(onlyLng.longitude).toBeUndefined();
  });

  it("ร้านขายออนไลน์ไม่ส่งที่อยู่/พิกัด แม้มีค่าค้างในฟอร์มจากตอนย้อนกลับไปเปลี่ยนประเภท", () => {
    const payload = buildCreateBusinessShopPayload({
      ...base,
      vertical: "ONLINE_SALES",
      address: "ค่าค้างจากตอนเลือก SERVICE_QUEUE ไว้ก่อน",
      latitude: 13.65,
      longitude: 100.5,
    });
    expect(payload.address).toBeUndefined();
    expect(payload.latitude).toBeUndefined();
    expect(payload.longitude).toBeUndefined();
  });

  it("ไม่ยัดคีย์ที่ผู้ใช้ไม่ได้กรอก — สตริงว่าง/ช่องว่างล้วนต้องไม่ถูกส่ง", () => {
    const payload = buildCreateBusinessShopPayload({
      ...base,
      slug: "   ",
      logo: "",
    });
    expect("slug" in payload).toBe(false);
    expect("logo" in payload).toBe(false);
  });

  it("ตัดช่องว่างหัวท้ายของ slug ก่อนส่ง", () => {
    const payload = buildCreateBusinessShopPayload({ ...base, slug: "  metareview  " });
    expect(payload.slug).toBe("metareview");
  });
});

describe("verticalRequiresStorefrontLocation", () => {
  it("[blocker] ตอบตรงกับขั้น 'ที่ตั้งร้าน' ของวิซาร์ด — สองอย่างนี้แยกกันไม่ได้", () => {
    expect(verticalRequiresStorefrontLocation("SERVICE_QUEUE")).toBe(true);
    expect(verticalRequiresStorefrontLocation("LODGING")).toBe(true);
    expect(verticalRequiresStorefrontLocation("ONLINE_SALES")).toBe(false);
  });

  it("ค่าที่ไม่รู้จัก/ว่าง → ตกไป ONLINE_SALES (fail-closed ตาม resolveShopVertical)", () => {
    expect(verticalRequiresStorefrontLocation("")).toBe(false);
    expect(verticalRequiresStorefrontLocation(null)).toBe(false);
    expect(verticalRequiresStorefrontLocation("GENERAL")).toBe(false);
  });
});
