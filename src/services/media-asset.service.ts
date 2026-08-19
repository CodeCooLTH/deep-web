/**
 * src/services/media-asset.service.ts — choke point จริงของ feature 00051 (Chat Media
 * Deduplication, S-2) ทั้ง path A (mirror), B (derived-image), C (direct-upload commit)
 * และ CLI backfill เรียกเข้าไฟล์นี้ไฟล์เดียว (SDS §2.1, §8 ลำดับ build ข้อ 2)
 *
 * กติกาที่ยึดตาม SRS/SDS:
 *  - findMediaAssetByHash / findMediaAssetBySourceKey / claimSourceKey ต้อง try/catch ภายในตัวเอง
 *    เสมอ แล้ว degrade เป็น null/no-op — ห้าม throw ออกไปถึงผู้เรียก (TFR-CMD-07)
 *  - claimMediaAsset: create ตรง ๆ ก่อน (ไม่ find-then-create) → ชน P2002 บน 'hash' → อ่านผู้ชนะ.
 *    error อื่นที่ไม่ใช่ P2002 **ไม่ catch ในฟังก์ชันนี้** ปล่อยผู้เรียกตัดสิน (TFR-CMD-05)
 *  - writeDedupedFile: precondition คือไฟล์ "ยังไม่ถูกเขียน" — เขียนถ้า miss เท่านั้น (TFR-CMD-01)
 *  - reconcileUploadedFile: precondition คือไฟล์ "ถูกเขียนไปแล้ว" (client PUT ตรง) — แยกจาก
 *    writeDedupedFile โดยเจตนา ไม่ใช้ flag รวมฟังก์ชัน (TD-08)
 */
import { prisma } from '@/lib/prisma'
import { sha256Hex } from '@/lib/media-hash'
import { saveFile, getFile, deleteFile } from '@/lib/storage'
import { contentTypeToExt } from '@/lib/attachment-mime'
// reuse ของเดิม ห้ามเขียนใหม่ (SRS §7.2 dependency table) — ยังไม่เคยพิสูจน์กับ composite unique
// มาก่อน (R-4) พิสูจน์จริงที่ tests/integration/media-asset-dedup.test.ts::TC-RACE-01
import { isUniqueViolationOn } from '@/services/channel-chat.service'

export type MediaAssetHit = { fileId: string }

export type ClaimMediaAssetInput = {
  shopId: string
  hash: string
  fileId: string
  contentType: string
  size: number
  sourceKey?: string
}

export type ClaimMediaAssetResult = {
  survivorFileId: string
  isNewRegistration: boolean
}

// ── ฟังก์ชัน "หา" (find) — ทุกตัวต้อง degrade เป็น null เมื่อ DB error (TFR-CMD-07) ──────────

export async function findMediaAssetByHash(shopId: string, hash: string): Promise<MediaAssetHit | null> {
  try {
    const row = await prisma.mediaAsset.findUnique({ where: { shopId_hash: { shopId, hash } } })
    return row ? { fileId: row.fileId } : null
  } catch {
    // subsystem MediaAsset ล่ม → ตีความเป็น "miss" ไม่ใช่ error — ผู้เรียกจะไปเขียนไฟล์ใหม่ตามปกติ
    // (ปลอดภัยกว่า throw เพราะไม่ทำให้ mirror ทั้งก้อนกลายเป็น placeholder, NFR-CMD-02)
    return null
  }
}

export async function findMediaAssetBySourceKey(shopId: string, sourceKey: string): Promise<MediaAssetHit | null> {
  try {
    // ไม่ใช้ findUnique เพราะ sourceKey ไม่ใช่ unique constraint (index ธรรมดา — DATABASE.md §3.1
    // เหตุผล: sourceKey เป็นแค่ cache เสริมบน (shopId, hash) ที่เป็นแหล่งความจริงเดียว)
    const row = await prisma.mediaAsset.findFirst({ where: { shopId, sourceKey } })
    return row ? { fileId: row.fileId } : null
  } catch {
    return null
  }
}

// set-once best-effort — ไม่ overwrite sourceKey ที่มีอยู่แล้ว (TFR-CMD-03: เจ้าของ sourceKey
// คนแรกชนะ, ครั้งถัดไปยัง hit ผ่าน layer 1 hash อยู่ดี)
export async function claimSourceKey(shopId: string, hash: string, sourceKey: string): Promise<void> {
  try {
    await prisma.mediaAsset.updateMany({
      where: { shopId, hash, sourceKey: null },
      data: { sourceKey },
    })
  } catch {
    // best-effort เท่านั้น — ล้มเหลวไม่กระทบผลลัพธ์หลักของผู้เรียก (TFR-CMD-07)
  }
}

// ── claimMediaAsset — primitive เดียวที่ path A/B/C + CLI เรียกร่วมกัน (TD-02) ──────────────

