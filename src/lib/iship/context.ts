// feature 00022 — สัญญาร่วมของ "ส่วนการจัดส่ง" ที่ใช้ทั้งหน้าคำสั่งซื้อและโมดัลในแชท
//
// ไฟล์นี้ pure ไม่ import prisma/session โดยเจตนา — client component ต้อง import type
// ชุดนี้ได้โดยไม่ลาก server module ติดไปด้วย
//
// มี 2 รูปเพราะ Date ข้ามขอบเขต RSC/HTTP ไม่ได้:
//   ShipmentContext      — ฝั่ง server (Date จริง) คืนจาก getShipmentPanel()
//   ShipmentContextJson  — ฝั่ง client (ISO string) ส่งผ่าน prop หรือ API
// แปลงด้วย toShipmentContextJson() ที่เดียว — เดิมหน้าคำสั่งซื้อ map ทีละ field ใน JSX
// ซึ่งพอมีที่ใช้จุดที่สองก็จะลอกไปทั้งก้อนแล้วลืม field ใหม่ที่เพิ่มทีหลัง

import type {
  MissingReceiverField,
  MissingSenderField,
  SenderAddress,
} from "./mapping";

/** สินค้า 1 บรรทัดในบล็อก "ตรวจก่อนสร้างพัสดุ" — อ่านอย่างเดียว ไม่ใช่ตัวแก้ออเดอร์ */
export interface ShipmentReviewItem {
  id: string;
  name: string;
  qty: number;
  price: number;
}

export interface ReceiverData {
  name: string | null;
  phone: string | null;
  line1: string | null;
  /** ตำบล/แขวง — ไม่ใช่ dst_district ของ iShip โดยตรง (BR-ISHIP-31) */
  subdistrict: string | null;
  /** อำเภอ/เขต */
  district: string | null;
  province: string | null;
  postcode: string | null;
}

/** ค่าตั้งต้นพัสดุของร้าน — เติมฟอร์ม ร้านแก้รายใบได้ ไม่กระทบค่าที่ตั้งไว้ */
export interface ParcelDefaults {
  courierCode: string | null;
  weight: number | null;
  width: number | null;
  length: number | null;
  height: number | null;
  categoryId: number | null;
  codEnabled: boolean;
  remark: string | null;
  optOnTime: boolean;
  optBoxShield: boolean;
  optIsInsured: boolean;
  optProductValue: number | null;
}

/** สิ่งกีดขวางระดับร้าน — แก้ที่หน้าตั้งค่าเท่านั้น กรอกในโมดัลไม่ช่วย */
export interface ShipmentBlocker {
  kind: "SENDER";
  missing: MissingSenderField[];
}

interface ShipmentContextBase {
  orderId: string;
  createMode: string;
  blockedBy: ShipmentBlocker | null;
  /** ช่องผู้รับที่ขาด — กรอกแก้ได้ตรงจุดที่สร้างพัสดุ */
  missingReceiver: MissingReceiverField[];
  receiver: ReceiverData;
  /** ที่อยู่ผู้ส่งจากการตั้งค่าร้าน — โชว์ให้ตรวจก่อนกดสร้าง แก้ในฟอร์มนี้ไม่ได้ */
  sender: SenderAddress;
  /** สินค้าในคำสั่งซื้อ — ให้ร้านกวาดตาว่ากำลังส่งของถูกใบ */
  items: ShipmentReviewItem[];
  /**
   * ยอดที่ต้องเก็บปลายทาง — มีค่าเมื่อคำสั่งซื้อนี้จ่ายแบบ COD เท่านั้น
   *
   * แยกจาก defaults.codEnabled (ค่าตั้งต้นของร้านว่า "เปิดใช้ COD ไหม") เพราะคนละเรื่องกัน:
   * ร้านอาจเปิด COD ไว้ แต่ใบนี้ลูกค้าโอนมาแล้ว — ถ้าเติมยอดให้จะกลายเป็นเก็บเงินซ้ำ
   */
  codSuggested: number;
  defaults: ParcelDefaults;
}

export interface ShipmentViewJson {
  id: string;
  orderId: string;
  status: string;
  /** "CREATED" = Deep เปิดใบนี้เอง | "LINKED" = ผูกใบที่ร้านเปิดไว้บน iShip เข้ามา */
  source: string;
  courierCode: string | null;
  courierName: string | null;
  trackingNo: string | null;
  carrierStatus: string | null;
  carrierStatusText: string | null;
  carrierStatusAt: string | null;
  /**
   * เวลาของ "ขากลับ" — แถวที่ 2 ของแถบสถานะอ่านจากสองช่องนี้ (2026-08-25)
   * `null` = ขนส่งไม่ได้แจ้งเวลา **ไม่ใช่ "ไม่เกิด"** — จุดสว่างตัดสินจาก `carrierStatus`
   */
  returnStartedAt: string | null;
  returnedAt: string | null;
  isOverWeight: boolean;
  isOverSize: boolean;
  labelPrintedAt: string | null;
  labelPrintCount: number;
  isDryRun: boolean;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  /** ข้อมูลพัสดุที่ถูกส่งไปจริง — ให้ร้านตรวจย้อนได้ว่าเปิดใบนี้ด้วยค่าอะไร */
  weight: number | null;
  width: number | null;
  length: number | null;
  height: number | null;
  codAmount: number;
  createdAt: string;
  /**
   * ข้อความเรื่องวิธีชำระเงินที่ต้องบอกร้านทันทีหลังเปิด/ผูกพัสดุ (ส่วนขยาย 2026-08-06)
   *   changed — พัสดุเก็บเงินปลายทางแต่คำสั่งซื้อไม่ได้บอก ระบบแก้ให้แล้ว
   *   warning — คำสั่งซื้อบอกว่าเก็บปลายทางแต่พัสดุไม่ได้เปิดแบบนั้น ร้านต้องไปแก้เอง
   * มีเฉพาะในคำตอบของการสร้าง/ผูกครั้งนั้น — ไม่ได้เก็บลงฐาน
   */
  paymentNotice?: { kind: "changed" | "warning"; message: string } | null;
}

/** รูปที่ service คืน — Date ยังเป็น Date */
export interface ShipmentContext extends ShipmentContextBase {
  shipment: ShipmentViewDates | null;
}

/** รูปที่ client ใช้ — Date เป็น ISO string แล้ว */
export interface ShipmentContextJson extends ShipmentContextBase {
  shipment: ShipmentViewJson | null;
}

type ShipmentViewDates = Omit<
  ShipmentViewJson,
  "carrierStatusAt" | "labelPrintedAt" | "createdAt" | "returnStartedAt" | "returnedAt"
> & {
  carrierStatusAt: Date | null;
  returnStartedAt: Date | null;
  returnedAt: Date | null;
  labelPrintedAt: Date | null;
  createdAt: Date;
};

export function toShipmentViewJson(s: ShipmentViewDates): ShipmentViewJson {
  return {
    ...s,
    carrierStatusAt: s.carrierStatusAt?.toISOString() ?? null,
    returnStartedAt: s.returnStartedAt?.toISOString() ?? null,
    returnedAt: s.returnedAt?.toISOString() ?? null,
    labelPrintedAt: s.labelPrintedAt?.toISOString() ?? null,
    createdAt: s.createdAt.toISOString(),
  };
}

export function toShipmentContextJson(ctx: ShipmentContext): ShipmentContextJson {
  return {
    ...ctx,
    shipment: ctx.shipment ? toShipmentViewJson(ctx.shipment) : null,
  };
}
