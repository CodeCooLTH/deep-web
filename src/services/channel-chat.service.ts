import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getChannelByExternalId, markChannelTokenInvalid } from '@/services/shop-channel.service'
import { canAccessShop } from '@/lib/shop-context'
import { getContactProfile, sendTextMessage, sendImageMessage, fetchMessageText, GraphApiError } from '@/lib/facebook/graph'
import { decryptToken } from '@/lib/token-crypto'
import { saveFile, getFileUrl } from '@/lib/storage'
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
// ต้องตรงกับ ALLOWED_TYPES ใน src/lib/storage/types.ts เป๊ะ ๆ — ก่อนหน้านี้ 'image/gif' ถูกตัดออก
// เพราะ storage ฝั่ง validateUpload() ไม่รองรับ ทำให้ saveFile() throw ทุกครั้งที่ลูกค้าส่ง gif
// (ถูก catch เงียบ ๆ คืน null → ตกไปที่ MIRROR_FAILED_TEXT ดูเหมือน "โหลดพลาด" แต่จริง ๆ พังทุกครั้ง).
// ตอนนี้เพิ่ม 'image/gif' เข้า storage ALLOWED_TYPES แล้ว (เก็บ raw bytes ไม่ re-encode คง animation)
// จึง mirror gif/สติกเกอร์เคลื่อนไหวจาก Messenger/IG ได้จริง (bug report ลูกค้า 2026-07-23) (I-5)
const MIRROR_ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  // วิดีโอ/เสียง (ไฟล์แนบ Messenger/IG) — ต้องตรงกับ storage ALLOWED_TYPES (feature 00018)
  'video/mp4': 'mp4',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/ogg': 'ogg',
  'audio/webm': 'webm',
  // ไฟล์เอกสาร (แนบผ่าน Messenger) — PDF พบบ่อยสุด (storage ALLOWED_TYPES มี application/pdf อยู่แล้ว)
  'application/pdf': 'pdf',
}

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
    const ext = MIRROR_ALLOWED_TYPES[contentType]
    if (!ext) return null

    // pre-check จาก header เร็ว ๆ ก่อน (ประหยัด round-trip ถ้าโกหกเกินขนาดชัด ๆ) แต่ตัวตัดสินจริง
    // คือ readBodyWithCap ด้านล่างที่นับ byte สดระหว่างอ่าน — header อย่างเดียวเชื่อไม่ได้ (S-1)
    const declaredSize = Number(res.headers.get('content-length') ?? '0')
    if (declaredSize > MIRROR_MAX_BYTES) return null

    const buffer = await readBodyWithCap(res, MIRROR_MAX_BYTES)
    if (!buffer) return null

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
    ? await getContactProfile(contactExternalId, channel.accessToken, provider)
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
  const attType = firstAttachment?.type // 'image'|'video'|'audio'|'file'|'location'|'fallback'|...
  // ชนิดที่มีไฟล์จริงให้ mirror (payload.url) — image/video/audio/file; location/fallback/template ไม่มี
  const MIRRORABLE = new Set(['image', 'video', 'audio', 'file'])
  const isMirrorable = !!attType && MIRRORABLE.has(attType)
  // ต้อง mirror ก่อนเข้า transaction — network call ในทรานแซกชันจะถือ lock DB นานเกินไป
  const mirroredFileId =
    isMirrorable && firstAttachment?.payload?.url ? await mirrorRemoteImage(firstAttachment.payload.url) : null
  // map attachment.type → ChatMessage.type (String, ไม่ใช่ enum)
  const MSG_TYPE: Record<string, string> = { image: 'IMAGE', video: 'VIDEO', audio: 'AUDIO', file: 'FILE' }
  const type =
    mirroredFileId && attType && MSG_TYPE[attType]
      ? MSG_TYPE[attType]
      : attType === 'image'
        ? 'IMAGE' // รูปที่ mirror ไม่ผ่าน → คง type IMAGE (imageUrl null + placeholder) ตามพฤติกรรมเดิม (I-5)
        : 'TEXT' // วิดีโอ/เสียง/ไฟล์ที่ mirror ไม่ผ่าน (เกินขนาด/ชนิดไม่รองรับ) → TEXT + placeholder
  const hasAttachment = !!firstAttachment
  // diagnostic: ไฟล์แนบ non-image ที่ mirror ไม่ผ่าน — log ชนิด+host ไว้ดูว่าทำไม (content-type ไม่รองรับ/
  // host นอก allow-list/ขนาดเกิน) เพื่อ support type ที่ขาดในอนาคต (user ถาม 2026-07-23 ทำไมโหลดไม่ได้)
  if (hasAttachment && !mirroredFileId && attType && attType !== 'image') {
    let host = '(no url)'
    const u = firstAttachment?.payload?.url
    try {
      if (u) host = new URL(u).hostname
    } catch {
      host = '(invalid url)'
    }
    console.warn('[fb-ingest] attachment mirror failed', { attType, host, hasUrl: !!u })
  }
  const hasText = !!text && text.trim().length > 0
  // enrich (user 2026-07-24 "ต้องรองรับทุกอย่าง"): attachment ที่ Meta สังเคราะห์ "ข้อความสรุป" ไว้แต่
  // ไม่ส่ง text มากับ webhook — template (คำสั่งซื้อ/คำขอชำระเงิน เช่น "You requested ฿590..."),
  // fallback/แชร์ลิงก์-โพสต์, story — ดึงข้อความที่ render แล้วจาก Graph มาแสดงแทน placeholder ลอย ๆ.
  // เฉพาะเคสไม่มี text จริง + ไม่ใช่สื่อที่ mirror ได้ (image/video/audio/file) — เป็น exception path (ไม่บ่อย)
  let renderedText: string | null = null
  if (!hasText && hasAttachment && !mirroredFileId && attType && !MIRRORABLE.has(attType) && event.message.mid) {
    renderedText = await fetchMessageText(event.message.mid, channel.accessToken)
  }
  const displayText = hasText ? text : renderedText
  const hasDisplayText = !!displayText && displayText.trim().length > 0
  // placeholder เฉพาะชนิด (I-5, user 2026-07-24) — ไม่ใช่ "[ไฟล์แนบ]" รวมทุกชนิด. ใช้เมื่อไม่มี text จริง
  // และดึงข้อความ render จาก Graph ไม่ได้ (offline/หมดเวลา) — อย่างน้อยบอกชนิดให้ถูก
  const FAILED_TEXT_BY_TYPE: Record<string, string> = {
    image: MIRROR_FAILED_TEXT,
    video: '[วิดีโอ — เปิดดูใน Messenger]',
    audio: '[ข้อความเสียง — เปิดดูใน Messenger]',
    file: '[ไฟล์แนบ — เปิดดูใน Messenger]',
    location: '[ตำแหน่งที่ตั้ง — เปิดดูใน Messenger]',
    fallback: '[ลิงก์/โพสต์ที่แชร์ — เปิดดูใน Messenger]',
    template: '[ข้อความจากระบบ (ออเดอร์/ชำระเงิน) — เปิดดูใน Messenger]',
  }
  const attachmentFailedText = (attType && FAILED_TEXT_BY_TYPE[attType]) ?? UNSUPPORTED_ATTACHMENT_TEXT
  // ข้อความที่ไม่มีทั้ง text และ attachment (สติกเกอร์/reaction/ชนิดพิเศษที่ Messenger ส่ง message มา
  // แต่ไม่มีเนื้อหาที่เราแสดงได้) → placeholder แทน body/preview ว่าง (บั๊กจริง prod: bubble ว่าง 2026-07-23)
  const emptyMessageText = '[ข้อความไม่รองรับ — เปิดดูใน Messenger]'
  // ข้อความจริง/สรุปจาก Graph มาก่อน placeholder แนบไฟล์เสมอ (bug prod 2026-07-24: template/order ที่มี
  // ข้อความถูกทับด้วย "[ไฟล์แนบ]" ทิ้งเนื้อหาจริง) — placeholder เฉพาะตอน "ไม่มีข้อความให้แสดงจริง ๆ"
  const body = mirroredFileId ? text : hasDisplayText ? displayText : hasAttachment ? attachmentFailedText : emptyMessageText
  const previewByType: Record<string, string> = {
    IMAGE: '[รูปภาพ]',
    VIDEO: '[วิดีโอ]',
    AUDIO: '[ข้อความเสียง]',
    FILE: '[ไฟล์แนบ]',
  }
  const preview = mirroredFileId
    ? (previewByType[type] ?? '[ไฟล์แนบ]')
    : hasDisplayText
      ? displayText!.slice(0, 100)
      : hasAttachment
        ? attachmentFailedText
        : emptyMessageText
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
  const writeMessage = async (tx: Prisma.TransactionClient, conversation: { id: string; isSpam: boolean }) => {
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
        ...(isEcho
          ? {}
          : conversation.isSpam
            ? { lastMessageAt: occurredAt, lastInboundAt: occurredAt }
            : { lastMessageAt: occurredAt, lastInboundAt: occurredAt, isHidden: false, resolvedAt: null }),
      },
    })

    // แจ้งเตือนเจ้าของร้านเฉพาะข้อความจากลูกค้า (echo คือร้านตอบเอง ไม่ต้องเตือน); สแปม = เงียบ
    if (!isEcho && !conversation.isSpam) {
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

export async function sendOutboundMessage(params: {
  conversationId: string
  actorUserId: string
  // text = ข้อความ (หรือ caption ของรูป); imageFileId = ส่งรูป (storage fileId) — อย่างน้อยต้องมีอย่างหนึ่ง
  text?: string
  imageFileId?: string
}) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: params.conversationId },
    include: { shopChannel: true, externalContact: true },
  })
  if (!conversation) throw new Error('CONVERSATION_NOT_FOUND')
  if (conversation.channel === 'DEEP' || !conversation.shopChannel || !conversation.externalContact) {
    throw new Error('NOT_EXTERNAL_CHANNEL')
  }

  // เช็ค "เจ้าของ หรือ สมาชิก" (canAccessShop) ไม่ใช่แค่เจ้าของ — ไม่งั้น BUSINESS admin ตอบแชท
  // ของร้านตัวเองไม่ได้ (bug จริงบน prod หลังเพจถูกย้ายไปร้าน BUSINESS)
  if (!(await canAccessShop(conversation.shopId, params.actorUserId))) throw new Error('FORBIDDEN')

  // เช็คหน้าต่าง 24 ชม. ก่อนยิง — กันเปลือง quota และกัน error ที่คาดเดาได้อยู่แล้ว
  if (!getWindowState(conversation.lastInboundAt).open) throw new Error('WINDOW_CLOSED')

  // เช็คสถานะ channel ก่อนยิง Send API — token ตายแล้ว (ถูก markChannelTokenInvalid ไว้) หรือ
  // ร้านถอดการเชื่อมต่อไปแล้ว ยิงไปก็ error 190 ซ้ำแน่ ๆ ไม่ต้องเสีย round-trip ไป Graph (M-6)
  if (conversation.shopChannel.status !== 'ACTIVE') throw new Error('CHANNEL_NOT_ACTIVE')

  const pageToken = decryptToken(conversation.shopChannel.accessTokenEnc)
  const recipientId = conversation.externalContact.externalUserId
  const isImage = !!params.imageFileId
  const bodyText = params.text ?? ''

  let mid: string | null = null
  let failureReason: string | null = null
  try {
    // ไม่ส่ง shopChannel.externalId เข้าไปแล้ว — ช่องทาง IG เก็บ IG account id ไม่ใช่ Page id
    // ทำให้ Meta ตอบ "(#3) does not have the capability" (บั๊กจริงบน prod)
    // sendText/sendImage ใช้ /me/messages ซึ่ง pageToken resolve เป็นเพจ/IG account ให้เองแล้ว
    if (isImage) {
      // presigned URL อายุ 1 ชม. — Meta ดึงรูปไปส่งเอง (/api/files ของเรา auth-gated ใช้ไม่ได้)
      const imageUrl = await getFileUrl(params.imageFileId!, { signed: true, expiresIn: 3600 })
      mid = await sendImageMessage(pageToken, recipientId, imageUrl)
      // caption (ถ้ามี) — Meta attachment ไม่มี text ในตัว ส่งเป็นข้อความตามหลังแยก (best-effort);
      // echo ของ caption จะถูก ingestInboundMessage เก็บเป็นบับเบิลข้อความ SHOP แยกเอง (ไม่เขียนซ้ำที่นี่)
      if (bodyText.trim()) {
        await sendTextMessage(pageToken, recipientId, bodyText).catch(() => {})
      }
    } else {
      mid = await sendTextMessage(pageToken, recipientId, bodyText)
    }
  } catch (e) {
    failureReason = e instanceof Error ? e.message : 'ส่งข้อความไม่สำเร็จ'
    // code 190 = token ใช้ไม่ได้แล้ว (เจ้าของถอนสิทธิ์/เปลี่ยนรหัส) — ต้องให้ร้านเชื่อมใหม่
    if (e instanceof GraphApiError && e.code === 190) {
      await markChannelTokenInvalid(conversation.shopChannel.id)
    }
  }

  const preview = isImage ? '[รูปภาพ]' : bodyText.slice(0, 100)

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
          type: isImage ? 'IMAGE' : 'TEXT',
          // รูป: body=null (caption ส่งแยกเป็นข้อความ echo มาเอง), imageUrl=fileId; ข้อความ: body=text
          body: isImage ? null : bodyText,
          imageUrl: isImage ? params.imageFileId! : null,
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
