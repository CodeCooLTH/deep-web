import { randomUUID } from 'node:crypto'
import { Prisma, type ChatMessage } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { pauseForHumanTakeover } from '@/services/auto-reply-takeover.service'
import { getChannelByExternalId, markChannelTokenInvalid } from '@/services/shop-channel.service'
import { canAccessShop } from '@/lib/shop-context'
import { getLastInboundTime, fetchMessageText, fetchAdPostContent, fetchThreadMessages, sendMessageReaction, sendImageGridMessage, GraphApiError, type GraphThreadMessage, type GraphThreadAttachment } from '@/lib/facebook/graph'
import type { ChannelAdapter, ChannelContext } from '@/lib/channels/adapter'
import { MetaAdapter } from '@/lib/channels/meta-adapter'
import { decryptToken } from '@/lib/token-crypto'
import { saveFile, getFileUrl } from '@/lib/storage'
import { contentTypeToExt } from '@/lib/attachment-mime'
// pure module (ไม่มี server code) — ใช้ตัวเดียวกับที่ ChatThread ใช้ตัดสินว่าเป็นการ์ดยอดเงิน
// เพื่อไม่ให้ "อะไรคือการ์ดยอดเงิน" มีสองนิยาม (HR16)
import { parseMetaOrderCard } from '@/lib/meta-order-card'
import type { MessagingEvent, Referral } from '@/lib/facebook/webhook-types'

/**
 * (S-1, feature 00025 TFR-LINE-13) — จุดเดียวที่แปลง ShopChannel.provider → ChannelAdapter
 *
 * ห้ามเขียนเงื่อนไขเทียบชื่อ provider กระจายที่อื่นในไฟล์นี้อีก (TD-008) — MESSENGER/INSTAGRAM ใช้ Send
 * API เดียวกันของ Meta (ต่างกันแค่ endpoint ภายใน getContactProfile) จึง map ไป MetaAdapter ตัวเดียว
 * ตัวถัดไป (LINE, S-4) แค่เพิ่ม case ที่นี่จุดเดียว ไม่ต้องแก้ call site อื่น
 */
function getAdapter(provider: string): ChannelAdapter {
  switch (provider) {
    case 'MESSENGER':
    case 'INSTAGRAM':
      return MetaAdapter
    default:
      throw new Error(`UNSUPPORTED_CHANNEL_PROVIDER: ${provider}`)
  }
}

// รับ-ส่งข้อความของช่องทางนอก (feature 00018)
// แยกจาก chat.service.ts เพราะ chat เดิมมีสมมติฐานว่าทั้งสองฝั่งเป็น User ในระบบ

// หน้าต่างตอบกลับมาตรฐานของ Meta — นับจากข้อความล่าสุด "ของลูกค้า"
export const MESSAGING_WINDOW_MS = 24 * 60 * 60 * 1000

/**
 * HUMAN_AGENT tag — Meta ให้ "คนจริง" ตอบด้วยมือนอกหน้าต่าง 24 ชม. ได้ถึง 7 วัน
 * (Messaging Policy: human agent tag "manually respond to user messages within a 7-day period")
 * ครอบทั้ง Messenger และ Instagram
 *
 * สำคัญ: ใช้ได้เฉพาะข้อความที่ "คนพิมพ์เอง" เท่านั้น — ห้าม auto-reply/AI ยิงผ่าน tag นี้ และห้าม
 * เนื้อหาโปรโมชัน (ผิดนโยบาย เสี่ยงโดนระงับแอป) จึง gate ที่ service ไม่ใช่แค่ซ่อนปุ่มใน UI
 */
export const HUMAN_AGENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

/**
 * ต้องได้ permission `human_agent` จาก App Review ก่อนถึงจะยิงจริงได้ — ถ้ายังไม่ได้แล้วส่ง tag ไป
 * Meta จะปฏิเสธทั้งข้อความ ซึ่งแย่กว่าการบล็อกไว้ตั้งแต่ต้น จึงเปิดด้วย env หลังได้อนุมัติแล้วเท่านั้น
 */
/**
 * error ของ `sendOutboundMessage` เมื่อ "บันทึกแถวแล้วแต่ Meta ปฏิเสธ"
 *
 * ยังคงรูป `message = "SEND_FAILED: <เหตุผลดิบ>"` ไว้เหมือนเดิม เพราะ route จับด้วย
 * `startsWith("SEND_FAILED")` — ที่เพิ่มมาคือแถวที่บันทึกไว้แล้ว ให้ route ส่งกลับไปให้ client
 * เอาไปแทนบับเบิล optimistic ของตัวเอง (ไม่งั้นข้อความเดียวขึ้นสองอัน)
 */
// Omit<'rawMessage'> ไม่ใช่ ChatMessage เต็ม — client ที่ตั้ง global omit ไว้จะไม่คืนคอลัมน์นี้
// และแถวนี้ถูกส่งต่อออก API ไปให้เบราว์เซอร์ จึงต้องไม่มี payload ดิบติดไปด้วยอยู่แล้ว
export type SendFailedError = Error & { savedMessage?: Omit<ChatMessage, 'rawMessage'> }

/**
 * ประกอบค่าที่จะลงคอลัมน์ `ChatMessage.rawMessage` (2026-08-03, user สั่ง)
 *
 * เก็บ payload ที่ได้รับ **ทั้งก้อน ไม่ตัดอะไรออก** — สิ่งที่ต้องใช้ตอนสืบคือ "field ที่เรายังไม่รู้จัก"
 * (เช่นการ์ด audio_call ที่มาถึงแบบ text ว่าง ไม่มี attachment) การตัดตอนเก็บ = ตัดคำตอบทิ้ง
 *
 * ห่อด้วย envelope เล็ก ๆ เพราะอนาคตจะมีหลาย platform (LINE/TikTok) และหลายทางเข้า
 * (webhook vs backfill จาก Graph) — ถ้าเก็บ payload เปล่า ๆ จะแยกไม่ออกว่าโครงนี้ของใคร
 *
 * ไม่ throw เด็ดขาด: การเก็บ log ห้ามทำให้ข้อความของลูกค้าหายไปทั้งข้อความ
 */
function toRawMessage(
  provider: string,
  payload: unknown,
  // 'outbound-response' = ขาออก ไม่มี payload ที่ได้รับ เก็บสิ่งที่ Meta ตอบกลับตอนเรายิงไปแทน
  source: 'webhook' | 'graph-backfill' | 'outbound-response' = 'webhook',
): Prisma.InputJsonValue | undefined {
  try {
    // ผ่าน JSON round-trip ก่อน — ตัด undefined/ฟังก์ชัน/ค่าที่ Prisma รับไม่ได้ออกให้หมด
    // และเป็นการยืนยันว่า serialize ได้จริงก่อนส่งเข้า DB
    const clean = JSON.parse(JSON.stringify({ provider, source, payload }))
    return clean as Prisma.InputJsonValue
  } catch {
    return undefined
  }
}

export function isHumanAgentEnabled(): boolean {
  return process.env.META_HUMAN_AGENT_ENABLED === 'true'
}

export function getWindowState(
  lastInboundAt: Date | null,
  now: Date = new Date(),
): {
  open: boolean
  expiresAt: Date | null
  msRemaining: number
  /** หน้าต่าง 7 วันของ HUMAN_AGENT ยังเปิดอยู่ไหม (คนตอบเองได้ แม้เกิน 24 ชม. แล้ว) */
  humanAgentOpen: boolean
  humanAgentExpiresAt: Date | null
} {
  if (!lastInboundAt) {
    return { open: false, expiresAt: null, msRemaining: 0, humanAgentOpen: false, humanAgentExpiresAt: null }
  }
  const expiresAt = new Date(lastInboundAt.getTime() + MESSAGING_WINDOW_MS)
  const msRemaining = expiresAt.getTime() - now.getTime()
  const humanAgentExpiresAt = new Date(lastInboundAt.getTime() + HUMAN_AGENT_WINDOW_MS)
  return {
    open: msRemaining > 0,
    expiresAt,
    msRemaining: Math.max(0, msRemaining),
    humanAgentOpen: humanAgentExpiresAt.getTime() > now.getTime(),
    humanAgentExpiresAt,
  }
}

/**
 * syncInboundWindowFromMeta — lazy check เวลาลูกค้าทักล่าสุดจริงจาก Meta เมื่อหน้าต่างของเรา "ดูปิด"
 * (feature 00018, user report 2026-07-24)
 *
 * เรียกเฉพาะตอน getWindowState(lastInboundAt ที่เก็บไว้) = ปิด (NULL หรือหมดอายุ) — ครอบเคสร้าน
 * เชื่อมเพจช้ากว่าที่ลูกค้าทัก (ไม่เคยได้ webhook ของข้อความก่อนหน้า) หรือ webhook หลุด. ถ้า Meta
 * บอกว่าลูกค้าทักมาใหม่กว่าที่เราเก็บ → อัปเดต lastInboundAt ลง DB (persist ให้ครั้งถัด ๆ ไม่ต้อง
 * เรียก Meta ซ้ำจนกว่าจะหมดอายุอีกครั้ง)
 *
 * คืน lastInboundAt ที่ "ควรใช้จริง" (ค่าใหม่จาก Meta ถ้ามี ไม่งั้นค่าเดิม) — caller เอาไปเข้า
 * getWindowState ต่อ. ไม่ throw: เรียก Meta ไม่ได้ = คืนค่าเดิม (fail-safe ไปทาง "ปิด" ตามเดิม)
 */
export async function syncInboundWindowFromMeta(conversationId: string): Promise<Date | null> {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { shopChannel: true, externalContact: true },
  })
  if (!conv || conv.channel === 'DEEP' || !conv.shopChannel || !conv.externalContact) {
    return conv?.lastInboundAt ?? null
  }
  // เรียก Meta ต่อเมื่อ token ยังใช้ได้ (ACTIVE) — token ตาย/ถอดเพจแล้วเรียกไปก็ error
  if (conv.shopChannel.status !== 'ACTIVE') return conv.lastInboundAt

  // ข้ามถ้าหน้าต่างเปิดอยู่แล้ว (ไม่ต้องถาม Meta) — caller ควรกันชั้นนี้อยู่แล้ว แต่กันซ้ำที่นี่ด้วย
  if (getWindowState(conv.lastInboundAt).open) return conv.lastInboundAt

  const pageToken = decryptToken(conv.shopChannel.accessTokenEnc)
  const realLast = await getLastInboundTime(conv.externalContact.externalUserId, pageToken, conv.channel)
  if (!realLast) return conv.lastInboundAt

  // อัปเดตเฉพาะเมื่อ Meta ให้เวลาที่ใหม่กว่าที่เราเก็บ (กัน regress ค่า)
  if (conv.lastInboundAt && realLast.getTime() <= conv.lastInboundAt.getTime()) {
    return conv.lastInboundAt
  }
  await prisma.conversation.update({
    where: { id: conv.id },
    data: { lastInboundAt: realLast },
  })
  return realLast
}

/**
 * syncMissingMessagesFromMeta — เติมข้อความที่ webhook ไม่เคยส่งมาให้ (user report 2026-07-30
 * "แชทเข้ามาไม่ครบ")
 *
 * ทำไมต้องมี: **Meta ไม่ยิง `message_echoes` ให้ข้อความที่ระบบตอบกลับอัตโนมัติของตัวเองส่ง** —
 * ตอบกลับอัตโนมัติของโฆษณา, ข้อความทักทาย, การ์ดปุ่มโทร. พิสูจน์กับเธรดจริง 2026-07-30:
 * Meta มี 11 ข้อความ webhook ให้เราแค่ 5 ที่ขาดคือข้อความอัตโนมัติทั้งหมดในช่วง 4 วินาทีหลัง
 * ลูกค้าคลิกโฆษณา ส่วนข้อความที่ "คนพิมพ์จริง" มาครบทุกอัน — เป็นข้อจำกัดฝั่ง Meta ไม่ใช่ field
 * ที่ subscribe เพิ่มแล้วจะได้ ต้องมาดึงเอง
 *
 * เรียกตอน "เปิดเธรด" (user เลือก 2026-07-30) — จุดที่คนกำลังจะอ่านจริง ไม่ใช่ยิงรัวทุกครั้งที่มี event
 *
 * idempotent ด้วย `externalMessageId @unique` — ยิงซ้ำกี่รอบก็ไม่เกิดข้อความซ้ำ
 * ไม่ throw: sync ไม่ได้ = เห็นเท่าที่ webhook ให้มา (พฤติกรรมเดิม) ดีกว่าเปิดเธรดไม่ได้เลย
 *
 * ข้อจำกัดที่ยังแก้ไม่ได้: Instagram — endpoint /me/conversations ฝั่ง IG ตอบ error 2207085
 * (ดู comment ที่ getContactProfile) จึง sync ได้เฉพาะ MESSENGER
 */
export async function syncMissingMessagesFromMeta(
  conversationId: string,
): Promise<{ added: number }> {
  // throttle ต่อเธรด — route ที่เรียกฟังก์ชันนี้ถูกยิงทุกครั้งที่ client poll ไม่ใช่แค่ตอนเปิดเธรด
  // ถ้าไม่กัน จะได้ Graph call ทุกไม่กี่วินาทีต่อคนที่เปิดแชทค้างไว้ (โดนจำกัดอัตราแน่นอน)
  // in-memory + globalThis: pattern เดียวกับ lib/api-rate-limit.ts — known-gap เดียวกันคือ
  // serverless หลาย instance ต่างคนต่างนับ (ยอมรับได้: ผลเสียสูงสุดคือ sync ถี่กว่าที่ตั้งไว้เล็กน้อย)
  const now = Date.now()
  const store = (globalThis as { __fbSyncAt?: Map<string, number> }).__fbSyncAt ??
    ((globalThis as { __fbSyncAt?: Map<string, number> }).__fbSyncAt = new Map())
  const last = store.get(conversationId)
  if (last && now - last < SYNC_THROTTLE_MS) return { added: 0 }
  store.set(conversationId, now)

  try {
    const conv = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { shopChannel: true, externalContact: true },
    })
    // MESSENGER เท่านั้น (ดู comment หัวฟังก์ชัน) + ต้องมี token ที่ยังใช้ได้
    if (
      !conv ||
      conv.channel !== 'MESSENGER' ||
      !conv.shopChannel ||
      !conv.externalContact ||
      conv.shopChannel.status !== 'ACTIVE'
    ) {
      return { added: 0 }
    }

    const pageToken = decryptToken(conv.shopChannel.accessTokenEnc)
    const remote = await fetchThreadMessages(conv.externalContact.externalUserId, pageToken, 50)
    if (remote.length === 0) return { added: 0 }

    const known = new Set(
      (
        await prisma.chatMessage.findMany({
          where: { conversationId, externalMessageId: { in: remote.map((m) => m.id) } },
          select: { externalMessageId: true },
        })
      ).map((m) => m.externalMessageId),
    )
    const missing = remote.filter((m) => !known.has(m.id))
    if (missing.length === 0) return { added: 0 }

    // pageId = externalId ของ ShopChannel — ใช้แยกว่าใครเป็นคนส่ง (Graph คืน from.id ของเพจสำหรับ
    // ข้อความฝั่งร้าน รวมถึงข้อความที่ระบบอัตโนมัติส่งแทนเพจด้วย)
    const pageId = conv.shopChannel.externalId

    // แปลงเนื้อหา (รวม mirror ไฟล์แนบ) ให้เสร็จก่อนเขียน — ต้องใช้ผลชุดเดียวกันทั้งตอน createMany
    // และตอนอัปเดต preview ด้านล่าง ไม่งั้นสองที่จะเขียนคนละเรื่องกับข้อความเดียวกัน
    const contents = await resolveBackfillBatch(missing)

    // createMany + skipDuplicates — กัน race กับ webhook ที่อาจยิง mid เดียวกันเข้ามาพร้อมกัน
    // (unique constraint จะ throw ถ้าใช้ create ธรรมดา แล้วทั้งชุดจะล้มเพราะข้อความเดียว)
    const result = await prisma.chatMessage.createMany({
      data: missing.map((m, i) => ({
        conversationId,
        senderRole: m.fromId === pageId ? 'SHOP' : 'BUYER',
        ...contents[i]!,
        createdAt: m.createdTime,
        externalMessageId: m.id,
        // ทางเข้าที่สอง: ข้อความที่ webhook ไม่เคยส่งมา แล้วเราไปดึงจาก Graph เอง — ต้นทางคนละแบบ
        // กับ webhook (โครง response ต่างกัน) จึงติด source ไว้ให้แยกออกตอนสืบ
        rawMessage: toRawMessage('facebook', m, 'graph-backfill'),
      })),
      skipDuplicates: true,
    })

    // อัปเดตสรุปเธรดเฉพาะเมื่อมีข้อความที่ "ใหม่กว่า" ที่เราเคยรู้ — ข้อความเก่าที่เพิ่งเติมย้อนหลัง
    // ต้องไม่ไปเปลี่ยน preview/เวลาในรายการแชทให้ดูเหมือนมีความเคลื่อนไหวใหม่
    const newestIdx = missing.reduce((best, m, i) => (m.createdTime > missing[best]!.createdTime ? i : best), 0)
    const newest = missing[newestIdx]!
    if (!conv.lastMessageAt || newest.createdTime > conv.lastMessageAt) {
      await prisma.conversation.update({
        where: { id: conversationId },
        data: {
          lastMessageAt: newest.createdTime,
          lastMessagePreview: backfillPreview(contents[newestIdx]!),
          lastSenderRole: newest.fromId === pageId ? 'SHOP' : 'BUYER',
        },
      })
    }

    return { added: result.count }
  } catch (e) {
    console.error(
      '[fb-sync] ดึงข้อความย้อนหลังไม่สำเร็จ',
      conversationId,
      e instanceof Error ? e.message : e,
    )
    return { added: 0 }
  }
}

/** placeholder ของข้อความที่ Graph ไม่ให้เนื้อหา (การ์ด/template) — ล้อกับฝั่ง webhook */
const SYNCED_EMPTY_TEXT = '[ข้อความจากระบบของ Facebook — เปิดดูใน Messenger]'

/**
 * แปลงข้อความที่ดึงย้อนหลังจาก Graph → คอลัมน์ของ ChatMessage
 *
 * ประวัติที่ต้องรู้ก่อนแก้ (bug จริง prod 2026-07-30 → 08-07, 542 แถว): เดิมที่นี่มีตารางป้าย
 * `SYNCED_ATTACHMENT_LABEL` ที่แปลง "ชนิด attachment" เป็นข้อความบอกใบ้ เช่น "[การ์ดปุ่มจาก
 * Facebook เช่น ปุ่มโทร — …]" — **ตารางนั้นไม่เคยถูกใช้เลยสักครั้งตั้งแต่วันแรก** เพราะ
 * `fetchThreadMessages` ขอฟิลด์ที่ไม่มีอยู่จริง (`attachments{type}`) แล้ว Graph ตัดข้อมูลทิ้งเงียบ ๆ
 * (ยืนยันจาก rawMessage บน prod: attachment ที่เคยบันทึกได้มีค่า `unknown` 45 ครั้ง ไม่มีค่าอื่นเลย)
 *
 * พอขอ `attachments` ให้ถูก เราได้ **เนื้อหาจริง** ของการ์ด (title/subtitle) และ url ของรูป/วิดีโอ
 * จึงไม่ต้องเดาชนิดเพื่อเขียนป้ายอีกต่อไป — เก็บของจริงลงไปตรง ๆ
 *
 * ลำดับการตัดสิน: ไฟล์แนบที่ mirror ได้ → ข้อความที่คนพิมพ์ → เนื้อหาการ์ด → placeholder
 * (placeholder เหลือไว้สำหรับกรณีที่ Meta ไม่ให้อะไรมาจริง ๆ เท่านั้น)
 */
interface BackfillContent {
  type: string
  body: string | null
  imageUrl: string | null
  attachmentName: string | null
  attachmentSize: number | null
}

/**
 * ข้อความของการ์ด: หัวข้อ + คำบรรยาย (Meta ส่งมาเป็นคนละฟิลด์ ทั้งคู่อาจว่าง)
 *
 * ต้องมีคำนำหน้า `CARD_PREFIX` เสมอ ห้ามคืนเนื้อหาเปล่า ๆ — การ์ดพวกนี้เครื่องมือของ Meta ส่งแทนเพจ
 * ไม่ใช่คนพิมพ์ ถ้าปล่อยเป็นข้อความเปล่าจะขึ้นเป็นบับเบิลสีร้าน = ดูเหมือนแอดมินพิมพ์ว่า "โทรหา
 * <ชื่อร้าน>" เอง (บั๊กเดิม user report 2026-07-31 ที่แก้ไปแล้วรอบหนึ่ง — อย่าทำพังซ้ำตอนเอา
 * เนื้อหาจริงมาใส่). คำนำหน้านี้คือสิ่งที่ `meta-system-notice` ใช้จับให้ไปแสดงเป็นบรรทัดระบบ
 *
 * บรรทัดเดียวเท่านั้น: `parseMetaSystemNotice` ตีข้อความหลายบรรทัดเป็น "ไม่ใช่ข้อความระบบ" โดยตั้งใจ
 */
