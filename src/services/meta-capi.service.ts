// feature 00089 — ใส่เหตุการณ์ลงคิวส่ง Meta CAPI (FR-008 · BR-CAPI-01/03)
//
// 🛑 caller ต้องเรียกเฉพาะฝั่งที่เขียนสำเร็จ (count > 0) และส่ง tx เดียวกับธุรกิจถ้ามี —
// ฟังก์ชันนี้แค่ INSERT ลงคิว ไม่เรียก Meta (ตัวส่งอยู่ใน sweepMetaCapi)
import type { Prisma, PrismaClient } from "@prisma/client";
import { isMetaCapiEnabled } from "@/lib/meta-capi/gate";
import { eventsForTrigger, type OrderTrigger, type PurchaseAt } from "@/lib/meta-capi/triggers";
import { CAPI_EVENTS, type CapiEventKey } from "@/lib/meta-capi/events";
import { buildCapiBody, orderValue, type ValueMode } from "@/lib/meta-capi/payload";
import { classifySendResult } from "@/lib/meta-capi/classify";
import { GRAPH_BASE } from "@/lib/facebook/constants";
import { decryptToken } from "@/lib/token-crypto";
import { prisma } from "@/lib/prisma";
import { tagNameKey } from "@/lib/shop-tag-match";
import { isOrderUnpaid } from "@/lib/order-payment-state";
import { pushMetaCapiStopped } from "@/services/seller-push.service";
import { markOrderPurchaserAfterCommit } from "@/services/meta-audience.service";

type Db = PrismaClient | Prisma.TransactionClient;

export interface EventOption {
  valueMode?: ValueMode;
  sendContents?: boolean;
  rules?: { tagId: string; valueBaht?: number }[];
}
export type EventOptions = Partial<Record<CapiEventKey, EventOption>>;

const HAS_VALUE = new Set(CAPI_EVENTS.filter((e) => e.hasValue).map((e) => e.key));

/** ห้อง Messenger ที่มี PSID + เพจเปิดส่ง (หลัง enabledAt) — ไม่ผ่านข้อใด = null */
async function resolveTarget(db: Db, shopId: string, conversationId: string, at: Date) {
  if (!isMetaCapiEnabled(shopId)) return null;
  const conv = await db.conversation.findUnique({
    where: { id: conversationId },
    select: {
      shopId: true, channel: true, shopChannelId: true,
      shopChannel: { select: { externalId: true } },
      externalContact: { select: { externalUserId: true } },
    },
  });
  if (!conv || conv.shopId !== shopId || conv.channel !== "MESSENGER" || !conv.shopChannelId) return null;
  const psid = conv.externalContact?.externalUserId;
  const pageId = conv.shopChannel?.externalId;
  if (!psid || !pageId) return null;
  const setting = await db.metaCapiPageSetting.findUnique({ where: { shopChannelId: conv.shopChannelId } });
  if (!setting?.enabled || !setting.enabledAt || setting.enabledAt > at) return null;
  return { shopChannelId: conv.shopChannelId, psid, pageId, setting };
}

/** เข้าคิว 1 แถวต่อ (dataset ที่เปิดเหตุการณ์ × เหตุการณ์) · คีย์ซ้ำ = ข้ามเงียบ (ON CONFLICT DO NOTHING) */
async function insertRows(
  db: Db,
  t: { shopId: string; shopChannelId: string; conversationId: string; psid: string; pageId: string },
  events: { key: CapiEventKey; dedupeKey: string; payload: Prisma.InputJsonValue }[],
  at: Date,
) {
  if (!events.length) return;
  const datasets = await db.metaCapiDataset.findMany({
    where: { shopChannelId: t.shopChannelId, events: { hasSome: events.map((e) => e.key) } },
    select: { id: true, events: true },
  });
  const data = datasets.flatMap((ds) =>
    events
      .filter((e) => ds.events.includes(e.key))
      .map((e) => ({
        shopId: t.shopId, datasetRowId: ds.id, conversationId: t.conversationId, eventKey: e.key,
        dedupeKey: e.dedupeKey, eventTime: at, pageId: t.pageId, psid: t.psid, payload: e.payload,
      })),
  );
  if (data.length) await db.metaCapiEvent.createMany({ data, skipDuplicates: true });
}

type PayloadOrder = {
  id: string;
  totalAmount: Prisma.Decimal;
  vatAmount: Prisma.Decimal | null;
  items: { id: string; productId: string | null; qty: number; price: Prisma.Decimal }[];
};

