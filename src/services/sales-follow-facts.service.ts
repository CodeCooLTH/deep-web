// 00095 S-3 — โหลดข้อเท็จจริงของห้องเป็นชุด แล้วประกอบเป็น DecideFacts / AttachFacts ให้ decide.ts (TFR-FB-01/02/03/10/11/13)
// ไม่มีตรรกะตัดสินที่นี่: stage ← deriveSalesStage · ข้อความ ← message-defs · กรอบ ← getAdWindowStartAtMany (ห้ามคิดเอง)
// query ต่อชุดห้อง: ห้อง+contact+ช่อง · ออเดอร์(+พัสดุ+event) · ข้อความ(raw) · ตราประทับเดิม = 4 (+ ad-window ของ helper เดิม)
// 🛑 ทุก query ใส่ shopId เป็นเงื่อนไขแรก (ไม่มี RLS) — ห้องของร้านอื่นหายไปจากผลเฉย ๆ
import 'server-only'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { ourMetaAppId } from '@/lib/facebook/app-id'
import { asParcelClose } from '@/services/parcel-close-input'
import { getAdWindowStartAtMany } from '@/services/ad-window.service'
import { ACTIVE_FORWARD_SHIPMENT } from '@/lib/shipment-direction'
import type { MetaAiFacts } from '@/lib/meta-ai-holder'
import { META_PROVIDERS, type BotStatus, type FinalAction, type SalesStageKey, type TagMatch } from '@/lib/sales-follow-bot/constants'
import {
  decideRun,
  type AttachFacts,
  type DecideBot,
  type DecideContact,
  type DecideFacts,
  type DecideRoom,
} from '@/lib/sales-follow-bot/decide'
import { isSalesFollowBotEnabled } from '@/lib/sales-follow-bot/gate'
import {
  messageLookbackSince,
  realBuyerMsgSql,
  countedShopReplySql,
  type MsgPos,
} from '@/lib/sales-follow-bot/message-defs'
import {
  STAMP_EVENT_TYPES,
  classifyOrder,
  deriveSalesStage,
  roundEndLimit,
  selectReferenceOrder,
  stampOfOrder,
  warnUnknownOrderStatusOnce,
  type SalesStageResult,
  type StageOrder,
} from '@/lib/sales-follow-bot/sales-stage'
import type { BotStep } from '@/lib/sales-follow-bot/schemas'

// ───────────────────────── บอท (ตัวอ่านที่ engine + panel ใช้ร่วม) ─────────────────────────

export interface LoadedBot {
  id: string
  shopId: string
  name: string
  status: BotStatus
  structureRev: number
  salesStatuses: SalesStageKey[]
  tagKeys: string[]
  tagMatch: TagMatch
  steps: BotStep[]
  finalAction: FinalAction
  finalDelayMin: number
  channelIds: string[]
  testRoomIds: string[]
  deletedAt: Date | null
  updatedAt: Date
}

/** อ่านบอทของร้าน (ไม่กรอง deletedAt — ผู้เรียกตัดสินเอง: engine ต้องเห็นบอทที่ถูกลบเพื่อหยุด run) */
export async function loadBots(shopId: string, botIds: string[]): Promise<Map<string, LoadedBot>> {
  if (botIds.length === 0) return new Map()
  const rows = await prisma.salesFollowBot.findMany({
    where: { shopId, id: { in: botIds } },
    select: {
      id: true, shopId: true, name: true, status: true, structureRev: true, salesStatuses: true, tagKeys: true,
      tagMatch: true, steps: true, finalAction: true, finalDelayMin: true, deletedAt: true, updatedAt: true,
      channels: { select: { shopChannelId: true } },
      testRooms: { select: { conversationId: true } },
    },
  })
  return new Map(
    rows.map((b) => [
      b.id,
      {
        id: b.id, shopId: b.shopId, name: b.name, status: b.status as BotStatus, structureRev: b.structureRev,
        salesStatuses: b.salesStatuses as SalesStageKey[], tagKeys: b.tagKeys, tagMatch: b.tagMatch as TagMatch,
        steps: b.steps as unknown as BotStep[], finalAction: b.finalAction as FinalAction, finalDelayMin: b.finalDelayMin, channelIds: b.channels.map((c) => c.shopChannelId),
        testRoomIds: b.testRooms.map((t) => t.conversationId), deletedAt: b.deletedAt, updatedAt: b.updatedAt,
      } satisfies LoadedBot,
    ]),
  )
}

