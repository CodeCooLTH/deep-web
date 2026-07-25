// Provider ของ Meta (Messenger + Instagram) — feature 00020 Phase 2
//
// สำคัญ: ไฟล์นี้เป็นการ "ย้ายที่อยู่" ของ logic เดิมจาก channel-chat.service.ts เท่านั้น
// **ห้ามเปลี่ยนพฤติกรรม** (BR-TTC-35): หน้าต่าง 24 ชม., ลำดับส่งรูปแล้วตามด้วย caption แบบ
// best-effort, การตีความ error code 190, และ host allow-list ของ mirror ต้องเหมือนเดิมทุกจุด
// ชุดทดสอบเดิมต้องผ่านโดยไม่แก้ assertion (BR-TTC-37) — ถ้าต้องแก้เทสให้ผ่าน แปลว่าเปลี่ยนพฤติกรรมแล้ว

import { sendTextMessage, sendImageMessage, GraphApiError } from '@/lib/facebook/graph'
import { getFileUrl } from '@/lib/storage'
import type { ChannelCapabilities, ChannelProvider, OutboundTarget } from './types'

/** หน้าต่างตอบกลับมาตรฐานของ Meta — นับจากข้อความล่าสุด "ของลูกค้า" (ค่าเดิมจาก channel-chat.service) */
export const META_WINDOW_MS = 24 * 60 * 60 * 1000

// (S-1) allow-list ของ host ที่ยอมให้ mirror ยิง fetch ออกไปได้ — เฉพาะ CDN ของ Meta เท่านั้น
// attachments[].payload.url มาจาก webhook payload ซึ่งถ้า FB_CHAT_APP_SECRET หลุด ผู้โจมตีปลอม
// webhook ที่ผ่านลายเซ็นได้แล้วยัด url เป็น internal address (เช่น http://169.254.169.254/...
// metadata endpoint ของ cloud) เซิร์ฟเวอร์เราจะยิง SSRF ไปแทน
// เทียบ hostname แบบ exact หรือ suffix ที่ขึ้นต้นด้วย "." เท่านั้น (กัน "evil-fbcdn.net" ปลอมตัว
// ผ่าน .endsWith('fbcdn.net') ตรง ๆ)
// fbsbx.com: CDN ของ "ไฟล์แนบ" Messenger (วิดีโอ/เสียง/ไฟล์ มักอยู่ lookaside.fbsbx.com/cdn.fbsbx.com
// ไม่ใช่ fbcdn.net เหมือนรูป)
const MIRROR_ALLOWED_HOSTS_EXACT = new Set(['graph.facebook.com', 'fbcdn.net', 'cdninstagram.com', 'fbsbx.com'])
const MIRROR_ALLOWED_HOST_SUFFIXES = ['.fbcdn.net', '.cdninstagram.com', '.fbsbx.com']

export function isMetaMirrorAllowedHost(hostname: string): boolean {
  const h = hostname.toLowerCase()
  if (MIRROR_ALLOWED_HOSTS_EXACT.has(h)) return true
  return MIRROR_ALLOWED_HOST_SUFFIXES.some((suffix) => h.endsWith(suffix))
}

// Messenger กับ Instagram มีกฎการส่งเหมือนกันทุกข้อ (หน้าต่าง 24 ชม., ทักก่อนไม่ได้นอกหน้าต่าง,
// ส่งออกได้แค่ text/image) ต่างกันแค่ ID space ของช่องทาง — จึงใช้ capability ชุดเดียวกัน
// ต่างค่า provider เท่านั้น ไม่ใช่เขียน provider แยกสองตัวที่โค้ดซ้ำกัน
function metaCapabilities(provider: string): ChannelCapabilities {
  return {
    provider,
    windowMs: META_WINDOW_MS,
    // ในกรอบ 24 ชม. Meta ไม่ห้ามร้านส่งก่อน แต่ถ้าลูกค้าไม่เคยทักมาเลย (lastInboundAt = null)
    // หน้าต่างจะปิดอยู่แล้วจาก resolveWindowState — canInitiate จึงเป็น false ตามความจริงว่า
    // "ร้านเปิดเธรดใหม่หาลูกค้าที่ไม่เคยทักมาไม่ได้" (MVP ไม่ใช้ message tag — PRD 00018 §3.3)
    canInitiate: false,
    maxConsecutiveOutbound: null,
    // เพดานข้อความของ Messenger Send API
    textLimit: 2000,
    outboundMediaTypes: ['TEXT', 'IMAGE'],
  }
}

function createMetaProvider(provider: string): ChannelProvider {
  return {
    capabilities: metaCapabilities(provider),

    async sendText(target: OutboundTarget, text: string): Promise<string | null> {
      // ไม่ส่ง channelExternalId เข้าไป — ช่องทาง IG เก็บ IG account id ไม่ใช่ Page id ทำให้ Meta
      // ตอบ "(#3) does not have the capability" (บั๊กจริงบน prod). sendTextMessage ใช้
      // /me/messages ซึ่ง token resolve เป็นเพจ/IG account ให้เองแล้ว
      return await sendTextMessage(target.accessToken, target.recipientExternalId, text)
    },

    async sendImage(target: OutboundTarget, imageFileId: string, caption?: string): Promise<string | null> {
      // presigned URL อายุ 1 ชม. — Meta ดึงรูปไปส่งเอง (/api/files ของเรา auth-gated ใช้ไม่ได้)
      const imageUrl = await getFileUrl(imageFileId, { signed: true, expiresIn: 3600 })
      const mid = await sendImageMessage(target.accessToken, target.recipientExternalId, imageUrl)
      // caption (ถ้ามี) — Meta attachment ไม่มี text ในตัว ส่งเป็นข้อความตามหลังแยก (best-effort);
      // echo ของ caption จะถูก ingestInboundMessage เก็บเป็นบับเบิลข้อความ SHOP แยกเอง
      if (caption && caption.trim()) {
        await sendTextMessage(target.accessToken, target.recipientExternalId, caption).catch(() => {})
      }
      return mid
    },

    isTokenDeadError(e: unknown): boolean {
      // code 190 = token ใช้ไม่ได้แล้ว (เจ้าของถอนสิทธิ์/เปลี่ยนรหัส) — ต้องให้ร้านเชื่อมใหม่
      return e instanceof GraphApiError && e.code === 190
    },

    isMirrorAllowedHost: isMetaMirrorAllowedHost,
  }
}

export const MESSENGER_PROVIDER = createMetaProvider('MESSENGER')
export const INSTAGRAM_PROVIDER = createMetaProvider('INSTAGRAM')
