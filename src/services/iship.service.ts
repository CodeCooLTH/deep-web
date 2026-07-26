// feature 00022 — iShip Shipping Integration (service layer)
//
// ความรับผิดชอบของชั้นนี้: กฎธุรกิจ + สิทธิ์ + เขียนฐานข้อมูล
// เป็น "จุดเดียวในระบบ" ที่ถอดรหัส token ของร้าน — token ไม่เคยออกจากไฟล์นี้
// ไปที่อื่นนอกจากถูกส่งเป็นพารามิเตอร์ให้ lib/iship
//
// ข้อควรระวัง: view type ทุกตัวที่คืนออกไป ไม่มี field token ตั้งแต่ระดับ type
// (ไม่ใช่หวังว่าจะไม่เผลอใส่) — ดู ConnectionView / SettingsView / ShipmentView

import { prisma } from "@/lib/prisma";
import { decryptToken, encryptToken } from "@/lib/token-crypto";
import * as iship from "@/lib/iship/client";
import { IShipError } from "@/lib/iship/errors";
import {
  buildCreateOrderPayload,
  buildIdempotencyKey,
  findMissingReceiverFields,
  findMissingSenderFields,
  type DeepAddress,
  type MissingAddressField,
  type SenderAddress,
} from "@/lib/iship/mapping";

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
  /** ข้อความไทยที่แสดงได้ — ไม่ใช่ข้อความดิบจาก iShip */
  lastErrorMessage: string | null;
  createdAt: Date;
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
      createMode: "ASK",
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
  defaultCodEnabled?: boolean;
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
    defaultCodEnabled: a.defaultCodEnabled,
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

// ─── ความมีสิทธิ์ของออเดอร์ (pure — เทสได้โดยไม่ต้องมี DB) ──────────────────

export interface EligibilityOrderLike {
  type: string;
  fulfillmentMode: string;
  buyerName: string | null;
  buyerContact: string | null;
  shippingAddress: DeepAddress | null;
}

export type EligibilityResult =
  | { eligible: true }
  /** ออเดอร์นี้ไม่เกี่ยวกับการส่งของ — ห้ามรบกวนร้าน (FR-ISHIP-023) */
  | { eligible: false; kind: "SKIP_SILENT"; reason: string }
  /** ควรส่งได้แต่ข้อมูลขาด — ต้องบอกร้านว่าขาดอะไร */
  | { eligible: false; kind: "NEEDS_FIX"; missing: MissingAddressField[] };

export function checkEligibility(
  order: EligibilityOrderLike,
  account: { senderAddress: SenderAddress } | null,
): EligibilityResult {
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
    return { eligible: false, kind: "SKIP_SILENT", reason: "ร้านยังไม่ได้เชื่อมต่อ iShip" };
  }

  const missingSender = findMissingSenderFields(account.senderAddress);
  if (missingSender.length > 0) {
    return { eligible: false, kind: "NEEDS_FIX", missing: missingSender };
  }

  const missingReceiver = findMissingReceiverFields(
    order.shippingAddress,
    order.buyerName,
    order.buyerContact,
  );
  if (missingReceiver.length > 0) {
    return { eligible: false, kind: "NEEDS_FIX", missing: missingReceiver };
  }

  return { eligible: true };
}

// ─── พัสดุ ──────────────────────────────────────────────────────────────────

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

function toShipmentView(s: {
  id: string;
  orderId: string;
  status: string;
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
  createdAt: Date;
}): ShipmentView {
  return {
    ...s,
    // ข้อความที่แสดงต่อผู้ใช้มาจาก error code ของเรา ไม่ใช่ lastErrorMessage ที่เป็นข้อความดิบ
    lastErrorMessage: s.lastErrorCode
      ? new IShipError(s.lastErrorCode as never).userMessage
      : null,
  };
}

