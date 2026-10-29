import "server-only";
// feature 00084 T7a — ฝั่งรับสถานะ Flash: webhook handler · applyFlashRoutes (ตัวเดียวของ webhook/poll/traces) ·
// ต้นทุน/น้ำหนัก · POD · รอบ poll (TFR-FLASH-015 ส่วน courier, 016..020)
//
// 🛑 เส้นทางนี้ไม่แตะสถานะออเดอร์ และไม่แตะเงิน COD เด็ดขาด (BR-FLASH-40/44): เขียนได้เฉพาะแถวพัสดุ/ไทม์ไลน์/หลักฐาน
//    การเลื่อนสถานะออเดอร์ตามพัสดุและการยืนยันรับเงิน COD เป็นของเส้นทาง iShip เท่านั้น — ไฟล์นี้ไม่ import ตัวใดของมัน
//    (เทสสแกนซอร์สของ src/services/flash*.ts + src/lib/flash/*.ts บังคับ)

import { createHash } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import * as client from "@/lib/flash/client";
import { FlashError, redactFlash } from "@/lib/flash/errors";
import { FLASH_POLL, FLASH_RETURN_DELIVERED_MEANS_RETURNED, FLASH_VERIFY_STATES } from "@/lib/flash/constants";
import {
  FLASH_PICKUP_STATE, describeMarker, isFlashTrackingSettled, mapFlashState, normalizeBatchRoutes,
  normalizeRoutes, parseFlashTime, readFlashPrice, readFlashWeight, type FlashRoutes,
} from "@/lib/flash/status";
import { inferFlashWebhookKind, type FlashWebhookKind, type ParsedWebhook } from "@/lib/flash/webhook-parse";
import { describeCarrierStatus, isProblemCarrierStatus, returnLegStampOf } from "@/lib/iship/status";
import { ACTIVE_FORWARD_SHIPMENT, FORWARD_SHIPMENT } from "@/lib/shipment-direction";
import { loadFlashAccount, markFlashTokenInvalid, type LoadedFlashAccount } from "@/services/flash-account";

// ─── ชนิดและค่าคงที่ ────────────────────────────────────────────────────────

/** ผลของ handleFlashWebhook — route แปลงเป็น HTTP: RETRY ⇒ 503 {"errorCode":"0","state":"retry"} · ที่เหลือทั้งหมด ⇒ 200 success */
export type FlashWebhookOutcome =
  | "APPLIED" // ประมวลผลแล้ว (รวมส่งซ้ำ)
  | "IGNORED_NO_DATA" // data ไม่ใช่ object
  | "IGNORED_VERTICAL" // ร้านไม่ใช่ ONLINE_SALES
  | "IGNORED_UNKNOWN_KIND" // จำแนกชนิดไม่ได้ ไม่เขียนอะไร
  | "IGNORED_NO_SHIPMENT" // pno ไม่ใช่พัสดุของร้านนี้ (หรือ Flash ตอบ 1006/1019) — ไม่เก็บ payload
  | "TOKEN_INVALID" // 1001/1002 ตอนยืนยัน → mark แล้ว หยุดให้ Flash ยิงซ้ำ
  | "RETRY"; // ล้มชั่วคราวของเรา → 503

export interface FlashWebhookResult {
  outcome: FlashWebhookOutcome;
  /** งานหนัก (ดึง POD) ให้ route ส่งเข้า after() — ไม่มี = ไม่มีงานต่อ */
  after?: () => Promise<void>;
}

export type FlashEventSource = "WEBHOOK" | "POLL" | "TRACES";

const SETTLED_CODES = ["delivered", "close", "cancelled", "return_success"]; // เทสบังคับให้ตรงกับ isFlashTrackingSettled
const POD_REASON = "flash_pod";

