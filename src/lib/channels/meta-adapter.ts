// (S-1, feature 00025 TFR-LINE-13/TD-008) — ห่อฟังก์ชันเดิมของ src/lib/facebook/graph.ts เข้ารูปแบบ
// ChannelAdapter ให้ MESSENGER และ INSTAGRAM ใช้ตัวเดียวกัน (Meta ใช้ Send API เดียวกันทั้งคู่
// ต่างกันแค่ provider string ที่ getContactProfile ใช้เลือก endpoint)
//
// 🛑 ห้ามแก้ logic เดิมของ facebook/graph.ts แม้แต่บรรทัดเดียว — ไฟล์นี้ "delegate ตรง ๆ" เท่านั้น
// (scope baseline 00025 S-1) ผลคือ error/behavior ของ Messenger/IG เหมือนเดิมทุกประการ เพราะยังเป็น
// ฟังก์ชันเดียวกันที่ถูกเรียก แค่ผ่านชื่ออื่น

import {
  getContactProfile,
  fetchAttachmentUrl,
  sendTextMessage,
  sendAttachmentMessage,
  sendStickerMessage,
  type GraphAttachmentType,
} from '@/lib/facebook/graph'
import type {
  ChannelAdapter,
  ChannelCapabilities,
  ChannelContext,
  DownloadContentRef,
  DownloadContentResult,
  OutboundMessagePart,
  SendMessagesResult,
} from './adapter'

// Meta: ได้ echo ของข้อความที่ยิงออกเองกลับมาทาง webhook (ใช้ dedupe) + มี message_reads (อ่านแล้ว)
// ไม่มีหน้าต่างตอบฟรีแบบ token (นับจากข้อความล่าสุดของลูกค้าแทน — ดู MESSAGING_WINDOW_MS) และยังยิง
// ทีละ message เดียวเสมอ (ยังไม่รองรับ batch — เป็นงานของ S-10)
const META_CAPABILITIES: ChannelCapabilities = {
  echo: true,
  readReceipt: true,
  freeWindowMs: null,
  maxPartsPerRequest: 1,
}

// OutboundMessagePart.attachmentKind ('IMAGE'|'VIDEO'|'AUDIO'|'FILE') → GraphAttachmentType ที่ Meta
// Send API รับจริง (ค่าเดิมของ GRAPH_ATTACHMENT_TYPE ที่เคยอยู่ใน channel-chat.service.ts)
const ATTACHMENT_KIND_TO_GRAPH: Record<'IMAGE' | 'VIDEO' | 'AUDIO' | 'FILE', GraphAttachmentType> = {
  IMAGE: 'image',
  VIDEO: 'video',
  AUDIO: 'audio',
  FILE: 'file',
}

/** ยิง 1 ชิ้นข้อความจริง — delegate ตรงไปยัง sendTextMessage/sendAttachmentMessage/sendStickerMessage
 *  เดิม พารามิเตอร์ที่ส่งต่อ (replyToMid, tag) ตรงกับที่ channel-chat.service.ts เคยส่งเองทุกประการ */
async function sendOnePart(ctx: ChannelContext, part: OutboundMessagePart): Promise<string> {
  if (!ctx.recipientId) throw new Error('MetaAdapter.sendMessages: ต้องมี recipientId')
  const replyTo = ctx.replyToExternalId ?? undefined
  if (part.kind === 'sticker') {
    return sendStickerMessage(ctx.accessToken, ctx.recipientId, part.stickerId, replyTo, ctx.tag)
  }
  if (part.kind === 'attachment') {
    return sendAttachmentMessage(
      ctx.accessToken,
      ctx.recipientId,
      ATTACHMENT_KIND_TO_GRAPH[part.attachmentKind],
      part.url,
      replyTo,
      ctx.tag,
    )
  }
  return sendTextMessage(ctx.accessToken, ctx.recipientId, part.text, replyTo, ctx.tag)
}

export const MetaAdapter: ChannelAdapter = {
  capabilities: META_CAPABILITIES,

  async sendMessages(ctx, parts): Promise<SendMessagesResult> {
    if (parts.length === 0) throw new Error('MetaAdapter.sendMessages: parts ว่างเปล่า')
    // Meta ยิงทีละ message เสมอ (capabilities.maxPartsPerRequest=1) — ยังไม่มีการรวมหลายชิ้นเป็น
    // คำขอเดียวจนกว่า S-10 จะออกแบบ batching ที่นี่แค่รักษาพฤติกรรมเดิม: วนส่งตามลำดับ
    // (caller เดิมของ channel-chat.service.ts ส่ง parts ยาว 1 เสมอในตอนนี้ — caption ที่ตามหลัง
    // ไฟล์แนบเป็นคนละคำขอแยกอยู่แล้วในโค้ดเดิม ไม่ใช่ part ที่สองในอาร์เรย์เดียวกัน)
    let firstMid: string | null = null
    for (const part of parts) {
      const mid = await sendOnePart(ctx, part)
      if (firstMid === null) firstMid = mid
    }
    return { externalMessageId: firstMid ?? '' }
  },

  async fetchContactProfile(ctx, externalUserId) {
    return getContactProfile(externalUserId, ctx.accessToken, ctx.provider)
  },

  async downloadContent(ctx, ref: DownloadContentRef): Promise<DownloadContentResult> {
    // Meta ให้ URL สาธารณะมากับ webhook อยู่แล้วเป็นทางหลัก (ไม่ต้องยิง Graph เพิ่ม) — fetchAttachmentUrl
    // เป็น fallback เฉพาะตอนไม่มี url มาให้ (payload.url หายไป/หมดอายุ — ดู comment เดิมที่
    // channel-chat.service.ts ตอนเรียก fallback นี้)
    if (ref.url) return { url: ref.url }
    if (ref.externalMessageId) {
      const url = await fetchAttachmentUrl(ref.externalMessageId, ctx.accessToken)
      return { url }
    }
    return { url: null }
  },
}
