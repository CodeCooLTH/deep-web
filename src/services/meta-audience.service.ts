// feature 00092 — ส่งรายชื่อลูกค้าที่ซื้อแล้วเข้า Custom Audience ของ Meta
//
// ฝั่งเขียน (hook หลัง commit · ไม่ throw) แค่ "ทำเครื่องหมาย" ตัวตนลูกค้าว่าควรอยู่/ไม่อยู่ใน audience
// ตัวส่งจริง (sweepMetaAudience · cron) เทียบ desired กับ syncedState แล้วส่งเป็นชุด — ไม่ยิง Meta ตอนสร้างออเดอร์
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isMetaAudienceEnabled } from "@/lib/meta-audience/gate";
import { isCountedOrder } from "@/lib/meta-audience/counted";
import { phoneHash, buildUsersPayload, MAX_BATCH, type IdentityType } from "@/lib/meta-audience/identity";
import { classifyAudienceResult, audienceName, type AudienceOutcome } from "@/lib/meta-audience/classify";
import { eventsForTrigger, type OrderTrigger, type PurchaseAt } from "@/lib/meta-capi/triggers";
import { computeOrderMoney } from "@/lib/order-payment";
import { normalizePhone } from "@/lib/phone";
import { GRAPH_BASE } from "@/lib/facebook/constants";
import { decryptToken } from "@/lib/token-crypto";
import { pushMetaAudienceStopped, pushMetaAudienceTokenExpiring } from "@/services/seller-push.service";

type Db = PrismaClient | Prisma.TransactionClient;
type Identity = { type: IdentityType; key: string; pageId: string | null };

const DEFAULT_PURCHASE_AT: PurchaseAt = "PAYMENT"; // ร้านที่ไม่มีค่าตั้งของ 00089 = ชำระครบ (PRD 3.3)

const ORDER_SELECT = {
  id: true, shopId: true, status: true, isDryRun: true, buyerContact: true, totalAmount: true,
  paymentConfirmedAt: true, codReceivedAt: true,
  payments: { select: { kind: true, amount: true, voidedAt: true } },
  conversation: {
    select: {
      channel: true, shopChannelId: true,
      shopChannel: { select: { externalId: true } },
      externalContact: { select: { externalUserId: true } },
    },
  },
} satisfies Prisma.OrderSelect;
type OrderRow = Prisma.OrderGetPayload<{ select: typeof ORDER_SELECT }>;

/** จังหวะ Purchase ของใบนี้ — ตามเพจของห้องแชท · ไม่มีห้อง/เพจไม่มีค่าตั้ง = ค่าตั้งแรกของร้าน · ร้านไม่มีเลย = ชำระครบ
 *  shortcut: ไม่ดู countPromotedDraft (ใบที่ร้านยืนยันจากร่างยังเป็นใบจริง) · ร้านหลายเพจที่ตั้งจังหวะต่างกัน ใบนอกแชทใช้ของเพจแรก */
type Settings = { byChannel: Map<string, PurchaseAt>; fallback: PurchaseAt };
async function loadSettings(db: Db, shopId: string): Promise<Settings> {
  const rows = await db.metaCapiPageSetting.findMany({
    where: { shopId }, orderBy: { createdAt: "asc" }, select: { shopChannelId: true, purchaseAt: true },
  });
  return {
    byChannel: new Map(rows.map((r) => [r.shopChannelId, r.purchaseAt as PurchaseAt])),
    fallback: (rows[0]?.purchaseAt as PurchaseAt | undefined) ?? DEFAULT_PURCHASE_AT,
  };
}
const purchaseAtOf = (o: OrderRow, s: Settings): PurchaseAt =>
  (o.conversation?.shopChannelId && s.byChannel.get(o.conversation.shopChannelId)) || s.fallback;

function orderCounted(o: OrderRow, s: Settings): boolean {
  const money = computeOrderMoney({
    totalAmount: Number(o.totalAmount.toString()),
    depositAgreed: null,
    payments: o.payments.map((p) => ({ kind: p.kind as "DEPOSIT" | "BALANCE", amount: Number(p.amount.toString()), voidedAt: p.voidedAt })),
  });
  const fullyPaid = money.fullyPaid || !!o.paymentConfirmedAt || !!o.codReceivedAt;
  return isCountedOrder({ status: o.status, isDryRun: o.isDryRun, fullyPaid }, purchaseAtOf(o, s));
}