const SHIP_SELECT = {
  id: true, orderId: true, shopId: true, trackingNo: true, returnedPno: true, status: true,
  carrierStatus: true, carrierStatusAt: true, carrierPrice: true, codFee: true, actualWeight: true,
  isOverWeight: true, isOverSize: true, weight: true, width: true, length: true, height: true,
} satisfies Prisma.OrderShipmentSelect;
export type FlashShipmentRow = Prisma.OrderShipmentGetPayload<{ select: typeof SHIP_SELECT }>;

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" || typeof v === "number") && String(v).trim() !== "" ? String(v).trim() : null;
const stateNum = (v: unknown): number | null => { const s = str(v); return s !== null && /^\d{1,2}$/.test(s) ? Number(s) : null; };
/** ข้อความจาก webhook body ที่เก็บลงฐาน — ตัดความยาว (M3: body ไม่น่าเชื่อ) */
const str200 = (v: unknown): string | null => str(v)?.slice(0, 200) ?? null;
/** เวลาเหตุการณ์จาก body ห้ามอยู่ในอนาคตเกิน 5 นาที — ไม่งั้นเวลาปลอมล็อกสถานะ (ทุกเหตุการณ์จริงจะถูกมองว่า "เก่ากว่า") */
const clampFuture = (d: Date | null): Date | null => {
  const cap = Date.now() + 5 * 60_000;
  return d && d.getTime() > cap ? new Date(cap) : d;
};
const RAW_PAYLOAD_MAX_BYTES = 8 * 1024;
const RAW_ROWS_PER_SHIPMENT_MAX = 200;
const sha = (s: string, n: number) => createHash("sha256").update(s).digest("hex").slice(0, n);
const isVerifyState = (n: number | null) => n !== null && FLASH_VERIFY_STATES.includes(n);
const errText = (e: unknown) => redactFlash(e instanceof FlashError ? `${e.code}${e.upstreamMessage ? `: ${e.upstreamMessage}` : ""}` : e instanceof Error ? e.message : String(e)).slice(0, 300);

/** 1001/1002 ระหว่างใช้งาน → mark TOKEN_INVALID (timeout/อื่น ๆ ห้าม) แล้วบอกผู้เรียกว่า mark แล้ว */
async function markIfInvalid(shopId: string, e: unknown): Promise<boolean> {
  if (e instanceof FlashError && e.invalidatesConnection) {
    await markFlashTokenInvalid(shopId, e.code);
    return true;
  }
  return false;
}
const isParcelGone = (e: unknown) => e instanceof FlashError && (e.code === "PARCEL_NOT_FOUND" || e.code === "NOT_MERCHANT_PARCEL");

async function recordEvent(shipmentId: string, e: {
  status: string; statusDesc?: string | null; occurredAt: Date; source: string; dedupeKey: string; payload?: object;
}) {
  await prisma.shipmentEvent.upsert({
    where: { shipmentId_dedupeKey: { shipmentId, dedupeKey: e.dedupeKey } },
    create: {
      shipmentId, status: e.status, statusText: describeCarrierStatus(e.status).text, statusDesc: e.statusDesc ?? null,
      occurredAt: e.occurredAt, source: e.source, dedupeKey: e.dedupeKey, payload: e.payload,
    },
    update: {}, // ยิงซ้ำ = ไม่ทำอะไร
  });
}

// ─── applyFlashRoutes: จุดเดียวที่เขียน carrierStatus/milestone ──────────────

/**
 * ใช้คำตอบ routes (ที่ยืนยันกับ Flash แล้ว) เขียนไทม์ไลน์ + carrierStatus + milestone แบบ write-once
 * - `opts.untrusted` = ข้อมูลมาจาก body webhook ตรง ๆ: state ที่กระทบ milestone (4..9) จะไม่ถูกใช้เลย (BR-FLASH-73)
 * - เลขที่เป็น `returnedPno`: ลงไทม์ไลน์ด้วย status `return` ไม่แตะ carrierStatus ของใบขาไป (BR-FLASH-43)
 */
