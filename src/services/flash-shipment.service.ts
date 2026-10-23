import "server-only";
// feature 00084 T6a — flash-shipment.service: สร้าง/ลองใหม่/resolve(1003)/ดูตัวอย่าง pno/ผูก pno (TFR-FLASH-009/010/011)
//
// ขนานกับ createShipment/retryShipment/linkShipment ของ iShip (00022) — pattern เดียวกัน: แถว PENDING ก่อนยิง,
// unique index เป็นด่านกันกดซ้ำ, ความล้มเหลวของ Flash คืน view (FAILED/NEEDS_REVIEW) ไม่ throw
// 🛑 ไฟล์นี้ห้ามเขียน Order.status (BR-FLASH-40) — เขียนได้เฉพาะแถวพัสดุ + OrderEvent + (ผ่านตัวกลางเดิม) ที่อยู่/วิธีชำระ

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { LATEST_FORWARD_SHIPMENT, ACTIVE_FORWARD_SHIPMENT } from "@/lib/shipment-direction";
import * as flash from "@/lib/flash/client";
import { FlashError, FlashServiceError, redactFlash } from "@/lib/flash/errors";
import { isFlashDirectEnabled, isFlashDryRun } from "@/lib/flash/gate";
import { buildCreateOrderParams, buildFlashOutTradeNo, type FlashParams } from "@/lib/flash/mapping";
import { FlashUnitError } from "@/lib/flash/units";
import { mapFlashState, normalizeRoutes } from "@/lib/flash/status";
import { describeCarrierStatus } from "@/lib/iship/status";
import { checkEligibility } from "@/lib/iship/eligibility";
import { resolveDefaultCodAmount } from "@/lib/iship/payment-sync";
import type { DeepAddress, SenderAddress } from "@/lib/iship/mapping";
import {
  SHIPMENT_SELECT,
  applyReceiverPatch,
  toShipmentView,
  type ReceiverPatch,
  type ShipmentView,
} from "@/services/iship.service";
import { syncOrderPaymentToParcel } from "@/services/order.service";
import { recordOrderEvent } from "@/services/order-event.service";
import { reserveTrackingNotice, dispatchAutoNotifyAfterCommit } from "@/services/auto-notify.service";
import { FLASH, loadFlashAccount, type FlashAccountRow, type FlashCred, type LoadedFlashAccount } from "@/services/flash-account";
import { estimateFlashPrice, withFlashGuard } from "@/services/flash.service";
import { applyFlashRoutes } from "@/services/flash-status.service";

const COURIER_NAME = "Flash Express";
const PNO_RE = /^[A-Za-z0-9]{6,32}$/;

type Rec = Record<string, unknown>;

export interface FlashShipmentOverride {
  weight?: number;
  width?: number;
  length?: number;
  height?: number;
  categoryId?: number;
  codAmount?: number;
  remark?: string | null;
  options?: { onTime?: boolean; boxShield?: boolean; isInsured?: boolean; productValue?: number | null };
}

export type FlashResolveInput =
  | { action: "LINK_PNO"; pno: string }
  | { action: "REOPEN"; confirmNoExistingParcel: true; override?: FlashShipmentOverride };

// ─── helper ภายใน ───────────────────────────────────────────────────────────

function assertEnabled(): void {
  if (!isFlashDirectEnabled()) throw new FlashServiceError("FEATURE_DISABLED", "ยังไม่เปิดให้เชื่อม Flash ตรง");
}

async function requireAccount(shopId: string): Promise<LoadedFlashAccount> {
  const loaded = await loadFlashAccount(shopId);
  if (!loaded) throw new FlashServiceError("NOT_CONNECTED", "ร้านนี้ยังไม่ได้เชื่อมต่อกับ Flash");
  return loaded;
}

function senderOf(a: FlashAccountRow): SenderAddress {
  return {
    name: a.senderName, phone: a.senderPhone, address: a.senderAddress,
    subdistrict: a.senderSubdistrict, // ตำบล
    district: a.senderDistrict, // อำเภอ
    province: a.senderProvince, postcode: a.senderPostcode,
  };
}

interface OptionsSnap {
  onTime: boolean;
  boxShield: boolean;
  isInsured: boolean;
  productValue: number | null;
  remark: string | null;
}

const readOptions = (snap: unknown): OptionsSnap => {
  const s = (snap && typeof snap === "object" ? snap : {}) as Rec;
  return {
    onTime: s.onTime === true,
    boxShield: s.boxShield === true,
    isInsured: s.isInsured === true,
    productValue: typeof s.productValue === "number" ? s.productValue : null,
    remark: typeof s.remark === "string" ? s.remark : null,
  };
};

