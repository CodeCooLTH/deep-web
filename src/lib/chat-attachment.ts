/**
 * chat-attachment — กฎกลางของ "ไฟล์แนบในแชท" (feature 00018 extension, 2026-08-02)
 *
 * จุดเดียวของทั้งระบบที่ตอบคำถาม "ไฟล์นี้ส่งช่องทางนี้ได้ไหม"
 *   - client (useSellerChatThread) เรียกก่อนอัปโหลด → toast บอกเหตุผลตั้งแต่ตอนแนบ
 *   - server (/api/chat/upload + messages route) เรียกซ้ำเป็นตัวจริง — client ปลอมได้เสมอ
 *
 * ข้อบังคับ: ไฟล์นี้ต้อง **pure** ห้าม import '@/lib/storage' / '@/lib/prisma' / อะไรที่แตะ fs
 * เพราะฝั่ง client import เข้ามาด้วย (barrel ของ storage ลาก driver local/s3 เข้า bundle —
 * เหตุผลเดียวกับที่ useSellerChatThread duplicate ค่า MAX_SIZE ไว้เองแทนการ import)
 *
 * spec: docs/superpowers/specs/2026-08-02-chat-multi-attachment-design.md
 */

/** เพดานต่อไฟล์ — ตรงกับ `file_size_limit` ของ Supabase bucket `uploads` (26214400)
 *  และเพดาน attachment ของ Meta Send API */
export const ATTACHMENT_MAX_SIZE = 25 * 1024 * 1024

/** เพดานเฉพาะ "รูป" ของ Instagram — Meta docs ระบุ 8MB (ต่างจากวิดีโอ/เสียง/ไฟล์ที่ 25MB) */
export const IG_IMAGE_MAX_SIZE = 8 * 1024 * 1024

export type AttachmentKind = 'IMAGE' | 'VIDEO' | 'AUDIO' | 'FILE'

/**
 * นามสกุลที่บล็อกทุกช่องทาง — ไฟล์ที่ "รันได้" หรือถูกตีความเป็นสคริปต์
 *
 * user เลือกแนวทาง deny-list (2026-08-02): อนุญาตทุกอย่างยกเว้นที่รันได้ เพราะไฟล์ธุรกิจ
 * มีหางยาวมาก (psd/ai/sketch/dwg/…) allow-list จะขวางงานจริงของร้าน
 *
 * html/htm/svg อยู่ในนี้ทั้งที่ /api/files บังคับ `Content-Disposition: attachment` + `nosniff`
 * ให้อยู่แล้ว (attachment-mime.ts เอา svg ออกจาก INLINE_EXTS โดยตั้งใจ) — บล็อกซ้ำที่ชั้น
 * อัปโหลดเป็น defense-in-depth: ถ้าอนาคตมีคนแก้ INLINE_EXTS โดยไม่รู้บริบทนั้น ไฟล์เก่าที่
 * ค้างอยู่ในระบบจะกลายเป็น stored XSS ย้อนหลังทันที
 */
export const BLOCKED_EXT: readonly string[] = [
  // Windows executable / installer
  'exe', 'msi', 'msix', 'com', 'scr', 'pif', 'cpl',
  // shell / batch script
  'bat', 'cmd', 'ps1', 'psm1', 'vbs', 'vbe', 'wsf', 'wsh',
  'sh', 'bash', 'zsh', 'csh', 'run',
  // binary / bundle ของแพลตฟอร์มอื่น
  'bin', 'appimage', 'apk', 'ipa', 'app', 'pkg', 'dmg', 'deb', 'rpm',
  // Java/Android payload ที่ปลอมเป็นเอกสารได้ง่าย
  'jar', 'class', 'dex',
  // library / driver
  'dll', 'sys', 'drv', 'ocx', 'so', 'dylib',
  // สคริปต์/มาร์กอัปที่เบราว์เซอร์รันได้
  'js', 'mjs', 'cjs', 'jse', 'hta', 'html', 'htm', 'xhtml', 'shtml', 'svg', 'svgz',
  // shortcut / config ที่พาไปรันของอื่น
  'lnk', 'url', 'reg', 'inf', 'scf', 'gadget',
]

const BLOCKED = new Set(BLOCKED_EXT)