export async function applyFlashRoutes(
  shipment: FlashShipmentRow,
  routes: FlashRoutes,
  source: FlashEventSource,
  opts?: { pno?: string | null; untrusted?: boolean; markerCategory?: unknown },
): Promise<{ changed: boolean; code: string | null; deliveredConfirmed: boolean }> {
  const pno = opts?.pno ?? routes.pno ?? shipment.trackingNo;
  const isReturnLeg = !!pno && !!shipment.returnedPno && pno === shipment.returnedPno && pno !== shipment.trackingNo;
  const none = { changed: false, code: null, deliveredConfirmed: false };

  const mapped = opts?.untrusted && isVerifyState(routes.state) ? null : mapFlashState(routes.state);
  // ขาตีกลับ: ทุกอย่างบนไทม์ไลน์คือ `return` (ค่าคงที่ P0-8 เปิดเมื่อพิสูจน์ว่า state 5 ของเลขใหม่ = ถึงร้านแล้ว)
  const returnDone = FLASH_RETURN_DELIVERED_MEANS_RETURNED && mapped === "delivered";
  const code = isReturnLeg ? (mapped ? (returnDone ? "return_success" : "return") : null) : mapped;

  const marker = describeMarker(opts?.markerCategory);
  const times = routes.routes.map((r) => r.routedAt).filter((t): t is Date => !!t);
  const latestRouted = times.length ? new Date(Math.max(...times.map((t) => t.getTime()))) : null;
  // เวลาเหตุการณ์ = จาก Flash เท่านั้น — ไม่มี = ไม่เดา ไม่ประทับ milestone (BR-FLASH-42)
  const at = routes.stateChangeAt ?? latestRouted;

  // ไทม์ไลน์: ทุก route ที่มีเวลา (route สุดท้ายที่ไม่มี state ของตัวเองรับสถานะรวม)
  let wroteCode = false;
  for (const r of routes.routes) {
    if (!r.routedAt) continue;
    const own = mapFlashState(r.state);
    const isLatest = latestRouted !== null && r.routedAt.getTime() === latestRouted.getTime();
    const status = isReturnLeg ? "return" : (opts?.untrusted && isVerifyState(r.state) ? null : own) ?? (isLatest && code ? code : "progress");
    await recordEvent(shipment.id, {
      status, statusDesc: r.message ?? (isLatest ? marker : null), occurredAt: r.routedAt, source,
      dedupeKey: `${r.action ?? "route"}:${r.routedAt.getTime()}`,
    });
    if (status === code) wroteCode = true;
  }
  // routes ยังไม่มีแถวของ state ใหม่ (UAT 2026-10-29: state 6/8 มาก่อน route ของมัน) → ลงแถวสถานะเอง ไม่งั้นไทม์ไลน์ไม่มีบรรทัดปัญหา
  if (code && !wroteCode) {
    await recordEvent(shipment.id, {
      status: code, statusDesc: marker, occurredAt: at ?? new Date(), source,
      dedupeKey: `${routes.state}:${at ? at.getTime() : `h${sha(`${pno}:${routes.state}`, 12)}`}`,
    });
  }
  if (!code) return none;

  let changed = false;
  if (!isReturnLeg) {
    // เหตุการณ์เก่าห้ามทับใหม่: เขียนเมื่อเวลา ≥ carrierStatusAt เดิม (ไม่มีเวลา = เขียนได้เฉพาะแถวที่ยังไม่เคยมีสถานะ)
    const r = await prisma.orderShipment.updateMany({
      where: { id: shipment.id, ...(at ? { OR: [{ carrierStatusAt: null }, { carrierStatusAt: { lte: at } }] } : { carrierStatusAt: null }) },
      data: { carrierStatus: code, carrierStatusText: describeCarrierStatus(code).text, ...(at ? { carrierStatusAt: at } : {}) },
    });
    changed = r.count > 0 && shipment.carrierStatus !== code;
    if (code === "cancelled" && r.count > 0) {
      await prisma.orderShipment.updateMany({
        where: { id: shipment.id, status: "CREATED", direction: FORWARD_SHIPMENT },
        data: { status: "CANCELLED", cancelledAt: at ?? new Date() },
      });
    }
  }

  if (at) await stampMilestones(shipment.id, code, at, isReturnLeg);

  // state 7: เลขใหม่ที่ Flash ออกให้ตอนตีกลับ — เก็บครั้งเดียว ชน unique = ข้าม
  const rp = routes.returnedPno;
  if (!isReturnLeg && mapped === "return" && rp && rp !== pno && rp !== shipment.trackingNo && !shipment.returnedPno) {
    try {
      await prisma.orderShipment.updateMany({ where: { id: shipment.id, returnedPno: null }, data: { returnedPno: rp } });
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
      console.warn("[flash-status] returnedPno ชนพัสดุอื่น ข้าม", { shipmentId: shipment.id });
    }
  }
  return { changed, code, deliveredConfirmed: !isReturnLeg && code === "delivered" && !opts?.untrusted };
}

