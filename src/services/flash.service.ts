import "server-only";
// feature 00084 T5 — flash.service: เชื่อม/ทดสอบ/ถอน/ตั้งค่า/webhook sync/ราคาประมาณ/เรียกรถ/แผงในออเดอร์
//
// ความรับผิดชอบ: กฎธุรกิจ + เขียน DB ของบัญชี Flash (provider='FLASH' เท่านั้น — ห้ามกระทบแถว ISHIP)
// secret key ถูกถอดรหัสผ่าน loadFlashAccount ที่เดียว (flash-account.ts) และไม่ออกจากไฟล์นี้ไปที่ไหน
// ยกเว้นเป็นพารามิเตอร์ของ lib/flash/client · view ทุกตัวไม่มี key/envelope/webhookSecret ตั้งแต่ระดับ type
// สิทธิ์ OWNER-only ตัดสินที่ route (requireFlashOwner) — service รับ isOwner แค่เพื่อเลือกว่า mchId เต็มโชว์ได้ไหม

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { LATEST_FORWARD_SHIPMENT } from "@/lib/shipment-direction";
import * as flash from "@/lib/flash/client";
import { encodeCredential, hashWebhookSecret, newWebhookSecret } from "@/lib/flash/credential";
import { FlashError, FlashServiceError, flashUserMessage, type FlashErrorCode } from "@/lib/flash/errors";
import { flashWebhookBase, isFlashDirectEnabled, isFlashDryRun } from "@/lib/flash/gate";
import { buildEstimateParams, normalizeFlashProvince } from "@/lib/flash/mapping";
import { parseSatangStrict } from "@/lib/flash/units";
import { FLASH_WEBHOOK_KINDS, classifyWebhookUrl, type FlashWebhookKind } from "@/lib/flash/webhook-parse";
import { checkEligibility } from "@/lib/iship/eligibility";
import { resolveDefaultCodAmount } from "@/lib/iship/payment-sync";
import { findMissingSenderFields, type DeepAddress, type SenderAddress } from "@/lib/iship/mapping";
import { SHIPMENT_SELECT, toShipmentView } from "@/services/iship.service";
import {
  toShipmentContextJson,
  toShipmentViewJson,
  type ShipmentContext,
  type ShipmentContextJson,
  type ShipmentViewJson,
} from "@/lib/iship/context";
import {
  FLASH,
  findFlashAccount,
  loadFlashAccount,
  markFlashTokenInvalid,
  recordFlashAudit,
  type FlashAccountRow,
  type LoadedFlashAccount,
} from "@/services/flash-account";

// สัญญาของ SDS §3.1 — ให้ service อื่นนำเข้าจากที่เดียวได้
export { loadFlashAccount, recordFlashAudit };

// ─── view types (ไม่มี key) ─────────────────────────────────────────────────

export type FlashWebhookStatus = "NOT_SET" | "REGISTERED" | "FAILED" | "EXTERNAL";

export interface FlashConnectionView {
  available: boolean;
  connected: boolean;
  status: "ACTIVE" | "TOKEN_INVALID" | "DISCONNECTED" | null;
  merchantIdMasked: string | null;
  /** เต็มเฉพาะ OWNER */
  merchantId: string | null;
  keyLast4: string | null;
  lastVerifiedAt: string | null;
  lastVerifyError: string | null;
  senderComplete: boolean;
  settingsComplete: boolean;
  createMode: "AUTO" | "ASK" | "OFF";
  labelSize: "BIG" | "SMALL";
  webhook: { status: FlashWebhookStatus; registeredAt: string | null };
  /** คำขอเรียกรถล่าสุดที่ยังไม่ CANCELLED/CLOSED (null = ไม่มี) */
  lastPickup: FlashLastPickup | null;
}

export interface FlashLastPickup {
  id: string;
  status: string;
  ticketPickupId: string | null;
  currentTicketPickupId: string | null;
  staffName: string | null;
  staffPhone: string | null;
  timeoutAtText: string | null;
  ticketMessage: string | null;
  isDryRun: boolean;
  createdAt: string;
}

export interface FlashWebhookReport {
  status: FlashWebhookStatus;
  kinds: {
    kind: FlashWebhookKind;
    state: "EMPTY" | "OURS" | "OTHER_DEEP" | "EXTERNAL" | "UNKNOWN";
    action: "SET" | "KEPT" | "SKIPPED" | "FAILED";
    /** hostname เท่านั้น — ไม่มี path/query/secret */
    host?: string;
  }[];
}

export interface FlashSettings {
  senderName: string | null;
  senderPhone: string | null;
  senderAddress: string | null;
  senderSubdistrict: string | null;
  senderDistrict: string | null;
  senderProvince: string | null;
  senderPostcode: string | null;
  defaultWeight: number | null;
  defaultWidth: number | null;
  defaultLength: number | null;
  defaultHeight: number | null;
  defaultCategoryId: number | null;
  optOnTime: boolean;
  optBoxShield: boolean;
  optIsInsured: boolean;
  optProductValue: number | null;
  defaultRemark: string | null;
  createMode: "AUTO" | "ASK" | "OFF";
  labelSize: "BIG" | "SMALL";
}

export type FlashSettingsInput = Partial<Omit<FlashSettings, "defaultWeight" | "optProductValue">> & {
  defaultWeight?: number | null;
  optProductValue?: number | null;
};

type ViewOpts = { isOwner?: boolean };

// ─── helper ภายใน ───────────────────────────────────────────────────────────

