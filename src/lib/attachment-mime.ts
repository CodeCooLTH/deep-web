// ตารางชนิดไฟล์แนบกลาง (feature 00018 — user request 2026-07-24 "รองรับทุกอย่าง")
//
// ใช้ 2 ทาง: (1) mirror ไฟล์แนบจาก Messenger/IG — content-type → นามสกุลไฟล์; (2) /api/files
// serve ไฟล์ — นามสกุล → content-type ให้ browser เรนเดอร์/เล่น/โหลดได้ถูก. เก็บที่เดียวให้ 2 ฝั่ง
// ตรงกันเสมอ (เดิมแยกกันแล้ว drift — บาง ext mirror เก็บได้แต่ /api/files serve เป็น octet-stream)
//
// หลัก "รองรับทุกอย่าง": ชนิดที่รู้จัก → เก็บ+เรนเดอร์ถูกชนิด; ชนิดแปลก → ยังเก็บได้ (generic ext)
// แล้ว serve เป็น octet-stream (browser โหลดไฟล์ลงเครื่อง) — ดีกว่าตายเป็น placeholder ที่เปิดไม่ได้

/** content-type (ตัดพารามิเตอร์ ";" แล้ว) → นามสกุลไฟล์ที่ใช้เก็บ */
const CONTENT_TYPE_TO_EXT: Record<string, string> = {
  // รูปภาพ
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/bmp': 'bmp',
  'image/tiff': 'tiff',
  'image/svg+xml': 'svg',
  // วิดีโอ
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'video/3gpp': '3gp',
  'video/x-msvideo': 'avi',
  'video/x-matroska': 'mkv',
  // เสียง
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/ogg': 'ogg',
  // Messenger voice message = Opus codec (mime_type audio/opus) — เป็น opus-in-ogg เล่นเป็น audio/ogg
  // ได้ใน browser. ถ้าปล่อยให้ generic fallback จะได้ ext 'opus' ที่ browser ส่วนใหญ่เล่น inline ไม่ได้
  // (bug จริง 2026-07-24: ข้อความเสียงขึ้น "[ข้อความเสียง — เปิดดูใน Messenger]") → map เป็น ogg
  'audio/opus': 'ogg',
  'audio/webm': 'weba',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/amr': 'amr',
  // เอกสาร/อื่น ๆ
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/zip': 'zip',
  'application/x-rar-compressed': 'rar',
  'application/json': 'json',
  'text/plain': 'txt',
  'text/csv': 'csv',
}

/** นามสกุล → content-type สำหรับ serve (/api/files). ต้องครอบทุก ext ที่ CONTENT_TYPE_TO_EXT ผลิต */
export const EXT_TO_MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg',
  png: 'image/png', webp: 'image/webp', gif: 'image/gif',
  heic: 'image/heic', heif: 'image/heif', bmp: 'image/bmp', tiff: 'image/tiff', svg: 'image/svg+xml',
  mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', '3gp': 'video/3gpp',
  avi: 'video/x-msvideo', mkv: 'video/x-matroska',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg',
  weba: 'audio/webm', wav: 'audio/wav', amr: 'audio/amr',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  zip: 'application/zip', rar: 'application/x-rar-compressed',
  json: 'application/json', txt: 'text/plain', csv: 'text/csv',
}

/** เฉพาะ ext ที่ browser เรนเดอร์/เล่น inline ได้ (รูป/วิดีโอ/เสียง/pdf) — นอกจากนี้ให้ดาวน์โหลด
 *  svg ไม่อยู่ในนี้โดยตั้งใจ: serve inline ได้ก็จริงแต่เปิดตรง ๆ ใน browser จะรัน inline script ใน
 *  ไฟล์ (stored XSS) — บังคับดาวน์โหลด (attachment) ปลอดภัยกว่า, ไฟล์ public ใครมี fileId ก็เปิดได้ */
const INLINE_EXTS = new Set([
  'jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp',
  'mp4', 'webm', 'mov',
  'mp3', 'm4a', 'aac', 'ogg', 'weba', 'wav',
  'pdf',
])

export function isInlineExt(ext: string): boolean {
  return INLINE_EXTS.has(ext.toLowerCase())
}

/**
 * content-type → นามสกุลไฟล์ — "รองรับทุกอย่าง": ชนิดที่รู้จักคืน ext ตรง; ชนิดแปลกสกัด subtype
 * เป็น ext แบบ best-effort (เช่น "application/x-foo" → "foo") ให้ยังเก็บไฟล์ได้; ว่างจริง → "bin"
 */
export function contentTypeToExt(contentType: string): string {
  const ct = (contentType || '').split(';')[0]!.trim().toLowerCase()
  if (CONTENT_TYPE_TO_EXT[ct]) return CONTENT_TYPE_TO_EXT[ct]
  // fallback: เอา subtype ตัดคำนำหน้า vendor/x- แล้วเก็บเฉพาะอักขระที่ปลอดภัยเป็นนามสกุล
  const sub = ct.split('/')[1] ?? ''
  const cleaned = sub.replace(/^(x-|vnd\.)/, '').replace(/[^a-z0-9]/g, '').slice(0, 8)
  return cleaned || 'bin'
}