/** PSID+เพจ (จากห้อง Messenger) และ/หรือเบอร์แฮช (จาก buyerContact) — มีเท่าไรส่งเท่านั้น (BR-CA-01) */
export function identitiesOf(o: Pick<OrderRow, "buyerContact" | "conversation">): Identity[] {
  const out: Identity[] = [];
  const c = o.conversation;
  const psid = c?.channel === "MESSENGER" ? c.externalContact?.externalUserId : null;
  const pageId = c?.shopChannel?.externalId;
  if (psid && pageId) out.push({ type: "PSID", key: psid, pageId });
  const h = phoneHash(o.buyerContact);
  if (h) out.push({ type: "PHONE", key: h, pageId: null });
  return out;
}

/** ใบอื่นทั้งหมดของตัวตนนี้ในร้านเดียวกัน (ไม่ข้ามร้าน) */
async function ordersOfIdentity(db: Db, shopId: string, id: Identity, rawPhone?: string | null): Promise<OrderRow[]> {
  if (id.type === "PSID") {
    return db.order.findMany({
      where: { shopId, conversation: { channel: "MESSENGER", externalContact: { externalUserId: id.key }, shopChannel: { externalId: id.pageId ?? "" } } },
      select: ORDER_SELECT,
    });
  }
  // buyerContact เป็นข้อความดิบ (อาจมีขีด/เว้นวรรค) — คัดหยาบด้วย 4 หลักท้าย แล้วเทียบแฮชจริงใน JS
  const p = normalizePhone(rawPhone ?? "");
  if (!p) return [];
  const rows = await db.order.findMany({ where: { shopId, buyerContact: { contains: p.slice(-4) } }, select: ORDER_SELECT });
  return rows.filter((r) => phoneHash(r.buyerContact) === id.key);
}

/** ตัดสิน desired ของตัวตนจากใบทั้งหมดที่ยังนับ (BR-CA-03: ถอนเฉพาะเมื่อไม่เหลือใบที่นับ) แล้วเขียนเครื่องหมาย */
async function recomputeIdentity(db: Db, shopId: string, id: Identity, rawPhone: string | null, s: Settings) {
  const orders = await ordersOfIdentity(db, shopId, id, rawPhone);
  const desired = orders.some((o) => orderCounted(o, s)) ? "IN" : "OUT";
  const where = { shopId_identityType_identityKey: { shopId, identityType: id.type, identityKey: id.key } };
  if (desired === "IN") {
    const cur = await db.metaAudienceMember.findUnique({ where, select: { desired: true } });
    if (!cur) {
      await db.metaAudienceMember.create({ data: { shopId, identityType: id.type, identityKey: id.key, pageId: id.pageId, desired: "IN" } });
    } else if (cur.desired !== "IN") {
      await db.metaAudienceMember.update({ where, data: { desired: "IN", attempts: 0, nextAttemptAt: new Date(), lastError: null } });
    }
  } else {
    // ไม่เคยเข้า = ไม่ต้องสร้างแถว "ออก"
    await db.metaAudienceMember.updateMany({
      where: { shopId, identityType: id.type, identityKey: id.key, desired: "IN" },
      data: { desired: "OUT", attempts: 0, nextAttemptAt: new Date(), lastError: null },
    });
  }
}

/** จุดเดียวที่ทุก call site ของ 00089 เรียก (ผ่าน enqueueOrderCapiAfterCommit) — ไม่ throw (FR-006: ห้ามกระทบการสร้างออเดอร์) */
export async function markOrderPurchaserAfterCommit(orderId: string, trigger: OrderTrigger) {
  try {
    const order = await prisma.order.findUnique({ where: { id: orderId }, select: ORDER_SELECT });
    if (!order || order.isDryRun || order.status === "DRAFTED") return;
    if (!isMetaAudienceEnabled(order.shopId)) return;
    const conn = await prisma.metaAudienceConnection.findUnique({ where: { shopId: order.shopId }, select: { id: true } });
    if (!conn) return; // ยังไม่เชื่อมบัญชีโฆษณา — ตอนเปิดใช้ครั้งแรกจะเติมย้อนหลังเอง (FR-007)
    const s = await loadSettings(prisma, order.shopId);
    const leaves = trigger === "CANCELED" || trigger === "RETURNED";
    // ทริกเกอร์ที่ไม่ใช่ Purchase/ออก (ส่งของ/สลิป ฯลฯ) ไม่เปลี่ยนว่าใครซื้อแล้ว — ใช้ตัวเดียวกับ 00089 ตัดสิน
    if (!leaves && !eventsForTrigger(trigger, { purchaseAt: purchaseAtOf(order, s), countPromotedDraft: true }).includes("PURCHASE")) return;
    for (const id of identitiesOf(order)) await recomputeIdentity(prisma, order.shopId, id, order.buyerContact, s);
  } catch (e) {
    console.error("[meta-audience] mark failed", { orderId, trigger, error: e instanceof Error ? e.message : String(e) });
  }
}