type ReceiverSnap = DeepAddress & { name: string; phone: string };
type ParcelSnap = {
  weight: number | null; width: number | null; length: number | null; height: number | null; categoryId: number | null;
};
type OrderForShip = {
  buyerName: string | null;
  buyerContact: string | null;
  shippingAddress: unknown;
  items: { name: string; qty: number }[];
};

const receiverOf = (o: OrderForShip): ReceiverSnap => ({
  name: o.buyerName ?? "",
  phone: o.buyerContact ?? "",
  ...((o.shippingAddress as DeepAddress | null) ?? {}),
});

/** ตรวจ + สร้าง params จุดเดียว (ก่อนมีแถว PENDING และก่อนยิง) — FlashUnitError = ข้อมูลเราผิด → INCOMPLETE_DATA (SDS §8.3) */
function buildParams(a: {
  outTradeNo: string; sender: SenderAddress; receiver: ReceiverSnap; parcel: ParcelSnap;
  codAmount: number; options: OptionsSnap; items: { name: string; qty: number }[];
}): FlashParams {
  try {
    return buildCreateOrderParams({
      outTradeNo: a.outTradeNo,
      sender: a.sender,
      receiver: { name: a.receiver.name, phone: a.receiver.phone, address: a.receiver },
      // weight/categoryId ที่เป็น null ถูกจับด้วย findMissingFlashParcelFields ข้างใน ก่อนถูกใช้
      parcel: { ...a.parcel, weight: a.parcel.weight as number, categoryId: a.parcel.categoryId as number },
      codAmount: a.codAmount,
      items: a.items,
      remark: a.options.remark,
      options: a.options,
    });
  } catch (e) {
    if (e instanceof FlashUnitError) throw new FlashServiceError("INCOMPLETE_DATA", `ข้อมูลพัสดุไม่ถูกต้อง: ${e.message}`, []);
    throw e;
  }
}

const isP2002 = (e: unknown): e is Prisma.PrismaClientKnownRequestError =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

/** ราคาประมาณ ณ ตอนสร้าง — best-effort กลืนทุก error (ข้อมูลประกอบ ไม่ใช่ด่าน) */
async function captureEstimate(shopId: string, shipmentId: string, receiver: DeepAddress, parcel: ParcelSnap): Promise<void> {
  try {
    if (parcel.weight == null) return;
    const q = await estimateFlashPrice(shopId, {
      receiver: {
        district: receiver.district ?? "", province: receiver.province ?? "", postcode: receiver.postcode ?? "",
        subdistrict: receiver.subdistrict,
      },
      weight: parcel.weight, width: parcel.width, length: parcel.length, height: parcel.height,
    });
    const cur = await prisma.orderShipment.findUnique({ where: { id: shipmentId }, select: { optionsSnapshot: true } });
    const snap = ((cur?.optionsSnapshot as Rec | null) ?? {}) as Rec;
    await prisma.orderShipment.update({
      where: { id: shipmentId },
      data: {
        estimatedPrice: q.totalBaht,
        optionsSnapshot: { ...snap, flash: { ...((snap.flash as Rec | undefined) ?? {}), pricingTable: q.pricingTable } } as object,
      },
    });
  } catch {
    /* เงียบโดยเจตนา — พัสดุเปิดสำเร็จแล้ว */
  }
}

/** ยกเลิกแทรกระหว่างยิง create — แถวไม่ใช่ PENDING แล้ว ห้ามเขียนผลทับ */
class LostCreateRace extends Error {}

/**
 * ยิง /open/v3/orders แล้วบันทึกผล — ใช้ร่วมทั้งสร้างครั้งแรก/ลองใหม่
 * ไม่ยิงใน $transaction (คำขอ ≤20s) · ล้มทุกชนิด = คืน view ที่ FAILED/NEEDS_REVIEW ไม่ throw (BR-FLASH-20)
 */