/** ext ที่แต่ละช่องทางรับได้เมื่อเป็นชนิดนั้น ๆ (นอกจากนี้รับทุกนามสกุลที่ไม่ติด BLOCKED) */
const MESSENGER_IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp'])
const IG_IMAGE_EXT = new Set(['jpg', 'jpeg', 'png'])
const IG_VIDEO_EXT = new Set(['mp4', 'ogg', 'avi', 'mov', 'webm'])
const IG_AUDIO_EXT = new Set(['aac', 'm4a', 'wav', 'mp4'])

/** ช่องทางที่รองรับไฟล์แนบขาออกแล้วจริง — นอกลิสต์นี้ default deny (ดู checkChannelSupport) */
export const ATTACHMENT_CHANNELS: readonly string[] = ['DEEP', 'MESSENGER', 'INSTAGRAM']

/**
 * จัดชนิดไฟล์ — MIME ชนะ ext เสมอ (ext ปลอมง่ายกว่า) แล้วค่อย fallback ที่ ext
 * ไม่รู้จักทั้งคู่ → FILE (ปลอดภัยสุด: เข้าเส้นทาง "ไฟล์แนบ" ไม่ใช่ media ที่พยายามเรนเดอร์)
 */
export function attachmentKind(mime: string, ext: string): AttachmentKind {
  const m = (mime || '').toLowerCase()
  if (m.startsWith('image/')) return 'IMAGE'
  if (m.startsWith('video/')) return 'VIDEO'
  if (m.startsWith('audio/')) return 'AUDIO'
  if (m) return 'FILE'

  const e = (ext || '').toLowerCase()
  if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'heic', 'heif', 'tiff'].includes(e)) return 'IMAGE'
  if (['mp4', 'mov', 'webm', 'avi', 'mkv', '3gp'].includes(e)) return 'VIDEO'
  if (['mp3', 'm4a', 'aac', 'ogg', 'wav', 'weba', 'amr'].includes(e)) return 'AUDIO'
  return 'FILE'
}

/** ตัดนามสกุลจากชื่อไฟล์ — ไม่มีจุด/ลงท้ายด้วยจุด → '' (ให้ caller ตัดสินเอง ไม่เดาเป็น 'bin') */
export function extFromName(name: string): string {
  const i = (name || '').lastIndexOf('.')
  if (i < 0 || i === name.length - 1) return ''
  return name.slice(i + 1).toLowerCase()
}

/** MB แบบอ่านง่ายสำหรับข้อความ error (1.5 → "1.5", 12 → "12") */
function mb(bytes: number): string {
  const v = bytes / (1024 * 1024)
  return v >= 10 ? String(Math.round(v)) : v.toFixed(1).replace(/\.0$/, '')
}

export type SupportCheck = { ok: true } | { ok: false; reason: string }

/**
 * ตัวตัดสินเดียวของทั้งระบบ — คืน reason เป็นภาษาไทยที่เอาไปโชว์ toast/400 ได้ตรง ๆ
 *
 * ลำดับการตรวจตั้งใจ: deny-list → ขนาดรวม → กฎเฉพาะช่องทาง
 * เพื่อให้ผู้ใช้เห็นเหตุผลที่ "แก้ไม่ได้" ก่อนเหตุผลที่ "แก้ได้ด้วยการเปลี่ยนช่องทาง"
 */