export const CARD_PREFIX = '[การ์ดจาก Facebook]'

function cardText(att: GraphThreadAttachment): string | null {
  const parts = [att.title, att.subtitle]
    .filter((s): s is string => !!s && s.trim().length > 0)
    .map((s) => s.replace(/\s+/g, ' ').trim())
  return parts.length > 0 ? `${CARD_PREFIX} ${parts.join(' — ')}` : null
}

/** ชนิดของ ChatMessage สำหรับไฟล์แนบที่ mirror สำเร็จ — เสียงแยกจากไฟล์ด้วย mime */
function mediaChatType(att: GraphThreadAttachment): string {
  if (att.kind === 'image') return 'IMAGE'
  if (att.kind === 'video') return 'VIDEO'
  if (att.mimeType?.startsWith('audio/')) return 'AUDIO'
  if (att.mimeType?.startsWith('image/')) return 'IMAGE'
  if (att.mimeType?.startsWith('video/')) return 'VIDEO'
  return 'FILE'
}

async function resolveBackfillContent(m: GraphThreadMessage): Promise<BackfillContent> {
  const base = { type: 'TEXT', body: null, imageUrl: null, attachmentName: null, attachmentSize: null }

  // สื่อจริงที่ดาวน์โหลดได้ — mirror เข้า storage เราเหมือนทาง webhook (URL ของ Meta หมดอายุ)
  // การ์ด (kind === 'template') ไม่เข้าทางนี้: media_url ของมันอยู่บน www.facebook.com ซึ่ง**ไม่ได้
  // อยู่ใน allow-list ของ mirrorRemoteImage** (กัน SSRF) — การขยาย allow-list เป็นเรื่องที่ต้องผ่าน
  // security review แยก ไม่ใช่ผลพลอยได้ของการแก้บั๊กนี้
  const media = m.attachments.find((a) => a.kind !== 'template' && !!a.mediaUrl)
  if (media?.mediaUrl) {
    const fileId = await mirrorRemoteImage(media.mediaUrl)
    if (fileId) {
      return {
        type: mediaChatType(media),
        // caption ของไฟล์แนบ (ถ้ามี) — ห้ามยัด placeholder ลง body ตอน mirror สำเร็จ
        body: m.text,
        imageUrl: fileId,
        attachmentName: media.name,
        attachmentSize: media.size,
      }
    }
    // mirror ไม่ผ่าน (หมดอายุ/ใหญ่เกิน/host ไม่อยู่ใน allow-list) — ยังต้องเก็บข้อความไว้
    return { ...base, body: m.text ?? UNSUPPORTED_ATTACHMENT_TEXT }
  }

  if (m.text) return { ...base, body: m.text }

  const card = m.attachments.map(cardText).find((t): t is string => !!t)
  if (card) return { ...base, body: card }

  return { ...base, body: SYNCED_EMPTY_TEXT }
}

/**
 * แปลงทั้งชุดแบบจำกัดคิวละ 4 — ฟังก์ชันนี้ถูกเรียกในเส้นทางของ request (ตอนเปิดเธรด) และแต่ละ
 * ข้อความอาจต้องดาวน์โหลดไฟล์ ยิงพร้อมกัน 50 ตัวคือทางลัดสู่ timeout ส่วนไล่ทีละตัวก็ช้าเกิน
 * ตัวเลข 4 ล้อกับ fan-out ของ iShip price compare ที่ใช้อยู่แล้วในโปรเจกต์นี้
 */
/**
 * preview ในรายการแชทต้อง "สั้นเสมอ" — ล้อกับ SHORT_PREVIEW_BY_ATTTYPE ของฝั่ง webhook
 * (user report 2026-07-25: placeholder ยาวไปโผล่ใน list) การ์ดที่มีเนื้อหาจริงตัดที่ 100 ตัวอักษร
 */
function backfillPreview(c: BackfillContent): string {
  const short: Record<string, string> = {
    IMAGE: '[รูปภาพ]',
    VIDEO: '[วิดีโอ]',
    AUDIO: '[ข้อความเสียง]',
    FILE: '[ไฟล์แนบ]',
  }
  if (c.imageUrl) return short[c.type] ?? '[ไฟล์แนบ]'
  // การ์ดจาก Facebook ใช้ label สั้นตัวเดียวกับฝั่ง webhook (SHORT_PREVIEW_BY_ATTTYPE.template)
  // ไม่ใช่ตัดเนื้อหาจริง 100 ตัวอักษร — list ต้องสั้นเสมอเหมือนรูป/วิดีโอ (user report 2026-07-25:
  // placeholder ยาวไปโผล่ใน list) เนื้อหาจริงของการ์ดเก็บไว้ให้เห็นตอนเปิดเธรด ไม่ใช่ตอนกวาดสายตา
  // คำต้องตรงกับฝั่ง webhook เป๊ะ ๆ — concept เดียวกันต้องอ่านได้เป็นคำเดียวกันทั้ง 2 ทางเข้า
  // การ์ดยอดเงินบอกยอดไปเลย (ดูเหตุผลที่สาขาฝั่ง webhook — ต้องตรงกันทั้ง 2 ทางเข้า)
  const orderCard = parseMetaOrderCard(c.body)
  if (orderCard) return `คำขอชำระเงิน ${orderCard.amount}`
  if (c.body?.startsWith(CARD_PREFIX)) return '[ข้อความจากระบบ]'
  return (c.body ?? SYNCED_EMPTY_TEXT).slice(0, 100)
}

async function resolveBackfillBatch(messages: GraphThreadMessage[]): Promise<BackfillContent[]> {
  const out: BackfillContent[] = []
  for (let i = 0; i < messages.length; i += 4) {
    out.push(...(await Promise.all(messages.slice(i, i + 4).map(resolveBackfillContent))))
  }
  return out
}
/** เว้นระยะก่อน sync เธรดเดิมซ้ำ — ข้อความปกติมาทาง webhook อยู่แล้ว sync เป็นแค่ตาข่ายรับส่วนที่หลุด */
const SYNC_THROTTLE_MS = 5 * 60 * 1000

export type IngestStatus = 'STORED' | 'DUPLICATE' | 'NO_CHANNEL' | 'IGNORED'

// เพดานขนาดไฟล์แนบที่ mirror (feature 00018 — user request 2026-07-24 "รองรับทุกอย่าง"):
// 25MB = เพดานไฟล์แนบสูงสุดของ Messenger เอง (เดิม 5MB ทำให้ GIF/วิดีโอ/รูปความละเอียดสูงส่วนใหญ่
// เกิน → mirror ล้ม → ขึ้น placeholder ที่เปิดดูไม่ได้). ไม่ผูกกับ MAX_SIZE ของ seller upload อีก
// ต่อไป — mirror ใช้ saveFile(skipValidation) เพราะทำ validation เอง (host allow-list + streaming
// size cap ด้านล่าง) การกัน DoS ที่แท้จริงคือ readBodyWithCap ที่นับ byte สดระหว่างอ่าน ไม่ใช่ตัวเลขนี้
const MIRROR_MAX_BYTES = 25 * 1024 * 1024

// bubble ต้องไม่ว่างเปล่าแม้กรณี mirror รูปไม่ผ่าน หรือ attachment เป็นชนิดที่เราไม่รองรับ (I-5)
const MIRROR_FAILED_TEXT = '[ลูกค้าส่งรูปภาพ — เปิดดูใน Messenger]'
// ข้อความแทนไฟล์แนบที่ระบบยังไม่รองรับ (เสียง/วิดีโอ/ไฟล์)
// เขียนแบบไม่ระบุว่าใครเป็นคนส่ง เพราะ ingest ใช้ path เดียวกันทั้งข้อความของลูกค้าและ
// echo ของฝั่งร้าน — ถ้าเขียนว่า "ลูกค้าส่ง" จะโกหกเมื่อคนส่งคือร้านเอง (เห็นจริงใน prod)
const UNSUPPORTED_ATTACHMENT_TEXT = '[ไฟล์แนบ — เปิดดูใน Messenger]'

// (S-1) allow-list ของ host ที่ยอมให้ mirrorRemoteImage ยิง fetch ออกไปได้ — เฉพาะ CDN ของ Meta
// เท่านั้น. attachments[].payload.url มาจาก webhook payload ซึ่งถ้า FB_CHAT_APP_SECRET หลุด
// ผู้โจมตีปลอม webhook ที่ผ่านลายเซ็นได้แล้วยัด url เป็น internal address (เช่น
// http://169.254.169.254/... metadata endpoint ของ cloud) เซิร์ฟเวอร์เราจะยิง SSRF ไปแทน
// เทียบ hostname แบบ exact หรือ suffix ที่ขึ้นต้นด้วย "." เท่านั้น (กัน "evil-fbcdn.net" ปลอมตัว
// ผ่าน .endsWith('fbcdn.net') ตรง ๆ)
// fbsbx.com: CDN ของ "ไฟล์แนบ" Messenger (วิดีโอ/เสียง/ไฟล์ มักอยู่ lookaside.fbsbx.com/cdn.fbsbx.com
// ไม่ใช่ fbcdn.net เหมือนรูป) — feature 00018 mirror ไฟล์แนบ
const MIRROR_ALLOWED_HOSTS_EXACT = new Set(['graph.facebook.com', 'fbcdn.net', 'cdninstagram.com', 'fbsbx.com'])
const MIRROR_ALLOWED_HOST_SUFFIXES = ['.fbcdn.net', '.cdninstagram.com', '.fbsbx.com']

function isAllowedMirrorHost(hostname: string): boolean {
  const h = hostname.toLowerCase()
  if (MIRROR_ALLOWED_HOSTS_EXACT.has(h)) return true
  return MIRROR_ALLOWED_HOST_SUFFIXES.some((suffix) => h.endsWith(suffix))
}

const MIRROR_FETCH_TIMEOUT_MS = 10_000

// อ่าน response body พร้อมบังคับเพดานขนาด "ระหว่างอ่าน" ไม่ใช่หลังโหลดครบ (S-1) — content-length
// ที่ประกาศมาเป็นแค่ header เชื่อไม่ได้ (ปลอมได้/ไม่ส่งมาก็ได้) ถ้าใช้ arrayBuffer() เฉย ๆ ไฟล์ที่โกหก
// header หรือไม่ส่ง header เลยจะถูกโหลดเข้า memory ทั้งก้อนก่อนถึงจะรู้ว่าเกิน — เปิดช่องให้ยิงไฟล์เป็น
// GB ถล่ม memory ได้ (DoS). ใช้ res.body reader อ่านทีละ chunk แล้วยกเลิกทันทีที่สะสมเกินเพดาน
async function readBodyWithCap(res: Response, maxBytes: number): Promise<ArrayBuffer | null> {
  if (!res.body) {
    // environment ที่ fetch ไม่ให้ streaming body (ควรไม่เกิดใน runtime จริงของโปรเจกต์ — Node 22
    // undici รองรับเสมอ) — ปฏิเสธไปเลยเพื่อความปลอดภัย ดีกว่าเสี่ยงโหลดทั้งก้อนแบบไม่จำกัด
    return null
  }
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel().catch(() => {})
        return null
      }
      chunks.push(value)
    }
  }
  const buffer = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    buffer.set(chunk, offset)
    offset += chunk.byteLength
  }
  return buffer.buffer
}

// ใช้ทั้งฝั่ง ingest (I-1) และฝั่ง outbound (I-6) — เช็คว่า error ที่โยนมาเป็น unique constraint
// violation (P2002) บน field ที่ระบุจริงหรือเปล่า ไม่ใช่แค่ "P2002 อะไรก็ได้" (เหมารวมแบบเดิม
// ทำให้ P2002 บนคนละ constraint ถูกตีความผิดความหมาย)
function isUniqueViolationOn(e: unknown, field: string): boolean {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== 'P2002') return false
  const target = e.meta?.target
  return Array.isArray(target) && target.includes(field)
}

// ดาวน์โหลดรูปจาก CDN ของ Meta แล้วเก็บเข้า storage ของเรา (feature 00018)
// จำเป็นเพราะ 2 เหตุผล: URL ของ Meta หมดอายุ และ ChatMessage.imageUrl ของโปรเจกต์นี้
// เก็บ "fileId ของ storage" ไม่ใช่ URL (ดู fileIdExt ที่ route messages ใช้ตรวจนามสกุล)
//
// คืน null เมื่อดึงไม่ได้ — ข้อความยังต้องถูกบันทึกอยู่ดี ห้ามทิ้งทั้งข้อความเพราะรูปพัง
export async function mirrorRemoteImage(url: string): Promise<string | null> {
  // (S-1) เช็ค host allow-list + บังคับ https ก่อนยิง fetch เสมอ — กัน SSRF ผ่าน
  // attachments[].payload.url ที่ปลอมมากับ webhook (ดู comment ของ MIRROR_ALLOWED_HOSTS_EXACT)
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:' || !isAllowedMirrorHost(parsed.hostname)) return null

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(MIRROR_FETCH_TIMEOUT_MS) })
    if (!res.ok) return null

    const contentType = (res.headers.get('content-type') ?? '').split(';')[0]!.trim()
    // "รองรับทุกอย่าง" (user 2026-07-24): ชนิดที่รู้จัก → ext ตรง; ชนิดแปลก → generic ext (ยังเก็บได้
    // ให้ดาวน์โหลด ไม่ตายเป็น placeholder). ไม่มี allow-list ชนิดไฟล์อีกต่อไป — ความปลอดภัยมาจาก
    // host allow-list (Meta CDN เท่านั้น) + streaming size cap ไม่ใช่การจำกัดชนิด
    const ext = contentTypeToExt(contentType)

    // pre-check จาก header เร็ว ๆ ก่อน (ประหยัด round-trip ถ้าโกหกเกินขนาดชัด ๆ) แต่ตัวตัดสินจริง
    // คือ readBodyWithCap ด้านล่างที่นับ byte สดระหว่างอ่าน — header อย่างเดียวเชื่อไม่ได้ (S-1)
    const declaredSize = Number(res.headers.get('content-length') ?? '0')
    if (declaredSize > MIRROR_MAX_BYTES) return null

    const buffer = await readBodyWithCap(res, MIRROR_MAX_BYTES)
    if (!buffer) return null

    // skipValidation: mirror ทำ validation เองแล้ว (host + size + content-type→ext) — ไม่ต้องผ่าน
    // gate ชนิด/ขนาดของ seller upload (validateUpload) ที่แคบกว่าและ cap แค่ 5MB
    const file = new File([buffer], `fb-${Date.now()}.${ext}`, { type: contentType })
    return await saveFile(file, { skipValidation: true })
  } catch {
    return null
  }
}

/**
 * รอบการลองดึงรูปโปรไฟล์ใหม่ สำหรับคนที่ยังไม่มีรูปเก็บไว้
 *
 * ทำไมต้องมีรอบ ไม่ใช่ "ไม่มีรูปก็ลองทุกครั้ง": วันนี้ Meta ปฏิเสธรูปของลูกค้าทั่วไปทุกคน
 * (Business Asset User Profile Access ยังเป็น Standard Access = เฉพาะคนที่มี role บนแอป)
 * ถ้าไม่คุมรอบ ทุกข้อความที่เข้ามาจะพ่วง Graph call ที่รู้อยู่แล้วว่าจะล้ม — 1,453 contact
 * คูณจำนวนข้อความต่อวัน
 *
 * ทำไมต้องลองใหม่ ไม่ใช่ "ล้มแล้วเลิก": วันที่สิทธิ์ผ่าน ต้องไม่มีใครต้องมาสั่ง backfill ด้วยมือ
 * รูปควรทยอยขึ้นเองภายในรอบเดียว
 */
export const AVATAR_RETRY_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000

/** รูปที่ "เรียบร้อยแล้ว" = fileId ใน storage ของเรา; ค่าที่เป็น URL ของ Meta หมดอายุได้เสมอ */
function hasStoredAvatar(avatarUrl: string | null | undefined): boolean {
  return !!avatarUrl && !avatarUrl.startsWith('http')
}

export function shouldRetryAvatar(
  contact: { avatarUrl: string | null; avatarSyncedAt: Date | null } | null,
  now: Date = new Date(),
): boolean {
  if (!contact) return true
  if (hasStoredAvatar(contact.avatarUrl)) return false
  if (!contact.avatarSyncedAt) return true
  return now.getTime() - contact.avatarSyncedAt.getTime() >= AVATAR_RETRY_INTERVAL_MS
}

// ประกอบ "ข้อความสรุป" จาก field ของ template/location ที่ parse มาแล้ว (feature 00018, user 2026-07-25
// "รองรับทุกอัน") — order/payment/receipt/generic มี text/summary/elements มากับ webhook เอง ไม่ต้องพึ่ง
// Graph fetch (ซึ่งคืน message ว่างเมื่อ template ไม่มี text). แก้เคส user report: "[ข้อความจากระบบ
// (ออเดอร์/ชำระเงิน)]" ตกไป placeholder ทั้งที่เนื้อห (ยอด/รายการ) มากับ webhook แล้ว
type AttPayloadStructured = {
  text?: string
  template_type?: string
  order_number?: string
  summary?: { total_cost?: number }
  elements?: {
    title?: string
    // subtitle/buttons/image_url: หลักฐานว่า element นี้เป็น "การ์ด" จริง ไม่ใช่ข้อความที่ห่อ template
    // ไว้เฉย ๆ — ดู isRealCard() ว่าใช้ตัดสินอะไร (เดิมโค้ดอ่านแค่ title แล้วโยนที่เหลือทิ้งทั้งหมด)
    subtitle?: string
    image_url?: string
    buttons?: { title?: string; url?: string; type?: string }[]
  }[]
  coordinates?: { lat: number; long: number }
}

/**
 * "การ์ดจริง" ต่างจาก "ข้อความที่บังเอิญมาในรูป template" ตรงที่มีของประกอบมากกว่าหัวข้อ
 *
 * ทำไมต้องแยก (หลักฐานจาก prod 2026-08-07): ข้อความทักทายของเพจเข้ามาได้ **2 ทาง** — บางครั้งเป็น
 * `message.text` ธรรมดา (พร้อม is_echo) บางครั้งพ่วง attachment template มาด้วย เนื้อหาเดียวกันเป๊ะ
 * ถ้าใส่คำนำหน้า `[การ์ดจาก Facebook]` ให้ทุก template ข้อความเดียวกันจะแสดงคนละแบบสลับไปมา
 * ขึ้นกับว่า Meta ส่งมาทางไหนในวันนั้น — ผู้ขายอ่านแล้วงงกว่าเดิม
 *
 * การ์ดที่มี subtitle/ปุ่ม/รูป คือของที่ Business Suite วาดเป็นการ์ดจริง (คำขอชำระเงิน, การ์ดโฆษณา,
 * การ์ดชวนโทร) — พวกนี้ต้องเป็นบรรทัดระบบ ไม่ใช่บับเบิลสีร้าน
 */
function isRealCard(el: { subtitle?: string; image_url?: string; buttons?: unknown[] } | undefined): boolean {
  if (!el) return false
  return !!el.subtitle?.trim() || !!el.image_url || (Array.isArray(el.buttons) && el.buttons.length > 0)
}

/**
 * "การ์ดสินค้าแบบ carousel จาก Facebook" (2026-08-09) — ChatMessage.cards
 *
 * composeStructuredText() ยุบ elements[] ทั้งชุดเหลือแค่ข้อความสรุปบรรทัดเดียว (การ์ดแรก + "และอีก
 * N รายการ") ทิ้ง image_url และ element ที่ 2 เป็นต้นไปหมด — ฟังก์ชันนี้สกัดโครงสร้างเต็มออกมาแยก
 * ต่างหาก (pure — ไม่ยิง network) ให้ ingestInboundMessage เอาไป mirror รูปแล้วเก็บลงคอลัมน์ `cards`
 * โดย `body` (ข้อความสรุป) ยังคงเดิมทุกประการ — ปุ่ม "คัดลอกข้อความ"/"ตอบกลับ" ในเธรดผูกกับ body
 *
 * ครอบเฉพาะ generic template (attachment.type='template', payload.template_type='generic') — carousel
 * สินค้าที่ Business Suite/Meta Commerce ส่งมาเป็นรูปแบบนี้เท่านั้น ไม่ครอบ receipt/icon-template
 * (การ์ดโทร ดู classifyCallTemplate)/button template ซึ่งมีความหมายอื่น
 *
 * เพดาน 10 ใบ = ข้อจำกัดของ generic template เอง (Meta ไม่ส่งเกิน 10 elements ต่อการ์ดอยู่แล้ว —
 * ตัดป้องกันไว้เผื่อ payload ผิดปกติ ไม่ให้การ์ดยาวเกินจอ)
 */
