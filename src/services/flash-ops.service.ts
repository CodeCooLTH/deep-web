// feature 00084 T6b — ยกเลิก / ใบปะหน้า / traces / เลิกผูก ของพัสดุ Flash (TFR-FLASH-013/014, API §4.13/4.15-4.17)
// ทุก query ผูก shopId + provider FLASH — id ของ ISHIP ต้องเป็น NOT_FOUND
import { prisma } from "@/lib/prisma";
import * as client from "@/lib/flash/client";
import { FlashError, FlashServiceError } from "@/lib/flash/errors";
import { isFlashTrackingSettled, normalizeRoutes } from "@/lib/flash/status";
import { FLASH, loadFlashAccount, markFlashTokenInvalid, type LoadedFlashAccount } from "@/services/flash-account";
import { applyFlashRoutes, type FlashShipmentRow } from "@/services/flash-status.service";
import { FLASH_SHIPMENT_SELECT, toFlashShipmentView } from "@/services/flash.service";
import { recordOrderEvent } from "@/services/order-event.service";
import type { ShipmentViewJson } from "@/lib/iship/context";

const notFound = () => new FlashServiceError("NOT_FOUND", "ไม่พบพัสดุนี้");

async function requireAccount(shopId: string): Promise<LoadedFlashAccount> {
  const loaded = await loadFlashAccount(shopId);
  if (!loaded) throw new FlashServiceError("NOT_CONNECTED", "ยังไม่ได้เชื่อมต่อ Flash — เชื่อมต่อที่หน้าตั้งค่าก่อน");
  return loaded;
}

/** 1001/1002 ระหว่างใช้งาน → mark TOKEN_INVALID แล้วโยนต่อ (timeout/อื่น ๆ ไม่แตะสถานะบัญชี) */
async function guard<T>(shopId: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof FlashError && e.invalidatesConnection) await markFlashTokenInvalid(shopId, e.code);
    throw e;
  }
}

// ─── ยกเลิก ─────────────────────────────────────────────────────────────────

export async function cancelFlashShipment(shopId: string, userId: string, shipmentId: string): Promise<ShipmentViewJson> {
  const row = await prisma.orderShipment.findFirst({
    where: { id: shipmentId, shopId, provider: FLASH },
    select: { id: true, status: true, source: true, trackingNo: true },
  });
  if (!row) throw notFound();
  if (row.status === "CANCELLED") throw new FlashServiceError("INVALID_STATE", "พัสดุนี้ถูกยกเลิกไปแล้ว");
  if (row.status === "NEEDS_REVIEW") throw new FlashServiceError("NEEDS_REVIEW", "พัสดุนี้รอตรวจสอบ — ยืนยันที่การ์ดตรวจสอบก่อน");
  if (row.source !== "CREATED") {
    throw new FlashServiceError("INVALID_STATE", "พัสดุใบนี้ผูกเลขจาก Flash — ใช้ปุ่มเลิกผูก ไม่ใช่ยกเลิก");
  }

  // FAILED ไม่มี pno = Flash ไม่เคยรับ ไม่มีอะไรให้ยกเลิกที่นั่น
  if (row.trackingNo) {
    const { cred } = await requireAccount(shopId);
    // 1015 (ขนส่งรับของแล้ว) โยนต่อเป็น FlashError NOT_CANCELLABLE — สถานะคงเดิม
    await guard(shopId, () => client.cancelOrder(cred, row.trackingNo!));
  }

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.orderShipment.update({
      where: { id: row.id },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelledByUserId: userId },
      select: FLASH_SHIPMENT_SELECT,
    });
    await recordOrderEvent(tx, {
      orderId: u.orderId,
      type: "SHIPMENT_CANCELLED",
      actorUserId: userId,
      meta: { shipmentId: row.id, courierName: u.courierName ?? undefined },
    });
    return u;
  });
  return toFlashShipmentView(updated);
}

// ─── ใบปะหน้า ───────────────────────────────────────────────────────────────

export async function getFlashLabelPdf(shopId: string, shipmentId: string): Promise<Buffer> {
  const row = await prisma.orderShipment.findFirst({
    where: { id: shipmentId, shopId, provider: FLASH },
    select: { id: true, status: true, trackingNo: true, isDryRun: true },
  });
  if (!row) throw notFound();
  if (row.status !== "CREATED" || !row.trackingNo || row.isDryRun) {
    throw new FlashServiceError("INVALID_STATE", "พัสดุใบนี้ยังพิมพ์ใบปะหน้าไม่ได้ (ต้องเป็นใบที่เปิดสำเร็จและมีเลขพัสดุจริง)");
  }
  const { cred, account } = await requireAccount(shopId);
  const size = account.labelSize === "SMALL" ? "SMALL" : "BIG";
  // client ตรวจ %PDF แล้ว — ไม่ใช่ PDF จะโยน FlashError ไม่คืนไฟล์เสีย
  const pdf = await guard(shopId, () => client.labelPdf(cred, row.trackingNo!, size));
  await prisma.orderShipment.update({
    where: { id: row.id },
    data: { labelPrintedAt: new Date(), labelPrintCount: { increment: 1 } },
  });
  return pdf;
}

