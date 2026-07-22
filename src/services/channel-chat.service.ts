import { prisma } from '@/lib/prisma'
import { getChannelByExternalId, markChannelTokenInvalid } from '@/services/shop-channel.service'
import { getContactProfile, sendTextMessage, GraphApiError } from '@/lib/facebook/graph'
import { decryptToken } from '@/lib/token-crypto'
import type { MessagingEvent } from '@/lib/facebook/webhook-types'

// รับ-ส่งข้อความของช่องทางนอก (feature 00018)
// แยกจาก chat.service.ts เพราะ chat เดิมมีสมมติฐานว่าทั้งสองฝั่งเป็น User ในระบบ

// หน้าต่างตอบกลับมาตรฐานของ Meta — นับจากข้อความล่าสุด "ของลูกค้า"
export const MESSAGING_WINDOW_MS = 24 * 60 * 60 * 1000

export function getWindowState(
  lastInboundAt: Date | null,
  now: Date = new Date(),
): { open: boolean; expiresAt: Date | null; msRemaining: number } {
  if (!lastInboundAt) return { open: false, expiresAt: null, msRemaining: 0 }
  const expiresAt = new Date(lastInboundAt.getTime() + MESSAGING_WINDOW_MS)
  const msRemaining = expiresAt.getTime() - now.getTime()
  return { open: msRemaining > 0, expiresAt, msRemaining: Math.max(0, msRemaining) }
}

export type IngestStatus = 'STORED' | 'DUPLICATE' | 'NO_CHANNEL' | 'IGNORED'

export async function ingestInboundMessage(params: {
  provider: string
  pageExternalId: string
  event: MessagingEvent
}): Promise<{ status: IngestStatus; conversationId?: string }> {
  const { provider, pageExternalId, event } = params

  // event ที่ไม่ใช่ข้อความ (delivery/read receipt ฯลฯ) — ไม่ใช่ error แค่ไม่สนใจ
  if (!event.message?.mid) return { status: 'IGNORED' }

  const channel = await getChannelByExternalId(provider, pageExternalId)
  // Page ที่ไม่มีร้านไหนเชื่อม — ตอบ 200 ให้ Meta เสมอ ไม่งั้นจะ retry ไม่จบ
  if (!channel) return { status: 'NO_CHANNEL' }

  // is_echo = ข้อความจากฝั่งเพจ (seller ตอบจากแอป Messenger เอง หรือ echo ของที่เราส่ง)
  // ผู้ติดต่อคือ "อีกฝั่ง" เสมอ → echo ใช้ recipient, ไม่ใช่ sender
  const isEcho = event.message.is_echo === true
  const contactExternalId = isEcho ? event.recipient.id : event.sender.id
  const senderRole = isEcho ? 'SHOP' : 'BUYER'

  const profile = await getContactProfile(contactExternalId, channel.accessToken)

  const contact = await prisma.externalContact.upsert({
    where: { shopChannelId_externalUserId: { shopChannelId: channel.id, externalUserId: contactExternalId } },
    create: {
      shopChannelId: channel.id,
      externalUserId: contactExternalId,
      name: profile.name,
      avatarUrl: profile.avatarUrl,
    },
    // อัปเดตชื่อ/รูปทุกครั้ง — ลูกค้าเปลี่ยนรูปโปรไฟล์แล้ว inbox ควรตามทัน
    update: { name: profile.name, avatarUrl: profile.avatarUrl },
  })

  const text = event.message.text ?? null
  const firstAttachment = event.message.attachments?.[0]
  const isImage = firstAttachment?.type === 'image'
  const type = isImage ? 'IMAGE' : 'TEXT'
  const preview = isImage ? '[รูปภาพ]' : (text ?? '').slice(0, 100)
  const occurredAt = event.timestamp ? new Date(event.timestamp) : new Date()

  try {
    return await prisma.$transaction(async (tx) => {
      let conversation = await tx.conversation.findUnique({
        where: {
          shopChannelId_externalContactId: { shopChannelId: channel.id, externalContactId: contact.id },
        },
      })
      if (!conversation) {
        conversation = await tx.conversation.create({
          data: {
            shopId: channel.shopId,
            channel: provider,
            shopChannelId: channel.id,
            externalContactId: contact.id,
          },
        })
      }

      await tx.chatMessage.create({
        data: {
          conversationId: conversation.id,
          senderUserId: null,
          senderRole,
          type,
          body: text,
          // imageUrl ของ chat เดิมเก็บเป็น fileId ของ storage ไม่ใช่ URL —
          // รูปจาก Meta มี URL หมดอายุ ต้อง mirror เข้า storage ก่อน (Task 12)
          imageUrl: null,
          externalMessageId: event.message!.mid,
          deliveryStatus: 'SENT',
        },
      })

      await tx.conversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageAt: occurredAt,
          lastMessagePreview: preview,
          lastSenderRole: senderRole,
          // lastInboundAt ขยับเฉพาะข้อความ "ของลูกค้า" — echo คือฝั่งร้านตอบ
          // ถ้าขยับด้วยจะทำให้ 24h window ยืดออกเองอย่างผิด ๆ
          ...(isEcho ? {} : { lastInboundAt: occurredAt }),
        },
      })

      // แจ้งเตือนเจ้าของร้านเฉพาะข้อความจากลูกค้า (echo คือร้านตอบเอง ไม่ต้องเตือน)
      if (!isEcho) {
        const shop = await tx.shop.findUnique({
          where: { id: channel.shopId },
          select: { userId: true },
        })
        if (shop) {
          await tx.notification.create({
            data: {
              userId: shop.userId,
              kind: 'chat_message',
              title: `ข้อความใหม่จาก ${contact.name ?? 'ลูกค้า'}`,
              body: preview,
              refId: conversation.id,
            },
          })
        }
      }

      return { status: 'STORED' as const, conversationId: conversation.id }
    })
  } catch (e) {
    // P2002 บน externalMessageId = Meta ยิงซ้ำ หรือเป็น echo ของข้อความที่เรา
    // เพิ่งส่งออกไปเอง (เก็บ mid ไว้แล้วตอนส่ง) — ทั้งสองกรณีคือ "มีอยู่แล้ว" ไม่ใช่ error
    if ((e as { code?: string })?.code === 'P2002') return { status: 'DUPLICATE' }
    throw e
  }
}

