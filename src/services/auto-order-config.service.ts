/**
 * auto-order-config.service — ชุดตั้งค่าของตัวสร้างออเดอร์อัตโนมัติจากแชท (00061)
 *
 * TFR-001 (ชุดตั้งค่า/วลี/เพจ/ห้องทดสอบ) · TFR-003 (สถานะ 3 ระดับ + ด่าน server-side)
 *
 * 🛑 ทุกด่านในไฟล์นี้บังคับที่ service ไม่ใช่ที่ปุ่มบนหน้าจอ — client ยิง API ตรงได้เสมอ
 */
import 'server-only'

import { prisma } from '@/lib/prisma'
import { normalizeTriggerPhrase } from '@/lib/auto-order-normalize'
import { resolveShopVertical } from '@/lib/lodging'

export type AutoOrderStatus = 'OFFLINE' | 'TEST' | 'LIVE'

export const AUTO_ORDER_STATUSES: readonly AutoOrderStatus[] = ['OFFLINE', 'TEST', 'LIVE'] as const

export function isAutoOrderStatus(v: string): v is AutoOrderStatus {
  return (AUTO_ORDER_STATUSES as readonly string[]).includes(v)
}

/* ── error ที่ route ต้อง map เป็น HTTP status ─────────────────────────────── */

/** ร้านที่ไม่ใช่ ONLINE_SALES ใช้ฟีเจอร์นี้ไม่ได้เลย (BR-ACO-06) → 403 */
export class VerticalNotSupportedError extends Error {
  constructor() {
    super('VERTICAL_NOT_SUPPORTED')
    this.name = 'VerticalNotSupportedError'
  }
}

/** ยังมีเพจที่สิทธิ์ message_echoes ไม่ผ่าน → เปิด TEST/LIVE ไม่ได้ (BR-ACO-07) → 409 */
export class MessageEchoesNotGrantedError extends Error {
  /** ชื่อเพจที่ยังไม่ผ่าน — UI ต้องบอกได้ว่าต้องไปซ่อมอันไหน ไม่ใช่แค่ "ทำไม่ได้" */
  constructor(public readonly channelNames: string[]) {
    super('MESSAGE_ECHOES_NOT_GRANTED')
    this.name = 'MessageEchoesNotGrantedError'
  }
}

/** วลีซ้ำหลัง normalize → 400 */
export class PhraseDuplicateError extends Error {
  constructor(public readonly phrase: string) {
    super('PHRASE_DUPLICATE')
    this.name = 'PhraseDuplicateError'
  }
}

/** ต้องเหลืออย่างน้อย 1 วลีเสมอ → 400 */
export class PhraseMinOneError extends Error {
  constructor() {
    super('PHRASE_MIN_ONE')
    this.name = 'PhraseMinOneError'
  }
}

/** เปิด TEST โดยไม่มีห้องทดสอบเลย = OFFLINE โดยปริยาย → บอกตรง ๆ ดีกว่าเงียบ → 409 */
export class TestThreadRequiredError extends Error {
  constructor() {
    super('TEST_THREAD_REQUIRED')
    this.name = 'TestThreadRequiredError'
  }
}

/* ── CRUD ─────────────────────────────────────────────────────────────────── */

/**
 * แถว config มีอยู่เสมอหลังเรียกครั้งแรก (`status='OFFLINE'`)
 *
 * ใช้ `upsert` บน `shopId @unique` แทน find-then-create — สองแท็บที่เปิดหน้าตั้งค่าพร้อมกัน
 * จะไม่ชนกันเป็น P2002 (ความถูกต้องต้องอยู่ที่ constraint ไม่ใช่ที่ลำดับการอ่าน)
 */
export async function getOrCreateAutoOrderConfig(shopId: string) {
  return prisma.autoOrderAgentConfig.upsert({
    where: { shopId },
    create: { shopId },
    update: {},
    include: {
      phrases: { orderBy: { createdAt: 'asc' } },
      channels: { include: { channel: { select: { id: true, name: true, provider: true, status: true, messageEchoesStatus: true, messageEchoesCheckedAt: true } } } },
      testThreads: true,
    },
  })
}

export type AutoOrderConfigFull = Awaited<ReturnType<typeof getOrCreateAutoOrderConfig>>