/** write-once ทุกตัว: updateMany + WHERE col IS NULL (เหตุการณ์ซ้ำ/ลองส่งใหม่ห้ามขยับวันที่) */
async function stampMilestones(id: string, code: string, at: Date, isReturnLeg: boolean) {
  if (isReturnLeg) {
    if (code === "return_success") await prisma.orderShipment.updateMany({ where: { id, returnedAt: null }, data: { returnedAt: at } });
    return;
  }
  if (isProblemCarrierStatus(code)) await prisma.orderShipment.updateMany({ where: { id, problemAt: null }, data: { problemAt: at } });
  if (code === "delivered") await prisma.orderShipment.updateMany({ where: { id, deliveredAt: null }, data: { deliveredAt: at } });
  // เขียนสองกิ่งแยก (Prisma ต้องการชื่อคอลัมน์ literal)
  const col = returnLegStampOf(code);
  if (col === "returnStartedAt") await prisma.orderShipment.updateMany({ where: { id, returnStartedAt: null }, data: { returnStartedAt: at } });
  else if (col === "returnedAt") await prisma.orderShipment.updateMany({ where: { id, returnedAt: null }, data: { returnedAt: at } });
}

// ─── stampFlashMilestones (export ตาม SDS §3.1) ─────────────────────────────
export const stampFlashMilestones = stampMilestones;

// ─── ต้นทุน/น้ำหนัก (TFR-FLASH-019) ─────────────────────────────────────────

/** เขียนเฉพาะค่าที่เปลี่ยนจริง; null/ค่าไม่ผ่านด่าน ไม่ทับของเดิม; ไม่มีเส้นเติมย้อนหลังด้วย estimate (BR-FLASH-53) */
export async function captureFlashCharges(shipment: FlashShipmentRow, kind: "price" | "weight", data: unknown): Promise<boolean> {
  const upd: Prisma.OrderShipmentUpdateInput = {};
  const differs = (n: number | null, cur: Prisma.Decimal | null) => n !== null && (cur === null || Number(cur) !== n);
  if (kind === "price") {
    const p = readFlashPrice(data);
    if (p && differs(p.carrierPrice, shipment.carrierPrice)) upd.carrierPrice = p.carrierPrice!;
    if (p && differs(p.codFee, shipment.codFee)) upd.codFee = p.codFee!;
  } else {
    const w = readFlashWeight(data, {
      weightKg: shipment.weight === null ? null : Number(shipment.weight),
      width: shipment.width != null ? Number(shipment.width) : null, length: shipment.length != null ? Number(shipment.length) : null, height: shipment.height != null ? Number(shipment.height) : null,
    });
    if (w) {
      if (differs(w.actualWeightKg, shipment.actualWeight)) upd.actualWeight = w.actualWeightKg;
      if (w.isOverWeight !== shipment.isOverWeight) upd.isOverWeight = w.isOverWeight;
      if (w.isOverSize !== shipment.isOverSize) upd.isOverSize = w.isOverSize;
    }
  }
  if (Object.keys(upd).length === 0) return false;
  await prisma.orderShipment.update({ where: { id: shipment.id }, data: upd });
  return true;
}

// ─── POD (TFR-FLASH-020) ────────────────────────────────────────────────────

/** L2: URL ที่จะไปอยู่ใน <img src>/<a href> ต้องเป็น https เท่านั้น (กัน javascript:/data:/http) */
const httpsOnly = (v: unknown): string | null => {
  const u = str(v);
  return u && /^https:\/\//i.test(u) ? u : null;
};