/** ยอด + สินค้าตามตัวเลือกของเหตุการณ์ (FR-007) — ตัวเดียวทั้งขั้นออเดอร์และ CartAbandoned */
function orderPayload(order: PayloadOrder, key: CapiEventKey, eventOptions: Prisma.JsonValue): Prisma.InputJsonValue {
  if (!HAS_VALUE.has(key)) return { orderId: order.id };
  const o = ((eventOptions ?? {}) as EventOptions)[key] ?? {};
  return {
    value: orderValue(order, o.valueMode ?? "NET"),
    orderId: order.id,
    ...(o.sendContents
      ? { items: order.items.map((i) => ({ id: i.productId ?? i.id, quantity: i.qty, price: Number(i.price) })) }
      : {}),
  };
}

export async function enqueueOrderCapi(db: Db, orderId: string, trigger: OrderTrigger, at = new Date()) {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      shopId: true, conversationId: true, isDryRun: true, status: true, totalAmount: true, vatAmount: true,
      items: { select: { id: true, productId: true, qty: true, price: true } },
    },
  });
  if (!order?.conversationId || order.isDryRun) return;
  // ยกเลิกแล้ว = ไม่ส่งอะไรนอกจาก OrderCanceled เอง (กันเงินเข้าทีหลัง เช่น COD ปิดยอด กลายเป็น Purchase)
  if (order.status === "CANCELLED" && trigger !== "CANCELED") return;
  const t = await resolveTarget(db, order.shopId, order.conversationId, at);
  if (!t) return;

  const keys = eventsForTrigger(trigger, {
    purchaseAt: t.setting.purchaseAt as PurchaseAt,
    countPromotedDraft: t.setting.countPromotedDraft,
  });
  const events = keys.map((key) => ({
    key,
    dedupeKey: `${key.toLowerCase()}:${orderId}`,
    payload: orderPayload({ id: orderId, ...order }, key, t.setting.eventOptions),
  }));
  await insertRows(db, { shopId: order.shopId, conversationId: order.conversationId, ...t }, events, at);
}

/** เรียกหลัง commit ของธุรกิจ — ไม่ throw: ส่ง Meta ไม่ได้ต้องไม่ทำให้สร้างออเดอร์/ติดแท็กล้ม (PRD 3.5/3.6)
 *  shortcut: process ตายระหว่าง commit กับบรรทัดนี้ = เหตุการณ์หาย 1 ตัว — ยอมรับได้เพราะ Meta ไม่ใช่บัญชีเงิน */
export async function enqueueOrderCapiAfterCommit(orderId: string, trigger: OrderTrigger) {
  try {
    await enqueueOrderCapi(prisma, orderId, trigger);
  } catch (e) {
    console.error("[meta-capi] enqueue failed", { orderId, trigger, error: e instanceof Error ? e.message : String(e) });
  }
  // 00092 — จุดเรียกเดียวกับ CAPI ⇒ จังหวะ Purchase ตรงกันโดยโครงสร้าง (HR16) · ตัวนี้ไม่ throw เอง
  await markOrderPurchaserAfterCommit(orderId, trigger);
}

const bkkDate = (d: Date) => new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 10); // ระบบใช้เวลาไทยเท่านั้น

/** การ์ดในห้องแชทส่งถึง Meta สำเร็จ → InitiateCheckout / ViewContent (FR-009)
 *  เรียกหลังแถว ChatMessage ปิดเป็น SENT · ไม่ throw (ส่ง Meta ไม่ได้ต้องไม่กระทบแชท) */