async function dispatchFlash(a: {
  shopId: string; userId: string; cred: FlashCred; shipmentId: string; orderId: string; outTradeNo: string;
  params: FlashParams; options: OptionsSnap; receiver: DeepAddress; parcel: ParcelSnap; courierName: string | null;
}): Promise<ShipmentView> {
  let createdPno: string | null = null;
  try {
    const result = await withFlashGuard(a.shopId, () => flash.createOrder(a.cred, a.params));
    const pno = typeof result?.pno === "string" ? result.pno.trim() : "";
    if (!pno) throw new FlashError("UPSTREAM_ERROR", { upstreamMessage: "create: no pno" });
    createdPno = pno;
    const dryRun = isFlashDryRun();
    let ledgerId: string | null = null;
    const updated = await prisma.$transaction(async (tx) => {
      // conditional: ถ้าระหว่างยิงแถวถูกยกเลิก (ไม่ใช่ PENDING แล้ว) ห้ามทับ
      const r = await tx.orderShipment.updateMany({
        where: { id: a.shipmentId, status: "PENDING" },
        data: {
          status: "CREATED",
          trackingNo: pno,
          isDryRun: dryRun,
          attemptCount: { increment: 1 },
          lastErrorCode: null,
          lastErrorMessage: null,
          optionsSnapshot: {
            ...a.options,
            flash: { sortCode: result.sortCode, sortingLineCode: result.sortingLineCode, dstStoreName: result.dstStoreName },
          } as object,
        },
      });
      if (r.count === 0) throw new LostCreateRace();
      const u = await tx.orderShipment.findUniqueOrThrow({ where: { id: a.shipmentId }, select: SHIPMENT_SELECT });
      await recordOrderEvent(tx, {
        orderId: a.orderId, type: "SHIPMENT_CREATED", actorUserId: a.userId,
        meta: { shipmentId: a.shipmentId, courierName: a.courierName ?? undefined, provider: FLASH },
      });
      // เลขจากโหมดทดลองเป็นเลขปลอม ห้ามส่งให้ลูกค้า (ไม่จอง)
      if (!dryRun) ledgerId = await reserveTrackingNotice(tx, a.orderId, pno);
      return u;
    });
    dispatchAutoNotifyAfterCommit(ledgerId);
    await captureEstimate(a.shopId, a.shipmentId, a.receiver, a.parcel);
    return toShipmentView(updated);
  } catch (err) {
    if (err instanceof LostCreateRace) {
      // Flash เปิดใบจริงแล้วแต่แถวถูกยกเลิกไปก่อน → ยกเลิกฝั่ง Flash ตามให้ (best-effort) ไม่งั้นใบกำพร้ามีค่าใช้จ่าย
      if (createdPno) {
        try {
          await withFlashGuard(a.shopId, () => flash.cancelOrder(a.cred, createdPno!));
        } catch (e) {
          console.error(`[flash-create] cancel-after-race ล้ม pno=${createdPno}`, e instanceof Error ? e.name : "error");
        }
      }
      console.warn(`[flash-create] lost race (cancelled during create) ${a.outTradeNo} pno=${createdPno}`);
      return toShipmentView(await prisma.orderShipment.findUniqueOrThrow({ where: { id: a.shipmentId }, select: SHIPMENT_SELECT }));
    }
    const fe = err instanceof FlashError ? err : null;
    const code = fe?.code ?? "UPSTREAM_ERROR";
    // 1003 = outTradeNo ซ้ำ โดยเราไม่มี pno → ห้ามเดา/ห้ามเปิดใบใหม่ ให้คนตัดสิน (BR-FLASH-23)
    const status = code === "DUPLICATE_ORDER" ? "NEEDS_REVIEW" : "FAILED";
    const raw = fe ? (fe.upstreamMessage ?? "") : redactFlash(err instanceof Error ? err.message : String(err));
    console.warn(`[flash-create] ${code} ${a.outTradeNo}`, raw.slice(0, 200), createdPno ? `pno=${createdPno}` : "");
    // เก็บรหัสดิบของ Flash (ถ้ามี) เพราะ toShipmentView ใช้ค่านี้เลือกข้อความไทยเฉพาะรหัส; ไม่มี → ข้อความ (+pno กรณี DB ล้มหลัง Flash สำเร็จ)
    const message = fe?.flashCode ?? (createdPno ? `${raw} pno=${createdPno}`.trim() : raw) ?? null;
    await prisma.orderShipment.updateMany({
      where: { id: a.shipmentId, status: "PENDING" }, // ถูกยกเลิกระหว่างยิง = คง CANCELLED
      data: { status, attemptCount: { increment: 1 }, lastErrorCode: code, lastErrorMessage: message ? message.slice(0, 500) : null },
    });
    return toShipmentView(await prisma.orderShipment.findUniqueOrThrow({ where: { id: a.shipmentId }, select: SHIPMENT_SELECT }));
  }
}

const orderSelect = {
  buyerName: true, buyerContact: true, shippingAddress: true,
  items: { select: { name: true, qty: true } },
} as const;

// ─── สร้าง ──────────────────────────────────────────────────────────────────

