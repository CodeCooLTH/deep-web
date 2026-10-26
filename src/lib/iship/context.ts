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
import type { ParcelCloseBasis, ParcelCloseOutcome, ParcelCloseReason } from "../parcel-close";

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
   * 🛑 มาจาก `resolveDefaultCodAmount()` ตัวเดียวกับที่ `createShipment()` ใช้ตอนผู้ขาย
   * ไม่ได้กรอกยอดเอง — เลขที่ร้านเห็นบนฟอร์มกับเลขที่ยิงออกไปจริงต้องเป็นตัวเดียวกันเสมอ
   *
   * เดิมมีค่าตั้งต้นระดับร้าน (`defaultCodEnabled`) เป็นตัวตัดสินอีกทางหนึ่ง แล้วสองทางนั้น
   * ให้ผลไม่ตรงกัน: ร้านเปิด COD ไว้ แต่ใบนี้ลูกค้าโอนมาแล้ว → พัสดุถูกเปิดเป็นเก็บเงินซ้ำ
   * (บั๊กเงิน prod 2026-09-04) ค่าตั้งต้นระดับร้านจึงถูกถอดออกทั้งชุด
   */
  codSuggested: number;
  defaults: ParcelDefaults;
}

/** ร้านปิดพัสดุขาไปที่มีปัญหา (00085) — ฝั่งร้านเท่านั้น ห้ามส่งฟิลด์เหล่านี้ไปหน้าผู้ซื้อ (มีแค่ outcome) */
export interface ParcelCloseViewJson {
  closedAt: string; // ISO
  /** null = ไม่ทราบ/ถูกลบ → UI แสดง "ผู้ดูแลร้าน" */
  closedByName: string | null;
  reason: ParcelCloseReason;
  note: string | null;
  outcome: ParcelCloseOutcome;
  basis: ParcelCloseBasis;
  refunded: boolean | null;
  excludesRevenue: boolean;
}