export interface GenericCardElement {
  title: string | null
  subtitle: string | null
  imageUrl: string | null
}

const MAX_GENERIC_CARDS = 10

export function extractGenericCards(
  attType: string | undefined,
  payload: AttPayloadStructured | undefined,
): GenericCardElement[] | null {
  if (attType !== 'template' || payload?.template_type !== 'generic') return null
  const els = payload.elements
  if (!els || els.length === 0) return null
  const real = els.filter((el) => isRealCard(el))
  if (real.length === 0) return null
  /**
   * 🛑 ต้องมีอย่างน้อย 1 ใบที่มี `image_url` ถึงจะนับว่าเป็น "การ์ดสินค้า"
   *
   * `template_type: 'generic'` ไม่ได้แปลว่าเป็นสินค้า — Meta ใช้โครงเดียวกันกับการ์ดคำขอชำระเงิน
   * และการ์ดขอโทรกลับด้วย. ยืนยันกับฐาน prod (2026-08-09 ตอนรัน backfill แบบ dry-run):
   * generic template ที่ **ไม่มี** image_url 54 ใบ เป็น `฿360.00 order` / `Transfer requested` /
   * `Call request sent` ล้วน ๆ ไม่มีสินค้าปนสักใบ ส่วนการ์ดสินค้าจริงมี image_url ครบทุกใบ
   *
   * ถ้าไม่กั้น การ์ดคำขอชำระเงินจะกลายเป็นการ์ดที่มี "กล่องรูปเทาว่างเปล่า" แทนบรรทัดระบบสะอาด ๆ
   * แบบเดิม — แย่ลงกว่าเดิมชัดเจน (ของพวกนี้ไม่มีรูปตั้งแต่ต้นทาง ไม่ใช่ mirror ล้มเหลว)
   *
   * ไม่มีรูปเลย → คืน null → ตกไปใช้ `body` (บรรทัดสรุป) เหมือนเดิมทุกประการ
   * ส่วนเคส "mirror ล้มเหลว" ยังได้ placeholder ถูกต้อง เพราะตอนนั้น image_url **มี** แต่โหลดไม่ผ่าน
   */
  if (!real.some((el) => el.image_url)) return null
  return real.slice(0, MAX_GENERIC_CARDS).map((el) => ({
    title: el.title?.trim() || null,
    subtitle: el.subtitle?.trim() || null,
    imageUrl: el.image_url ?? null,
  }))
}

/**
 * แยก "การ์ดของ Meta ที่เป็นเหตุการณ์โทรจริง" ออกจากการ์ดอื่น ๆ
 *
 * export เพราะสคริปต์ backfill ต้องใช้เกณฑ์ **ตัวเดียวกัน** กับที่ ingest ใช้ — ถ้าลอกไปเขียนซ้ำ
 * วันหนึ่งจะได้แถวเก่ากับแถวใหม่ที่ตัดสินคนละแบบในฐานเดียวกันโดยไม่มีใครรู้
 *
 * โครงจริงจาก prod:
 *   { template_type: "icon-template",
 *     elements: [{ title: "Audio call", subtitle: "14 sec", buttons:[{title:"Call", url:"…business_call…"}] }] }
 *
 * ข้อห้าม: ห้ามตัดสินจาก title ภาษาอังกฤษอย่างเดียว — **Meta แปลข้อความบนการ์ดตามภาษาของ "ลูกค้า"
 * ไม่ใช่ภาษาเพจ** (ยืนยัน 2026-08-07: เพจเดียวมีการ์ดอังกฤษ 4 เขมร `ហៅទូរសព្ទ` 1 ไทยที่เหลือ)
 * "มีระยะเวลา" เป็นโครงสร้างไม่ใช่ถ้อยคำ — สายที่รับสายแล้วเท่านั้นที่มีความยาว
 *
 * `Call request sent` / `ส่งคำขอโทรแล้ว` = **การ์ดชวนให้โทร ไม่ใช่สาย** ต้องไม่เป็น CALL
 * ไม่งั้นจะขึ้นการ์ด "มีการโทรด้วยเสียง" ทั้งที่ไม่มีใครโทร
 */
export function classifyCallTemplate(
  attType: string | undefined,
  payload: AttPayloadStructured | undefined,
): { isCall: boolean; title: string | undefined } {
  if (attType !== 'template' || payload?.template_type !== 'icon-template') {
    return { isCall: false, title: undefined }
  }
  const el = payload.elements?.[0]
  const title = el?.title?.trim()
  return { isCall: isCallCard(title, el?.subtitle?.trim()), title }
}

/**
 * แกนของเกณฑ์ "สายจริง" แยกออกมาเพื่อให้ **ฝั่ง Graph ใช้ได้ด้วย** — Graph คืนการ์ดเป็น
 * `generic_template` ไม่มี `template_type: 'icon-template'` ให้ดู (คนละโครงกับ webhook)
 * ถ้าไม่แยกออกมา สคริปต์ backfill จะต้องลอกเกณฑ์ไปเขียนซ้ำแล้วรอวันที่มันเลื่อนออกจากกัน
 */
export function isCallCard(title: string | undefined, subtitle: string | undefined): boolean {
  const hasDuration = !!subtitle && /\d/.test(subtitle) && /\b(sec|min|hr|hour|วิ|นาที|ชม)/i.test(subtitle)
  return title === 'Missed call' || title === 'Audio call' || hasDuration
}

export function composeStructuredText(
  attType: string | undefined,
  payload: AttPayloadStructured | undefined,
): string | null {
  if (!attType || !payload) return null
  if (attType === 'location' && payload.coordinates) {
    const { lat, long } = payload.coordinates
    return `[ตำแหน่งที่ตั้ง] เปิดใน Google Maps: https://maps.google.com/?q=${lat},${long}`
  }
  if (attType === 'template') {
    // receipt = ใบสรุปคำสั่งซื้อเต็มรูป
    if (payload.template_type === 'receipt') {
      const total = payload.summary?.total_cost
      const num = payload.order_number ? ` #${payload.order_number}` : ''
      const amt = typeof total === 'number' ? ` — ยอดรวม ฿${total.toLocaleString('th-TH')}` : ''
      return `สรุปคำสั่งซื้อ${num}${amt}`
    }
    // button template (คำขอชำระเงิน/ดูออเดอร์) มี text สรุปในตัว เช่น "You requested ฿590..."
    if (payload.text && payload.text.trim().length > 0) return payload.text
    // generic/carousel/icon-template → ชื่อรายการแรก + จำนวนที่เหลือ
    const els = payload.elements
    if (els && els.length > 0 && els[0]?.title) {
      const el = els[0]
      const more = els.length > 1 ? ` และอีก ${els.length - 1} รายการ` : ''
      // การ์ดจริง → คำนำหน้า + subtitle ด้วย (bug จริง prod: "฿360.00 order" ขึ้นเป็นบับเบิลสีร้าน
      // เหมือนแอดมินพิมพ์เอง 63 แถว และ subtitle "Waiting for payment" ถูกโยนทิ้งทั้งที่มีมาในมือ)
      // ปุ่มบนการ์ด (`buttons[].title` เช่น "Attach bank slip") ไม่เอามาแสดง — เรากดแทนลูกค้าไม่ได้
      // การเขียนชื่อปุ่มลงไปคือการโฆษณาสิ่งที่กดไม่ได้
      if (isRealCard(el)) {
        const sub = el.subtitle?.trim() ? ` — ${el.subtitle.replace(/\s+/g, ' ').trim()}` : ''
        return `${CARD_PREFIX} ${el.title!.replace(/\s+/g, ' ').trim()}${sub}${more}`
      }
      return `${el.title}${more}`
    }
  }
  return null
}