/** ลำดับตาม TFR-FLASH-009 — รอบ outTradeNo = จำนวนใบที่ถูกยกเลิก + 1 (ลองใหม่ของ FAILED ใช้คีย์เดิม) */
export async function createFlashShipment(
  shopId: string,
  userId: string,
  orderId: string,
  override?: FlashShipmentOverride,
  receiverPatch?: ReceiverPatch,
): Promise<ShipmentView> {
  assertEnabled();
  const { account, cred } = await requireAccount(shopId);

  // เขียนที่อยู่กลับออเดอร์ "ก่อน" ตรวจ (บทเรียน 00022)
  if (receiverPatch) await applyReceiverPatch(shopId, orderId, receiverPatch);

  const order = await prisma.order.findFirst({
    where: { id: orderId, shopId },
    select: { ...orderSelect, fulfillmentMode: true, totalAmount: true, paymentMethod: true },
  });
  if (!order) throw new FlashServiceError("NOT_FOUND", "ไม่พบคำสั่งซื้อนี้");

  // 00080 — บันทึกเลขส่งเองไว้และไม่มีพัสดุ live → เปิดใบทับไม่ได้
  const [manual, live] = await Promise.all([
    prisma.shipmentTracking.findUnique({ where: { orderId }, select: { id: true } }),
    prisma.orderShipment.findFirst({ where: { orderId, ...ACTIVE_FORWARD_SHIPMENT }, select: { id: true } }),
  ]);
  if (manual && !live) {
    throw new FlashServiceError("SHIPMENT_EXISTS", "คำสั่งซื้อนี้บันทึกเลขพัสดุส่งเองไว้แล้ว ถ้าจะส่งผ่าน Flash ให้แก้/ลบเลขส่งเองก่อน");
  }

  const eligibility = checkEligibility(
    {
      fulfillmentMode: order.fulfillmentMode, buyerName: order.buyerName, buyerContact: order.buyerContact,
      shippingAddress: order.shippingAddress as DeepAddress | null,
    },
    { senderAddress: senderOf(account) },
  );
  if (!eligibility.eligible) {
    if (eligibility.kind === "NEEDS_FIX") {
      throw new FlashServiceError("INCOMPLETE_DATA", `สร้างพัสดุไม่ได้ — ยังไม่มี ${eligibility.missing.join(", ")}`, eligibility.missing);
    }
    throw new FlashServiceError("NOT_ELIGIBLE", eligibility.reason);
  }

  // ใบเดิมด้วยนิยาม LATEST (ทุกผู้ให้บริการ): FAILED ของ Flash = ลองใหม่ · NEEDS_REVIEW = ต้องคนตัดสิน · อื่นทั้งหมด = มีอยู่แล้ว
  const latest = await prisma.orderShipment.findFirst({
    where: { orderId, ...LATEST_FORWARD_SHIPMENT },
    select: { id: true, provider: true, status: true },
    orderBy: { createdAt: "desc" },
  });
  if (latest) {
    if (latest.provider === FLASH && latest.status === "FAILED") {
      return retryFlashShipment(shopId, userId, latest.id, undefined, override);
    }
    if (latest.provider === FLASH && latest.status === "NEEDS_REVIEW") throw needsReview();
    throw new FlashServiceError(
      "SHIPMENT_EXISTS",
      latest.provider === FLASH ? "คำสั่งซื้อนี้มีพัสดุ Flash ที่ยังใช้งานอยู่แล้ว" : "คำสั่งซื้อนี้มีพัสดุของผู้ให้บริการอื่นที่ยังใช้งานอยู่แล้ว",
    );
  }

  const o = override?.options;
  const parcel: ParcelSnap = {
    weight: override?.weight ?? (account.defaultWeight != null ? Number(account.defaultWeight) : null),
    width: override?.width ?? (account.defaultWidth != null ? Number(account.defaultWidth) : null),
    length: override?.length ?? (account.defaultLength != null ? Number(account.defaultLength) : null),
    height: override?.height ?? (account.defaultHeight != null ? Number(account.defaultHeight) : null),
    categoryId: override?.categoryId ?? account.defaultCategoryId,
  };
  const options: OptionsSnap = {
    onTime: o?.onTime ?? account.optOnTime,
    boxShield: o?.boxShield ?? account.optBoxShield,
    isInsured: o?.isInsured ?? account.optIsInsured,
    productValue: o?.productValue !== undefined ? o.productValue : account.optProductValue != null ? Number(account.optProductValue) : null,
    remark: override?.remark !== undefined ? override.remark : account.defaultRemark,
  };
  // 🛑 ยอด COD = ยอดออเดอร์ (resolveDefaultCodAmount) ไม่ใช่ค่าระดับร้าน — Flash ไม่มี default COD ระดับร้าน
  const codAmount = override?.codAmount ?? resolveDefaultCodAmount({ orderPaymentMethod: order.paymentMethod, orderTotal: Number(order.totalAmount) });

  const cancelledCount = await prisma.orderShipment.count({ where: { orderId, status: "CANCELLED" } });
  const outTradeNo = buildFlashOutTradeNo(orderId, cancelledCount + 1);
  const sender = senderOf(account);
  const receiver = receiverOf(order);
  // ตรวจก่อนมีแถว — ข้อมูลไม่ครบต้องไม่ทิ้ง PENDING ค้าง
  const params = buildParams({ outTradeNo, sender, receiver, parcel, codAmount, options, items: order.items });

  let shipment: { id: string };
  try {
    shipment = await prisma.orderShipment.create({
      data: {
        orderId, shopId, provider: FLASH, status: "PENDING", idempotencyKey: outTradeNo,
        courierCode: FLASH, courierName: COURIER_NAME,
        categoryId: parcel.categoryId, weight: parcel.weight, width: parcel.width, length: parcel.length, height: parcel.height,
        codAmount,
        senderSnapshot: sender as object,
        receiverSnapshot: receiver as object,
        optionsSnapshot: options as object,
        createdByUserId: userId,
      },
      select: { id: true },
    });
  } catch (e) {
    // OrderShipment_active_order_key / idempotencyKey: คำขอซ้อนสร้างไปก่อนแล้ว
    if (isP2002(e)) throw new FlashServiceError("SHIPMENT_EXISTS", "คำสั่งซื้อนี้มีพัสดุที่ยังใช้งานอยู่แล้ว");
    throw e;
  }

  // ปรับวิธีชำระของออเดอร์ให้ตรงพัสดุ "ก่อน" ยิง (เหมือน iShip)
  const paymentNotice = await syncOrderPaymentToParcel(orderId, codAmount, userId);
  const view = await dispatchFlash({
    shopId, userId, cred, shipmentId: shipment.id, orderId, outTradeNo, params, options, receiver, parcel, courierName: COURIER_NAME,
  });
  return { ...view, paymentNotice };
}

