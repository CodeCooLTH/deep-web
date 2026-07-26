// feature 00022 — แปลงข้อมูลของ Deep เป็น payload ของ iShip
//
// ==========================================================================
// จุดที่พลาดง่ายที่สุดของฟีเจอร์นี้ทั้งฟีเจอร์ (BR-ISHIP-31)
// --------------------------------------------------------------------------
// คำว่า "district" ของสองระบบหมายถึง "คนละระดับการปกครอง":
//
//   Deep  shippingAddress.subdistrict = ตำบล/แขวง   →  iShip  dst_district
//   Deep  shippingAddress.district    = อำเภอ/เขต    →  iShip  dst_amphure
//
// ถ้าจับคู่ตามชื่อฟิลด์ (district → dst_district) พัสดุจะถูกส่งผิดตำบล "ทั้งระบบ"
// โดยไม่มีอะไรฟ้องเลย เพราะ payload ผ่าน validation ทุกด่านและ iShip ก็รับ
//
// ความหมายฝั่ง Deep ยืนยันจากโค้ดจริง 3 จุด:
//   - ป้ายช่องกรอก: orders/new/components/CartPanel.tsx (ตำบล/แขวง กับ อำเภอ/เขต)
//   - ตัวแปลงตอนเลือกที่อยู่: AddressSearchPanel.tsx → { subdistrict: r.district (ตำบล),
//     district: r.amphoe (อำเภอ) }
//   - บรรทัดแสดงผล: "ต.{subdistrict} · อ.{district}"
//
// การจับคู่คู่นี้มี unit test คุมโดยเฉพาะ (mapping.test.ts) และเป็น blocker
// ==========================================================================

import type { IShipCreateOrderPayload } from "./client";

/** หมวดพัสดุตามที่ iShip กำหนด — ใช้เป็น dropdown ในหน้าตั้งค่า */
export const ISHIP_CATEGORIES: { id: number; label: string }[] = [
  { id: 0, label: "เอกสาร" },
  { id: 1, label: "อาหารแห้ง" },
  { id: 2, label: "ของใช้" },
  { id: 3, label: "อุปกรณ์ไอที" },
  { id: 4, label: "เสื้อผ้า" },
  { id: 5, label: "สื่อบันเทิง" },
  { id: 6, label: "อะไหล่รถยนต์" },
  { id: 7, label: "รองเท้า/กระเป๋า" },
  { id: 8, label: "อุปกรณ์กีฬา" },
  { id: 9, label: "เครื่องสำอาง" },
  { id: 10, label: "เฟอร์นิเจอร์" },
  { id: 11, label: "ผลไม้" },
  { id: 99, label: "อื่น ๆ" },
];

export function isValidCategoryId(id: number): boolean {
  return ISHIP_CATEGORIES.some((c) => c.id === id);
}

/** ที่อยู่ฝั่ง Deep — รูปเดียวกับ Order.shippingAddress (order.service.ts) */
export interface DeepAddress {
  line1?: string | null;
  subdistrict?: string | null; // ตำบล/แขวง
  district?: string | null; // อำเภอ/เขต
  province?: string | null;
  postcode?: string | null;
  note?: string | null;
}

/** ที่อยู่ผู้ส่งจาก ShopShippingAccount — ชื่อฟิลด์ล้อ DeepAddress เพื่อลดโอกาสหยิบผิด */
export interface SenderAddress {
  name?: string | null;
  phone?: string | null;
  address?: string | null;
  subdistrict?: string | null; // ตำบล/แขวง
  district?: string | null; // อำเภอ/เขต
  province?: string | null;
  postcode?: string | null;
}

/** ช่องที่อยู่ที่ขาด — ใช้บอกร้านว่าต้องไปเติมอะไร (FR-ISHIP-023) */
export type MissingAddressField =
  | "ชื่อผู้รับ"
  | "เบอร์โทรผู้รับ"
  | "ที่อยู่"
  | "ตำบล"
  | "อำเภอ"
  | "จังหวัด"
  | "รหัสไปรษณีย์";

const isBlank = (v?: string | null): boolean => !v || v.trim() === "";