export interface ShipmentViewJson {
  id: string;
  orderId: string;
  status: string;
  /** "CREATED" = Deep เปิดใบนี้เอง | "LINKED" = ผูกใบที่ร้านเปิดไว้บน iShip เข้ามา */
  source: string;
  /** ผู้ให้บริการของใบนี้: "ISHIP" | "FLASH" (00084) — UI เลือก base path/ตัวตัดสินปุ่มตามนี้ */
  provider: string;
  courierCode: string | null;
  courierName: string | null;
  trackingNo: string | null;
  carrierStatus: string | null;
  carrierStatusText: string | null;
  carrierStatusAt: string | null;
  /** "เคยมีปัญหาครั้งแรกเมื่อไร" — ตัวทำให้กอง "พัสดุมีปัญหา" ค้างเหนียว (2026-09-14) */
  problemAt: string | null;
  /**
   * เวลาของ "ขากลับ" — แถวที่ 2 ของแถบสถานะอ่านจากสองช่องนี้ (2026-08-25)
   * `null` = ขนส่งไม่ได้แจ้งเวลา **ไม่ใช่ "ไม่เกิด"** — จุดสว่างตัดสินจาก `carrierStatus`
   */
  returnStartedAt: string | null;
  returnedAt: string | null;
  returnDispatchedAt: string | null;
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
  /** null = ยังไม่ปิด (00085) */
  problemClose: ParcelCloseViewJson | null;
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
  | "carrierStatusAt"
  | "labelPrintedAt"
  | "createdAt"
  | "problemAt"
  | "returnStartedAt"
  | "returnedAt"
  | "returnDispatchedAt"
  | "problemClose"
> & {
  // คอลัมน์ problemClose* ดิบจาก OrderShipment (00085) — toShipmentViewJson ประกอบเป็น problemClose
  // problemClosedByName: ผู้เรียก resolve จาก user ถ้าทำได้ถูก ไม่งั้นไม่ส่ง = null
  problemClosedAt: Date | null;
  problemClosedByUserId?: string | null;
  problemClosedByName?: string | null;
  problemCloseReason: string | null;
  problemCloseNote: string | null;
  problemCloseOutcome: string | null;
  problemCloseBasis: string | null;
  problemCloseRefunded: boolean | null;
  problemCloseExcludesRevenue: boolean | null;
  carrierStatusAt: Date | null;
  problemAt: Date | null;
  returnStartedAt: Date | null;
  returnedAt: Date | null;
  returnDispatchedAt: Date | null;
  labelPrintedAt: Date | null;
  createdAt: Date;
};

export function toShipmentViewJson(input: ShipmentViewDates): ShipmentViewJson {
  // แยกคอลัมน์ดิบออก ไม่ให้รั่วเข้า JSON ที่ส่งถึง client (โดยเฉพาะ problemClosedByUserId)
  const {
    problemClosedAt,
    problemClosedByUserId: _byId,
    problemClosedByName,
    problemCloseReason,
    problemCloseNote,
    problemCloseOutcome,
    problemCloseBasis,
    problemCloseRefunded,
    problemCloseExcludesRevenue,
    ...s
  } = input;
  return {
    ...s,
    // CHECK ในฐาน: problemClosedAt null ⇔ outcome null — ใช้ทั้งสองเป็นด่านกัน cast พัง
    problemClose:
      problemClosedAt && problemCloseOutcome
        ? {
            closedAt: problemClosedAt.toISOString(),
            closedByName: problemClosedByName ?? null,
            reason: problemCloseReason as ParcelCloseReason,
            note: problemCloseNote ?? null,
            outcome: problemCloseOutcome as ParcelCloseOutcome,
            basis: problemCloseBasis as ParcelCloseBasis,
            refunded: problemCloseRefunded ?? null,
            excludesRevenue: problemCloseExcludesRevenue === true,
          }
        : null,
    carrierStatusAt: s.carrierStatusAt?.toISOString() ?? null,
    problemAt: s.problemAt?.toISOString() ?? null,
    returnStartedAt: s.returnStartedAt?.toISOString() ?? null,
    returnedAt: s.returnedAt?.toISOString() ?? null,
    returnDispatchedAt: s.returnDispatchedAt?.toISOString() ?? null,
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

// ─── payload ของหน้าต่างพัสดุในแชท (GET order-context) ────────────────────────
// ร้านที่ไม่ได้เชื่อม iShip ก็ต้องใช้หน้าต่างนี้ได้ (ส่งเอง) จึงไม่ใช่ 404 อีกแล้ว —
// ชุดตัวแปร receiver/sender/items/defaults… มีเฉพาะตอน READY

interface ShipmentPanelExtras {
  orderStatus: string;
  /** ShipmentTracking ที่ร้านแจ้งเอง (ส่งเอง) — null = ยังไม่มี */
  manualShipment: { provider: string; trackingNo: string } | null;
  /** 00080 — จังหวะแจ้งเลขพัสดุของร้าน (ส่งเองเท่านั้น) */
  trackingNoticeTiming: "ON_SAVE" | "ON_DISPATCH";
  /** 00080 — เก็บเงินปลายทางและร้านยังไม่กดรับเงิน (isCodUnpaidOrder) */
  isCodUnpaid: boolean;
  /** Shop.vertical — ผันคำเรียกออเดอร์ในแผงแชท */
  vertical: string;
  /** 00078 — true เฉพาะบทบาทที่เห็นเงินได้ (ไม่มี = ปิด) */
  canSetShipCost?: boolean;
  /** 00080 TD-011 — ถือ S1 (ปุ่มจัดส่งแล้ว/ส่งสำเร็จ) · ไม่มี = ปิด (fail-closed) ตัดสินที่ server จากบทบาทของ session */
  canShip?: boolean;
}

export type ShipmentPanelJson =
  | (ShipmentContextJson & ShipmentPanelExtras & { ishipState: "READY" })
  | (ShipmentPanelExtras & {
      ishipState: "NOT_CONNECTED" | "DISCONNECTED";
      orderId: string;
      /** ใบที่ค้างจากก่อนเลิกเชื่อม (ถ้ามี) */
      shipment: ShipmentViewJson | null;
    });