/** nameKey ของแท็กทั้งหมดของร้าน — ไว้แยกแท็กที่หายออกจากแท็กที่ยังใช้ได้ (TFR-FB-07) */
export async function loadShopTagKeys(shopId: string): Promise<Set<string>> {
  const rows = await prisma.shopTag.findMany({ where: { shopId }, select: { nameKey: true } })
  return new Set(rows.map((r) => r.nameKey))
}

/** บอทที่ถูกลบ = CLOSED ในสายตา decideRun → run ที่ตกค้างหยุดด้วย BOT_DISABLED แทนที่จะส่งต่อ */
export function toDecideBot(b: LoadedBot): DecideBot {
  return {
    status: b.deletedAt ? 'CLOSED' : b.status,
    structureRev: b.structureRev,
    salesStatuses: b.salesStatuses,
    tagKeys: b.tagKeys,
    tagMatch: b.tagMatch,
    stepDelaysMin: b.steps.map((s) => s.delayMin),
    channelIds: b.channelIds,
    testRoomIds: b.testRoomIds,
  }
}

// ───────────────────────── ข้อเท็จจริงรายห้อง ─────────────────────────

export interface RoomBundle {
  conversationId: string
  shopId: string
  room: DecideRoom & { externalContactId: string | null }
  contact: DecideContact & { name: string | null }
  shopChannelStatus: string | null
  adWindowStartAt: Date | null
  metaAi: MetaAiFacts | null
  /** null = ออเดอร์อ้างอิงมีสถานะไม่รู้จัก (BR-FB-17) */
  stage: SalesStageResult | null
  latestBuyerMsg: MsgPos | null
  latestShopReply: MsgPos | null
  /** ฟองบอทล่าสุดที่ SENT ของ run ที่ระบุ (เฉพาะเมื่อส่ง runIds) */
  lastBotBubble: MsgPos | null
}

interface MsgFactRow {
  conversationId: string
  firstBuyerAt: Date | null
  lbAt: Date | null
  lbSeq: number | null
  lsAt: Date | null
  lsSeq: number | null
  botAt: Date | null
  botSeq: number | null
}

const pos = (at: Date | null, seq: number | null): MsgPos | null => (at && seq !== null ? { createdAt: at, seq } : null)
const iso = (d: Date | null): string | null => (d ? d.toISOString() : null)

export interface LoadBundlesOpts {
  /** conversationId → runId ของ run ที่กำลังประเมิน (ใช้หา lastBotBubble) */
  runIdByRoom?: Map<string, string>
  /**
   * ปิดการปักตราประทับ — **ใช้ในเทสเท่านั้น** เพื่อพิสูจน์ว่าถ้าไม่ปัก stamp NOT_BOUGHT จะขยับตามหน้าต่าง 30 วัน
   */
  disablePins?: boolean
}