/**
 * เพจที่ "มีผลจริง" ณ ตอนนี้ (effective) — join สดทุกครั้ง ไม่ cache
 *
 * 🛑 นิยาม: เพจที่ร้านเลือกไว้ **และ** `ShopChannel.status='ACTIVE'`
 * ร้านถอดเพจแล้วแถวที่เลือกยังอยู่ครบ (soft delete) ⇒ เชื่อมกลับมา = มีผลทันทีโดยไม่ต้องเลือกใหม่
 *
 * 🛑 คืนเซตว่างได้ และนั่นคือสถานะปกติที่ต้องรองรับ — "LIVE แต่ไม่มีเพจเหลือ" ไม่ auto-flip
 * เป็น OFFLINE (ค่าใน DB ไม่เปลี่ยน) แต่ผลที่มองเห็นได้เป็นศูนย์ ⇒ ผู้เรียกทุกรายต้องเช็คเอง
 */
export async function getEffectiveChannelIds(shopId: string): Promise<string[]> {
  const rows = await prisma.autoOrderAgentChannel.findMany({
    where: { config: { shopId }, channel: { status: 'ACTIVE' } },
    select: { shopChannelId: true },
  })
  return rows.map((r) => r.shopChannelId)
}

/**
 * แทนที่ชุดวลีทั้งชุด — 🛑 ต้องมีอย่างน้อย 1 วลีเสมอ (TFR-001)
 *
 * ทำใน 1 ทรานแซกชัน: ลบของเดิม → สร้างชุดใหม่ (แถวเดิมไม่มีใครอ้างถึงจากที่อื่น)
 */
export async function replacePhrases(shopId: string, phrases: string[]) {
  const cleaned = phrases.map((p) => p.trim()).filter((p) => p.length > 0)
  if (cleaned.length === 0) throw new PhraseMinOneError()

  // ตรวจซ้ำหลัง normalize ที่ชั้นแอปก่อน เพื่อบอกได้ว่า "วลีไหน" ซ้ำ —
  // ปล่อยให้ P2002 เป็นคนบอกจะได้แค่ "ซ้ำ" โดยไม่รู้ว่าตัวไหน
  const seen = new Map<string, string>()
  for (const raw of cleaned) {
    const key = normalizeTriggerPhrase(raw)
    if (!key) throw new PhraseMinOneError()
    const prev = seen.get(key)
    if (prev !== undefined) throw new PhraseDuplicateError(raw)
    seen.set(key, raw)
  }

  const config = await getOrCreateAutoOrderConfig(shopId)
  return prisma.$transaction(async (tx) => {
    await tx.autoOrderAgentPhrase.deleteMany({ where: { configId: config.id } })
    await tx.autoOrderAgentPhrase.createMany({
      data: [...seen.entries()].map(([normalizedPhrase, phrase]) => ({
        configId: config.id,
        phrase,
        normalizedPhrase,
      })),
    })
    return tx.autoOrderAgentPhrase.findMany({
      where: { configId: config.id },
      orderBy: { createdAt: 'asc' },
    })
  })
}

/**
 * แทนที่ชุดเพจทั้งชุด
 *
 * 🛑 scope ownership ด้วย `shopId` ใน WHERE ของคิวรีที่คัดกรอง ไม่ใช่เช็คทีหลัง —
 * caller ส่ง id อะไรมาก็ได้ ถ้าเชื่อตรง ๆ จะผูกชุดตั้งค่ากับเพจของร้านอื่น
 */
export async function replaceChannels(shopId: string, shopChannelIds: string[]) {
  const config = await getOrCreateAutoOrderConfig(shopId)
  const owned = await prisma.shopChannel.findMany({
    where: { id: { in: shopChannelIds }, shopId },
    select: { id: true },
  })
  const ownedIds = owned.map((c) => c.id)

  return prisma.$transaction(async (tx) => {
    await tx.autoOrderAgentChannel.deleteMany({ where: { configId: config.id } })
    if (ownedIds.length > 0) {
      await tx.autoOrderAgentChannel.createMany({
        data: ownedIds.map((shopChannelId) => ({ configId: config.id, shopChannelId })),
      })
    }
    return tx.autoOrderAgentChannel.findMany({ where: { configId: config.id } })
  })
}

