// feature 00022 — iShip Shipping Integration (service layer)
//
// ความรับผิดชอบของชั้นนี้: กฎธุรกิจ + สิทธิ์ + เขียนฐานข้อมูล
// เป็น "จุดเดียวในระบบ" ที่ถอดรหัส token ของร้าน — token ไม่เคยออกจากไฟล์นี้
// ไปที่อื่นนอกจากถูกส่งเป็นพารามิเตอร์ให้ lib/iship
//
// ข้อควรระวัง: view type ทุกตัวที่คืนออกไป ไม่มี field token ตั้งแต่ระดับ type
// (ไม่ใช่หวังว่าจะไม่เผลอใส่) — ดู ConnectionView / SettingsView / ShipmentView

import { prisma } from "@/lib/prisma";
import { FORWARD_SHIPMENT, RETURN_SHIPMENT, LATEST_FORWARD_SHIPMENT } from "@/lib/shipment-direction";
// value import (ไม่ใช่ `import type`) เพราะต้องใช้ `Prisma.PrismaClientKnownRequestError`
// ตรวจ P2002 ตอนสร้างพัสดุขากลับ — ไม่เพิ่มต้นทุน runtime เพราะไฟล์นี้ import prisma client อยู่แล้ว
import { Prisma } from "@prisma/client";
import {
  createOrder,
  settleCodFromCarrier,
  syncOrderPaymentToParcel,
} from "@/services/order.service";
import { recordOrderEvent } from "@/services/order-event.service";
import { resolveDefaultCodAmount } from "@/lib/iship/payment-sync";
import { decryptToken, encryptToken } from "@/lib/token-crypto";
import * as iship from "@/lib/iship/client";
import { IShipError } from "@/lib/iship/errors";
import {
  carrierStatusCodeFromId,
  carrierTrackingSettled,
  EVIDENCE_CARRIER_STATUSES,
  shouldCaptureEvidence,
  describeCarrierStatus,
  impliesDispatched,
  isDeliveredCarrierStatus,
  parseCarrierTimestamp,
  isReturnDispatchEvent,
  returnLegStampOf,
  readCodSettlement,
  readCarrierCharges,
  readCarrierChargesFromGetOrder,
} from "@/lib/iship/status";
import {
  diffReceiverAddress,
  hasAddressConflict,
  parseParcelRow,
  parseParcelRows,
  type ParcelPreview,
  type UnlinkedParcelView,
} from "@/lib/iship/unlinked";

export type { ParcelPreview, UnlinkedParcelView };
import { pickStaleParcelsForLookup } from "@/lib/iship/stale-lookup";
import { checkEligibility as evaluateEligibility } from "@/lib/iship/eligibility";
import { assembleCompareResult, type CompareResult } from "@/lib/iship/compare";
import {
  buildCheckPricePayload,
  buildCreateOrderPayload,
  buildIdempotencyKey,
  buildOptionsSnapshot,
  findMissingParcelFields,
  findMissingReceiverFields,
  findMissingSenderFields,
  normalizeProvince,
  type DeepAddress,
  type MissingAddressField,
  type SenderAddress,
} from "@/lib/iship/mapping";
import type { ShipmentContext } from "@/lib/iship/context";
import { MOBILE_PHONE_RE } from "@/lib/phone";

// ─── error ของชั้น service ที่ route แมปเป็น HTTP ได้ตรง ๆ ──────────────────

export type ServiceErrorCode =
  | "NOT_CONNECTED"
  | "SHIPMENT_EXISTS"
  | "INCOMPLETE_DATA"
  | "NOT_ELIGIBLE"
  | "NOT_FOUND"
  | "INVALID_STATE";

export class IShipServiceError extends Error {
  readonly code: ServiceErrorCode;
  readonly userMessage: string;
  /** ช่องข้อมูลที่ขาด — มีเฉพาะ INCOMPLETE_DATA (FR-ISHIP-023 บังคับให้บอกเป็นข้อ ๆ) */
  readonly missing?: MissingAddressField[];

  constructor(
    code: ServiceErrorCode,
    userMessage: string,
    missing?: MissingAddressField[],
  ) {
    super(`IShipServiceError(${code})`);
    this.name = "IShipServiceError";
    this.code = code;
    this.userMessage = userMessage;
    this.missing = missing;
  }
}

// ─── view types (ไม่มี token) ───────────────────────────────────────────────

export interface ConnectionView {
  connected: boolean;
  status: "ACTIVE" | "TOKEN_INVALID" | "DISCONNECTED" | null;
  tokenLast4: string | null;
  lastVerifiedAt: Date | null;
  lastVerifyError: string | null;
  senderComplete: boolean;
  settingsComplete: boolean;
  createMode: "AUTO" | "ASK" | "OFF";
}

export interface ShipmentView {
  id: string;
  orderId: string;
  status: string;
  /** "CREATED" = Deep เปิดใบนี้เอง | "LINKED" = ร้านเปิดไว้บน iShip แล้วเอามาผูก */
  source: string;
  courierCode: string | null;
  courierName: string | null;
  trackingNo: string | null;
  carrierStatus: string | null;
  carrierStatusText: string | null;
  carrierStatusAt: Date | null;
  /** เวลาของ "ขากลับ" — null = ขนส่งไม่ได้แจ้งเวลา ไม่ใช่ "ไม่เกิด" (ดู schema.prisma) */
  returnStartedAt: Date | null;
  returnedAt: Date | null;
  returnDispatchedAt: Date | null;
  isOverWeight: boolean;
  isOverSize: boolean;
  labelPrintedAt: Date | null;
  labelPrintCount: number;
  isDryRun: boolean;
  lastErrorCode: string | null;
  /** ข้อความไทยที่แสดงได้ — ไม่ใช่ข้อความดิบจาก iShip */
  lastErrorMessage: string | null;
  /** ข้อมูลพัสดุที่ถูกส่งไปจริง — ให้ร้านตรวจย้อนได้ว่าเปิดใบนี้ด้วยค่าอะไร */
  weight: number | null;
  width: number | null;
  length: number | null;
  height: number | null;
  codAmount: number;
  createdAt: Date;
  /**
   * ข้อความที่ต้องบอกร้านทันทีหลังเปิด/ผูกพัสดุ เมื่อวิธีชำระเงินของคำสั่งซื้อกับพัสดุ
   * ไม่ตรงกัน (ส่วนขยาย 2026-08-06) — `changed` = ระบบแก้ให้แล้ว, `warning` = ร้านต้องไปแก้เอง
   *
   * ไม่เก็บลงฐาน: เป็นข้อความสำหรับ "ครั้งนี้" เท่านั้น รอยถาวรอยู่ในไทม์ไลน์
   * (PAYMENT_METHOD_SYNCED) แล้ว
   */
  paymentNotice?: { kind: "changed" | "warning"; message: string } | null;
}

// ─── helper ภายใน ───────────────────────────────────────────────────────────

type AccountRow = NonNullable<
  Awaited<ReturnType<typeof prisma.shopShippingAccount.findUnique>>
>;

function senderOf(a: AccountRow): SenderAddress {
  return {
    name: a.senderName,
    phone: a.senderPhone,
    address: a.senderAddress,
    subdistrict: a.senderSubdistrict, // ตำบล
    district: a.senderDistrict, // อำเภอ
    province: a.senderProvince,
    postcode: a.senderPostcode,
  };
}

function toConnectionView(a: AccountRow | null): ConnectionView {
  if (!a || a.status === "DISCONNECTED") {
    return {
      connected: false,
      status: a?.status === "DISCONNECTED" ? "DISCONNECTED" : null,
      tokenLast4: null,
      lastVerifiedAt: null,
      lastVerifyError: null,
      senderComplete: false,
      settingsComplete: false,
      // ยังไม่เชื่อมต่อ = ต้องไม่มีอะไรเด้งถาม (ตรงกับ default ของ DB)
      createMode: "OFF",
    };
  }
  return {
    connected: true,
    status: a.status as ConnectionView["status"],
    tokenLast4: a.tokenLast4,
    lastVerifiedAt: a.lastVerifiedAt,
    lastVerifyError: a.lastVerifyError,
    senderComplete: findMissingSenderFields(senderOf(a)).length === 0,
    settingsComplete:
      !!a.defaultCourierCode &&
      a.defaultCategoryId != null &&
      a.defaultWeight != null &&
      a.defaultWidth != null &&
      a.defaultLength != null &&
      a.defaultHeight != null,
    createMode: a.createMode as ConnectionView["createMode"],
  };
}

/**
 * loadAccount — ดึงบัญชีที่ใช้งานได้ + ถอดรหัส token
 *
 * โยน NOT_CONNECTED เมื่อยังไม่เชื่อม/ถอดออกแล้ว — แต่ status = TOKEN_INVALID
 * ยัง "ผ่าน" ด่านนี้ไปได้ เพราะร้านอาจกำลังกดทดสอบซ้ำหลังเอา token ใหม่มาวาง
 */
async function loadAccount(
  shopId: string,
): Promise<{ account: AccountRow; token: string }> {
  const account = await prisma.shopShippingAccount.findUnique({ where: { shopId } });
  if (!account || account.status === "DISCONNECTED") {
    throw new IShipServiceError(
      "NOT_CONNECTED",
      "ร้านนี้ยังไม่ได้เชื่อมต่อกับ iShip",
    );
  }
  return { account, token: decryptToken(account.accessTokenEnc) };
}

/**
 * markTokenInvalid — เปลี่ยนสถานะการเชื่อมต่อเมื่อ iShip ปฏิเสธสิทธิ์ (BR-ISHIP-14)
 *
 * ต้องเรียกทุกครั้งที่จับ IShipError ที่ invalidatesConnection ก่อนโยนต่อ
 * ไม่งั้นร้านจะเจอ error ซ้ำ ๆ โดยไม่มีอะไรบอกว่าให้ไปต่ออายุ token
 */
async function markTokenInvalid(shopId: string, message?: string): Promise<void> {
  await prisma.shopShippingAccount.updateMany({
    where: { shopId },
    data: { status: "TOKEN_INVALID", lastVerifyError: message ?? null },
  });
}

/** ครอบการเรียก iShip เพื่อให้ token ที่หมดอายุอัปเดตสถานะเสมอ ไม่ว่าจะเรียกจากทางไหน */
async function withTokenGuard<T>(shopId: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof IShipError && err.invalidatesConnection) {
      await markTokenInvalid(shopId, err.userMessage);
    }
    throw err;
  }
}

// ─── การเชื่อมต่อ ───────────────────────────────────────────────────────────

export async function getConnection(shopId: string): Promise<ConnectionView> {
  const account = await prisma.shopShippingAccount.findUnique({ where: { shopId } });
  return toConnectionView(account);
}

/**
 * connect — วาง token ใหม่ (หรือทับของเดิม)
 *
 * BR-ISHIP-11: ห้ามบันทึกโดยไม่ทดสอบก่อน — ใช้ courier_code เป็นตัวทดสอบ
 * เพราะเป็นการเรียกที่เบาที่สุดและไม่ก่อค่าใช้จ่ายใด ๆ
 */
export async function connect(
  shopId: string,
  userId: string,
  rawToken: string,
): Promise<ConnectionView> {
  const token = rawToken.trim();

  // ทดสอบก่อน — ถ้าไม่ผ่าน error จะถูกโยนออกไปโดยที่ยังไม่มีอะไรถูกบันทึก
  await iship.listCouriers(token);

  const tokenLast4 = token.slice(-4);
  const encrypted = encryptToken(token);

  const account = await prisma.shopShippingAccount.upsert({
    where: { shopId },
    create: {
      shopId,
      accessTokenEnc: encrypted,
      tokenLast4,
      status: "ACTIVE",
      // ระบุตรง ๆ ไม่พึ่ง default ของ DB — ร้านที่เพิ่งเชื่อมต้องเงียบไว้ก่อน
      // (ยังไม่ได้ตั้งขนาด/น้ำหนัก/ที่อยู่ผู้ส่งด้วยซ้ำ ถามไปก็ตอบ "ไม่" ทุกครั้ง)
      createMode: "OFF",
      connectedByUserId: userId,
      lastVerifiedAt: new Date(),
    },
    update: {
      accessTokenEnc: encrypted,
      tokenLast4,
      status: "ACTIVE",
      lastVerifiedAt: new Date(),
      lastVerifyError: null,
      // ไม่แตะค่าตั้งต้นเดิม — เปลี่ยน token ไม่ควรล้างที่อยู่ผู้ส่งที่ร้านตั้งไว้แล้ว
    },
  });

  return toConnectionView(account);
}

export async function verifyConnection(shopId: string): Promise<ConnectionView> {
  const { token } = await loadAccount(shopId);
  try {
    await iship.listCouriers(token);
  } catch (err) {
    if (err instanceof IShipError && err.invalidatesConnection) {
      await markTokenInvalid(shopId, err.userMessage);
      return toConnectionView(
        await prisma.shopShippingAccount.findUnique({ where: { shopId } }),
      );
    }
    throw err;
  }
  const account = await prisma.shopShippingAccount.update({
    where: { shopId },
    data: { status: "ACTIVE", lastVerifiedAt: new Date(), lastVerifyError: null },
  });
  return toConnectionView(account);
}

/**
 * disconnect — ถอดการเชื่อมต่อ
 *
 * BR-ISHIP-15: ลบ token จริง แต่ประวัติพัสดุยังอยู่ครบ
 * เก็บแถวไว้ (ไม่ delete) เพื่อรักษาค่าตั้งต้นที่ร้านกรอกไว้ — ถ้าเชื่อมใหม่จะไม่ต้องกรอกซ้ำ
 * accessTokenEnc เป็น NOT NULL จึงเขียนทับด้วยค่าว่างที่ถอดรหัสไม่ได้แทนการ set null
 */
export async function disconnect(shopId: string): Promise<void> {
  await prisma.shopShippingAccount.updateMany({
    where: { shopId },
    data: {
      accessTokenEnc: "",
      tokenLast4: null,
      status: "DISCONNECTED",
      lastVerifiedAt: null,
      lastVerifyError: null,
    },
  });
}

// ─── ค่าตั้งต้น ─────────────────────────────────────────────────────────────

export interface SettingsInput {
  senderName?: string | null;
  senderPhone?: string | null;
  senderAddress?: string | null;
  senderSubdistrict?: string | null; // ตำบล
  senderDistrict?: string | null; // อำเภอ
  senderProvince?: string | null;
  senderPostcode?: string | null;
  defaultCourierCode?: string | null;
  defaultWeight?: number | null;
  defaultWidth?: number | null;
  defaultLength?: number | null;
  defaultHeight?: number | null;
  defaultCategoryId?: number | null;
  optOnTime?: boolean;
  optBoxShield?: boolean;
  optIsInsured?: boolean;
  optProductValue?: number | null;
  optServiceType?: number | null;
  defaultRemark?: string | null;
  createMode?: "AUTO" | "ASK" | "OFF";
}

export async function getSettings(shopId: string) {
  const a = await prisma.shopShippingAccount.findUnique({ where: { shopId } });
  if (!a || a.status === "DISCONNECTED") {
    throw new IShipServiceError("NOT_CONNECTED", "ร้านนี้ยังไม่ได้เชื่อมต่อกับ iShip");
  }
  // เลือก field ทีละตัว — ไม่ spread ทั้งแถว เพราะจะพา accessTokenEnc ติดออกไปด้วย
  return {
    senderName: a.senderName,
    senderPhone: a.senderPhone,
    senderAddress: a.senderAddress,
    senderSubdistrict: a.senderSubdistrict,
    senderDistrict: a.senderDistrict,
    senderProvince: a.senderProvince,
    senderPostcode: a.senderPostcode,
    defaultCourierCode: a.defaultCourierCode,
    defaultWeight: a.defaultWeight ? Number(a.defaultWeight) : null,
    defaultWidth: a.defaultWidth,
    defaultLength: a.defaultLength,
    defaultHeight: a.defaultHeight,
    defaultCategoryId: a.defaultCategoryId,
    optOnTime: a.optOnTime,
    optBoxShield: a.optBoxShield,
    optIsInsured: a.optIsInsured,
    optProductValue: a.optProductValue ? Number(a.optProductValue) : null,
    optServiceType: a.optServiceType,
    defaultRemark: a.defaultRemark,
    createMode: a.createMode as "AUTO" | "ASK" | "OFF",
  };
}

export async function updateSettings(shopId: string, input: SettingsInput) {
  const existing = await prisma.shopShippingAccount.findUnique({ where: { shopId } });
  if (!existing || existing.status === "DISCONNECTED") {
    throw new IShipServiceError("NOT_CONNECTED", "ร้านนี้ยังไม่ได้เชื่อมต่อกับ iShip");
  }
  await prisma.shopShippingAccount.update({ where: { shopId }, data: input });
  return getSettings(shopId);
}

// ─── ข้อมูลอ้างอิง (proxy — token ไม่ถึงเบราว์เซอร์) ────────────────────────

export async function listCouriers(shopId: string) {
  const { token } = await loadAccount(shopId);
  return withTokenGuard(shopId, () => iship.listCouriers(token));
}

export async function listBoxes(shopId: string) {
  const { token } = await loadAccount(shopId);
  return withTokenGuard(shopId, () => iship.listBoxes(token));
}

// ─── ความมีสิทธิ์ของออเดอร์ ─────────────────────────────────────────────────
// ตรรกะจริงอยู่ที่ lib/iship/eligibility.ts (pure — เทสได้โดยไม่ต้องมีฐานข้อมูล)
// re-export ไว้ที่นี่เพื่อให้ call site ฝั่ง service/route เรียกจากที่เดียวได้เหมือนเดิม
export { checkEligibility } from "@/lib/iship/eligibility";
export type {
  EligibilityOrderLike,
  EligibilityResult,
} from "@/lib/iship/eligibility";

function toShipmentView(s: {
  id: string;
  orderId: string;
  status: string;
  source: string;
  courierCode: string | null;
  courierName: string | null;
  trackingNo: string | null;
  carrierStatus: string | null;
  carrierStatusText: string | null;
  carrierStatusAt: Date | null;
  isOverWeight: boolean;
  isOverSize: boolean;
  labelPrintedAt: Date | null;
  labelPrintCount: number;
  isDryRun: boolean;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  weight: unknown;
  width: number | null;
  length: number | null;
  height: number | null;
  codAmount: unknown;
  createdAt: Date;
  returnStartedAt: Date | null;
  returnedAt: Date | null;
  returnDispatchedAt: Date | null;
}): ShipmentView {
  return {
    ...s,
    // Decimal ของ Prisma → number ก่อนข้ามขอบเขต (Decimal serialize ข้าม RSC/HTTP ไม่ได้)
    weight: s.weight == null ? null : Number(s.weight),
    codAmount: Number(s.codAmount ?? 0),
    // ข้อความที่แสดงต่อผู้ใช้มาจาก error code ของเรา ไม่ใช่ lastErrorMessage ที่เป็นข้อความดิบ
    //
    // ต้องส่งข้อความดิบเข้าไปด้วย ไม่ใช่สร้าง IShipError เปล่า ๆ: REJECTED_BY_CARRIER มี
    // ข้อยกเว้นที่ตั้งใจไว้ให้ต่อท้ายรายละเอียดจากขนส่ง ("กรุณากรอก สีสินค้า …") ซึ่งคือ
    // "สิ่งที่ร้านต้องแก้" — ไม่ส่งเข้าไป ข้อยกเว้นนั้นก็ไม่เคยทำงานสักครั้ง ร้านเห็นแต่
    // ประโยคกลาง ๆ แล้วกดลองใหม่วนไปโดยไม่มีทางรู้ว่าขาดอะไร (ตัวกรองอยู่ใน IShipError
    // อยู่แล้ว — code อื่นไม่เปิดเผยข้อความดิบ)
    lastErrorMessage: s.lastErrorCode
      ? new IShipError(s.lastErrorCode as never, {
          upstreamMessage: s.lastErrorMessage ?? undefined,
        }).userMessage
      : null,
  };
}

/**
 * resolveCourierName — แปลงรหัสขนส่งเป็นชื่อที่คนอ่านออก ณ เวลาสร้างพัสดุ
 *
 * ห้ามให้ล้มเหลวแล้วบล็อกการสร้างพัสดุ — มันเป็นแค่ข้อความบนจอ ไม่ใช่ข้อมูลที่ขนส่งต้องใช้
 * คืน null เมื่อดึงไม่ได้/ไม่เจอ แล้วให้หน้าจอ fallback เป็นรหัสขนส่งแทน
 */
async function resolveCourierName(
  shopId: string,
  courierCode: string | null,
): Promise<string | null> {
  if (!courierCode) return null;
  try {
    const list = await listCouriers(shopId);
    return list.find((c) => c.code === courierCode)?.name ?? null;
  } catch {
    return null;
  }
}

