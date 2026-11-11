// feature 00089 — ตั้งค่า Meta CAPI ต่อเพจ (FR-002..004) · ทุกฟังก์ชันรับ shopId จาก session แล้วเช็คว่าช่องเป็นของร้านนั้นจริง
//
// 🛑 tokenEnc ห้ามออกจากไฟล์นี้ — ทางออกทั้งหมดผ่าน toPublic() ที่แปลงเป็น hasToken
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isMetaCapiEnabled } from "@/lib/meta-capi/gate";
import { CAPI_EVENTS, SELECTABLE_EVENTS, type CapiEventKey } from "@/lib/meta-capi/events";
import { buildCapiBody } from "@/lib/meta-capi/payload";
import { classifySendResult } from "@/lib/meta-capi/classify";
import { GRAPH_BASE } from "@/lib/facebook/constants";
import { decryptToken, encryptToken } from "@/lib/token-crypto";
import type { EventOptions } from "@/services/meta-capi.service";

export type CapiErrorCode =
  | "FEATURE_DISABLED" | "NOT_FOUND" | "INVALID_INPUT" | "TOKEN_REQUIRED" | "DATASET_LIMIT" | "DATASET_DUPLICATE"
  | "PAGE_EVENTS_PERMISSION" | "META_ERROR" | "NO_CONVERSATION";

export class CapiError extends Error {
  constructor(readonly code: CapiErrorCode, message?: string) {
    super(message ?? code);
    this.name = "CapiError";
  }
}

const MAX_DATASETS = 3;
const EVENT_KEYS = new Set<string>(CAPI_EVENTS.map((e) => e.key));
const SELECTABLE_KEYS = new Set<string>(SELECTABLE_EVENTS.map((e) => e.key));
const LEAD_KEYS = new Set<string>(["LEAD_SUBMITTED", "QUALIFIED_LEAD"]);
const PURCHASE_AT = new Set(["CREATE", "CONFIRM", "PAYMENT"]);
const MAX_RULES = 20;
const MAX_VALUE_BAHT = 10_000_000;

const gate = (shopId: string) => {
  if (!isMetaCapiEnabled(shopId)) throw new CapiError("FEATURE_DISABLED");
};

/** ช่อง Messenger ที่ ACTIVE ของร้านนี้เท่านั้น — ของร้านอื่น/IG/ตัดการเชื่อมแล้ว = NOT_FOUND (ไม่บอกว่ามีอยู่) */
async function loadChannel(shopId: string, channelId: string) {
  const ch = await prisma.shopChannel.findFirst({
    // TOKEN_INVALID ต้องเห็นด้วย — เป็นกรณีที่ร้านต้องเข้ามาแก้พอดี (เฉพาะ DISCONNECTED ที่ซ่อน)
    where: { id: channelId, shopId, provider: "MESSENGER", status: { not: "DISCONNECTED" } },
    select: { id: true, externalId: true, name: true, avatarUrl: true },
  });
  if (!ch) throw new CapiError("NOT_FOUND", "ไม่พบเพจ");
  return ch;
}

async function loadDataset(shopId: string, channelId: string, rowId: string) {
  const ds = await prisma.metaCapiDataset.findFirst({ where: { id: rowId, shopId, shopChannelId: channelId } });
  if (!ds) throw new CapiError("NOT_FOUND", "ไม่พบ dataset");
  return ds;
}

type DatasetRow = Prisma.MetaCapiDatasetGetPayload<object>;
const toPublic = (r: DatasetRow) => ({
  id: r.id, datasetId: r.datasetId, source: r.source, label: r.label,
  events: r.events, status: r.status, stoppedReason: r.stoppedReason, stoppedAt: r.stoppedAt, hasToken: r.tokenEnc !== null,
});
export type CapiDatasetView = ReturnType<typeof toPublic>;

const DEFAULT_SETTING = { enabled: false, enabledAt: null as Date | null, purchaseAt: "CREATE", countPromotedDraft: true };
type SettingRow = Prisma.MetaCapiPageSettingGetPayload<object> | null;
const settingView = (s: SettingRow) =>
  s
    ? { enabled: s.enabled, enabledAt: s.enabledAt, purchaseAt: s.purchaseAt, countPromotedDraft: s.countPromotedDraft }
    : DEFAULT_SETTING;

