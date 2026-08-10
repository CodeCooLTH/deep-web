// (S-4, feature 00025 TFR-LINE-04/09/10, TD-005) — implement `ChannelAdapter` สำหรับ LINE Messaging API
//
// ยังไม่ต่อ route ใด ๆ ในงานนี้ (S-5/S-6/S-8 เป็นคนเรียกใช้ทีหลัง) — ไฟล์นี้รู้จักแค่ LINE เท่านั้น
// ไม่รู้จัก Prisma/DB (ตาม scope baseline S-4 "ไม่ทำ")

import { lineApiRequest, lineDataApiRequest } from '@/lib/line/client'
import { MAX_PARTS, QUOTA_FETCH_TIMEOUT_MS, REPLY_WINDOW_MS } from '@/lib/line/constants'
import type { LineQuotaRead } from '@/lib/line/quota'
import type {
  ChannelAdapter,
  ChannelCapabilities,
  ChannelContext,
  DownloadContentRef,
  DownloadContentResult,
  OutboundMessagePart,
  SendMessagesResult,
} from './adapter'

// LINE: ไม่ echo ข้อความที่เรายิงออกกลับมาทาง webhook (ต้องเขียน ChatMessage ตอนส่งเองเสมอ) ไม่มี
// message_reads webhook (ไม่มี "อ่านแล้ว") หน้าต่างตอบฟรีผูกกับ reply token อายุ 60 วินาที (ไม่ใช่นับจาก
// ข้อความล่าสุดแบบ Meta) และยิงได้สูงสุด 5 message object ต่อคำขอ (array `messages`)
//
// 🛑 อ้างค่าจาก line/constants.ts ตรง ๆ ห้าม hardcode ตัวเลขซ้ำ (scope baseline S-4)
const LINE_CAPABILITIES: ChannelCapabilities = {
  echo: false,
  readReceipt: false,
  freeWindowMs: REPLY_WINDOW_MS,
  maxPartsPerRequest: MAX_PARTS,
}

/**
 * TD-005 (SDS) — จุดเดียวในระบบที่ประกอบ `ChatMessage.externalMessageId` ของ LINE ห้ามประกอบ string
 * นี้เองที่อื่น (S-6 ingest / S-7 media / S-8 outbound ต้อง import ตัวนี้ไปใช้เสมอ) prefix กัน
 * namespace ของ id LINE ชนกับ mid ของ Meta ในคอลัมน์ unique เดียวกัน
 */
export function buildLineExternalMessageId(lineMessageId: string): string {
  return `LINE:${lineMessageId}`
}

/**
 * แปลง OutboundMessagePart หนึ่งชิ้นเป็น message object ของ LINE Messaging API
 *
 * API.md ของ feature นี้ (§4.2) พูดถึงแค่สัญญาการ "เชื่อมช่องทาง" (connect) ไม่ได้ลงรายละเอียด field
 * ระดับ message object ขาออกของ LINE เลย — รูปร่างด้านล่างยึดจากสเปกจริงของ LINE Messaging API
 * "Message objects" (text/image/video/audio ตามที่ประกาศรองรับใน OutboundMessagePart ของ adapter.ts)
 * โดยมี 2 จุดที่เอกสาร LINE ไม่ครอบตรง ๆ กับสิ่งที่เรามี — อธิบาย inline ที่จุดนั้น
 */