/**
 * findMissingReceiverFields — ตรวจว่าที่อยู่ผู้รับพอส่งไหม
 *
 * คืน "รายการช่องที่ขาด" ไม่ใช่ boolean — เพราะ FR-ISHIP-023 บังคับว่าต้องบอกร้าน
 * ให้ได้ว่าขาดช่องไหน ไม่ใช่บอกรวม ๆ ว่า "ข้อมูลไม่ครบ" แล้วให้ร้านไปไล่หาเอง
 */
export function findMissingReceiverFields(
  addr: DeepAddress | null | undefined,
  receiverName?: string | null,
  receiverPhone?: string | null,
): MissingAddressField[] {
  const missing: MissingAddressField[] = [];
  if (isBlank(receiverName)) missing.push("ชื่อผู้รับ");
  if (isBlank(receiverPhone)) missing.push("เบอร์โทรผู้รับ");
  if (isBlank(addr?.line1)) missing.push("ที่อยู่");
  if (isBlank(addr?.subdistrict)) missing.push("ตำบล");
  if (isBlank(addr?.district)) missing.push("อำเภอ");
  if (isBlank(addr?.province)) missing.push("จังหวัด");
  if (isBlank(addr?.postcode)) missing.push("รหัสไปรษณีย์");
  return missing;
}

/** ตรวจที่อยู่ผู้ส่งของร้าน (BR-ISHIP-30) — ต้องครบก่อนเปิดใช้งานการสร้างพัสดุ */
export function findMissingSenderFields(
  sender: SenderAddress | null | undefined,
): MissingAddressField[] {
  const missing: MissingAddressField[] = [];
  if (isBlank(sender?.name)) missing.push("ชื่อผู้รับ");
  if (isBlank(sender?.phone)) missing.push("เบอร์โทรผู้รับ");
  if (isBlank(sender?.address)) missing.push("ที่อยู่");
  if (isBlank(sender?.subdistrict)) missing.push("ตำบล");
  if (isBlank(sender?.district)) missing.push("อำเภอ");
  if (isBlank(sender?.province)) missing.push("จังหวัด");
  if (isBlank(sender?.postcode)) missing.push("รหัสไปรษณีย์");
  return missing;
}

export interface BuildPayloadInput {
  /** "<orderId>:<attemptGroup>" — ส่งเป็น custom_order_id เพื่อสอบทานย้อนกลับ (BR-ISHIP-25) */
  idempotencyKey: string;
  courierCode: string;
  sender: SenderAddress;
  receiver: {
    name: string;
    phone: string;
    address: DeepAddress;
  };
  parcel: {
    weight: number;
    width: number;
    length: number;
    height: number;
    categoryId: number;
  };
  /** ยอดเก็บเงินปลายทาง — 0 = ไม่เก็บ */
  codAmount: number;
  remark?: string | null;
  options?: {
    onTime?: boolean;
    boxShield?: boolean;
    isInsured?: boolean;
    productValue?: number | null;
    serviceType?: number | null;
  };
  /** รายการสินค้าในกล่อง — iShip ใช้ประกอบการเคลมประกันและตรวจ COD */
  items?: {
    name: string;
    qty: number;
    price: number;
  }[];
}

/**
 * buildCreateOrderPayload — ประกอบ payload ส่งให้ iShip
 *
 * ตัวเลือกเสริมเป็น optional ทั้งหมด: iShip ถือว่า "ไม่ส่งมา = ไม่เปิดใช้"
 * เราจึงส่งเฉพาะตัวที่เปิดจริง แทนที่จะส่ง 0 ไปทุกตัว — payload เล็กลงและ
 * ไม่ไปทับค่าตั้งต้นฝั่ง iShip ของร้านโดยไม่ตั้งใจ (โดยเฉพาะ service_type
 * ที่เอกสารระบุว่า "ถ้าไม่ส่งค่าไป จะอ้างอิงจากการตั้งค่าในระบบ")
 */