// ─── อ่าน ────────────────────────────────────────────────────────────────────────────────

export async function listCapiPages(shopId: string) {
  gate(shopId);
  const channels = await prisma.shopChannel.findMany({
    where: { shopId, provider: "MESSENGER", status: { not: "DISCONNECTED" } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true, name: true, avatarUrl: true,
      metaCapiSetting: true,
      metaCapiDatasets: { select: { status: true } },
    },
  });
  const since = new Date(Date.now() - 7 * 864e5);
  return Promise.all(
    channels.map(async (c) => ({
      channelId: c.id,
      name: c.name,
      avatarUrl: c.avatarUrl,
      setting: settingView(c.metaCapiSetting),
      datasets: c.metaCapiDatasets.length,
      anyStopped: c.metaCapiDatasets.some((d) => d.status === "STOPPED"),
      sent7d: await prisma.metaCapiEvent.count({
        where: { shopId, status: "SENT", createdAt: { gte: since }, dataset: { shopChannelId: c.id } },
      }),
    })),
  );
}

export async function getCapiPage(shopId: string, channelId: string) {
  gate(shopId);
  const ch = await loadChannel(shopId, channelId);
  const [setting, datasets] = await Promise.all([
    prisma.metaCapiPageSetting.findUnique({ where: { shopChannelId: channelId } }),
    prisma.metaCapiDataset.findMany({ where: { shopId, shopChannelId: channelId }, orderBy: { createdAt: "asc" } }),
  ]);
  return {
    channelId: ch.id, name: ch.name, avatarUrl: ch.avatarUrl,
    setting: settingView(setting),
    eventOptions: ((setting?.eventOptions ?? {}) as EventOptions),
    datasets: datasets.map(toPublic),
  };
}

// ─── ตั้งค่าเพจ ──────────────────────────────────────────────────────────────────────────

const bad = (msg: string) => new CapiError("INVALID_INPUT", msg);

/** ตรวจ + ล้างให้เหลือเฉพาะฟิลด์ที่รู้จัก (กัน JSON ขยะลงฐาน) · แท็กต้องเป็นของร้านนี้ */
async function sanitizeEventOptions(shopId: string, raw: unknown): Promise<EventOptions> {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) throw bad("ตัวเลือกเหตุการณ์ไม่ถูกต้อง");
  const out: Record<string, unknown> = {};
  const tagIds = new Set<string>();
  for (const [key, o] of Object.entries(raw as Record<string, unknown>)) {
    if (!EVENT_KEYS.has(key)) throw bad(`ไม่รู้จักเหตุการณ์ ${key}`);
    if (o === null || typeof o !== "object" || Array.isArray(o)) throw bad("ตัวเลือกเหตุการณ์ไม่ถูกต้อง");
    const { valueMode, sendContents, rules } = o as { valueMode?: unknown; sendContents?: unknown; rules?: unknown };
    const clean: Record<string, unknown> = {};
    if (valueMode !== undefined) {
      if (valueMode !== "NET" && valueMode !== "NO_VAT") throw bad("วิธีคิดยอดต้องเป็น NET หรือ NO_VAT");
      clean.valueMode = valueMode;
    }
    if (sendContents !== undefined) {
      if (typeof sendContents !== "boolean") throw bad("สวิตช์แนบสินค้าไม่ถูกต้อง");
      clean.sendContents = sendContents;
    }
    if (rules !== undefined) {
      if (!LEAD_KEYS.has(key)) throw bad("กฎแท็กใช้ได้เฉพาะผู้สนใจ/ผู้สนใจที่มีคุณภาพ");
      if (!Array.isArray(rules) || rules.length > MAX_RULES) throw bad(`กฎแท็กต่อเหตุการณ์ได้ไม่เกิน ${MAX_RULES} ข้อ`);
      clean.rules = rules.map((r) => {
        const { tagId, valueBaht } = (r ?? {}) as { tagId?: unknown; valueBaht?: unknown };
        if (typeof tagId !== "string" || !tagId) throw bad("กฎแท็กต้องระบุแท็ก");
        if (valueBaht !== undefined && (typeof valueBaht !== "number" || !Number.isFinite(valueBaht) || valueBaht < 0 || valueBaht > MAX_VALUE_BAHT))
          throw bad("มูลค่าต้องอยู่ระหว่าง 0 ถึง 10,000,000 บาท");
        tagIds.add(tagId);
        return { tagId, ...(valueBaht !== undefined ? { valueBaht } : {}) };
      });
    }
    out[key] = clean;
  }
  if (tagIds.size) {
    // แท็กที่ไม่ใช่ของร้านนี้ (รวมแท็กที่ถูกลบไปแล้ว) = ตัดกฎนั้นทิ้ง ไม่ปฏิเสธทั้งก้อน —
    // ไม่งั้นลบแท็กครั้งเดียว ร้านจะบันทึกตัวเลือกอื่นของเพจนี้ไม่ได้อีกเลย (กฎค้าง id เดิมอยู่ใน eventOptions)
    const owned = new Set(
      (await prisma.shopTag.findMany({ where: { shopId, id: { in: [...tagIds] } }, select: { id: true } })).map((t) => t.id),
    );
    for (const o of Object.values(out) as { rules?: { tagId: string }[] }[])
      if (o.rules) o.rules = o.rules.filter((r) => owned.has(r.tagId));
  }
  return out as EventOptions;
}

