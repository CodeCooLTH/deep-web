// feature 00084 — แปลงข้อมูลฝั่ง Deep เป็น params ของ Flash (TFR-FLASH-008) ฟังก์ชัน pure ไม่แตะ DB/เครือข่าย
//
// 🛑 [BLOCKER] ตำบล -> *DistrictName · อำเภอ -> *CityName (ทั้งผู้ส่งและผู้รับ)
// ชื่อ "district" ของ Deep หมายถึงอำเภอ แต่ของ Flash `DistrictName` คือตำบล — สลับสองช่องนี้
// ไม่มี type error และพัสดุจะโดนตีกลับด้วย 1004/1005 เงียบ ๆ (mapping.test.ts มี mutation proof)

import { MOBILE_PHONE_RE } from "@/lib/phone";
import {
  findMissingReceiverFields,
  findMissingSenderFields,
  isValidCategoryId,
  type DeepAddress,
  type MissingParcelField,
  type SenderAddress,
} from "@/lib/iship/mapping";
import { FLASH_LIMITS, FLASH_PROVINCE_TABLE } from "./constants";
import { FlashServiceError } from "./errors";
import { bahtToSatang, kgToGram } from "./units";

const POSTCODE_RE = /^\d{5}$/;
const OTHER_ITEMS_NAME = "สินค้าอื่น ๆ";

export interface FlashCodItem {
  itemName: string;
  itemQuantity: number;
}

/** จังหวัดผ่านตารางจุดเดียว (P0-4) — ห้ามใช้ normalizeProvince ของ iShip (สะกด กทม. คนละทาง) */
export function normalizeFlashProvince(v?: string | null): string {
  const s = (v ?? "").trim();
  return FLASH_PROVINCE_TABLE[s] ?? s;
}

/** `F<orderId ไม่มี ->A<รอบ>` ตัวอักษร+ตัวเลขล้วน ≤64 (P0-5) */
export function buildFlashOutTradeNo(orderId: string, attempt: number): string {
  const id = orderId.replace(/[^A-Za-z0-9]/g, "");
  if (!id || !Number.isInteger(attempt) || attempt < 0) {
    throw new FlashServiceError("INVALID_INPUT", "รหัสออเดอร์หรือรอบไม่ถูกต้อง");
  }
  const s = `F${id}A${attempt}`;
  if (s.length > FLASH_LIMITS.outTradeNoMax) throw new FlashServiceError("INVALID_INPUT", "รหัสออเดอร์ยาวเกินไป");
  return s;
}

/** พับรายการ COD ให้ไม่เกิน 10: 9 รายการแรกตามเดิม + "สินค้าอื่น ๆ" = ผลรวมที่เหลือ */
export function foldCodItems(items: { name: string; qty: number }[] | null | undefined): FlashCodItem[] {
  if (!items?.length) throw new FlashServiceError("INCOMPLETE_DATA", "ออเดอร์เก็บเงินปลายทางต้องมีรายการสินค้า", ["รายการสินค้า"]);
  const max = FLASH_LIMITS.itemQuantityMax;
  const norm = items.map((i) => ({ name: i.name?.trim() || "สินค้า", qty: i.qty }));
  for (const i of norm) {
    if (!Number.isInteger(i.qty) || i.qty < 1) throw new FlashServiceError("INVALID_INPUT", `จำนวนสินค้า "${i.name}" ไม่ถูกต้อง`);
    if (i.qty > max) throw new FlashServiceError("INVALID_INPUT", `จำนวนสินค้า "${i.name}" เกิน ${max} ชิ้น Flash รับไม่ได้`);
  }
  const cap = FLASH_LIMITS.codItemsMax;
  let out = norm;
  if (norm.length > cap) {
    const rest = norm.slice(cap - 1).reduce((s, i) => s + i.qty, 0);
    if (rest > max) throw new FlashServiceError("INVALID_INPUT", `จำนวนรวมของ "${OTHER_ITEMS_NAME}" เกิน ${max} ชิ้น`);
    out = [...norm.slice(0, cap - 1), { name: OTHER_ITEMS_NAME, qty: rest }];
  }
  return out.map((i) => ({ itemName: i.name, itemQuantity: i.qty }));
}

/** ตรวจเฉพาะ weight>0 และหมวด (ขนาดไม่บังคับกับ Flash) */
export function findMissingFlashParcelFields(p: { categoryId?: number | null; weight?: number | null }): MissingParcelField[] {
  const m: MissingParcelField[] = [];
  if (p.categoryId == null || !isValidCategoryId(p.categoryId)) m.push("ประเภทสินค้า");
  if (p.weight == null || !(p.weight > 0)) m.push("น้ำหนัก");
  return m;
}

export interface BuildFlashCreateInput {
  outTradeNo: string;
  sender: SenderAddress;
  receiver: { name: string; phone: string; address: DeepAddress };
  parcel: { weight: number; width?: number | null; length?: number | null; height?: number | null; categoryId: number };
  /** บาท; 0/ว่าง = ไม่เก็บ */
  codAmount?: number | null;
  items?: { name: string; qty: number }[];
  remark?: string | null;
  options?: { onTime?: boolean; boxShield?: boolean; isInsured?: boolean; productValue?: number | null };
}

export type FlashParams = Record<string, string | number>;

const digits = (s?: string | null) => (s ?? "").replace(/[\s-]/g, "");

function addressParams(prefix: "src" | "dst", a: { name: string; phone: string; line: string; sub: string; dist: string; prov: string; zip: string }): FlashParams {
  return {
    [`${prefix}Name`]: a.name.trim(),
    [`${prefix}Phone`]: digits(a.phone),
    [`${prefix}ProvinceName`]: normalizeFlashProvince(a.prov),
    [`${prefix}CityName`]: a.dist.trim(), // อำเภอ
    [`${prefix}DistrictName`]: a.sub.trim(), // ตำบล
    [`${prefix}PostalCode`]: a.zip.trim(),
    [`${prefix}DetailAddress`]: a.line.trim(),
  };
}