const needsReview = () =>
  new FlashServiceError("NEEDS_REVIEW", "พัสดุนี้อาจมีอยู่แล้วที่ Flash — ใช้ผูกด้วยเลขพัสดุ หรือยืนยันเปิดใหม่");

// ─── ลองใหม่ ────────────────────────────────────────────────────────────────

/** FAILED ของ Flash เท่านั้น · แถวเดิม + idempotencyKey เดิม · อ่านที่อยู่ (และผู้ส่ง) จากต้นทางใหม่ทุกครั้ง */
export async function retryFlashShipment(
  shopId: string,
  userId: string,
  shipmentId: string,
  receiverPatch?: ReceiverPatch,
  override?: FlashShipmentOverride,
): Promise<ShipmentView> {
  assertEnabled();
  const { account, cred } = await requireAccount(shopId);
  const existing = await prisma.orderShipment.findFirst({
    where: { id: shipmentId, shopId, provider: FLASH },
    select: { id: true, status: true, orderId: true, idempotencyKey: true, weight: true, width: true, length: true, height: true, categoryId: true, codAmount: true, optionsSnapshot: true },
  });
  if (!existing) throw new FlashServiceError("NOT_FOUND", "ไม่พบพัสดุนี้");
  if (existing.status === "NEEDS_REVIEW") throw needsReview();
  if (existing.status !== "FAILED") throw new FlashServiceError("INVALID_STATE", "พัสดุนี้ไม่ได้อยู่ในสถานะที่ลองใหม่ได้");

  if (receiverPatch) await applyReceiverPatch(shopId, existing.orderId, receiverPatch);
  const order = await prisma.order.findFirstOrThrow({ where: { id: existing.orderId, shopId }, select: orderSelect });

  const prev = readOptions(existing.optionsSnapshot);
  const o = override?.options;
  const options: OptionsSnap = {
    onTime: o?.onTime ?? prev.onTime,
    boxShield: o?.boxShield ?? prev.boxShield,
    isInsured: o?.isInsured ?? prev.isInsured,
    productValue: o?.productValue !== undefined ? o.productValue : prev.productValue,
    remark: override?.remark !== undefined ? override.remark : prev.remark,
  };
  // เขียนทับเฉพาะช่องที่ส่งมา — ไม่ fallback ไปค่าตั้งต้นร้าน (ใบนี้อาจเปิดด้วยค่าอื่นมาแต่แรก)
  const parcel: ParcelSnap = {
    weight: override?.weight ?? (existing.weight == null ? null : Number(existing.weight)),
    width: override?.width ?? (existing.width != null ? Number(existing.width) : null),
    length: override?.length ?? (existing.length != null ? Number(existing.length) : null),
    height: override?.height ?? (existing.height != null ? Number(existing.height) : null),
    categoryId: override?.categoryId ?? existing.categoryId,
  };
  const codAmount = override?.codAmount ?? Number(existing.codAmount);
  const sender = senderOf(account); // key ผิดที่ 1004 แก้ที่หน้าตั้งค่า — ลองใหม่ต้องใช้ค่าล่าสุด
  const receiver = receiverOf(order);
  const params = buildParams({ outTradeNo: existing.idempotencyKey, sender, receiver, parcel, codAmount, options, items: order.items });

  // conditional: กดลองใหม่ซ้อนสองครั้งมีผู้ชนะคนเดียว
  const claimed = await prisma.orderShipment.updateMany({
    where: { id: shipmentId, status: "FAILED" },
    data: {
      status: "PENDING", createdByUserId: userId, codAmount,
      weight: parcel.weight, width: parcel.width, length: parcel.length, height: parcel.height, categoryId: parcel.categoryId,
      senderSnapshot: sender as object, receiverSnapshot: receiver as object, optionsSnapshot: options as object,
    },
  });
  if (claimed.count === 0) throw new FlashServiceError("INVALID_STATE", "พัสดุนี้ไม่ได้อยู่ในสถานะที่ลองใหม่ได้");

  const paymentNotice = override?.codAmount !== undefined ? await syncOrderPaymentToParcel(existing.orderId, codAmount, userId) : undefined;
  const view = await dispatchFlash({
    shopId, userId, cred, shipmentId, orderId: existing.orderId, outTradeNo: existing.idempotencyKey, params, options, receiver, parcel, courierName: COURIER_NAME,
  });
  return paymentNotice === undefined ? view : { ...view, paymentNotice };
}

