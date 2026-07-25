import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getChannelByExternalId, markChannelTokenInvalid } from '@/services/shop-channel.service'
import { canAccessShop } from '@/lib/shop-context'
import { getContactProfile, getLastInboundTime, sendTextMessage, sendImageMessage, fetchMessageText, GraphApiError } from '@/lib/facebook/graph'
import { decryptToken } from '@/lib/token-crypto'
import { saveFile, getFileUrl } from '@/lib/storage'
import { contentTypeToExt } from '@/lib/attachment-mime'
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

// ประกอบ "ข้อความสรุป" จาก field ของ template/location ที่ parse มาแล้ว (feature 00018, user 2026-07-25
// "รองรับทุกอัน") — order/payment/receipt/generic มี text/summary/elements มากับ webhook เอง ไม่ต้องพึ่ง
// Graph fetch (ซึ่งคืน message ว่างเมื่อ template ไม่มี text). แก้เคส user report: "[ข้อความจากระบบ
// (ออเดอร์/ชำระเงิน)]" ตกไป placeholder ทั้งที่เนื้อห (ยอด/รายการ) มากับ webhook แล้ว
type AttPayloadStructured = {
  text?: string
  template_type?: string
  order_number?: string
  summary?: { total_cost?: number }
  elements?: { title?: string }[]
  coordinates?: { lat: number; long: number }
}
function composeStructuredText(attType: string | undefined, payload: AttPayloadStructured | undefined): string | null {
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
    // generic/carousel → ชื่อรายการแรก + จำนวนที่เหลือ
    const els = payload.elements
    if (els && els.length > 0 && els[0]?.title) {
      const more = els.length > 1 ? ` และอีก ${els.length - 1} รายการ` : ''
      return `${els[0].title}${more}`
    }
  }
  return null
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
  const mirroredFileId = isMedia && attUrl ? await mirrorRemoteImage(attUrl) : null
  // ข้อความลิงก์ที่แชร์ (fallback/post/ig_post) — ประกอบ title + url เป็น text
  const linkText = isLink ? (attTitle ? `${attTitle}\n${attUrl}` : attUrl!) : null

  // หลายรูป/สื่อในหนึ่ง event: Messenger ส่งหลายรูปพร้อมกัน = attachments[] หลายตัวใน event เดียว —
  // เดิมเก็บแค่ attachments[0] → web app เห็นรูปเดียว (user report 2026-07-24). mirror ตัวที่ 2 เป็นต้นไป
  // แล้วสร้าง ChatMessage เพิ่มต่อรูป (album UI จะจับกลุ่มเป็นอัลบั้มเอง). externalMessageId ต่อท้าย #i กัน
  // ชน unique (mid เดียวทั้ง event) — redelivery ชนตัวแรก tx abort → DUPLICATE เหมือนเดิม
  const allAttachments = event.message.attachments ?? []
  const extraMedia: { fileId: string; type: string }[] = []
  for (let i = 1; i < allAttachments.length; i++) {
    const a = allAttachments[i]
    const t = a?.type
    const url = a?.payload?.url
    if (t && MEDIA_TYPE[t] && url) {
      const fid = await mirrorRemoteImage(url)
      if (fid) extraMedia.push({ fileId: fid, type: MEDIA_TYPE[t] })
    }
  }

  const type =
    mirroredFileId && attType && MEDIA_TYPE[attType]
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
  // diagnostic: attachment ที่ยังแสดงเนื้อหาไม่ได้เลย (ไม่ใช่ media/link/template ที่ประกอบได้) — log
  // ชนิด + keys ของ payload ดิบไว้ finalize schema เพิ่ม (agent research 2026-07-25: story_reply/commands/
  // media/product template ยังไม่ยืนยัน payload จริง) — ไม่ log ค่า (กัน PII) log แค่ key
  if (hasAttachment && !isMedia && !isLink && !structuredText && !renderedText && attType && attType !== 'template') {
    console.warn('[fb-ingest] unhandled attachment', { attType, payloadKeys: Object.keys(firstAttachment?.payload ?? {}) })
  }
  // ลำดับข้อความที่จะแสดง: text จริง > ลิงก์แชร์ > ข้อความสรุปที่ประกอบเอง (template/location) > Graph render
  const displayText = hasText ? text : isLink ? linkText : (structuredText ?? renderedText)
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
  // ข้อความที่ไม่มีทั้ง text และ attachment (reaction/ชนิดพิเศษที่ Messenger ส่ง message มาแต่ไม่มี
  // เนื้อหาที่เราแสดงได้) → placeholder แทน body/preview ว่าง (บั๊กจริง prod: bubble ว่าง 2026-07-23)
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
  const singlePreview = mirroredFileId
    ? (previewByType[type] ?? '[ไฟล์แนบ]')
    : hasDisplayText
      ? displayText!.slice(0, 100)
      : hasAttachment
        ? attachmentFailedText
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