export function buildCreateOrderParams(input: BuildFlashCreateInput): FlashParams {
  const { sender, receiver, parcel, options } = input;
  const missing: string[] = [
    ...findMissingSenderFields(sender),
    ...findMissingReceiverFields(receiver.address, receiver.name, receiver.phone),
    ...findMissingFlashParcelFields(parcel),
  ];
  if (!MOBILE_PHONE_RE.test(digits(sender.phone)) && !missing.includes("เบอร์โทรผู้ส่ง")) missing.push("เบอร์โทรผู้ส่ง");
  if (!MOBILE_PHONE_RE.test(digits(receiver.phone)) && !missing.includes("เบอร์โทรผู้รับ")) missing.push("เบอร์โทรผู้รับ");
  if (!POSTCODE_RE.test((sender.postcode ?? "").trim()) && !missing.includes("รหัสไปรษณีย์ (ผู้ส่ง)")) missing.push("รหัสไปรษณีย์ (ผู้ส่ง)");
  if (!POSTCODE_RE.test((receiver.address.postcode ?? "").trim()) && !missing.includes("รหัสไปรษณีย์")) missing.push("รหัสไปรษณีย์");
  if (missing.length) throw new FlashServiceError("INCOMPLETE_DATA", `ข้อมูลไม่ครบหรือไม่ถูกต้อง: ${missing.join(", ")}`, missing);

  const a = receiver.address;
  const p: FlashParams = {
    outTradeNo: input.outTradeNo,
    expressCategory: options?.onTime ? 2 : 1,
    ...addressParams("src", {
      name: sender.name!, phone: sender.phone!, line: sender.address!,
      sub: sender.subdistrict!, dist: sender.district!, prov: sender.province!, zip: sender.postcode!,
    }),
    ...addressParams("dst", {
      name: receiver.name, phone: receiver.phone, line: a.line1!,
      sub: a.subdistrict!, dist: a.district!, prov: a.province!, zip: a.postcode!,
    }),
    articleCategory: parcel.categoryId,
    weight: kgToGram(parcel.weight),
  };
  const dims = [parcel.width, parcel.length, parcel.height];
  if (dims.every((d) => d != null && d > 0)) {
    // Flash รับ ซม. เป็นจำนวนเต็ม แต่ร้านเก็บทศนิยมได้ — ปัดขึ้น (ขนส่งคิดราคาตามขนาด ปัดลง = ราคาต่ำกว่าจริง)
    p.width = Math.ceil(parcel.width!); p.length = Math.ceil(parcel.length!); p.height = Math.ceil(parcel.height!);
  }

  p.insured = options?.isInsured ? 1 : 0;
  if (options?.isInsured) {
    const v = options.productValue;
    if (v == null || !(v > 0)) throw new FlashServiceError("INCOMPLETE_DATA", "เลือกประกันพัสดุต้องระบุมูลค่าสินค้า", ["มูลค่าสินค้า"]);
    p.insureDeclareValue = bahtToSatang(v);
  }
  if (options?.boxShield) p.opdInsureEnabled = 1;

  const cod = input.codAmount ?? 0;
  if (cod < 0) throw new FlashServiceError("INVALID_INPUT", "ยอดเก็บเงินปลายทางติดลบไม่ได้");
  p.codEnabled = cod > 0 ? 1 : 0; // ส่งทุกครั้ง
  if (cod > 0) {
    p.codAmount = bahtToSatang(cod);
    p.subItemTypes = JSON.stringify(foldCodItems(input.items));
  }
  const remark = input.remark?.trim();
  if (remark) p.remark = remark.slice(0, FLASH_LIMITS.remarkMax);
  return p;
}

export interface BuildFlashEstimateInput {
  sender: Pick<SenderAddress, "province" | "district" | "postcode">;
  receiver: Pick<DeepAddress, "province" | "district" | "postcode">;
  /** กก. */
  weight: number;
  width?: number | null;
  length?: number | null;
  height?: number | null;
  pricingTable?: 0 | 1;
}

export function buildEstimateParams(i: BuildFlashEstimateInput): FlashParams {
  const bad: string[] = [];
  if (!POSTCODE_RE.test((i.sender.postcode ?? "").trim())) bad.push("รหัสไปรษณีย์ (ผู้ส่ง)");
  if (!POSTCODE_RE.test((i.receiver.postcode ?? "").trim())) bad.push("รหัสไปรษณีย์");
  if (!(i.weight > 0)) bad.push("น้ำหนัก");
  if (bad.length) throw new FlashServiceError("INCOMPLETE_DATA", `ข้อมูลไม่ครบหรือไม่ถูกต้อง: ${bad.join(", ")}`, bad);
  const p: FlashParams = {
    srcProvinceName: normalizeFlashProvince(i.sender.province),
    srcCityName: (i.sender.district ?? "").trim(), // อำเภอ
    srcPostalCode: i.sender.postcode!.trim(),
    dstProvinceName: normalizeFlashProvince(i.receiver.province),
    dstCityName: (i.receiver.district ?? "").trim(),
    dstPostalCode: i.receiver.postcode!.trim(),
    weight: kgToGram(i.weight),
    pricingTable: i.pricingTable ?? 0,
  };
  if ([i.width, i.length, i.height].every((d) => d != null && d > 0)) {
    p.width = Math.ceil(i.width!); p.length = Math.ceil(i.length!); p.height = Math.ceil(i.height!);
  }
  return p;
}