const SHIPMENT_SELECT = {
  id: true,
  orderId: true,
  status: true,
  source: true,
  courierCode: true,
  courierName: true,
  trackingNo: true,
  carrierStatus: true,
  carrierStatusText: true,
  carrierStatusAt: true,
  returnStartedAt: true,
  returnedAt: true,
  returnDispatchedAt: true,
  isOverWeight: true,
  isOverSize: true,
  labelPrintedAt: true,
  labelPrintCount: true,
  isDryRun: true,
  lastErrorCode: true,
  // ข้อความดิบ — ไม่ได้ส่งออกตรง ๆ ใช้เป็นวัตถุดิบให้ IShipError ตัดสินว่าจะเปิดเผยไหม
  // (เปิดเฉพาะ REJECTED_BY_CARRIER ตามข้อยกเว้นเดียวของ BR-ISHIP §6.4)
  lastErrorMessage: true,
  weight: true,
  width: true,
  length: true,
  height: true,
  codAmount: true,
  createdAt: true,
} as const;

/**
 * resolveOrderIdByToken — แปลง publicToken/shortCode เป็น id ของคำสั่งซื้อ
 *
 * หน้าจอที่ทำงานกับคำสั่งซื้อในบริบทอื่น (การ์ดในแชท, รายการคำสั่งซื้อ) รู้จักแค่ token
 * ไม่รู้จัก id — แปลงที่เซิร์ฟเวอร์ดีกว่าให้แต่ละหน้าไปหา id เอง เพราะ id ไม่ใช่สิ่งที่
 * หน้าเหล่านั้นควรต้องรู้ และการยัดเพิ่มเข้าไปในทุก payload คือหนี้ที่ไม่จำเป็น
 *
 * มี shopId ใน where ตั้งแต่ query แรก — token ของร้านอื่นจะหาไม่เจอ ไม่ใช่เจอแล้วค่อยปฏิเสธ
 */
export async function resolveOrderIdByToken(
  shopId: string,
  token: string,
): Promise<string> {
  const order = await prisma.order.findFirst({
    where: { shopId, OR: [{ publicToken: token }, { shortCode: token }] },
    select: { id: true },
  });
  if (!order) throw new IShipServiceError("NOT_FOUND", "ไม่พบคำสั่งซื้อนี้");
  return order.id;
}

/**
 * getShipmentPanel — ข้อมูลทั้งหมดที่ส่วน "การจัดส่ง" ในหน้าออเดอร์ต้องใช้
 *
 * รวมไว้ที่เดียวเพราะหน้าออเดอร์ต้องตัดสิน 4 สถานะในครั้งเดียว (มีพัสดุ / ยังไม่มีแต่พร้อม /
 * ยังไม่มีและข้อมูลขาด / ล้มเหลว) การให้ page ประกอบเองจะทำให้ตรรกะเดียวกันไปอยู่ 2 ที่
 *
 * คืน null เมื่อร้านไม่ได้เชื่อมต่อหรือออเดอร์ไม่เกี่ยวกับการส่งของ — page จะได้ไม่ต้อง
 * render ส่วนนี้เลย (ไม่ใช่ render กล่องเปล่า)
 *
 * หน้าเว็บใช้ตัวนี้ (null พอแล้ว) ส่วน API ใช้ getShipmentPanelOrReason ที่บอกสาเหตุได้
 */
export async function getShipmentPanel(
  shopId: string,
  orderId: string,
): Promise<ShipmentContext | null> {
  const r = await getShipmentPanelOrReason(shopId, orderId);
  return "ctx" in r ? r.ctx : null;
}

/**
 * getShipmentPanelOrReason — เหมือน getShipmentPanel แต่บอกด้วยว่า "ทำไมถึงไม่มี"
 *
 * ทำไมต้องมี: เดิม 4 สาเหตุที่ต่างกันคนละเรื่อง (ร้านไม่ได้เชื่อม iShip / หาออเดอร์ไม่เจอ /
 * ออเดอร์ไม่ต้องจัดส่ง) ถูกยุบเป็น null แล้ว route แปลเป็นข้อความเดียวว่า
 * "คำสั่งซื้อนี้ไม่มีส่วนการจัดส่ง" — ซึ่งไม่ตรงกับสาเหตุไหนเลยและทำให้ร้านไล่แก้ผิดจุด
 * (เจอจริง 2026-08-01: ร้านเห็นข้อความนี้บนออเดอร์ที่มีที่อยู่จัดส่งอยู่ตรงหน้า)
 */
export async function getShipmentPanelOrReason(
  shopId: string,
  orderId: string,
): Promise<{ ctx: ShipmentContext } | { reason: string }> {
  const account = await prisma.shopShippingAccount.findUnique({ where: { shopId } });
  if (!account) {
    return { reason: "ร้านยังไม่ได้เชื่อมต่อ iShip — เชื่อมต่อได้ที่หน้าตั้งค่าการจัดส่ง" };
  }
  if (account.status === "DISCONNECTED") {
    return { reason: "การเชื่อมต่อ iShip ถูกยกเลิกไว้ — เชื่อมต่อใหม่ที่หน้าตั้งค่าการจัดส่ง" };
  }

  const order = await prisma.order.findFirst({
    where: { id: orderId, shopId },
    select: {
      fulfillmentMode: true,
      buyerName: true,
      buyerContact: true,
      shippingAddress: true,
      totalAmount: true,
      paymentMethod: true,
      // รายการสินค้า — ให้ร้านตรวจก่อนกดสร้างว่ากำลังเปิดพัสดุให้ออเดอร์ใบที่ตั้งใจ
      items: {
        select: { id: true, name: true, qty: true, price: true },
        orderBy: { name: "asc" },
      },
    },
  });
  if (!order) return { reason: "ไม่พบคำสั่งซื้อนี้ในร้าน" };

  const eligibility = evaluateEligibility(
    {
      fulfillmentMode: order.fulfillmentMode,
      buyerName: order.buyerName,
      buyerContact: order.buyerContact,
      shippingAddress: order.shippingAddress as DeepAddress | null,
    },
    { senderAddress: senderOf(account) },
  );

  // ออเดอร์ที่ไม่เกี่ยวกับการส่งของ (ลูกค้ารับเอง ฯลฯ) — ไม่แสดงส่วนนี้เลย
  // ส่ง reason ของ eligibility ออกไปตรง ๆ ไม่แต่งใหม่ ปลายทางจะได้เห็นเหตุผลจริง
  if (!eligibility.eligible && eligibility.kind === "SKIP_SILENT") {
    return { reason: eligibility.reason };
  }

  const shipment = await prisma.orderShipment.findFirst({
    // 🛑 direction FORWARD (feature 00056) — แผงนี้เล่าเรื่อง "ของที่ส่งให้ลูกค้า"
    // พัสดุขากลับของใบคืนมีจอของตัวเอง ถ้าหลุดมาที่นี่ ออเดอร์ที่คืนของแล้วจะกลับไปแสดง
    // แถบสถานะพัสดุใหม่ทั้งชุดเหมือนกำลังส่งอยู่
    where: { orderId, status: { not: "CANCELLED" }, direction: FORWARD_SHIPMENT },
    select: SHIPMENT_SELECT,
    orderBy: { createdAt: "desc" },
  });

  const addr = (order.shippingAddress as DeepAddress | null) ?? {};

  // แยก "ติดที่ค่าระดับร้าน" ออกจาก "ข้อมูลผู้รับของออเดอร์นี้ขาด" อย่างเด็ดขาด
  // เพราะสองอย่างนี้แก้คนละที่ และ createShipment ตรวจผู้ส่งก่อนเสมอ — ถ้าปลายทางแยกไม่ออก
  // จะกางฟอร์มผู้รับให้ร้านกรอกทั้งที่กรอกครบแค่ไหนก็สร้างไม่ได้
  const needsFix = !eligibility.eligible && eligibility.kind === "NEEDS_FIX";

  const ctx: ShipmentContext = {
    orderId,
    createMode: account.createMode,
    shipment: shipment ? toShipmentView(shipment) : null,
    blockedBy:
      needsFix && eligibility.field === "SENDER"
        ? { kind: "SENDER", missing: eligibility.missing }
        : null,
    missingReceiver:
      needsFix && eligibility.field === "RECEIVER" ? eligibility.missing : [],
    receiver: {
      name: order.buyerName,
      phone: order.buyerContact,
      line1: addr.line1 ?? null,
      subdistrict: addr.subdistrict ?? null,
      district: addr.district ?? null,
      province: addr.province ?? null,
      postcode: addr.postcode ?? null,
    },
    sender: senderOf(account),
    // เติมยอดให้เฉพาะใบที่จ่ายปลายทางจริง — ใบที่ชำระแล้วต้องเป็น 0 ไม่ใช่ยอดคำสั่งซื้อ
    // 🛑 ต้องเป็นฟังก์ชันตัวเดียวกับที่ createShipment ใช้ตอนผู้ขายไม่กรอกยอด ไม่งั้นเลขที่
    // ร้านเห็นบนฟอร์มกับเลขที่ยิงออกไปจริงจะไม่ใช่ตัวเดียวกัน (บั๊กเงิน prod 2026-09-04)
    codSuggested: resolveDefaultCodAmount({
      orderPaymentMethod: order.paymentMethod,
      orderTotal: Number(order.totalAmount),
    }),
    items: order.items.map((it) => ({
      id: it.id,
      name: it.name,
      qty: it.qty,
      // Decimal ข้ามขอบเขต RSC ไม่ได้ — แปลงตั้งแต่ที่นี่เหมือน field อื่นในไฟล์นี้
      price: Number(it.price),
    })),
    defaults: {
      courierCode: account.defaultCourierCode,
      weight: account.defaultWeight ? Number(account.defaultWeight) : null,
      width: account.defaultWidth,
      length: account.defaultLength,
      height: account.defaultHeight,
      categoryId: account.defaultCategoryId,
      remark: account.defaultRemark,
      optOnTime: account.optOnTime,
      optBoxShield: account.optBoxShield,
      optIsInsured: account.optIsInsured,
      optProductValue: account.optProductValue
        ? Number(account.optProductValue)
        : null,
    },
  };

  return { ctx };
}

// ─── พัสดุ ──────────────────────────────────────────────────────────────────

/**
 * ข้อมูลผู้รับที่ร้านกรอกเพิ่ม ณ ตอนกดสร้างพัสดุ
 *
 * เดิมออกแบบให้ "ไปแก้ที่อื่นแล้วกลับมา" ซึ่งเป็นการโยนงานกลับไปให้ร้านเดินอ้อม
 * ทั้งที่ฟีเจอร์นี้มีไว้กำจัดการเดินอ้อมพอดี (user feedback 2026-07-26)
 */
export interface ReceiverPatch {
  name?: string | null;
  phone?: string | null;
  line1?: string | null;
  subdistrict?: string | null; // ตำบล
  district?: string | null; // อำเภอ
  province?: string | null;
  postcode?: string | null;
  note?: string | null;
}

/**
 * applyReceiverPatch — เขียนข้อมูลผู้รับกลับเข้าคำสั่งซื้อ
 *
 * ต้องเขียนกลับ ไม่ใช่เก็บไว้แค่ใน snapshot ของพัสดุ เพราะ:
 *   - ออเดอร์คือแหล่งความจริง — ถ้าไม่เขียน ออเดอร์จะยัง "ข้อมูลไม่ครบ" อยู่เหมือนเดิม
 *   - ผู้ซื้อเปิดลิงก์ออเดอร์ต้องเห็นที่อยู่ตรงกับที่ส่งจริง
 *   - ยกเลิกพัสดุแล้วเปิดใหม่ต้องไม่ถามซ้ำ
 *
 * ข้อควรระวัง: ห้ามใช้ updateOrder() ของ order.service ที่นี่ — ตัวนั้นเป็นการเขียนทับ
 * ทั้งใบ (ลบ item เดิม คืนสต็อก สร้างใหม่) เอามาแก้แค่ที่อยู่จะพังสต็อกและรายการสินค้า
 * จึงเขียนเฉพาะ 3 คอลัมน์ที่เกี่ยวข้องจริง ๆ เท่านั้น
 */
async function applyReceiverPatch(
  shopId: string,
  orderId: string,
  patch: ReceiverPatch,
): Promise<void> {
  const current = await prisma.order.findFirst({
    where: { id: orderId, shopId },
    select: { shippingAddress: true, buyerName: true, buyerContact: true },
  });
  if (!current) throw new IShipServiceError("NOT_FOUND", "ไม่พบคำสั่งซื้อนี้");

  const addr = (current.shippingAddress as DeepAddress | null) ?? {};
  const pick = (next: string | null | undefined, prev: string | null | undefined) => {
    const v = next?.trim();
    return v ? v : (prev ?? null);
  };

  await prisma.order.update({
    where: { id: orderId },
    data: {
      buyerName: pick(patch.name, current.buyerName),
      buyerContact: pick(patch.phone, current.buyerContact),
      shippingAddress: {
        line1: pick(patch.line1, addr.line1),
        subdistrict: pick(patch.subdistrict, addr.subdistrict), // ตำบล
        district: pick(patch.district, addr.district), // อำเภอ
        province: pick(patch.province, addr.province),
        postcode: pick(patch.postcode, addr.postcode),
        note: pick(patch.note, addr.note),
      } as object,
    },
  });
}

export interface ShipmentOverride {
  courierCode?: string;
  weight?: number;
  width?: number;
  length?: number;
  height?: number;
  categoryId?: number;
  codAmount?: number;
  remark?: string | null;
  options?: {
    onTime?: boolean;
    boxShield?: boolean;
    isInsured?: boolean;
    productValue?: number | null;
    serviceType?: number | null;
  };
}


/**
 * createShipment — เปิดพัสดุจากคำสั่งซื้อ
 *
 * ลำดับสำคัญ: สร้างแถว PENDING (จอง idempotencyKey) **ก่อน** ยิงออกไป
 * เพราะ unique constraint ที่ระดับฐานข้อมูลคือกลไกเดียวที่กันคำขอพร้อมกันได้จริง
 * การเช็คก่อนเขียนที่ระดับแอปมีช่องว่างระหว่างตรวจกับเขียนเสมอ
 */
export async function createShipment(
  shopId: string,
  userId: string,
  orderId: string,
  override?: ShipmentOverride,
  receiverPatch?: ReceiverPatch,
): Promise<ShipmentView> {
  const { account, token } = await loadAccount(shopId);

  // เขียนข้อมูลผู้รับที่ร้านกรอกเพิ่มกลับเข้าออเดอร์ "ก่อน" ตรวจเงื่อนไข
  // ลำดับนี้สำคัญ: ตรวจก่อนเขียนจะทำให้ร้านที่เพิ่งกรอกครบยังโดนปฏิเสธอยู่ดี
  if (receiverPatch) await applyReceiverPatch(shopId, orderId, receiverPatch);

  const order = await prisma.order.findFirst({
    // scope ownership ใน where — ไม่ใช่ findUnique แล้วค่อยเช็คทีหลัง
    // (feedback_rsc_dal_authz: การ redirect/throw หลังดึงข้อมูลทำให้ PII หลุดเข้า payload ไปแล้ว)
    where: { id: orderId, shopId },
    select: {
      id: true,
      fulfillmentMode: true,
      buyerName: true,
      buyerContact: true,
      shippingAddress: true,
      totalAmount: true,
      // ตัวตัดสินยอดเก็บปลายทางเมื่อผู้ขายไม่ได้กรอกยอดมาเอง (resolveDefaultCodAmount)
      paymentMethod: true,
      items: { select: { name: true, qty: true, price: true } },
    },
  });
  if (!order) throw new IShipServiceError("NOT_FOUND", "ไม่พบคำสั่งซื้อนี้");

  const eligibility = evaluateEligibility(
    {
      fulfillmentMode: order.fulfillmentMode,
      buyerName: order.buyerName,
      buyerContact: order.buyerContact,
      shippingAddress: order.shippingAddress as DeepAddress | null,
    },
    { senderAddress: senderOf(account) },
  );
  if (!eligibility.eligible) {
    if (eligibility.kind === "NEEDS_FIX") {
      throw new IShipServiceError(
        "INCOMPLETE_DATA",
        `สร้างพัสดุไม่ได้ — ยังไม่มี ${eligibility.missing.join(", ")}`,
        eligibility.missing,
      );
    }
    throw new IShipServiceError("NOT_ELIGIBLE", eligibility.reason);
  }

  // มีใบที่ยังใช้งานอยู่แล้ว → คืนใบเดิม ไม่เปิดใบใหม่ (BR-ISHIP-22)
  const active = await prisma.orderShipment.findFirst({
    // ด่าน "ออเดอร์นี้มีพัสดุอยู่แล้ว" ต้องนับเฉพาะขาไป (feature 00056) — ไม่งั้นออเดอร์ที่
    // ออกเลขพัสดุขากลับไปแล้วจะเปิดพัสดุขาไปใบใหม่ไม่ได้ตลอดกาล
    where: { orderId, status: { not: "CANCELLED" }, direction: FORWARD_SHIPMENT },
    select: SHIPMENT_SELECT,
  });
  if (active) {
    if (active.status !== "FAILED") {
      throw new IShipServiceError(
        "SHIPMENT_EXISTS",
        "คำสั่งซื้อนี้มีพัสดุที่ยังใช้งานอยู่แล้ว",
      );
    }
    // ใบเดิมล้มอยู่ → นี่คือการกด "แก้ข้อมูลแล้วลองใหม่" จากฟอร์มเดียวกัน
    // ค่าที่ร้านเพิ่งกรอก (ขนส่ง/น้ำหนัก/ขนาด/COD/ตัวเลือก) ต้องมีผลจริง ไม่ใช่ถูกทิ้งเงียบ ๆ
    // แล้วยิงค่าชุดเดิมซ้ำ — ที่อยู่ถูกเขียนกลับเข้าออเดอร์ไปแล้วที่ด้านบน และ retryShipment
    // อ่านที่อยู่จากออเดอร์ใหม่ทุกครั้ง จึงไม่ต้องส่ง receiverPatch ต่อ
    const paymentNotice =
      override?.codAmount !== undefined
        ? await syncOrderPaymentToParcel(orderId, override.codAmount, userId)
        : undefined;
    const view = await retryShipment(shopId, userId, active.id, undefined, override);
    return paymentNotice === undefined ? view : { ...view, paymentNotice };
  }

  // attemptGroup = จำนวนใบที่เคยยกเลิกไปแล้ว + 1 (BR-ISHIP-26)
  const cancelledCount = await prisma.orderShipment.count({
    where: { orderId, status: "CANCELLED" },
  });
  const idempotencyKey = buildIdempotencyKey(orderId, cancelledCount + 1);

  const courierCode = override?.courierCode ?? account.defaultCourierCode;
  const categoryId = override?.categoryId ?? account.defaultCategoryId;
  const weight = override?.weight ?? (account.defaultWeight ? Number(account.defaultWeight) : null);
  const width = override?.width ?? account.defaultWidth;
  const length = override?.length ?? account.defaultLength;
  const height = override?.height ?? account.defaultHeight;

  // ตรวจก่อนยิงเสมอ — ปล่อยให้ iShip ปฏิเสธแล้วค่อยรู้ = ร้านได้ข้อความปลายทางที่อ่านไม่ออก
  // และเสียเวลาไปหนึ่งรอบ บอกเป็นช่อง ๆ ว่าขาดอะไร ไม่ใช่ "ข้อมูลไม่ครบ" ลอย ๆ
  const missingParcel = findMissingParcelFields({
    courierCode,
    categoryId,
    weight,
    width,
    length,
    height,
  });
  if (missingParcel.length > 0) {
    throw new IShipServiceError(
      "INCOMPLETE_DATA",
      `ยังตั้งค่าพัสดุไม่ครบ — ขาด ${missingParcel.join(", ")} (ตั้งได้ที่หน้าตั้งค่าการจัดส่ง)`,
      missingParcel,
    );
  }

  // 🛑 ห้ามให้ค่าตั้งต้น "ระดับร้าน" มาตัดสินเงินของ "ใบนี้" — ดู resolveDefaultCodAmount
  // (บั๊ก prod 2026-09-04: ออเดอร์โอนเงินถูกเปิดพัสดุเป็นเก็บปลายทางเท่ายอดบิลโดยไม่มีใครสั่ง)
  const codAmount =
    override?.codAmount ??
    resolveDefaultCodAmount({
      orderPaymentMethod: order.paymentMethod,
      orderTotal: Number(order.totalAmount),
    });
  const receiverAddress = order.shippingAddress as DeepAddress;

  const shipment = await prisma.orderShipment.create({
    data: {
      orderId,
      shopId,
      status: "PENDING",
      idempotencyKey,
      courierCode,
      // ชื่อขนส่งสำหรับแสดงผล — เก็บ ณ เวลาสร้าง ไม่ re-fetch ทุกครั้งที่เปิดดู
      // ถ้าดึงรายชื่อไม่ได้ ปล่อย null แล้วให้หน้าจอ fallback เป็นรหัสขนส่งแทน
      // (ห้ามให้การดึงชื่อมาบล็อกการสร้างพัสดุ — มันเป็นแค่ข้อความบนจอ)
      courierName: await resolveCourierName(shopId, courierCode),
      categoryId,
      weight,
      width,
      length,
      height,
      codAmount,
      senderSnapshot: senderOf(account) as object,
      receiverSnapshot: {
        name: order.buyerName,
        phone: order.buyerContact,
        ...receiverAddress,
      } as object,
      // หมายเหตุ freeze รวมมากับตัวเลือกเสริม — ถ้าอ่านสดตอนยิง ใบที่ retry ทีหลัง
      // จะได้หมายเหตุคนละอันกับที่ร้านกรอกไว้ตอนแรก (กติกาอยู่ใน buildOptionsSnapshot)
      optionsSnapshot: buildOptionsSnapshot(override, {
        optOnTime: account.optOnTime,
        optBoxShield: account.optBoxShield,
        optIsInsured: account.optIsInsured,
        optProductValue: account.optProductValue
          ? Number(account.optProductValue)
          : null,
        optServiceType: account.optServiceType,
        defaultRemark: account.defaultRemark,
      }) as object,
      createdByUserId: userId,
    },
    select: SHIPMENT_SELECT,
  });

  // ปรับวิธีชำระเงินของคำสั่งซื้อให้ตรงกับพัสดุที่กำลังจะเปิด (user สั่ง 2026-08-06)
  // ทำ "ก่อน" ยิงไป iShip โดยเจตนา: ถ้ายิงล้ม ใบยังอยู่ในสถานะ FAILED ให้ retry ได้ แต่
  // ข้อเท็จจริงที่ว่า "ร้านตั้งใจเก็บเงินปลายทาง" เกิดขึ้นแล้วตั้งแต่ตอนกดสร้าง
  const paymentNotice = await syncOrderPaymentToParcel(orderId, codAmount, userId);

  const view = await dispatchShipment(shopId, shipment.id, token);

  /**
   * ราคาโดยประมาณ ณ เวลาที่สร้าง — เก็บไว้ให้หน้ายอดขายมีตัวเลขใช้ระหว่างรอราคาจริง
   *
   * ทำไมต้องประมาณเอง: iShip ตัดเครดิตตอนกดสร้างก็จริง แต่ **ไม่เปิดราคาให้อ่านจนกว่าขนส่ง
   * จะเข้ารับและชั่งน้ำหนัก** — ใบที่ `status=1` คืน `discount_price = 0` เสมอ (พิสูจน์กับ
   * TH271991F5GZ5E 2026-08-10) หน้ายอดขายจึงเคยแสดงค่าส่งต่ำกว่าจริงมากจนผู้ขายทักเข้ามา
   *
   * 🛑 ยิง **หลัง** สร้างพัสดุสำเร็จเสมอ และห่อ try/catch ทั้งก้อน — นี่เป็นข้อมูลประกอบ
   * ไม่ใช่ด่าน ถ้า check-price ล่มแล้วไปทำให้การเปิดพัสดุล้มคือแลกของสำคัญกับของไม่สำคัญ
   * (check-price ไม่ก่อค่าใช้จ่ายตามเอกสาร 00022 จึงไม่มีต้นทุนแฝงจากการยิงเพิ่มใบละครั้ง)
   */
  try {
    // ค่าพวกนี้ผ่านด่าน missingParcel มาแล้วจึงไม่มีทางเป็น null จริง แต่ TS narrow ให้ไม่ได้
    // — เช็คซ้ำแทนการ cast เพราะถ้าวันหน้าด่านนั้นเปลี่ยน ตรงนี้จะข้ามไปเงียบ ๆ ไม่ใช่ส่ง null ออกไป
    if (courierCode == null || weight == null || width == null || length == null || height == null) {
      throw new Error('SKIP_ESTIMATE')
    }
    const quote = await iship.checkPrice(token, {
      courier_code: courierCode,
      ...buildCheckPricePayload(senderOf(account), receiverAddress, {
        weight,
        width,
        length,
        height,
      }),
    });
    const estimated = Number(quote?.total_price);
    // ≤ 0 = ขนส่งไม่รองรับเส้นทางนี้ ไม่ใช่ "ส่งฟรี" — เก็บ 0 ลงไปจะกลายเป็นต้นทุนค่าส่ง ฿0
    if (Number.isFinite(estimated) && estimated > 0) {
      await prisma.orderShipment.update({
        where: { id: shipment.id },
        data: { estimatedPrice: estimated },
      });
    }
  } catch {
    // เงียบโดยเจตนา — พัสดุเปิดสำเร็จไปแล้ว ผู้ใช้ไม่ควรเห็น error ของงานประกอบ
  }

  return { ...view, paymentNotice };
}