export async function ingestInboundMessage(params: {
  provider: string
  pageExternalId: string
  event: MessagingEvent
  /** event ดิบก่อน Valibot parse (2026-08-03) — เก็บลง rawMessage แทนตัวที่ถูกตัด field ทิ้งแล้ว */
  rawEvent?: unknown
  /**
   * event นี้มาจากกล่อง `standby` = **ตอนนั้นเราไม่ใช่เจ้าของเธรด** (2026-08-08)
   * เดิม webhook route รู้ค่านี้แต่ log แล้วทิ้ง ไม่เคยส่งเข้ามา — หน้าจอจึงบอกผู้ขายไม่ได้ว่า
   * "Meta AI กำลังตอบห้องนี้อยู่" ทั้งที่ข้อมูลผ่านมือเราทุกครั้ง
   */
  standby?: boolean
}): Promise<{
  status: IngestStatus
  conversationId?: string
  // --- feature 00023 (additive) — caller ใช้สร้าง AutoReplyJob; ไม่ใช้ก็ไม่กระทบอะไร ---
  headMessageId?: string
  shopId?: string
  senderRole?: string
  /** true เมื่อ event.message.text มีเนื้อความจริง (ไม่ใช่ placeholder ที่เราเขียนเองตอน mirror ไม่ผ่าน) */
  hasCustomerText?: boolean
}> {
  const { provider, pageExternalId, event } = params

  // event ที่ไม่ใช่ข้อความ (delivery/read receipt ฯลฯ) — ไม่ใช่ error แค่ไม่สนใจ
  if (!event.message?.mid) return { status: 'IGNORED' }

  const channel = await getChannelByExternalId(provider, pageExternalId)
  // Page ที่ไม่มีร้านไหนเชื่อม — ตอบ 200 ให้ Meta เสมอ ไม่งั้นจะ retry ไม่จบ
  if (!channel) return { status: 'NO_CHANNEL' }

  // unsend (feature 00018 Phase 3): ผู้ส่งลบข้อความ — mark isDeleted บนข้อความเดิม (ไม่สร้างใหม่)
  // ล้าง body/imageUrl (ไม่เก็บเนื้อหาที่ถูกลบ). scope channel กันข้ามร้าน. mid = ข้อความที่ถูกลบ
  if (event.message.is_deleted) {
    await prisma.chatMessage.updateMany({
      where: { externalMessageId: event.message.mid, conversation: { shopChannelId: channel.id } },
      data: { isDeleted: true, body: null, imageUrl: null, reactionEmoji: null },
    })
    return { status: 'STORED' as const }
  }

  // is_echo = ข้อความจากฝั่งเพจ (seller ตอบจากแอป Messenger เอง หรือ echo ของที่เราส่ง)
  // ผู้ติดต่อคือ "อีกฝั่ง" เสมอ → echo ใช้ recipient, ไม่ใช่ sender
  const isEcho = event.message.is_echo === true
  const contactExternalId = isEcho ? event.recipient.id : event.sender.id
  const senderRole = isEcho ? 'SHOP' : 'BUYER'

  const contactWhere = {
    shopChannelId_externalUserId: { shopChannelId: channel.id, externalUserId: contactExternalId },
  }
  const existingContact = await prisma.externalContact.findUnique({ where: contactWhere })

  // ดึงโปรไฟล์จาก Graph เฉพาะตอนยังไม่มี contact หรือมีแต่ยังไม่มีชื่อ — ลด Graph call ต่อข้อความ
  // (Minor-5) และกัน Graph error ชั่วคราวทับชื่อจริงที่เก็บไว้แล้วเป็น null (I-2)
  //
  // เงื่อนไข "รูป" แยกจาก "ชื่อ" เพราะทั้งสองมาคนละชั้นและมีโอกาสสำเร็จไม่เท่ากัน (ดู
  // getContactProfile) — คนที่ได้ชื่อครบแล้วแต่ยังไม่มีรูปต้องมีสิทธิ์ถูกลองใหม่ ไม่งั้นวันที่
  // Advanced Access ผ่าน จะไม่มีใครได้รูปเลยเพราะทุกคน "มีชื่อแล้ว" ไปหมด
  const needsAvatarRetry = shouldRetryAvatar(existingContact)
  const needsProfile = !existingContact || !existingContact.name || needsAvatarRetry
  const profile = needsProfile
    ? await getAdapter(provider).fetchContactProfile(
        { provider, accessToken: channel.accessToken },
        contactExternalId,
      )
    : { name: null, avatarUrl: null }

  // URL รูปโปรไฟล์ของ Meta ฝังเวลาหมดอายุมาใน `oe=` — เก็บ URL ดิบไว้เฉย ๆ แล้วรูปจะตายเงียบ ๆ
  // ในไม่กี่วัน (เจอจริง: รูป IG ที่เก็บไว้ 5 ส.ค. กลายเป็น HTTP 403 ตอน 9 ส.ค. แล้ว <img onError>
  // ตกไปตัวอักษรย่อ โดยไม่มีอะไรฟ้อง) → mirror ลง storage เราเป็น fileId เหมือนที่ทำกับรูปในแชท
  const mirroredAvatar = profile.avatarUrl ? await mirrorRemoteImage(profile.avatarUrl) : null
  // mirror ไม่ผ่านก็ยังเก็บ URL ดิบไว้ก่อน — เห็นรูปวันนี้ดีกว่าไม่เห็นเลย และ shouldRetryAvatar
  // มองว่าค่าที่ขึ้นต้น http คือ "ยังไม่เรียบร้อย" จึงจะถูกลองอัปเกรดใหม่รอบหน้าเอง
  const avatarToStore = mirroredAvatar ?? profile.avatarUrl

  const contact = await prisma.externalContact.upsert({
    where: contactWhere,
    create: {
      shopChannelId: channel.id,
      externalUserId: contactExternalId,
      name: profile.name,
      avatarUrl: avatarToStore,
      avatarSyncedAt: new Date(),
    },
    // อัปเดตเฉพาะ field ที่ได้ค่าจริงจาก Graph — ไม่ทับด้วย null ตอน Graph error ชั่วคราว (I-2)
    update: {
      ...(profile.name ? { name: profile.name } : {}),
      ...(avatarToStore ? { avatarUrl: avatarToStore } : {}),
      // ประทับเวลาทุกครั้งที่ "ลอง" ไม่ใช่เฉพาะตอนสำเร็จ — ไม่งั้นคนที่ Meta ไม่ยอมให้รูป
      // (ลูกค้าทั่วไปทั้งหมดในวันนี้) จะโดนยิง Graph ซ้ำทุกข้อความตลอดไป
      ...(needsProfile ? { avatarSyncedAt: new Date() } : {}),
    },
  })

  const text = event.message.text ?? null
  // feature 00023 (TD-007): "ลูกค้าพิมพ์ข้อความจริงมาไหม" — ต้องดูจาก payload ของ Meta ตรงนี้
  // ไม่ใช่จาก ChatMessage.body ที่เขียนลง DB เพราะ body อาจเป็น placeholder ที่ "เราเขียนเอง"
  // เมื่อ mirror ไฟล์ไม่ผ่าน (เช่น "[ลูกค้าส่งรูปภาพ — เปิดดูใน Messenger]") ซึ่งถ้าเอาไปจับคู่
  // กลุ่มคำ ร้านที่มีคำว่า "รูป" จะโดนระบบตอบราคาสินค้าใส่ตอนลูกค้าส่งสติกเกอร์
  const hasCustomerText = !!text && text.trim().length > 0
  const firstAttachment = event.message.attachments?.[0]
  // ชนิดหาย (Meta ส่งมาไม่ครบ — เจอจริง 2026-08-04 กับรูป 6 ใบ) → มี url ก็ถือว่าเป็นรูป
  // ชนิดจริงถูกเดาอีกชั้นจาก content-type ตอน mirror อยู่แล้ว (contentTypeToExt) จึงปลอดภัยกว่า
  // การทิ้งข้อความทั้งก้อน
  const attType =
    firstAttachment?.type ?? (firstAttachment?.payload?.url ? 'image' : undefined) // 'image'|'video'|'audio'|'file'|'location'|'fallback'|...
  // attachment.type → ChatMessage.type (feature 00018, user request 2026-07-24 "รองรับทุกอย่าง")
  // Meta attachment types เต็มชุด (จาก docs): media = มี asset จริงบน Meta CDN ให้ mirror ได้;
  // sticker เป็นรูป (มี url) — เดิมตกเป็น placeholder ทั้งที่พบบ่อยสุด; reel/ig_reel เป็นวิดีโอ
  const MEDIA_TYPE: Record<string, string> = {
    image: 'IMAGE',
    sticker: 'IMAGE',
    video: 'VIDEO',
    reel: 'VIDEO',
    ig_reel: 'VIDEO',
    audio: 'AUDIO',
    file: 'FILE',
    // story_mention (IG): รูป/วิดีโอสตอรี่ที่ลูกค้า mention เพจ — URL หมดอายุเมื่อสตอรี่หมด mirror best-effort
    story_mention: 'IMAGE',
  }
  // ลิงก์/โพสต์ที่ลูกค้าแชร์ — payload.url เป็น URL ภายนอก (ไม่ใช่ asset บน Meta CDN) mirror ไม่ได้
  // และไม่ควร (host allow-list บล็อกอยู่แล้ว) → แสดง title + url เป็นข้อความ ให้ร้านเห็นว่าลูกค้าแชร์อะไร
  const LINK_TYPES = new Set(['fallback', 'post', 'ig_post'])

  const attUrl = firstAttachment?.payload?.url
  const attTitle = firstAttachment?.payload?.title
  const isMedia = !!attType && !!MEDIA_TYPE[attType]
  const isLink = !!attType && LINK_TYPES.has(attType) && !!attUrl
  const isImageLike = attType === 'image' || attType === 'sticker'

  // ต้อง mirror ก่อนเข้า transaction — network call ในทรานแซกชันจะถือ lock DB นานเกินไป
  let mirroredFileId = isMedia && attUrl ? await mirrorRemoteImage(attUrl) : null
  // fallback (user report 2026-07-25: ข้อความเสียง Messenger ยัง mirror ไม่ผ่าน): media ที่ webhook
  // ไม่ส่ง payload.url มา หรือ url นั้น fetch ไม่ได้/หมดอายุ → ดึง file_url สดจาก Graph ด้วย mid แล้ว mirror
  // (Messenger voice message เจอเคส payload.url หายบ่อย — Graph คืน url สดที่ยังโหลดได้ host fbsbx)
  if (isMedia && !mirroredFileId && event.message.mid) {
    const { url: graphUrl } = await getAdapter(provider).downloadContent(
      { provider, accessToken: channel.accessToken },
      { externalMessageId: event.message.mid },
    )
    if (graphUrl) mirroredFileId = await mirrorRemoteImage(graphUrl)
  }
  // ข้อความลิงก์ที่แชร์ (fallback/post/ig_post) — ประกอบ title + url เป็น text
  const linkText = isLink ? (attTitle ? `${attTitle}\n${attUrl}` : attUrl!) : null

  // หลายรูป/สื่อในหนึ่ง event: Messenger ส่งหลายรูปพร้อมกัน = attachments[] หลายตัวใน event เดียว —
  // เดิมเก็บแค่ attachments[0] → web app เห็นรูปเดียว (user report 2026-07-24). mirror ตัวที่ 2 เป็นต้นไป
  // แล้วสร้าง ChatMessage เพิ่มต่อรูป (album UI จะจับกลุ่มเป็นอัลบั้มเอง). externalMessageId ต่อท้าย #i กัน
  // ชน unique (mid เดียวทั้ง event) — redelivery ชนตัวแรก tx abort → DUPLICATE เหมือนเดิม
  //
  // dedup (user report 2026-07-25: สติกเกอร์ส่งครั้งเดียวขึ้น 2 อัน): Messenger ส่งสติกเกอร์บางตัวเป็น
  // attachment ซ้ำ 2 ชิ้นใน event เดียว → loop นี้เคย mirror ตัวซ้ำเป็นข้อความที่ 2
  //
  // สำคัญ: ต้องคีย์ด้วย **url ก่อน** แล้วค่อยตกไป sticker_id (user report prod 2026-08-04 "มันดันส่ง 2 ที
  // ทั้ง ๆ ที่ผมกดส่งทีเดียว"): ตั้งแต่ Sticker API รอบใหม่ Meta ส่งสติกเกอร์ 1 ใบมาเป็น attachment
  // 2 ชิ้นที่ **ชนิดต่างกันแต่ url เดียวกัน** — `{type:'sticker', payload:{sticker_id,url}}` +
  // `{type:'image', payload:{url}}` (เอกสาร Sticker API ระบุเองว่าเป็นช่วงเปลี่ยนผ่าน 90 วัน
  // ถึง 30 ส.ค. 2026 หลังจากนั้นจะเหลือแต่ชนิด sticker)
  // คีย์แบบเดิม (sticker_id ก่อน) ทำให้ชิ้นแรกได้ `s:<id>` ชิ้นที่สองได้ `u:<url>` = คนละคีย์ →
  // หลุด dedup ทั้งคู่. คีย์ด้วย url จับได้ทั้งสองชิ้นเพราะ url ตรงกันเป๊ะ และยังไม่กระทบการส่ง
  // หลายรูปจริง (url ต่างกันทุกใบ)
  const allAttachments = event.message.attachments ?? []
  const attKey = (a: (typeof allAttachments)[number] | undefined): string | null =>
    a?.payload?.url
      ? `u:${a.payload.url}`
      : a?.payload?.sticker_id != null
        ? `s:${a.payload.sticker_id}`
        : null
  const seenAttKeys = new Set<string>()
  const firstKey = attKey(firstAttachment)
  if (firstKey) seenAttKeys.add(firstKey)
  const extraMedia: { fileId: string; type: string }[] = []
  for (let i = 1; i < allAttachments.length; i++) {
    const a = allAttachments[i]
    const t = a?.type ?? (a?.payload?.url ? 'image' : undefined)
    const url = a?.payload?.url
    if (!t || !MEDIA_TYPE[t] || !url) continue
    const key = attKey(a)
    if (key && seenAttKeys.has(key)) continue // attachment ซ้ำ (สติกเกอร์เดียวกัน) — ข้าม ไม่สร้างข้อความซ้ำ
    if (key) seenAttKeys.add(key)
    const fid = await mirrorRemoteImage(url)
    if (fid) extraMedia.push({ fileId: fid, type: MEDIA_TYPE[t] })
  }

  // การ์ดสินค้าแบบ carousel จาก Facebook (generic template, 2026-08-09) — mirror รูปทุกใบ "นอก
  // transaction" เหมือน extraMedia ด้านบน (network call ในทรานแซกชันถือ lock DB นานเกินไป)
  // image_url ของ Meta หมดอายุใน ~4 วัน (ยืนยันจาก payload จริง prod: `oe=` param) — เก็บ URL ดิบไว้
  // การ์ดเธรดเก่าจะกลายเป็นรูปแตกทั้งหมดภายในสัปดาห์เดียว
  const genericCardElements = extractGenericCards(attType, firstAttachment?.payload)
  const cards: { title: string | null; subtitle: string | null; imageFileId: string | null }[] | null =
    genericCardElements
      ? await Promise.all(
          genericCardElements.map(async (el) => ({
            title: el.title,
            subtitle: el.subtitle,
            // mirror ล้มเหลว (URL หมดอายุ/host ไม่อยู่ allow-list) → null ห้าม throw ทั้งข้อความ —
            // การ์ดยังต้องขึ้นได้โดยไม่มีรูป (placeholder icon ฝั่ง UI)
            imageFileId: el.imageUrl ? await mirrorRemoteImage(el.imageUrl) : null,
          })),
        )
      : null

  // เหตุการณ์การโทร (2026-08-03) — Meta ส่งมาทาง webhook `messages` ปกติ ไม่ใช่ field `calls`
  // เป็น attachment template ชนิด `icon-template`:
  //   { template_type: "icon-template",
  //     elements: [{ title: "Missed call", subtitle: "Call again", image_url: "…" }] }
  // (payload จริงจาก prod 2026-08-03 — เก็บได้เพราะเพิ่ง เปิด ChatMessage.rawMessage)
  //
  // ติดป้ายเป็น type='CALL' ตั้งแต่ตอน ingest แทนการให้ฝั่ง render ไปเดาจาก body — body เป็น
  // ภาษาอังกฤษของ Meta ซึ่งเปลี่ยนเมื่อไรก็ได้ ถ้าผูก UI กับสตริงนั้นจะพังเงียบ ๆ วันที่ Meta แก้คำ
  const call = classifyCallTemplate(attType, firstAttachment?.payload)
  const callTitle = call.title
  const isCallEvent = call.isCall

  const type = isCallEvent
    ? 'CALL'
    : mirroredFileId && attType && MEDIA_TYPE[attType]
      ? MEDIA_TYPE[attType]
      : isImageLike
        ? 'IMAGE' // รูป/สติกเกอร์ที่ mirror ไม่ผ่าน → คง IMAGE (imageUrl null + placeholder)
        : 'TEXT' // media อื่นที่ mirror ไม่ผ่าน / ลิงก์ / ชนิดที่ไม่มี asset → TEXT
  const hasAttachment = !!firstAttachment
  // diagnostic: media ที่ mirror ไม่ผ่าน — log ชนิด+host ไว้ดูว่าทำไม (host นอก allow-list/ขนาดเกิน 25MB/
  // fetch error) เพื่อไล่เก็บเคสที่เหลือ (ตอนนี้รองรับทุก content-type แล้ว เหลือแค่ 3 สาเหตุนี้)
  if (isMedia && !mirroredFileId) {
    let host = '(no url)'
    try {
      if (attUrl) host = new URL(attUrl).hostname
    } catch {
      host = '(invalid url)'
    }
    console.warn('[fb-ingest] media mirror failed', { attType, host, hasUrl: !!attUrl })
  }
  const hasText = !!text && text.trim().length > 0
  // ประกอบข้อความสรุปจาก field ที่ parse มาแล้ว (template order/payment/receipt/generic + location) —
  // มาก่อน Graph fetch: ถ้าประกอบเองได้ไม่ต้องยิง Graph เลย (fix เคส user 2026-07-25 "รองรับทุกอัน")
  const structuredText = composeStructuredText(attType, firstAttachment?.payload)
  // enrich (user 2026-07-24): attachment ที่ Meta สังเคราะห์ "ข้อความสรุป" แต่เราประกอบเองไม่ได้ + ไม่มี
  // text/link/media → ดึงข้อความที่ render แล้วจาก Graph. skip ถ้าประกอบเอง (structuredText) ได้แล้ว
  let renderedText: string | null = null
  if (!hasText && !isLink && !structuredText && hasAttachment && !mirroredFileId && attType && !isMedia && event.message.mid) {
    renderedText = await fetchMessageText(event.message.mid, channel.accessToken)
  }
  // diagnostic: attachment ที่ยังแสดงเนื้อหาไม่ได้เลย (ประกอบเองไม่ได้ + Graph render ว่าง) — log
  // ชนิด + keys ของ payload ดิบ + isEcho ไว้ finalize schema เพิ่ม. รวม template ด้วย (user 2026-07-25:
  // "[ข้อความจากระบบ (ออเดอร์/ชำระเงิน)]" 19/21 เป็น echo ฝั่งเพจ, Graph คืน message ว่าง+ไม่มี attachment
  // → ต้องดูว่า webhook payload ดิบมี field อะไรให้ดึงได้ไหม) — ไม่ log ค่า (กัน PII) log แค่ key
  if (hasAttachment && !isMedia && !isLink && !structuredText && !renderedText && attType) {
    console.warn('[fb-ingest] unhandled attachment', {
      attType,
      isEcho,
      payloadKeys: Object.keys(firstAttachment?.payload ?? {}),
    })
  }
  // ลำดับข้อความที่จะแสดง: text จริง > ลิงก์แชร์ > ข้อความสรุปที่ประกอบเอง (template/location) > Graph render
  //
  // ข้อยกเว้น type='CALL': เก็บ `title` ดิบไว้ ห้ามใส่คำนำหน้า `[การ์ดจาก Facebook]`
  // เพราะฝั่ง render อ่าน `body === 'Missed call'` เพื่อแยก "สายที่ไม่ได้รับ" ออกจาก "มีการโทรด้วยเสียง"
  // (ChatThread.tsx ~1700) ถ้าใส่คำนำหน้าไป สายที่ไม่ได้รับจะกลายเป็น "มีการโทรด้วยเสียง" ทุกใบเงียบ ๆ
  // — การ์ดโทรมี subtitle ("Call again"/"14 sec") จึงเข้าเงื่อนไข isRealCard() เต็ม ๆ ถ้าไม่กันตรงนี้
  const displayText = isCallEvent
    ? (callTitle ?? structuredText)
    : hasText
      ? text
      : isLink
        ? linkText
        : (structuredText ?? renderedText)
  const hasDisplayText = !!displayText && displayText.trim().length > 0
  // placeholder เฉพาะชนิด (I-5, user 2026-07-24) — ไม่ใช่ "[ไฟล์แนบ]" รวมทุกชนิด. ใช้เมื่อไม่มี text จริง
  // และดึงข้อความ render จาก Graph ไม่ได้ (offline/หมดเวลา) — อย่างน้อยบอกชนิดให้ถูก. sticker/reel/ig_reel/
  // post/ig_post = alias ของ image/video/fallback ตามลำดับ (feature 00018 attachment types เต็มชุด)
  const FAILED_TEXT_BY_TYPE: Record<string, string> = {
    image: MIRROR_FAILED_TEXT,
    sticker: MIRROR_FAILED_TEXT,
    video: '[วิดีโอ — เปิดดูใน Messenger]',
    reel: '[วิดีโอ — เปิดดูใน Messenger]',
    ig_reel: '[วิดีโอ — เปิดดูใน Messenger]',
    audio: '[ข้อความเสียง — เปิดดูใน Messenger]',
    file: '[ไฟล์แนบ — เปิดดูใน Messenger]',
    location: '[ตำแหน่งที่ตั้ง — เปิดดูใน Messenger]',
    fallback: '[ลิงก์/โพสต์ที่แชร์ — เปิดดูใน Messenger]',
    post: '[ลิงก์/โพสต์ที่แชร์ — เปิดดูใน Messenger]',
    ig_post: '[ลิงก์/โพสต์ที่แชร์ — เปิดดูใน Messenger]',
    template: '[ข้อความจากระบบ (ออเดอร์/ชำระเงิน) — เปิดดูใน Messenger]',
    story_mention: '[กล่าวถึงในสตอรี่ — เปิดดูใน Instagram]',
  }
  const attachmentFailedText = (attType && FAILED_TEXT_BY_TYPE[attType]) ?? UNSUPPORTED_ATTACHMENT_TEXT
  // ข้อความที่ไม่มีทั้ง text และ attachment (ชนิดพิเศษที่ Messenger ส่ง message มาแต่ไม่มีเนื้อหาที่
  // เราแสดงได้) → placeholder แทน body/preview ว่าง (บั๊กจริง prod: bubble ว่าง 2026-07-23)
  //
  // เคสที่ยืนยันแล้วว่าตกมาที่นี่ (user report 2026-07-26): ลูกค้ากด "Call me in Messenger"
  // — การ์ดขอโทรกลับ. ทั้ง webhook และ Graph (`GET /{mid}?fields=message,attachments`) คืน
  // `message: ""` ไม่มี attachments เลย → เนื้อหาการ์ดไม่ได้มาทางข้อความ ต้องเป็น webhook field
  // อื่นที่ยังไม่ได้ subscribe (ยังไม่รู้ว่าอันไหน — ดู console.warn ด้านล่างที่เก็บ payload ไว้สืบ)
  //
  // ถ้อยคำจึงบอก "เคสที่พบบ่อยสุด" โดยไม่ฟันธงว่าเป็นการโทรเสมอ — เขียนว่า "ไม่รองรับการโทรกลับ"
  // ตรง ๆ จะโกหกเมื่อเจอชนิดอื่นที่ตกมาทางเดียวกัน
  const emptyMessageText = '[ข้อความพิเศษ เช่น คำขอโทรกลับ — ระบบยังไม่รองรับ เปิดดูใน Messenger]'
  // ข้อความจริง/สรุปจาก Graph มาก่อน placeholder แนบไฟล์เสมอ (bug prod 2026-07-24: template/order ที่มี
  // ข้อความถูกทับด้วย "[ไฟล์แนบ]" ทิ้งเนื้อหาจริง) — placeholder เฉพาะตอน "ไม่มีข้อความให้แสดงจริง ๆ"
  const body = mirroredFileId ? text : hasDisplayText ? displayText : hasAttachment ? attachmentFailedText : emptyMessageText
  // diagnostic (2026-07-26): ข้อความที่ไม่มีทั้ง text และ attachment — ตอนนี้รู้แค่ว่าเคสหนึ่งคือ
  // การ์ด "ขอโทรกลับ" แต่ยังระบุไม่ได้ว่ามาทาง field ไหน. log "คีย์" ของ message + ของ event
  // (ไม่ log ค่า — กัน PII) ไว้ให้ครั้งหน้าที่เกิด จะได้รู้ว่ามีอะไรติดมาบ้างที่เรายังไม่ได้ parse
  if (!hasDisplayText && !hasAttachment) {
    console.warn('[fb-ingest] empty message (ไม่มี text/attachment)', {
      messageKeys: Object.keys(event.message ?? {}),
      eventKeys: Object.keys(event),
      isEcho,
    })
  }
  const previewByType: Record<string, string> = {
    IMAGE: '[รูปภาพ]',
    VIDEO: '[วิดีโอ]',
    AUDIO: '[ข้อความเสียง]',
    FILE: '[ไฟล์แนบ]',
  }
  // preview ใน list (left menu) ต้อง "สั้นเสมอ" แม้ mirror ล้ม (user report 2026-07-25: ขึ้น
  // "[ข้อความเสียง — เปิดดูใน Messenger]" ยาวใน list) — ใช้ label สั้นตาม attType ไม่ใช้ placeholder ยาว
  // (placeholder ยาวคง body ในบับเบิลไว้เป็นคำแนะนำตอนเปิดไม่ได้ แต่ list ต้องกระชับ)
  const SHORT_PREVIEW_BY_ATTTYPE: Record<string, string> = {
    image: '[รูปภาพ]',
    sticker: '[รูปภาพ]',
    video: '[วิดีโอ]',
    reel: '[วิดีโอ]',
    ig_reel: '[วิดีโอ]',
    audio: '[ข้อความเสียง]',
    file: '[ไฟล์แนบ]',
    location: '[ตำแหน่งที่ตั้ง]',
    fallback: '[ลิงก์ที่แชร์]',
    post: '[ลิงก์ที่แชร์]',
    ig_post: '[ลิงก์ที่แชร์]',
    template: '[ข้อความจากระบบ]',
  }
  const singlePreview = isCallEvent
    ? // preview ในรายการแชทต้องเป็นไทยเหมือนการ์ดในเธรด — ถ้าปล่อยตกไปสาขา hasDisplayText
      // มันจะเอา title ของ Meta ("Missed call") มาแสดงดิบ ๆ คนละภาษากับที่เห็นตอนเปิดห้อง
      callTitle === 'Missed call'
      ? '[สายที่ไม่ได้รับ]'
      : '[มีการโทรด้วยเสียง]'
    : mirroredFileId
    ? (previewByType[type] ?? '[ไฟล์แนบ]')
    : // การ์ดของ Meta → label สั้นตัวเดียวกับ SHORT_PREVIEW_BY_ATTTYPE.template ไม่ใช่เนื้อหาจริง
      // ตัด 100 ตัวอักษร (บทเรียน user report 2026-07-25: placeholder ยาวไปโผล่ในรายการแชท)
      // ต้องมาก่อนสาขา hasDisplayText เพราะการ์ดมี displayText เสมอหลังแก้ 2026-08-07
      // การ์ดยอดเงินบอกยอดไปเลย — "[ข้อความจากระบบ]" ทำให้แถวที่สำคัญที่สุดในรายการ
      // (ลูกค้าถูกขอให้จ่ายเงิน) อ่านเหมือนข้อความอัตโนมัติทั่วไป ต้องตรงกับสาขา backfill
      // ด้านบนเสมอ — concept เดียวกันต้องอ่านเป็นคำเดียวกันทั้ง 2 ทางเข้า
      parseMetaOrderCard(displayText)
      ? `คำขอชำระเงิน ${parseMetaOrderCard(displayText)!.amount}`
      : displayText?.startsWith(CARD_PREFIX)
      ? '[ข้อความจากระบบ]'
      : hasDisplayText
      ? displayText!.slice(0, 100)
      : hasAttachment
        ? ((attType && SHORT_PREVIEW_BY_ATTTYPE[attType]) ?? '[ไฟล์แนบ]')
        : emptyMessageText
  // หลายรูป → preview บอกจำนวน "[N รูป]" (นับตัวแรก + extra) แทน "[รูปภาพ]" เดี่ยว
  const mediaCount = (mirroredFileId ? 1 : 0) + extraMedia.length
  const preview = mediaCount > 1 ? `[${mediaCount} รูป]` : singlePreview
  const occurredAt = event.timestamp ? new Date(event.timestamp) : new Date()
  const mid = event.message.mid

  const conversationWhere = {
    shopChannelId_externalContactId: { shopChannelId: channel.id, externalContactId: contact.id },
  }

  // เขียนข้อความ + snapshot ของเธรด (+ แจ้งเตือนถ้าเป็นข้อความจากลูกค้า) ให้ conversation ที่ resolve
  // แล้ว — แยกเป็นฟังก์ชันเพื่อใช้ซ้ำได้ทั้งเส้นทางปกติ และเส้นทาง retry หลังแพ้ race สร้างเธรด (I-1)
  // ต้องเป็น arrow function (ไม่ใช่ `function` ประกาศแยก) ไม่งั้น TS จะรีเซ็ต narrowing ของ
  // `channel` (ที่เช็ค !channel ไปแล้วด้านบน) เพราะ function declaration แบบ hoisted ถูกมองว่า
  // เรียกได้จากที่ไหนก็ได้ ทำให้ TS มองว่า channel เป็น null ได้อีก
  // feature 00023: คืน id ของ "ข้อความหลัก" (ไม่ใช่รูปที่ 2 เป็นต้นไป) ให้ caller เอาไปสร้าง
  // AutoReplyJob — การเพิ่มค่า return ไม่กระทบ caller เดิมที่เขียน `await writeMessage(...)` เฉย ๆ
  const writeMessage = async (tx: Prisma.TransactionClient, conversation: { id: string; isSpam: boolean }) => {
    const headMessage = await tx.chatMessage.create({
      data: {
        conversationId: conversation.id,
        senderUserId: null,
        senderRole,
        type,
        body,
        // imageUrl ของ chat เดิมเก็บเป็น fileId ของ storage ไม่ใช่ URL —
        // รูปจาก Meta มี URL หมดอายุ mirror เข้า storage ไว้แล้วนอก transaction ด้านบน (Task 12)
        imageUrl: mirroredFileId,
        externalMessageId: mid,
        // reply (Phase 3): externalMessageId ของข้อความที่ตอบทับ — UI ดึง quote มาแสดง
        replyToMid: event.message?.reply_to?.mid ?? null,
        deliveryStatus: 'SENT',
        // payload ดิบจาก platform (2026-08-03) — เก็บ event ทั้งก้อนตามที่ได้รับ ไม่ตัดอะไรออก
        // เพราะสิ่งที่จะต้องใช้สืบคือ "field ที่เรายังไม่รู้จัก" ตัดตอนเก็บ = ตัดคำตอบทิ้ง
        // อ่านไม่ได้จาก query ปกติ (global omit ที่ lib/prisma.ts)
        rawMessage: toRawMessage(params.provider, params.rawEvent ?? event),
        viaStandby: params.standby === true,
        // การ์ดสินค้าแบบ carousel จาก Facebook (2026-08-09) — mirror เสร็จแล้วนอก transaction
        // ด้านบน; ไม่มี = ข้อความนี้ไม่ใช่ generic template card (undefined → Prisma ไม่เซ็ตคอลัมน์
        // ปล่อยเป็น NULL ตาม default ของคอลัมน์ใหม่)
        ...(cards ? { cards: cards as Prisma.InputJsonValue } : {}),
      },
    })

    // รูป/สื่อที่ 2 เป็นต้นไปในหนึ่ง event (multi-image send) — 1 ChatMessage ต่อรูป, bare (body=null)
    // externalMessageId = `${mid}#${i}` กันชน unique (mid เดียวทั้ง event) — album UI จับกลุ่มเอง
    for (let i = 0; i < extraMedia.length; i++) {
      await tx.chatMessage.create({
        data: {
          conversationId: conversation.id,
          senderUserId: null,
          senderRole,
          type: extraMedia[i].type,
          body: null,
          imageUrl: extraMedia[i].fileId,
          externalMessageId: mid ? `${mid}#${i + 1}` : null,
          deliveryStatus: 'SENT',
          // event เดียวกับแถวหลัก (Meta ส่งหลายไฟล์มาใน event เดียว) — เก็บซ้ำเพื่อให้ทุกแถว
          // สืบต้นทางของตัวเองได้โดยไม่ต้องไปไล่หาแถวพี่
          rawMessage: toRawMessage(params.provider, params.rawEvent ?? event),
          viaStandby: params.standby === true,
        },
      })
    }

    await tx.conversation.update({
      where: { id: conversation.id },
      data: {
        // preview/senderRole อัปเดตเสมอ — seller ต้องเห็นข้อความล่าสุดจริงในรายการ
        lastMessagePreview: preview,
        lastSenderRole: senderRole,
        // lastMessageAt = ลำดับในรายการแชท — echo ไม่ขยับ (ผลตัดสิน user 2026-07-22)
        // echo คือ seller ตอบจากแอป Messenger ในมือถือ = จัดการไปแล้ว ไม่ต้องเด้งขึ้นบนสุด
        // ให้รก; เธรดจะเด้งขึ้นเฉพาะตอนลูกค้าทักมาใหม่ หรือ seller ตอบผ่าน Deep เอง
        // (sendOutboundMessage อัปเดต lastMessageAt แยกอยู่แล้ว)
        //
        // lastInboundAt ก็ไม่ขยับตอน echo ด้วยเหตุผลคนละข้อ — ถ้าขยับจะทำให้หน้าต่าง
        // 24 ชม. ยืดออกเองอย่างผิด ๆ ทุกครั้งที่ร้านตอบ
        //
        // isHidden/resolvedAt: BR-FBC-15/16 (S-7) — ลูกค้าทักมาใหม่ในเธรดที่ร้านซ่อน/ปิดงานไว้
        // → เด้งกลับให้เห็นอัตโนมัติ กันร้านพลาดข้อความ; echo (ร้านตอบเอง) ไม่ trigger
        //
        // สแปม (feature 00018, user สั่ง 2026-07-24): เธรดสแปม "ลูกค้าทักมาใหม่ไม่เด้งกลับ" (ต่างจาก
        // hide/resolve) — อัปเดต lastMessageAt/lastInboundAt (ลำดับในถังสแปม + 24h window) แต่ไม่รีเซ็ต
        // isHidden/resolvedAt และไม่แตะ isSpam → เธรดอยู่ในสแปมต่อ; ไม่ส่ง Notification ด้านล่างด้วย
        // ฝั่งเราตอบ (echo = ร้านตอบจากแอป Messenger / admin / FB auto-reply) = ถือว่า "อ่านแล้ว" →
        // ขยับ shopLastReadAt เพื่อ reset unread เทิร์นถัดไป (user report 2026-07-26: FB auto-reply
        // ทำ unread→read แต่ไม่ขยับ shopLastReadAt → ลูกค้าทักใหม่ นับซ้ำข้อความเทิร์นก่อนกลายเป็น 2)
        // ไม่ขยับ lastMessageAt/lastInboundAt ตามเดิม (echo ไม่เด้งลำดับ/ไม่ยืด 24h window)
        ...(isEcho
          ? { shopLastReadAt: new Date() }
          : conversation.isSpam
            ? { lastMessageAt: occurredAt, lastInboundAt: occurredAt }
            : { lastMessageAt: occurredAt, lastInboundAt: occurredAt, isHidden: false, resolvedAt: null }),
      },
    })

    // เลิกเขียน Notification kind="chat_message" (user สั่ง 2026-07-29) — ดูเหตุผลเต็มที่
    // chat.service.ts (จุดคู่กัน): ไม่มีผู้บริโภคจริง + เป็น INSERT ในทรานแซกชันรับข้อความ
    // ซึ่งที่นี่ยิ่งหนักกว่า เพราะเป็น webhook ขาเข้าจาก Messenger/IG ที่ Meta ยิงถี่
    // ร้านยังเห็นข้อความใหม่ผ่าน unreadChatCount (bottom nav/inbox) + realtime เหมือนเดิม

    // feature 00023: คืน id ของข้อความหลักให้ caller เอาไปสร้าง AutoReplyJob
    return headMessage.id
  }

  try {
    return await prisma.$transaction(async (tx) => {
      let conversation = await tx.conversation.findUnique({ where: conversationWhere })
      if (!conversation) {
        // referral ไม่เขียนตรงนี้แล้ว (E5 2026-07-26) — ย้ายไป ingestAdReferral ที่เรียกหลัง ingest
        // เสร็จ เพื่อให้ลูกค้า "เก่า" ที่กดโฆษณาตัวใหม่แล้วทักซ้ำอัปเดตด้วย ไม่ใช่แค่ตอนสร้างเธรด
        // (และเพื่อ mirror รูปโฆษณาได้ — network call ห้ามอยู่ในทรานแซกชัน)
        conversation = await tx.conversation.create({
          data: {
            shopId: channel.shopId,
            channel: provider,
            shopChannelId: channel.id,
            externalContactId: contact.id,
          },
        })
      }
      const headMessageId = await writeMessage(tx, conversation)
      return {
        status: 'STORED' as const,
        conversationId: conversation.id,
        headMessageId,
        shopId: channel.shopId,
        senderRole,
        hasCustomerText,
      }
    })
  } catch (e) {
    // ชนที่ externalMessageId = Meta ยิงข้อความซ้ำจริง หรือ echo ของข้อความที่เราส่งออกไปเอง
    // (เก็บ mid ไว้แล้วตอนส่ง) — ทั้งสองกรณีคือ "มีอยู่แล้ว" ไม่ใช่ error
    if (isUniqueViolationOn(e, 'externalMessageId')) return { status: 'DUPLICATE' }

    // ชนที่ (shopChannelId, externalContactId) = race สร้างเธรดพร้อมกัน — ลูกค้าใหม่ทัก 2 ข้อความ
    // รัว ๆ → Meta ยิง 2 webhook พร้อมกัน → ทั้งคู่ findUnique ได้ null แล้วแย่งกัน create เธรด
    // เดียวกัน ตัวแพ้ชน unique constraint นี้ นี่ไม่ใช่ "ข้อความซ้ำ" (I-1) แต่ทรานแซกชันเดิมถูก
    // Postgres rollback ทั้งก้อนไปแล้ว (constraint violation ทำให้ทรานแซกชันเข้าสถานะ aborted รัน
    // query ต่อในทรานแซกชันเดิมไม่ได้อีก) — ต้อง re-query "นอกทรานแซกชันเดิม" หาแถวที่ชนะ แล้วเปิด
    // ทรานแซกชันใหม่เขียนข้อความต่อ ไม่งั้นข้อความหายถาวร (pattern เดียวกับ getOrCreateConversation
    // ใน chat.service.ts)
    if (isUniqueViolationOn(e, 'externalContactId')) {
      const winner = await prisma.conversation.findUnique({ where: conversationWhere })
      if (winner) {
        try {
          return await prisma.$transaction(async (tx) => {
            const headMessageId = await writeMessage(tx, winner)
            return {
              status: 'STORED' as const,
              conversationId: winner.id,
              headMessageId,
              shopId: channel.shopId,
              senderRole,
              hasCustomerText,
            }
          })
        } catch (retryError) {
          // เอดจ์เคส: ข้อความเดียวกัน (mid เดิม) มาถึงซ้ำพอดีตอน retry — ยังคือ "มีอยู่แล้ว"
          if (isUniqueViolationOn(retryError, 'externalMessageId')) return { status: 'DUPLICATE' }
          throw retryError
        }
      }
    }

    throw e
  }
}