export interface UpdateCapiPageInput {
  enabled?: boolean;
  purchaseAt?: "CREATE" | "CONFIRM" | "PAYMENT";
  countPromotedDraft?: boolean;
  eventOptions?: EventOptions;
}

export async function updateCapiPage(shopId: string, channelId: string, input: UpdateCapiPageInput) {
  gate(shopId);
  await loadChannel(shopId, channelId);
  if (input.purchaseAt !== undefined && !PURCHASE_AT.has(input.purchaseAt)) throw bad("จังหวะ Purchase ไม่ถูกต้อง");
  const eventOptions = input.eventOptions !== undefined ? await sanitizeEventOptions(shopId, input.eventOptions) : undefined;

  const existing = await prisma.metaCapiPageSetting.findUnique({ where: { shopChannelId: channelId } });
  // เปิดครั้งแรก/เปิดใหม่ = เริ่มนับจากตอนนี้ ไม่ย้อนส่งของเก่า (FR-002) — บันทึกซ้ำขณะเปิดอยู่ไม่ขยับ
  const turningOn = input.enabled === true && !existing?.enabled;
  const data = {
    ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
    ...(turningOn ? { enabledAt: new Date() } : {}),
    ...(input.purchaseAt !== undefined ? { purchaseAt: input.purchaseAt } : {}),
    ...(input.countPromotedDraft !== undefined ? { countPromotedDraft: input.countPromotedDraft } : {}),
    ...(eventOptions !== undefined ? { eventOptions: eventOptions as Prisma.InputJsonValue } : {}),
  };
  const row = await prisma.metaCapiPageSetting.upsert({
    where: { shopChannelId: channelId },
    create: { shopId, shopChannelId: channelId, ...data },
    update: data,
  });
  return { ...settingView(row), eventOptions: (row.eventOptions ?? {}) as EventOptions };
}

// ─── dataset ─────────────────────────────────────────────────────────────────────────────

export interface AddCapiDatasetInput {
  source: "PAGE" | "MANUAL";
  datasetId?: string;
  token?: string;
  label?: string | null;
  events?: CapiEventKey[];
}

function cleanEvents(events: unknown): CapiEventKey[] {
  if (!Array.isArray(events) || events.some((e) => typeof e !== "string" || !SELECTABLE_KEYS.has(e))) throw bad("รายการเหตุการณ์ไม่ถูกต้อง");
  return [...new Set(events)] as CapiEventKey[];
}
const cleanText = (s: string | null | undefined, max: number) => {
  const t = (s ?? "").trim();
  if (t.length > max) throw bad(`ข้อความยาวเกิน ${max} ตัวอักษร`);
  return t || null;
};

/** id ของ Meta (เพจ/dataset) — ตัวเลขล้วน ใช้ต่อใน URL path ของ Graph */
const META_ID = /^\d{1,32}$/;
const MAX_TOKEN = 512;