/**
 * createReturnShipment — เปิดพัสดุ **ขากลับ** ให้ใบคืนของ (feature 00056)
 *
 * 🛑 สลับผู้ส่ง/ผู้รับกับขาไปเป๊ะ ๆ: ผู้ส่ง = **ลูกค้า** (ที่อยู่จัดส่งของออเดอร์) ·
 * ผู้รับ = **ร้าน** (ที่อยู่ผู้ส่งในการตั้งค่า iShip) — ร้านไม่ต้องกรอกที่อยู่ใหม่เลย
 *
 * 🛑 `codAmount: 0` เสมอ — พัสดุขากลับเก็บเงินปลายทางไม่ได้ (ร้านจะกลายเป็นคนจ่ายเงินให้
 * ตัวเองผ่านขนส่ง) ค่าส่งตัดจากเครดิต iShip ของร้านอยู่แล้ว ซึ่งเป็นเหตุผลที่รูปแบบ
 * "ลูกค้าออกค่าส่ง + ให้ระบบออกเลข" เป็นไปไม่ได้ (validateReturnShipping กันไว้)
 *
 * ใช้ `dispatchShipment()` ตัวเดิมทั้งดุ้น — ตรรกะยิง/แปล error/บันทึกผลอยู่ที่นั่นที่เดียว
 * ห้ามก็อปมาเขียนใหม่ (สำเนาจะเลื่อนออกจากกันแน่นอน)
 */
export async function createReturnShipment(
  shopId: string,
  userId: string,
  orderId: string,
  override?: ShipmentOverride,
): Promise<ShipmentView> {
  const { account, token } = await loadAccount(shopId);

  const order = await prisma.order.findFirst({
    where: { id: orderId, shopId },
    select: {
      id: true,
      buyerName: true,
      buyerContact: true,
      shippingAddress: true,
      // สเปกกล่องของขาไป — ใช้เป็นค่าตั้งต้นของขากลับ (ของชิ้นเดิมกล่องเดิม)
      shipments: {
        where: { direction: FORWARD_SHIPMENT },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { courierCode: true, categoryId: true, weight: true, width: true, length: true, height: true },
      },
    },
  });
  if (!order) throw new IShipServiceError("NOT_FOUND", "ไม่พบคำสั่งซื้อนี้");

  const existing = await prisma.orderShipment.findFirst({
    where: { orderId, direction: RETURN_SHIPMENT, status: { not: "CANCELLED" } },
    select: { id: true, status: true },
  });
  if (existing && existing.status !== "FAILED") {
    throw new IShipServiceError("SHIPMENT_EXISTS", "คำสั่งซื้อนี้มีพัสดุขากลับอยู่แล้ว");
  }

  const fwd = order.shipments[0];
  const courierCode = override?.courierCode ?? fwd?.courierCode ?? account.defaultCourierCode;
  // Decimal → number ที่จุดเดียว — `findMissingParcelFields`/payload ของ iShip รับ number
  // (ท่าเดียวกับ createShipment บรรทัด 843 ห้ามปล่อย Decimal ไหลต่อ)
  const dec = (v: unknown) => (v == null ? null : Number(v));
  const weight = override?.weight ?? dec(fwd?.weight) ?? dec(account.defaultWeight);
  const width = override?.width ?? fwd?.width ?? account.defaultWidth;
  const length = override?.length ?? fwd?.length ?? account.defaultLength;
  const height = override?.height ?? fwd?.height ?? account.defaultHeight;
  const categoryId = override?.categoryId ?? fwd?.categoryId ?? account.defaultCategoryId;

  const missing = findMissingParcelFields({ courierCode, weight, width, length, height });
  if (missing.length > 0) {
    throw new IShipServiceError(
      "INCOMPLETE_DATA",
      `เปิดพัสดุขากลับไม่ได้ — ข้อมูลพัสดุยังไม่ครบ (${missing.join(", ")})`,
      missing,
    );
  }

  const buyerAddress = (order.shippingAddress as DeepAddress | null) ?? {};
  const shopSender = senderOf(account);

  /**
   * 🛑 P2002 ที่นี่ = **มีคนในร้านกดเปิดพัสดุขากลับพร้อมกัน** อีกคนสร้างสำเร็จไปก่อน
   * (partial unique `("orderId","direction") WHERE status <> 'CANCELLED'`)
   *
   * ด่าน `existing` ข้างบนกันได้แค่กรณีที่อ่านแล้วเห็น — ความถูกต้องต้องอยู่ที่ฐานเสมอ
   * เพราะสองคนกดพร้อมกันแล้วออกเลขพัสดุขากลับ 2 ใบ = จ่ายค่าส่งสองรอบและลูกค้าได้สองเลข
   *
   * ก่อน 2026-08-25 index ตัวนั้นไม่มีคอลัมน์ `direction` ⇒ **P2002 เกิดกับทุกใบเสมอ**
   * (ออเดอร์ที่คืนของได้ต้องมีพัสดุขาไป active อยู่แล้วโดยนิยาม) และตรงนี้ไม่มี catch เลย
   * ⇒ ร้านได้ 500 ดิบ · ระบบคืนของแบบ iShip จึงไม่เคยทำงานสักครั้งตั้งแต่ขึ้น prod
   */
  const shipment = await prisma.orderShipment
    .create({
    data: {
      orderId,
      shopId,
      status: "PENDING",
      direction: RETURN_SHIPMENT,
      idempotencyKey: `ret_${orderId}_${Date.now()}`,
      courierCode,
      courierName: await resolveCourierName(shopId, courierCode!),
      categoryId,
      weight,
      width,
      length,
      height,
      // ห้ามเก็บเงินปลายทางกับพัสดุขากลับ — ดูหัวฟังก์ชัน
      codAmount: 0,
      // ── สลับทิศ ──────────────────────────────────────────────────────────
      senderSnapshot: {
        name: order.buyerName,
        phone: order.buyerContact,
        address: buyerAddress.line1 ?? "",
        subdistrict: buyerAddress.subdistrict ?? null,
        district: buyerAddress.district ?? null,
        province: buyerAddress.province ?? null,
        postcode: buyerAddress.postcode ?? null,
      } as object,
      receiverSnapshot: {
        name: shopSender.name,
        phone: shopSender.phone,
        address: {
          line1: shopSender.address,
          subdistrict: shopSender.subdistrict,
          district: shopSender.district,
          province: shopSender.province,
          postcode: shopSender.postcode,
        },
      } as object,
      optionsSnapshot: buildOptionsSnapshot(override, {
        optOnTime: account.optOnTime,
        optBoxShield: account.optBoxShield,
        optIsInsured: account.optIsInsured,
        optProductValue: account.optProductValue ? Number(account.optProductValue) : null,
        optServiceType: account.optServiceType,
        defaultRemark: account.defaultRemark,
      }) as object,
      createdByUserId: userId,
    },
    select: SHIPMENT_SELECT,
    })
    .catch((e: unknown) => {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new IShipServiceError(
          "SHIPMENT_EXISTS",
          "คำสั่งซื้อนี้มีพัสดุขากลับอยู่แล้ว",
        );
      }
      throw e;
    });

  return dispatchShipment(shopId, shipment.id, token);
}

/**
 * retryShipment — ลองใหม่จากใบที่ล้มเหลว
 *
 * ใช้แถวเดิมและ idempotencyKey เดิมเสมอ (BR-ISHIP-26) — ห้ามสร้างแถวใหม่
 */
export async function retryShipment(
  shopId: string,
  userId: string,
  shipmentId: string,
  receiverPatch?: ReceiverPatch,
  override?: ShipmentOverride,
): Promise<ShipmentView> {
  const { token } = await loadAccount(shopId);
  const existing = await prisma.orderShipment.findFirst({
    where: { id: shipmentId, shopId },
    select: {
      id: true,
      status: true,
      orderId: true,
      courierCode: true,
      categoryId: true,
      weight: true,
      width: true,
      length: true,
      height: true,
      optionsSnapshot: true,
    },
  });
  if (!existing) throw new IShipServiceError("NOT_FOUND", "ไม่พบพัสดุนี้");
  if (existing.status !== "FAILED") {
    throw new IShipServiceError(
      "INVALID_STATE",
      "พัสดุนี้ไม่ได้อยู่ในสถานะที่ลองใหม่ได้",
    );
  }
  // ใบที่ล้มเพราะที่อยู่ไม่ผ่าน — ร้านแก้แล้วกดลองใหม่ได้ในที่เดียว
  if (receiverPatch) {
    await applyReceiverPatch(shopId, existing.orderId, receiverPatch);
  }

  // อ่านที่อยู่จากออเดอร์ใหม่ "ทุกครั้ง" ที่ลองใหม่ ไม่ใช่เฉพาะตอนมี receiverPatch แนบมา
  //
  // เหตุผล: ออเดอร์คือแหล่งความจริงของที่อยู่ (ดู applyReceiverPatch) ส่วน snapshot มีไว้
  // บันทึกว่า "ยิงอะไรออกไป" — พอลองใหม่ = กำลังจะยิงใหม่ ค่าที่ถูกต้องคือค่าปัจจุบันของออเดอร์
  //
  // เคสจริง prod 2026-08-06 (DP256908869471CB): ร้านแก้ที่อยู่ที่สะกดผิดผ่านฟอร์มสร้างพัสดุ
  // → createShipment เขียนที่อยู่ใหม่ลงออเดอร์แล้วเด้งมา retry โดยไม่ส่ง receiverPatch ต่อ
  // → เงื่อนไขเดิมข้ามการอัปเดต snapshot → ยิงที่อยู่ชุดเก่าซ้ำ ล้มด้วยข้อความเดิมทุกครั้ง
  // ร้านติดลูปแก้เท่าไรก็ไม่มีผล เพราะสิ่งที่ส่งออกไปไม่เคยเปลี่ยน
  const order = await prisma.order.findFirstOrThrow({
    where: { id: existing.orderId, shopId },
    select: { buyerName: true, buyerContact: true, shippingAddress: true },
  });
  await prisma.orderShipment.update({
    where: { id: shipmentId },
    data: {
      receiverSnapshot: {
        name: order.buyerName,
        phone: order.buyerContact,
        ...((order.shippingAddress as DeepAddress | null) ?? {}),
      } as object,
    },
  });

  // ค่าพัสดุที่ร้านกรอกใหม่มาพร้อมการลองใหม่ — เขียนทับ "เฉพาะช่องที่ส่งมา"
  // ห้าม fallback ไปค่าตั้งต้นของร้านสำหรับช่องที่ไม่ได้ส่ง เพราะใบนี้อาจถูกเปิดด้วยค่าที่
  // ไม่ใช่ค่าตั้งต้นมาตั้งแต่แรก การเติมค่าตั้งต้นจะเป็นการแอบเปลี่ยนสิ่งที่ร้านไม่ได้แตะ
  if (override) {
    const merged = {
      courierCode: override.courierCode ?? existing.courierCode,
      categoryId: override.categoryId ?? existing.categoryId,
      weight: override.weight ?? (existing.weight == null ? null : Number(existing.weight)),
      width: override.width ?? existing.width,
      length: override.length ?? existing.length,
      height: override.height ?? existing.height,
    };
    const missing = findMissingParcelFields(merged);
    if (missing.length > 0) {
      throw new IShipServiceError(
        "INCOMPLETE_DATA",
        `ยังตั้งค่าพัสดุไม่ครบ — ขาด ${missing.join(", ")} (ตั้งได้ที่หน้าตั้งค่าการจัดส่ง)`,
        missing,
      );
    }
    const snapshot = (existing.optionsSnapshot ?? {}) as Record<string, unknown>;
    await prisma.orderShipment.update({
      where: { id: shipmentId },
      data: {
        ...merged,
        // ชื่อขนส่งต้องตามรหัสที่เปลี่ยน ไม่งั้นจอจะโชว์ชื่อเจ้าเก่าคู่กับพัสดุของเจ้าใหม่
        ...(merged.courierCode !== existing.courierCode
          ? { courierName: await resolveCourierName(shopId, merged.courierCode) }
          : {}),
        ...(override.codAmount !== undefined ? { codAmount: override.codAmount } : {}),
        optionsSnapshot: {
          ...snapshot,
          ...(override.options ?? {}),
          ...(override.remark !== undefined ? { remark: override.remark } : {}),
        } as object,
      },
    });
  }

  await prisma.orderShipment.update({
    where: { id: shipmentId },
    data: { status: "PENDING", createdByUserId: userId },
  });
  return dispatchShipment(shopId, shipmentId, token);
}

/** ยิงคำขอจริงไป iShip แล้วบันทึกผล — ใช้ร่วมกันทั้งการสร้างครั้งแรกและการลองใหม่ */
async function dispatchShipment(
  shopId: string,
  shipmentId: string,
  token: string,
): Promise<ShipmentView> {
  const row = await prisma.orderShipment.findUniqueOrThrow({ where: { id: shipmentId } });
  const sender = row.senderSnapshot as unknown as SenderAddress;
  const receiver = row.receiverSnapshot as unknown as DeepAddress & {
    name: string;
    phone: string;
  };
  // หมายเหตุถูกเก็บรวมมากับตัวเลือกเสริมใน snapshot ก้อนเดียว
  const snapshot = row.optionsSnapshot as unknown as
    | (NonNullable<ShipmentOverride["options"]> & { remark?: string | null })
    | null;
  const options = snapshot ?? undefined;

  const order = await prisma.order.findUniqueOrThrow({
    where: { id: row.orderId },
    select: { items: { select: { name: true, qty: true, price: true } } },
  });

  const payload = buildCreateOrderPayload({
    idempotencyKey: row.idempotencyKey,
    courierCode: row.courierCode!,
    sender,
    receiver: { name: receiver.name, phone: receiver.phone, address: receiver },
    parcel: {
      weight: Number(row.weight),
      width: row.width!,
      length: row.length!,
      height: row.height!,
      categoryId: row.categoryId!,
    },
    codAmount: Number(row.codAmount),
    // เคยหลุดตรงนี้: BuildPayloadInput รับ remark มาตลอด แต่ไม่มีใครส่งให้ —
    // หมายเหตุอย่าง "ห้ามโยน" ที่ร้านกรอกจึงไม่เคยถึงขนส่งเลย (user report 2026-07-31)
    remark: snapshot?.remark ?? null,
    options,
    items: order.items.map((i) => ({ name: i.name, qty: i.qty, price: Number(i.price) })),
  });

  try {
    const { result, dryRun } = await withTokenGuard(shopId, () =>
      iship.createOrder(token, payload),
    );
    // event อยู่ใน tx เดียวกับการ mark CREATED (feature 00031) — actor = คนที่กดสร้าง/ลองใหม่
    // (row.createdByUserId ถูกเขียนทับตอน retry แล้ว จึงเป็นคนล่าสุดที่กดจริงเสมอ)
    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.orderShipment.update({
        where: { id: shipmentId },
        data: {
          status: "CREATED",
          trackingNo: result.tracking_number,
          refCode: result.ref,
          externalId: result.id != null ? String(result.id) : null,
          isDryRun: dryRun,
          attemptCount: { increment: 1 },
          lastErrorCode: null,
          lastErrorMessage: null,
        },
        select: SHIPMENT_SELECT,
      });
      await recordOrderEvent(tx, {
        orderId: row.orderId,
        type: "SHIPMENT_CREATED",
        actorUserId: row.createdByUserId,
        meta: { shipmentId, courierName: row.courierName ?? undefined },
      });
      return u;
    });
    return toShipmentView(updated);
  } catch (err) {
    const code = err instanceof IShipError ? err.code : "UPSTREAM_ERROR";
    const upstream =
      err instanceof IShipError
        ? err.upstreamMessage
        : err instanceof Error
          ? err.message
          : String(err);
    const updated = await prisma.orderShipment.update({
      where: { id: shipmentId },
      data: {
        status: "FAILED",
        attemptCount: { increment: 1 },
        lastErrorCode: code,
        lastErrorMessage: upstream ?? null,
      },
      select: SHIPMENT_SELECT,
    });
    return toShipmentView(updated);
  }
}

