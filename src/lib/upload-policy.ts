/**
 * upload-policy — SSOT ของ "ไฟล์ที่อัปโหลดได้ ต่อวัตถุประสงค์" (2026-08-10)
 *
 * ทำไมต้องมีไฟล์นี้: เพดานขนาดไฟล์เดิมกระจายอยู่หลายที่และ **ไม่มีที่ไหนตรงกับเพดานจริง**
 *   - `storage/types.ts` `MAX_SIZE` = 5MB (บังคับผ่าน `validateUpload` ของ POST /api/upload)
 *   - `chat-attachment.ts` `ATTACHMENT_MAX_SIZE` = 25MB
 *   - ฝั่ง client เขียนเลขเองอีกชุด (10MB ที่ ProductImagesCardV2/RoomImages, 5MB ที่สลิป/ยืนยันตัวตน)
 *
 * ...ทั้งหมดนั้นไม่มีผลจริงเลย เพราะ **Vercel จำกัด request body ที่ 4.5MB** และตอบ
 * `413 FUNCTION_PAYLOAD_TOO_LARGE` ก่อนที่ request จะถึงโค้ดเรา (vercel.com/docs/functions/limitations)
 * ไฟล์ 5–25MB จึงตายที่แพลตฟอร์มพร้อม body ที่ไม่ใช่ JSON ของเรา → client อ่าน error ไม่ได้
 * แล้วขึ้นข้อความกลาง ๆ "อัปโหลดไฟล์ไม่สำเร็จ ลองใหม่อีกครั้ง" = คำเชิญให้กดวนซ้ำสิ่งที่ไม่มีทางสำเร็จ
 * (อาการที่ร้านแจ้ง 2026-08-10: "อัปโหลดคลิปเกิน 1 นาทีไม่ได้" — คลิป iPhone 1 นาที = 40–90MB
 * แต่ความจริงคือ **ทุกอย่างเกิน 4.5MB ส่งไม่ได้** ตั้งแต่คลิป 10 วินาที)
 *
 * ตั้งแต่รอบนี้ upload ของเบราว์เซอร์ยิงตรงเข้า storage (presigned PUT) ไม่ผ่าน function
 * เพดานในไฟล์นี้จึงเป็นเพดานที่ **บังคับได้จริง** ด้วย 2 ชั้นที่ client ปลอมไม่ได้:
 *   1. `file_size_limit` ของ bucket = 25MB — Supabase ปฏิเสธเองด้วย `413 EntityTooLarge`
 *      (พิสูจน์ 2026-08-10 ด้วย presigned PUT จริง: 30MB ไม่ถูกเขียนลง bucket เลย HEAD ได้ NotFound)
 *   2. `POST /api/uploads/commit` อ่าน **ขนาดจริง** ด้วย HEAD แล้วเทียบกับเพดานของ purpose
 *      → เกิน = ลบไฟล์ทิ้งทันที + 413 (ตัวเลข `size` ที่ client แจ้งตอนขอ ticket เป็นแค่
 *      ทางลัดให้เตือนได้เร็ว ไม่ใช่ด่าน)
 *
 * ไฟล์นี้ต้อง **pure** (ห้าม import storage/prisma/fs) เพราะทั้ง client และ server import
 * เหตุผลเดียวกับ `chat-attachment.ts`
 */

import {
  ATTACHMENT_MAX_SIZE,
  BLOCKED_EXT,
  attachmentKind,
  extFromName,
  oversizeMessage,
} from './chat-attachment'

/** re-export ให้ฝั่งที่ไม่ได้ทำงานกับแชทเรียกได้โดยไม่ต้อง import โมดูลของแชท */
export { oversizeMessage }

/**
 * เพดานของ bucket เอง — ไม่มี purpose ไหนเกินค่านี้ได้ แม้ตั้งเลขในตารางข้างล่างสูงกว่า
 * (ถ้าจะขยาย ต้องไปแก้ `file_size_limit` ของ bucket `uploads` ด้วย SQL ก่อน แล้วค่อยแก้ที่นี่ —
 * แก้ที่นี่ฝ่ายเดียวจะได้ `413 EntityTooLarge` จาก Supabase ตอนกดจริง ซึ่งเกิดหลังผู้ใช้รอโหลดจนจบ)
 */
export const STORAGE_HARD_MAX = 25 * 1024 * 1024

/** เพดาน request body ของ Vercel — ใช้เฉพาะประกอบข้อความ error ของเส้นทาง multipart เดิม */
export const VERCEL_BODY_LIMIT = 4.5 * 1024 * 1024

/**
 * รายชื่อ purpose — **แหล่งเดียว** ที่ทั้ง type และ Valibot picklist อ้างถึง
 *
 * ห้ามพิมพ์ list ซ้ำใน `validations.ts`: บั๊กแบบเดียวกันเพิ่งเกิดกับ `channel` ของแท็บอินบ็อกซ์
 * (คอมมิต `42b71894` 2026-08-09) — เพิ่ม `'LINE'` เข้า type แล้ว picklist ที่เขียนตายตัวไม่ถูกแตะ
 * `tsc` เขียวสนิท แต่ผู้ใช้กดแท็บนั้นได้ **400 Bad Request บน prod** เพราะ type ไม่ผูกกับ
 * validator ตอน runtime
 */
export const UPLOAD_PURPOSES = ['CHAT', 'IMAGE', 'DOCUMENT'] as const

export type UploadPurpose = (typeof UPLOAD_PURPOSES)[number]