// ─── ออกจาก NEEDS_REVIEW ────────────────────────────────────────────────────

/** ทางเดียวออกจาก NEEDS_REVIEW: LINK_PNO (อัปเดตแถวเดิม) หรือ REOPEN (ยกเลิกแถวเดิม + เปิดใบใหม่รอบใหม่) */
export async function resolveReviewShipment(
  shopId: string,
  userId: string,
  shipmentId: string,
  input: FlashResolveInput,
): Promise<ShipmentView> {
  assertEnabled();
  const row = await prisma.orderShipment.findFirst({
    where: { id: shipmentId, shopId, provider: FLASH },
    select: { id: true, orderId: true, status: true },
  });
  if (!row) throw new FlashServiceError("NOT_FOUND", "ไม่พบพัสดุนี้");
  if (row.status !== "NEEDS_REVIEW") throw new FlashServiceError("INVALID_STATE", "พัสดุนี้ไม่ได้อยู่ในสถานะรอตรวจสอบ");

  if (input.action === "REOPEN") {
    // literal true เท่านั้น — truthy ('true', 1) ไม่พอ: นี่คือการยืนยันว่า "ไม่มีพัสดุเดิมที่ Flash" ซึ่งผิดแล้วเสียเงินซ้ำ
    if ((input as { confirmNoExistingParcel?: unknown }).confirmNoExistingParcel !== true) {
      throw new FlashServiceError("INVALID_INPUT", "ต้องยืนยันว่าไม่มีพัสดุเดิมที่ Flash ก่อนเปิดใหม่");
    }
    await prisma.$transaction(async (tx) => {
      const r = await tx.orderShipment.updateMany({
        where: { id: shipmentId, status: "NEEDS_REVIEW" },
        data: { status: "CANCELLED", cancelledAt: new Date(), cancelledByUserId: userId, lastErrorCode: "REVIEW_REOPENED" },
      });
      if (r.count === 0) throw new FlashServiceError("INVALID_STATE", "พัสดุนี้ไม่ได้อยู่ในสถานะรอตรวจสอบ");
      await recordOrderEvent(tx, {
        orderId: row.orderId, type: "SHIPMENT_CANCELLED", actorUserId: userId,
        meta: { shipmentId, courierName: COURIER_NAME, provider: FLASH, reason: "FLASH_REVIEW_REOPEN" },
      });
    });
    // ใบใหม่ได้ outTradeNo รอบ cancelledCount+1 (ใบเดิมเป็น CANCELLED แล้ว)
    return createFlashShipment(shopId, userId, row.orderId, input.override);
  }

  if (!PNO_RE.test(input.pno)) throw new FlashServiceError("INVALID_INPUT", "เลขพัสดุไม่ถูกต้อง");
  const { cred } = await requireAccount(shopId);
  // routes ตอบ code=1 = เลขนี้เป็นของบัญชีนี้ (1019/1006 โยน FlashError ออกไปให้ route แปล)
  const routes = normalizeRoutes(await withFlashGuard(shopId, () => flash.routes(cred, input.pno)));
  const taken = await prisma.orderShipment.findFirst({ where: { trackingNo: input.pno, NOT: { id: shipmentId } }, select: { id: true } });
  if (taken) throw new FlashServiceError("PNO_TAKEN", "เลขพัสดุนี้ถูกผูกกับคำสั่งซื้ออื่นไปแล้ว");

  let ledgerId: string | null = null;
  try {
    await prisma.$transaction(async (tx) => {
      const r = await tx.orderShipment.updateMany({
        where: { id: shipmentId, status: "NEEDS_REVIEW" },
        data: { status: "CREATED", trackingNo: input.pno, lastErrorCode: null, lastErrorMessage: null, isDryRun: false },
      });
      if (r.count === 0) throw new FlashServiceError("INVALID_STATE", "พัสดุนี้ไม่ได้อยู่ในสถานะรอตรวจสอบ");
      await recordOrderEvent(tx, {
        orderId: row.orderId, type: "SHIPMENT_CREATED", actorUserId: userId,
        meta: { shipmentId, courierName: COURIER_NAME, provider: FLASH },
      });
      ledgerId = await reserveTrackingNotice(tx, row.orderId, input.pno);
    });
  } catch (e) {
    if (isP2002(e)) throw new FlashServiceError("PNO_TAKEN", "เลขพัสดุนี้ถูกผูกกับคำสั่งซื้ออื่นไปแล้ว");
    throw e;
  }
  dispatchAutoNotifyAfterCommit(ledgerId);
  await stampFromRoutes(shipmentId, input.pno, routes);
  return toShipmentView(await prisma.orderShipment.findUniqueOrThrow({ where: { id: shipmentId }, select: SHIPMENT_SELECT }));
}