const senderOf = (a: FlashAccountRow): SenderAddress => ({
  name: a.senderName,
  phone: a.senderPhone,
  address: a.senderAddress,
  subdistrict: a.senderSubdistrict, // ตำบล
  district: a.senderDistrict, // อำเภอ
  province: a.senderProvince,
  postcode: a.senderPostcode,
});


const maskId = (id: string) => (id.length <= 5 ? "•".repeat(id.length) : "•".repeat(id.length - 3) + id.slice(-3));

const notConnected = () => new FlashServiceError("NOT_CONNECTED", "ร้านนี้ยังไม่ได้เชื่อมต่อกับ Flash");

/** gate ปิด = ไม่ให้เริ่มงานใหม่ (ร้านที่มีแถวอยู่แล้วยังถอน/รับ webhook ได้ — ไม่เรียกฟังก์ชันนี้ในทางเหล่านั้น) */
function assertEnabled(): void {
  if (!isFlashDirectEnabled()) throw new FlashServiceError("FEATURE_DISABLED", "ยังไม่เปิดให้เชื่อม Flash ตรง");
}

/** บัญชีที่ใช้ยิง Flash ได้ (TOKEN_INVALID ผ่าน — ร้านอาจกำลังวาง key ใหม่/ทดสอบซ้ำ) */
async function requireAccount(shopId: string): Promise<LoadedFlashAccount> {
  const loaded = await loadFlashAccount(shopId);
  if (!loaded) throw notConnected();
  return loaded;
}

/**
 * ครอบการเรียก Flash — 1001/1002 เปลี่ยนสถานะเป็น TOKEN_INVALID เสมอ (BR-FLASH-14)
 * timeout/5xx/อื่น ๆ ห้ามเปลี่ยนสถานะ (invalidatesConnection เป็น false อยู่แล้ว)
 */
export async function withFlashGuard<T>(shopId: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof FlashError && err.invalidatesConnection) await markFlashTokenInvalid(shopId, err.userMessage);
    throw err;
  }
}

function toConnectionView(a: FlashAccountRow | null, opts: ViewOpts = {}, lastPickup: FlashLastPickup | null = null): FlashConnectionView {
  const available = isFlashDirectEnabled();
  const webhookOf = (row: FlashAccountRow | null) => ({
    status: ((row?.webhookStatus as FlashWebhookStatus | null) ?? "NOT_SET") as FlashWebhookStatus,
    registeredAt: row?.webhookRegisteredAt?.toISOString() ?? null,
  });
  if (!a || a.status === "DISCONNECTED") {
    return {
      available,
      connected: false,
      status: a ? "DISCONNECTED" : null,
      // mchId คงอยู่หลังถอน (BR-FLASH-16) แต่ไม่บอกในสถานะ "ยังไม่เชื่อม"
      merchantIdMasked: null,
      merchantId: null,
      keyLast4: null,
      lastVerifiedAt: null,
      lastVerifyError: null,
      senderComplete: false,
      settingsComplete: false,
      createMode: "OFF",
      labelSize: "BIG",
      webhook: { status: "NOT_SET", registeredAt: null },
      lastPickup: null,
    };
  }
  return {
    available,
    connected: true,
    status: a.status as FlashConnectionView["status"],
    merchantIdMasked: a.merchantId ? maskId(a.merchantId) : null,
    merchantId: opts.isOwner ? a.merchantId : null,
    keyLast4: a.tokenLast4,
    lastVerifiedAt: a.lastVerifiedAt?.toISOString() ?? null,
    lastVerifyError: a.lastVerifyError,
    senderComplete: findMissingSenderFields(senderOf(a)).length === 0,
    settingsComplete: a.defaultWeight != null && a.defaultCategoryId != null,
    createMode: a.createMode as FlashConnectionView["createMode"],
    labelSize: a.labelSize === "SMALL" ? "SMALL" : "BIG",
    webhook: webhookOf(a),
    lastPickup,
  };
}

/** view + คำขอเรียกรถล่าสุด (อ่านเฉพาะเมื่อเชื่อมอยู่) — ทุกทางที่คืน connection ผ่านที่นี่ */
async function viewOf(shopId: string, a: FlashAccountRow | null, opts: ViewOpts = {}): Promise<FlashConnectionView> {
  if (!a || a.status === "DISCONNECTED") return toConnectionView(a, opts);
  const p = await prisma.shipmentPickup.findFirst({
    where: { shopId, provider: FLASH, status: { notIn: ["CANCELLED", "CLOSED"] } },
    orderBy: { createdAt: "desc" },
  });
  return toConnectionView(a, opts, p && {
    id: p.id,
    status: p.status,
    ticketPickupId: p.ticketPickupId,
    currentTicketPickupId: p.currentTicketPickupId,
    staffName: p.staffName,
    staffPhone: p.staffPhone,
    timeoutAtText: p.timeoutAtText,
    ticketMessage: p.ticketMessage,
    isDryRun: p.isDryRun,
    createdAt: p.createdAt.toISOString(),
  });
}