export async function cancelShipment(
  shopId: string,
  userId: string,
  shipmentId: string,
): Promise<ShipmentView> {
  const { token } = await loadAccount(shopId);
  const row = await prisma.orderShipment.findFirst({
    where: { id: shipmentId, shopId },
    select: {
      id: true,
      status: true,
      trackingNo: true,
      refCode: true,
      courierCode: true,
    },
  });
  if (!row) throw new IShipServiceError("NOT_FOUND", "ไม่พบพัสดุนี้");
  if (row.status === "CANCELLED") {
    throw new IShipServiceError("INVALID_STATE", "พัสดุนี้ถูกยกเลิกไปแล้ว");
  }

  // ใบที่ยังไม่มี tracking (FAILED ตั้งแต่แรก) ไม่ต้องแจ้ง iShip — ไม่มีอะไรให้ยกเลิกที่นั่น
  //
  // iShip ระบุพัสดุด้วย ref_code + courier_code — ใบเก่าที่ไม่ได้เก็บ refCode ไว้จึงยกเลิก
  // ฝั่งโน้นไม่ได้ ต้องบอกตรง ๆ ให้ไปยกเลิกที่หลังบ้าน iShip แทนการปิดใบฝั่งเราเงียบ ๆ
  // แล้วปล่อยพัสดุจริงค้างอยู่กับขนส่ง
  if (row.trackingNo) {
    if (!row.refCode || !row.courierCode) {
      throw new IShipServiceError(
        "INVALID_STATE",
        "ยกเลิกพัสดุใบนี้จากที่นี่ไม่ได้ เพราะไม่มีรหัสอ้างอิงของ iShip กรุณายกเลิกที่ระบบ iShip โดยตรง",
      );
    }
    await withTokenGuard(shopId, () =>
      iship.cancelOrder(token, {
        courierCode: row.courierCode!,
        refCode: row.refCode!,
      }),
    );
  }

  // event อยู่ใน tx เดียวกับการ mark CANCELLED (feature 00031)
  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.orderShipment.update({
      where: { id: shipmentId },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelledByUserId: userId,
      },
      select: SHIPMENT_SELECT,
    });
    await recordOrderEvent(tx, {
      orderId: u.orderId,
      type: "SHIPMENT_CANCELLED",
      actorUserId: userId,
      meta: { shipmentId, courierName: u.courierName ?? undefined },
    });
    return u;
  });
  return toShipmentView(updated);
}

// ─── ใบปะหน้า ───────────────────────────────────────────────────────────────

export interface SkippedLabel {
  shipmentId: string;
  reason: string;
}

/**
 * getLabelPdf — ดึงใบปะหน้า A6 (เดี่ยวหรือหลายใบ)
 *
 * FR-ISHIP-031: ต้องบอกว่ารายการไหนถูกข้ามเพราะอะไร ห้ามตัดทิ้งเงียบ ๆ
 */
export async function getLabelPdf(
  shopId: string,
  shipmentIds: string[],
): Promise<{ pdf: ArrayBuffer; skipped: SkippedLabel[] }> {
  const { token } = await loadAccount(shopId);

  const rows = await prisma.orderShipment.findMany({
    where: { id: { in: shipmentIds }, shopId },
    select: { id: true, status: true, trackingNo: true },
  });

  const skipped: SkippedLabel[] = [];
  const found = new Map(rows.map((r) => [r.id, r]));
  const tracks: string[] = [];

  // ไล่ตามลำดับที่ผู้ใช้เลือกมา — ใบปะหน้าจะได้เรียงตรงกับที่เห็นบนหน้าจอ
  for (const id of shipmentIds) {
    const row = found.get(id);
    if (!row) {
      skipped.push({ shipmentId: id, reason: "ไม่พบพัสดุนี้ในร้านของคุณ" });
      continue;
    }
    if (row.status === "CANCELLED") {
      skipped.push({ shipmentId: id, reason: "พัสดุถูกยกเลิกแล้ว" });
      continue;
    }
    if (!row.trackingNo) {
      skipped.push({ shipmentId: id, reason: "ยังไม่มีเลขติดตาม (สร้างพัสดุไม่สำเร็จ)" });
      continue;
    }
    tracks.push(row.trackingNo);
  }

  if (tracks.length === 0) {
    throw new IShipServiceError(
      "INVALID_STATE",
      "ไม่มีพัสดุที่พิมพ์ใบปะหน้าได้ในรายการที่เลือก",
    );
  }

  const pdf = await withTokenGuard(shopId, () => iship.downloadLabel(token, tracks));

  await prisma.orderShipment.updateMany({
    where: { id: { in: shipmentIds }, shopId, trackingNo: { not: null } },
    data: { labelPrintedAt: new Date(), labelPrintCount: { increment: 1 } },
  });

  return { pdf, skipped };
}

/**
 * getLabelPdfForOrders — พิมพ์ใบปะหน้าจาก "รหัสคำสั่งซื้อ" แทน id ของพัสดุ
 *
 * หน้ารายการคำสั่งซื้อรู้จักแค่ publicToken/shortCode ไม่รู้จัก id ของพัสดุ
 * ถ้าจะให้ UI ไปหา id เองต้องยัด field เพิ่มเข้าไปในตารางทั้งตาราง เพียงเพื่อใช้ตอนพิมพ์
 * — แปลง token เป็นพัสดุที่ฝั่งเซิร์ฟเวอร์แทน ตารางจึงไม่ต้องรู้เรื่องพัสดุเลย
 */