/**
 * 🛑 ตราประทับ NOT_BOUGHT ต้องคงที่ตลอดรอบ (reviewer ชี้ + SRS TFR-FB-02)
 * ปัญหา: ตราประทับ = RealBuyerMsg "แรก" ของรอบ แต่ query ข้อความถูกตัดที่ 30 วัน (AC-FB-47) — ลูกค้าที่คุยเมื่อ 25 วันก่อนแล้ว
 * กลับมาใหม่ ข้อความแรกจะหลุดหน้าต่างระหว่างที่ run ยังตามอยู่ → stamp เปลี่ยน → decideRun หยุดด้วย STAGE_CHANGED ผิด ๆ
 * (และหลัง run จบ ตัวแนบจะเห็น stamp ใหม่ แล้วแนบซ้ำในรอบเดิม ผิด OD-FB-3)
 * ทางแก้: ปัก stageStamp ของทุก run NOT_BOUGHT ที่เคยแนบกับห้องนี้เป็น "ข้อความของรอบ" เพิ่มเข้า pool ก่อน deriveSalesStage
 *   - ไม่มีออเดอร์: min(pool) = ตัวปัก (เก่าสุด) → คงที่ ไม่ว่าหน้าต่างจะเลื่อนไปไหน
 *   - มีออเดอร์จบรอบ: deriveSalesStage กรอง `> stamp+HOLD` อยู่แล้ว → ตัวปักของรอบเก่า (≤ เกณฑ์) ถูกทิ้งเอง ไม่ปนข้ามรอบ
 * ข้อแม้ (เคสขอบที่รู้): backfill ข้อความเก่าจาก Meta เข้ามาทีหลัง (metaBackfilledAt) อาจทำให้ "ข้อความแรกของรอบ" ที่อยู่ในหน้าต่างเก่ากว่าตัวปัก
 *   → min(pool) ถอยหลังไปเป็นข้อความนั้น → stamp ต่าง → run หยุด STAGE_CHANGED (หยุดเฉย ๆ ไม่ส่งผิด = ล้มทางปลอดภัย)
 * ข้อแม้: ข้อความต้นรอบถูก unsend แล้ว stamp ก็ยังคงเดิม (ปลอดภัยกว่าหยุดผิด) — ตัวปักคือหลักฐานว่ารอบนี้เริ่มเมื่อไร
 */