const graphMsg = (j: unknown) => (j as { error?: { message?: string } } | null)?.error?.message;

export async function addCapiDataset(shopId: string, channelId: string, input: AddCapiDatasetInput, fetchImpl?: typeof fetch) {
  gate(shopId);
  const ch = await loadChannel(shopId, channelId);
  const events = input.events !== undefined ? cleanEvents(input.events) : (["PURCHASE"] as CapiEventKey[]);
  const label = cleanText(input.label, 60);
  // shortcut: นับแล้วค่อยสร้าง ไม่ล็อก — กดพร้อมกันสองคำขออาจเกิน 3 ได้ในเสี้ยววินาที (หน้าจอเจ้าของคนเดียว) · อัปเกรดเมื่อมีหลายผู้ใช้
  if ((await prisma.metaCapiDataset.count({ where: { shopChannelId: channelId } })) >= MAX_DATASETS) throw new CapiError("DATASET_LIMIT", "เพิ่ม dataset ได้สูงสุด 3 ตัวต่อเพจ");

  let datasetId: string;
  let tokenEnc: string | null = null;
  if (input.source === "MANUAL") {
    datasetId = (input.datasetId ?? "").trim();
    if (!META_ID.test(datasetId)) throw bad("Dataset ID ต้องเป็นตัวเลข");
    const token = (input.token ?? "").trim();
    if (!token) throw new CapiError("TOKEN_REQUIRED", "ต้องใส่ token");
    if (token.length > MAX_TOKEN || /\s/.test(token)) throw bad("token ไม่ถูกต้อง");
    tokenEnc = encryptToken(token);
  } else if (input.source === "PAGE") {
    if (!META_ID.test(ch.externalId)) throw new CapiError("META_ERROR", "รหัสเพจไม่ถูกต้อง");
    let pageToken: string;
    try {
      pageToken = decryptToken((await prisma.shopChannel.findUniqueOrThrow({ where: { id: channelId }, select: { accessTokenEnc: true } })).accessTokenEnc);
    } catch {
      throw new CapiError("PAGE_EVENTS_PERMISSION", "token ของเพจใช้ไม่ได้ — เชื่อมเพจใหม่ หรือกรอก Dataset ID กับ token เอง");
    }
    let status = 0;
    let json: unknown = null;
    try {
      const res = await (fetchImpl ?? fetch)(`${GRAPH_BASE}/${ch.externalId}/dataset`, {
        method: "POST",
        headers: { Authorization: `Bearer ${pageToken}`, "Content-Type": "application/json" },
        body: "{}",
      });
      status = res.status;
      json = await res.json().catch(() => null);
    } catch {
      /* status 0 = ต่อ Meta ไม่ติด */
    }
    if (status < 200 || status >= 300) {
      if (classifySendResult(status, json) === "STOP")
        throw new CapiError("PAGE_EVENTS_PERMISSION", "token ของเพจยังไม่มีสิทธิ์ส่งเหตุการณ์ — เชื่อมเพจใหม่ หรือกรอก Dataset ID กับ token เอง");
      throw new CapiError("META_ERROR", graphMsg(json) ?? "Meta ไม่ตอบกลับ ลองใหม่อีกครั้ง");
    }
    const id = (json as { id?: unknown } | null)?.id;
    if (typeof id !== "string" && typeof id !== "number") throw new CapiError("META_ERROR", "Meta ไม่ได้ส่ง Dataset ID กลับมา");
    datasetId = String(id);
    // id ไปต่อใน URL path ของ Graph ทุกรอบส่ง — ตรวจรูปแบบแม้มาจาก Meta (defense-in-depth)
    if (!META_ID.test(datasetId)) throw new CapiError("META_ERROR", "Meta ส่ง Dataset ID ที่ไม่ถูกต้องกลับมา");
  } else {
    throw bad("ชนิด dataset ไม่ถูกต้อง");
  }

  try {
    return toPublic(
      await prisma.metaCapiDataset.create({
        data: { shopId, shopChannelId: channelId, datasetId, source: input.source, tokenEnc, label, events },
      }),
    );
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") throw new CapiError("DATASET_DUPLICATE", "เพจนี้มี Dataset ID นี้แล้ว");
    throw e;
  }
}