export function shapePod(data: unknown, stateDate: unknown): Prisma.InputJsonObject | null {
  if (!isRec(data)) return null;
  // Flash ส่ง `photo` เป็น {photo1,photo2} หรือสตริง JSON ของก้อนเดียวกัน (UAT 2026-10-29 webhook state 5)
  let photoObj: unknown = data.photo;
  if (typeof photoObj === "string") { try { photoObj = JSON.parse(photoObj); } catch { photoObj = null; } }
  const po = isRec(photoObj) ? photoObj : {};
  const photoSrc = [data.photos, data.images, data.deliveredPhotos].find(Array.isArray) as unknown[] | undefined;
  const photos = (photoSrc ?? [po.photo1, po.photo2, data.photo1, data.photo2, data.podPhoto]).map(httpsOnly).filter((x): x is string => !!x).slice(0, 2);
  // ไม่มีค่า = null (Number(null) = 0 ทำให้พิกัด 0,0 ปลอม)
  const num = (v: unknown) => { const t = str(v); return t !== null && Number.isFinite(Number(t)) ? Number(t) : null; };
  return {
    kind: "FLASH_POD", signer: str(data.signer) ?? str(data.signerName), signerTypeText: str(data.signerTypeText) ?? str(data.signerType),
    podUrl: httpsOnly(data.pod) ?? httpsOnly(data.podUrl) ?? httpsOnly(data.signaturePicUrl) ?? httpsOnly(data.eSignature), photos,
    lat: num(data.ticketDeliveryStaffLat ?? data.lat ?? data.latitude), lng: num(data.ticketDeliveryStaffLng ?? data.lng ?? data.longitude),
    stateDate: str(data.stateDate) ?? str(stateDate),
  };
}

/** ดึงหลักฐานการส่ง 1 ครั้งต่อใบ; ล้ม = แถว error (ไม่เงียบ) แล้วรอบ poll ลองใหม่ */
export async function captureFlashPod(
  loaded: LoadedFlashAccount,
  ship: Pick<FlashShipmentRow, "id" | "orderId" | "shopId" | "trackingNo">,
): Promise<"CAPTURED" | "EXISTS" | "FAILED"> {
  if (!ship.trackingNo) return "FAILED";
  const where = { shipmentId_reason: { shipmentId: ship.id, reason: POD_REASON } };
  const existing = await prisma.shipmentEvidence.findUnique({ where, select: { id: true, error: true } });
  if (existing && !existing.error) return "EXISTS";

  let parcel: Prisma.InputJsonObject | null = null;
  let error: string | null = null;
  try {
    parcel = shapePod(await client.deliveredInfo(loaded.cred, ship.trackingNo), null);
    if (!parcel) error = "รูปแบบคำตอบหลักฐานการส่งไม่ถูกต้อง";
  } catch (e) {
    await markIfInvalid(ship.shopId, e);
    error = errText(e);
  }
  try {
    if (existing) {
      await prisma.shipmentEvidence.update({ where: { id: existing.id }, data: { error, capturedAt: new Date(), ...(parcel ? { parcel } : {}) } });
    } else {
      await prisma.shipmentEvidence.create({ data: { shipmentId: ship.id, orderId: ship.orderId, reason: POD_REASON, traceCount: 0, parcel: parcel ?? undefined, error } });
    }
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return "EXISTS"; // มีคนเก็บพร้อมกัน
    throw e;
  }
  return error ? "FAILED" : "CAPTURED";
}

// ─── webhook (TFR-FLASH-016) ────────────────────────────────────────────────

