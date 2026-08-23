import { getFile, getFileMeta, saveFileAtKey } from '@/lib/storage'
import { buildImageVariant } from '@/lib/image-variants.server'
import {
  canHaveVariants,
  variantKey,
  VARIANT_CONTENT_TYPE,
  type ImageVariant,
} from '@/lib/image-variants'

/**
 * image-variant.service — สร้างรูปย่อข้างไฟล์ต้นฉบับ (feature 00054)
 *
 * ใช้ร่วมกันสองที่: `POST /api/uploads/commit` (รูปที่อัปใหม่) และ
 * `scripts/backfill-image-variants.ts` (รูปเก่า) — ตรรกะอยู่ที่นี่ที่เดียวเพื่อให้สองเส้นทาง
 * ผลิตไฟล์ชุดเดียวกันเป๊ะเสมอ
 *
 * 🛑 **ห้ามลบหรือเขียนทับไฟล์ต้นฉบับ** — ไฟล์นี้ไม่ import `deleteFile` โดยเจตนา และมีเทส
 * สแกนซอร์สยืนยันว่าไม่มีคำสั่งลบใด ๆ
 *
 * 🛑 **ห้ามใช้ `writeDedupedFile` ของ feature 00051** — ตัวนั้น scope ด้วย shopId และคืนคีย์ของ
 * ไฟล์เดิมเมื่อเนื้อซ้ำ ⇒ variant จะไปอยู่คีย์ที่ไม่ตรงกับสูตร `variantKey()` ที่ฝั่งเบราว์เซอร์
 * คำนวณเอง แล้วหน้าจอจะขอไฟล์ที่ไม่มีอยู่จริงตลอดกาลโดยตกไป fallback เงียบ ๆ
 */

const ALL_VARIANTS: ImageVariant[] = ['thumb', 'lg']

export type GenerateVariantsResult = {
  /** variant ที่เขียนสำเร็จรอบนี้ */
  created: ImageVariant[]
  /** variant ที่ข้ามเพราะมีอยู่แล้ว (เฉพาะตอนส่ง skipExisting) */
  skipped: ImageVariant[]
  /** สร้างไม่ได้ (ไฟล์เสีย / ย่อแล้วใหญ่กว่าเดิม) — ไม่ใช่ error ที่ต้องบอกผู้ใช้ */
  failed: ImageVariant[]
}

const EMPTY: GenerateVariantsResult = { created: [], skipped: [], failed: [] }

/**
 * สร้าง variant ทั้งชุดของไฟล์หนึ่งใบ
 *
 * 🛑 **ผู้เรียกต้องเป็นฝ่ายรับประกันว่าไฟล์นี้เป็นรูปสาธารณะ** — ฟังก์ชันนี้ไม่รู้จัก purpose และ
 * ไม่มีทางรู้ว่าคีย์ที่รับมาเป็นเอกสาร KYC หรือรูปสินค้า
 * เหตุผลที่เรื่องนี้สำคัญ: ด่านสิทธิ์ทั้ง 5 ชั้นใน `/api/files/[...fileId]` ตรวจจาก **คีย์ต้นฉบับ**
 * เท่านั้น ⇒ คีย์ของ variant ไม่ตรงกับค่าใดในฐานข้อมูล จึงเดินผ่านทุกด่านและถูกเสิร์ฟเป็นไฟล์
 * สาธารณะ · สร้าง variant ให้เอกสาร KYC หนึ่งครั้ง = เปิดเอกสารนั้นให้ใครก็ได้ที่เดาคีย์ถูก
 *
 * ไม่ throw ในทุกกรณี — ความล้มเหลวรายงานผ่าน `failed` (BR-IMG-04)
 */
export async function generateImageVariants(
  fileKey: string,
  opts?: { skipExisting?: boolean },
): Promise<GenerateVariantsResult> {
  const ext = fileKey.split('.').pop() ?? ''
  if (!canHaveVariants(ext)) return EMPTY

  // ตรวจว่ามีอยู่แล้วหรือยัง **ก่อน** ดาวน์โหลดต้นฉบับ — backfill รันซ้ำได้โดยไม่ดึงไฟล์เปล่า ๆ
  const wanted: ImageVariant[] = []
  const skipped: ImageVariant[] = []
  for (const variant of ALL_VARIANTS) {
    if (opts?.skipExisting && (await getFileMeta(variantKey(fileKey, variant)))) {
      skipped.push(variant)
      continue
    }
    wanted.push(variant)
  }
  if (wanted.length === 0) return { created: [], skipped, failed: [] }

  const source = await getFile(fileKey).catch(() => null)
  if (!source) return { created: [], skipped, failed: wanted }

  const created: ImageVariant[] = []
  const failed: ImageVariant[] = []

  for (const variant of wanted) {
    const buffer = await buildImageVariant(source.buffer, variant)
    if (!buffer) {
      // ย่อแล้วใหญ่กว่าเดิม หรือไฟล์เสีย — ทั้งคู่คือ "ไม่ต้องมี variant" ไม่ใช่ความผิดพลาด
      failed.push(variant)
      continue
    }
    try {
      await saveFileAtKey(variantKey(fileKey, variant), buffer, VARIANT_CONTENT_TYPE)
      created.push(variant)
    } catch {
      failed.push(variant)
    }
  }

  return { created, skipped, failed }
}