export async function loadRoomBundles(
  shopId: string,
  conversationIds: string[],
  now: Date,
  opts: LoadBundlesOpts = {},
): Promise<Map<string, RoomBundle>> {
  const out = new Map<string, RoomBundle>()
  const ids = [...new Set(conversationIds)]
  if (ids.length === 0) return out

  // Q1 ห้อง + ผู้ติดต่อ + ช่อง
  const convs = await prisma.conversation.findMany({
    where: { shopId, id: { in: ids } },
    select: {
      id: true, shopId: true, shopChannelId: true, channel: true, isSpam: true, isHidden: true, lastInboundAt: true,
      autoReplyEnabled: true, externalContactId: true, lastMessageAt: true, lastSenderRole: true,
      metaForeignEchoAt: true, metaForeignEchoAppId: true, metaForeignEchoAi: true, metaForeignEchoAdminText: true,
      metaOwnerAppId: true, metaOwnerObservedAt: true,
      externalContact: { select: { name: true, salesStatus: true, tags: true, isBlocked: true } },
      shopChannel: { select: { status: true } },
    },
  })
  if (convs.length === 0) return out
  const found = convs.map((c) => c.id)

  // Q2 ออเดอร์ (E = ใบล่าสุดที่ไม่ใช่ร่าง/ทดสอบ) + พัสดุขาไปที่ยัง active + เลขส่งเอง + event ที่ใช้ทำตราประทับ
  const orderRows = await prisma.order.findMany({
    where: { shopId, conversationId: { in: found }, status: { not: 'DRAFTED' }, isDryRun: false },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: {
      id: true, shopId: true, conversationId: true, isDryRun: true, status: true, createdAt: true, paymentMethod: true,
      paymentConfirmedAt: true, codReceivedAt: true, handedOverAt: true, fulfillmentMode: true,
      shipments: {
        where: ACTIVE_FORWARD_SHIPMENT,
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { carrierStatus: true, problemAt: true, deliveredAt: true, problemCloseOutcome: true },
      },
      shipmentTracking: { select: { id: true } },
      events: { where: { type: { in: [...STAMP_EVENT_TYPES] } }, select: { type: true, occurredAt: true } },
    },
  })
  const ordersByRoom = new Map<string, StageOrder[]>()
  for (const o of orderRows) {
    if (!o.conversationId) continue
    const sh = o.shipments[0]
    const so: StageOrder = {
      id: o.id, shopId: o.shopId, conversationId: o.conversationId, isDryRun: o.isDryRun, status: o.status,
      createdAt: o.createdAt, paymentMethod: o.paymentMethod, paymentConfirmedAt: o.paymentConfirmedAt,
      codReceivedAt: o.codReceivedAt, handedOverAt: o.handedOverAt, fulfillmentMode: o.fulfillmentMode,
      carrierStatus: sh?.carrierStatus ?? null, hasShipment: !!sh, hasManualTracking: !!o.shipmentTracking,
      parcelClose: asParcelClose(sh?.problemCloseOutcome), problemAt: sh?.problemAt ?? null,
      deliveredAt: sh?.deliveredAt ?? null, events: o.events,
    }
    ordersByRoom.set(o.conversationId, [...(ordersByRoom.get(o.conversationId) ?? []), so])
  }

  // ขอบ "รอบใหม่" ต่อห้อง — ใช้ตัวช่วยของ sales-stage ตัวเดียวกับที่ deriveSalesStage ใช้ (ไม่เขียนกฎซ้ำ)
  const afterOf = (roomId: string): Date | null => {
    const e = selectReferenceOrder(ordersByRoom.get(roomId) ?? [], roomId, shopId)
    if (!e) return null
    const key = classifyOrder(e)
    return key === null ? null : roundEndLimit(key, stampOfOrder(key, e, now))
  }
  const afters = found.map((id) => iso(afterOf(id)))
  const runIds = found.map((id) => opts.runIdByRoom?.get(id) ?? null)

  // Q3 ข้อความ (นิยามเดียวจาก message-defs ทั้งสองรูป · ขอบ 30 วันบังคับทุกก้อน)
  const sinceExpr = `'${messageLookbackSince(now).toISOString()}'::timestamp`
  const RB = Prisma.raw(realBuyerMsgSql('m', sinceExpr))
  const CS = Prisma.raw(countedShopReplySql('m', sinceExpr))
  const msgRows = await prisma.$queryRaw<MsgFactRow[]>`
    SELECT r."id" AS "conversationId", fb."createdAt" AS "firstBuyerAt",
           lb."createdAt" AS "lbAt", lb."seq" AS "lbSeq", ls."createdAt" AS "lsAt", ls."seq" AS "lsSeq",
           bot."createdAt" AS "botAt", bot."seq" AS "botSeq"
    FROM unnest(${found}::text[], ${afters}::text[], ${runIds}::text[]) AS r("id", "after", "runId")
    LEFT JOIN LATERAL (
      SELECT m."createdAt" FROM "ChatMessage" m
      WHERE m."conversationId" = r."id" AND ${RB} AND (r."after" IS NULL OR m."createdAt" > r."after"::timestamp)
      ORDER BY m."createdAt" ASC LIMIT 1) fb ON true
    LEFT JOIN LATERAL (
      SELECT m."createdAt", m."seq" FROM "ChatMessage" m WHERE m."conversationId" = r."id" AND ${RB}
      ORDER BY m."createdAt" DESC, m."seq" DESC LIMIT 1) lb ON true
    LEFT JOIN LATERAL (
      SELECT m."createdAt", m."seq" FROM "ChatMessage" m WHERE m."conversationId" = r."id" AND ${CS}
      ORDER BY m."createdAt" DESC, m."seq" DESC LIMIT 1) ls ON true
    LEFT JOIN LATERAL (
      SELECT m."createdAt", m."seq" FROM "ChatMessage" m
      WHERE r."runId" IS NOT NULL AND m."conversationId" = r."id" AND m."autoReplyKind" = 'AUTO_FOLLOW'
        AND m."id" IN (SELECT unnest(s."messageIds" || ARRAY[s."chatMessageId"]) FROM "SalesFollowSend" s
                       WHERE s."runId" = r."runId" AND s."shopId" = ${shopId} AND s."status" = 'SENT')
      ORDER BY m."createdAt" DESC, m."seq" DESC LIMIT 1) bot ON true`
  const msgByRoom = new Map(msgRows.map((r) => [r.conversationId, r]))

  // Q4 ตราประทับ NOT_BOUGHT ของ run เดิมในห้อง (ตัวปัก — ดูคอมเมนต์ที่ฟังก์ชัน)
  const pinRows = opts.disablePins
    ? []
    : await prisma.salesFollowRun.findMany({
        where: { shopId, conversationId: { in: found }, stageKey: 'NOT_BOUGHT' },
        select: { conversationId: true, stageStamp: true },
      })
  const pinsByRoom = new Map<string, Date[]>()
  for (const p of pinRows) pinsByRoom.set(p.conversationId, [...(pinsByRoom.get(p.conversationId) ?? []), p.stageStamp])

  const adStart = await getAdWindowStartAtMany(
    convs.map((c) => ({ id: c.id, channel: c.channel })),
    now,
  )

  for (const c of convs) {
    const m = msgByRoom.get(c.id)
    const orders = ordersByRoom.get(c.id) ?? []
    const buyerMsgTimes = [...(m?.firstBuyerAt ? [m.firstBuyerAt] : []), ...(pinsByRoom.get(c.id) ?? [])]
    const stage = deriveSalesStage({ roomId: c.id, shopId, orders, buyerMsgTimes, now })
    if (stage === null) {
      const e = selectReferenceOrder(orders, c.id, shopId)
      if (e) warnUnknownOrderStatusOnce(e.id, e.status)
    }
    const isMeta = (META_PROVIDERS as readonly string[]).includes(c.channel)
    out.set(c.id, {
      conversationId: c.id,
      shopId: c.shopId,
      room: {
        id: c.id, shopChannelId: c.shopChannelId, channel: c.channel, isSpam: c.isSpam, isHidden: c.isHidden,
        lastInboundAt: c.lastInboundAt, autoReplyEnabled: c.autoReplyEnabled, externalContactId: c.externalContactId,
      },
      contact: {
        name: c.externalContact?.name ?? null,
        // ไม่มีผู้ติดต่อ = ค่ากลาง ๆ ที่ไม่ทำให้ใคร "ไม่สนใจ/ถูกบล็อก" (ตัวแนบตัดห้องไม่มี externalContactId เองอยู่แล้ว)
        salesStatus: c.externalContact?.salesStatus ?? 'UNSPECIFIED',
        tags: c.externalContact?.tags ?? [],
        isBlocked: c.externalContact?.isBlocked ?? false,
      },
      shopChannelStatus: c.shopChannel?.status ?? null,
      adWindowStartAt: isMeta ? (adStart.get(c.id) ?? null) : null,
      metaAi: isMeta
        ? {
            metaForeignEchoAt: c.metaForeignEchoAt, metaForeignEchoAppId: c.metaForeignEchoAppId,
            metaForeignEchoAi: c.metaForeignEchoAi, metaForeignEchoAdminText: c.metaForeignEchoAdminText,
            lastMessageAt: c.lastMessageAt, lastSenderRole: c.lastSenderRole,
            metaOwnerAppId: c.metaOwnerAppId, metaOwnerObservedAt: c.metaOwnerObservedAt,
          }
        : null,
      stage,
      latestBuyerMsg: pos(m?.lbAt ?? null, m?.lbSeq ?? null),
      latestShopReply: pos(m?.lsAt ?? null, m?.lsSeq ?? null),
      lastBotBubble: pos(m?.botAt ?? null, m?.botSeq ?? null),
    })
  }
  return out
}