export function checkChannelSupport(
  channel: string,
  file: { kind: AttachmentKind; mime: string; ext: string; size: number },
): SupportCheck {
  const ext = (file.ext || '').toLowerCase()

  if (BLOCKED.has(ext)) {
    return { ok: false, reason: `ไฟล์ชนิด .${ext} ส่งไม่ได้ด้วยเหตุผลด้านความปลอดภัย` }
  }
  if (file.size > ATTACHMENT_MAX_SIZE) {
    return { ok: false, reason: `ไฟล์ใหญ่เกิน 25MB (ไฟล์นี้ ${mb(file.size)}MB)` }
  }

  // ช่องทางที่ยังไม่ live (LINE feat 00025 / TikTok feat 00020) — default deny ไม่ใช่ default allow
  // กันไม่ให้ feature ที่ยังทำไม่เสร็จเปิดช่องส่งไฟล์โดยไม่ตั้งใจตอน channel ใหม่ถูกเพิ่มเข้า DB
  if (!ATTACHMENT_CHANNELS.includes(channel)) {
    return { ok: false, reason: 'ช่องทางนี้ยังไม่รองรับไฟล์แนบ' }
  }

  if (channel === 'DEEP') return { ok: true }

  if (channel === 'MESSENGER') {
    if (file.kind === 'IMAGE' && !MESSENGER_IMAGE_EXT.has(ext)) {
      return { ok: false, reason: 'Messenger รองรับรูป jpg/png/gif/webp เท่านั้น' }
    }
    return { ok: true }
  }

  // INSTAGRAM — เข้มที่สุด (Meta docs 2026-08-02)
  if (file.kind === 'IMAGE') {
    if (!IG_IMAGE_EXT.has(ext)) {
      return { ok: false, reason: 'Instagram รองรับรูป jpg/png เท่านั้น' }
    }
    if (file.size > IG_IMAGE_MAX_SIZE) {
      return { ok: false, reason: `Instagram รองรับรูปไม่เกิน 8MB (ไฟล์นี้ ${mb(file.size)}MB)` }
    }
    return { ok: true }
  }
  if (file.kind === 'VIDEO') {
    if (!IG_VIDEO_EXT.has(ext)) {
      return { ok: false, reason: 'Instagram รองรับวิดีโอ mp4/mov/avi/webm/ogg เท่านั้น' }
    }
    return { ok: true }
  }
  if (file.kind === 'AUDIO') {
    if (!IG_AUDIO_EXT.has(ext)) {
      return { ok: false, reason: 'Instagram รองรับไฟล์เสียง aac/m4a/wav เท่านั้น' }
    }
    return { ok: true }
  }
  // kind === 'FILE'
  if (ext !== 'pdf') {
    return { ok: false, reason: 'Instagram ส่งได้เฉพาะไฟล์ PDF' }
  }
  return { ok: true }
}

/**
 * ทำความสะอาดชื่อไฟล์ก่อนเก็บ/ส่งกลับ
 *
 * ทำไมต้องทำ: ชื่อนี้ถูกเอาไปใส่ `Content-Disposition` ตอนดาวน์โหลดและแสดงบนบับเบิล —
 * path separator ทำให้ชื่อไฟล์กลายเป็น path ส่วน control char/quote ทำ header injection ได้
 * cap 200 ตัวให้ตรงกับ maxLength ของ SendChatMessageSchema
 *
 * กรอง control char ด้วย codePoint ไม่ใช่ regex — ช่วง \x00-\x1f เขียนเป็น literal ในไฟล์
 * ได้ยากและอ่านยาก (และต้องปิด eslint no-control-regex) วิธีนี้ตรงไปตรงมากว่า
 */
export function sanitizeAttachmentName(name: string): string {
  const base = Array.from(name || '')
    .filter((ch) => {
      const c = ch.codePointAt(0) ?? 0
      return c > 31 && c !== 127
    })
    .join('')
    .replace(/[\\/]/g, '_')
    .replace(/["']/g, '')
    .trim()
  return base.slice(0, 200)
}

/**
 * ชื่อที่จะแสดง/ใช้ตอนดาวน์โหลด เมื่อไม่มี attachmentName
 *
 * เกิดกับ 2 กรณี: ข้อความก่อนฟีเจอร์นี้ และไฟล์ที่ mirror มาจาก Messenger/IG
 * (Meta ไม่ส่งชื่อไฟล์เดิมมากับ webhook) — fallback เป็น "ไฟล์แนบ.pdf" อ่านรู้เรื่องกว่า uuid
 */
export function attachmentDisplayName(storageKey: string, attachmentName?: string | null): string {
  if (attachmentName) return attachmentName
  const base = storageKey.split('/').filter(Boolean).pop() || ''
  const ext = extFromName(base)
  return ext ? `ไฟล์แนบ.${ext}` : 'ไฟล์แนบ'
}

/** ขนาดไฟล์แบบอ่านง่ายสำหรับ UI — "86 KB" / "1.2 MB" */
export function formatAttachmentSize(bytes?: number | null): string | null {
  if (bytes == null || bytes < 0) return null
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${mb(bytes)} MB`
}