export function buildCreateOrderPayload(
  input: BuildPayloadInput,
): IShipCreateOrderPayload {
  const { sender, receiver, parcel, options } = input;

  const payload: IShipCreateOrderPayload = {
    platform_name: "Deep",
    courier_code: input.courierCode,
    custom_order_id: input.idempotencyKey,

    src_name: sender.name ?? "",
    src_phone: sender.phone ?? "",
    src_address: sender.address ?? "",
    // BR-ISHIP-31 — อ่านหัวไฟล์ก่อนแก้บรรทัดคู่นี้
    src_district: sender.subdistrict ?? "", // ตำบล → district
    src_amphure: sender.district ?? "", //      อำเภอ → amphure
    src_province: sender.province ?? "",
    src_zipcode: sender.postcode ?? "",

    dst_name: receiver.name,
    dst_phone: receiver.phone,
    dst_address: receiver.address.line1 ?? "",
    // BR-ISHIP-31 — อ่านหัวไฟล์ก่อนแก้บรรทัดคู่นี้
    dst_district: receiver.address.subdistrict ?? "", // ตำบล → district
    dst_amphure: receiver.address.district ?? "", //      อำเภอ → amphure
    dst_province: receiver.address.province ?? "",
    dst_zipcode: receiver.address.postcode ?? "",

    weight: parcel.weight,
    width: parcel.width,
    length: parcel.length,
    height: parcel.height,
    cod_amount: input.codAmount,
    category_id: parcel.categoryId,
  };

  const remark = input.remark?.trim();
  if (remark) payload.remark = remark;

  if (options?.onTime) payload.on_time = 1;
  if (options?.boxShield) payload.box_shield = 1;
  if (options?.isInsured) {
    payload.is_insured = 1;
    // product_value มีความหมายเฉพาะเมื่อซื้อประกัน — ส่งเดี่ยว ๆ ไปก็ไม่มีผล
    if (options.productValue != null) payload.product_value = options.productValue;
  }
  if (options?.serviceType != null) payload.service_type = options.serviceType;

  // products[] — iShip ระบุว่าใช้ "กรณีเก็บเงินปลายทาง" แต่ส่งไปด้วยเสมอเมื่อมีข้อมูล
  // เพราะเป็นหลักฐานว่าในกล่องมีอะไร ใช้ตอนเคลมประกันได้ และไม่มีผลเสียเมื่อไม่ใช่ COD
  const items = input.items;
  if (items?.length) {
    const qtyTotal = Math.max(1, totalQty(items));
    payload.products = items.map((it) => ({
      product_name: it.name,
      // ขนาดรายชิ้น: เราไม่ได้เก็บขนาดต่อสินค้า จึงใช้ขนาดกล่องเป็นตัวแทน
      // ส่ง "0" จะทำให้ข้อมูลดูเหมือนของไม่มีมิติ ซึ่งชวนให้ขนส่งตีความผิดกว่า
      product_length: String(parcel.length),
      product_width: String(parcel.width),
      product_height: String(parcel.height),
      // น้ำหนักต่อชิ้น = น้ำหนักรวม ÷ จำนวนชิ้นทั้งหมด (ประมาณการ — เราไม่เก็บรายชิ้น)
      product_weight: roundTo(parcel.weight / qtyTotal, 3),
      product_qty: it.qty,
      product_price: it.price,
    }));
  }

  return payload;
}

function totalQty(items: { qty: number }[]): number {
  return items.reduce((sum, it) => sum + it.qty, 0);
}

function roundTo(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round((n + Number.EPSILON) * f) / f;
}

/**
 * buildIdempotencyKey — คีย์กันเปิดพัสดุซ้ำ (BR-ISHIP-22/26)
 *
 * attemptGroup เพิ่มขึ้น "เฉพาะเมื่อยกเลิกใบเดิม" เท่านั้น
 * การกดลองใหม่จากใบที่ FAILED ต้องใช้คีย์เดิม — เพื่อว่าถ้าคำขอเดิมสำเร็จฝั่ง iShip
 * แต่คำตอบหายกลางทาง การยิงซ้ำจะไปชน unique constraint แทนที่จะเปิดพัสดุใบที่สอง
 */
export function buildIdempotencyKey(orderId: string, attemptGroup: number): string {
  return `${orderId}:${attemptGroup}`;
}