function toLineMessage(part: OutboundMessagePart): Record<string, unknown> {
  if (part.kind === 'text') {
    return { type: 'text', text: part.text }
  }

  if (part.kind === 'sticker') {
    // (S-18a, user เปลี่ยน scope 2026-08-10 ทับมติเดิม OOS-08) ส่งสติกเกอร์ออกได้แล้ว — LINE sticker
    // message ต้องมีทั้ง `packageId`+`stickerId` คู่กันเสมอ (ต่างจาก Meta ที่ใช้ stickerId ตัวเดียว)
    // caller (sendOutboundLineMessage) เป็นคนหา packageId จาก SSOT ของเรา (lib/line/stickers.ts) มาให้
    // แล้วเท่านั้น — ไม่มี packageId ที่นี่ = stickerId ไม่อยู่ในชุดที่เรายืนยันว่าส่งได้ ปฏิเสธด้วย error
    // ที่อ่านออกแทนการเดา packageId แบบสุ่ม (ห้ามยิงไปให้ LINE เดาเอง)
    if (!part.packageId) {
      throw new Error(
        `LineAdapter.sendMessages: ไม่รู้จัก stickerId "${part.stickerId}" (ไม่มี packageId คู่กันในชุดที่ยืนยันว่าส่งได้ — ดู lib/line/stickers.ts)`,
      )
    }
    return { type: 'sticker', packageId: part.packageId, stickerId: part.stickerId }
  }

  const { attachmentKind, url } = part

  if (attachmentKind === 'IMAGE') {
    // LINE image message ต้องมีทั้ง originalContentUrl (≤10MB) และ previewImageUrl (**≤1MB**)
    // ผู้เรียกย่อรูปมาให้แล้วผ่าน `previewUrl` (ดู lib/line/preview-image.ts) — ไม่มีค่านั้นแปลว่า
    // ย่อไม่สำเร็จ ถอยไปใช้ไฟล์เต็มเป็น preview เหมือนเดิม (รูปตัวอย่างอาจไม่ขึ้น แต่ข้อความยังถึง
    // ลูกค้า ซึ่งสำคัญกว่า — ห้ามให้เรื่องรูปตัวอย่างมาบล็อกการส่ง)
    return { type: 'image', originalContentUrl: url, previewImageUrl: part.previewUrl ?? url }
  }

  if (attachmentKind === 'VIDEO') {
    // LINE video message ต้องการ previewImageUrl เป็น "ภาพนิ่ง" JPEG/PNG ≤1MB ไม่ใช่ไฟล์วิดีโอ —
    // เราสกัดเฟรมจากวิดีโอไม่ได้ (ไม่มี ffmpeg ในระบบ) ผู้เรียกจึงส่งภาพนิ่งสำรองมาให้ทาง previewUrl
    // ไม่มีค่านั้น = ถอยไปใช้ url ของวิดีโอเองตามพฤติกรรมเดิม (LINE อาจไม่แสดงภาพตัวอย่าง แต่ตัว
    // วิดีโอยังเปิดเล่นได้ — ยอมรับความเสี่ยงนี้แทนการไม่ส่งเลย)
    return { type: 'video', originalContentUrl: url, previewImageUrl: part.previewUrl ?? url }
  }

  if (attachmentKind === 'AUDIO') {
    // LINE audio message ต้องการ `duration` (หน่วยมิลลิวินาที) เป็นตัวเลข แต่ OutboundMessagePart ไม่มี
    // ข้อมูลความยาวไฟล์เสียงเลย (ไม่ได้ decode ไฟล์ในชั้นนี้) — เอกสาร LINE ระบุว่าค่านี้ใช้แสดง
    // progress bar ของตัวเล่นเสียงในแอปเท่านั้น ไม่ใช่เงื่อนไขที่ทำให้ LINE ปฏิเสธข้อความ จึงใส่
    // placeholder ไปก่อน (ยอมรับความเสี่ยงว่า progress bar อาจแสดงความยาวผิด — ต้องแก้ด้วยการวัด
    // duration จริงถ้ามีรายงานปัญหา)
    return { type: 'audio', originalContentUrl: url, duration: 1 }
  }

  // FILE: LINE Messaging API ไม่มี message type สำหรับ "ไฟล์แนบทั่วไป" เลย (ชนิดที่ส่งได้มีแค่
  // text/sticker/image/video/audio/location/imagemap/template/flex ตามสเปก Messaging API) — ทางเลือก
  // ที่ตรงกับแพลตฟอร์มจริงที่สุดคือส่งเป็นข้อความตัวอักษรที่มีลิงก์ไฟล์ให้ลูกค้ากดเปิดเอง
  return { type: 'text', text: url }
}

/** ผลของ `POST /v2/bot/message/reply|push` — ใช้ชิ้นแรกของ sentMessages เป็นทั้ง externalMessageId
 *  หลัก (ตรงกับ comment ของ SendMessagesResult ใน adapter.ts: "ชิ้นแรกที่ส่งสำเร็จ") และ quoteToken
 *  (S-18a, additive) — 🛑 session นี้ยืนยันกับ payload จริงไม่ได้ (ไม่มีเครื่องมือยิง LINE จริง) ว่า
 *  sentMessages[].quoteToken มาด้วยเสมอไหม — อ่านแบบ defensive (ไม่มีก็ undefined เฉย ๆ ไม่ throw ไม่ใช่
 *  เงื่อนไขที่ตัดสินว่าส่งสำเร็จไหม) ถ้ามีจริงจะใช้อ้าง (quote) ข้อความที่ "เรา" ส่งเองต่อได้ในรอบถัดไป
 *  ถ้าไม่มีจริง ผลคือแค่ quote ข้อความที่เราส่งเองไม่ได้ (quote ข้อความขาเข้าของลูกค้ายังทำงานตามปกติ —
 *  อันนั้น Controller ยืนยันจากเอกสารแล้วว่ามีจริง) */