export async function claimMediaAsset(input: ClaimMediaAssetInput): Promise<ClaimMediaAssetResult> {
  const { shopId, hash, fileId, contentType, size, sourceKey } = input
  try {
    // insert ตรง ๆ ก่อนเสมอ (ไม่ find-then-create) — @@unique([shopId, hash]) เป็นตัวตัดสิน race
    // จริงที่ระดับ DB (DATABASE.md §5, R-4)
    await prisma.mediaAsset.create({
      data: { shopId, hash, fileId, contentType, size, sourceKey: sourceKey ?? null },
    })
    return { survivorFileId: fileId, isNewRegistration: true }
  } catch (e) {
    if (isUniqueViolationOn(e, 'hash')) {
      // แพ้ race — อ่านค่าที่ผู้ชนะเขียนไว้กลับมาใช้แทน (DATABASE.md §5 ขั้นตอน 5)
      const winner = await prisma.mediaAsset.findUniqueOrThrow({
        where: { shopId_hash: { shopId, hash } },
      })
      return { survivorFileId: winner.fileId, isNewRegistration: false }
    }
    // error อื่นที่ไม่ใช่ P2002 บน hash — ไม่ catch ในฟังก์ชันนี้ ปล่อยผู้เรียกตัดสินใจ
    // (TFR-CMD-05; ผู้เรียกคือ writeDedupedFile/reconcileUploadedFile/CLI)
    throw e
  }
}

// ── writeDedupedFile — choke point ของ path A (mirror) และ path B (derived-image) ──────────
// TFR-CMD-01: hash → lookup → เขียนไฟล์ถ้า miss → register. precondition: ไฟล์ยังไม่ถูกเขียน
// (ต่างจาก reconcileUploadedFile ที่ไฟล์ถูกเขียนไปแล้วก่อนเรียก — TD-08)

export async function writeDedupedFile(
  buffer: Buffer | ArrayBuffer,
  contentType: string,
  opts: { shopId: string; filenamePrefix: string; sourceKey?: string },
): Promise<string> {
  const hash = sha256Hex(buffer)

  const existing = await findMediaAssetByHash(opts.shopId, hash)
  if (existing) {
    // hit — ไม่เขียนไฟล์ + claim sourceKey แบบ best-effort ถ้ามี (ไม่กระทบผลลัพธ์หลักถ้าล้ม)
    if (opts.sourceKey) await claimSourceKey(opts.shopId, hash, opts.sourceKey)
    return existing.fileId
  }

  // miss — เขียนไฟล์จริงก่อน (คง behavior เดิมของ saveMirroredBuffer ทุกอย่าง: skipValidation,
  // ชื่อไฟล์ `${filenamePrefix}-${Date.now()}.${ext}`)
  const ext = contentTypeToExt(contentType)
  const file = new File([buffer as ArrayBuffer], `${opts.filenamePrefix}-${Date.now()}.${ext}`, { type: contentType })
  const fileId = await saveFile(file, { skipValidation: true })
  const size = Buffer.isBuffer(buffer) ? buffer.length : buffer.byteLength

  try {
    const claim = await claimMediaAsset({
      shopId: opts.shopId,
      hash,
      fileId,
      contentType,
      size,
      sourceKey: opts.sourceKey,
    })
    if (claim.isNewRegistration) return fileId
    // แพ้ race — ลบไฟล์ที่ตัวเองเพิ่งเขียนทิ้ง (best-effort, DATABASE.md §5 ขั้นตอน 5)
    await deleteFile(fileId).catch(() => {})
    return claim.survivorFileId
  } catch {
    // TFR-CMD-01 ข้อ 5 / TC-SAFE-04: claimMediaAsset โยน error ที่ไม่ใช่ P2002 หลัง saveFile()
    // สำเร็จไปแล้ว — คืน fileId ที่เขียนสำเร็จจริง แทนที่จะปล่อย exception ลอยไปถึง catch-all ของ
    // mirrorRemoteImage ซึ่งจะตีความว่า "mirror ล้มเหลว" (regression ร้ายแรงกว่าไม่มีฟีเจอร์นี้เลย)
    return fileId
  }
}

// ── reconcileUploadedFile — choke point ของ path C (direct-upload commit) ──────────────────
// TFR-CMD-10: ไฟล์ถูกเขียนไปแล้วก่อน server เห็นด้วยซ้ำ (client PUT ตรงผ่าน presigned URL) —
// "write-already-happened-then-reconcile" ไม่ใช่ "hash-then-write" — ไม่ catch เองที่นี่ (ผู้เรียก
// ที่ /api/uploads/commit เป็นคน .catch(() => null) ทั้งก้อนแล้ว fallback เป็น claim.fileId เดิม)

export async function reconcileUploadedFile(opts: {
  shopId: string
  fileId: string
  contentType: string
  size: number
}): Promise<{ fileId: string }> {
  const existingFile = await getFile(opts.fileId)
  if (!existingFile) {
    // ไฟล์หายจาก storage หลัง PUT — throw ให้ route ชั้นบน catch แล้วใช้ claim.fileId เดิมต่อ
    // (TFR-CMD-10 error/edge case)
    throw new Error(`[reconcileUploadedFile] getFile(${opts.fileId}) คืน null`)
  }

  const hash = sha256Hex(existingFile.buffer)
  const claim = await claimMediaAsset({
    shopId: opts.shopId,
    hash,
    fileId: opts.fileId,
    contentType: opts.contentType,
    size: opts.size,
  })

  if (claim.isNewRegistration) return { fileId: opts.fileId }

  // ไฟล์ที่ client เพิ่ง PUT ซ้ำกับที่มีอยู่แล้ว — ลบทิ้ง best-effort แล้วคืนของผู้ชนะ
  await deleteFile(opts.fileId).catch(() => {})
  return { fileId: claim.survivorFileId }
}