// ─── traces ─────────────────────────────────────────────────────────────────

export type FlashTraceResult = {
  events: Awaited<ReturnType<typeof prisma.shipmentEvent.findMany>>;
  carrier: { status: string; carrierStatus: string | null; carrierStatusText: string | null; carrierStatusAt: Date | null };
};

const TRACE_SELECT = {
  id: true, orderId: true, shopId: true, trackingNo: true, returnedPno: true, status: true,
  carrierStatus: true, carrierStatusAt: true, carrierPrice: true, codFee: true, actualWeight: true,
  isOverWeight: true, isOverSize: true, weight: true, width: true, length: true, height: true,
  carrierStatusText: true,
} as const;

const storedEvents = (shipmentId: string) =>
  prisma.shipmentEvent.findMany({
    where: { shipmentId, source: { not: "WEBHOOK_RAW" } }, // raw = หลักฐานภายใน ไม่ใช่ไทม์ไลน์
    orderBy: { occurredAt: "asc" },
  });

const carrierOf = (r: { status: string; carrierStatus: string | null; carrierStatusText: string | null; carrierStatusAt: Date | null }) => ({
  status: r.status, carrierStatus: r.carrierStatus, carrierStatusText: r.carrierStatusText, carrierStatusAt: r.carrierStatusAt,
});

export async function getFlashTraces(shopId: string, shipmentId: string): Promise<FlashTraceResult> {
  const row = await prisma.orderShipment.findFirst({
    where: { id: shipmentId, shopId, provider: FLASH },
    select: TRACE_SELECT,
  });
  if (!row) throw notFound();
  if (!row.trackingNo) return { events: [], carrier: carrierOf(row) };

  // จบเส้นทางแล้ว + มีเหตุการณ์เก็บไว้ = ถามซ้ำได้คำตอบเดิม ไม่ต้องยิง Flash (ว่างต้องยิงครั้งแรกให้)
  const stored = await storedEvents(row.id);
  if (isFlashTrackingSettled(row.carrierStatus) && stored.length > 0) return { events: stored, carrier: carrierOf(row) };

  const loaded = await loadFlashAccount(shopId);
  if (!loaded) {
    if (stored.length > 0) return { events: stored, carrier: carrierOf(row) };
    throw new FlashServiceError("NOT_CONNECTED", "ยังไม่ได้เชื่อมต่อ Flash — เชื่อมต่อที่หน้าตั้งค่าก่อน");
  }

  try {
    const routes = normalizeRoutes(await guard(shopId, () => client.routes(loaded.cred, row.trackingNo!)));
    if (routes) await applyFlashRoutes(row as FlashShipmentRow, routes, "TRACES");
  } catch (e) {
    // ดึงไม่ได้ (ที่ไม่ใช่ key ผิด) และมีของเก็บ = คืนของเก็บตามเดิม ห้ามคืนว่างไปทับของที่ถูกอยู่แล้ว
    if (e instanceof FlashError && !e.invalidatesConnection && stored.length > 0) return { events: stored, carrier: carrierOf(row) };
    throw e;
  }

  const [events, fresh] = await Promise.all([
    storedEvents(row.id),
    prisma.orderShipment.findUnique({ where: { id: row.id }, select: TRACE_SELECT }),
  ]);
  return { events, carrier: carrierOf(fresh ?? row) };
}

// ─── เลิกผูก ────────────────────────────────────────────────────────────────

export async function unlinkFlashShipment(shopId: string, shipmentId: string): Promise<void> {
  const row = await prisma.orderShipment.findFirst({
    where: { id: shipmentId, shopId, provider: FLASH },
    select: { id: true, source: true },
  });
  if (!row) throw notFound();
  if (row.source !== "LINKED") {
    throw new FlashServiceError("INVALID_STATE", "พัสดุใบนี้เปิดผ่าน Deep — ต้องใช้ปุ่มยกเลิกพัสดุ ไม่ใช่เลิกผูก");
  }
  await prisma.orderShipment.delete({ where: { id: row.id } }); // ไม่ยกเลิกพัสดุจริงที่ Flash
}