// ส่งข้อความจาก Deep ออกไปยัง Messenger/IG (feature 00018)
//
// ลำดับสำคัญ: ส่งออกก่อน → ได้ mid → ค่อยเขียน DB
// เพราะ echo webhook จะยิง mid เดียวกันกลับมา แล้ว unique constraint บน
// externalMessageId จะ dedupe ให้เอง ถ้าเขียน DB ก่อนส่งจะได้ข้อความซ้ำ 2 แถว
/**
 * ingestReadEvent — ลูกค้าอ่านข้อความของเพจ (Messenger message_reads) → เก็บ watermark ที่เธรด
 * (feature 00018 read receipt). sender = ลูกค้า (คนอ่าน), watermark = อ่านถึง timestamp นี้.
 * update เฉพาะเมื่อ watermark ใหม่กว่า (กัน event มาสลับลำดับ) — เธรด/เพจที่ไม่พบ = เงียบ (ตอบ 200)
 */
export async function ingestReadEvent(params: {
  provider: string
  pageExternalId: string
  contactExternalId: string
  watermark: number
}): Promise<void> {
  const channel = await getChannelByExternalId(params.provider, params.pageExternalId)
  if (!channel) return
  const contact = await prisma.externalContact.findUnique({
    where: { shopChannelId_externalUserId: { shopChannelId: channel.id, externalUserId: params.contactExternalId } },
    select: { id: true },
  })
  if (!contact) return
  const readAt = new Date(params.watermark)
  await prisma.conversation.updateMany({
    where: {
      shopChannelId: channel.id,
      externalContactId: contact.id,
      OR: [{ externalReadAt: null }, { externalReadAt: { lt: readAt } }],
    },
    data: { externalReadAt: readAt },
  })
}

/**
 * ingestDeliveryEvent — Meta ยืนยันว่าข้อความของเพจ "ถึงเครื่องลูกค้า" แล้ว (message_deliveries)
 *
 * ทำไมต้องมี (user report prod 2026-08-05 "ส่งรูปหลายใบแล้วขึ้นว่าส่งแล้วทั้งที่ฝั่ง Meta ยังไม่มีรูป"):
 * `deliveryStatus='SENT'` ที่เราเขียนตอน Send API ตอบ mid กลับมา **ไม่ใช่หลักฐานว่าข้อความอยู่ในแชท
 * ลูกค้าแล้ว** — Meta รับคำสั่งก่อน แล้วค่อยไปดึงไฟล์/ประมวลผลทีหลัง ยิ่งรูปหลายใบยิ่งเห็นช่องว่างชัด
 * event นี้คือสิ่งเดียวที่ยืนยันได้จริง จึงเป็นตัวปลดสถานะ "ได้รับแล้ว" ฝั่ง UI
 *
 * เขียนเป็น watermark (ไม่ใช่รายข้อความ) ด้วยเหตุผลเดียวกับ ingestReadEvent: Meta ให้ delivery มาเป็น
 * "ถึงหมดแล้วจนถึงเวลานี้" การเก็บรายแถวจะต้องไล่ update N แถวทุก event โดยไม่ได้ความแม่นเพิ่ม
 *
 * ห้าม throw: เธรด/เพจที่หาไม่เจอ = เงียบ (เหมือน ingestReadEvent) — delivery receipt เป็นข้อมูลเสริม
 * ถ้าพังต้องไม่ทำให้ webhook ทั้งก้อนล้มจนข้อความจริงหาย
 *
 * ข้อควรระวัง: Instagram ไม่ส่ง event นี้เลย เธรด IG จึงมี externalDeliveredAt = null ตลอดกาล
 * ฝั่ง UI ต้อง gate ด้วย channel ไม่ใช่ตีความ null ว่า "ยังไม่ถึง"
 */
export async function ingestDeliveryEvent(params: {
  provider: string
  pageExternalId: string
  contactExternalId: string
  watermark: number
}): Promise<void> {
  const channel = await getChannelByExternalId(params.provider, params.pageExternalId)
  if (!channel) return
  const contact = await prisma.externalContact.findUnique({
    where: { shopChannelId_externalUserId: { shopChannelId: channel.id, externalUserId: params.contactExternalId } },
    select: { id: true },
  })
  if (!contact) return
  const deliveredAt = new Date(params.watermark)
  await prisma.conversation.updateMany({
    where: {
      shopChannelId: channel.id,
      externalContactId: contact.id,
      // watermark ถอยหลังไม่ได้ — event ที่มาช้ากว่าของเดิมต้องไม่ลบสถานะที่ยืนยันไปแล้ว
      OR: [{ externalDeliveredAt: null }, { externalDeliveredAt: { lt: deliveredAt } }],
    },
    data: { externalDeliveredAt: deliveredAt },
  })
}

/**
 * ingestHandoverEvent — เก็บ event ของ `messaging_handovers` ลงตารางหลักฐาน (2026-08-08)
 *
 * 🛑 ทำไมต้องเขียนลงฐาน ทั้งที่ยังไม่มีใครใช้ค่านี้: เราต้องการ **app id ของ Meta AI** ซึ่งไม่มี
 * ในเอกสารสาธารณะเลย (Meta ให้มาแค่ Page Inbox 263902037430900 / IG Inbox 1217981644879628)
 * แต่จำเป็นต่อ `pass_thread_control` ถ้าจะให้ผู้ขาย "เปิด AI กลับ" จากในแอปเรา — ทางเดียวที่รู้ได้
 * คืออ่านจาก `previous_owner_app_id` / `new_owner_app_id` ของ event จริงตอนผู้ขายกดสลับใน
 * Business Suite. เดาเลขเองแล้วยิงคือความผิดคลาสเดียวกับที่ทำให้ 23 ออเดอร์บันทึกตำบล/อำเภอสลับกัน
 * (docs/conventions/external-payload-schema.md)
 *
 * เดิม webhook route แค่ `console.log('[fb-handover]')` ซึ่ง **อ่านย้อนหลังไม่ได้** — Vercel plan
 * ที่ใช้อยู่ไม่เปิด API ให้ query runtime log (ยืนยันแล้ว: /v1/deployments/{id}/runtime-logs 404,
 * /v2/.../events คืนแต่ build log) ผลคือทุกครั้งที่สงสัยว่า "Meta ส่งอะไรมาบ้าง" ต้องเดาเอาเอง
 *
 * ห้าม throw: เป็นข้อมูลสืบสวน ไม่ใช่เส้นทางหลัก พังแล้วต้องไม่ทำให้ Meta retry ทั้ง batch
 * (เหตุผลเดียวกับ ingestAdReferral) — ไม่ผูก FK จึงเก็บได้แม้เพจนั้นไม่มีร้านไหนเชื่อม
 */
export async function ingestHandoverEvent(params: {
  provider: string
  pageExternalId: string
  contactExternalId?: string | null
  kind: 'pass' | 'take' | 'request'
  previousOwnerAppId?: string | number | null
  newOwnerAppId?: string | number | null
  requestedOwnerAppId?: string | number | null
  metadata?: string | null
  standby?: boolean
  /** event ดิบก่อน Valibot — Valibot ตัด field ที่ไม่ได้ประกาศทิ้ง เก็บตัวที่ถูกตัดแล้วจะสืบไม่ได้ */
  rawEvent?: unknown
  /** event.timestamp (ms) ของ Meta */
  timestamp?: number | null
}): Promise<void> {
  // Meta ส่ง app id มาเป็น number บ้าง string บ้าง (เอกสารเดียวกันเขียนไม่ตรงกัน) — normalize
  // ตอนเขียนทีเดียว ไม่ปล่อยให้ฝั่งอ่านไปเทียบ `===` กับชนิดที่เดาเอง
  const asId = (v: string | number | null | undefined): string | null =>
    v === null || v === undefined ? null : String(v)

  try {
    await prisma.chatHandoverEvent.create({
      data: {
        provider: params.provider,
        pageExternalId: params.pageExternalId,
        contactExternalId: params.contactExternalId ?? null,
        kind: params.kind,
        previousOwnerAppId: asId(params.previousOwnerAppId),
        newOwnerAppId: asId(params.newOwnerAppId),
        requestedOwnerAppId: asId(params.requestedOwnerAppId),
        metadata: params.metadata ?? null,
        viaStandby: params.standby === true,
        raw: toRawMessage(params.provider, params.rawEvent ?? null),
        occurredAt: typeof params.timestamp === 'number' ? new Date(params.timestamp) : null,
      },
    })
  } catch (e) {
    console.error('[fb-handover] เก็บ event ไม่สำเร็จ', e instanceof Error ? e.message : e)
  }
}

// reaction (feature 00018 Phase 2, message_reactions) — react/unreact บนข้อความ mid หนึ่ง
// เก็บ emoji ล่าสุดบน ChatMessage.reactionEmoji (unreact = null). scope ด้วย channel กันข้ามร้าน
/**
 * ingestAdReferral — บันทึก "ที่มา" ของเธรด: ลูกค้าทักมาจากโฆษณา/ลิงก์ m.me อันไหน (E5 2026-07-26)
 *
 * เขียน 3 ที่:
 *  1. ตารางประวัติ ConversationAdReferral — แถวใหม่ทุกครั้ง ไม่ทับของเดิม เพราะ Meta ไม่มี Graph API
 *     ให้อ่าน referral ย้อนหลัง ถ้าทับทิ้งคือหายถาวร (ข้อมูลดิบของรายงาน "ads ตัวไหนพาลูกค้ามา")
 *  2. Conversation.referral* — ค่า "ล่าสุด" ที่แบนเนอร์บนหัวเธรดอ่าน (ไม่ต้อง join ทุกครั้งที่เปิดเธรด)
 *  3. Conversation.lastInboundAt — หน้าต่าง 24 ชม. (ดู customerActionAt)
 *
 * ต้องเรียก **หลัง** ingest ข้อความเสร็จเสมอ — เธรดต้องมีอยู่แล้ว และ mirror รูป (network call)
 * ห้ามอยู่ในทรานแซกชันเดียวกับการเขียนข้อความ
 *
 * ห้าม throw ในเส้นทางปกติ: referral คือข้อมูลเสริม ถ้าพังต้องไม่ทำให้ข้อความหาย เธรด/เพจที่หา
 * ไม่เจอ = เงียบ (เหมือน ingestReadEvent)
 */
export async function ingestAdReferral(params: {
  provider: string
  pageExternalId: string
  contactExternalId: string
  referral: Referral
  /**
   * เวลาที่ **ลูกค้า** ทำ action ที่พา referral นี้มา (ms) — ใส่ = เปิดหน้าต่าง 24 ชม. ใหม่
   * ไม่ใส่ = ไม่แตะหน้าต่างเลย (ใช้เมื่อ referral ไม่ได้มาจาก action ของลูกค้า เช่นติดมากับ echo
   * ของข้อความฝั่งเพจ) — เจตนาคือให้ caller ประกาศออกมาตรง ๆ ไม่ใช่ให้ service เดาจาก timestamp
   * ที่มีค่าเสมอ ไม่งั้นเผลอเปิดหน้าต่างจาก action ของเพจเอง
   *
   * ทำไมต้องมี (user report 2026-08-02): เอกสาร Messaging Policy ของ Meta ระบุ action ที่เปิด
   * หน้าต่าง 24 ชม. ไว้หลายอย่าง ไม่ใช่แค่ "ส่งข้อความ" — คลิกโฆษณา Click-to-Messenger, กดปุ่ม
   * CTA, และคลิกลิงก์ m.me ที่มี ref ล้วนเปิดหน้าต่างทั้งหมด ซึ่งทั้งสามอย่างมาถึงเราเป็น referral
   * event. เดิมเราขยับ lastInboundAt เฉพาะตอนมีข้อความ/reaction → ลูกค้าเก่าที่กดโฆษณาตัวใหม่
   * แล้วยังไม่พิมพ์อะไร ระบบขึ้นว่า "หมดเวลา" และบล็อกไม่ให้ร้านตอบ ทั้งที่ Meta อนุญาตแล้ว
   */
  customerActionAt?: number
}): Promise<void> {
  const { referral } = params
  // null = caller บอกว่านี่ไม่ใช่ action ของลูกค้า → ไม่แตะหน้าต่าง 24 ชม.
  const customerActionAt = params.customerActionAt ? new Date(params.customerActionAt) : null
  const channel = await getChannelByExternalId(params.provider, params.pageExternalId)
  if (!channel) return
  const contact = await prisma.externalContact.findUnique({
    where: { shopChannelId_externalUserId: { shopChannelId: channel.id, externalUserId: params.contactExternalId } },
    select: { id: true },
  })
  if (!contact) return
  const conversation = await prisma.conversation.findUnique({
    where: { shopChannelId_externalContactId: { shopChannelId: channel.id, externalContactId: contact.id } },
    select: { id: true },
  })
  if (!conversation) return

  const ctx = referral.ads_context_data

  // ข้อความโฆษณาจริง: `ad_title` ที่มากับ webhook คือ **ชื่อ ad ใน Ads Manager** ("video v3",
  // "โพสแนวตั้ง") ผู้ขายอ่านแล้วไม่รู้ว่าเป็นโฆษณาชิ้นไหน (user report prod 2026-07-26) — ข้อความที่
  // ลูกค้าเห็นจริงอยู่ที่โพสต์ ต้องดึงเพิ่มด้วย post_id. best-effort: ดึงไม่ได้ก็ตกไปใช้ ad_title
  const post = ctx?.post_id
    ? await fetchAdPostContent(params.pageExternalId, ctx.post_id, channel.accessToken)
    : { message: null, fullPicture: null, permalink: null }

  // เลือกรูปตามลำดับที่ "มีของจริง" มากสุด:
  //   full_picture ของโพสต์ > photo_url > video_url
  // โฆษณาวิดีโอ (เคสที่ user เจอ) ส่ง photo_url = null มาเสมอ ให้ thumbnail มาทาง video_url แทน —
  // ถ้าดูแค่ photo_url แบนเนอร์จะไม่มีรูปทั้งที่ Meta ส่ง thumbnail มาให้แล้ว
  const imageUrl = post.fullPicture ?? ctx?.photo_url ?? ctx?.video_url ?? null
  // mirror เข้า storage เรา — URL ของ Meta หมดอายุ ถ้า hotlink ไว้แบนเนอร์จะรูปแตกภายหลัง
  // (คืน null เองเมื่อโฮสต์ไม่อยู่ allow-list / timeout / ไฟล์ใหญ่เกิน → แบนเนอร์แสดงแบบไม่มีรูป)
  const photoFileId = imageUrl ? await mirrorRemoteImage(imageUrl) : null

  await prisma.$transaction([
    prisma.conversationAdReferral.create({
      data: {
        conversationId: conversation.id,
        source: referral.source ?? null,
        adId: referral.ad_id ?? null,
        adTitle: ctx?.ad_title ?? null,
        adBody: post.message,
        adPermalink: post.permalink,
        photoFileId,
        photoUrl: ctx?.photo_url ?? null,
        videoUrl: ctx?.video_url ?? null,
        postId: ctx?.post_id ?? null,
        productId: ctx?.product_id ?? null,
        flowId: ctx?.flow_id ?? null,
        refPayload: referral.ref ?? null,
      },
    }),
    prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        referralSource: referral.source ?? null,
        referralAdTitle: ctx?.ad_title ?? null,
        referralAdBody: post.message,
        referralAdPermalink: post.permalink,
        referralAdId: referral.ad_id ?? null,
        referralPhotoFileId: photoFileId,
      },
    }),
    // หน้าต่าง 24 ชม. (ดู customerActionAt) — แยกเป็น updateMany ต่างหาก ไม่รวมกับ update ข้างบน
    // เพราะเงื่อนไขต่างกัน: ข้อมูล referral เขียนทับได้เสมอ (เป็นค่า "ล่าสุด") ส่วนเวลาต้องเขียน
    // เฉพาะเมื่อใหม่กว่าของเดิม กัน event ที่มาสลับลำดับดันหน้าต่างถอยหลัง (ตรรกะเดียวกับ react)
    //
    // ไม่ขยับ lastMessageAt ด้วย: ไม่มีข้อความใหม่จริง การดันเธรดขึ้นหัวรายการจากการคลิกโฆษณา
    // เป็นการเปลี่ยนความหมายของลำดับกล่องข้อความ ซึ่งเป็นคนละเรื่องกับสิทธิ์ในการส่ง
    ...(customerActionAt
      ? [
          prisma.conversation.updateMany({
            where: {
              id: conversation.id,
              OR: [{ lastInboundAt: null }, { lastInboundAt: { lt: customerActionAt } }],
            },
            data: { lastInboundAt: customerActionAt },
          }),
        ]
      : []),
  ])
}