// ───────────────────────── ประกอบเป็น facts ของ decide.ts ─────────────────────────

export interface DecideRunInput {
  id: string
  shopId: string
  botId: string
  conversationId: string
  stageKey: SalesStageKey
  stageStamp: Date | null
  structureRev: number
  nextStep: number
  lastSentAt: Date | null
}

/**
 * facts ของ run เป็นชุด (ทุกร้านปนกันได้ — แยกตามร้านข้างใน) · คีย์ = run.id
 * ไม่มีค่า = ห้องหรือบอทไม่อยู่ในร้านนั้น (ถูกลบ/ข้ามร้าน) → ผู้เรียกจัดการเอง (engine: หยุดด้วย OUT_OF_SCOPE/BOT_DISABLED)
 * sendAllowed = isSalesFollowBotEnabled ณ ตอนเรียก (อ่าน env สด — AC-FB-97)
 */
export async function loadDecideFacts(
  runs: DecideRunInput[],
  now: Date,
  opts: Pick<LoadBundlesOpts, 'disablePins'> = {},
): Promise<Map<string, DecideFacts>> {
  const out = new Map<string, DecideFacts>()
  const byShop = new Map<string, DecideRunInput[]>()
  for (const r of runs) byShop.set(r.shopId, [...(byShop.get(r.shopId) ?? []), r])

  for (const [shopId, rs] of byShop) {
    const [bots, tagKeys, bundles, shop] = await Promise.all([
      loadBots(shopId, [...new Set(rs.map((r) => r.botId))]),
      loadShopTagKeys(shopId),
      loadRoomBundles(shopId, rs.map((r) => r.conversationId), now, {
        runIdByRoom: new Map(rs.map((r) => [r.conversationId, r.id])),
        disablePins: opts.disablePins,
      }),
      prisma.shop.findUnique({ where: { id: shopId }, select: { vertical: true } }),
    ])
    // ร้านที่เปลี่ยน vertical ออกจาก ONLINE_SALES หลังแนบ = ไม่ส่ง (HOLD ผ่าน decideRun ตัวเดียว — Q-14 ก)
    const sendAllowed = isSalesFollowBotEnabled(shopId) && shop?.vertical === 'ONLINE_SALES'
    const ourApp = ourMetaAppId()
    for (const r of rs) {
      const bot = bots.get(r.botId)
      const b = bundles.get(r.conversationId)
      if (!bot || !b) continue
      out.set(r.id, {
        now,
        run: {
          stageKey: r.stageKey, stageStamp: r.stageStamp, structureRev: r.structureRev, nextStep: r.nextStep,
          lastSentAt: r.lastSentAt,
        },
        bot: toDecideBot(bot),
        shopTagKeys: tagKeys,
        room: b.room,
        contact: b.contact,
        shopChannelStatus: b.shopChannelStatus,
        adWindowStartAt: b.adWindowStartAt,
        metaAi: b.metaAi,
        ourMetaAppId: ourApp,
        stage: b.stage,
        latestBuyerMsg: b.latestBuyerMsg,
        latestShopReply: b.latestShopReply,
        lastBotBubble: b.lastBotBubble,
        sendAllowed,
      })
    }
  }
  return out
}