export async function enqueueSentMessageCapi(messageId: string, at = new Date()) {
  try {
    const m = await prisma.chatMessage.findUnique({
      where: { id: messageId },
      select: {
        type: true, deliveryStatus: true, conversationId: true, orderRefToken: true, productRefId: true, productRefIds: true,
        conversation: { select: { shopId: true } },
      },
    });
    if (!m || m.deliveryStatus !== "SENT" || !m.conversation) return;
    const shopId = m.conversation.shopId;
    const t = await resolveTarget(prisma, shopId, m.conversationId, at);
    if (!t) return;

    if (m.type === "ORDER" && m.orderRefToken) {
      const order = await prisma.order.findFirst({ where: { publicToken: m.orderRefToken, shopId }, select: { id: true, isDryRun: true } });
      if (!order || order.isDryRun) return;
      await insertRows(prisma, { shopId, conversationId: m.conversationId, ...t },
        [{ key: "INITIATE_CHECKOUT", dedupeKey: `initiate_checkout:${order.id}`, payload: { orderId: order.id } }], at);
    } else if (m.type === "PRODUCT") {
      const ids = [...new Set([...(m.productRefIds ?? []), ...(m.productRefId ? [m.productRefId] : [])])];
      if (!ids.length) return;
      const products = await prisma.product.findMany({ where: { id: { in: ids }, shopId }, select: { id: true, price: true } });
      const day = bkkDate(at);
      await insertRows(prisma, { shopId, conversationId: m.conversationId, ...t },
        products.map((p) => ({
          key: "VIEW_CONTENT" as const,
          dedupeKey: `view_content:${m.conversationId}:${p.id}:${day}`,
          // ViewContent แนบสินค้าเสมอ (ตาม gochat) — ไม่ขึ้นกับสวิตช์แนบสินค้า
          payload: { value: Number(p.price), items: [{ id: p.id, quantity: 1, price: Number(p.price) }] },
        })), at);
    }
  } catch (e) {
    console.error("[meta-capi] enqueue message failed", { messageId, error: e instanceof Error ? e.message : String(e) });
  }
}

const LEAD_KEYS = ["LEAD_SUBMITTED", "QUALIFIED_LEAD"] as const;
const LEAD_WINDOW_MS = 30 * 864e5;

/** ห้องถูกติดแท็กใหม่ → LeadSubmitted/QualifiedLead ตามกฎของร้าน (FR-010)
 *  addedTagNames = เฉพาะแท็กที่ **เพิ่งติด** (caller เทียบก่อน/หลังเอง) · ไม่ throw: ติดแท็กต้องไม่ล้มเพราะเรา
 *  shortcut: ติดแท็กพร้อมกันสองทางในเสี้ยววินาทีเดียวอาจผ่านด่าน 30 วันทั้งคู่ — ยอมรับได้ (Meta ไม่ใช่บัญชีเงิน) */
export async function enqueueTagLeadCapi(conversationId: string, addedTagNames: string[], at = new Date()) {
  try {
    if (!addedTagNames.length) return;
    const conv = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { shopId: true } });
    if (!conv) return;
    const t = await resolveTarget(prisma, conv.shopId, conversationId, at);
    if (!t) return;
    const opts = (t.setting.eventOptions ?? {}) as EventOptions;
    const rules = LEAD_KEYS.flatMap((key) => (opts[key]?.rules ?? []).map((r) => ({ key, ...r })));
    if (!rules.length) return;

    const added = new Set(addedTagNames.map(tagNameKey));
    const tags = await prisma.shopTag.findMany({
      where: { shopId: conv.shopId, id: { in: rules.map((r) => r.tagId) } },
      select: { id: true, nameKey: true },
    });
    const hit = new Set(tags.filter((tg) => added.has(tg.nameKey)).map((tg) => tg.id));

    for (const r of rules.filter((r) => hit.has(r.tagId))) {
      const prefix = `${r.key.toLowerCase()}:${conversationId}:${r.tagId}:`;
      const recent = await prisma.metaCapiEvent.findFirst({
        where: { conversationId, eventKey: r.key, dedupeKey: { startsWith: prefix }, createdAt: { gt: new Date(at.getTime() - LEAD_WINDOW_MS) } },
        select: { id: true },
      });
      if (recent) continue;
      await insertRows(prisma, { shopId: conv.shopId, conversationId, ...t },
        [{ key: r.key, dedupeKey: `${prefix}${at.getTime()}`, payload: r.valueBaht !== undefined ? { value: r.valueBaht } : {} }], at);
    }
  } catch (e) {
    console.error("[meta-capi] enqueue lead failed", { conversationId, error: e instanceof Error ? e.message : String(e) });
  }
}

/** การ์ดคำสั่งซื้อส่งแล้ว 24–72 ชม. แต่ออเดอร์ยังรอ ไม่ชำระเลย ไม่มีสลิป → CartAbandoned ครั้งเดียวต่อการ์ด (FR-009)
 *  เรียกจาก cron ทุก 1 นาที · การ์ดที่ส่งก่อนร้านเปิดการส่งไม่นับ (เทียบ enabledAt กับเวลาส่งการ์ด) */
