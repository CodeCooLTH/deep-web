/**
 * buildCreateBusinessShopPayload — ประกอบ body ของ `POST /api/business/shops` จากค่าในฟอร์ม
 * สร้างธุรกิจ (BusinessCreateModal)
 *
 * 🛑 ทำไมต้องเป็นฟังก์ชันแยกที่มีเทส ไม่ใช่ object literal ในตัว component:
 * บั๊กที่ user เจอ 2026-08-14 — `onSubmit` ประกอบ body ส่งไปแค่ 5 คีย์ (shopName/businessType/
 * vertical/categories/description) ส่วน `slug` `logo` `address` `latitude` `longitude` ที่ผู้ใช้
 * กรอกและ **ยืนยันผ่านหน้าจอไปแล้ว** ถูกทิ้งเงียบ ๆ ตั้งแต่ก่อนออกจากเบราว์เซอร์
 *
 * สิ่งที่ทำให้บั๊กนี้อยู่ได้นาน คือทุกชั้นที่เหลือ "ถูกต้อง" หมด:
 *   - วิซาร์ดบังคับกรอก slug + เช็คซ้ำจริงกับ /api/shops/check-slug + บล็อกปุ่มถัดไปจนกว่าจะผ่าน
 *   - ขั้นตรวจทานโชว์ `deepthailand.app/b/{slug}` ให้ผู้ใช้ดูเต็มตา
 *   - `CreateBusinessShopSchema` รับครบทุกคีย์ · `createBusinessShop()` เขียนลง DB ได้ทุกคอลัมน์
 *   - route แปลง P2002 บน slug เป็น 409 SLUG_TAKEN และ client ก็ดัก SLUG_TAKEN ไว้แล้ว
 * ⇒ `tsc` / build / เทส / grep ผ่านหมด เพราะไม่มีอะไร "ผิดชนิด" เลย สิ่งที่ขาดคือ *คีย์*
 * (docs/conventions/value-fate-decided-at-write-site.md — เห็นโค้ดส่งค่าเข้าไป ≠ ค่าถูกเก็บ)
 *
 * ⇒ กติกาของไฟล์นี้: ฟิลด์ใดที่ฟอร์มถามผู้ใช้ ต้องมีเทสที่ **แดงทันทีถ้าคีย์นั้นหลุดจาก payload**
 * เพิ่มช่องใหม่ในวิซาร์ดเมื่อไร ต้องเพิ่มทั้งที่นี่และในเทสด้วยเสมอ
 */

import { verticalRequiresStorefrontLocation } from "@/lib/lodging";

/** ค่าที่ฟอร์มสร้างธุรกิจถืออยู่ (mirror FormValues ของ BusinessCreateModal) */
export interface BusinessShopFormValues {
  shopName: string;
  businessType: string;
  vertical: string;
  categories?: (string | undefined)[];
  description?: string;
  logo?: string;
  slug?: string;
  address?: string;
  latitude?: number | null;
  longitude?: number | null;
}

/** body ที่ส่งจริง — คีย์ที่ไม่มีค่าจะ "ไม่ถูกใส่" ไม่ใช่ส่งค่าว่าง
 *
 *  ทำไมไม่ส่งค่าว่าง: `createBusinessShop()` ใช้ `...(data.x ? { x } : {})` อยู่แล้ว การส่ง
 *  สตริงว่างจึงไม่ต่างกันในทางผลลัพธ์ แต่ต่างกันตอนอ่าน log/debug — body ที่มีแต่คีย์ที่ผู้ใช้
 *  กรอกจริง บอกได้ทันทีว่าอะไรถูกถามและอะไรไม่ถูกถามในวิซาร์ดรอบนั้น
 */
export interface CreateBusinessShopPayload {
  shopName: string;
  businessType: string;
  vertical: string;
  categories: string[];
  description: string;
  logo?: string;
  slug?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
}

export function buildCreateBusinessShopPayload(
  values: BusinessShopFormValues,
): CreateBusinessShopPayload {
  const payload: CreateBusinessShopPayload = {
    shopName: values.shopName,
    businessType: values.businessType,
    vertical: values.vertical,
    categories: (values.categories ?? []).filter((c): c is string => typeof c === "string"),
    description: values.description ?? "",
  };

  const slug = values.slug?.trim();
  if (slug) payload.slug = slug;

  const logo = values.logo?.trim();
  if (logo) payload.logo = logo;

  // ที่อยู่/พิกัดส่งเฉพาะ vertical ที่วิซาร์ดถามจริง — ผูกกับ SSOT ตัวเดียวกับที่ `stepsFor()`
  // ใช้ตัดสินว่าจะมีขั้น "ที่ตั้งร้าน" ไหม ห้ามแยกเงื่อนไขกัน (นั่นคือรูปร่างของบั๊กเดิม)
  //
  // ร้านขายออนไลน์ที่เคยเลือก SERVICE_QUEUE ไว้ก่อนแล้วย้อนกลับไปเปลี่ยน จะมีค่าค้างใน
  // ฟอร์ม — ด่านนี้กันไม่ให้ค่าค้างนั้นถูกส่งไปด้วย
  if (verticalRequiresStorefrontLocation(values.vertical)) {
    const address = values.address?.trim();
    if (address) payload.address = address;

    // lat/lng ต้องมาคู่กันเสมอ — กติกาเดียวกับ XOR check ใน POST /api/shops/update
    // ห้ามส่งตัวเดียว และห้ามส่ง 0,0 แทน "ยังไม่ปักหมุด" (0,0 อยู่กลางอ่าวกินี และจะผ่าน
    // ด่าน `latitude != null` ของ service ไปเขียนลงฐานจริง)
    if (typeof values.latitude === "number" && typeof values.longitude === "number") {
      payload.latitude = values.latitude;
      payload.longitude = values.longitude;
    }
  }

  return payload;
}