/** ตัดสินใหม่สดของ run เดียว (แผงในห้อง/ตรวจซ้ำก่อนยิง) — ตัวเดียวกับที่ engine ใช้ ไม่มีนิยามที่สอง */
export async function decideRunNow(run: DecideRunInput, now: Date) {
  const facts = (await loadDecideFacts([run], now)).get(run.id)
  return facts ? { facts, decision: decideRun(facts) } : null
}

/**
 * facts สำหรับตัวแนบ: ห้องผู้สมัคร (ที่ SQL ของ engine กรองหยาบแล้ว) × บอท 1 ตัว · คีย์ = conversationId
 * lastRunFinishedAt = run ที่จบแล้วล่าสุดของ (บอท,ห้อง) (BR-FB-09)
 */
export async function loadAttachFacts(
  shopId: string,
  botId: string,
  conversationIds: string[],
  now: Date,
  opts: Pick<LoadBundlesOpts, 'disablePins'> = {},
): Promise<Map<string, AttachFacts>> {
  const out = new Map<string, AttachFacts>()
  const [bots, tagKeys, bundles] = await Promise.all([
    loadBots(shopId, [botId]),
    loadShopTagKeys(shopId),
    loadRoomBundles(shopId, conversationIds, now, opts),
  ])
  const bot = bots.get(botId)
  if (!bot) return out
  const finished = await prisma.salesFollowRun.groupBy({
    by: ['conversationId'],
    where: { shopId, botId, conversationId: { in: conversationIds }, finishedAt: { not: null } },
    _max: { finishedAt: true },
  })
  const finishedAt = new Map(finished.map((f) => [f.conversationId, f._max.finishedAt]))
  const { structureRev: _rev, ...decideBot } = toDecideBot(bot)
  void _rev
  for (const [id, b] of bundles) {
    out.set(id, {
      now,
      bot: { ...decideBot, status: bot.status, deletedAt: bot.deletedAt },
      shopTagKeys: tagKeys,
      room: b.room,
      contact: b.contact,
      shopChannelStatus: b.shopChannelStatus,
      adWindowStartAt: b.adWindowStartAt,
      stage: b.stage,
      latestBuyerMsg: b.latestBuyerMsg,
      lastRunFinishedAt: finishedAt.get(id) ?? null,
    })
  }
  return out
}