/**
 * ชื่อรีแอ็กชันเชิงความหมายที่ Meta ส่งมาใน `reaction.reaction` → อักขระอิโมจิ
 * (สร้างจาก codepoint ไม่ฝัง emoji ดิบในซอร์ส — HR12 grep gate)
 *
 * ใช้เป็นทางสำรองเมื่อ payload ไม่มี field `emoji` ติดมา (เจอจริงกับ echo ของรีแอ็กชันที่ "เพจ"
 * เป็นคนกดเอง — ดูเหตุผลใน ingestReactionEvent)
 */
const REACTION_NAME_TO_EMOJI: Record<string, string> = {
  love: String.fromCodePoint(0x2764),
  like: String.fromCodePoint(0x1f44d),
  wow: String.fromCodePoint(0x1f62e),
  sad: String.fromCodePoint(0x1f622),
  angry: String.fromCodePoint(0x1f621),
  smile: String.fromCodePoint(0x1f606),
  laugh: String.fromCodePoint(0x1f606),
  dislike: String.fromCodePoint(0x1f44e),
}

export async function ingestReactionEvent(params: {
  provider: string
  pageExternalId: string
  mid: string
  action: string // "react" | "unreact"
  emoji?: string
  /** ชื่อเชิงความหมาย ("love"/"like"/…) — ใช้เมื่อ payload ไม่มี emoji */
  reactionName?: string
  /** ผู้กด react — เท่ากับ pageExternalId เมื่อร้านเป็นคนกดเอง (Meta ยิง event ทั้งสองทาง) */
  reactorExternalId?: string
  /** เวลาของ event (ms) จาก Meta — ใช้เป็นเวลาที่หน้าต่างเปิดใหม่ */
  timestamp?: number
}): Promise<void> {
  const channel = await getChannelByExternalId(params.provider, params.pageExternalId)
  if (!channel) return
  const target = await prisma.chatMessage.findFirst({
    where: { externalMessageId: params.mid, conversation: { shopChannelId: channel.id } },
    select: { conversationId: true },
  })
  if (!target) return

  /**
   * สำคัญ: ห้ามเขียน null ตอน action='react' (user report prod 2026-08-04: "กด emoji ไม่ได้ กดแล้วมันขึ้น
   * ซัก 1 วิ แล้วมันก็หายไป refresh ก็ไม่มา" — และเสริมว่าเกิดเฉพาะ "เวลาเรากด emoji ฝั่งเราเอง")
   *
   * ต้นเหตุ: ข้อความหนึ่งมี **ผู้เขียนคอลัมน์นี้ 2 ราย** — sendOutboundReaction (ตอนร้านกด) และ
   * ingestReactionEvent (ตอน Meta ยิง echo กลับมา ~1 วินาทีให้หลัง; ยืนยันด้วย log prod ว่ามี event
   * `reaction` วิ่งกลับมาจริงเมื่อฝั่งเพจกด) โค้ดเดิมเขียน `params.emoji ?? null` แปลว่า **echo ที่ไม่มี
   * field `emoji` ติดมาจะล้างของที่เราเพิ่งเขียนสำเร็จทิ้ง** ผลคือรีแอ็กชันโผล่ ~1 วิ แล้วหายถาวร
   * ส่วนรีแอ็กชันของลูกค้าไม่พังเพราะ payload ฝั่งนั้นมี emoji มาครบ (ในฐาน prod มีค้างอยู่จริง 4 แถว)
   *
   * กติกาใหม่: 'unreact' = ล้าง (นั่นคือความหมายของมันจริง ๆ) · 'react' = เขียนเฉพาะเมื่อ **รู้ค่า**
   * (จาก emoji หรือแปลจากชื่อเชิงความหมาย) · ไม่รู้ค่า = **ไม่แตะคอลัมน์** ปล่อยของที่มีอยู่ไว้
   * "ไม่มีข้อมูล" ไม่เท่ากับ "สั่งให้ลบข้อมูล"
   */
  const isUnreact = params.action === 'unreact'
  const known = params.emoji ?? (params.reactionName ? REACTION_NAME_TO_EMOJI[params.reactionName.toLowerCase()] : undefined)
  if (isUnreact || known) {
    await prisma.chatMessage.updateMany({
      where: { externalMessageId: params.mid, conversation: { shopChannelId: channel.id } },
      data: { reactionEmoji: isUnreact ? null : known! },
    })
  }

  // ลูกค้ากด react = หน้าต่าง 24 ชม. เปิดใหม่ตามนโยบาย Meta — เอกสาร Messaging Policy ระบุ
  // "reacts to messages" เป็นหนึ่งใน action ที่เปิด/รีเซ็ตหน้าต่าง เท่ากับการส่งข้อความ
  // เดิมเราเขียนแค่ reactionEmoji ทำให้ลูกค้ากดหัวใจแล้วระบบยังขึ้นว่าส่งไม่ได้ ทั้งที่ Meta ให้ส่งแล้ว
  // (พบ 2026-08-01 ตอนไล่เอกสารเทียบโค้ด) — นับเฉพาะ 'react' ไม่นับ 'unreact' และต้องเป็นฝั่งลูกค้า
  // เท่านั้น (ร้านกด react เองไม่เปิดหน้าต่างให้ตัวเอง)
  const byCustomer = !!params.reactorExternalId && params.reactorExternalId !== params.pageExternalId
  if (params.action === 'unreact' || !byCustomer) return
  const at = params.timestamp ? new Date(params.timestamp) : new Date()
  await prisma.conversation.updateMany({
    // เขียนเฉพาะเมื่อใหม่กว่าของเดิม — กัน event ที่มาสลับลำดับดันเวลาถอยหลัง
    where: { id: target.conversationId, OR: [{ lastInboundAt: null }, { lastInboundAt: { lt: at } }] },
    data: { lastInboundAt: at },
  })
}

/**
 * ร้านกดรีแอ็กชันใส่ข้อความในเธรด (feature 00018 — user สั่ง 2026-08-03 "reaction ข้อความด้วย")
 *
 * เส้นทางกลับด้านของ ingestReactionEvent: ตัวนั้นรับของจาก Meta ตัวนี้ส่งของออกไป
 * `ChatMessage.reactionEmoji` ยังเป็นคอลัมน์เดียวเหมือนเดิม = "รีแอ็กชันล่าสุดบนข้อความนี้"
 * ไม่แยกว่าใครกด — ตรงกับพฤติกรรมที่มีอยู่ก่อนแล้ว (ร้านกดจากแอป Messenger เองก็เขียนช่องนี้
 * ผ่าน echo อยู่ดี). ผลที่ตามมาคือถ้าทั้งสองฝั่งกด จะเห็นอันล่าสุดอันเดียว ไม่ซ้อนกันแบบ Messenger
 * — ยอมรับไว้ก่อน การแยกต้องเพิ่มคอลัมน์ + migration บนฐาน prod ที่แชร์กัน
 *
 * เขียนฐานเองด้วยหลังยิงสำเร็จ ไม่รอ echo: Meta ยิง message_reactions กลับมาให้ก็จริง แต่ช้ากว่า
 * การกดของผู้ใช้มาก และรอบก่อนหน้านี้พิสูจน์แล้วว่า echo ของ action ที่ระบบเราเป็นคนทำ ไม่ใช่สิ่งที่
 * รับประกันได้ (ข้อความอัตโนมัติของ Meta เองยังไม่ echo) — ถ้า echo มาทีหลังก็เขียนค่าเดิมทับ ไม่เสียหาย
 */
export async function sendOutboundReaction(params: {
  conversationId: string
  messageId: string
  /** null = ถอนรีแอ็กชัน */
  emoji: string | null
  actorUserId: string
}): Promise<{ emoji: string | null }> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: params.conversationId },
    include: { shopChannel: true, externalContact: true },
  })
  if (!conversation) throw new Error('CONVERSATION_NOT_FOUND')
  // authz ก่อนแตะข้อมูลข้อความ — เหมือน cancelFailedOutboundMessage
  if (!(await canAccessShop(conversation.shopId, params.actorUserId))) throw new Error('FORBIDDEN')

  const message = await prisma.chatMessage.findFirst({
    where: { id: params.messageId, conversationId: params.conversationId },
    select: { id: true, externalMessageId: true, isDeleted: true },
  })
  if (!message) throw new Error('MESSAGE_NOT_FOUND')
  if (message.isDeleted) throw new Error('MESSAGE_DELETED')

  // แชทในแอป (DEEP) ไม่มีปลายทางให้ยิง — เก็บฝั่งเราอย่างเดียวก็ครบความหมายแล้ว
  const isExternal = conversation.channel !== 'DEEP' && !!conversation.shopChannel && !!conversation.externalContact
  if (isExternal) {
    if (conversation.shopChannel!.status !== 'ACTIVE') throw new Error('CHANNEL_INACTIVE')
    // ข้อความที่ยังไม่มี mid = ยังไม่ถึง Meta (ส่งไม่สำเร็จ/optimistic) — รีแอ็กชันไม่มีเป้าให้ผูก
    if (!message.externalMessageId) throw new Error('MESSAGE_NOT_ON_CHANNEL')
    const pageToken = decryptToken(conversation.shopChannel!.accessTokenEnc)
    await sendMessageReaction(
      pageToken,
      conversation.externalContact!.externalUserId,
      message.externalMessageId,
      params.emoji,
    )
  }

  await prisma.chatMessage.update({
    where: { id: message.id },
    data: { reactionEmoji: params.emoji },
  })
  return { emoji: params.emoji }
}

/**
 * ลูกค้าแก้ข้อความที่ส่งไปแล้ว (message_edits — เปิด field 2026-08-03)
 *
 * ถ้าไม่รับ event นี้ เธรดฝั่งเราจะค้างอยู่ที่ข้อความ **ก่อนแก้** ตลอดไป ซึ่งอันตรายกว่าการไม่มีฟีเจอร์
 * เพราะร้านอ่านที่อยู่/จำนวน/เบอร์เวอร์ชันเก่าไปทำงานต่อโดยไม่รู้ตัว (Messenger ฝั่งลูกค้าเห็นของใหม่)
 *
 * ไม่เพิ่มคอลัมน์: บันทึกร่องรอยการแก้ไว้ใน `rawMessage.edit` (json ที่มีอยู่แล้ว) — พอสำหรับให้ UI
 * ขึ้นป้าย "แก้ไขแล้ว" และไม่ต้องแตะ schema ของฐานที่ใช้ร่วมกับ prod
 * num_edit: Meta จำกัดให้แก้ได้ไม่เกิน 5 ครั้ง (ข้อจำกัดฝั่ง client ตามเอกสาร) เก็บไว้เป็นหลักฐาน
 */
export async function ingestMessageEdit(params: {
  provider: string
  pageExternalId: string
  mid: string
  text?: string
  numEdit?: number | string
  timestamp?: number
}): Promise<void> {
  const channel = await getChannelByExternalId(params.provider, params.pageExternalId)
  if (!channel) return
  const target = await prisma.chatMessage.findFirst({
    where: { externalMessageId: params.mid, conversation: { shopChannelId: channel.id } },
    select: { id: true, conversationId: true, rawMessage: true },
  })
  if (!target) return

  const raw = (target.rawMessage ?? {}) as Prisma.JsonObject
  const editedAt = new Date(params.timestamp ?? Date.now()).toISOString()
  await prisma.chatMessage.update({
    where: { id: target.id },
    data: {
      body: params.text ?? null,
      rawMessage: { ...raw, edit: { at: editedAt, numEdit: params.numEdit ?? null } },
    },
  })

  // snapshot ของเธรดชี้ข้อความนี้อยู่หรือเปล่า — ถ้าใช่ต้องอัปเดตด้วย ไม่งั้นกล่องขาเข้าโชว์ข้อความ
  // เวอร์ชันเก่าที่ไม่มีอยู่จริงแล้ว (invariant เดียวกับที่ cancelFailedOutboundMessage รักษาไว้)
  const newest = await prisma.chatMessage.findFirst({
    where: { conversationId: target.conversationId },
    orderBy: [{ createdAt: 'desc' }, { seq: 'desc' }],
    select: { id: true },
  })
  if (newest?.id === target.id && params.text) {
    await prisma.conversation.update({
      where: { id: target.conversationId },
      data: { lastMessagePreview: params.text.slice(0, 100) },
    })
  }
}

/** เพดานรูปต่อกริด 1 ก้อนตามเอกสาร Meta (2–6) — เกินกว่านี้ผู้เรียกต้องแบ่งเป็นหลายข้อความ */
export const IMAGE_GRID_MAX = 6

/**
 * แถว ChatMessage อย่างที่ query จริงคืนกลับมา — **ไม่ใช่** `ChatMessage` เต็มจาก Prisma
 *
 * ต่างกันตรง `rawMessage` ซึ่งถูก global `omit` ตัดออกที่ lib/prisma.ts (payload ดิบของ Meta ห้าม
 * หลุดออกนอก service โดยไม่ตั้งใจ) — ประกาศเป็น `ChatMessage` ตรง ๆ จะ type error ทันที
 *
 * ต้อง `Omit` ซ้ำอีกชั้นเพราะแถวที่ได้จาก `tx` ในทรานแซกชันกับแถวที่ได้จาก client ปกติ TS มองเป็น
 * คนละชนิดกันเรื่อง rawMessage — ตัดทิ้งให้ชัดตรงนี้ ทั้งสองทางจึงมารวมเป็นชนิดเดียวกันได้
 */
type OutboundMessageRow = Omit<ChatMessage, 'rawMessage'>

/**
 * ส่งรูปหลายใบเป็น "กริดในข้อความเดียว" (user สั่ง 2026-08-04 — ให้เหมือน Business Suite)
 *
 * fail-safe ตามที่ตกลงกับ user: ถ้า Meta ปฏิเสธ image_grid (รูปโหลดไม่ได้/ชนิดไม่ผ่าน/ฟีเจอร์ไม่เปิด
 * ให้แอปนี้) **ตกไปส่งทีละใบด้วยเส้นทางเดิมอัตโนมัติ** ร้านต้องส่งออกได้เสมอ ห้ามล้มทั้งชุด
 *
 * เก็บฝั่งเรายังเป็น 1 แถวต่อ 1 รูป (เหมือนเดิม) เพราะ:
 *  - ตัวเรนเดอร์ในเธรดจับรูปที่ติดกันเป็นอัลบั้มให้อยู่แล้ว หน้าตาจึงไม่เปลี่ยน
 *  - คอลัมน์ imageUrl เก็บ fileId ได้ 1 ค่า การยัดหลายรูปลงแถวเดียวต้องแก้ schema + ทุกที่ที่อ่าน
 *  - mid ที่ Meta คืนมามีอันเดียว → ใส่ที่แถวแรก ที่เหลือ suffix `#i` (convention เดียวกับ mirror
 *    ขาเข้าที่ event เดียวมีหลาย attachment)
 */