/** route ผ่านด่าน secret + mchId + sign แล้วเท่านั้นจึงเรียก — ที่นี่ไม่ตรวจลายเซ็นซ้ำ */
export async function handleFlashWebhook(
  loaded: LoadedFlashAccount,
  parsed: ParsedWebhook,
  opts?: { kindHint?: string | null },
): Promise<FlashWebhookResult> {
  const shopId = loaded.account.shopId;
  const data = parsed.data;
  if (!data) return { outcome: "IGNORED_NO_DATA" };
  try {
    const shop = await prisma.shop.findUnique({ where: { id: shopId }, select: { vertical: true } });
    if (shop?.vertical !== "ONLINE_SALES") return { outcome: "IGNORED_VERTICAL" };

    const kind = inferFlashWebhookKind(data, opts?.kindHint);
    if (!kind) return { outcome: "IGNORED_UNKNOWN_KIND" };
    if (kind === "courier") return { outcome: (await applyCourierWebhook(shopId, data)) ? "APPLIED" : "IGNORED_NO_SHIPMENT" };

    const pno = str(data.pno);
    const ship = pno ? await findShipmentByPno(shopId, pno) : null;
    if (!pno || !ship) {
      console.info(`[flash-webhook] ไม่ใช่พัสดุของร้าน kind=${kind}`); // นับเท่านั้น ไม่เก็บ payload/PII (BR-FLASH-77)
      return { outcome: "IGNORED_NO_SHIPMENT" };
    }

    // raw ก่อน apply เสมอ — parse/apply พังแล้วหลักฐานดิบยังอยู่
    // M3: ครบโควตาแถว raw ต่อใบ = ไม่เก็บเพิ่ม (ยังประมวลผลต่อ) · body เกิน 8KB เก็บแค่ marker + sha
    const json = JSON.stringify(data);
    const rawCount = await prisma.shipmentEvent.count({ where: { shipmentId: ship.id, source: "WEBHOOK_RAW" } });
    if (rawCount < RAW_ROWS_PER_SHIPMENT_MAX) {
      const bytes = Buffer.byteLength(json);
      await recordEvent(ship.id, {
        status: `raw:${kind}`, occurredAt: new Date(), source: "WEBHOOK_RAW",
        dedupeKey: `raw:${kind}:${sha(json, 32)}`,
        payload: bytes > RAW_PAYLOAD_MAX_BYTES ? { truncated: true, bytes, sha256: sha(json, 64) } : (data as Prisma.InputJsonObject),
      });
    }

    const isReturnLeg = !!ship.returnedPno && pno === ship.returnedPno && pno !== ship.trackingNo;
    if (kind === "price" || kind === "weight") {
      if (!isReturnLeg) await captureFlashCharges(ship, kind, data); // ต้นทุนขากลับไม่ทับของขาไป
      return { outcome: "APPLIED" };
    }
    return await applyStatusLikeWebhook(loaded, ship, pno, kind, data);
  } catch (e) {
    if (await markIfInvalid(shopId, e)) return { outcome: "TOKEN_INVALID" };
    if (isParcelGone(e)) return { outcome: "IGNORED_NO_SHIPMENT" };
    console.error("[flash-webhook] ล้มชั่วคราว", e instanceof Error ? e.name : "error"); // ไม่ log ข้อความ (อาจมี PII)
    return { outcome: "RETRY" };
  }
}

async function findShipmentByPno(shopId: string, pno: string): Promise<FlashShipmentRow | null> {
  const base = { shopId, provider: "FLASH" } as const;
  return (
    (await prisma.orderShipment.findFirst({ where: { ...base, trackingNo: pno }, select: SHIP_SELECT })) ??
    (await prisma.orderShipment.findFirst({ where: { ...base, returnedPno: pno }, select: SHIP_SELECT }))
  );
}

async function applyStatusLikeWebhook(
  loaded: LoadedFlashAccount, ship: FlashShipmentRow, pno: string, kind: FlashWebhookKind, data: Rec,
): Promise<FlashWebhookResult> {
  const claimed = stateNum(data.state);
  const marker = { markerCategory: data.markerCategory };
  if (isVerifyState(claimed)) {
    // webhook เป็นแค่ตัวกระตุ้น: คำตอบของ routes คือความจริง (BR-FLASH-73) — ถามไม่ได้ = ไม่ประทับ + ให้ Flash ยิงซ้ำ
    const routes = normalizeRoutes(await client.routes(loaded.cred, pno, { timeoutMs: 5000 }));
    if (!routes) return { outcome: "RETRY" };
    if (routes.state !== claimed) console.warn("[flash-webhook] state ใน body ต่างจาก routes ใช้ routes", { claimed, actual: routes.state });
    const r = await applyFlashRoutes(ship, { ...routes, pno: routes.pno ?? pno }, "WEBHOOK", { pno, ...marker });
    return { outcome: "APPLIED", after: r.deliveredConfirmed ? podAfter(loaded, ship) : undefined };
  }
  const at = clampFuture(parseFlashTime(data.stateDate ?? data.stateChangeAt));
  const routedAt = clampFuture(parseFlashTime(data.routedAt));
  const action = str(data.routeAction) ?? str(data.routedAction);
  const body: FlashRoutes = {
    pno, state: claimed, stateChangeAt: at, returnedPno: null, customaryPno: null,
    routes: kind === "routes" && (routedAt || action) ? [{ routedAt, action, message: str200(data.message), state: claimed }] : [],
  };
  await applyFlashRoutes(ship, body, "WEBHOOK", { pno, untrusted: true, ...marker });
  return { outcome: "APPLIED" };
}