/** เติมย้อนหลัง (FR-007): ใบที่ถึงจังหวะ Purchase และยังไม่ยกเลิก/คืน → ตัวตนของมัน desired=IN */
export async function backfillShopAudience(shopId: string): Promise<number> {
  const s = await loadSettings(prisma, shopId);
  const seen = new Map<string, Identity>();
  let cursor: string | undefined;
  for (;;) {
    const rows = await prisma.order.findMany({
      where: { shopId, isDryRun: false, status: { notIn: ["DRAFTED", "CANCELLED", "RETURNED"] } },
      select: ORDER_SELECT, orderBy: { id: "asc" }, take: 500, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (!rows.length) break;
    cursor = rows[rows.length - 1].id;
    for (const o of rows) if (orderCounted(o, s)) for (const id of identitiesOf(o)) seen.set(`${id.type}:${id.key}`, id);
  }
  const all = [...seen.values()];
  for (let i = 0; i < all.length; i += 1000) {
    const chunk = all.slice(i, i + 1000);
    await prisma.metaAudienceMember.createMany({
      data: chunk.map((id) => ({ shopId, identityType: id.type, identityKey: id.key, pageId: id.pageId, desired: "IN" })),
      skipDuplicates: true,
    });
    // แถวที่เคยถูกถอน (OUT) แต่ตอนนี้กลับมานับ — ดึงกลับเป็น IN
    for (const type of ["PSID", "PHONE"] as const) {
      const keys = chunk.filter((c) => c.type === type).map((c) => c.key);
      if (keys.length) {
        await prisma.metaAudienceMember.updateMany({
          where: { shopId, identityType: type, identityKey: { in: keys }, desired: "OUT" },
          data: { desired: "IN", attempts: 0, nextAttemptAt: new Date(), lastError: null },
        });
      }
    }
  }
  await prisma.metaAudienceConnection.updateMany({ where: { shopId }, data: { backfilledAt: new Date() } });
  return all.length;
}

/** audience ใหม่/สร้างใหม่ = Meta ยังไม่มีใครเลย → ทุกแถวกลับเป็น "ยังไม่ส่ง" */
export async function resetSynced(shopId: string) {
  await prisma.metaAudienceMember.updateMany({
    where: { shopId },
    data: { syncedState: "OUT", attempts: 0, nextAttemptAt: new Date(), lastError: null },
  });
}

// ─── ตัวส่ง (FR-006) — cron ทุก 5 นาที ────────────────────────────────────────────────────

const STALE_LOCK_MS = 5 * 60_000;
const MAX_ROUNDS = 5; // ต่อร้านต่อรอบ cron — งานค้างก้อนใหญ่ (backfill) ทยอยส่งรอบถัดไป
const backoffMs = (attempts: number) => Math.min(5 * 60_000 * 2 ** Math.max(0, attempts - 1), 24 * 3600_000);
const msg = (j: unknown) => String((j as { error?: { message?: string } } | null)?.error?.message ?? "").slice(0, 300);

export interface SweepSummary { connections: number; added: number; removed: number; stopped: number; retried: number }

export async function sweepMetaAudience(opts: { now?: Date; fetchImpl?: typeof fetch; shopIds?: string[] } = {}): Promise<SweepSummary> {
  const now = opts.now ?? new Date();
  const doFetch = opts.fetchImpl ?? fetch;
  const sum: SweepSummary = { connections: 0, added: 0, removed: 0, stopped: 0, retried: 0 };

  const conns = await prisma.metaAudienceConnection.findMany({
    where: {
      enabled: true, status: "ACTIVE",
      OR: [{ lockedAt: null }, { lockedAt: { lt: new Date(now.getTime() - STALE_LOCK_MS) } }],
      ...(opts.shopIds ? { shopId: { in: opts.shopIds } } : {}),
    },
    select: { id: true, shopId: true, lockedAt: true },
  });

  for (const c of conns) {
    if (!isMetaAudienceEnabled(c.shopId)) continue;
    // จองร้านแบบมีเงื่อนไข — ตัวส่งสองตัวชนกัน ตัวที่แพ้ได้ count 0
    const claimed = await prisma.metaAudienceConnection.updateMany({
      where: { id: c.id, enabled: true, status: "ACTIVE", lockedAt: c.lockedAt },
      data: { lockedAt: now },
    });
    if (claimed.count === 0) continue;
    sum.connections++;
    try {
      await syncConnection(c.id, now, doFetch, sum);
    } catch (e) {
      // ร้านหนึ่งล้มต้องไม่บล็อกร้านอื่น · ห้าม log token
      console.error("[meta-audience-sweep] ร้านล้มเหลว", { shopId: c.shopId, error: e instanceof Error ? e.message : String(e) });
    } finally {
      await prisma.metaAudienceConnection.update({ where: { id: c.id }, data: { lockedAt: null } }).catch(() => {});
    }
  }
  return sum;
}

async function stopConnection(connId: string, shopId: string, reason: string, now: Date, sum: SweepSummary) {
  const r = await prisma.metaAudienceConnection.updateMany({
    where: { id: connId, status: "ACTIVE" },
    data: { status: "STOPPED", stoppedAt: now, stoppedReason: reason },
  });
  // แจ้งครั้งเดียวตอน ACTIVE → STOPPED
  if (r.count === 1) await pushMetaAudienceStopped({ shopId, reason });
  sum.stopped++;
}

async function graph(doFetch: typeof fetch, method: "POST" | "DELETE", path: string, token: string, body: unknown) {
  let status = 0;
  let json: unknown = null;
  try {
    const res = await doFetch(`${GRAPH_BASE}/${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    status = res.status;
    json = await res.json().catch(() => null);
  } catch (e) {
    json = { error: { message: e instanceof Error ? e.message : String(e) } };
  }
  return { status, json, outcome: classifyAudienceResult(status, json) };
}

async function syncConnection(connId: string, now: Date, doFetch: typeof fetch, sum: SweepSummary) {
  let conn = await prisma.metaAudienceConnection.findUniqueOrThrow({
    where: { id: connId },
    include: { shop: { select: { shopName: true } } },
  });
  const token = decryptToken(conn.tokenEnc);

  // token แบบกดเชื่อมใกล้หมด (< 7 วัน) — แจ้งครั้งเดียว
  if (conn.tokenExpiresAt && !conn.expiryWarnedAt && conn.tokenExpiresAt.getTime() - now.getTime() < 7 * 864e5) {
    await prisma.metaAudienceConnection.update({ where: { id: conn.id }, data: { expiryWarnedAt: now } });
    await pushMetaAudienceTokenExpiring({ shopId: conn.shopId, daysLeft: Math.max(0, Math.ceil((conn.tokenExpiresAt.getTime() - now.getTime()) / 864e5)) });
  }

  if (!conn.backfilledAt) await backfillShopAudience(conn.shopId);

  let recreated = false;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    if (!conn.audienceId) {
      const name = audienceName(conn.shop.shopName);
      const r = await graph(doFetch, "POST", `act_${conn.adAccountId}/customaudiences`, token, {
        name, subtype: "CUSTOM", description: "ลูกค้าที่ซื้อแล้ว — อัปเดตอัตโนมัติโดย Deep",
        customer_file_source: "USER_PROVIDED_ONLY", audience_labels: ["GENERAL_CUSTOMERS"],
      });
      const id = (r.json as { id?: string } | null)?.id;
      if (r.outcome === "OK" && id) {
        await resetSynced(conn.shopId);
        conn = await prisma.metaAudienceConnection.update({
          where: { id: conn.id }, data: { audienceId: id, audienceName: name }, include: { shop: { select: { shopName: true } } },
        });
      } else if (r.outcome === "TERMS") return stopConnection(conn.id, conn.shopId, "TERMS_NOT_ACCEPTED", now, sum);
      else if (r.outcome === "STOP") return stopConnection(conn.id, conn.shopId, "TOKEN_OR_PERMISSION", now, sum);
      else { sum.retried++; return; } // ลองรอบ cron ถัดไป
    }

    const sent = await sendBatches(conn, token, now, doFetch, sum);
    if (sent === "GONE") {
      // audience ถูกลบใน Ads Manager → สร้างใหม่ครั้งเดียวต่อรอบ แล้วเติมทั้งหมดใหม่ (FR-003)
      if (recreated) return;
      recreated = true;
      conn = await prisma.metaAudienceConnection.update({
        where: { id: conn.id }, data: { audienceId: null, audienceName: null }, include: { shop: { select: { shopName: true } } },
      });
      continue;
    }
    if (sent === "STOP" || sent === "TERMS") return stopConnection(conn.id, conn.shopId, sent === "TERMS" ? "TERMS_NOT_ACCEPTED" : "TOKEN_OR_PERMISSION", now, sum);
    if (sent === "RETRY") { sum.retried++; return; }
    if (sent === "IDLE") break;
  }
  await prisma.metaAudienceConnection.update({ where: { id: conn.id }, data: { lastSyncedAt: now } });
}

type Conn = { id: string; shopId: string; audienceId: string | null };
type Sent = "OK" | "IDLE" | AudienceOutcome;

/** 1 รอบ = เพิ่ม (PSID ต่อเพจ + เบอร์) แล้วถอน — คืน IDLE เมื่อไม่มีอะไรค้าง */
async function sendBatches(conn: Conn, token: string, now: Date, doFetch: typeof fetch, sum: SweepSummary): Promise<Sent> {
  let did = false;
  for (const [desired, method, key] of [["IN", "POST", "added"], ["OUT", "DELETE", "removed"]] as const) {
    const rows = await prisma.metaAudienceMember.findMany({
      where: { shopId: conn.shopId, desired, syncedState: desired === "IN" ? "OUT" : "IN", nextAttemptAt: { lte: now } },
      select: { id: true, identityType: true, identityKey: true, pageId: true, attempts: true },
      orderBy: { updatedAt: "asc" },
      take: MAX_BATCH * 2,
    });
    // กลุ่มต่อ (ชนิด, เพจ) — PSID ต้องแยกเพจเพราะ page_ids อยู่ใน payload · แต่ละกลุ่มไม่เกิน 10,000
    const groups = new Map<string, typeof rows>();
    for (const r of rows) {
      const k = r.identityType === "PSID" ? `PSID:${r.pageId}` : "PHONE";
      groups.set(k, [...(groups.get(k) ?? []), r]);
    }
    for (const g of groups.values()) {
      for (let i = 0; i < g.length; i += MAX_BATCH) {
        const part = g.slice(i, i + MAX_BATCH);
        did = true;
        const type = part[0].identityType as IdentityType;
        const payload = buildUsersPayload(type, part.map((p) => p.identityKey), part[0].pageId ?? undefined);
        const r = await graph(doFetch, method, `${conn.audienceId}/users`, token, { payload });
        if (r.outcome === "OK") {
          // เงื่อนไข desired กันแข่ง: ระหว่างส่งมีใบยกเลิก/ซื้อใหม่สลับค่า = ไม่ทับ ให้รอบหน้าส่งกลับ
          await prisma.metaAudienceMember.updateMany({
            where: { id: { in: part.map((p) => p.id) }, desired },
            data: { syncedState: desired, attempts: 0, lastError: null },
          });
          sum[key] += part.length;
        } else if (r.outcome === "RETRY" || r.outcome === "FAIL") {
          await Promise.all(part.map((p) =>
            prisma.metaAudienceMember.update({
              where: { id: p.id },
              data: { attempts: p.attempts + 1, nextAttemptAt: new Date(now.getTime() + backoffMs(p.attempts + 1)), lastError: msg(r.json) || String(r.status) },
            })));
          return "RETRY";
        } else return r.outcome; // STOP | TERMS | GONE — แถวไม่นับครั้ง เชื่อมใหม่แล้วส่งต่อได้
      }
    }
  }
  return did ? "OK" : "IDLE";
}