export async function sendOutboundImageGrid(params: {
  conversationId: string
  actorUserId: string
  /** fileId ใน storage ของเรา 2–6 ใบ */
  fileIds: string[]
  caption?: string | null
  /**
   * แถวที่สร้างจริง เรียงตามลำดับรูปที่ส่ง (+ แถวแคปชันต่อท้ายถ้ามี) — 2026-08-05
   *
   * ทำไมต้องคืนแถวออกไป: ฝั่ง composer วาดบับเบิลชั่วคราวไว้ล่วงหน้าใบต่อรูป แล้วต้องเอาแถวจริง
   * ไป "ทับ" ใบเดิมให้ตรงตัว เหมือนเส้นทางส่งรูปเดี่ยว (postMessage) เดิมเส้นทางนี้ไม่คืนอะไรเลย
   * client จึงต้องลบบับเบิลชั่วคราวทิ้งแล้วรอ refetch — ระหว่างนั้น poll/realtime ดึงแถวจริงมาก่อน
   * ได้ ทำให้รูปเดียวกันขึ้นสองใบ (ใบจริงหน้าตาเหมือนส่งสำเร็จแล้ว ใบชั่วคราวยังหมุนอยู่)
   */
}): Promise<{ mode: 'grid' | 'fallback'; count: number; messages: OutboundMessageRow[] }> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: params.conversationId },
    include: { shopChannel: true, externalContact: true },
  })
  if (!conversation) throw new Error('CONVERSATION_NOT_FOUND')
  if (!(await canAccessShop(conversation.shopId, params.actorUserId))) throw new Error('FORBIDDEN')
  if (conversation.channel === 'DEEP' || !conversation.shopChannel || !conversation.externalContact) {
    throw new Error('NOT_EXTERNAL_CHANNEL')
  }
  if (conversation.shopChannel.status !== 'ACTIVE') throw new Error('CHANNEL_NOT_ACTIVE')
  const files = params.fileIds.slice(0, IMAGE_GRID_MAX)
  if (files.length < 2) throw new Error('IMAGE_GRID_COUNT_OUT_OF_RANGE')

  // หน้าต่างเวลา/แท็ก ใช้กฎเดียวกับการส่งข้อความ (คนกดเองเท่านั้นที่ติด HUMAN_AGENT ได้)
  const windowState = getWindowState(conversation.lastInboundAt)
  let messageTag: 'HUMAN_AGENT' | undefined
  if (!windowState.open) {
    if (isHumanAgentEnabled() && windowState.humanAgentOpen) messageTag = 'HUMAN_AGENT'
    else throw new Error('WINDOW_CLOSED')
  }

  const pageToken = decryptToken(conversation.shopChannel.accessTokenEnc)
  const recipientId = conversation.externalContact.externalUserId
  /**
   * 2 ลิงก์ต่อรูป คนละอายุ คนละหน้าที่:
   *  - `url` (1 ชม.) = ลิงก์ให้ **Meta ดึงรูปไปเก็บ** ตอนส่ง หมดอายุหลังจากนั้นไม่มีผล
   *  - `actionUrl` (1 ปี) = ลิงก์ที่ฝังใน action ของรูป **ลูกค้าเป็นคนเปิดเอง** วันไหนก็ได้
   *
   * ต้องมี action ไม่งั้นกดรูปไม่ได้เลย — เอกสาร Meta (Image grid template) เขียนไว้ตรงตัวว่า
   * "Images without an action are not tappable." และ action มีแค่ web_url/postback ไม่มีชนิด
   * "เปิดตัวดูรูปเต็มจอ" ให้เลือก (user report prod 2026-08-04: "ส่ง 2 รูปแล้วมันกดดูรูปไม่ได้")
   * web_url จึงเป็นทางเดียวที่ทำให้กดดูรูปเต็ม ๆ ได้ — เปิดใน webview ของ Messenger
   *
   * ลิงก์ action เป็น presigned ของ Supabase (เดาไม่ได้) และเป็น "รูปที่เราส่งให้ลูกค้าคนนั้นเอง
   * อยู่แล้ว" ไม่ใช่การเปิดคลังไฟล์ร้านให้ใครก็เข้าถึง. พ้นอายุลิงก์ตาย = กดแล้วขึ้น error ของ
   * storage (รูปในกริดยังอยู่ เพราะ Meta เก็บสำเนาไว้ตอนส่งแล้ว)
   *
   * ห้ามเพิ่ม: 7 วันคือเพดานแข็งของ SigV4 — presigned URL ที่ขออายุเกินนี้ไม่ได้ "ได้ลิงก์ที่
   * หมดอายุเร็วกว่าที่ขอ" แต่ `getSignedUrl` **โยน error ทิ้ง** ("Signature version 4 presigned URLs
   * must have an expiration date less than one week in the future")
   *
   * บั๊กจริงที่เกิดจากบรรทัดนี้ (user report prod 2026-08-05 "รูปใน quickmessage ยังส่งแยกกัน +
   * ส่งช้ามาก"): ค่าเดิมตั้งไว้ 1 ปี ทำให้ทั้งฟังก์ชันโยนตั้งแต่ยังไม่ได้ยิงหา Meta → route ตอบ 500
   * → client ตกไปวนส่งทีละใบ. **กริดจึงไม่เคยทำงานบน prod เลยตั้งแต่เขียนมา** และช้ากว่าเดิมด้วย
   * เพราะเสีย round-trip ที่พังทิ้งไปก่อน 1 รอบแล้วค่อยยิงทีละใบอีก N รอบ
   *
   * ที่ dev ไม่เจอเพราะ driver `local` (ค่าตั้งต้นของ STORAGE_DRIVER) ไม่สนใจ opts เลย คืน
   * `/api/files/{id}` เสมอ ไม่มีวันโยน — บั๊กนี้มองเห็นได้เฉพาะตอนต่อ S3/Supabase จริงเท่านั้น
   */
  const ACTION_URL_TTL = 60 * 60 * 24 * 7

  let mid: string | null = null
  try {
    /**
     * สร้างลิงก์ **ในนี้** ไม่ใช่ข้างนอก try (2026-08-05) — เดิมอยู่ข้างนอก ทำให้ error ตอนทำลิงก์
     * ทะลุขึ้นไปเป็น 500 แทนที่จะตกลง fallback "ส่งทีละใบ" ที่เขียนรออยู่แล้วข้างล่าง
     *
     * actionUrl พังได้โดยไม่ล้มทั้งชุด: "กดรูปเพื่อดูเต็มจอ" เป็นของเสริม ส่วน "ลูกค้าได้รับรูป"
     * เป็นหน้าที่หลัก — ของเสริมต้องไม่มีสิทธิ์ล้มของหลัก (นั่นคือสิ่งที่เพิ่งเกิดขึ้นมาแล้วรอบนี้)
     */
    const images = await Promise.all(
      files.map(async (id) => ({
        url: await getFileUrl(id, { signed: true, expiresIn: 3600 }),
        actionUrl: await getFileUrl(id, { signed: true, expiresIn: ACTION_URL_TTL }).catch((e) => {
          console.warn('[fb-chat] ทำลิงก์ action ของรูปไม่สำเร็จ ส่งต่อแบบกดรูปไม่ได้', id, e instanceof Error ? e.message : e)
          return null
        }),
      })),
    )
    mid = await sendImageGridMessage(pageToken, recipientId, images, {
      caption: params.caption ?? null,
      tag: messageTag,
    })
  } catch (e) {
    // fail-safe: ตกไปส่งทีละใบด้วยเส้นทางเดิม (ผ่าน sendOutboundMessage ที่จัดการ retry/บันทึกครบแล้ว)
    console.warn('[fb-chat] image_grid ถูกปฏิเสธ ตกไปส่งทีละใบ', e instanceof Error ? e.message : e)
    // เก็บแถวที่ได้จากการส่งทีละใบไว้คืนออกไปด้วย — ฝั่ง client ต้องเอาไปทับบับเบิลชั่วคราวเหมือนกัน
    // ไม่ว่าจะไปทางกริดหรือทางสำรอง (ถ้าคืนเฉพาะทางกริด ทางสำรองจะกลับไปเป็นบั๊กบับเบิลซ้ำเหมือนเดิม)
    //
    // ห้าม throw กลางคัน (2026-08-05): ใบที่ 3 พังต้องไม่ทำให้ใบ 4-6 ไม่ถูกส่งและแถวของใบ 1-2
    // ที่ "ถึงลูกค้าไปแล้วจริง" หายไปจาก response — เดิม throw ทะลุขึ้น route เป็น 500 แล้ว client
    // วนส่งใหม่ทั้งชุด = ลูกค้าได้ใบ 1-2 ซ้ำสองรอบ ถอนคืนไม่ได้. รูปแบบเดียวกับ auto-reply-send
    // (TFR-036 ข้อ 3): ความล้มเหลวรายใบต้องไม่ล้มทั้งชุด. ใบที่ Meta ปฏิเสธมีแถว FAILED บันทึกไว้
    // แล้ว (savedMessage) — คืนแถวนั้นออกไปให้บับเบิลขึ้น "ส่งไม่สำเร็จ" พร้อมเหตุผลรายใบ
    const fallbackRows: OutboundMessageRow[] = []
    for (const fileId of files) {
      try {
        fallbackRows.push(
          await sendOutboundMessage({
            conversationId: params.conversationId,
            actorUserId: params.actorUserId,
            attachment: { fileId, kind: 'IMAGE', name: null, size: null },
          }),
        )
      } catch (fe) {
        const saved = (fe as SendFailedError).savedMessage
        if (saved) fallbackRows.push(saved)
        console.warn('[fb-chat] ส่งรูปสำรองทีละใบไม่สำเร็จ', fileId, fe instanceof Error ? fe.message : fe)
      }
    }
    if (params.caption?.trim()) {
      try {
        fallbackRows.push(
          await sendOutboundMessage({
            conversationId: params.conversationId,
            actorUserId: params.actorUserId,
            text: params.caption,
          }),
        )
      } catch (fe) {
        const saved = (fe as SendFailedError).savedMessage
        if (saved) fallbackRows.push(saved)
        console.warn('[fb-chat] ส่งแคปชันตามหลังไม่สำเร็จ', fe instanceof Error ? fe.message : fe)
      }
    }
    return { mode: 'fallback', count: files.length, messages: fallbackRows }
  }

  // บันทึกฝั่งเรา 1 แถวต่อรูป (mid อยู่แถวแรก ที่เหลือ suffix #i กัน unique ชน)
  //
  // กำหนด id เองล่วงหน้าแทนการปล่อยให้ DB สุ่ม (2026-08-05) — createMany ไม่คืนแถวที่สร้าง และเรา
  // ต้องคืนแถวออกไปให้ client เอาไปทับบับเบิลชั่วคราว. วิธีอื่นที่ไม่ต้องกำหนด id เอง (ไล่หาแถวล่าสุด
  // ตาม createdAt หรือตาม mid) ล้วนเดาได้ผิดเมื่อ echo webhook เขียนแถวแทรกเข้ามาพอดี — id ที่เรา
  // ถือเองตั้งแต่ต้นเป็นตัวเดียวที่ชี้ได้แน่นอนว่า "แถวไหนคือของการส่งครั้งนี้"
  const rowIds = files.map(() => randomUUID())
  const imageRows = await prisma.$transaction(async (tx) => {
    await tx.chatMessage.createMany({
      data: files.map((fileId, i) => ({
        id: rowIds[i],
        conversationId: conversation.id,
        senderUserId: params.actorUserId,
        senderRole: 'SHOP' as const,
        type: 'IMAGE' as const,
        body: null,
        imageUrl: fileId,
        externalMessageId: mid ? (i === 0 ? mid : `${mid}#${i}`) : null,
        deliveryStatus: 'SENT' as const,
      })),
      skipDuplicates: true,
    })
    await tx.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date(), lastMessagePreview: '[รูปภาพ]', lastSenderRole: 'SHOP' },
    })
    // skipDuplicates อาจข้ามบางแถว (echo ของ mid เดียวกันมาถึงก่อน) — findMany จึงคืนน้อยกว่า
    // จำนวนรูปได้ ซึ่งถูกต้องแล้ว: แถวที่ถูกข้ามมีตัวจริงอยู่ในเธรดแล้วจากทาง echo
    // เรียงตามลำดับที่ส่งเสมอ ไม่พึ่ง createdAt (แถวจาก createMany ชุดเดียวกันเวลาชนกันได้)
    const created = await tx.chatMessage.findMany({
      // tx ไม่พา global omit ของ lib/prisma.ts มาด้วย (ชนิดของ tx เป็น client เปล่า) — ต้อง omit
      // rawMessage เองตรงนี้ ไม่งั้น payload ดิบของ Meta จะไหลออกไปถึง client ผ่าน response ของ POST
      omit: { rawMessage: true },
      where: { id: { in: rowIds } },
    })
    const byId = new Map(created.map((m) => [m.id, m]))
    // flatMap แทน filter+type predicate — ได้ชนิดที่แคบถูกต้องโดยไม่ต้องประกาศ predicate เอง
    return rowIds.flatMap((id) => {
      const row = byId.get(id)
      return row ? [row] : []
    })
  })

  // caption ส่งตามหลังเป็นข้อความ (title ของกริดจำกัด 45 อักขระ — ข้อความเต็มต้องไปเป็นบับเบิลข้อความ)
  //
  // แคปชันพังต้องไม่ throw (2026-08-05) — ถึงจุดนี้กริดรูป "ถึงลูกค้าไปแล้วจริง" การโยน error ออกไป
  // จะทำให้ route ตอบ 500 ทั้งที่ของหลักส่งสำเร็จ แล้ว client วนส่งใหม่ทั้งชุด = รูปซ้ำทั้งกริด
  // แถวแคปชันที่ Meta ปฏิเสธถูกบันทึกเป็น FAILED ไว้แล้ว (savedMessage) — คืนออกไปให้ขึ้นบับเบิลแดง
  // กดลองใหม่เฉพาะแคปชันได้ ไม่พารูปที่สำเร็จแล้วไปตกน้ำด้วย
  let captionRow: OutboundMessageRow | null = null
  if (params.caption?.trim()) {
    try {
      captionRow = await sendOutboundMessage({
        conversationId: params.conversationId,
        actorUserId: params.actorUserId,
        text: params.caption,
      })
    } catch (ce) {
      captionRow = (ce as SendFailedError).savedMessage ?? null
      console.warn('[fb-chat] ส่งแคปชันตามหลังกริดไม่สำเร็จ', ce instanceof Error ? ce.message : ce)
    }
  }
  return {
    mode: 'grid',
    count: files.length,
    messages: captionRow ? [...imageRows, captionRow] : imageRows,
  }
}