const podAfter = (loaded: LoadedFlashAccount, ship: FlashShipmentRow) => async () => {
  try {
    await captureFlashPod(loaded, ship);
  } catch (e) {
    console.error("[flash-pod] ล้ม", e instanceof Error ? e.name : "error");
  }
};

/** courier webhook: จับแถวด้วยรหัสคำขอทั้งสองตัว; ไม่เจอ = ทิ้ง ไม่สร้างแถวใหม่; state นอกชุด = คงสถานะ */
async function applyCourierWebhook(shopId: string, data: Rec): Promise<boolean> {
  const ids = [str(data.ticketPickupId), str(data.currentTicketPickupId)].filter((x): x is string => !!x);
  if (ids.length === 0) return false;
  const pickup = await prisma.shipmentPickup.findFirst({
    where: { shopId, provider: "FLASH", OR: [{ ticketPickupId: { in: ids } }, { currentTicketPickupId: { in: ids } }] },
    select: { id: true, status: true, acceptedAt: true },
  });
  if (!pickup) return false;
  const n = stateNum(data.state ?? data.status);
  const next = n === null ? undefined : FLASH_PICKUP_STATE[n];
  const terminal = pickup.status === "CLOSED" || pickup.status === "CANCELLED";
  const now = new Date();
  await prisma.shipmentPickup.update({
    where: { id: pickup.id },
    data: {
      ...(next && !terminal ? { status: next } : {}),
      ...(n === 3 && str(data.currentTicketPickupId) ? { currentTicketPickupId: str(data.currentTicketPickupId)! } : {}),
      ...(next === "ACCEPTED" && !terminal && !pickup.acceptedAt ? { acceptedAt: now } : {}),
      ...(next === "CLOSED" && !terminal ? { closedAt: now } : {}),
      ...(next === "CANCELLED" && !terminal ? { cancelledAt: now } : {}),
      ...(str200(data.staffInfoName) ? { staffName: str200(data.staffInfoName)! } : {}),
      ...(str200(data.staffInfoPhone) ? { staffPhone: str200(data.staffInfoPhone)! } : {}),
      ...(str200(data.timeoutAtText) ? { timeoutAtText: str200(data.timeoutAtText)! } : {}),
      ...(str200(data.ticketMessage) ? { ticketMessage: str200(data.ticketMessage)! } : {}),
    },
  });
  return true;
}

// ─── รอบ poll (TFR-FLASH-018) ───────────────────────────────────────────────

/** แบ่ง pno เป็นก้อน (คั่นจุลภาค) ยาวไม่เกิน maxChars; pno เดี่ยวที่ยาวเกินก็ไปก้อนของตัวเอง */
export function chunkPnos(pnos: string[], maxChars: number = FLASH_POLL.pnoChunkChars): string[][] {
  const out: string[][] = [];
  let cur: string[] = [];
  let len = 0;
  for (const p of pnos) {
    const add = p.length + (cur.length ? 1 : 0);
    if (cur.length && len + add > maxChars) { out.push(cur); cur = []; len = 0; }
    len += p.length + (cur.length ? 1 : 0);
    cur.push(p);
  }
  if (cur.length) out.push(cur);
  return out;
}