function toSettings(a: FlashAccountRow): FlashSettings {
  // เลือกทีละ field — ไม่ spread ทั้งแถว (จะพา accessTokenEnc ติดออกไป)
  return {
    senderName: a.senderName,
    senderPhone: a.senderPhone,
    senderAddress: a.senderAddress,
    senderSubdistrict: a.senderSubdistrict,
    senderDistrict: a.senderDistrict,
    senderProvince: a.senderProvince,
    senderPostcode: a.senderPostcode,
    defaultWeight: a.defaultWeight != null ? Number(a.defaultWeight) : null,
    defaultWidth: a.defaultWidth != null ? Number(a.defaultWidth) : null,
    defaultLength: a.defaultLength != null ? Number(a.defaultLength) : null,
    defaultHeight: a.defaultHeight != null ? Number(a.defaultHeight) : null,
    defaultCategoryId: a.defaultCategoryId,
    optOnTime: a.optOnTime,
    optBoxShield: a.optBoxShield,
    optIsInsured: a.optIsInsured,
    optProductValue: a.optProductValue != null ? Number(a.optProductValue) : null,
    defaultRemark: a.defaultRemark,
    createMode: a.createMode as FlashSettings["createMode"],
    labelSize: a.labelSize === "SMALL" ? "SMALL" : "BIG",
  };
}

// ─── การเชื่อมต่อ ───────────────────────────────────────────────────────────

export async function getFlashConnection(shopId: string, opts: ViewOpts = {}): Promise<FlashConnectionView> {
  return viewOf(shopId, await findFlashAccount(shopId), opts);
}

/**
 * connectFlash — ลำดับบังคับ (TFR-FLASH-004): gate → พิสูจน์ key → ตรวจ mchId ซ้ำ → ตรวจเปลี่ยน mchId → upsert → webhook
 *
 * 🛑 ตรวจ MERCHANT_IN_USE "หลัง" พิสูจน์ key เท่านั้น — ถ้าตรวจก่อน endpoint นี้จะกลายเป็นตัวสอบถามว่า mchId ใครใช้ Deep
 */
export async function connectFlash(
  shopId: string,
  userId: string,
  input: { mchId: string; secretKey: string },
  opts: ViewOpts = {},
): Promise<{ connection: FlashConnectionView; webhook: FlashWebhookReport; created: boolean }> {
  assertEnabled();
  const mchId = input.mchId.trim();
  const secretKey = input.secretKey.trim();

  // ไม่ code=1 → FlashError ลอยออกไปโดยยังไม่มีอะไรถูกบันทึก (ไม่ผ่าน guard: ยังไม่มีแถวให้ mark)
  await flash.warehouses({ mchId, secretKey });

  const inUse = new FlashServiceError("MERCHANT_IN_USE", "mchId นี้ถูกใช้งานอยู่กับร้านอื่น");
  const other = await prisma.shopShippingAccount.findFirst({
    where: { provider: FLASH, merchantId: mchId, status: { not: "DISCONNECTED" }, shopId: { not: shopId } },
    select: { id: true },
  });
  if (other) throw inUse;

  const existing = await findFlashAccount(shopId);
  const live = !!existing && existing.status !== "DISCONNECTED";
  if (live && existing.merchantId && existing.merchantId !== mchId) {
    throw new FlashServiceError(
      "MERCHANT_CHANGE_NOT_ALLOWED",
      "เปลี่ยนรหัสร้านค้า (mchId) ไม่ได้ — ถอนการเชื่อมต่อก่อน แล้วเชื่อมใหม่ด้วยบัญชี Flash อื่น",
    );
  }

  // เปลี่ยน key ใช้ w เดิม (URL ที่ลงทะเบียนไว้กับ Flash ยังใช้ได้) · เชื่อมใหม่หลังถอนสร้าง w ใหม่
  let webhookSecret = newWebhookSecret();
  if (live) {
    try {
      const old = (await loadFlashAccount(shopId))?.webhookSecret;
      if (old) webhookSecret = old;
    } catch {
      /* envelope เดิมเสีย → ใช้ w ใหม่ */
    }
  }

  const common = {
    accessTokenEnc: encodeCredential({ secretKey, webhookSecret }),
    tokenLast4: secretKey.slice(-4),
    merchantId: mchId,
    status: "ACTIVE",
    connectedByUserId: userId,
    lastVerifiedAt: new Date(),
    lastVerifyError: null,
    webhookSecretHash: hashWebhookSecret(webhookSecret),
  };
  try {
    await prisma.shopShippingAccount.upsert({
      where: { shopId_provider: { shopId, provider: FLASH } },
      // createMode OFF ตรง ๆ: การเปิดพัสดุคือค่าใช้จ่ายจริง ร้านที่เพิ่งเชื่อมต้องเงียบไว้ก่อน
      create: { shopId, provider: FLASH, createMode: "OFF", ...common },
      update: common,
    });
  } catch (e) {
    // ชน partial unique (race สองร้านวาง mchId เดียวกัน) = ผลเดียวกับด่านข้างบน
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw inUse;
    throw e;
  }

  const created = !live;
  await recordFlashAudit(shopId, { userId, action: created ? "connect" : "change_key" });

  // ลงทะเบียน webhook แบบ best-effort — ล้มไม่ทำให้ connect ล้ม (ป้าย FAILED + ปุ่มลองใหม่)
  let webhook: FlashWebhookReport;
  try {
    webhook = await syncFlashWebhooks(shopId, userId);
  } catch {
    webhook = { status: "FAILED", kinds: [] };
  }
  return { connection: await viewOf(shopId, await findFlashAccount(shopId), opts), webhook, created };
}