/** ประทับสถานะปัจจุบันจาก routes ผ่านตัวกลางเดียวกับ webhook/poll — ล้มไม่ทำให้การผูกล้ม */
async function stampFromRoutes(shipmentId: string, pno: string, routes: ReturnType<typeof normalizeRoutes>): Promise<void> {
  if (!routes) return;
  try {
    const full = await prisma.orderShipment.findUniqueOrThrow({ where: { id: shipmentId } });
    await applyFlashRoutes(full, { ...routes, pno: routes.pno ?? pno }, "TRACES", { pno });
  } catch (e) {
    console.error("[flash-link] ประทับสถานะไม่สำเร็จ", e instanceof Error ? e.name : "error");
  }
}

// ─── ดูตัวอย่าง / ผูก pno ───────────────────────────────────────────────────

export interface FlashPnoPreview {
  pno: string;
  state: number | null;
  stateText: string;
  carrierStatus: string;
  carrierStatusText: string;
  routes: { at: string | null; message: string | null }[];
}

export async function previewFlashPno(shopId: string, pno: string): Promise<FlashPnoPreview> {
  assertEnabled();
  if (!PNO_RE.test(pno)) throw new FlashServiceError("INVALID_INPUT", "เลขพัสดุไม่ถูกต้อง");
  const { cred } = await requireAccount(shopId);
  // 1019/1006 โยนต่อ — ข้อความ "เลขนี้ไม่ใช่ของบัญชี Flash ของร้านนี้" อยู่ใน FlashError.userMessage
  const r = normalizeRoutes(await withFlashGuard(shopId, () => flash.routes(cred, pno)));
  // ยังไม่มี route = ยังไม่ถูกรับ (order_success) ตาม TFR-FLASH-017
  const carrierStatus = r && r.state != null ? (mapFlashState(r.state) ?? "") : "order_success";
  const text = carrierStatus ? describeCarrierStatus(carrierStatus).text : "อยู่ระหว่างดำเนินการ";
  const last = [...(r?.routes ?? [])].sort((a, b) => (b.routedAt?.getTime() ?? 0) - (a.routedAt?.getTime() ?? 0)).slice(0, 3);
  return {
    pno,
    state: r?.state ?? null,
    stateText: text,
    carrierStatus: carrierStatus || "unknown",
    carrierStatusText: text,
    routes: last.map((x) => ({ at: x.routedAt?.toISOString() ?? null, message: x.message })),
  };
}