/** คืนจำนวนแถวพัสดุที่สถานะเปลี่ยน; ข้ามร้านที่ key ใช้ไม่ได้/ยังไม่ครบ 15 นาที; ล้มอื่น = throw (ไม่อัปเดต statusSyncedAt) */
export async function syncFlashStatuses(shopId: string, opts?: { force?: boolean }): Promise<number> {
  const loaded = await loadFlashAccount(shopId);
  if (!loaded || loaded.account.status !== "ACTIVE") return 0;
  const synced = loaded.account.statusSyncedAt;
  if (!opts?.force && synced && Date.now() - synced.getTime() < FLASH_POLL.throttleMs) return 0;

  const rows = await prisma.orderShipment.findMany({
    where: {
      ...ACTIVE_FORWARD_SHIPMENT, shopId, provider: "FLASH", trackingNo: { not: null },
      createdAt: { gt: new Date(Date.now() - FLASH_POLL.lookbackDays * 86_400_000) },
      OR: [{ carrierStatus: null }, { carrierStatus: { notIn: SETTLED_CODES } }],
    },
    select: SHIP_SELECT,
  });
  const byPno = new Map<string, FlashShipmentRow>();
  for (const s of rows) {
    if (isFlashTrackingSettled(s.carrierStatus)) continue;
    byPno.set(s.trackingNo!, s);
    if (s.carrierStatus === "return" && s.returnedPno) byPno.set(s.returnedPno, s);
  }

  let changed = 0;
  let fallbackLeft: number = FLASH_POLL.fallbackRoutesPerShop;
  try {
    for (const chunk of chunkPnos([...byPno.keys()])) {
      let got = new Map<string, FlashRoutes>();
      try {
        got = normalizeBatchRoutes(await client.routesBatch(loaded.cred, chunk));
      } catch (e) {
        if (!(e instanceof FlashError) || e.invalidatesConnection || e.retryable) throw e;
        // คำตอบอื่นของก้อน (เช่น pno ไม่ใช่ของเรา) → ถอยไปรายใบด้านล่าง
      }
      for (const pno of chunk) {
        let routes = got.get(pno) ?? null;
        if (!routes && fallbackLeft > 0) {
          fallbackLeft--;
          try {
            routes = normalizeRoutes(await client.routes(loaded.cred, pno));
          } catch (e) {
            if (!isParcelGone(e)) throw e;
          }
        }
        if (!routes) continue;
        const r = await applyFlashRoutes(byPno.get(pno)!, { ...routes, pno: routes.pno ?? pno }, "POLL", { pno });
        if (r.changed) changed++;
      }
    }
    await repairPods(loaded, shopId);
  } catch (e) {
    if (await markIfInvalid(shopId, e)) return changed; // key ใช้ไม่ได้: ข้ามร้าน ไม่อัปเดต statusSyncedAt
    throw e;
  }
  await prisma.shopShippingAccount.updateMany({ where: { shopId, provider: "FLASH" }, data: { statusSyncedAt: new Date() } });
  return changed;
}

/** ใบ delivered ที่ยังไม่มี flash_pod หรือมีแถว error → ลองใหม่ ≤5 ใบ/ร้าน/รอบ */
async function repairPods(loaded: LoadedFlashAccount, shopId: string) {
  const todo = await prisma.orderShipment.findMany({
    where: {
      ...ACTIVE_FORWARD_SHIPMENT, shopId, provider: "FLASH", trackingNo: { not: null }, deliveredAt: { not: null },
      NOT: { evidence: { some: { reason: POD_REASON, error: null } } },
    },
    select: SHIP_SELECT,
    orderBy: { deliveredAt: "desc" },
    take: FLASH_POLL.podRepairPerShop,
  });
  for (const s of todo) await captureFlashPod(loaded, s);
}

/** cron: ร้านละ try/catch; ร้านที่ key ใช้ไม่ได้/ไม่ใช่ ONLINE_SALES ไม่ถูกเลือก */
export async function runFlashStatusSyncCron() {
  const cutoff = new Date(Date.now() - FLASH_POLL.throttleMs);
  const accounts = await prisma.shopShippingAccount.findMany({
    where: {
      provider: "FLASH", status: "ACTIVE", shop: { vertical: "ONLINE_SALES" },
      OR: [{ statusSyncedAt: null }, { statusSyncedAt: { lt: cutoff } }],
    },
    orderBy: { statusSyncedAt: { sort: "asc", nulls: "first" } },
    take: FLASH_POLL.maxShopsPerRun,
    select: { shopId: true },
  });
  let shopsChanged = 0, rowsChanged = 0, failed = 0;
  for (const { shopId } of accounts) {
    try {
      const n = await syncFlashStatuses(shopId);
      if (n > 0) { shopsChanged++; rowsChanged += n; }
    } catch (e) {
      failed++;
      console.error("[flash-cron] sync ล้ม", shopId, e instanceof Error ? e.name : "error");
    }
  }
  const result = { shops: accounts.length, shopsChanged, rowsChanged, failed };
  console.log("[flash-cron] เสร็จรอบ", result);
  return result;
}