/** ทดสอบ key ปัจจุบัน — 1001/1002 → TOKEN_INVALID (คืนเป็น view ไม่ใช่ error) · timeout/อื่น ๆ ไม่เปลี่ยนสถานะ */
export async function verifyFlash(shopId: string, opts: ViewOpts = {}): Promise<FlashConnectionView> {
  const { cred } = await requireAccount(shopId);
  try {
    await withFlashGuard(shopId, () => flash.warehouses(cred));
  } catch (err) {
    if (err instanceof FlashError && err.invalidatesConnection) {
      return viewOf(shopId, await findFlashAccount(shopId), opts);
    }
    throw err;
  }
  const row = await prisma.shopShippingAccount.update({
    where: { shopId_provider: { shopId, provider: FLASH } },
    data: { status: "ACTIVE", lastVerifiedAt: new Date(), lastVerifyError: null },
  });
  return await viewOf(shopId, row, opts);
}

/**
 * ถอน — ปิด webhook ที่ชี้มา Deep (best-effort) → ล้าง key · คง merchantId และประวัติพัสดุทั้งหมด
 * 🛑 where ต้องมี provider FLASH เสมอ (BR-FLASH-19)
 */
export async function disconnectFlash(shopId: string, userId: string): Promise<void> {
  const row = await findFlashAccount(shopId);
  if (!row || row.status === "DISCONNECTED") throw notConnected();

  const closed: FlashWebhookKind[] = [];
  try {
    const loaded = await loadFlashAccount(shopId);
    if (loaded) {
      const secretHash = hashWebhookSecret(loaded.webhookSecret);
      const states = classifyInfos(await flash.webhookInfos(loaded.cred), secretHash);
      for (const kind of FLASH_WEBHOOK_KINDS) {
        if (states[kind].state !== "OURS") continue;
        try {
          await flash.setWebhook(loaded.cred, { serviceCategory: 0, webhookApiCode: KIND_CODE[kind] });
          closed.push(kind);
        } catch {
          /* ข้าม — ไม่บล็อกการถอน */
        }
      }
    }
  } catch {
    /* ปิด webhook ล้ม = ข้าม */
  }

  await prisma.shopShippingAccount.updateMany({
    where: { shopId, provider: FLASH },
    data: {
      accessTokenEnc: "",
      tokenLast4: null,
      status: "DISCONNECTED",
      webhookSecretHash: null,
      webhookStatus: "NOT_SET",
      webhookRegisteredAt: null,
      lastVerifiedAt: null,
      lastVerifyError: null,
    },
  });
  await recordFlashAudit(shopId, { userId, action: "disconnect", kinds: closed });
}

// ─── ค่าตั้งต้น ─────────────────────────────────────────────────────────────

// whitelist — field นอกชุดนี้ (accessTokenEnc, merchantId, status, defaultCodEnabled ฯลฯ) แก้ผ่านทางนี้ไม่ได้
const SETTINGS_KEYS = [
  "senderName", "senderPhone", "senderAddress", "senderSubdistrict", "senderDistrict", "senderProvince", "senderPostcode",
  "defaultWeight", "defaultWidth", "defaultLength", "defaultHeight", "defaultCategoryId",
  "optOnTime", "optBoxShield", "optIsInsured", "optProductValue", "defaultRemark", "createMode", "labelSize",
] as const;

async function requireLiveRow(shopId: string): Promise<FlashAccountRow> {
  const a = await findFlashAccount(shopId);
  if (!a || a.status === "DISCONNECTED") throw notConnected();
  return a;
}

export async function getFlashSettings(shopId: string, opts: ViewOpts = {}) {
  const a = await requireLiveRow(shopId);
  return { connection: await viewOf(shopId, a, opts), settings: toSettings(a) };
}

export async function updateFlashSettings(shopId: string, input: FlashSettingsInput, opts: ViewOpts = {}) {
  await requireLiveRow(shopId);
  const data: Record<string, unknown> = {};
  for (const k of SETTINGS_KEYS) if (input[k] !== undefined) data[k] = input[k];
  const a = await prisma.shopShippingAccount.update({ where: { shopId_provider: { shopId, provider: FLASH } }, data });
  return { connection: await viewOf(shopId, a, opts), settings: toSettings(a) };
}

// ─── webhook ────────────────────────────────────────────────────────────────

const KIND_CODE: Record<FlashWebhookKind, 0 | 1 | 2 | 3 | 4> = { status: 0, weight: 1, price: 2, courier: 3, routes: 4 };

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
/** ทนทั้ง camelCase/snake_case (P0-10: รูปจริงของ infos ยังรอพิสูจน์) */
const pickKey = (o: Rec, aliases: string[]): unknown => aliases.map((k) => o[k]).find((v) => v != null);

const CODE_ALIASES = ["webhookApiCode", "webhook_api_code", "webHookApiCode", "apiCode", "api_code", "type", "code"];
const URL_ALIASES = ["url", "webhookUrl", "webhook_url", "webHookUrl", "web_hook_url"];
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/**
 * infos → url ต่อชนิด · null = ไม่ได้ตั้ง · undefined = อ่านรูปไม่ออก (→ UNKNOWN ไม่ทับเด็ดขาด)
 * shortcut: เดารูปจาก doc ตัวอย่าง (array ของ {code,url} หรือ object คีย์ตามชนิด) · อัปเกรดเมื่อ P0-10 ได้ payload จริง
 */