export async function sweepCartAbandoned(opts: { now?: Date; shopIds?: string[] } = {}) {
  const now = opts.now ?? new Date();
  const cards = await prisma.chatMessage.findMany({
    where: {
      type: "ORDER",
      deliveryStatus: "SENT",
      orderRefToken: { not: null },
      createdAt: { gte: new Date(now.getTime() - 72 * 3600_000), lte: new Date(now.getTime() - 24 * 3600_000) },
      conversation: {
        channel: "MESSENGER",
        shopChannel: { metaCapiSetting: { enabled: true }, metaCapiDatasets: { some: { events: { has: "CART_ABANDONED" } } } },
        ...(opts.shopIds ? { shopId: { in: opts.shopIds } } : {}),
      },
    },
    select: { id: true, createdAt: true, conversationId: true, orderRefToken: true, conversation: { select: { shopId: true } } },
    orderBy: { createdAt: "asc" },
    take: 500,
  });
  // การ์ดอยู่ในช่วง 24–72 ชม. นานสองวัน — ข้ามใบที่เข้าคิวไปแล้ว ไม่งั้นทุกนาทีวนตรวจชุดเดิม
  const done = new Set(
    (await prisma.metaCapiEvent.findMany({
      where: { eventKey: "CART_ABANDONED", dedupeKey: { in: cards.map((c) => `cart_abandoned:${c.id}`) } },
      select: { dedupeKey: true },
    })).map((r) => r.dedupeKey),
  );
  let queued = 0;
  for (const c of cards) {
    if (done.has(`cart_abandoned:${c.id}`)) continue;
    const shopId = c.conversation.shopId;
    const order = await prisma.order.findFirst({
      where: { publicToken: c.orderRefToken!, shopId, status: "PENDING", slipFileId: null, isDryRun: false },
      select: {
        id: true, totalAmount: true, vatAmount: true, paymentConfirmedAt: true, codReceivedAt: true,
        payments: { select: { kind: true, amount: true, voidedAt: true } },
        items: { select: { id: true, productId: true, qty: true, price: true } },
      },
    });
    if (!order || !isOrderUnpaid(order)) continue;
    const t = await resolveTarget(prisma, shopId, c.conversationId, c.createdAt);
    if (!t) continue;
    await insertRows(prisma, { shopId, conversationId: c.conversationId, ...t },
      [{ key: "CART_ABANDONED", dedupeKey: `cart_abandoned:${c.id}`, payload: orderPayload(order, "CART_ABANDONED", t.setting.eventOptions) }], now);
    queued++;
  }
  return queued;
}

// ─── ตัวส่ง (FR-011/012) — เรียกจาก cron ทุก 1 นาที ───────────────────────────────────────

const RETRY_DELAYS_MS = [60_000, 300_000]; // ครั้งที่ 1 → 1 นาที · ครั้งที่ 2 → 5 นาที · ครั้งที่ 3 ล้ม = FAILED
const MAX_ATTEMPTS = 3;
const MAX_AGE_MS = 7 * 864e5; // Meta ไม่รับเหตุการณ์เก่ากว่า 7 วัน (BR-CAPI-07)
const STALE_LOCK_MS = 3 * 60_000;
const LOG_LIMIT = 4000;

const EVENT_NAME = Object.fromEntries(CAPI_EVENTS.map((e) => [e.key, e.metaName])) as Record<string, string>;

/** ตัดขนาดก่อนเก็บลงแถว — ไม่มี token อยู่ใน body เพราะส่งผ่าน header */
const clip = (v: unknown): Prisma.InputJsonValue => {
  const s = JSON.stringify(v ?? null);
  return (s.length > LOG_LIMIT ? { truncated: s.slice(0, LOG_LIMIT) } : (v ?? null)) as Prisma.InputJsonValue;
};