function extractSendResult(json: Record<string, unknown>): SendMessagesResult {
  const sentMessages = json.sentMessages as Array<{ id?: string; quoteToken?: unknown }> | undefined
  const first = sentMessages?.[0]
  return {
    externalMessageId: first?.id ?? '',
    quoteToken: typeof first?.quoteToken === 'string' ? first.quoteToken : undefined,
  }
}

async function sendMessages(ctx: ChannelContext, parts: OutboundMessagePart[]): Promise<SendMessagesResult> {
  if (parts.length === 0) throw new Error('LineAdapter.sendMessages: parts ว่างเปล่า')
  if (parts.length > MAX_PARTS) {
    // การแบ่งชุด (batching) เป็นงานของ S-10 ที่ endpoint/composer ชั้นบน — adapter นี้แค่ปฏิเสธทันที
    // เมื่อเกินเพดานเพื่อไม่ให้ยิง LINE แล้วโดน 400 ที่อ่านสาเหตุไม่ออก
    throw new Error(`LineAdapter.sendMessages: ส่งได้ครั้งละไม่เกิน ${MAX_PARTS} ชิ้น (ได้รับ ${parts.length})`)
  }

  const messages = parts.map(toLineMessage)
  // (S-18a, additive) quote reply — แปะ quoteToken เข้า message object ตัวแรกเท่านั้น (ตัวแทนของ "ข้อความ
  // ที่กำลังตอบ" ในชุดที่ยิงไปพร้อมกัน) caller เป็นคนหา token มาให้แล้ว (ดู comment ChannelContext.quoteToken
  // — ไม่มีค่า = ไม่ใช่ quote reply ก็ส่งตามปกติ ไม่แตะ messages เลย)
  if (ctx.quoteToken) {
    messages[0] = { ...messages[0], quoteToken: ctx.quoteToken }
  }

  // การตัดสินใจ reply vs push ไม่ใช่หน้าที่ของ adapter (เป็นงานของ S-8) — ที่นี่แค่ทำตามที่ ctx บอก:
  // มี replyToken → ยิง reply endpoint, ไม่มี → ยิง push ด้วย recipientId (ดู comment ChannelContext.replyToken)
  if (ctx.replyToken) {
    const json = await lineApiRequest('/v2/bot/message/reply', ctx.accessToken, {
      method: 'POST',
      body: { replyToken: ctx.replyToken, messages },
    })
    return extractSendResult(json)
  }

  if (!ctx.recipientId) {
    throw new Error('LineAdapter.sendMessages: ต้องมี recipientId เมื่อไม่ได้ส่งด้วย replyToken (push)')
  }
  const json = await lineApiRequest('/v2/bot/message/push', ctx.accessToken, {
    method: 'POST',
    body: { to: ctx.recipientId, messages },
  })
  return extractSendResult(json)
}

async function fetchContactProfile(
  ctx: ChannelContext,
  externalUserId: string,
): Promise<{ name: string | null; avatarUrl: string | null }> {
  try {
    const json = await lineApiRequest(`/v2/bot/profile/${externalUserId}`, ctx.accessToken)
    return {
      name: typeof json.displayName === 'string' ? json.displayName : null,
      avatarUrl: typeof json.pictureUrl === 'string' ? json.pictureUrl : null,
    }
  } catch {
    // 404 (ยังไม่แอดเพื่อน/บล็อกแล้ว) หรือ error อื่นใด ๆ จาก LINE (เช่น LINE_UNAVAILABLE) — ต้องไม่
    // throw ตามสัญญาของ adapter.ts ("ดึงชื่อไม่ได้ไม่ใช่เหตุให้ข้อความหาย") พฤติกรรมเดียวกับ
    // getContactProfile เดิมของ facebook/graph.ts ที่คืน null ทั้งคู่แบบเงียบ ๆ เช่นกัน — ผู้เรียก
    // (TFR-LINE-10) ใช้ชื่อสำรอง "ลูกค้า LINE" เอง ไม่ใช่หน้าที่ของ adapter
    return { name: null, avatarUrl: null }
  }
}

async function downloadContent(ctx: ChannelContext, ref: DownloadContentRef): Promise<DownloadContentResult> {
  // LINE ไม่มี URL สาธารณะให้ mirror ยิง fetch เองแบบ Meta เลย — ต้อง GET ผ่าน DATA_API_BASE ด้วย
  // token เสมอ (ดู comment DownloadContentRef ใน adapter.ts) ref.url จะไม่ถูกใช้เลยในทุกกรณี
  if (!ref.externalMessageId) return { url: null }

  const res = await lineDataApiRequest(`/v2/bot/message/${ref.externalMessageId}/content`, ctx.accessToken)
  if (!res.ok) {
    // ตามธรรมเนียมเดิมของโค้ดฐาน (ดู fetchAttachmentUrl ของ facebook/graph.ts) — ฟังก์ชัน "ดาวน์โหลด
    // เนื้อหา" ไม่ throw เมื่อดาวน์โหลดไม่สำเร็จ คืนค่าว่างแล้วให้ผู้เรียก (S-7 media mirror) ตัดสินใจ
    // สร้าง placeholder เอง (TFR-LINE-09: "ล้มเหลว → placeholder ห้ามทิ้ง event")
    return { url: null, content: null }
  }

  const contentType = res.headers.get('content-type')
  const data = Buffer.from(await res.arrayBuffer())
  return { url: null, content: { data, contentType } }
}

