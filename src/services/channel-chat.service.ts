import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getChannelByExternalId, markChannelTokenInvalid } from '@/services/shop-channel.service'
import { getContactProfile, sendTextMessage, GraphApiError } from '@/lib/facebook/graph'
import { decryptToken } from '@/lib/token-crypto'
import { saveFile } from '@/lib/storage'
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

const MIRROR_MAX_BYTES = 5 * 1024 * 1024 // ตรงกับ MAX_SIZE ของ lib/storage
// ต้องตรงกับ ALLOWED_TYPES ใน src/lib/storage/types.ts เป๊ะ ๆ — เดิมมี 'image/gif' อยู่ในนี้
// ทั้งที่ storage ฝั่ง validateUpload() ไม่รองรับ gif เลย ทำให้ saveFile() throw ทุกครั้งที่ลูกค้า
// ส่ง gif มา (ถูก catch เงียบ ๆ คืน null ทำให้ดูเหมือนแค่ "โหลดพลาด" แต่จริง ๆ พังทุกครั้ง) (I-5)
const MIRROR_ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

// bubble ต้องไม่ว่างเปล่าแม้กรณี mirror รูปไม่ผ่าน หรือ attachment เป็นชนิดที่เราไม่รองรับ (I-5)
const MIRROR_FAILED_TEXT = '[ลูกค้าส่งรูปภาพ — เปิดดูใน Messenger]'
const UNSUPPORTED_ATTACHMENT_TEXT = '[ลูกค้าส่งไฟล์แนบ — เปิดดูใน Messenger]'

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
  try {
    const res = await fetch(url)
    if (!res.ok) return null

    const contentType = (res.headers.get('content-type') ?? '').split(';')[0]!.trim()
    const ext = MIRROR_ALLOWED_TYPES[contentType]
    if (!ext) return null

    const declaredSize = Number(res.headers.get('content-length') ?? '0')
    if (declaredSize > MIRROR_MAX_BYTES) return null

    const buffer = await res.arrayBuffer()
    if (buffer.byteLength > MIRROR_MAX_BYTES) return null

    const file = new File([buffer], `fb-${Date.now()}.${ext}`, { type: contentType })
    return await saveFile(file)
  } catch {
    return null
  }
}

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

  const contactWhere = {
    shopChannelId_externalUserId: { shopChannelId: channel.id, externalUserId: contactExternalId },
  }
  const existingContact = await prisma.externalContact.findUnique({ where: contactWhere })

  // ดึงโปรไฟล์จาก Graph เฉพาะตอนยังไม่มี contact หรือมีแต่ยังไม่มีชื่อ — ลด Graph call ต่อข้อความ
  // (Minor-5) และกัน Graph error ชั่วคราวทับชื่อจริงที่เก็บไว้แล้วเป็น null (I-2)
  const needsProfile = !existingContact || !existingContact.name
  const profile = needsProfile
    ? await getContactProfile(contactExternalId, channel.accessToken)
    : { name: null, avatarUrl: null }

  const contact = await prisma.externalContact.upsert({
    where: contactWhere,
    create: {
      shopChannelId: channel.id,
      externalUserId: contactExternalId,
      name: profile.name,
      avatarUrl: profile.avatarUrl,
    },
    // อัปเดตเฉพาะ field ที่ได้ค่าจริงจาก Graph — ไม่ทับด้วย null ตอน Graph error ชั่วคราว (I-2)
    update: {
      ...(profile.name ? { name: profile.name } : {}),
      ...(profile.avatarUrl ? { avatarUrl: profile.avatarUrl } : {}),
    },
  })

  const text = event.message.text ?? null
  const firstAttachment = event.message.attachments?.[0]
  const isImage = firstAttachment?.type === 'image'
  const hasUnsupportedAttachment = !!firstAttachment && !isImage
  // ต้อง mirror ก่อนเข้า transaction — network call ในทรานแซกชันจะถือ lock DB นานเกินไป
  const mirroredFileId =
    isImage && firstAttachment?.payload?.url ? await mirrorRemoteImage(firstAttachment.payload.url) : null
  const type = isImage ? 'IMAGE' : 'TEXT'
  // ต้องมี body/preview ที่สื่อความหมายเสมอ ไม่งั้น bubble ในหน้า inbox ว่างเปล่า (I-5):
  // - รูปที่ mirror ไม่ผ่าน (ชนิดไฟล์ storage ไม่รองรับ/โหลดพัง) → placeholder แทนรูป
  // - attachment ที่ไม่ใช่รูป (วิดีโอ/เสียง/ไฟล์) → placeholder ชวนเปิดใน Messenger
  const body = isImage
    ? mirroredFileId
      ? text
      : MIRROR_FAILED_TEXT
    : hasUnsupportedAttachment
      ? UNSUPPORTED_ATTACHMENT_TEXT
      : text
  const preview = isImage
    ? mirroredFileId
      ? '[รูปภาพ]'
      : MIRROR_FAILED_TEXT
    : hasUnsupportedAttachment
      ? UNSUPPORTED_ATTACHMENT_TEXT
      : (text ?? '').slice(0, 100)
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
  const writeMessage = async (tx: Prisma.TransactionClient, conversation: { id: string }) => {
    await tx.chatMessage.create({
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
  }

  try {
    return await prisma.$transaction(async (tx) => {
      let conversation = await tx.conversation.findUnique({ where: conversationWhere })
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
      await writeMessage(tx, conversation)
      return { status: 'STORED' as const, conversationId: conversation.id }
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
            await writeMessage(tx, winner)
            return { status: 'STORED' as const, conversationId: winner.id }
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

  // เช็คสถานะ channel ก่อนยิง Send API — token ตายแล้ว (ถูก markChannelTokenInvalid ไว้) หรือ
  // ร้านถอดการเชื่อมต่อไปแล้ว ยิงไปก็ error 190 ซ้ำแน่ ๆ ไม่ต้องเสีย round-trip ไป Graph (M-6)
  if (conversation.shopChannel.status !== 'ACTIVE') throw new Error('CHANNEL_NOT_ACTIVE')

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
          type: 'TEXT',
          body: params.text,
          externalMessageId: mid || null,
          deliveryStatus: failureReason ? 'FAILED' : 'SENT',
          failureReason,
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
        message = existing
      } else {
        throw e
      }
    } else {
      throw e
    }
  }

  if (failureReason) throw new Error(`SEND_FAILED: ${failureReason}`)
  return message
}