/**
 * ชนิดรูปที่ทุก surface ของโปรเจกต์รับอยู่เดิม — ยกมาจาก `ALLOWED_TYPES` ของ storage ตรง ๆ
 * (รวม gif ด้วย: `QuickMessageManager` โฆษณา "jpg, png, webp, gif" กับผู้ใช้อยู่ ตัดออกที่นี่
 * จะกลายเป็นการถอนของที่ใช้ได้อยู่แล้วโดยไม่มีใครขอ)
 */
const IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const
const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif'] as const

type Policy = {
  /** เพดานต่อไฟล์ของ purpose นี้ */
  maxSize: number
  /** คำเรียกของสิ่งที่อัปโหลด ใช้ประกอบข้อความ error */
  noun: string
  /** ชนิดที่รับ — `null` = ใช้ deny-list (`BLOCKED_EXT`) แทน allow-list */
  allowMime: readonly string[] | null
  allowExt: readonly string[] | null
}

/**
 * ตารางนโยบาย — เพิ่ม purpose ใหม่ที่นี่ที่เดียว
 *
 * เพดาน IMAGE/DOCUMENT = 10MB ไม่ใช่ 5MB เดิมโดยตั้งใจ: 10MB คือเลขที่ฝั่ง client
 * **ประกาศกับผู้ใช้อยู่แล้ว** (`ProductImagesCardV2`, `RoomImages`) ขณะที่ 5MB ของ
 * `validateUpload` เป็นเพดานที่ผู้ใช้มองไม่เห็น — ยกเพดาน server ให้ ≥ ที่โฆษณาไว้
 * จึงเป็นการทำให้ตรงกัน ไม่ใช่การขยายสิทธิ์ใหม่ (เพดานที่แต่ละหน้าบอกผู้ใช้ยังคุมของตัวเองอยู่)
 */
const POLICIES: Record<UploadPurpose, Policy> = {
  // แชท: deny-list ตาม `chat-attachment.ts` (user เลือกแนวทางนี้ 2026-08-02 — ไฟล์ธุรกิจมีหางยาว)
  CHAT: { maxSize: ATTACHMENT_MAX_SIZE, noun: 'ไฟล์', allowMime: null, allowExt: null },
  // รูปสินค้า/ห้องพัก/อวาตาร์/โลโก้ร้าน
  IMAGE: { maxSize: 10 * 1024 * 1024, noun: 'รูป', allowMime: IMAGE_MIME, allowExt: IMAGE_EXT },
  // เอกสารยืนยันตัวตน L2/L3 + สลิปโอนเงิน (รับ PDF ตาม PRD FR-2.5)
  DOCUMENT: {
    maxSize: 10 * 1024 * 1024,
    noun: 'ไฟล์',
    allowMime: [...IMAGE_MIME, 'application/pdf'],
    allowExt: [...IMAGE_EXT, 'pdf'],
  },
}

export function uploadMaxSize(purpose: UploadPurpose): number {
  return Math.min(POLICIES[purpose].maxSize, STORAGE_HARD_MAX)
}

export function isUploadPurpose(v: unknown): v is UploadPurpose {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(POLICIES, v)
}

export type PolicyCheck = { ok: true } | { ok: false; reason: string }

/**
 * ด่านกลางของทุก purpose — ตรวจได้ทั้งจากค่าที่ client แจ้ง (ตอนขอ ticket) และจากขนาดจริง
 * ที่อ่านด้วย HEAD (ตอน commit) เพราะรับ `size` เข้ามาเป็น parameter ไม่ได้ไปอ่านเอง
 *
 * กฎเฉพาะช่องทางของแชท (IG รับแต่ PDF ฯลฯ) **ไม่ได้อยู่ที่นี่** — อยู่ที่
 * `checkChannelSupport` ตามเดิม เพราะต้องรู้ channel ของเธรดซึ่งเป็นข้อมูลของ conversation
 */
export function checkUploadPolicy(
  purpose: UploadPurpose,
  file: { name: string; size: number; mime: string },
): PolicyCheck {
  const policy = POLICIES[purpose]
  const ext = extFromName(file.name)
  const mime = (file.mime || '').toLowerCase()
  const kind = attachmentKind(mime, ext)

  if (file.size <= 0) {
    return { ok: false, reason: 'ไฟล์ว่างเปล่า' }
  }

  // deny-list มาก่อนเพดานขนาด: เหตุผลที่ "แก้ไม่ได้" ควรขึ้นก่อนเหตุผลที่ "ย่อไฟล์แล้วผ่าน"
  if (BLOCKED_EXT.includes(ext)) {
    return { ok: false, reason: `ไฟล์ชนิด .${ext} อัปโหลดไม่ได้ด้วยเหตุผลด้านความปลอดภัย` }
  }

  const max = uploadMaxSize(purpose)
  if (file.size > max) {
    return { ok: false, reason: oversizeMessage({ kind, size: file.size, maxSize: max, noun: policy.noun }) }
  }

  if (policy.allowMime && policy.allowExt) {
    // ต้องผ่านทั้ง mime และ ext — ปลอม mime มาแต่ ext เป็นของอื่น (หรือกลับกัน) ถือว่าไม่ผ่าน
    // เพราะ `/api/files` derive Content-Type ตอนเสิร์ฟจาก **ext** ไม่ใช่ค่าที่ storage เก็บ
    const mimeOk = policy.allowMime.includes(mime)
    const extOk = policy.allowExt.includes(ext)
    if (!mimeOk || !extOk) {
      const label =
        purpose === 'IMAGE'
          ? 'รูปภาพ .jpg .png .webp .gif'
          : 'รูปภาพ .jpg .png .webp .gif หรือไฟล์ .pdf'
      return { ok: false, reason: `รองรับเฉพาะ${label}` }
    }
  }

  return { ok: true }
}