/**
 * (S-9, TFR-LINE-07) อ่านโควตาข้อความรายเดือนจาก LINE — **ไม่ได้อยู่ใน `ChannelAdapter`** โดยตั้งใจ
 *
 * เพราะ "โควตารายเดือนต่อบัญชี" เป็นแนวคิดที่ Meta ไม่มีเลย (Messenger/IG ไม่จำกัดจำนวนข้อความ
 * แต่จำกัด *หน้าต่างเวลา* แทน) การยัดเป็น optional method บนสัญญากลางจะทำให้ทุก provider ในอนาคต
 * ต้องตอบคำถามที่ไม่เกี่ยวกับตัวเอง — ผู้เรียกคือ `line-quota.service.ts` ซึ่งเป็นของ LINE ล้วนอยู่แล้ว
 *
 * โยน error เสมอเมื่ออ่านไม่สำเร็จ (LineApiError จาก client หรือ Error ธรรมดาเมื่อ payload ผิดรูป) —
 * 🛑 **ห้ามกลืน error เป็น "ไม่จำกัด"** เพราะปลายทางจะแยกไม่ออกระหว่าง "แพ็กเกจไม่จำกัดจริง" กับ
 * "อ่านไม่ได้" ซึ่งอันหลังต้องกลายเป็น UNKNOWN (TD-006) ผู้เรียกเป็นคนแปลง error → UNKNOWN เอง
 */
export async function fetchLineQuota(ctx: ChannelContext): Promise<Exclude<LineQuotaRead, { kind: 'UNKNOWN' }>> {
  // ยิงขนานกัน — สองคำขอนี้ไม่ขึ้นต่อกัน และมันอยู่บนเส้นทางกดส่งด้วย (TFR-LINE-06 ข้อ 5)
  // การต่อคิวกันจะเพิ่มเวลารอของผู้ใช้เป็นสองเท่าโดยไม่ได้อะไรกลับมา
  const [quota, consumption] = await Promise.all([
    lineApiRequest('/v2/bot/message/quota', ctx.accessToken, { timeoutMs: QUOTA_FETCH_TIMEOUT_MS }),
    lineApiRequest('/v2/bot/message/quota/consumption', ctx.accessToken, { timeoutMs: QUOTA_FETCH_TIMEOUT_MS }),
  ])

  // LINE ตอบ `type: 'none' | 'limited'` — 'none' = ไม่มีเพดาน (แพ็กเกจไม่จำกัด) ไม่ใช่ "ไม่มีโควตา
  // เหลือ" ตามที่ชื่ออ่านเหมือน. ค่าที่ไม่รู้จักในอนาคตให้ตกมาทาง 'limited' ไม่ได้ — ถือเป็นไม่จำกัด
  // (allow-list: บล็อกได้เฉพาะเมื่อรู้ตัวเลขจริงเท่านั้น)
  if (quota.type !== 'limited') return { kind: 'UNLIMITED' }

  const total = Number(quota.value)
  const used = Number(consumption.totalUsage)
  if (!Number.isFinite(total)) {
    throw new Error('fetchLineQuota: LINE ตอบ type=limited แต่ไม่มี value ที่เป็นตัวเลข')
  }
  // อ่าน totalUsage ไม่ได้ = ยังไม่รู้ว่าใช้ไปเท่าไหร่ → นับเป็น 0 (คือ "เหลือเต็มเพดาน") ซึ่งเป็น
  // ฝั่งที่ปลอดภัยกว่าสำหรับผู้ใช้: ผิดทางนี้ = ปล่อยให้กดส่งแล้ว LINE ปฏิเสธเอง (มีเส้นทาง error
  // รองรับ) ส่วนผิดอีกทาง = บล็อกร้านไม่ให้ตอบลูกค้าด้วยตัวเลขที่เราอ่านไม่ได้
  return { kind: 'LIMITED', total, used: Number.isFinite(used) ? used : 0 }
}

export const LineAdapter: ChannelAdapter = {
  capabilities: LINE_CAPABILITIES,
  sendMessages,
  fetchContactProfile,
  downloadContent,
}