function readInfoUrls(data: unknown): Record<FlashWebhookKind, string | null | undefined> {
  const out = {} as Record<FlashWebhookKind, string | null | undefined>;
  const nothingSet = data == null || (Array.isArray(data) && data.length === 0) || (isRec(data) && Object.keys(data).length === 0);
  for (const k of FLASH_WEBHOOK_KINDS) out[k] = nothingSet ? null : undefined;
  if (nothingSet) return out;

  const urlOf = (v: unknown): string | null | undefined => (typeof v === "string" ? v.trim() || null : undefined);
  const list = Array.isArray(data) ? data : isRec(data) ? Object.values(data).find(Array.isArray) : undefined;
  if (Array.isArray(list)) {
    const rows = new Set<FlashWebhookKind>();
    for (const item of list) {
      if (!isRec(item)) continue;
      const c = String(pickKey(item, CODE_ALIASES) ?? "").trim().toLowerCase();
      const kind = FLASH_WEBHOOK_KINDS.find((k) => String(KIND_CODE[k]) === c || k === c);
      if (!kind) continue;
      rows.add(kind);
      out[kind] = urlOf(pickKey(item, URL_ALIASES));
    }
    // แกะได้อย่างน้อยหนึ่งแถว → ชนิดที่ไม่มีแถว = ยังไม่ได้ตั้ง · แกะไม่ได้เลย = UNKNOWN ทั้งหมด
    if (rows.size) for (const k of FLASH_WEBHOOK_KINDS) if (!rows.has(k)) out[k] = null;
    return out;
  }
  if (isRec(data)) {
    for (const k of FLASH_WEBHOOK_KINDS) {
      const v = pickKey(data, [k, `web_hook_${k}`, `webhook_${k}`, `webHook${cap(k)}`, `webhook${cap(k)}`, `${k}Url`, `${k}_url`]);
      if (v !== undefined) out[k] = isRec(v) ? urlOf(pickKey(v, URL_ALIASES)) : urlOf(v);
    }
  }
  return out;
}

type KindState = { state: FlashWebhookReport["kinds"][number]["state"]; host?: string };

/** จำแนกแต่ละชนิดของ infos — ตัวเดียวที่ตัดสินว่าอะไร "ของเรา/ของคนอื่น/ว่าง" */
function classifyInfos(data: unknown, secretHash: string): Record<FlashWebhookKind, KindState> {
  const urls = readInfoUrls(data);
  const base = flashWebhookBase();
  const out = {} as Record<FlashWebhookKind, KindState>;
  for (const k of FLASH_WEBHOOK_KINDS) {
    const u = urls[k];
    out[k] = u === undefined ? { state: "UNKNOWN" } : classifyWebhookUrl(u, { base, secretHash });
  }
  return out;
}

/**
 * syncFlashWebhooks — อ่านก่อนเสมอ แล้วตั้ง EMPTY + OTHER_DEEP อัตโนมัติ · EXTERNAL เฉพาะชนิดที่เจ้าของยืนยัน override (TFR-FLASH-006)
 *
 * 🛑 ห้ามข้ามขั้นอ่าน infos · UNKNOWN ไม่ทับเด็ดขาดแม้อยู่ใน overrideKinds · คืนเฉพาะ hostname
 */
export async function syncFlashWebhooks(
  shopId: string,
  userId: string,
  opts: { overrideKinds?: FlashWebhookKind[] } = {},
): Promise<FlashWebhookReport> {
  const { cred, webhookSecret } = await requireAccount(shopId);
  const override = new Set((opts.overrideKinds ?? []).filter((k) => FLASH_WEBHOOK_KINDS.includes(k)));
  const secretHash = hashWebhookSecret(webhookSecret);
  const base = flashWebhookBase();

  const persist = (status: FlashWebhookStatus, registered: boolean) =>
    prisma.shopShippingAccount.updateMany({
      where: { shopId, provider: FLASH, status: { not: "DISCONNECTED" } },
      data: { webhookStatus: status, ...(registered ? { webhookRegisteredAt: new Date() } : {}) },
    });
  const audit = (status: string, kinds: string[]) =>
    recordFlashAudit(shopId, { userId, action: override.size ? "webhook_override" : "webhook_sync", kinds, result: status });

  // ไม่มี base URL = สร้าง URL ที่ Flash รับไม่ได้ → ไม่ยิงอะไรเลย
  if (!base) {
    await persist("FAILED", false);
    await audit("FAILED", []);
    return { status: "FAILED", kinds: [] };
  }

  let states: Record<FlashWebhookKind, KindState>;
  try {
    // อ่านก่อนเสมอ — ไม่มีทางเขียนโดยไม่เห็นของเดิม
    const infos = await withFlashGuard(shopId, () => flash.webhookInfos(cred));
    states = classifyInfos(infos, secretHash);
  } catch {
    await persist("FAILED", false);
    await audit("FAILED", []);
    return { status: "FAILED", kinds: [] };
  }

  const kinds: FlashWebhookReport["kinds"] = [];
  const setKinds: FlashWebhookKind[] = [];
  let anyForeign = false;
  let anyFailed = false;
  for (const kind of FLASH_WEBHOOK_KINDS) {
    const { state, host } = states[kind];
    // OTHER_DEEP (URL ของ Deep ที่ไม่ใช่ secret ปัจจุบัน) ตั้งใหม่เองได้ · EXTERNAL ต้อง override · UNKNOWN ไม่ทับ
    const mayWrite = state === "EMPTY" || state === "OTHER_DEEP" || (state === "EXTERNAL" && override.has(kind));
    let action: FlashWebhookReport["kinds"][number]["action"] = state === "OURS" ? "KEPT" : "SKIPPED";
    if (mayWrite) {
      try {
        await withFlashGuard(shopId, () =>
          flash.setWebhook(cred, {
            serviceCategory: 1,
            webhookApiCode: KIND_CODE[kind],
            url: `${base}/api/webhooks/flash/${webhookSecret}?k=${kind}`,
          }),
        );
        action = "SET";
        setKinds.push(kind);
      } catch {
        action = "FAILED";
        anyFailed = true;
      }
    }
    if (action === "SKIPPED") anyForeign = true;
    kinds.push({ kind, state, action, ...(host ? { host } : {}) });
  }

  const status: FlashWebhookStatus = anyForeign ? "EXTERNAL" : anyFailed ? "FAILED" : "REGISTERED";
  await persist(status, setKinds.length > 0);
  await audit(status, setKinds);
  return { status, kinds };
}