export interface UpdateCapiDatasetInput {
  label?: string | null;
  events?: CapiEventKey[];
  token?: string;
}

export async function updateCapiDataset(shopId: string, channelId: string, rowId: string, input: UpdateCapiDatasetInput) {
  gate(shopId);
  await loadChannel(shopId, channelId);
  const ds = await loadDataset(shopId, channelId, rowId);
  const data: Prisma.MetaCapiDatasetUpdateInput = {};
  if (input.label !== undefined) data.label = cleanText(input.label, 60);
  if (input.events !== undefined) data.events = cleanEvents(input.events);
  if (input.token !== undefined) {
    if (ds.source !== "MANUAL") throw bad("dataset ของเพจใช้ token เพจ — เปลี่ยน token ไม่ได้");
    const token = input.token.trim();
    if (!token || token.length > MAX_TOKEN || /\s/.test(token)) throw bad("token ไม่ถูกต้อง");
    if (!token) throw new CapiError("TOKEN_REQUIRED", "ต้องใส่ token");
    // token ใหม่ = ลองส่งต่อได้ทันที (FR-012) — ล้างสถานะหยุด
    Object.assign(data, { tokenEnc: encryptToken(token), status: "ACTIVE", stoppedReason: null, stoppedAt: null });
  }
  return toPublic(await prisma.metaCapiDataset.update({ where: { id: ds.id }, data }));
}

/** เพจเชื่อมใหม่แล้ว (token เพจใหม่) → ให้ dataset แบบ PAGE ส่งต่อ · ไม่เรียก Meta — ถ้ายังไม่มีสิทธิ์ ตัวส่งจะหยุดอีกครั้งเอง */
export async function resumeCapiDataset(shopId: string, channelId: string, rowId: string) {
  gate(shopId);
  await loadChannel(shopId, channelId);
  const ds = await loadDataset(shopId, channelId, rowId);
  if (ds.source !== "PAGE") throw bad("dataset แบบกรอกเองต้องใส่ token ใหม่");
  return toPublic(await prisma.metaCapiDataset.update({ where: { id: ds.id }, data: { status: "ACTIVE", stoppedReason: null, stoppedAt: null } }));
}

export async function deleteCapiDataset(shopId: string, channelId: string, rowId: string) {
  gate(shopId);
  await loadChannel(shopId, channelId);
  const ds = await loadDataset(shopId, channelId, rowId);
  await prisma.metaCapiDataset.delete({ where: { id: ds.id } }); // แถวคิวหายตาม (onDelete: Cascade)
}

// ─── ทดสอบ (FR-004) — ไม่เข้าคิว ไม่เขียน MetaCapiEvent ────────────────────────────────────

export interface CapiTestResult {
  ok: boolean;
  /** true = ส่งได้แต่อ่านโหนดไม่ได้ (บทเรียน gochat: token ที่ส่งได้อาจอ่านโหนดไม่ได้) */
  unverified?: boolean;
  eventsReceived?: number;
  message: string;
}

