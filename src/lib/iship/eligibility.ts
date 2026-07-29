// feature 00022 — ออเดอร์นี้เปิดพัสดุได้ไหม (SRS §5)
//
// แยกเป็นไฟล์ pure ไม่แตะ Prisma/session โดยเจตนา — ตรรกะนี้มีหลายสาขาและเป็นจุดที่
// "ตัดสินผิดแล้วรบกวนร้านทุกวัน" จึงต้องเทสได้ครบทุกสาขาโดยไม่ต้องปั้นฐานข้อมูล
//
// แกนของการออกแบบคือแยก 2 ความหมายที่คนมักปนกัน:
//   SKIP_SILENT = "ออเดอร์นี้ไม่เกี่ยวกับการส่งของ" → ห้ามรบกวนร้านเลย
//   NEEDS_FIX   = "ควรส่งได้แต่ข้อมูลขาด"        → ต้องบอกว่าขาดช่องไหน
// ถ้ารวมสองอย่างเป็น error เดียวกัน ร้านที่ขายของดิจิทัลจะเจอข้อความเตือนทุกออเดอร์
// จนเลิกอ่าน แล้วพลาดเคสที่ต้องแก้จริง (FR-ISHIP-023)

import {
  findMissingReceiverFields,
  findMissingSenderFields,
  type DeepAddress,
  type MissingAddressField,
  type MissingReceiverField,
  type MissingSenderField,
  type SenderAddress,
} from "./mapping";

export interface EligibilityOrderLike {
  type: string;
  fulfillmentMode: string;
  buyerName: string | null;
  buyerContact: string | null;
  shippingAddress: DeepAddress | null;
}

export interface EligibilityAccountLike {
  senderAddress: SenderAddress;
}

/**
 * `field` บอกว่าที่ขาดเป็นของใคร — ปลายทางต้องใช้ตัวนี้ตัดสินว่าจะให้ร้าน "กรอกตรงนี้"
 * (RECEIVER — แก้ได้ในหน้าออเดอร์/โมดัล) หรือ "ไปหน้าตั้งค่า" (SENDER — ค่าระดับร้าน)
 * ห้ามเดาจากข้อความใน missing เพราะเป็นคำที่เอาไว้โชว์ ไม่ใช่ตัวจำแนก
 */
export type EligibilityResult =
  | { eligible: true }
  | { eligible: false; kind: "SKIP_SILENT"; reason: string }
  | {
      eligible: false;
      kind: "NEEDS_FIX";
      field: "SENDER";
      missing: MissingSenderField[];
    }
  | {
      eligible: false;
      kind: "NEEDS_FIX";
      field: "RECEIVER";
      missing: MissingReceiverField[];
    };

/** ทุกสาขา NEEDS_FIX รวมกัน — ใช้ตรงจุดที่ไม่สนว่าเป็นของใคร (เช่น ข้อความ error รวม) */
export type NeedsFixMissing = MissingAddressField[];

export function checkEligibility(
  order: EligibilityOrderLike,
  account: EligibilityAccountLike | null,
): EligibilityResult {
  // ลำดับการตรวจสำคัญ: เช็ค "ไม่เกี่ยวกับการส่งของ" ให้หมดก่อน
  // ไม่งั้นออเดอร์ดิจิทัลของร้านที่ยังไม่ตั้งที่อยู่ผู้ส่ง จะได้ NEEDS_FIX ทั้งที่ไม่ควรมีอะไรเตือนเลย
  if (order.fulfillmentMode !== "SHIPPED") {
    return { eligible: false, kind: "SKIP_SILENT", reason: "ออเดอร์นี้ไม่ต้องจัดส่ง" };
  }
  if (order.type !== "PHYSICAL") {
    return {
      eligible: false,
      kind: "SKIP_SILENT",
      reason: "ออเดอร์ประเภทนี้ไม่มีพัสดุให้ส่ง",
    };
  }
  if (!account) {
    return {
      eligible: false,
      kind: "SKIP_SILENT",
      reason: "ร้านยังไม่ได้เชื่อมต่อ iShip",
    };
  }

  // ที่อยู่ผู้ส่งก่อนผู้รับ — เป็นปัญหาระดับร้านที่แก้ครั้งเดียวจบ
  // ถ้าบอกเรื่องผู้รับก่อน ร้านจะไล่แก้ทีละออเดอร์โดยไม่รู้ว่าต้นตออยู่ที่หน้าตั้งค่า
  const missingSender = findMissingSenderFields(account.senderAddress);
  if (missingSender.length > 0) {
    return {
      eligible: false,
      kind: "NEEDS_FIX",
      field: "SENDER",
      missing: missingSender,
    };
  }

  const missingReceiver = findMissingReceiverFields(
    order.shippingAddress,
    order.buyerName,
    order.buyerContact,
  );
  if (missingReceiver.length > 0) {
    return {
      eligible: false,
      kind: "NEEDS_FIX",
      field: "RECEIVER",
      missing: missingReceiver,
    };
  }

  return { eligible: true };
}