// ─── ราคาประมาณ ─────────────────────────────────────────────────────────────

/** ตอบของ estimate_rate → บาท · ≤0/ไม่ใช่เลขจำนวนเต็มสตางค์ = ไม่มีราคา (null) — ห้ามคืน 0 */
export function estimatePrice(data: unknown): number | null {
  if (!isRec(data)) return null;
  const n = parseSatangStrict(data.estimatePrice);
  return n !== null && n > 0 ? n / 100 : null;
}

export interface FlashPriceInput {
  receiver: { district: string; province: string; postcode: string; subdistrict?: string | null };
  weight: number;
  width?: number | null;
  length?: number | null;
  height?: number | null;
}

/** ตารางสัญญา (1) ก่อน → ล้ม/ไม่มีราคา (ที่ไม่ใช่ key ผิด) ลองมาตรฐาน (0) และติดป้าย STANDARD ตรงความจริง */
export async function estimateFlashPrice(
  shopId: string,
  input: FlashPriceInput,
): Promise<{ totalBaht: number; pricingTable: "CONTRACT" | "STANDARD"; estimate: true }> {
  assertEnabled();
  const { account, cred } = await requireAccount(shopId);
  const sender = senderOf(account);
  const missing = findMissingSenderFields(sender);
  if (missing.length) throw new FlashServiceError("INCOMPLETE_DATA", `ที่อยู่ผู้ส่งยังไม่ครบ (${missing.join(", ")})`, missing);

  let lastErr: unknown = null;
  for (const table of [1, 0] as const) {
    try {
      const params = buildEstimateParams({
        sender,
        receiver: { province: input.receiver.province, district: input.receiver.district, postcode: input.receiver.postcode },
        weight: input.weight,
        width: input.width,
        length: input.length,
        height: input.height,
        pricingTable: table,
      });
      const price = estimatePrice(await withFlashGuard(shopId, () => flash.estimateRate(cred, params)));
      if (price !== null) return { totalBaht: price, pricingTable: table === 1 ? "CONTRACT" : "STANDARD", estimate: true };
      lastErr = new FlashError("UPSTREAM_ERROR", { upstreamMessage: "estimate: no price" });
    } catch (e) {
      if (e instanceof FlashServiceError) throw e; // ข้อมูลเราผิด — ลองอีกตารางก็ผิดเหมือนกัน
      if (e instanceof FlashError && e.invalidatesConnection) throw e;
      lastErr = e;
    }
  }
  throw lastErr;
}

// ─── เรียกรถ / ยกเลิกรถ ─────────────────────────────────────────────────────

export interface FlashPickupView {
  id: string;
  status: string;
  ticketPickupId: string | null;
  staffName: string | null;
  staffPhone: string | null;
  timeoutAtText: string | null;
  ticketMessage: string | null;
  isDryRun: boolean;
}

const toPickupView = (p: {
  id: string; status: string; ticketPickupId: string | null; staffName: string | null; staffPhone: string | null;
  timeoutAtText: string | null; ticketMessage: string | null; isDryRun: boolean;
}): FlashPickupView => ({
  id: p.id, status: p.status, ticketPickupId: p.ticketPickupId, staffName: p.staffName, staffPhone: p.staffPhone,
  timeoutAtText: p.timeoutAtText, ticketMessage: p.ticketMessage, isDryRun: p.isDryRun,
});

const str = (v: unknown): string | null => (v == null || v === "" ? null : String(v));