export async function getLabelPdfForOrders(
  shopId: string,
  orderTokens: string[],
): Promise<{ pdf: ArrayBuffer; skipped: SkippedLabel[] }> {
  const orders = await prisma.order.findMany({
    where: {
      shopId,
      OR: [{ publicToken: { in: orderTokens } }, { shortCode: { in: orderTokens } }],
    },
    select: {
      publicToken: true,
      shortCode: true,
      shipments: {
        where: LATEST_FORWARD_SHIPMENT,
        select: { id: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  const byToken = new Map<string, string | null>();
  for (const o of orders) {
    const shipmentId = o.shipments[0]?.id ?? null;
    byToken.set(o.publicToken, shipmentId);
    if (o.shortCode) byToken.set(o.shortCode, shipmentId);
  }

  const shipmentIds: string[] = [];
  const skipped: SkippedLabel[] = [];
  // ไล่ตามลำดับที่ผู้ใช้เลือก — ใบปะหน้าจะได้เรียงตรงกับที่เห็นบนหน้าจอ
  for (const token of orderTokens) {
    if (!byToken.has(token)) {
      skipped.push({ shipmentId: token, reason: "ไม่พบคำสั่งซื้อนี้ในร้านของคุณ" });
      continue;
    }
    const id = byToken.get(token);
    if (!id) {
      skipped.push({ shipmentId: token, reason: "ยังไม่ได้สร้างพัสดุสำหรับคำสั่งซื้อนี้" });
      continue;
    }
    shipmentIds.push(id);
  }

  if (shipmentIds.length === 0) {
    throw new IShipServiceError(
      "INVALID_STATE",
      "ไม่มีคำสั่งซื้อที่พิมพ์ใบปะหน้าได้ในรายการที่เลือก",
    );
  }

  const result = await getLabelPdf(shopId, shipmentIds);
  return { pdf: result.pdf, skipped: [...skipped, ...result.skipped] };
}

// ─── ประวัติการเดินทาง ──────────────────────────────────────────────────────

// parseCarrierTimestamp ย้ายไป lib/iship/status.ts แล้ว (2026-08-06) — ตัวแปลงเดียวกันนี้
// ถูกใช้ทั้งกับ traces และกับ settlement_at ของ COD จึงต้องอยู่ในโมดูล pure ที่เทสได้

/**
 * advanceOrderOnCarrierMove — ขนส่งรับของไปแล้ว → ขยับคำสั่งซื้อเป็น "จัดส่งแล้ว" อัตโนมัติ
 *
 * user สั่ง 2026-08-04: "ถ้าสถานะ >= กำลังจัดส่ง ต้องเท่ากับคำสั่งซื้อส่งแล้ว โดยอัตโนมัติ"
 *
 * ที่มาของปัญหา: ชิป "กำลังจัดส่ง" ในหน้า /orders ตัดสินจาก *สถานะพัสดุ* แต่ป้ายบนแถวตัดสินจาก
 * *Order.status* — ใบที่ขนส่งรับของไปแล้วแต่ร้านไม่ได้กด "แจ้งจัดส่ง" เอง จึงขึ้นอยู่ในชิป
 * "กำลังจัดส่ง" พร้อมป้ายสีส้ม "รอดำเนินการ" ในจอเดียวกัน (user ส่งภาพมาให้ดู)
 *
 * ขอบเขตที่ทำได้ (user เคาะแล้ว): PENDING → SHIPPED **เท่านั้น**
 * ห้ามขยับไป CONFIRMED เด็ดขาด แม้ขนส่งจะแจ้ง delivered — CONFIRMED เป็นสถานะปลายทางที่
 * ย้อนกลับไม่ได้ตาม state machine และแปลว่า "ผู้ซื้อยืนยันรับของแล้ว" ซึ่งกระทบ Trust Score
 * และสิทธิ์รีวิว การตั้งเองเท่ากับปลอมคำยืนยันของผู้ซื้อ (BR-ISHIP-41 ยังคุมส่วนนี้อยู่)
 *
 * คืน true เมื่อขยับจริง — ผู้เรียกใช้บอก caller ได้ว่ามีอะไรเปลี่ยน
 */
export async function advanceOrderOnCarrierMove(
  orderId: string,
  carrierStatus: string | null | undefined,
): Promise<boolean> {
  if (!impliesDispatched(carrierStatus)) return false;
  // conditional update — เช็คแล้วเขียนในคำสั่งเดียว กันสองทาง (webhook/poll) ยิงพร้อมกัน
  // แล้วดึงออเดอร์ที่เพิ่งถูกยืนยัน/ยกเลิกไปเสี้ยววินาทีก่อน กลับมาเป็น "จัดส่งแล้ว"
  const r = await prisma.order.updateMany({
    where: { id: orderId, status: "PENDING" },
    data: { status: "SHIPPED" },
  });
  return r.count > 0;
}

/**
 * สถานะปัจจุบันของพัสดุ ณ วินาทีที่ตอบกลับ — คืนคู่กับไทม์ไลน์ **เสมอ**
 *
 * 🛑 ทำไมต้องคืนมาด้วย (user เจอบน prod 2026-08-20 — TH068661575518):
 * `getTraces()` ยิง `get_order` แล้ว *เขียนสถานะใหม่ลงฐานจริง* แต่ endpoint คืนแค่ events
 * หัวการ์ด/แถบ 4 ขั้นบนหน้าจออ่านจาก prop ที่ server render ไว้ตอนเปิดหน้า ⇒ ฐานถูกแล้ว
 * แต่จอยังบอกร้านว่า "กำลังจัดส่ง" ต่อไปจนกว่าจะรีโหลด และรายการเดินทางที่อยู่ใต้มัน
 * (ซึ่งขึ้นว่า "ส่งคืนสำเร็จ" แล้ว) กลายเป็นหลักฐานที่ค้านหัวการ์ดของตัวเองในจอเดียวกัน
 *
 * อ่านกลับจากฐานหลังเขียน ไม่ใช่ประกอบจาก payload ที่เพิ่งได้: `get_order` ล้มเหลวได้
 * (โค้ดข้างล่างกลืน error ไว้โดยเจตนา) กรณีนั้นค่าที่ถูกต้องคือค่าที่เก็บไว้ ไม่ใช่ค่าว่าง
 */
export interface TraceCarrierState {
  /** OrderShipment.status ของเรา (CREATED/CANCELLED/FAILED) — ไม่ใช่สถานะขนส่ง */
  status: string;
  carrierStatus: string | null;
  carrierStatusText: string | null;
  carrierStatusAt: Date | null;
}

const CARRIER_STATE_SELECT = {
  status: true,
  carrierStatus: true,
  carrierStatusText: true,
  carrierStatusAt: true,
} as const;

/** เพิ่มจาก CARRIER_STATE_SELECT เฉพาะช่องที่ carrierTrackingSettled() ต้องใช้ */
const TRACKING_SETTLED_SELECT = { codAmount: true, codSettledAt: true } as const;

function carrierStateOf(row: TraceCarrierState): TraceCarrierState {
  return {
    status: row.status,
    carrierStatus: row.carrierStatus,
    carrierStatusText: row.carrierStatusText,
    carrierStatusAt: row.carrierStatusAt,
  };
}

type ShipmentEventRow = Awaited<
  ReturnType<typeof prisma.shipmentEvent.findMany>
>[number];

export interface TraceResult {
  events: ShipmentEventRow[];
  carrier: TraceCarrierState;
}

export async function getTraces(
  shopId: string,
  shipmentId: string,
): Promise<TraceResult> {
  const { token } = await loadAccount(shopId);
  const row = await prisma.orderShipment.findFirst({
    where: { id: shipmentId, shopId },
    select: {
      id: true,
      trackingNo: true,
      orderId: true,
      ...CARRIER_STATE_SELECT,
      ...TRACKING_SETTLED_SELECT,
    },
  });
  if (!row) throw new IShipServiceError("NOT_FOUND", "ไม่พบพัสดุนี้");
  if (!row.trackingNo) return { events: [], carrier: carrierStateOf(row) };

  /**
   * พัสดุที่จบเส้นทางแล้ว = ถามซ้ำได้คำตอบเดิมตลอดกาล → อ่านจากฐานอย่างเดียว
   * (user เสนอเอง 2026-08-24: "ถ้าสถานะมันสิ้นสุดแล้ว ไม่ต้องยิง API ให้เสียเวลา")
   *
   * ประหยัด **2 คำขอต่อการเปิดดู 1 ครั้ง** (`/api/traces` + `get_order`) และ hover ในหน้า
   * รายการยิงทุกครั้งที่เมาส์ผ่าน
   *
   * 🛑 ต้องมีเหตุการณ์เก็บไว้แล้วถึงจะข้ามได้ — ใบที่จบเส้นทางโดยที่ยังไม่เคยดึงไทม์ไลน์เลย
   * (ปิดจากฝั่ง webhook/poller ล้วน) ยังต้องยิงครั้งแรกให้ ไม่งั้นมันจะว่างเปล่าตลอดไป
   * โดยไม่มีทางกู้
   *
   * 🛑 เกณฑ์ต้องเป็น `carrierTrackingSettled` ไม่ใช่ `isTerminalCarrierStatus` — `delivered`
   * ของใบ COD ยังมี `payment_success` ตามมาทีหลัง (BR-ISHIP-49)
   */
  if (carrierTrackingSettled({ ...row, codAmount: Number(row.codAmount ?? 0) })) {
    const stored = await prisma.shipmentEvent.findMany({
      where: { shipmentId: row.id },
      orderBy: { occurredAt: "asc" },
    });
    if (stored.length > 0) return { events: stored, carrier: carrierStateOf(row) };
  }

  /**
   * ดึงไม่ได้ = ยังอ่านของเก่าที่เก็บไว้ได้ — ไม่ใช่พังทั้งหน้า
   *
   * ไทม์ไลน์เป็นการ "อ่านอย่างเดียว" การโยน error ทิ้งทั้งก้อนเพราะ upstream สะดุด
   * แปลว่าเราทิ้งข้อมูลที่เก็บไว้แล้วโดยเปล่าประโยชน์ (โค้ดข้างล่างเก็บลง ShipmentEvent
   * ไว้ตั้งแต่แรกก็เพื่อกรณีนี้ แต่เดิมไม่เคยถูกใช้อ่าน)
   *
   * TOKEN_INVALID ไม่กลืน — นั่นคือเรื่องที่ร้านต้องไปแก้ ไม่ใช่ความสะดุดชั่วคราว
   */
  let routes: Awaited<ReturnType<typeof iship.getTraces>>;
  try {
    routes = await withTokenGuard(shopId, () =>
      iship.getTraces(token, row.trackingNo!),
    );
  } catch (err) {
    if (err instanceof IShipError && err.code !== "TOKEN_INVALID") {
      const stored = await prisma.shipmentEvent.findMany({
        where: { shipmentId: row.id },
        orderBy: { occurredAt: "asc" },
      });
      // ดึงไม่ได้ = ไม่มีอะไรใหม่ให้บอก ⇒ คืนสถานะที่เก็บไว้ตามเดิม (ห้ามคืนค่าว่าง —
      // หน้าจอจะใช้มันไปทับค่าที่ถูกอยู่แล้ว)
      if (stored.length > 0) return { events: stored, carrier: carrierStateOf(row) };
    }
    throw err;
  }

  // เก็บลงฐานข้อมูลด้วย เพื่อให้ไทม์ไลน์ยังอ่านได้แม้ผู้ให้บริการล่ม
  for (const r of routes) {
    const occurredAt = parseCarrierTimestamp(r.timestamp);
    if (!occurredAt) continue;
    await prisma.shipmentEvent.upsert({
      where: {
        shipmentId_dedupeKey: {
          shipmentId: row.id,
          dedupeKey: `${r.status}:${occurredAt.getTime()}`,
        },
      },
      create: {
        shipmentId: row.id,
        status: r.status,
        statusText: r.status_text,
        statusDesc: r.status_desc,
        location: r.current_location,
        occurredAt,
        source: "POLL",
        dedupeKey: `${r.status}:${occurredAt.getTime()}`,
      },
      update: {},
    });
    await stampReturnDispatch(row.id, r.status, r.status_desc, occurredAt);
  }

  // sync สถานะล่าสุดลง OrderShipment ด้วย ไม่ใช่บันทึกแค่ไทม์ไลน์
  //
  // [สำคัญที่สุดในไฟล์นี้] สถานะปัจจุบันต้องอ่านจาก **สถานะระดับออเดอร์ของ iShip (get_order)**
  //    ห้ามอ่านจากแถว trace เด็ดขาด
  //
  // บั๊กที่แก้ (user เจอบน prod 2026-08-06 — TH061118024638 ขนส่ง SPX): หน้าจอ iShip เอง
  // ขึ้น "รอเข้ารับพัสดุ" แต่ของเราขึ้น "กำลังจัดส่ง" ตั้งแต่ 3 วินาทีหลังเปิดพัสดุ เพราะ
  // trace แถวแรกของ SPX มาเป็น status `picked_up` พร้อมคำอธิบาย "ผู้ส่งกำลังเตรียมพัสดุ"
  // — คือเหตุการณ์ *สร้างพัสดุ* ที่ถูกติดป้ายเป็น *เข้ารับแล้ว* (เจอครบทั้ง 3 ใบ SPX ที่มี
  // บนฐาน prod ไม่ใช่ใบเดียว) แล้ว `picked_up` อยู่ใน IN_TRANSIT_CARRIER_STATUSES
  // → แถบสถานะกระโดดไป "กำลังจัดส่ง" และ impliesDispatched() ยังดันคำสั่งซื้อ
  // PENDING → SHIPPED ให้อัตโนมัติทั้งที่ขนส่งยังไม่มารับของ
  //
  // แยกหน้าที่ให้ชัด: trace = *ข้อความเล่าการเดินทาง* (เก็บลง ShipmentEvent ข้างบน ถูกต้อง
  // ในฐานะประวัติ) ส่วน "สถานะปัจจุบัน" มีเจ้าของเดียวคือ status ระดับออเดอร์ ซึ่งเป็นค่า
  // เดียวกับที่ syncShipmentStatuses (query_orders) และ webhook เขียน — สองทางนี้จึงพูด
  // ตรงกันเสมอ และตรงกับสิ่งที่ร้านเห็นบนเว็บ iShip ด้วย
  //
  // เดิมสองทางตีกันจริง: รอบ sync เขียน order_success แล้วการเอาเมาส์ไป hover เขียน
  // picked_up ทับ สลับไปมาทุก 15 นาทีโดยไม่มีอะไรฟ้อง
  try {
    const parcel = parseParcelRow(
      await withTokenGuard(shopId, () => iship.getOrder(token, row.trackingNo!)),
    );
    const code = carrierStatusCodeFromId(parcel?.statusId);
    if (code) {
      await prisma.orderShipment.update({
        where: { id: row.id },
        data: {
          carrierStatus: code,
          // ใช้ describeCarrierStatus ไม่ใช่ status_name ที่ iShip ส่งมา เพื่อให้ข้อความ
          // ตรงกับทางเข้าอื่น (sync/webhook) ทุกตัวอักษร — คำเดียวกันต้องสะกดแบบเดียว
          carrierStatusText: describeCarrierStatus(code).text,
          carrierStatusAt: parcel?.updatedAtRaw ? new Date(parcel.updatedAtRaw) : new Date(),
        },
      });
      await stampReturnLeg(
        row.id,
        code,
        parcel?.updatedAtRaw ? new Date(parcel.updatedAtRaw) : new Date(),
      );
      await advanceOrderOnCarrierMove(row.orderId, code);
    }
  } catch {
    // อ่านสถานะไม่ได้ = คงค่าเดิมไว้ ไทม์ไลน์ที่เพิ่งบันทึกยังแสดงได้ตามปกติ
    // ห้ามถอยไปใช้สถานะจาก trace แทน — นั่นคือต้นเหตุของบั๊กที่บล็อกข้างบนอธิบายไว้
  }

  // อ่านสถานะกลับจากฐาน **หลัง** บล็อกข้างบนเสมอ — นี่คือค่าที่หน้าจอจะเอาไปแทนที่ของเดิม
  const [events, fresh] = await Promise.all([
    prisma.shipmentEvent.findMany({
      where: { shipmentId: row.id },
      orderBy: { occurredAt: "asc" },
    }),
    prisma.orderShipment.findUnique({
      where: { id: row.id },
      select: CARRIER_STATE_SELECT,
    }),
  ]);

  return { events, carrier: carrierStateOf(fresh ?? row) };
}

// ─── เรียกรถเข้ารับ ─────────────────────────────────────────────────────────

export async function requestPickup(
  shopId: string,
  userId: string,
  input: { courierCode: string; parcelCount: number; remark?: string | null },
) {
  const { account, token } = await loadAccount(shopId);

  const missing = findMissingSenderFields(senderOf(account));
  if (missing.length > 0) {
    throw new IShipServiceError(
      "INCOMPLETE_DATA",
      `เรียกรถเข้ารับไม่ได้ — ที่อยู่ผู้ส่งยังไม่ครบ (${missing.join(", ")})`,
      missing,
    );
  }

  const pickupAddress = [
    account.senderAddress,
    `ต.${account.senderSubdistrict}`,
    `อ.${account.senderDistrict}`,
    `จ.${account.senderProvince}`,
    account.senderPostcode,
  ].join(" ");

  try {
    const { result, dryRun } = await withTokenGuard(shopId, () =>
      iship.requestPickup(token, {
        courier_code: input.courierCode,
        pickup_address: pickupAddress,
        name: account.senderName!,
        phone: account.senderPhone!,
        parcel: input.parcelCount,
        remark: input.remark ?? undefined,
      }),
    );

    return prisma.shipmentPickup.create({
      data: {
        shopId,
        courierCode: input.courierCode,
        ticketPickupId: result.ticketPickupId != null ? String(result.ticketPickupId) : null,
        parcelCount: input.parcelCount,
        pickupAddress,
        remark: input.remark ?? null,
        status: "REQUESTED",
        staffName: result.staffInfoName ?? null,
        staffPhone: result.staffInfoPhone ?? null,
        timeoutAtText: result.timeoutAtText ?? null,
        ticketMessage: result.ticketMessage ?? null,
        isDryRun: dryRun,
        createdByUserId: userId,
      },
    });
  } catch (err) {
    // บันทึกความล้มเหลวไว้ด้วย เพื่อให้ร้านเห็นว่าเคยพยายามเรียกแล้วไม่สำเร็จ
    await prisma.shipmentPickup.create({
      data: {
        shopId,
        courierCode: input.courierCode,
        parcelCount: input.parcelCount,
        pickupAddress,
        remark: input.remark ?? null,
        status: "FAILED",
        lastErrorMessage:
          err instanceof IShipError
            ? (err.upstreamMessage ?? err.userMessage)
            : String(err),
        createdByUserId: userId,
      },
    });
    throw err;
  }
}

/**
 * stampReturnLeg — ประทับเวลา "ขากลับ" ลงแถวพัสดุขาไป (write-once ทั้งสองคอลัมน์)
 *
 * 🛑 ต้องเรียกจาก **ทุกทางที่เขียน `carrierStatus`** ปัจจุบันมี 3 ทาง:
 *   1. `handleStatusWebhook()`   — iShip ยิงมาบอก
 *   2. `applyCarrierStatus()`    — รอบ poll `syncShipmentStatuses` (query_orders)
 *   3. บล็อกรีเฟรชใน `getTraces()` — ตอนร้านเปิดดูการเดินทาง (get_order รายใบ)
 * ทางไหนไม่เรียก = พัสดุที่ตีกลับผ่านทางนั้นจะไม่มีวันเวลาบนไทม์ไลน์ โดยไม่มี error ให้เห็น
 * (`deliveredAt` มีบั๊กนี้อยู่จริงตอนนี้ — ทางที่ 3 ไม่เคยประทับให้เลย)
 *
 * `updateMany` + `WHERE <col> IS NULL` คือหัวใจ ไม่ใช่การกันพลาด: event `return` เกิดซ้ำได้
 * 7–8 ครั้งต่อพัสดุใบเดียว (ขนส่งพยายามส่งใหม่หลายรอบก่อนยอมตีกลับ — ข้อมูลจริงบน prod)
 * ถ้าเขียนทับได้ "วันที่เริ่มตีกลับ" จะขยับทุกครั้งที่ขนส่งลองใหม่
 */
async function stampReturnLeg(
  shipmentId: string,
  code: string | null | undefined,
  occurredAt: Date,
): Promise<void> {
  // เขียนแยกสองกิ่งแทนการใช้ computed key เพราะ Prisma ต้องการชื่อคอลัมน์แบบ literal
  // ถึงจะตรวจชนิดให้ได้ — computed key จะกลายเป็น any แล้วสะกดผิดก็ไม่มีอะไรฟ้อง
  const col = returnLegStampOf(code);
  if (col === "returnStartedAt") {
    await prisma.orderShipment.updateMany({
      where: { id: shipmentId, returnStartedAt: null },
      data: { returnStartedAt: occurredAt },
    });
  } else if (col === "returnedAt") {
    await prisma.orderShipment.updateMany({
      where: { id: shipmentId, returnedAt: null },
      data: { returnedAt: occurredAt },
    });
  }
}

/**
 * stampReturnDispatch — ประทับเวลา "ขนส่งกำลังนำพัสดุมาส่งคืนที่ร้าน" (write-once)
 *
 * 🛑 ต้องเรียกจาก **ทุกที่ที่เขียน `ShipmentEvent`** เพราะสัญญาณนี้อยู่ใน `statusDesc`
 * ซึ่งมีเฉพาะตอนเขียน event ไม่ได้อยู่ในรหัสสถานะที่ `applyCarrierStatus` เห็น
 * ⇒ ต่างจาก `stampReturnLeg` ที่ผูกกับรหัส — สองตัวนี้จึงเรียกคนละจุดกัน
 */
async function stampReturnDispatch(
  shipmentId: string,
  code: string | null | undefined,
  statusDesc: string | null | undefined,
  occurredAt: Date,
): Promise<void> {
  if (!isReturnDispatchEvent(code, statusDesc)) return;
  await prisma.orderShipment.updateMany({
    where: { id: shipmentId, returnDispatchedAt: null },
    data: { returnDispatchedAt: occurredAt },
  });
}

// ─── webhook (ไม่มี session — จับคู่จากข้อมูลใน payload) ────────────────────

/**
 * handleStatusWebhook — รับแจ้งสถานะพัสดุจาก iShip (FR-ISHIP-041)
 *
 * ข้อควรระวังสูงสุด: ห้ามเปลี่ยน Order.status ไม่ว่ากรณีใด (BR-ISHIP-41)
 * การยืนยันรับของโดยผู้ซื้อคือเงื่อนไขเดียวที่ทำให้คำสั่งซื้อสำเร็จและมีผลต่อ Trust Score
 * ถ้าปล่อยให้ระบบภายนอกดันออเดอร์เป็นสำเร็จได้ จะเปิดช่องปั่นคะแนนด้วยพัสดุปลอม
 *
 * ฟังก์ชันนี้ต้องไม่โยน error ออกไป — route ตอบ 200 ไปแล้ว และการโยนจะทำให้
 * ผู้ให้บริการยิงซ้ำรัวโดยไม่มีประโยชน์
 */
export async function handleStatusWebhook(payload: unknown): Promise<void> {
  if (!payload || typeof payload !== "object") return;
  const p = payload as Record<string, unknown>;

  const refCode = typeof p.ref_code === "string" ? p.ref_code : null;
  const tracking = typeof p.tracking === "string" ? p.tracking : null;
  const status = typeof p.status === "string" ? p.status : null;
  if (!status || (!refCode && !tracking)) return;

  // จับคู่ด้วย refCode ก่อน (เจาะจงกว่า) แล้วค่อย trackingNo
  const shipment = await prisma.orderShipment.findFirst({
    where: refCode ? { refCode } : { trackingNo: tracking! },
    select: { id: true, orderId: true },
  });
  if (!shipment) {
    // จับคู่ไม่ได้ = พัสดุของระบบอื่นที่ใช้บัญชี iShip เดียวกัน หรือข้อมูลเพี้ยน
    // ทิ้งไป แต่ log ไว้ให้ทีมงานตรวจสอบได้ว่าเกิดบ่อยแค่ไหน
    console.warn("[iship] webhook ที่จับคู่กับพัสดุในระบบไม่ได้", { refCode, tracking });
    return;
  }

  // timestamp ของ iShip เป็น epoch วินาที — ถ้าไม่มีให้ใช้เวลาที่รับเข้ามาแทน
  const epoch = typeof p.timestamp === "number" ? p.timestamp * 1000 : Date.now();
  const occurredAt = new Date(epoch);
  const dedupeKey = `${status}:${occurredAt.getTime()}`;

  const meta = describeCarrierStatus(status);

  await prisma.shipmentEvent.upsert({
    where: { shipmentId_dedupeKey: { shipmentId: shipment.id, dedupeKey } },
    create: {
      shipmentId: shipment.id,
      status,
      statusText: meta.text,
      statusDesc: typeof p.status_desc === "string" ? p.status_desc : null,
      occurredAt,
      source: "WEBHOOK",
      dedupeKey,
      payload: p as object,
    },
    update: {}, // ยิงซ้ำ = ไม่ทำอะไร (FR-ISHIP-041)
  });

  await prisma.orderShipment.update({
    where: { id: shipment.id },
    data: {
      carrierStatus: status,
      carrierStatusText: meta.text,
      carrierStatusAt: occurredAt,
      isOverWeight: p.is_over_weight === true,
      isOverSize: p.is_over_size === true,
      carrierPrice: typeof p.price === "number" ? p.price : undefined,
    },
  });

  // feature 00039 (TFR-004) — บันทึกเวลาที่พัสดุถึงมือผู้รับ "ครั้งแรก" แยกจาก carrierStatusAt
  //
  // 🛑 updateMany + WHERE deliveredAt IS NULL คือหัวใจ ไม่ใช่การกันพลาด:
  // ถ้าเขียนทับได้ ใบ COD ที่เดินจาก delivered → payment_success จะได้ deliveredAt ใหม่
  // ทุกครั้ง แล้วกำหนดปิดอัตโนมัติ 7 วันจะถูกเลื่อนออกไปเรื่อย ๆ จนอาจไม่ปิดเลย
  // โดยไม่มี type error ไม่มีเทสแดง มีแต่ตัวเลขบนหน้าร้านที่ไม่ขยับ
  //
  // แพตเทิร์นเดียวกับ codReceivedAt (order.service.ts) ที่ใช้ "ใครมาก่อนได้ก่อน"
  if (isDeliveredCarrierStatus(status)) {
    await prisma.orderShipment.updateMany({
      where: { id: shipment.id, deliveredAt: null },
      data: { deliveredAt: occurredAt },
    });
  }

  // ฝาแฝดขากลับของบล็อกข้างบน — ไทม์ไลน์ขากลับอ่านเวลาจากคอลัมน์เหล่านี้
  await stampReturnLeg(shipment.id, status, occurredAt);
  await stampReturnDispatch(
    shipment.id,
    status,
    typeof p.status_desc === "string" ? p.status_desc : null,
    occurredAt,
  );

  await advanceOrderOnCarrierMove(shipment.orderId, status);
}

/** handlePickupWebhook — รับแจ้งสถานะรถเข้ารับ */
export async function handlePickupWebhook(payload: unknown): Promise<void> {
  if (!payload || typeof payload !== "object") return;
  const p = payload as Record<string, unknown>;

  const ticketPickupId =
    p.ticketPickupId != null ? String(p.ticketPickupId) : null;
  if (!ticketPickupId) return;

  const pickup = await prisma.shipmentPickup.findFirst({
    where: { ticketPickupId },
    select: { id: true },
  });
  if (!pickup) return;

  // สถานะฝั่งผู้ให้บริการเป็นตัวเลข/ข้อความที่ไม่คงที่ — แปลงเป็นชุดของเราเท่าที่ตีความได้
  const closedAt = typeof p.closed_at === "string" ? new Date(p.closed_at) : null;
  const acceptedAt = typeof p.accepted_at === "string" ? new Date(p.accepted_at) : null;

  await prisma.shipmentPickup.update({
    where: { id: pickup.id },
    data: {
      status: closedAt ? "CLOSED" : acceptedAt ? "ACCEPTED" : undefined,
      staffName: typeof p.staffInfoName === "string" ? p.staffInfoName : undefined,
      staffPhone: typeof p.staffInfoPhone === "string" ? p.staffInfoPhone : undefined,
      timeoutAtText: typeof p.timeoutAtText === "string" ? p.timeoutAtText : undefined,
      ticketMessage: typeof p.ticketMessage === "string" ? p.ticketMessage : undefined,
      acceptedAt: acceptedAt && !Number.isNaN(acceptedAt.getTime()) ? acceptedAt : undefined,
      closedAt: closedAt && !Number.isNaN(closedAt.getTime()) ? closedAt : undefined,
    },
  });
}

export async function cancelPickup(shopId: string, pickupId: string) {
  const { token } = await loadAccount(shopId);
  const row = await prisma.shipmentPickup.findFirst({
    where: { id: pickupId, shopId },
    select: { id: true, ticketPickupId: true, status: true },
  });
  if (!row) throw new IShipServiceError("NOT_FOUND", "ไม่พบคำขอเข้ารับนี้");
  if (row.status === "CANCELLED") {
    throw new IShipServiceError("INVALID_STATE", "คำขอนี้ถูกยกเลิกไปแล้ว");
  }
  if (row.ticketPickupId) {
    await withTokenGuard(shopId, () => iship.cancelPickup(token, row.ticketPickupId!));
  }
  return prisma.shipmentPickup.update({
    where: { id: pickupId },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });
}

// ─── sync สถานะพัสดุยกชุด ───────────────────────────────────────────────────

/** เว้นระยะระหว่างการ sync — ร้านเปิดหน้าแชทถี่แค่ไหนก็ยิง iShip ไม่เกินนี้ */
const STATUS_SYNC_INTERVAL_MS = 15 * 60 * 1000;

/** iShip จำกัดช่วงค้นหาไม่เกิน 7 วัน (ตอบ code 1009 ถ้าเกิน) — ขอ 6 วันกันเรื่องเขตเวลา */
const SYNC_WINDOW_DAYS = 6;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * syncShipmentStatuses — ดึงสถานะพัสดุทั้งร้านจาก iShip มาเขียนลง OrderShipment
 *
 * ทำไมต้องมี: สถานะขนส่งอัปเดตได้ทางเดียวคือ webhook ซึ่งยังไม่ได้ประสานกับ iShip
 * (ยืนยัน 2026-07-31: ShipmentEvent 0 แถว, พัสดุที่เปิดไปแล้วทุกใบ carrierStatus = null)
 * ป้ายสถานะในรายการแชทจึงค้างที่ "สร้างพัสดุแล้ว" ตลอดกาล
 *
 * ใช้ query_orders ซึ่งคืนทั้งชุดในคำขอเดียว — ไม่วน traces ทีละใบ เพราะร้านที่มีของเดินอยู่
 * 100 ใบจะกลายเป็น 100 คำขอต่อรอบ
 *
 * เงียบเสมอเมื่อล้มเหลว: ตัวนี้ถูกเรียกเป็นงานเบื้องหลังตอนร้านเปิดหน้าแชท ร้านไม่ได้สั่ง
 * และไม่ได้รออ่านผล — error ที่นี่ต้องไม่ทำให้รายการแชทพัง
 *
 * คืนจำนวนแถวที่สถานะเปลี่ยนจริง (0 = ไม่มีอะไรเปลี่ยน หรือยังไม่ถึงรอบ)
 */
/**
 * settleCodIfPaid — เห็น `settlement_at` ครั้งแรกของพัสดุใบหนึ่ง → บันทึกว่าเงินเข้าแล้ว
 *
 * แบ่งหน้าที่: ที่นี่ตัดสินเรื่อง "พัสดุ" (เชื่อค่าจาก iShip ได้ไหม + จองสิทธิ์ประมวลผล)
 * ส่วนเรื่อง "คำสั่งซื้อ" (เป็น COD ไหม ยืนยันได้ไหม คิดคะแนนใหม่) อยู่ที่ order.service
 *
 * การจองสิทธิ์ใช้ conditional update บน codSettledAt — sync สองรอบที่ทับกัน (ร้านเปิด
 * หลายแท็บ) จะมีแค่รอบเดียวที่ count>0 อีกรอบเห็น 0 แล้วถอยออกไปเงียบ ๆ ไม่บันทึกซ้ำ
 *
 * คืน true เมื่อคำสั่งซื้อถูกยืนยันอัตโนมัติจริง (ไม่ใช่แค่บันทึกวันเงินเข้า)
 */
async function settleCodIfPaid(
  shipment: { id: string; orderId: string; codSettledAt: Date | null },
  // รูปโครงสร้างขั้นต่ำ ไม่ใช่ `IShipOrderRow` — payload ของ `get_order` มีสามช่องนี้ครบ
  // เหมือนกัน (ยืนยันกับพัสดุจริง 2026-08-06) การผูกกับชนิดของ query_orders จะบังคับให้
  // ทางเข้าที่สองต้อง cast ซึ่งคือสิ่งที่ปิดตาไม่ให้เห็นว่าสองฝั่งอ่านช่องเดียวกันจริงไหม
  row: Parameters<typeof readCodSettlement>[0],
): Promise<boolean> {
  if (shipment.codSettledAt) return false; // เคยประมวลผลไปแล้ว

  const settlement = readCodSettlement(row);
  if (!settlement) return false;
  const { settledAt, codAmount } = settlement;

  const claimed = await prisma.orderShipment.updateMany({
    where: { id: shipment.id, codSettledAt: null },
    data: { codSettledAt: settledAt },
  });
  if (claimed.count === 0) return false;

  return settleCodFromCarrier({ orderId: shipment.orderId, settledAt, codAmount });
}

/**
 * captureCarrierCharges — บันทึกต้นทุนจริงของการจัดส่ง (ค่าส่ง/น้ำหนักชั่งจริง/ค่าธรรมเนียม COD)
 *
 * ทำไมถึงเขียนที่นี่แทนที่จะเป็น webhook: `handleStatusWebhook()` เป็นจุดเดียวที่เคยเขียน
 * `carrierPrice` แต่ route ของมันตอบ 404 ทุกคำขอเพราะ `ISHIP_WEBHOOK_SECRET` ไม่ถูกตั้งบน
 * production (ยืนยัน 2026-08-09: prod มีพัสดุ active 140 ใบ `carrierStatus` เต็มทั้ง 140 แต่
 * `carrierPrice` ว่างทั้ง 140) — ข้อมูลชุดเดียวกันนี้อยู่ใน `query_orders` ที่เราดึงอยู่แล้ว
 * จึงไม่ต้องเปิด webhook และไม่เพิ่มคำขอใหม่แม้แต่คำขอเดียว
 *
 * เขียนเฉพาะเมื่อค่าเปลี่ยนจริง — ไม่งั้นทุกใบจะถูก UPDATE ทุก 15 นาทีตลอดไปโดยไม่มีอะไรต่างขึ้น
 * และตัวนับ `changed` ที่ผู้เรียกใช้ตัดสินใจจะพองจนไม่มีความหมาย
 *
 * ค่าที่อ่านไม่ได้ (null) **ไม่เขียนทับของเดิม** — "iShip ไม่ส่งมารอบนี้" ไม่เท่ากับ "ค่านั้นถูกลบ"
 * (บทเรียนคอลัมน์ที่มีผู้เขียนสองรายจากงานแชท 2026-08-04: รีแอ็กชันโผล่ 1 วิแล้วหายเพราะเขียน
 * null ทับตอนที่ payload แค่ไม่ได้พูดถึงมัน)
 */
async function captureCarrierCharges(
  shipment: {
    id: string;
    carrierPrice: Prisma.Decimal | null;
    actualWeight: Prisma.Decimal | null;
    codFee: Prisma.Decimal | null;
  },
  /**
   * ค่าที่ "อ่านมาแล้ว" ไม่ใช่ row ดิบ — 🛑 เพราะตัวอ่านของสอง endpoint ไม่ใช่ตัวเดียวกัน
   * (`query_orders` ใช้ `actual_weight` ส่วน `get_order` ใช้ `weight` เป็นน้ำหนักชั่งจริง
   * และไม่มี `actual_weight` เลย — ดู readCarrierChargesFromGetOrder) การรับ row ดิบแล้ว
   * เลือกตัวอ่านเองข้างในแปลว่าฟังก์ชันนี้ต้องเดาว่าใครเรียกมัน ซึ่งเดาผิดแล้วเงียบ
   */
  next: ReturnType<typeof readCarrierCharges>,
): Promise<boolean> {
  const differs = (incoming: number | null, current: Prisma.Decimal | null): boolean =>
    incoming !== null && (current === null || Number(current) !== incoming);

  const data: {
    carrierPrice?: number;
    actualWeight?: number;
    codFee?: number;
  } = {};
  if (differs(next.carrierPrice, shipment.carrierPrice)) data.carrierPrice = next.carrierPrice!;
  if (differs(next.actualWeight, shipment.actualWeight)) data.actualWeight = next.actualWeight!;
  if (differs(next.codFee, shipment.codFee)) data.codFee = next.codFee!;

  if (Object.keys(data).length === 0) return false;

  await prisma.orderShipment.update({ where: { id: shipment.id }, data });
  return true;
}

/** ช่องใน payload ดิบที่อาจมาเป็นสตริงหรือตัวเลข — ที่เหลือถือว่าไม่มีค่า */
function scalarOrNull(v: unknown): string | number | null {
  return typeof v === "string" || typeof v === "number" ? v : null;
}

/**
 * applyCarrierStatus — จุดเขียน "สถานะขนส่งเปลี่ยน" จุดเดียวของรอบ sync
 *
 * มีทางเข้า 2 ทางที่ต้องเขียนเหมือนกันเป๊ะ: คำตอบยกชุดจาก `query_orders` และคำตอบรายใบ
 * จาก `get_order` (ใบที่หลุดหน้าต่างวันที่) — แยกเขียนสองที่เมื่อไร กฎ `cancelled` →
 * `status: "CANCELLED"` หรือการเรียก `advanceOrderOnCarrierMove` จะหลุดไปข้างเดียวเงียบ ๆ
 *
 * คืน true เมื่อเขียนจริง (ค่าเดิม/ค่าที่แปลไม่ออก = ไม่นับว่าเปลี่ยน)
 */
/**
 * captureShipmentEvidence — หยุดภาพหลักฐานจากขนส่งไว้ทันทีที่พัสดุมีปัญหา/ตีกลับ
 * (feature 00055 · หัวหน้าสั่ง 2026-08-24 "ควรบันทึกหลักฐานกรณีตีกลับไว้ด้วย เผื่อมีการยื่นพิพาท")
 *
 * 🛑 **ห้าม throw ออกไปหาผู้เรียกเด็ดขาด** — ตัวเรียกคือลูป sync ที่ไล่พัสดุทั้งร้าน
 * ถ้าใบเดียวล้มแล้วลากทั้งรอบตาย พัสดุที่เหลือจะค้างสถานะโดยไม่มีใครรู้ว่าเพราะอะไร
 * ดึงไม่ได้ = **บันทึกแถวที่มี `error`** ไม่ใช่ไม่บันทึกอะไรเลย ("ไม่มีแถว" แปลว่าไม่เคย
 * พยายาม ซึ่งคนละเรื่องกับ "พยายามแล้วขนส่งไม่ตอบ" — วันที่ต้องใช้หลักฐานสองอันนี้ต่างกันมาก)
 *
 * 🛑 กันซ้ำด้วย unique `(shipmentId, reason)` ที่ระดับฐาน ไม่ใช่ find-then-insert — poller
 * หลายรอบทับกันได้ ความถูกต้องต้องอยู่ที่ `@unique` เสมอ
 * (docs/conventions/insert-then-catch-logs-every-error.md)
 */
async function captureShipmentEvidence(
  shipmentId: string,
  orderId: string,
  shopId: string,
  reason: string,
): Promise<void> {
  // เก็บครั้งเดียวต่อ (ใบ, สถานะ) — เช็คก่อนเพื่อไม่ยิง iShip ซ้ำทุกรอบ sync
  // (ตัวกันจริงคือ unique ที่ฐาน ตรงนี้แค่ลดคำขอที่รู้ผลอยู่แล้ว)
  const existing = await prisma.shipmentEvidence.findUnique({
    where: { shipmentId_reason: { shipmentId, reason } },
    select: { id: true },
  });
  if (existing) return;

  let traces: unknown[] = [];
  let parcel: unknown = null;
  let error: string | null = null;

  try {
    const { token } = await loadAccount(shopId);
    const row = await prisma.orderShipment.findUnique({
      where: { id: shipmentId },
      select: { trackingNo: true },
    });
    if (!row?.trackingNo) throw new Error("ไม่มีเลขพัสดุ");
    traces = await withTokenGuard(shopId, () => iship.getTraces(token, row.trackingNo!));
    parcel = await withTokenGuard(shopId, () => iship.getOrder(token, row.trackingNo!));
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  try {
    await prisma.shipmentEvidence.create({
      data: {
        shipmentId,
        orderId,
        reason,
        traceCount: traces.length,
        // เก็บดิบทั้งก้อน — นั่นคือประเด็นของหลักฐาน ห้าม normalize ทิ้ง
        traces: traces.length > 0 ? (traces as object[]) : undefined,
        parcel: (parcel as object) ?? undefined,
        error,
      },
    });
  } catch {
    // ชนกับรอบที่ยิงพร้อมกัน (unique) = มีคนเก็บให้แล้ว ถือว่าสำเร็จ
  }
}

/**
 * 🛑 `shopId` เป็นพารามิเตอร์ **บังคับ** ไม่ใช่ optional บนอ็อบเจกต์ `s`
 *
 * ร่างแรกเขียนเป็น `s: { …; shopId?: string }` แล้วด่านเก็บหลักฐาน `if (s.shopId && …)`
 * จะ **ไม่ทำงานเลยสักครั้ง** เพราะ `select` ของชุด tracking ไม่ได้ดึง `shopId` มา —
 * `tsc` ไม่ฟ้องเพราะ optional คือ "ไม่ส่งก็ได้" ⇒ ฟีเจอร์ตายเงียบสนิทโดยทุก gate เขียว
 * (คลาสเดียวกับ docs/conventions/rule-must-be-enforced-not-described.md)
 * ทำเป็น positional บังคับ ⇒ ลืมส่งเมื่อไร compile ไม่ผ่าน
 */
/**
 * backfillShipmentEvidence — เก็บหลักฐานย้อนหลังให้ใบที่ "มีปัญหาอยู่แล้ว" ก่อนฟีเจอร์นี้ขึ้น
 * (feature 00055 · BRD §6.5)
 *
 * 🛑 ทำไมต้องมี: ตัวเก็บอัตโนมัติจุดชนวนที่ `applyCarrierStatus()` ซึ่งทำงานเฉพาะตอนสถานะ
 * **เปลี่ยน** — ใบที่เป็น `return_success` มาตั้งแต่ก่อน deploy จะไม่มีอะไรจุดชนวนอีกเลย
 * ตลอดกาล (15 ใบบน prod ณ 2026-08-24) ถ้าไม่มีตัวนี้ ของกลุ่มที่ *มีข้อพิพาทอยู่แล้ว*
 * คือกลุ่มเดียวที่ไม่มีหลักฐาน ซึ่งกลับหัวกลับหางกับเจตนาของฟีเจอร์
 *
 * 🛑 **รันได้จากในแอปที่ prod เท่านั้น** — เครื่อง dev ไม่มี `CHANNEL_TOKEN_KEY` (ไม่อยู่ใน
 * `.env` และ `vercel env pull` redact เป็น `[SENSITIVE]`) จึงถอดรหัส token ของ iShip ไม่ได้
 * และไม่มี `DATABASE_URL` ของ prod ให้เขียนอยู่แล้ว — สคริปต์ในเครื่องทำงานนี้ไม่ได้
 * (บทเรียนเดียวกับ re-sync webhook ของ Meta 2026-08-08)
 *
 * idempotent: ใบที่เก็บไปแล้วถูกข้ามด้วย unique `(shipmentId, reason)` ยิงซ้ำได้ปลอดภัย
 * ยิงทีละชุด (`limit`) เพราะแต่ละใบ = 2 คำขอไป iShip — ยิงรวดเดียวทั้งหมดเสี่ยงชน rate limit
 * แล้วจะได้แถวที่มี `error` เต็มไปหมดซึ่งกู้ยากกว่าเดิม (ต้องลบก่อนถึงจะเก็บใหม่ได้)
 */
export async function backfillShipmentEvidence(opts?: {
  limit?: number;
  shopId?: string;
}): Promise<{ scanned: number; captured: number; skipped: number; failed: number }> {
  const limit = Math.min(Math.max(opts?.limit ?? 20, 1), 100);

  const rows = await prisma.orderShipment.findMany({
    where: {
      // 🛑 carve-out ของ feature 00056 โดยเจตนา: **ไม่กรอง `direction`**
      // หลักฐานข้อพิพาทเป็นของ *พัสดุ* ไม่ใช่ของ *ทิศทาง* — พัสดุขากลับที่หายระหว่างทาง
      // ก็ต้องมีหลักฐานเหมือนกัน (ของหายคือของหาย ไม่ว่ากำลังไปหรือกำลังกลับ)
      isDryRun: false,
      trackingNo: { not: null },
      carrierStatus: { in: [...EVIDENCE_CARRIER_STATUSES] },
      ...(opts?.shopId ? { shopId: opts.shopId } : {}),
      // ยังไม่มีหลักฐานของ "สถานะปัจจุบัน" ใบนั้น — ใบที่เก็บ `return` ไว้แล้วแต่ตอนนี้เป็น
      // `return_success` ต้องเก็บเพิ่ม ไม่ใช่ข้าม (สองสถานะคือหลักฐานคนละช่วงเวลา)
      evidence: { none: {} },
    },
    select: { id: true, orderId: true, shopId: true, carrierStatus: true },
    orderBy: { carrierStatusAt: "desc" },
    take: limit,
  });

  let captured = 0;
  let failed = 0;
  for (const r of rows) {
    if (!r.carrierStatus) continue;
    await captureShipmentEvidence(r.id, r.orderId, r.shopId, r.carrierStatus);
    // อ่านผลกลับจากฐาน ไม่เดาจากการที่ฟังก์ชันไม่ throw — ตัวเก็บกลืน error ไว้โดยเจตนา
    const saved = await prisma.shipmentEvidence.findUnique({
      where: { shipmentId_reason: { shipmentId: r.id, reason: r.carrierStatus } },
      select: { error: true },
    });
    if (saved && !saved.error) captured += 1;
    else failed += 1;
  }

  return { scanned: rows.length, captured, skipped: rows.length - captured - failed, failed };
}

async function applyCarrierStatus(
  s: { id: string; orderId: string; carrierStatus: string | null },
  code: string | null,
  changedAt: Date,
  shopId: string,
): Promise<boolean> {
  if (!code || code === s.carrierStatus) return false;

  await prisma.orderShipment.update({
    where: { id: s.id },
    data: {
      carrierStatus: code,
      carrierStatusText: describeCarrierStatus(code).text,
      // ใช้เวลาที่ iShip บอกว่าสถานะเปลี่ยน ไม่ใช่เวลาที่เราดึงมา — ไม่งั้นทุกใบจะมีเวลา
      // เท่ากันหมดตามรอบ sync แล้วเรียงลำดับเหตุการณ์ไม่ได้
      carrierStatusAt: changedAt,
      // พัสดุถูกยกเลิกที่ฝั่ง iShip (ร้านไปกดที่หลังบ้านเขาเอง หรือขนส่งยกเลิกให้) —
      // แถวของเราต้องตามความจริง ไม่ใช่ค้างเป็น CREATED แล้วโชว์ป้าย "สร้างพัสดุแล้ว"
      // ให้ร้านเข้าใจผิดว่าของยังเดินอยู่ (เจอกับพัสดุจริง 1 ใบตอนทดสอบ 2026-07-31)
      ...(code === "cancelled" ? { status: "CANCELLED", cancelledAt: changedAt } : {}),
    },
  });
  // ประทับเวลาขากลับก่อนงานอื่น — ทางนี้คือทางที่พัสดุตีกลับส่วนใหญ่เดินผ่านจริง
  // (6 จาก 12 ใบบน prod ได้ `return_success` มาทางรอบ poll ไม่ใช่ webhook)
  await stampReturnLeg(s.id, code, changedAt);
  await advanceOrderOnCarrierMove(s.orderId, code);

  /**
   * หยุดภาพหลักฐาน ณ วินาทีที่สถานะกลายเป็น "มีปัญหา/ตีกลับ" — จุดนี้เป็นจุดเดียวในระบบที่
   * รู้ว่า *สถานะเพิ่งเปลี่ยน* (บรรทัดบนสุดตัด `code === s.carrierStatus` ทิ้งไปแล้ว)
   * ถ้าไปเก็บที่อื่นจะได้ภาพของ "ตอนที่มีคนบังเอิญเปิดดู" ซึ่งไม่ใช่เวลาที่เกิดเหตุ
   */
  if (shouldCaptureEvidence(code)) {
    await captureShipmentEvidence(s.id, s.orderId, shopId, code);
  }

  return true;
}

export async function syncShipmentStatuses(
  shopId: string,
  opts?: { force?: boolean },
): Promise<number> {
  const account = await prisma.shopShippingAccount.findUnique({ where: { shopId } });
  if (!account || account.status !== "ACTIVE") return 0;

  const now = Date.now();
  if (
    !opts?.force &&
    account.statusSyncedAt &&
    now - account.statusSyncedAt.getTime() < STATUS_SYNC_INTERVAL_MS
  ) {
    return 0;
  }

  // พัสดุที่ยังต้องติดตาม — จบแล้ว (ส่งถึง/คืนสำเร็จ/หมดอายุ) ไม่ต้องถามซ้ำอีก
  //
  // ยกเว้นใบ COD ที่ยังไม่ได้เงิน (BR-ISHIP-49, 2026-08-06): เงินเก็บปลายทางเข้าหลัง
  // `delivered` เสมอ — ใบตัวอย่างจริง TH160390J7DJ1I ส่งถึง 04 ส.ค. 09:27 แต่เงินเข้า
  // 05 ส.ค. 19:00 (ห่างกัน ~33 ชม.) เงื่อนไขเดิมตัดใบนั้นออกจากรายการติดตามไปตั้งแต่วัน
  // ที่ส่งถึง = ไม่มีวันเห็นเหตุการณ์เงินเข้าเลยสักใบ ฟีเจอร์ปิดงานอัตโนมัติจึงตายตั้งแต่ต้น
  const tracking = await prisma.orderShipment.findMany({
    where: {
      shopId,
      status: "CREATED",
      trackingNo: { not: null },
      OR: [
        { carrierStatus: null },
        { carrierStatus: { notIn: ["delivered", "return_success", "is_expired", "close"] } },
        // ส่งถึงแล้วแต่เป็นใบเก็บเงินปลายทางที่ยังไม่ได้รับแจ้งว่าโอนเงิน → ยังต้องถามต่อ
        // (มี codSettledAt แล้ว = จบจริง หลุดออกจากชุดนี้เอง)
        // ตัดปลายทางที่ไม่มีวันมีเงินเข้าออก (ตีกลับ/หมดอายุ/ยกเลิก) ไม่งั้นใบพวกนี้จะค้าง
        // อยู่ในชุดที่ดึงมาทุกรอบตลอดไป — ไม่เปลืองคำขอ iShip แต่เปลืองแถวที่ query ฐานทุกครั้ง
        {
          codSettledAt: null,
          codAmount: { gt: 0 },
          carrierStatus: { notIn: ["return_success", "is_expired", "close", "cancelled"] },
        },
      ],
    },
    select: {
      id: true,
      trackingNo: true,
      carrierStatus: true,
      orderId: true,
      codSettledAt: true,
      // ต้นทุนจริง — ดึงค่าเดิมมาด้วยเพื่อเทียบก่อนเขียน (ดู captureCarrierCharges)
      carrierPrice: true,
      actualWeight: true,
      codFee: true,
      // สองตัวนี้ใช้เรียงคิว "ใบที่หลุดหน้าต่าง query_orders" เท่านั้น (ดู pickStaleParcelsForLookup)
      carrierStatusAt: true,
      createdAt: true,
    },
  });
  if (tracking.length === 0) {
    await prisma.shopShippingAccount.update({
      where: { shopId },
      data: { statusSyncedAt: new Date() },
    });
    return 0;
  }

  const token = decryptToken(account.accessTokenEnc);
  const end = new Date(now);
  const start = new Date(now - SYNC_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  let rows: Awaited<ReturnType<typeof iship.queryOrders>>;
  try {
    rows = await withTokenGuard(shopId, () =>
      iship.queryOrders(token, isoDate(start), isoDate(end)),
    );
  } catch {
    // ไม่บันทึกเวลา = รอบหน้าลองใหม่ทันที ไม่ต้องรออีก 15 นาที
    return 0;
  }

  const byTrack = new Map(rows.map((r) => [r.track_no, r]));
  let changed = 0;

  for (const s of tracking) {
    const row = byTrack.get(s.trackingNo!);
    // ไม่อยู่ในคำตอบยกชุด = หลุดหน้าต่างวันที่ → ไปเข้าคิวถามรายใบด้านล่าง
    // (ห้ามเดาสถานะแทนขนส่ง และห้ามปล่อยผ่านเฉย ๆ แบบเดิม — ดู stale-lookup.ts)
    if (!row) continue;
    const code = carrierStatusCodeFromId(row.status);

    if (
      await applyCarrierStatus(
        s,
        code,
        row.updated_at ? new Date(row.updated_at) : new Date(),
        shopId,
      )
    ) {
      changed += 1;
    }

    // แยกจากบล็อกข้างบนโดยเจตนา — ห้ามผูกกับ "สถานะเปลี่ยน" เพราะพัสดุที่ carrierStatus
    // เป็น payment_success อยู่แล้วตั้งแต่ก่อนมีฟีเจอร์นี้จะไม่มีวันเข้าเงื่อนไขนั้นอีก
    // แล้วเงินที่เข้าไปแล้วจะไม่ถูกบันทึกตลอดกาล
    if (await settleCodIfPaid(s, row)) changed += 1;

    // เหตุผลเดียวกันเป๊ะกับบรรทัดบน: ต้นทุนค่าส่งต้องอ่านทุกรอบที่เห็นแถว ไม่ใช่เฉพาะตอนสถานะขยับ
    //
    // และต้องอยู่ในลูปนี้ *เท่านั้น* ไม่ใช่ที่ createShipment เพราะค่าส่งจริงยังไม่เกิดตอนเปิดพัสดุ —
    // มันมาหลังขนส่งเข้ารับแล้วชั่งน้ำหนักจริง (ข้อมูลจริง 2026-08-09: 92/151 ใบชั่งได้หนักกว่าที่ร้าน
    // แจ้ง = ราคาตอนกดสร้างใช้แทนกันไม่ได้)
    //
    // 🛑 ข้อจำกัดที่ต้องรู้: ชุด `tracking` ข้างบน **ตัดใบที่จบแล้วออก** (delivered/return_success/
    // is_expired/close ที่เคลียร์เงินแล้ว) ใบที่จบไปก่อนฟีเจอร์นี้ขึ้นจึงไม่มีวันเข้าลูปนี้เลย —
    // ต้องพึ่ง scripts/backfill-shipment-charges.ts ครั้งเดียว ไม่ใช่รอ sync เก็บให้เอง
    if (await captureCarrierCharges(s, readCarrierCharges(row))) changed += 1;
  }

  /**
   * ── ใบที่ `query_orders` ไม่ได้ตอบกลับมา — ถามรายใบด้วย `get_order` ────────────────
   *
   * 🛑 เดิมบรรทัด `if (!row) continue` ปล่อยใบพวกนี้ทิ้งไปเฉย ๆ ทุกรอบ = พัสดุที่เดินทาง
   * นานกว่าหน้าต่าง 6 วัน **ค้างสถานะไว้ตลอดกาล** (user เจอบน prod 2026-08-20:
   * TH068661575518 ค้างที่ "พัสดุตีกลับ" 8 วัน ทั้งที่ของคืนถึงร้านแล้วตั้งแต่ 12 ส.ค.
   * — รายการเดินทางในจอเดียวกันขึ้น "ส่งคืนสำเร็จ" อยู่ แต่หัวการ์ดยังบอกว่ากำลังส่ง)
   *
   * ทำไมไม่แก้ด้วยการขยายหน้าต่าง/ยิง cron ถี่ขึ้น: iShip จำกัดช่วงค้นหาไว้ 7 วันต่อคำขอ
   * (code 1009) และความถี่ไม่เกี่ยวกับขอบเขตข้อมูลเลย — ถามทุก 5 นาทีก็ได้ชุดเดิมที่ไม่มี
   * ใบนี้อยู่ทุกรอบ ส่วน `get_order` ไม่มีเงื่อนไขวันที่
   *
   * ต้นทุนถูกคุมด้วยเพดาน + คิวหมุนเวียนใน `pickStaleParcelsForLookup` (≤8 คำขอ/รอบ/ร้าน
   * และทุกใบได้คิวครบภายใน ceil(n/8) รอบ) — ห้ามถอดเพดานออกแล้ววนทุกใบ นั่นคือสิ่งที่
   * `query_orders` แบบยกชุดมีไว้เลี่ยงตั้งแต่แรก
   */
  const staleParcels = pickStaleParcelsForLookup(tracking, new Set(byTrack.keys()), end);
  let staleChanged = 0;
  for (const s of staleParcels) {
    let raw: Record<string, unknown>;
    try {
      raw = await withTokenGuard(shopId, () => iship.getOrder(token, s.trackingNo!));
    } catch {
      // ใบเดียวล้มต้องไม่ล้มทั้งรอบ — ใบที่เหลือยังต้องได้อัปเดต และรอบหน้าลองใหม่เอง
      continue;
    }

    const parcel = parseParcelRow(raw);
    if (!parcel) continue;

    const code = carrierStatusCodeFromId(parcel.statusId);
    const changedAt = parcel.updatedAtRaw ? new Date(parcel.updatedAtRaw) : new Date();
    if (await applyCarrierStatus(s, code, changedAt, shopId)) {
      changed += 1;
      staleChanged += 1;
    }

    // เหตุผลเดียวกับลูปข้างบน: เงิน COD และต้นทุนค่าส่งต้องอ่านทุกรอบที่เห็นแถว ไม่ใช่
    // เฉพาะตอนสถานะขยับ — และใบที่เดินทางนาน (ตีกลับ/ค้างสถานี) คือใบที่เรื่องเงินยัง
    // ไม่จบบ่อยที่สุด ถ้าเก็บเฉพาะในลูปยกชุด ใบพวกนี้จะไม่มีวันถูกเก็บเลย
    // narrow ทีละช่องแทนการ cast ทั้งก้อน — cast คือสิ่งที่ปิดตาไม่ให้เห็นว่า payload
    // ของอีก endpoint หน้าตาต่างจากที่เราคิด (บทเรียนตำบล/อำเภอสลับ 2026-08-07)
    if (
      await settleCodIfPaid(s, {
        status: typeof raw.status === "number" ? raw.status : null,
        settlement_at: typeof raw.settlement_at === "string" ? raw.settlement_at : null,
        cod_amount: scalarOrNull(raw.cod_amount),
      })
    ) {
      changed += 1;
    }
    // 🛑 ตัวอ่านคนละตัวกับข้างบนโดยเจตนา — `get_order` ไม่มี `actual_weight` และใช้ `weight`
    // เป็นน้ำหนักที่ชั่งจริงแทน (ยืนยันกับพัสดุจริง 12 ใบ 2026-08-09)
    const charges = readCarrierChargesFromGetOrder({
      discount_price: scalarOrNull(raw.discount_price),
      weight: scalarOrNull(raw.weight),
      cod_fee: scalarOrNull(raw.cod_fee),
    });
    if (await captureCarrierCharges(s, charges)) changed += 1;
  }

  /**
   * 🛑 log เฉพาะรอบที่คิวนี้ทำงานจริง — ตัวเลข `changed` รวมของ syncShipmentStatuses
   * ปนสาเหตุอื่นหมด (สถานะจากคำตอบยกชุด · เงิน COD · ต้นทุนค่าส่ง) แยกไม่ออกว่าเส้นทาง
   * "ตามใบที่หลุดหน้าต่าง" เจอของและแก้ได้จริงไหม
   *
   * ถ้าไม่มีบรรทัดนี้ วันที่โค้ดส่วนนั้นพังหรือเลือกใบไม่เจอ มันจะเงียบสนิทแบบเดียวกับบั๊กเดิม
   * เป๊ะ ๆ (สถานะค้างโดยไม่มี error) ซึ่งคือสิ่งที่ทั้งรอบนี้พยายามเลิกทำ
   */
  if (staleParcels.length > 0) {
    console.log("[iship-sync] ตามใบที่หลุดหน้าต่าง query_orders", {
      shopId,
      picked: staleParcels.length,
      changed: staleChanged,
    });
  }

  await prisma.shopShippingAccount.update({
    where: { shopId },
    data: { statusSyncedAt: new Date() },
  });
  return changed;
}

// ─── ประเมินค่าส่ง ──────────────────────────────────────────────────────────

export interface PriceEstimate {
  /** ค่าส่งรวมที่ขนส่งประเมิน (บาท) */
  totalPrice: number;
  /** จำนวนวันโดยประมาณ — null เมื่อขนส่งไม่ได้บอก */
  estimateDays: number | null;
  /** ปลายทางเป็นพื้นที่ห่างไกล — มีค่าส่งเพิ่มและใช้เวลานานกว่าปกติ */
  remoteArea: boolean;
}

/**
 * estimateShippingPrice — ถามค่าส่งก่อนเปิดพัสดุจริง (BR-ISHIP-34: เป็นการประเมิน ไม่ใช่ราคาผูกพัน)
 *
 * มีมาตั้งแต่แรกในชั้น client แต่ไม่เคยมีใครเรียก — ร้านจึงกดปุ่มที่เสียเงินจริงโดยไม่เคย
 * เห็นตัวเลขสักครั้ง (ตรวจพบ 2026-07-31)
 *
 * ที่อยู่ผู้ส่งมาจากการตั้งค่าร้านเสมอ ไม่ให้ผู้เรียกส่งเข้ามา — ไม่งั้นหน้าจอจะประเมินราคา
 * จากต้นทางที่ไม่ใช่ที่ส่งจริง
 *
 * BR-ISHIP-31 — ตำบลไปช่อง district, อำเภอไปช่อง amphure (กลับหัวกับชื่อฟิลด์ของ iShip)
 */
export async function estimateShippingPrice(
  shopId: string,
  input: {
    courierCode: string;
    receiver: {
      subdistrict?: string | null;
      district?: string | null;
      province?: string | null;
      postcode?: string | null;
    };
    weight: number;
    width: number;
    length: number;
    height: number;
  },
): Promise<PriceEstimate> {
  const { account, token } = await loadAccount(shopId);
  const sender = senderOf(account);

  const missingSender = findMissingSenderFields(sender);
  if (missingSender.length > 0) {
    throw new IShipServiceError(
      "INCOMPLETE_DATA",
      `ยังตั้งที่อยู่ผู้ส่งไม่ครบ — ขาด ${missingSender.join(", ")}`,
      missingSender,
    );
  }

  const r = input.receiver;
  if (!r.subdistrict || !r.district || !r.province || !r.postcode) {
    throw new IShipServiceError(
      "INCOMPLETE_DATA",
      "ยังกรอกที่อยู่ปลายทางไม่ครบ จึงประเมินค่าส่งไม่ได้",
    );
  }

  const price = await withTokenGuard(shopId, () =>
    iship.checkPrice(token, {
      courier_code: input.courierCode,
      ...buildCheckPricePayload(sender, r, {
        weight: input.weight,
        width: input.width,
        length: input.length,
        height: input.height,
      }),
    }),
  );

  const days = Number(price.estimate_shipping_date);
  return {
    totalPrice: price.total_price,
    estimateDays: Number.isFinite(days) && days > 0 ? days : null,
    remoteArea: Number(price.remote_area) > 0,
  };
}

/**
 * compareShippingPrices — ถามราคา "ทุกขนส่งของร้าน" ในคำขอเดียว (ปุ่มเทียบราคา)
 *
 * ทำไม fan-out ฝั่ง server: ให้ client วนยิง /price ทีละขนส่ง ~17 ครั้งจะชน rate-limit
 * ของเราเอง (authenticated 30 req/นาที) — ฝั่งนี้รวมเป็น 1 คำขอ แล้วยิง iShip ขนานด้วย
 * allSettled: ขนส่งที่ไม่ตอบถูกตัดเข้า failed[] ไม่ล้มทั้งชุด (check-price ไม่ก่อค่าใช้จ่าย)
 */
export async function compareShippingPrices(
  shopId: string,
  input: {
    receiver: {
      subdistrict?: string | null;
      district?: string | null;
      province?: string | null;
      postcode?: string | null;
    };
    weight: number;
    width: number;
    length: number;
    height: number;
  },
): Promise<CompareResult> {
  const { account, token } = await loadAccount(shopId);
  const sender = senderOf(account);

  const missingSender = findMissingSenderFields(sender);
  if (missingSender.length > 0) {
    throw new IShipServiceError(
      "INCOMPLETE_DATA",
      `ยังตั้งที่อยู่ผู้ส่งไม่ครบ — ขาด ${missingSender.join(", ")}`,
      missingSender,
    );
  }

  const r = input.receiver;
  if (!r.subdistrict || !r.district || !r.province || !r.postcode) {
    throw new IShipServiceError(
      "INCOMPLETE_DATA",
      "ยังกรอกที่อยู่ปลายทางไม่ครบ จึงประเมินค่าส่งไม่ได้",
    );
  }

  const base = buildCheckPricePayload(sender, r, {
    weight: input.weight,
    width: input.width,
    length: input.length,
    height: input.height,
  });

  return withTokenGuard(shopId, async () => {
    const couriers = await iship.listCouriers(token);
    if (couriers.length === 0) return { rows: [], failed: [] };

    // ยิงเป็นชุดละ 4 ไม่ใช่ทั้ง ~17 พร้อมกัน — burst ใหญ่จาก token เดียวเสี่ยงโดนฝั่ง
    // iShip จำกัด/block ทั้งชุด (เหตุ prod 2026-08-05: ทุกเจ้าพังพร้อมกันทั้งที่ quote
    // รายตัวใช้ได้) ช้าลงแค่ ~2-3 วินาทีแต่เสถียรกว่า
    const settled: PromiseSettledResult<Awaited<ReturnType<typeof iship.checkPrice>>>[] = [];
    for (let i = 0; i < couriers.length; i += 4) {
      const chunk = couriers.slice(i, i + 4);
      settled.push(
        ...(await Promise.allSettled(
          chunk.map((c) => iship.checkPrice(token, { courier_code: c.code, ...base })),
        )),
      );
    }
    const result = assembleCompareResult(couriers, settled);
    /**
     * 🛑 `failed[]` รวมของ **2 ชนิดที่ไม่เหมือนกันเลย** ไว้ด้วยกัน (ดู assembleCompareResult):
     *   1. คำขอ reject จริง — เครือข่าย/โทเคน/upstream 5xx = **เรื่องที่ต้องรู้**
     *   2. `total_price <= 0` = ขนส่งเจ้านั้น **ไม่รองรับเส้นทางนี้** = เรื่องปกติของทุกคำขอ
     *
     * ของเดิม `console.error` เมื่อ `failed.length > 0` เฉย ๆ ⇒ คำขอที่สำเร็จสมบูรณ์ (17 จาก 18
     * เจ้ามีราคา อีกเจ้าไม่วิ่งเส้นทางนั้น) ก็ขึ้น error ใน log ของ prod ทุกครั้ง
     * user ส่งภาพมา 2026-08-20: `[iship-compare] failed 1/18` **โดยไม่มีรายละเอียดต่อท้ายเลย** —
     * นั่นคือหลักฐานในตัวมันเองว่าไม่มี rejection สักตัว เพราะข้อความรายละเอียดสร้างจาก
     * `s.status === "rejected"` อย่างเดียว. บรรทัด error ที่ไม่มีข้อมูลให้สืบ = สัญญาณรบกวนล้วน
     * และสอนให้คนเลิกอ่าน error log (คลาสเดียวกับ insert-then-catch-logs-every-error.md)
     */
    const rejectedCount = settled.filter((x) => x.status === "rejected").length;
    if (rejectedCount > 0) {
      // เหตุผลจริงรายเจ้า — ไม่มีบรรทัดนี้ debug บน prod ไม่ได้เลย (mapIShipError ไม่ log
      // IShipError และ reject รายเจ้าถูกกลืนเป็น failed[] เงียบ ๆ) token ถูก redact ในชั้น client แล้ว
      console.error(
        "[iship-compare]",
        `rejected ${rejectedCount}/${couriers.length} (no-price ${result.failed.length - rejectedCount})`,
        settled
          .map((s, i) =>
            s.status === "rejected"
              ? `${couriers[i]?.code}: ${s.reason instanceof Error ? `${s.reason.name} ${s.reason.message}` : String(s.reason)}${s.reason instanceof IShipError ? ` [${s.reason.code} http=${s.reason.httpStatus ?? "-"} ${(s.reason.upstreamMessage ?? "").slice(0, 120)}]` : ""}`
              : null,
          )
          .filter(Boolean)
          .join(" | "),
      );
    } else if (result.rows.length === 0 && result.failed.length > 0) {
      // ไม่มี rejection เลยแต่ก็ไม่ได้ราคาสักเจ้า = ไม่มีขนส่งเจ้าไหนวิ่งเส้นทางนี้
      // ไม่ใช่ระบบพัง แต่เป็นผลลัพธ์ที่ร้านจะงง จึงคงไว้เป็น warn ให้สืบย้อนได้ (ไม่ใช่ error)
      console.warn("[iship-compare]", `no carrier priced this route (0/${couriers.length})`);
    }
    if (result.rows.length === 0 && result.failed.length > 0) {
      // ทุกขนส่งพัง — ไม่ throw เป็น 502 ทึบ ๆ อีก (เหตุ prod 2026-08-05 วินิจฉัยไม่ได้เลย):
      // คืน 200 พร้อมเหตุผลรายเจ้าให้หน้าจอแสดง state ล้มเหลว + รายละเอียดจริง
      result.failedDetail = settled
        .map((s, i) => {
          if (s.status !== "rejected") return null;
          const r = s.reason;
          const base = `${couriers[i]?.code ?? "?"}`;
          if (r instanceof IShipError) {
            return `${base}: ${r.code} http=${r.httpStatus ?? "-"} ${(r.upstreamMessage ?? "").slice(0, 100)}`;
          }
          return `${base}: ${r instanceof Error ? r.message : String(r)}`;
        })
        .filter(Boolean)
        .join(" | ")
        .slice(0, 1500);
    }
    return result;
  });
}

// ─── ผูกพัสดุที่มีอยู่แล้วบน iShip (ส่วนขยาย feature 00022) ─────────────────
//
// ปัญหาที่แก้: ร้านจำนวนหนึ่งเปิดพัสดุบนเว็บ iShip ก่อน แล้วค่อยมาบันทึกคำสั่งซื้อใน
// ระบบเราทีหลัง ของเดิมมีแต่ "สร้างพัสดุใหม่" ร้านกลุ่มนี้จึงต้องเปิดใบที่สองทิ้งใบแรก
// หรือไม่ก็เลิกใช้ส่วนจัดส่งของเราไปเลย

/** รูปของ idempotencyKey ที่ Deep เป็นคนสร้าง — "<uuid>:<attempt>" หรือ "link:<track>:<attempt>" */
const DEEP_KEY_RE =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:\d+|link:.+:\d+)$/i;

/** ช่วงวันที่ที่ดึงรายการมาให้เลือก — iShip จำกัดไม่เกิน 7 วันต่อคำขอ (เกินแล้วตอบ code 1009) */
const UNLINKED_WINDOW_DAYS = 6;

/**
 * listUnlinkedParcels — พัสดุของร้านบน iShip ที่ยังว่างให้ผูก
 *
 * ยิง query_orders ครั้งเดียวได้ทั้งชุดพร้อมที่อยู่ผู้รับครบ (ไม่ต้องวน get_order รายใบ
 * ซึ่งจะกลายเป็นหลักร้อยคำขอต่อการเปิดหน้าจอหนึ่งครั้ง)
 */
export async function listUnlinkedParcels(
  shopId: string,
): Promise<UnlinkedParcelView[]> {
  const { token } = await loadAccount(shopId);

  const now = Date.now();
  const rows = await withTokenGuard(shopId, () =>
    iship.queryOrders(
      token,
      isoDate(new Date(now - UNLINKED_WINDOW_DAYS * 24 * 60 * 60 * 1000)),
      isoDate(new Date(now)),
    ),
  );

  const parcels = parseParcelRows(rows).filter((p) => {
    // ยกเลิกไปแล้ว = ผูกไปก็ใช้ส่งของไม่ได้ ไม่ควรอยู่ในตัวเลือกตั้งแต่แรก
    if (p.cancelledAtRaw) return false;
    return carrierStatusCodeFromId(p.statusId) !== "cancelled";
  });
  if (parcels.length === 0) return [];

  // ตัดใบที่ผูกไปแล้วออก — เทียบทั้งระบบไม่ใช่แค่ร้านนี้ เพราะ trackingNo มี partial
  // unique ระดับตาราง ถ้าโชว์ใบที่ร้านอื่นถืออยู่ ร้านจะกดแล้วเจอ error ปลายทางเปล่า ๆ
  const trackNos = parcels.map((p) => p.trackNo);
  const [taken, deepKeys, couriers] = await Promise.all([
    prisma.orderShipment.findMany({
      where: { trackingNo: { in: trackNos } },
      select: { trackingNo: true },
    }),
    prisma.orderShipment.findMany({
      where: { shopId, idempotencyKey: { in: parcels.map((p) => p.customOrderId ?? "") } },
      select: { idempotencyKey: true },
    }),
    // ชื่อขนส่งไว้โชว์ — ล้มก็ยังใช้งานต่อได้ด้วยรหัส ไม่ควรทำให้ทั้งหน้าจอพัง
    listCouriers(shopId).catch(() => []),
  ]);

  const takenSet = new Set(taken.map((t) => t.trackingNo));
  const knownKeys = new Set(deepKeys.map((d) => d.idempotencyKey));
  const courierName = new Map(couriers.map((c) => [c.code, c.name]));

  return parcels
    .filter((p) => !takenSet.has(p.trackNo))
    .map((p) => {
      const carrierStatus = carrierStatusCodeFromId(p.statusId);
      return {
        trackNo: p.trackNo,
        courierCode: p.courierCode,
        courierName: p.courierCode ? (courierName.get(p.courierCode) ?? null) : null,
        courierLogo: p.courierLogo,
        carrierStatus,
        // status_name ดิบจาก iShip ชนะคำของเรา เพราะเป็นคำที่ร้านเห็นบนเว็บ iShip อยู่แล้ว
        carrierStatusText: p.statusName ?? describeCarrierStatus(carrierStatus).text,
        codAmount: p.codAmount,
        receiver: p.receiver,
        createdAtRaw: p.createdAtRaw,
        fromDeepOrphan:
          p.customOrderId !== null &&
          DEEP_KEY_RE.test(p.customOrderId) &&
          !knownKeys.has(p.customOrderId),
      };
    })
    .sort((a, b) => (b.createdAtRaw ?? "").localeCompare(a.createdAtRaw ?? ""));
}

/**
 * previewLink — ดึงพัสดุใบเดียวพร้อมตารางเทียบที่อยู่กับคำสั่งซื้อ
 *
 * อ่านจาก iShip ใหม่ ไม่รับที่อยู่ที่ client ส่งมา — ที่อยู่ที่โชว์ให้ร้านตัดสินใจต้องเป็น
 * ของจริงจากต้นทาง ไม่ใช่ค่าที่เดินทางผ่านเบราว์เซอร์มาแล้ว (แก้ระหว่างทางได้)
 */
export async function previewLink(
  shopId: string,
  orderId: string,
  trackingNo: string,
): Promise<ParcelPreview> {
  const [{ order }, parcel] = await Promise.all([
    loadOrderForLink(shopId, orderId),
    fetchParcel(shopId, trackingNo),
  ]);

  const diff = diffReceiverAddress(
    {
      name: order.buyerName,
      phone: order.buyerContact,
      address: order.shippingAddress as DeepAddress | null,
    },
    parcel.receiver,
  );

  return { parcel, diff, hasConflict: hasAddressConflict(diff) };
}

/** อ่านคำสั่งซื้อ + กันเงื่อนไขที่ผูกไม่ได้ตั้งแต่ต้น */
async function loadOrderForLink(shopId: string, orderId: string) {
  const order = await prisma.order.findFirst({
    // scope ownership ใน where เสมอ (feedback_rsc_dal_authz)
    where: { id: orderId, shopId },
    select: {
      id: true,
      publicToken: true,
      status: true,
      fulfillmentMode: true,
      buyerName: true,
      buyerContact: true,
      shippingAddress: true,
    },
  });
  if (!order) throw new IShipServiceError("NOT_FOUND", "ไม่พบคำสั่งซื้อนี้");
  if (order.fulfillmentMode !== "SHIPPED") {
    throw new IShipServiceError("NOT_ELIGIBLE", "คำสั่งซื้อนี้ไม่ใช่แบบจัดส่ง");
  }
  return { order };
}

/** ดึงพัสดุใบเดียวจาก iShip แล้วแกะเป็นรูปที่หน้าจอใช้ได้ */
async function fetchParcel(
  shopId: string,
  trackingNo: string,
): Promise<UnlinkedParcelView> {
  const { token } = await loadAccount(shopId);
  const raw = await withTokenGuard(shopId, () => iship.getOrder(token, trackingNo));
  const parcel = parseParcelRow(raw);
  if (!parcel) {
    throw new IShipServiceError(
      "NOT_FOUND",
      "ไม่พบพัสดุเลขนี้ในบัญชี iShip ของร้าน",
    );
  }
  if (parcel.cancelledAtRaw) {
    throw new IShipServiceError("INVALID_STATE", "พัสดุใบนี้ถูกยกเลิกไปแล้ว");
  }

  const carrierStatus = carrierStatusCodeFromId(parcel.statusId);
  return {
    trackNo: parcel.trackNo,
    courierCode: parcel.courierCode,
    courierName: await resolveCourierName(shopId, parcel.courierCode),
    courierLogo: parcel.courierLogo,
    carrierStatus,
    carrierStatusText: parcel.statusName ?? describeCarrierStatus(carrierStatus).text,
    codAmount: parcel.codAmount,
    receiver: parcel.receiver,
    createdAtRaw: parcel.createdAtRaw,
    fromDeepOrphan: false,
  };
}

export type AddressResolution = "KEEP_ORDER" | "USE_ISHIP";

/**
 * linkShipment — ผูกพัสดุที่มีอยู่แล้วเข้ากับคำสั่งซื้อ
 *
 * ไม่เรียก create_order เลยสักครั้ง = ไม่เกิดค่าใช้จ่ายใหม่ของร้าน แต่ยังต้องให้ร้าน
 * ยืนยันอยู่ดี เพราะผูกผิดใบ = เลขติดตามผิดคนถูกส่งให้ผู้ซื้อ
 */
export async function linkShipment(
  shopId: string,
  userId: string,
  orderId: string,
  trackingNo: string,
  addressResolution: AddressResolution,
): Promise<ShipmentView> {
  const { order } = await loadOrderForLink(shopId, orderId);
  const parcel = await fetchParcel(shopId, trackingNo);

  // 1 คำสั่งซื้อมีพัสดุที่ยังใช้งานอยู่ได้ใบเดียว (BR-ISHIP-22) — เหมือนทางสร้างใหม่
  const active = await prisma.orderShipment.findFirst({
    where: { orderId, status: { not: "CANCELLED" } },
    select: { id: true },
  });
  if (active) {
    throw new IShipServiceError(
      "SHIPMENT_EXISTS",
      "คำสั่งซื้อนี้มีพัสดุที่ยังใช้งานอยู่แล้ว",
    );
  }

  // เลขติดตามห้ามซ้ำทั้งตาราง — เช็คก่อนเพื่อให้ได้ข้อความที่อธิบายได้ แทนที่จะปล่อยให้
  // ชน partial unique แล้วโผล่เป็น error กลาง ๆ ที่ร้านอ่านไม่รู้เรื่อง
  const taken = await prisma.orderShipment.findFirst({
    where: { trackingNo },
    select: { orderId: true },
  });
  if (taken) {
    throw new IShipServiceError(
      "SHIPMENT_EXISTS",
      taken.orderId === orderId
        ? "พัสดุใบนี้ผูกกับคำสั่งซื้อนี้อยู่แล้ว"
        : "พัสดุใบนี้ถูกผูกกับคำสั่งซื้ออื่นไปแล้ว",
    );
  }

  if (addressResolution === "USE_ISHIP") {
    await applyReceiverPatch(shopId, orderId, {
      name: parcel.receiver.name,
      phone: parcel.receiver.phone,
      line1: parcel.receiver.line1,
      subdistrict: parcel.receiver.subdistrict,
      district: parcel.receiver.district,
      province: parcel.receiver.province,
      postcode: parcel.receiver.postcode,
    });
  }

  const cancelledCount = await prisma.orderShipment.count({
    where: { orderId, status: "CANCELLED" },
  });

  // event อยู่ใน tx เดียวกับการสร้างแถวผูก (feature 00031 — บั๊กจริง 2026-08-05:
  // ผูกพัสดุแล้วประวัติคำสั่งซื้อไม่ขึ้น เพราะไม่มีจุดเขียน SHIPMENT_LINKED เลย)
  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.orderShipment.create({
      data: {
        orderId,
        shopId,
        status: "CREATED",
        source: "LINKED",
        linkedAt: new Date(),
        // คีย์คนละรูปกับใบที่เราเปิดเอง โดยเจตนา — ใบนี้ไม่เคยมี custom_order_id ของเรา
        // ฝั่ง iShip การเอารูปเดิมมาใช้จะทำให้อ่านผิดว่าเราเป็นคนยิง create_order
        idempotencyKey: `link:${trackingNo}:${cancelledCount + 1}`,
        trackingNo,
        courierCode: parcel.courierCode,
        courierName: parcel.courierName,
        codAmount: parcel.codAmount,
        carrierStatus: parcel.carrierStatus,
        carrierStatusText: parcel.carrierStatusText,
        carrierStatusAt: new Date(),
        createdByUserId: userId,
        receiverSnapshot: parcel.receiver as object,
      },
      select: { id: true },
    });
    await recordOrderEvent(tx, {
      orderId,
      type: "SHIPMENT_LINKED",
      actorUserId: userId,
      meta: { shipmentId: row.id, courierName: parcel.courierName ?? undefined },
    });
    return row;
  });

  // เติมไทม์ไลน์ย้อนหลังทันที — ใบที่ผูกย้อนหลังอาจเดินทางไปไกลแล้วตั้งแต่เมื่อวาน
  // ถ้าไม่ดึงตรงนี้ แถบความคืบหน้าจะค้างที่ขั้นแรกจนกว่าจะมีคนเปิดดูไทม์ไลน์
  //
  // ล้มแล้วห้าม rollback การผูก: แถวถูกสร้างถูกต้องแล้วจากสถานะที่ get_order คืนมา
  // ส่วนนี้เป็นแค่การเติมรายละเอียด — และกรณีที่พบบ่อยที่สุดคือ "ขนส่งยังไม่สแกน"
  // ซึ่ง iShip ตอบ 500 ไม่มีข้อความ (ไม่ใช่ความผิดพลาดจริง)
  try {
    await getTraces(shopId, created.id);
  } catch {
    // ตั้งใจกลืน — ดูเหตุผลด้านบน
  }

  await advanceOrderIfDispatched(order, parcel);

  // ใบที่ผูกย้อนหลังคือจุดที่ข้อมูลสองฝั่งไม่ตรงกันบ่อยที่สุด — ร้านเปิดพัสดุแบบเก็บเงิน
  // ปลายทางบนเว็บ iShip แล้วมาบันทึกคำสั่งซื้อในระบบเราทีหลังโดยไม่ได้ติ๊ก COD
  const paymentNotice = await syncOrderPaymentToParcel(orderId, parcel.codAmount, userId);

  const row = await prisma.orderShipment.findUniqueOrThrow({
    where: { id: created.id },
    select: SHIPMENT_SELECT,
  });
  return { ...toShipmentView(row), paymentNotice };
}

/**
 * advanceOrderIfDispatched — ขยับคำสั่งซื้อเป็น "จัดส่งแล้ว" เมื่อพัสดุออกเดินทางไปแล้ว
 *
 * ==========================================================================
 * ข้อยกเว้นที่ user ตัดสินไว้ 2026-08-01 — ขอบเขตแคบ ๆ เฉพาะ "การผูกพัสดุ" เท่านั้น
 * --------------------------------------------------------------------------
 * BR-ISHIP-41 เดิมห้ามระบบขยับสถานะคำสั่งซื้อเอง (ให้ webhook แค่ "เสนอ") เหตุผลคือ
 * พัสดุที่เราเปิดเองจะเดินทางไปพร้อมกับที่ร้านยังดูหน้าจออยู่ การให้ร้านกดยืนยันจึงไม่
 * เสียเวลาอะไร
 *
 * แต่การผูกย้อนหลังเป็นคนละสถานการณ์: ร้านสร้างพัสดุไว้ตั้งแต่กลางวัน มาบันทึกคำสั่งซื้อ
 * ตอนกลางคืน พัสดุอาจถึงมือผู้ซื้อไปแล้วด้วยซ้ำ ถ้าไม่ขยับให้ ออเดอร์จะค้างที่ "รอจัดส่ง"
 * ทั้งที่ของถึงแล้ว — ผู้ซื้อที่เปิดลิงก์ออเดอร์จะเห็นข้อมูลที่ขัดกับความจริงตรงหน้า
 *
 * จึงเขียน ShipmentTracking ที่นี่ ซึ่ง "ทำลายข้อสังเกตเดิม" ที่ order.service เขียนไว้ว่า
 * iShip flow ไม่เคยแตะตารางนั้น — ตั้งใจและจำกัดไว้ที่ฟังก์ชันนี้ฟังก์ชันเดียว
 * ใช้ upsert เพราะ orderId เป็น unique: ออเดอร์ที่ร้านเคยกด "แจ้งจัดส่ง" ด้วยมือมาก่อน
 * จะมีแถวอยู่แล้ว ถ้า create ตรง ๆ จะชน P2002 แล้วการผูกล้มทั้งที่ไม่มีอะไรผิด
 * ==========================================================================
 */
async function advanceOrderIfDispatched(
  order: { id: string; status: string },
  parcel: UnlinkedParcelView,
): Promise<void> {
  // PENDING เท่านั้น — ออเดอร์ที่ยืนยัน/ยกเลิกไปแล้วห้ามถูกดึงกลับมาเป็น "จัดส่งแล้ว"
  if (order.status !== "PENDING") return;
  if (!impliesDispatched(parcel.carrierStatus)) return;

  await prisma.$transaction(async (tx) => {
    await tx.shipmentTracking.upsert({
      where: { orderId: order.id },
      create: {
        orderId: order.id,
        provider: parcel.courierCode ?? "ISHIP",
        trackingNo: parcel.trackNo,
      },
      update: {
        provider: parcel.courierCode ?? "ISHIP",
        trackingNo: parcel.trackNo,
      },
    });
    await tx.order.update({ where: { id: order.id }, data: { status: "SHIPPED" } });
  });
}

/**
 * unlinkShipment — เลิกผูก (ไม่ยกเลิกพัสดุจริงกับขนส่ง)
 *
 * ทำไมต้อง "ลบแถว" ไม่ใช่ mark CANCELLED เหมือนการยกเลิกพัสดุ:
 * partial unique ของ trackingNo ครอบทุกแถวที่ trackingNo ไม่เป็น null โดยไม่สนสถานะ
 * ถ้าปิดใบด้วย CANCELLED เลขนั้นจะถูกจองไว้ตลอดกาล แล้วร้านที่ผูกผิดใบจะเอาไปผูกกับ
 * คำสั่งซื้อที่ถูกต้องไม่ได้อีกเลย ซึ่งขัดกับเหตุผลทั้งหมดที่ปุ่มนี้มีอยู่
 */
export async function unlinkShipment(
  shopId: string,
  shipmentId: string,
): Promise<void> {
  const row = await prisma.orderShipment.findFirst({
    where: { id: shipmentId, shopId },
    select: { id: true, orderId: true, source: true, trackingNo: true },
  });
  if (!row) throw new IShipServiceError("NOT_FOUND", "ไม่พบพัสดุนี้");
  if (row.source !== "LINKED") {
    throw new IShipServiceError(
      "INVALID_STATE",
      "พัสดุใบนี้เปิดผ่าน Deep — ต้องใช้ปุ่มยกเลิกพัสดุ ไม่ใช่เลิกผูก",
    );
  }

  await prisma.$transaction(async (tx) => {
    // คืนสถานะออเดอร์ที่ "ขยับให้ตอนผูก" กลับด้วย — ไม่งั้นเลิกผูกแล้วออเดอร์ยังค้าง
    // เป็น "จัดส่งแล้ว" พร้อมเลขพัสดุที่ไม่เกี่ยวข้องกันอีกต่อไป
    const tracking = await tx.shipmentTracking.findUnique({
      where: { orderId: row.orderId },
      select: { id: true, trackingNo: true },
    });
    if (tracking && row.trackingNo && tracking.trackingNo === row.trackingNo) {
      await tx.shipmentTracking.delete({ where: { id: tracking.id } });
      const order = await tx.order.findUnique({
        where: { id: row.orderId },
        select: { status: true },
      });
      if (order?.status === "SHIPPED") {
        await tx.order.update({
          where: { id: row.orderId },
          data: { status: "PENDING" },
        });
      }
    }
    await tx.orderShipment.delete({ where: { id: row.id } });
  });
}

/**
 * importParcelAsOrder — ดึงพัสดุจาก iShip มาสร้างคำสั่งซื้อใหม่ แล้วผูกให้เลย
 *
 * ใช้กับร้านที่เปิดพัสดุบน iShip ก่อนเสมอและไม่อยากคีย์ออเดอร์ซ้ำอีกรอบ
 * ต่างจาก linkShipment ตรงที่ "ยังไม่มีคำสั่งซื้อ" — ตัวนี้สร้างให้จากข้อมูลบนพัสดุ
 *
 * ==========================================================================
 * ข้อจำกัดที่แก้ไม่ได้: iShip ไม่คืนรายการสินค้า
 * --------------------------------------------------------------------------
 * ยืนยันแล้วทั้ง query_orders และ get_order — ไม่มี products/items ในคำตอบเลย
 * (ขาออกเราส่ง products ไปได้ แต่ขาเข้าเขาไม่ส่งกลับ) พัสดุจึงบอกได้แค่ว่า
 * "ส่งของให้ใคร ที่ไหน เก็บเงินเท่าไร" ไม่ได้บอกว่า "ขายอะไร"
 *
 * user ตัดสิน 2026-08-01: สร้างเลยด้วยรายการกลาง ๆ 1 บรรทัด แล้วให้ร้านไปแก้ชื่อ/ราคา
 * ทีหลังได้ — เร็วกว่าการบังคับให้กรอกก่อน และร้านกลุ่มนี้ต้องการความเร็วเป็นหลัก
 * ยอดเงินมาจาก cod_amount ซึ่งเป็นตัวเลขเดียวที่พัสดุรู้จริง (พัสดุที่จ่ายมาแล้ว = 0)
 * ==========================================================================
 */
export async function importParcelAsOrder(
  shopId: string,
  userId: string,
  trackingNo: string,
  item?: { name?: string; price?: number },
): Promise<{ orderId: string; orderToken: string; shipment: ShipmentView }> {
  const parcel = await fetchParcel(shopId, trackingNo);

  // กันสร้างออเดอร์ซ้ำจากพัสดุใบเดิม — เช็คก่อนแตะอะไรทั้งนั้น เพราะถ้าปล่อยให้ไปชน
  // partial unique ตอนผูก ออเดอร์ที่เพิ่งสร้างจะค้างเป็นขยะโดยไม่มีพัสดุผูกอยู่
  const taken = await prisma.orderShipment.findFirst({
    where: { trackingNo },
    select: { orderId: true },
  });
  if (taken) {
    throw new IShipServiceError(
      "SHIPMENT_EXISTS",
      "พัสดุใบนี้ถูกผูกกับคำสั่งซื้ออื่นไปแล้ว",
    );
  }

  const missing = findMissingReceiverFields(
    {
      line1: parcel.receiver.line1,
      subdistrict: parcel.receiver.subdistrict,
      district: parcel.receiver.district,
      province: parcel.receiver.province,
      postcode: parcel.receiver.postcode,
    },
    parcel.receiver.name,
    parcel.receiver.phone,
  );
  if (missing.length > 0) {
    throw new IShipServiceError(
      "INCOMPLETE_DATA",
      `พัสดุใบนี้มีข้อมูลผู้รับไม่ครบ — ขาด ${missing.join(", ")}`,
      missing,
    );
  }

  // 🛑 ตรวจ *รูปแบบ* เบอร์ผู้รับ ไม่ใช่แค่ "มีค่าไหม" — ฟังก์ชันนี้เรียก createOrder() ตรง ๆ
  // จึงไม่ผ่าน CreateOrderSchema เหมือนทาง API ⇒ เบอร์รูปแบบใดก็ได้จากระบบภายนอกเคยลง
  // Order.buyerContact ได้โดยไม่มีด่านไหนขวาง (ext 2026-08-21)
  //
  // 🛑 ปฏิเสธ ไม่ normalize ให้ — ถ้าเราแก้ค่าเงียบ ๆ ร้านจะไม่มีวันรู้ว่าเบอร์ที่บันทึก
  // ต่างจากที่อยู่บนพัสดุจริง (มติ: backend validate อย่างเดียว ห้ามแก้ค่าแทนผู้ใช้)
  if (!MOBILE_PHONE_RE.test(parcel.receiver.phone ?? "")) {
    throw new IShipServiceError(
      "INCOMPLETE_DATA",
      `เบอร์ผู้รับบนพัสดุใบนี้ไม่ใช่เบอร์มือถือ 10 หลัก (${parcel.receiver.phone ?? "ไม่มีค่า"}) — แก้ที่ iShip แล้วลองใหม่`,
      ["เบอร์โทรผู้รับ"],
    );
  }

  const order = await createOrder(shopId, {
    // ผูกพัสดุที่มีอยู่บน iShip แล้วออกออเดอร์ตาม — คนกดคือสมาชิกร้านคนนี้ (2026-08-04)
    createdByUserId: userId,
    items: [
      {
        // ค่าเริ่มต้นอ้างอิงกลับไปยังพัสดุได้ ร้านแก้ตั้งแต่ก่อนกดสร้างก็ได้
        // (iShip ไม่คืนรายการสินค้า จึงเดาชื่อจริงแทนร้านไม่ได้)
        name: item?.name?.trim() || `สินค้าตามพัสดุ ${parcel.trackNo}`,
        qty: 1,
        price: item?.price ?? parcel.codAmount,
      },
    ],
    type: "PHYSICAL",
    buyerName: parcel.receiver.name ?? undefined,
    buyerContact: parcel.receiver.phone ?? undefined,
    // COD เฉพาะใบที่มียอดเก็บปลายทางจริง — ใบที่จ่ายมาแล้วต้องไม่กลายเป็นเก็บเงินซ้ำ
    // COD ผูกกับ cod_amount ของพัสดุเท่านั้น ไม่ผูกกับราคาที่ร้านพิมพ์ —
    // ยอดที่ขนส่งจะไปเก็บจริงคือตัวที่อยู่บนพัสดุ ไม่ใช่ตัวที่เราบันทึก
    paymentMethod: parcel.codAmount > 0 ? "COD" : undefined,
    salesChannel: "ISHIP_IMPORT",
    internalNote: `สร้างจากพัสดุ iShip ${parcel.trackNo}`,
    shippingAddress: {
      line1: parcel.receiver.line1 ?? undefined,
      subdistrict: parcel.receiver.subdistrict ?? undefined,
      district: parcel.receiver.district ?? undefined,
      province: parcel.receiver.province ?? undefined,
      postcode: parcel.receiver.postcode ?? undefined,
    },
  });

  // ผูกทันทีด้วย KEEP_ORDER — ที่อยู่ในออเดอร์เพิ่งถูกสร้างจากพัสดุใบนี้เอง
  // จึงตรงกันอยู่แล้วโดยนิยาม ไม่มีอะไรให้ reconcile
  const shipment = await linkShipment(
    shopId,
    userId,
    order.id,
    trackingNo,
    "KEEP_ORDER",
  );

  return { orderId: order.id, orderToken: order.publicToken, shipment };
}