/**
 * ผูกพัสดุที่มีอยู่แล้ว — ไม่ยิง create (ไม่เกิดค่าใช้จ่าย)
 * 🛑 ไม่เรียก syncOrderPaymentToParcel: Flash ไม่คืนยอด COD ของใบที่ผูก เดายอดไปแก้วิธีชำระของออเดอร์ไม่ได้
 * 🛑 ไม่ใส่ estimatedPrice (null ไม่ใช่ 0) — ไม่มีราคาที่รู้จริง
 */
export async function linkFlashShipment(
  shopId: string,
  userId: string,
  orderId: string,
  pno: string,
): Promise<ShipmentView> {
  assertEnabled();
  if (!PNO_RE.test(pno)) throw new FlashServiceError("INVALID_INPUT", "เลขพัสดุไม่ถูกต้อง");
  const { cred } = await requireAccount(shopId);
  const order = await prisma.order.findFirst({
    where: { id: orderId, shopId },
    select: { fulfillmentMode: true, buyerName: true, buyerContact: true, shippingAddress: true },
  });
  if (!order) throw new FlashServiceError("NOT_FOUND", "ไม่พบคำสั่งซื้อนี้");
  if (order.fulfillmentMode !== "SHIPPED") throw new FlashServiceError("NOT_ELIGIBLE", "คำสั่งซื้อนี้ไม่ต้องจัดส่ง");

  const active = await prisma.orderShipment.findFirst({ where: { orderId, ...LATEST_FORWARD_SHIPMENT }, select: { id: true } });
  if (active) throw new FlashServiceError("SHIPMENT_EXISTS", "คำสั่งซื้อนี้มีพัสดุที่ยังใช้งานอยู่แล้ว");
  // พิสูจน์ว่า pno เป็นของบัญชีนี้ก่อน — ไม่งั้น PNO_TAKEN เป็น oracle บอกว่าเลขของคนอื่นมีในระบบ
  const routes = normalizeRoutes(await withFlashGuard(shopId, () => flash.routes(cred, pno)));
  const taken = await prisma.orderShipment.findFirst({ where: { trackingNo: pno }, select: { orderId: true } });
  if (taken) {
    throw new FlashServiceError("PNO_TAKEN", taken.orderId === orderId ? "พัสดุใบนี้ผูกกับคำสั่งซื้อนี้อยู่แล้ว" : "พัสดุใบนี้ถูกผูกกับคำสั่งซื้ออื่นไปแล้ว");
  }
  const cancelledCount = await prisma.orderShipment.count({ where: { orderId, status: "CANCELLED" } });

  let ledgerId: string | null = null;
  let created: { id: string };
  try {
    created = await prisma.$transaction(async (tx) => {
      const r = await tx.orderShipment.create({
        data: {
          orderId, shopId, provider: FLASH, status: "CREATED", source: "LINKED", linkedAt: new Date(),
          // คนละรูปกับ outTradeNo ของเรา — ใบนี้เราไม่เคยยิง create
          idempotencyKey: `link:${pno}:${cancelledCount + 1}`,
          trackingNo: pno, courierCode: FLASH, courierName: COURIER_NAME,
          codAmount: 0, createdByUserId: userId, receiverSnapshot: receiverOf({ ...order, items: [] }) as object,
        },
        select: { id: true },
      });
      await recordOrderEvent(tx, {
        orderId, type: "SHIPMENT_LINKED", actorUserId: userId,
        meta: { shipmentId: r.id, courierName: COURIER_NAME, provider: FLASH },
      });
      ledgerId = await reserveTrackingNotice(tx, orderId, pno);
      return r;
    });
  } catch (e) {
    if (isP2002(e)) {
      const target = String((e.meta as { target?: unknown } | undefined)?.target ?? "");
      throw new FlashServiceError(
        /trackingNo/i.test(target) ? "PNO_TAKEN" : "SHIPMENT_EXISTS",
        /trackingNo/i.test(target) ? "พัสดุใบนี้ถูกผูกกับคำสั่งซื้ออื่นไปแล้ว" : "คำสั่งซื้อนี้มีพัสดุที่ยังใช้งานอยู่แล้ว",
      );
    }
    throw e;
  }
  dispatchAutoNotifyAfterCommit(ledgerId);
  await stampFromRoutes(created.id, pno, routes);
  return toShipmentView(await prisma.orderShipment.findUniqueOrThrow({ where: { id: created.id }, select: SHIPMENT_SELECT }));
}