const SHIPMENT_SELECT = {
  id: true,
  orderId: true,
  status: true,
  courierCode: true,
  courierName: true,
  trackingNo: true,
  carrierStatus: true,
  carrierStatusText: true,
  carrierStatusAt: true,
  isOverWeight: true,
  isOverSize: true,
  labelPrintedAt: true,
  labelPrintCount: true,
  isDryRun: true,
  lastErrorCode: true,
  createdAt: true,
} as const;

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
): Promise<ShipmentView> {
  const { account, token } = await loadAccount(shopId);

  const order = await prisma.order.findFirst({
    // scope ownership ใน where — ไม่ใช่ findUnique แล้วค่อยเช็คทีหลัง
    // (feedback_rsc_dal_authz: การ redirect/throw หลังดึงข้อมูลทำให้ PII หลุดเข้า payload ไปแล้ว)
    where: { id: orderId, shopId },
    select: {
      id: true,
      type: true,
      fulfillmentMode: true,
      buyerName: true,
      buyerContact: true,
      shippingAddress: true,
      totalAmount: true,
      items: { select: { name: true, qty: true, price: true } },
    },
  });
  if (!order) throw new IShipServiceError("NOT_FOUND", "ไม่พบคำสั่งซื้อนี้");

  const eligibility = checkEligibility(
    {
      type: order.type,
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
    where: { orderId, status: { not: "CANCELLED" } },
    select: SHIPMENT_SELECT,
  });
  if (active) {
    if (active.status === "FAILED") return retryShipment(shopId, userId, active.id);
    throw new IShipServiceError(
      "SHIPMENT_EXISTS",
      "คำสั่งซื้อนี้มีพัสดุที่ยังใช้งานอยู่แล้ว",
    );
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

  if (!courierCode || categoryId == null || weight == null || width == null || length == null || height == null) {
    throw new IShipServiceError(
      "INCOMPLETE_DATA",
      "ยังตั้งค่าเริ่มต้นของพัสดุไม่ครบ (ขนส่ง ประเภทสินค้า น้ำหนัก หรือขนาดกล่อง)",
    );
  }

  const codAmount = override?.codAmount ?? (account.defaultCodEnabled ? Number(order.totalAmount) : 0);
  const receiverAddress = order.shippingAddress as DeepAddress;

  const shipment = await prisma.orderShipment.create({
    data: {
      orderId,
      shopId,
      status: "PENDING",
      idempotencyKey,
      courierCode,
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
      optionsSnapshot: (override?.options ?? {
        onTime: account.optOnTime,
        boxShield: account.optBoxShield,
        isInsured: account.optIsInsured,
        productValue: account.optProductValue ? Number(account.optProductValue) : null,
        serviceType: account.optServiceType,
      }) as object,
      createdByUserId: userId,
    },
    select: SHIPMENT_SELECT,
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
): Promise<ShipmentView> {
  const { token } = await loadAccount(shopId);
  const existing = await prisma.orderShipment.findFirst({
    where: { id: shipmentId, shopId },
    select: { id: true, status: true },
  });
  if (!existing) throw new IShipServiceError("NOT_FOUND", "ไม่พบพัสดุนี้");
  if (existing.status !== "FAILED") {
    throw new IShipServiceError(
      "INVALID_STATE",
      "พัสดุนี้ไม่ได้อยู่ในสถานะที่ลองใหม่ได้",
    );
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
  const options = row.optionsSnapshot as unknown as ShipmentOverride["options"];

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
    options,
    items: order.items.map((i) => ({ name: i.name, qty: i.qty, price: Number(i.price) })),
  });

  try {
    const { result, dryRun } = await withTokenGuard(shopId, () =>
      iship.createOrder(token, payload),
    );
    const updated = await prisma.orderShipment.update({
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
    select: { id: true, status: true, trackingNo: true },
  });
  if (!row) throw new IShipServiceError("NOT_FOUND", "ไม่พบพัสดุนี้");
  if (row.status === "CANCELLED") {
    throw new IShipServiceError("INVALID_STATE", "พัสดุนี้ถูกยกเลิกไปแล้ว");
  }

  // ใบที่ยังไม่มี tracking (FAILED ตั้งแต่แรก) ไม่ต้องแจ้ง iShip — ไม่มีอะไรให้ยกเลิกที่นั่น
  if (row.trackingNo) {
    await withTokenGuard(shopId, () => iship.cancelOrder(token, row.trackingNo!));
  }

  const updated = await prisma.orderShipment.update({
    where: { id: shipmentId },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancelledByUserId: userId,
    },
    select: SHIPMENT_SELECT,
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

// ─── ประวัติการเดินทาง ──────────────────────────────────────────────────────

export async function getTraces(shopId: string, shipmentId: string) {
  const { token } = await loadAccount(shopId);
  const row = await prisma.orderShipment.findFirst({
    where: { id: shipmentId, shopId },
    select: { id: true, trackingNo: true },
  });
  if (!row) throw new IShipServiceError("NOT_FOUND", "ไม่พบพัสดุนี้");
  if (!row.trackingNo) return [];

  const routes = await withTokenGuard(shopId, () =>
    iship.getTraces(token, row.trackingNo!),
  );

  // เก็บลงฐานข้อมูลด้วย เพื่อให้ไทม์ไลน์ยังอ่านได้แม้ผู้ให้บริการล่ม
  for (const r of routes) {
    const occurredAt = new Date(r.timestamp.replace(" ", "T"));
    if (Number.isNaN(occurredAt.getTime())) continue;
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
  }

  return prisma.shipmentEvent.findMany({
    where: { shipmentId: row.id },
    orderBy: { occurredAt: "asc" },
  });
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