// ส่งข้อความจาก Deep ออกไปยัง Messenger/IG (feature 00018)
//
// ลำดับสำคัญ: ส่งออกก่อน → ได้ mid → ค่อยเขียน DB
// เพราะ echo webhook จะยิง mid เดียวกันกลับมา แล้ว unique constraint บน
// externalMessageId จะ dedupe ให้เอง ถ้าเขียน DB ก่อนส่งจะได้ข้อความซ้ำ 2 แถว
export async function sendOutboundMessage(params: {
  conversationId: string
  actorUserId: string
  text: string
}) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: params.conversationId },
    include: { shopChannel: true, externalContact: true },
  })
  if (!conversation) throw new Error('CONVERSATION_NOT_FOUND')
  if (conversation.channel === 'DEEP' || !conversation.shopChannel || !conversation.externalContact) {
    throw new Error('NOT_EXTERNAL_CHANNEL')
  }

  const shop = await prisma.shop.findUnique({
    where: { id: conversation.shopId },
    select: { userId: true },
  })
  if (!shop) throw new Error('SHOP_NOT_FOUND')
  if (shop.userId !== params.actorUserId) throw new Error('FORBIDDEN')

  // เช็คหน้าต่าง 24 ชม. ก่อนยิง — กันเปลือง quota และกัน error ที่คาดเดาได้อยู่แล้ว
  if (!getWindowState(conversation.lastInboundAt).open) throw new Error('WINDOW_CLOSED')

  const pageToken = decryptToken(conversation.shopChannel.accessTokenEnc)

  let mid: string | null = null
  let failureReason: string | null = null
  try {
    mid = await sendTextMessage(
      conversation.shopChannel.externalId,
      pageToken,
      conversation.externalContact.externalUserId,
      params.text,
    )
  } catch (e) {
    failureReason = e instanceof Error ? e.message : 'ส่งข้อความไม่สำเร็จ'
    // code 190 = token ใช้ไม่ได้แล้ว (เจ้าของถอนสิทธิ์/เปลี่ยนรหัส) — ต้องให้ร้านเชื่อมใหม่
    if (e instanceof GraphApiError && e.code === 190) {
      await markChannelTokenInvalid(conversation.shopChannel.id)
    }
  }

  const preview = params.text.slice(0, 100)
  const message = await prisma.chatMessage.create({
    data: {
      conversationId: conversation.id,
      senderUserId: params.actorUserId,
      senderRole: 'SHOP',
      type: 'TEXT',
      body: params.text,
      externalMessageId: mid || null,
      deliveryStatus: failureReason ? 'FAILED' : 'SENT',
      failureReason,
    },
  })

  // อัปเดต snapshot แม้ส่งไม่สำเร็จ — seller ต้องเห็นในเธรดว่าพยายามส่งแล้วพลาด
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: message.createdAt, lastMessagePreview: preview, lastSenderRole: 'SHOP' },
  })

  if (failureReason) throw new Error(`SEND_FAILED: ${failureReason}`)
  return message
}