export async function sendOutboundMessage(params: {
  conversationId: string
  // actorUserId = คนกดส่ง. null ได้เฉพาะเส้นทางระบบ (auto-reply) ซึ่งต้องส่ง systemShopId มาคู่กัน
  actorUserId: string | null
  // --- feature 00023 auto-reply (additive, optional — ไม่ส่ง = พฤติกรรมเดิมทุกประการ) ---
  // systemShopId: เส้นทางที่ "ระบบ" เป็นผู้ส่ง ไม่มี user จริงให้เช็ค canAccessShop (TD-005)
  //
  // WARNING: นี่ไม่ใช่ flag ข้าม authz — มันคือการ **ย้ายคำถาม** จาก "user คนนี้แตะร้านนี้ได้ไหม"
  // เป็น "เธรดนี้เป็นของร้านที่ระบบกำลังทำงานแทนจริงหรือเปล่า" แล้วบังคับให้ caller ประกาศ shopId
  // ที่ตัวเองเชื่อว่าเป็นเจ้าของออกมาตรง ๆ เพื่อให้ฟังก์ชันนี้ cross-check กับเธรดจริงได้
  // ถ้าไม่ตรง = โยนทันที. ผลคือ caller ที่ถือ conversationId จากที่อื่นมาเดา ๆ จะยิงข้ามร้านไม่ได้
  // (ค่านี้มาจาก AutoReplyJob.shopId ซึ่งถูกเขียนตอน ingest webhook ฝั่ง server ไม่ได้มาจาก client)
  systemShopId?: string
  // ป้ายกำกับว่าข้อความนี้ระบบเป็นผู้ส่ง — null = คนส่ง (ค่าเดิม)
  autoReplyKind?: 'AUTO' | 'AUTO_TEST'
  // text = ข้อความ (หรือ caption ของไฟล์แนบ) — อย่างน้อยต้องมี text หรือไฟล์แนบอย่างใดอย่างหนึ่ง
  text?: string
  /** deprecated (2026-08-02) — ใช้ `attachment` แทน. คงไว้เพราะ auto-reply-send.service.ts
   *  ยังส่งรูปทีละใบด้วยพารามิเตอร์นี้อยู่ (ภายในแปลงเป็น attachment kind='IMAGE' ให้เอง) */
  imageFileId?: string
  /**
   * สติกเกอร์ Meta (user สั่ง 2026-08-04) — ส่ง `sticker_id` ไม่ใช่ไฟล์แนบ (Sticker API)
   * imageUrl = รูปจาก catalog เอาไป mirror เก็บฝั่งเราให้บับเบิลมีรูปแสดงทันทีโดยไม่ต้องรอ echo
   * ใช้ร่วมกับ text/attachment ไม่ได้ (Meta ให้ส่งอย่างใดอย่างหนึ่งต่อข้อความ) — sticker ชนะ
   */
  sticker?: { id: string; imageUrl: string }
  /** ไฟล์แนบทุกชนิด (2026-08-02 multi-attachment) — kind ตัดสิน `attachment.type` ที่ยิงให้ Meta */
  attachment?: {
    fileId: string
    kind: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'FILE'
    name?: string | null
    size?: number | null
  }
  // orderRefToken (user 2026-07-25): การ์ดคำสั่งซื้อบนช่องทางนอก — ส่ง "ลิงก์ (text)" ให้ลูกค้าผ่าน Meta
  // แต่เก็บข้อความฝั่งเราเป็น type=ORDER เพื่อให้ "ร้าน" เห็นเป็นการ์ด (ร้านอยู่ในระบบเรา = การ์ด)
  orderRefToken?: string
  // reply/quote (user 2026-07-25): externalMessageId (mid) ของข้อความที่ตอบทับ — ส่ง reply_to:{mid}
  // ให้ Meta (Messenger รองรับ; IG best-effort) + เก็บ replyToMid ฝั่งเราเพื่อ render quote
  replyToMid?: string | null
}) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: params.conversationId },
    include: { shopChannel: true, externalContact: true },
  })
  if (!conversation) throw new Error('CONVERSATION_NOT_FOUND')
  if (conversation.channel === 'DEEP' || !conversation.shopChannel || !conversation.externalContact) {
    throw new Error('NOT_EXTERNAL_CHANNEL')
  }

  if (params.systemShopId !== undefined) {
    // เส้นทางระบบ (auto-reply) — ไม่มี user จริง จึงเช็คคนละคำถาม (TD-005)
    // caller ต้องประกาศ shopId ที่ตัวเองเชื่อว่าเป็นเจ้าของเธรดออกมา แล้วเราตรวจกับของจริง
    // ไม่ตรง = โยน. นี่คือสิ่งที่กันการยิงข้ามร้านแทน canAccessShop
    if (params.systemShopId !== conversation.shopId) throw new Error('FORBIDDEN')
    // กันเรียกผิดรูป: ส่ง systemShopId มาแต่ยังใส่ actorUserId = ตั้งใจอะไรไม่ชัด ปฏิเสธไว้ก่อน
    if (params.actorUserId !== null) throw new Error('INVALID_ACTOR')
  } else {
    // เช็ค "เจ้าของ หรือ สมาชิก" (canAccessShop) ไม่ใช่แค่เจ้าของ — ไม่งั้น BUSINESS admin ตอบแชท
    // ของร้านตัวเองไม่ได้ (bug จริงบน prod หลังเพจถูกย้ายไปร้าน BUSINESS)
    if (!params.actorUserId) throw new Error('FORBIDDEN')
    if (!(await canAccessShop(conversation.shopId, params.actorUserId))) throw new Error('FORBIDDEN')
  }

  // หน้าต่างการส่งของ Meta — เลิก "ตัดสินแทน Meta" สำหรับข้อความที่คนพิมพ์เอง
  // (user request 2026-08-03: "การไป lock ui มันทำให้เกิดปัญหา")
  //
  // เดิม: ถ้า getWindowState บอกว่าปิด เราจะ throw WINDOW_CLOSED ทิ้งตั้งแต่ตรงนี้ — ก่อนที่จะ
  // สร้างแถว ChatMessage ด้วยซ้ำ ผลคือร้านไม่เห็นบับเบิลอะไรเลย เห็นแค่ช่องพิมพ์ที่ถูกล็อกไว้
  //
  // ทำไมถึงเปลี่ยน: `lastInboundAt` ที่เราเก็บไม่ใช่ความจริงเสมอไป (นั่นคือเหตุผลที่ต้องมี
  // syncInboundWindowFromMeta มาตั้งแต่แรก) และหลักฐานฝั่งตรงข้ามก็มีแล้ว — subcode 1545041
  // ที่เคยเชื่อว่าผูกกับหน้าต่าง พิสูจน์แล้วว่าเด้งตอนหน้าต่างยังเปิดอยู่ด้วย (ดู lib/chat-send-failure.ts)
  // แปลว่าโมเดลหน้าต่างของเราคลาดทั้งสองทาง การล็อก UI จากค่าที่ไม่แม่น = ห้ามร้านส่งข้อความ
  // ที่ Meta ยอมรับ ซึ่งเสียหายกว่าปล่อยให้ยิงแล้วโดนปฏิเสธ
  //
  // ตอนนี้: คนพิมพ์เอง = ยิงไปให้ Meta ตัดสิน ถ้าโดนปฏิเสธจะถูกบันทึกเป็น deliveryStatus
  // FAILED + failureReason (ดูด้านล่าง) แล้วขึ้นเป็นบับเบิล "ส่งไม่สำเร็จ — <เหตุผล>" พร้อมปุ่ม
  // ลองใหม่ ซึ่งบอกความจริงกับร้านได้ตรงกว่าช่องพิมพ์ที่กดไม่ได้โดยไม่บอกเหตุผล
  //
  // ที่ยัง gate ไว้เหมือนเดิม (ห้ามผ่อน): เส้นทางระบบ/auto-reply/AI (actorUserId เป็น null) — ห้ามยิง
  // นอกหน้าต่างเด็ดขาด เพราะนั่นคือข้อความอัตโนมัติที่ผิดนโยบาย Meta จริง ๆ (เสี่ยงโดนระงับแอป)
  // ไม่ใช่แค่ error ที่คาดเดาได้ นี่คือ gate ของนโยบาย ห้ามผ่อน
  const windowState = getWindowState(conversation.lastInboundAt)
  const sentByHuman = params.actorUserId !== null && !params.autoReplyKind
  let messageTag: 'HUMAN_AGENT' | undefined
  if (!windowState.open) {
    if (!sentByHuman) throw new Error('WINDOW_CLOSED')
    // ติด HUMAN_AGENT ให้เมื่อทำได้ — เป็น tag ที่ถูกต้องสำหรับ "คนตอบเองหลังพ้น 24 ชม."
    // (ต้องได้ permission จาก App Review ก่อน ไม่งั้น Meta ปฏิเสธทั้งข้อความ จึงยังคุมด้วย env)
    if (isHumanAgentEnabled() && windowState.humanAgentOpen) messageTag = 'HUMAN_AGENT'
  }

  // เช็คสถานะ channel ก่อนยิง Send API — token ตายแล้ว (ถูก markChannelTokenInvalid ไว้) หรือ
  // ร้านถอดการเชื่อมต่อไปแล้ว ยิงไปก็ error 190 ซ้ำแน่ ๆ ไม่ต้องเสีย round-trip ไป Graph (M-6)
  if (conversation.shopChannel.status !== 'ACTIVE') throw new Error('CHANNEL_NOT_ACTIVE')

  const pageToken = decryptToken(conversation.shopChannel.accessTokenEnc)
  const recipientId = conversation.externalContact.externalUserId
  // (S-1) จุดเลือก adapter จาก provider ของเธรดนี้ — ตัวเดียว ไม่กระจายเงื่อนไขเทียบชื่อ provider อีก
  const adapter = getAdapter(conversation.channel)
  // บริบทร่วมของเธรดนี้ — override เฉพาะ replyToExternalId/tag ต่อการยิงแต่ละครั้งด้านล่าง
  // (บาง call site ตั้งใจไม่ส่ง reply/tag เลย ตรงกับพฤติกรรมเดิมที่ sendTextMessage(pageToken,
  // recipientId, bodyText) ถูกเรียกแบบ 3 พารามิเตอร์ ไม่มี replyToMid/tag)
  const sendCtx = (opts: { replyToExternalId?: string | null; tag?: string } = {}): ChannelContext => ({
    provider: conversation.channel,
    accessToken: pageToken,
    recipientId,
    ...opts,
  })
  // รวม 2 ทางเข้าเป็นตัวแปรเดียว — imageFileId (auto-reply เดิม) กับ attachment (composer ใหม่)
  // ต้องไม่แตกเป็น 2 เส้นทาง ไม่งั้น retry path ด้านล่างจะพลาดเส้นใดเส้นหนึ่งเสมอ
  const attachment = params.attachment ?? (params.imageFileId ? { fileId: params.imageFileId, kind: 'IMAGE' as const, name: null, size: null } : null)
  const bodyText = params.text ?? ''

  let mid: string | null = null
  let failureReason: string | null = null
  /** สิ่งที่ Meta ตอบกลับตอนเรายิงไป — ลง ChatMessage.rawMessage (source: 'outbound-response') */
  let outboundResponse: unknown = null
  try {
    // ไม่ส่ง shopChannel.externalId เข้าไปแล้ว — ช่องทาง IG เก็บ IG account id ไม่ใช่ Page id
    // ทำให้ Meta ตอบ "(#3) does not have the capability" (บั๊กจริงบน prod)
    // sendText/sendImage ใช้ /me/messages ซึ่ง pageToken resolve เป็นเพจ/IG account ให้เองแล้ว
    // (S-1) ยิงผ่าน adapter.sendMessages แทนการเรียก sendStickerMessage/sendAttachmentMessage/
    // sendTextMessage ตรง ๆ — MetaAdapter delegate ไปยังฟังก์ชันเดิมทุกประการ (ดู meta-adapter.ts)
    if (params.sticker) {
      // สติกเกอร์: ยิง sticker_id ตรง ๆ ไม่ใช่ attachment (ดู lib/facebook/graph.ts sendStickerMessage)
      // อยู่ใต้กฎหน้าต่างเวลาเดียวกัน จึงส่ง messageTag ไปด้วยเหมือนข้อความปกติ
      mid = (
        await adapter.sendMessages(sendCtx({ replyToExternalId: params.replyToMid, tag: messageTag }), [
          { kind: 'sticker', stickerId: params.sticker.id },
        ])
      ).externalMessageId
    } else if (attachment) {
      // presigned URL อายุ 1 ชม. — Meta ดึงไฟล์ไปส่งเอง (/api/files ของเรา auth-gated ใช้ไม่ได้)
      const fileUrl = await getFileUrl(attachment.fileId, { signed: true, expiresIn: 3600 })
      mid = (
        await adapter.sendMessages(sendCtx({ replyToExternalId: params.replyToMid, tag: messageTag }), [
          { kind: 'attachment', attachmentKind: attachment.kind, url: fileUrl },
        ])
      ).externalMessageId
      // caption (ถ้ามี) — Meta attachment ไม่มี text ในตัว ส่งเป็นข้อความตามหลังแยก (best-effort);
      // echo ของ caption จะถูก ingestInboundMessage เก็บเป็นบับเบิลข้อความ SHOP แยกเอง (ไม่เขียนซ้ำที่นี่)
      if (bodyText.trim()) {
        await adapter
          .sendMessages(sendCtx({ replyToExternalId: null, tag: messageTag }), [{ kind: 'text', text: bodyText }])
          .catch(() => {})
      }
    } else {
      mid = (
        await adapter.sendMessages(sendCtx({ replyToExternalId: params.replyToMid, tag: messageTag }), [
          { kind: 'text', text: bodyText },
        ])
      ).externalMessageId
    }
  } catch (e) {
    // reply/quote best-effort: ถ้ายิงพร้อม reply_to แล้ว Meta ปฏิเสธ (IG ไม่รองรับ / mid หมดอายุ) —
    // ลองใหม่แบบไม่มี reply_to เพื่อให้ข้อความยังส่งออกได้ (quote ฝั่งเราแสดงอยู่ดี)
    if (params.replyToMid && !mid) {
      try {
        if (params.sticker) {
          // Meta ไม่ได้ระบุว่า sticker รองรับ reply_to — ปฏิเสธก็ยิงซ้ำแบบไม่ผูกการตอบ
          // (ผู้ใช้ต้องได้สติกเกอร์ ดีกว่าไม่ได้อะไรเพราะ quote)
          mid = (
            await adapter.sendMessages(sendCtx({ tag: messageTag }), [
              { kind: 'sticker', stickerId: params.sticker.id },
            ])
          ).externalMessageId
        } else if (attachment) {
          const fileUrl = await getFileUrl(attachment.fileId, { signed: true, expiresIn: 3600 })
          // ต้องส่ง kind เดิม ห้ามถอยกลับเป็น 'image' — ไม่งั้นวิดีโอ/ไฟล์จะถูกส่งผิดชนิดเงียบ ๆ
          // เฉพาะรอบ retry (บั๊กแบบที่เห็นเฉพาะตอน Meta ปฏิเสธ reply_to จึงหาเจอยากมาก)
          mid = (
            await adapter.sendMessages(sendCtx({ tag: messageTag }), [
              { kind: 'attachment', attachmentKind: attachment.kind, url: fileUrl },
            ])
          ).externalMessageId
          if (bodyText.trim()) {
            await adapter.sendMessages(sendCtx(), [{ kind: 'text', text: bodyText }]).catch(() => {})
          }
        } else {
          mid = (await adapter.sendMessages(sendCtx(), [{ kind: 'text', text: bodyText }])).externalMessageId
        }
      } catch {
        /* ยังส่งไม่ได้จริง — ตกลงไป failureReason ด้านล่าง */
      }
    }
    if (!mid) {
      failureReason = e instanceof Error ? e.message : 'ส่งข้อความไม่สำเร็จ'
      // เก็บ error ดิบของ Meta ไว้สืบ (2026-08-03, user สั่ง) — `failureReason` เป็นสตริงเดียว
      // ซึ่งไม่พอตอนเจอ error แปลก ๆ อย่าง #551: ที่ต้องใช้จริงคือ fbtrace_id (ไว้แจ้ง Meta),
      // error_subcode และ error_user_msg ที่อยู่ใน body เต็มเท่านั้น
      if (e instanceof GraphApiError) {
        outboundResponse = { ok: false, httpStatus: e.httpStatus, code: e.code, subcode: e.subcode, error: e.raw }
      } else {
        outboundResponse = { ok: false, error: e instanceof Error ? e.message : String(e) }
      }
      // code 190 = token ใช้ไม่ได้แล้ว (เจ้าของถอนสิทธิ์/เปลี่ยนรหัส) — ต้องให้ร้านเชื่อมใหม่
      if (e instanceof GraphApiError && e.code === 190) {
        await markChannelTokenInvalid(conversation.shopChannel.id)
      }
    }
  }
  // ขาออกไม่มี "payload ที่ได้รับ" แบบขาเข้า — สิ่งที่มีค่าเทียบเท่าคือสิ่งที่ Meta ตอบกลับตอนเรายิงไป
  if (mid) {
    outboundResponse = {
      ok: true,
      mid,
      messageTag: messageTag ?? null,
      attachmentKind: attachment?.kind ?? null,
      replyToMid: params.replyToMid ?? null,
    }
  }

  // การ์ดคำสั่งซื้อ (user 2026-07-25): ลูกค้าฝั่ง Messenger/IG ได้ "ลิงก์" (bodyText ที่ยิงไป Meta) แต่
  // ฝั่งเราเก็บเป็น type=ORDER → ร้านเห็นเป็นการ์ด. echo ของลิงก์ (mid เดิม) จะ dedupe กับแถวนี้เอง
  const isOrder = !!params.orderRefToken
  /**
   * สติกเกอร์เก็บเป็นแถวชนิด IMAGE + mirror รูปมาไว้ storage ของเรา (เหมือนรูปขาเข้า) ไม่เก็บ URL
   * ของ CDN Meta ตรง ๆ เพราะ (1) ตัวเรนเดอร์ในเธรดอ่าน imageUrl เป็น fileId เสมอ (`/api/files/{id}`)
   * (2) URL ของ Meta หมดอายุได้ แล้วบับเบิลเก่าจะกลายเป็นรูปแตกย้อนหลัง
   * mirror ล้มเหลว = ยังเก็บแถวไว้ (บับเบิลจะไม่มีรูป) ไม่ทำให้การส่งที่สำเร็จแล้วกลายเป็น error
   */
  const stickerFileId = params.sticker ? await mirrorRemoteImage(params.sticker.imageUrl) : null
  const preview = isOrder
    ? '[คำสั่งซื้อ]'
    : params.sticker
      ? '[สติกเกอร์]'
    : attachment
      ? attachment.kind === 'IMAGE'
        ? '[รูปภาพ]'
        : attachment.kind === 'VIDEO'
          ? '[วิดีโอ]'
          : attachment.kind === 'AUDIO'
            ? '[ข้อความเสียง]'
            : `[ไฟล์] ${attachment.name ?? ''}`.trim()
      : bodyText.slice(0, 100)

  let message
  try {
    // create + อัปเดต snapshot ต้องอยู่ในทรานแซกชันเดียวกันเสมอ — invariant ที่ประกาศไว้เองใน
    // prisma/schema.prisma:933 (M-2) เดิมเขียนแยก statement ขัดกับที่ comment ไว้
    message = await prisma.$transaction(async (tx) => {
      const created = await tx.chatMessage.create({
        data: {
          conversationId: conversation.id,
          senderUserId: params.actorUserId,
          senderRole: 'SHOP',
          type: isOrder ? 'ORDER' : params.sticker ? 'IMAGE' : (attachment?.kind ?? 'TEXT'),
          // ORDER: เก็บ orderRefToken (การ์ด live-join); ไฟล์แนบ: body=null, imageUrl=fileId; ข้อความ: body=text
          body: isOrder || attachment || params.sticker ? null : bodyText,
          imageUrl: stickerFileId ?? attachment?.fileId ?? null,
          attachmentName: attachment?.name ?? null,
          attachmentSize: attachment?.size ?? null,
          orderRefToken: isOrder ? params.orderRefToken! : null,
          replyToMid: params.replyToMid ?? null,
          externalMessageId: mid || null,
          deliveryStatus: failureReason ? 'FAILED' : 'SENT',
          failureReason,
          // feature 00023 — null = คนส่ง (พฤติกรรมเดิมทุก caller ที่ไม่ส่งค่านี้มา)
          autoReplyKind: params.autoReplyKind ?? null,
          // ขาออก: เก็บ "สิ่งที่ Meta ตอบกลับ" แทน "payload ที่ได้รับ" (2026-08-03)
          // อ่านไม่ได้จาก query ปกติ — global omit ที่ lib/prisma.ts
          rawMessage: toRawMessage(conversation.channel, outboundResponse, 'outbound-response'),
        },
      })

      // อัปเดต snapshot แม้ส่งไม่สำเร็จ — seller ต้องเห็นในเธรดว่าพยายามส่งแล้วพลาด
      await tx.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: created.createdAt, lastMessagePreview: preview, lastSenderRole: 'SHOP' },
      })

      return created
    })
  } catch (e) {
    // echo webhook ของข้อความที่เพิ่งส่ง (มี mid แล้ว) อาจมาถึงและถูก ingestInboundMessage เขียนลง
    // DB ไปก่อน create ข้างบนพอดี → ชนกันที่ externalMessageId เดียวกัน โอกาสเกิดสูงขึ้นหลัง
    // ingest ฝั่ง webhook แก้ race แล้ว (I-1) — ข้อความส่งสำเร็จจริง (ลูกค้าได้รับแล้ว) ไม่ใช่ error
    // ต้องคืนแถวที่มีอยู่ ไม่ใช่ 500 ทั้งที่ส่งสำเร็จ (I-6) seller เห็น error แล้วกดส่งซ้ำจะได้ 2
    // ข้อความ; ไม่ต้องอัปเดต snapshot ซ้ำ — ingest อัปเดตไปแล้วตอนเขียนแถวนั้น
    if (mid && isUniqueViolationOn(e, 'externalMessageId')) {
      const existing = await prisma.chatMessage.findUnique({ where: { externalMessageId: mid } })
      if (existing) {
        // WARNING: feature 00023 — คืนแถวเดิมเฉย ๆ ไม่พออีกต่อไป
        //
        // แถวที่ echo เขียนไว้จะมี autoReplyKind = null (ingest ไม่รู้ว่าใครเป็นคนส่ง) ถ้าปล่อยค้าง
        // ไว้แบบนั้น เกณฑ์ "พนักงานเข้ามาตอบ" (senderRole=SHOP AND autoReplyKind IS NULL) จะนับ
        // คำตอบของบอทเองเป็นพนักงาน แล้วระบบจะหยุดตัวเอง = ตอบครั้งแรกแล้วเงียบตลอดกาล
        // และอาการจะถูกวินิจฉัยผิดเป็นบั๊ก cooldown เพราะดูจากภายนอกเหมือนกันทุกอย่าง
        //
        // จึงต้องติดป้ายย้อนหลังให้แถวนั้น. updateMany + เงื่อนไข autoReplyKind: null = idempotent
        // และไม่ทับของที่ถูกต้องอยู่แล้ว (กรณี retry ที่แถวถูกติดป้ายไปแล้วรอบก่อน)
        if (params.autoReplyKind) {
          await prisma.chatMessage.updateMany({
            where: { id: existing.id, autoReplyKind: null },
            data: { autoReplyKind: params.autoReplyKind },
          })
          message = { ...existing, autoReplyKind: params.autoReplyKind }
        } else {
          message = existing
        }
      } else {
        throw e
      }
    } else {
      throw e
    }
  }

  if (failureReason) {
    // แนบแถวที่ "บันทึกสำเร็จแล้ว" ไปกับ error ด้วย (2026-08-03)
    //
    // ทำไม: ส่งไม่ผ่าน ≠ ไม่ได้บันทึก — เราเขียนแถว deliveryStatus=FAILED ลง DB ไปแล้วข้างบน
    // ถ้าโยน error เปล่า ๆ ฝั่ง client จะไม่มีอะไรไปแทนบับเบิล optimistic ของมัน → ค้างไว้คู่กับ
    // แถวจริงที่ตามมาทาง realtime/GET = ผู้ใช้เห็นข้อความเดียวกันสองอัน แล้วหายไปเองตอน refresh
    // (บั๊กจริง user report 2026-08-03 หลังเลิกบล็อกหน้าต่าง 24 ชม. — ก่อนหน้านั้น WINDOW_CLOSED
    // ถูกโยนก่อนสร้างแถว จึงไม่เคยมีแถวจริงมาชนกับบับเบิล optimistic)
    const err = new Error(`SEND_FAILED: ${failureReason}`) as SendFailedError
    err.savedMessage = message
    throw err
  }

  // feature 00023 — พนักงานตอบเอง = บอทต้องหลบ (BR-AR-22 / humanTakeoverPauseMode)
  //
  // เงื่อนไข `!params.autoReplyKind` คือหัวใจ: ถ้าไม่แยก บอทจะหยุดตัวเองทุกครั้งที่ตอบ
  // เพราะคำตอบของบอทก็เดินผ่านฟังก์ชันนี้เหมือนกัน (คอลัมน์ autoReplyKind มีไว้เพื่อการนี้)
  // ทำหลังส่งสำเร็จเท่านั้น — ส่งไม่ผ่าน = ลูกค้าไม่ได้รับอะไร ไม่ใช่การรับช่วงต่อ
  if (!params.autoReplyKind) {
    await pauseForHumanTakeover(params.conversationId, conversation.shopId)
  }
  return message
}

/** preview สำหรับ Conversation.lastMessagePreview เมื่อคำนวณจากแถวที่ "มีอยู่แล้ว" (ใช้ตอนสร้าง
 *  snapshot ใหม่หลังยกเลิกข้อความ) — ต้องให้ผลตรงกับที่เขียนตอน insert ไม่งั้นข้อความในกล่องขาเข้า
 *  จะไม่ตรงกับบับเบิลล่างสุดของเธรด. ชื่อไฟล์แนบไม่ได้ต่อท้ายเหมือนตอน insert เพราะ preview ใน
 *  list ต้องสั้น (user report 2026-07-25) และแถวเก่าก่อน 2026-08-02 ไม่มี attachmentName */
const CANCEL_SNAPSHOT_PREVIEW: Record<string, string> = {
  IMAGE: '[รูปภาพ]',
  VIDEO: '[วิดีโอ]',
  AUDIO: '[ข้อความเสียง]',
  FILE: '[ไฟล์แนบ]',
  ORDER: '[คำสั่งซื้อ]',
  PRODUCT: '[สินค้า]',
}

/**
 * cancelFailedOutboundMessage — ร้านกด "ยกเลิกการส่งข้อความ" บนบับเบิลที่ยิงออกไม่สำเร็จ
 * (user สั่ง 2026-08-02)
 *
 * ลบแถวทิ้งจริง ไม่ใช่ mark isDeleted: `isDeleted` มีไว้สำหรับ "unsend" ของข้อความที่ **ส่งถึง
 * ลูกค้าไปแล้ว** จึงต้องเหลือหลักฐานว่าเคยมีข้อความอยู่ตรงนั้น (บับเบิล "ข้อความถูกลบ") — ส่วน
 * แถวที่ deliveryStatus='FAILED' ลูกค้าไม่เคยเห็นอะไรเลย การทิ้ง tombstone ไว้จึงเป็นการโกหก
 * ผู้ขายว่า "มีข้อความถูกลบ" ทั้งที่ไม่เคยมีข้อความไปถึง
 *
 * ข้อจำกัดที่ทำให้ปลอดภัยต่อ invariant append-only ของ ChatMessage (schema.prisma:1411):
 * ลบได้เฉพาะแถว FAILED ของฝั่งร้านเท่านั้น — แถวที่ส่งสำเร็จ/ของลูกค้า ลบจากที่นี่ไม่ได้เด็ดขาด
 * (นี่คือเหตุผลที่ "ส่งซ้ำ" ยังเป็นการสร้างข้อความใหม่ ไม่ใช่แก้แถวเดิม: ส่งซ้ำเป็นเหตุการณ์ใหม่
 * ส่วนยกเลิกคือผู้ใช้สั่งทิ้งความพยายามนั้นทิ้งอย่างตั้งใจ)
 */
export async function cancelFailedOutboundMessage(params: {
  conversationId: string
  messageId: string
  actorUserId: string
}): Promise<void> {
  const message = await prisma.chatMessage.findFirst({
    where: { id: params.messageId, conversationId: params.conversationId },
    select: { id: true, deliveryStatus: true, senderRole: true },
  })
  if (!message) throw new Error('MESSAGE_NOT_FOUND')
  // เช็คก่อน authz ไม่ได้ — ต้องรู้ก่อนว่า user แตะเธรดนี้ได้ไหม ไม่งั้นสถานะของข้อความรั่วออกไป
  const conversation = await prisma.conversation.findUnique({
    where: { id: params.conversationId },
    select: { id: true, shopId: true },
  })
  if (!conversation) throw new Error('CONVERSATION_NOT_FOUND')
  if (!(await canAccessShop(conversation.shopId, params.actorUserId))) throw new Error('FORBIDDEN')
  // สองเงื่อนไขนี้คือขอบเขตทั้งหมดของสิ่งที่ลบได้ — อย่าผ่อนโดยไม่คิดให้จบ
  if (message.deliveryStatus !== 'FAILED' || message.senderRole !== 'SHOP') {
    throw new Error('MESSAGE_NOT_CANCELLABLE')
  }

  await prisma.$transaction(async (tx) => {
    await tx.chatMessage.delete({ where: { id: message.id } })

    // snapshot ของเธรดอาจชี้ข้อความที่เพิ่งลบไป — คำนวณใหม่จากแถวที่เหลือ ไม่งั้นกล่องขาเข้า
    // จะโชว์ข้อความที่ไม่มีอยู่แล้ว. เรียงด้วย seq ร่วมด้วยตามที่ schema กำหนด (ตัวตัดสินเมื่อ
    // createdAt เท่ากัน) เขียนใน transaction เดียวกับการลบเสมอ (invariant M-2)
    const newest = await tx.chatMessage.findFirst({
      where: { conversationId: params.conversationId },
      orderBy: [{ createdAt: 'desc' }, { seq: 'desc' }],
      select: { createdAt: true, body: true, type: true, senderRole: true },
    })
    await tx.conversation.update({
      where: { id: params.conversationId },
      data: newest
        ? {
            lastMessageAt: newest.createdAt,
            lastMessagePreview: CANCEL_SNAPSHOT_PREVIEW[newest.type] ?? (newest.body ?? '').slice(0, 100),
            lastSenderRole: newest.senderRole,
          }
        : // เธรดว่างเปล่า (ข้อความเดียวที่มีคือตัวที่เพิ่งยกเลิก) — ล้าง preview ไม่ใช่ปล่อยค้าง
          { lastMessagePreview: null, lastSenderRole: null },
    })
  })
}