export async function sweepMetaCapi(opts: {
  now?: Date;
  fetchImpl?: typeof fetch;
  limit?: number;
  /** จำกัดร้าน — ใช้ในเทสให้ไม่ไปแตะแถวของร้านอื่นในฐานที่ใช้ร่วม */
  shopIds?: string[];
} = {}) {
  const now = opts.now ?? new Date();
  const doFetch = opts.fetchImpl ?? fetch;

  const due = await prisma.metaCapiEvent.findMany({
    where: {
      status: "PENDING",
      nextAttemptAt: { lte: now },
      OR: [{ lockedAt: null }, { lockedAt: { lt: new Date(now.getTime() - STALE_LOCK_MS) } }],
      dataset: { status: "ACTIVE" },
      ...(opts.shopIds ? { shopId: { in: opts.shopIds } } : {}),
    },
    orderBy: { nextAttemptAt: "asc" },
    take: opts.limit ?? 100,
    select: { id: true, shopId: true, lockedAt: true, datasetRowId: true },
  });
  const sum = { sent: 0, failed: 0, retried: 0, stopped: 0, skipped: 0 };
  const stoppedNow = new Set<string>(); // dataset ที่เพิ่งหยุดในรอบนี้ — แถวที่เหลือในรายการห้ามยิงต่อ

  for (const d of due) {
    if (!isMetaCapiEnabled(d.shopId)) continue; // เอาร้านออกจากรายชื่อทดลอง = แถวค้างไม่ส่ง (FR-001)
    if (stoppedNow.has(d.datasetRowId)) continue;
    // จองแถวแบบมีเงื่อนไข — ตัวส่งสองตัวชนกัน ตัวที่แพ้ได้ count 0
    const claimed = await prisma.metaCapiEvent.updateMany({
      where: { id: d.id, status: "PENDING", lockedAt: d.lockedAt },
      data: { lockedAt: now },
    });
    if (claimed.count === 0) continue;

    const row = await prisma.metaCapiEvent.findUniqueOrThrow({
      where: { id: d.id },
      include: { dataset: { include: { shopChannel: { select: { accessTokenEnc: true, name: true } } } } },
    });

    if (now.getTime() - row.eventTime.getTime() > MAX_AGE_MS) {
      await prisma.metaCapiEvent.update({ where: { id: row.id }, data: { status: "SKIPPED", reason: "TOO_OLD", lockedAt: null } });
      sum.skipped++;
      continue;
    }

    const ds = row.dataset;
    const payload = (row.payload ?? {}) as { value?: number; orderId?: string; items?: { id: string; quantity: number; price: number }[] };
    const body = buildCapiBody({
      eventName: EVENT_NAME[row.eventKey] ?? row.eventKey,
      eventTime: row.eventTime,
      pageId: row.pageId,
      psid: row.psid,
      value: payload.value,
      orderId: payload.orderId,
      items: payload.items,
      eventId: row.dedupeKey,
    });

    let httpStatus = 0;
    let resJson: unknown = null;
    try {
      const token = decryptToken(ds.source === "MANUAL" ? ds.tokenEnc ?? "" : ds.shopChannel.accessTokenEnc);
      const res = await doFetch(`${GRAPH_BASE}/${ds.datasetId}/events`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      httpStatus = res.status;
      resJson = await res.json().catch(() => null);
    } catch (e) {
      resJson = { error: { message: e instanceof Error ? e.message : String(e) } };
    }

    const outcome = classifySendResult(httpStatus, resJson);
    const log = { lastHttpStatus: httpStatus, lastRequest: clip(body), lastResponse: clip(resJson), lockedAt: null };

    if (outcome === "STOP") {
      // หยุดทั้ง dataset · แถวนี้กลับไปรอโดยไม่นับครั้ง — เชื่อมใหม่แล้วส่งต่อได้ (FR-012)
      stoppedNow.add(ds.id);
      const [flipped] = await prisma.$transaction([
        prisma.metaCapiDataset.updateMany({
          where: { id: ds.id, status: "ACTIVE" },
          data: { status: "STOPPED", stoppedAt: now, stoppedReason: String((resJson as { error?: { message?: string } })?.error?.message ?? httpStatus).slice(0, 300) },
        }),
        prisma.metaCapiEvent.update({ where: { id: row.id }, data: { ...log, reason: "TOKEN_OR_PERMISSION" } }),
      ]);
      // แจ้งครั้งเดียวตอน ACTIVE → STOPPED (แถวอื่นของ dataset เดียวกันในรอบนี้ได้ count 0)
      if (flipped.count === 1) await pushMetaCapiStopped({ shopId: row.shopId, channelName: ds.shopChannel.name });
      sum.stopped++;
      continue;
    }

    const attempts = row.attempts + 1;
    if (outcome === "OK") {
      await prisma.metaCapiEvent.update({ where: { id: row.id }, data: { ...log, attempts, status: "SENT", sentAt: now, reason: null } });
      sum.sent++;
    } else if (outcome === "RETRY" && attempts < MAX_ATTEMPTS) {
      await prisma.metaCapiEvent.update({
        where: { id: row.id },
        data: { ...log, attempts, nextAttemptAt: new Date(now.getTime() + RETRY_DELAYS_MS[attempts - 1]), reason: "RETRYING" },
      });
      sum.retried++;
    } else {
      await prisma.metaCapiEvent.update({ where: { id: row.id }, data: { ...log, attempts, status: "FAILED", reason: outcome === "RETRY" ? "MAX_ATTEMPTS" : "REJECTED" } });
      sum.failed++;
    }
  }
  return sum;
}