export async function requestFlashPickup(
  shopId: string,
  userId: string,
  input: { parcelCount: number; remark?: string | null },
): Promise<FlashPickupView> {
  assertEnabled();
  if (!Number.isInteger(input.parcelCount) || input.parcelCount < 1 || input.parcelCount > 100) {
    throw new FlashServiceError("INVALID_INPUT", "จำนวนพัสดุต้องเป็นจำนวนเต็ม 1–100");
  }
  const { account, cred } = await requireAccount(shopId);
  const missing = findMissingSenderFields(senderOf(account));
  if (missing.length) {
    throw new FlashServiceError("INCOMPLETE_DATA", `เรียกรถเข้ารับไม่ได้ — ที่อยู่ผู้ส่งยังไม่ครบ (${missing.join(", ")})`, missing);
  }
  const pickupAddress = [
    account.senderAddress, `ต.${account.senderSubdistrict}`, `อ.${account.senderDistrict}`,
    `จ.${account.senderProvince}`, account.senderPostcode,
  ].join(" ");
  const remark = input.remark?.trim() || null;
  const base = { shopId, provider: FLASH, courierCode: "FLASH", parcelCount: input.parcelCount, pickupAddress, remark, createdByUserId: userId };

  try {
    const r = await withFlashGuard(shopId, () =>
      flash.notify(cred, {
        srcName: account.senderName!.trim(),
        srcPhone: account.senderPhone!.replace(/[\s-]/g, ""),
        srcProvinceName: normalizeFlashProvince(account.senderProvince),
        srcCityName: account.senderDistrict!.trim(), // อำเภอ
        srcDistrictName: account.senderSubdistrict!.trim(), // ตำบล
        srcPostalCode: account.senderPostcode!.trim(),
        srcDetailAddress: account.senderAddress!.trim(),
        estimateParcelNumber: input.parcelCount,
        ...(remark ? { remark: remark.slice(0, 200) } : {}),
      }),
    );
    const ticket = str(r.ticketPickupId);
    const row = await prisma.shipmentPickup.create({
      data: {
        ...base,
        ticketPickupId: ticket,
        currentTicketPickupId: ticket,
        status: "REQUESTED",
        staffName: str(r.staffInfoName),
        staffPhone: str(r.staffInfoPhone),
        timeoutAtText: str(r.timeoutAtText),
        ticketMessage: str(r.ticketMessage),
        isDryRun: isFlashDryRun(),
      },
    });
    return toPickupView(row);
  } catch (e) {
    // timeout ตอนเรียกรถ: Flash อาจรับคำขอไปแล้ว — ข้อความ "ลองใหม่ได้" ของ create ใช้ไม่ได้ (เรียกซ้ำ = รถมาสองคัน)
    const err =
      e instanceof FlashError && e.code === "UPSTREAM_TIMEOUT"
        ? new FlashError("UPSTREAM_TIMEOUT", {
            upstreamMessage: e.upstreamMessage, httpStatus: e.httpStatus,
            userMessage: "Flash ไม่ตอบกลับทันเวลา คำขออาจถูกส่งไปแล้ว ตรวจกับ Flash ก่อนเรียกรถอีกครั้ง",
          })
        : e;
    // บันทึกความพยายามที่ล้มไว้ (ผู้ทำ+เวลา) — ข้อความเป็นของเราเท่านั้น ไม่ใช่ข้อความดิบจาก Flash
    await prisma.shipmentPickup.create({
      data: {
        ...base,
        status: "FAILED",
        lastErrorMessage:
          err instanceof FlashError ? err.userMessage : flashUserMessage("UPSTREAM_ERROR" satisfies FlashErrorCode),
      },
    });
    throw err;
  }
}

export async function cancelFlashPickup(shopId: string, pickupId: string): Promise<FlashPickupView> {
  const row = await prisma.shipmentPickup.findFirst({ where: { id: pickupId, shopId, provider: FLASH } });
  if (!row) throw new FlashServiceError("NOT_FOUND", "ไม่พบคำขอเรียกรถนี้");
  if (row.status !== "REQUESTED" && row.status !== "ACCEPTED") {
    throw new FlashServiceError("INVALID_STATE", "คำขอเรียกรถนี้ยกเลิกไม่ได้ในสถานะปัจจุบัน");
  }
  const { cred } = await requireAccount(shopId);

  // dry-run: รหัสเป็นของปลอม ไม่ยิง Flash
  if (!row.isDryRun) {
    const cancelWith = (r: { currentTicketPickupId: string | null; ticketPickupId: string | null }) =>
      withFlashGuard(shopId, () => flash.cancelNotify(cred, (r.currentTicketPickupId ?? r.ticketPickupId)!));
    try {
      await cancelWith(row);
    } catch (err) {
      if (!(err instanceof FlashError) || err.code !== "PICKUP_NOT_CANCELLABLE") throw err;
      // 1011: รหัสเปลี่ยนระหว่างทาง (webhook โอนงาน) → อ่านรหัสล่าสุดจากแถวแล้วลอง "ครั้งเดียว" ล้มซ้ำ = ให้ติดต่อ Flash
      const fresh = await prisma.shipmentPickup.findFirst({ where: { id: pickupId, shopId, provider: FLASH } });
      await cancelWith(fresh ?? row);
    }
  }
  const updated = await prisma.shipmentPickup.update({
    where: { id: pickupId },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });
  return toPickupView(updated);
}

// ─── แผงสร้างพัสดุในออเดอร์ (API.md §4.7) ───────────────────────────────────

// ตัวแปลงเดียวกับ iShip (ครอบใบ ISHIP ที่ปนมาใน LATEST ด้วย — ข้อความ error ดิบไม่หลุดออก)
// getShipmentPanelOrReason ของ iShip ผูกบัญชี ISHIP จึงประกอบแผงเองด้วย eligibility/context ตัวเดียวกัน
export const FLASH_SHIPMENT_SELECT = SHIPMENT_SELECT;

export function toFlashShipmentView(s: Parameters<typeof toShipmentView>[0]): ShipmentViewJson {
  return toShipmentViewJson(toShipmentView(s));
}

export type FlashPanelJson =
  | (ShipmentContextJson & {
      flashState: "READY";
      provider: "FLASH";
      labelSize: "BIG" | "SMALL";
      createMode: "AUTO" | "ASK" | "OFF";
      activeElsewhere: FlashActiveElsewhere | null;
      canShip: boolean;
    })
  | {
      flashState: "UNAVAILABLE" | "NOT_CONNECTED" | "DISCONNECTED" | "TOKEN_INVALID";
      orderId: string;
      shipment: ShipmentViewJson | null;
      activeElsewhere: FlashActiveElsewhere | null;
    };