/** แทนที่ชุดห้องทดสอบทั้งชุด — scope ด้วย shopId เหมือนกัน */
export async function replaceTestThreads(shopId: string, conversationIds: string[]) {
  const config = await getOrCreateAutoOrderConfig(shopId)
  const owned = await prisma.conversation.findMany({
    where: { id: { in: conversationIds }, shopId },
    select: { id: true },
  })
  const ownedIds = owned.map((c) => c.id)

  return prisma.$transaction(async (tx) => {
    await tx.autoOrderAgentTestThread.deleteMany({ where: { configId: config.id } })
    if (ownedIds.length > 0) {
      await tx.autoOrderAgentTestThread.createMany({
        data: ownedIds.map((conversationId) => ({ configId: config.id, conversationId })),
      })
    }
    return tx.autoOrderAgentTestThread.findMany({ where: { configId: config.id } })
  })
}

/**
 * เปลี่ยนสถานะ — **ด่านทั้งหมดของ TFR-003 อยู่ที่นี่**
 *
 * ลำดับเช็ค (ต้องคงลำดับนี้ เพราะข้อความ error ที่ผู้ใช้เห็นควรตรงกับสิ่งที่ต้องแก้ก่อน):
 *   1. vertical — ร้านที่ไม่ใช่ ONLINE_SALES ทำอะไรกับฟีเจอร์นี้ไม่ได้เลยแม้แต่ปิด
 *   2. ถ้าจะเปิด (TEST/LIVE): ทุกเพจ MESSENGER/IG ที่เลือก **ต้อง GRANTED**
 *   3. ถ้าจะเปิด TEST: ต้องมีห้องทดสอบอย่างน้อย 1 ห้อง
 *
 * 🛑 ข้อ 2 อ่านค่าจากคอลัมน์ที่ `checkMessageEchoesHealth()` เขียนไว้ **ไม่ยิง Graph ซ้ำที่นี่**
 * (cache แบบ advisory ตาม TFR-004) — ถ้ายิงตรงนี้ด้วย การกดปุ่มเปิดจะช้าและพังตามเน็ตของ Meta
 *
 * 🛑 `provider='LINE'` ไม่มีแนวคิด message_echoes ⇒ ข้ามด่านข้อ 2 (BR-ACO-10)
 * เขียนเป็น allow-list ของ provider ที่ *ต้องตรวจ* ไม่ใช่ deny-list ของตัวที่ข้าม —
 * provider ใหม่ที่เพิ่มทีหลังจะได้ถูกตรวจโดยอัตโนมัติ ไม่ใช่หลุดเงียบ
 */
const ECHO_CHECKED_PROVIDERS = ['MESSENGER', 'INSTAGRAM'] as const

export async function setAutoOrderStatus(
  shopId: string,
  status: AutoOrderStatus,
  actorUserId: string | null,
) {
  const shop = await prisma.shop.findUnique({ where: { id: shopId }, select: { vertical: true } })
  if (resolveShopVertical(shop?.vertical) !== 'ONLINE_SALES') throw new VerticalNotSupportedError()

  const config = await getOrCreateAutoOrderConfig(shopId)

  if (status !== 'OFFLINE') {
    const selected = await prisma.autoOrderAgentChannel.findMany({
      where: { configId: config.id, channel: { status: 'ACTIVE' } },
      select: { channel: { select: { name: true, provider: true, messageEchoesStatus: true } } },
    })
    const blocked = selected
      .map((r) => r.channel)
      .filter(
        (c) =>
          (ECHO_CHECKED_PROVIDERS as readonly string[]).includes(c.provider) &&
          c.messageEchoesStatus !== 'GRANTED',
      )
    if (blocked.length > 0) {
      throw new MessageEchoesNotGrantedError(blocked.map((c) => c.name ?? c.provider))
    }
  }

  if (status === 'TEST') {
    const threads = await prisma.autoOrderAgentTestThread.count({ where: { configId: config.id } })
    if (threads === 0) throw new TestThreadRequiredError()
  }

  return prisma.autoOrderAgentConfig.update({
    where: { id: config.id },
    data: { status, updatedByUserId: actorUserId },
  })
}