export async function testCapiDataset(
  shopId: string,
  channelId: string,
  rowId: string,
  /** testEventCode ไม่เก็บลงฐาน (รหัสเป็นของรอบทดสอบใน Events Manager) — ส่งมากับปุ่มกดแต่ละครั้ง */
  input: { testEventCode?: string | null } = {},
  fetchImpl?: typeof fetch,
): Promise<CapiTestResult> {
  gate(shopId);
  const ch = await loadChannel(shopId, channelId);
  const ds = await loadDataset(shopId, channelId, rowId);
  const doFetch = fetchImpl ?? fetch;

  const testEventCode = cleanText(input.testEventCode, 64);
  let psid: string | null = null;
  if (testEventCode) {
    const conv = await prisma.conversation.findFirst({
      where: { shopId, shopChannelId: channelId, channel: "MESSENGER", externalContactId: { not: null } },
      orderBy: { lastMessageAt: "desc" },
      select: { externalContact: { select: { externalUserId: true } } },
    });
    psid = conv?.externalContact?.externalUserId ?? null;
    if (!psid) throw new CapiError("NO_CONVERSATION", "เพจนี้ต้องมีห้องแชทอย่างน้อย 1 ห้องก่อนทดสอบ");
  }

  let token: string;
  try {
    token = decryptToken(
      ds.source === "MANUAL"
        ? (ds.tokenEnc ?? "")
        : (await prisma.shopChannel.findUniqueOrThrow({ where: { id: channelId }, select: { accessTokenEnc: true } })).accessTokenEnc,
    );
  } catch {
    throw new CapiError("META_ERROR", "ถอดรหัส token ไม่ได้ — ใส่ token ใหม่");
  }
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  let status = 0;
  let json: unknown = null;
  const call = async (u: string, init: RequestInit) => {
    try {
      const res = await doFetch(u, { ...init, headers });
      status = res.status;
      json = await res.json().catch(() => null);
    } catch {
      status = 0;
      json = { error: { message: "ต่อ Meta ไม่ติด" } };
    }
  };

  if (psid) {
    const body = buildCapiBody({ eventName: "Purchase", eventTime: new Date(), pageId: ch.externalId, psid, value: 1, testEventCode });
    await call(`${GRAPH_BASE}/${ds.datasetId}/events`, { method: "POST", body: JSON.stringify(body) });
    if (classifySendResult(status, json) === "OK")
      return { ok: true, eventsReceived: (json as { events_received: number }).events_received, message: "ส่งสำเร็จ — ดูผลในแท็บ Test Events ของ Events Manager" };
    return { ok: false, message: `Meta ไม่รับเหตุการณ์ทดสอบ: ${graphMsg(json) ?? `HTTP ${status}`}` };
  }

  await call(`${GRAPH_BASE}/${ds.datasetId}?fields=id`, { method: "GET" });
  if (status >= 200 && status < 300) return { ok: true, message: "token ใช้งานได้ (ไม่ได้ส่งเหตุการณ์ใด ๆ)" };
  const code = (json as { error?: { code?: number } } | null)?.error?.code;
  // 190/102 = token ตายจริง · สิทธิ์อื่น ๆ = อ่านโหนดไม่ได้แต่ยังส่งได้ → ยืนยันไม่ได้ ไม่ใช่ล้ม
  if (code !== 190 && code !== 102 && classifySendResult(status, json) === "STOP")
    return { ok: true, unverified: true, message: "ตรวจ token ไม่ได้ (ไม่มีสิทธิ์อ่าน dataset) แต่อาจส่งเหตุการณ์ได้ — ใส่ Test Event Code เพื่อทดสอบจริง" };
  return { ok: false, message: `token ใช้ไม่ได้: ${graphMsg(json) ?? `HTTP ${status}`}` };
}

// ─── บันทึกการส่ง ────────────────────────────────────────────────────────────────────────

export interface CapiLogQuery {
  status?: "PENDING" | "SENT" | "FAILED" | "SKIPPED";
  eventKey?: CapiEventKey;
  /** id ของแถวสุดท้ายหน้าก่อน (nextCursor) */
  cursor?: string;
  take?: number;
}

export async function listCapiLog(shopId: string, channelId: string, q: CapiLogQuery) {
  gate(shopId);
  await loadChannel(shopId, channelId);
  const take = Math.min(Math.max(Math.trunc(q.take ?? 20) || 20, 1), 50);
  const rows = await prisma.metaCapiEvent.findMany({
    where: {
      shopId,
      dataset: { shopChannelId: channelId },
      ...(q.status ? { status: q.status } : {}),
      ...(q.eventKey ? { eventKey: q.eventKey } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    // ไม่ select psid/lastRequest/lastResponse — เป็นข้อมูลลูกค้า/ดิบ ไม่จำเป็นต่อหน้าจอ
    select: {
      id: true, createdAt: true, eventKey: true, status: true, reason: true, attempts: true, payload: true,
      dataset: { select: { label: true, datasetId: true } },
    },
  });
  const page = rows.slice(0, take);
  return {
    rows: page.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      eventKey: r.eventKey,
      datasetLabel: r.dataset.label,
      datasetId: r.dataset.datasetId,
      value: ((r.payload ?? {}) as { value?: number }).value ?? null,
      status: r.status,
      reason: r.reason,
      attempts: r.attempts,
    })),
    nextCursor: rows.length > take ? page[page.length - 1].id : null,
  };
}