export type FlashActiveElsewhere = { provider: "ISHIP"; trackingNo: string | null; courierName: string | null };

/** `{reason}` = ออเดอร์ไม่พบ/ไม่ต้องจัดส่ง (route → 404 NOT_ELIGIBLE) */
export async function getFlashPanelOrReason(shopId: string, orderId: string): Promise<FlashPanelJson | { reason: string }> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, shopId },
    select: {
      fulfillmentMode: true, buyerName: true, buyerContact: true, shippingAddress: true,
      totalAmount: true, paymentMethod: true,
      items: { select: { id: true, name: true, qty: true, price: true }, orderBy: { name: "asc" } },
    },
  });
  if (!order) return { reason: "ไม่พบคำสั่งซื้อนี้ในร้าน" };
  if (order.fulfillmentMode !== "SHIPPED") return { reason: "ออเดอร์นี้ไม่ต้องจัดส่ง" };

  // LATEST ของทุกผู้ให้บริการ — หน้าต้องเห็นใบที่ล้มเพื่อกดลองใหม่ และใบ iShip ที่ขวางการสร้าง (TD-FLASH-02)
  const latest = await prisma.orderShipment.findFirst({
    where: { orderId, ...LATEST_FORWARD_SHIPMENT },
    select: FLASH_SHIPMENT_SELECT,
    orderBy: { createdAt: "desc" },
  });
  const shipment = latest ? toFlashShipmentView(latest) : null;
  const activeElsewhere: FlashActiveElsewhere | null =
    latest && latest.provider === "ISHIP"
      ? { provider: "ISHIP", trackingNo: latest.trackingNo, courierName: latest.courierName }
      : null;

  const account = await findFlashAccount(shopId);
  const flashState = !isFlashDirectEnabled()
    ? "UNAVAILABLE"
    : !account
      ? "NOT_CONNECTED"
      : account.status === "DISCONNECTED"
        ? "DISCONNECTED"
        : account.status === "TOKEN_INVALID"
          ? "TOKEN_INVALID"
          : "READY";
  if (flashState !== "READY") return { flashState, orderId, shipment, activeElsewhere };
  const acct = account!; // READY ⇒ มีแถว (คำนวณข้างบน)

  const eligibility = checkEligibility(
    {
      fulfillmentMode: order.fulfillmentMode,
      buyerName: order.buyerName,
      buyerContact: order.buyerContact,
      shippingAddress: order.shippingAddress as DeepAddress | null,
    },
    { senderAddress: senderOf(acct) },
  );
  // แยก "ติดที่ค่าระดับร้าน" ออกจาก "ข้อมูลผู้รับของออเดอร์นี้ขาด" (แก้คนละที่)
  const needsFix = !eligibility.eligible && eligibility.kind === "NEEDS_FIX";
  const addr = (order.shippingAddress as DeepAddress | null) ?? {};

  const ctx: ShipmentContext = {
    orderId,
    createMode: acct.createMode,
    shipment: null, // ใส่ด้วย Json ด้านล่าง (ใช้ view ที่ผ่านด่านข้อความไทยแล้ว)
    blockedBy: needsFix && eligibility.field === "SENDER" ? { kind: "SENDER", missing: eligibility.missing } : null,
    missingReceiver: needsFix && eligibility.field === "RECEIVER" ? eligibility.missing : [],
    receiver: {
      name: order.buyerName, phone: order.buyerContact, line1: addr.line1 ?? null,
      subdistrict: addr.subdistrict ?? null, district: addr.district ?? null,
      province: addr.province ?? null, postcode: addr.postcode ?? null,
    },
    sender: senderOf(acct),
    // 🛑 ฟังก์ชันตัวเดียวกับที่ createShipment ใช้ — เลขบนฟอร์มต้องเป็นเลขที่ยิงออกไปจริง
    codSuggested: resolveDefaultCodAmount({ orderPaymentMethod: order.paymentMethod, orderTotal: Number(order.totalAmount) }),
    items: order.items.map((it) => ({ id: it.id, name: it.name, qty: it.qty, price: Number(it.price) })),
    defaults: {
      courierCode: null, // Flash ไม่มีตัวเลือกขนส่ง
      weight: acct.defaultWeight != null ? Number(acct.defaultWeight) : null,
      width: acct.defaultWidth != null ? Number(acct.defaultWidth) : null, length: acct.defaultLength != null ? Number(acct.defaultLength) : null, height: acct.defaultHeight != null ? Number(acct.defaultHeight) : null,
      categoryId: acct.defaultCategoryId, remark: acct.defaultRemark,
      optOnTime: acct.optOnTime, optBoxShield: acct.optBoxShield, optIsInsured: acct.optIsInsured,
      optProductValue: acct.optProductValue != null ? Number(acct.optProductValue) : null,
    },
  };

  return {
    ...toShipmentContextJson(ctx),
    shipment,
    flashState: "READY",
    provider: FLASH,
    labelSize: acct.labelSize === "SMALL" ? "SMALL" : "BIG",
    createMode: acct.createMode as "AUTO" | "ASK" | "OFF",
    activeElsewhere,
    // ผู้รับขาดกรอกในฟอร์มได้ จึงไม่ขวาง · ขวางเฉพาะผู้ส่งไม่ครบ หรือมีใบ (ไม่ถูกยกเลิก) ของผู้ให้บริการใดอยู่แล้ว
    canShip: !(needsFix && eligibility.field === "SENDER") && !latest,
  };
}
