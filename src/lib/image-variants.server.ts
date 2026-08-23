import sharp from 'sharp'

import { IMAGE_VARIANTS, type ImageVariant } from './image-variants'

/**
 * image-variants.server — ตัวย่อรูปจริง (feature 00054) · **server เท่านั้น**
 *
 * แยกจาก `image-variants.ts` เพราะไฟล์นั้นถูก import ทางอ้อมจาก client component ผ่าน
 * `file-url.ts` — `sharp` เป็น native module ที่ bundle ฝั่งเบราว์เซอร์ไม่ได้
 *
 * pure: รับ Buffer คืน Buffer ห้ามแตะ storage/prisma (ผู้เรียกคือฝ่ายที่รู้จัก storage)
 */

/**
 * ย่อรูปหนึ่งขนาด — คืน `null` เมื่อทำไม่ได้ **ห้าม throw**
 *
 * การอัปโหลดที่ล้มเพราะย่อรูปไม่ผ่านคือความเสียหายจริง ส่วนการไม่มีรูปย่อคือหน้าเว็บที่ช้าลง
 * เท่าเดิม — หน้าจอตกไปใช้ต้นฉบับได้เองอยู่แล้ว (หลักการเดียวกับ `buildMetaCardJpeg`)
 *
 * เงื่อนไขที่คืน null:
 *   - sharp โยน error (ไฟล์เสีย / ไม่ใช่รูป)
 *   - ผลลัพธ์ **ใหญ่กว่าต้นฉบับ** — เกิดกับรูปเล็ก ๆ ที่บีบแล้วโตขึ้น การเก็บไว้มีแต่เสียพื้นที่
 *     และทำให้หน้าจอโหลดของที่หนักกว่าเดิม
 */
export async function buildImageVariant(
  source: Buffer,
  variant: ImageVariant,
): Promise<Buffer | null> {
  const spec = IMAGE_VARIANTS[variant]
  try {
    const out = await sharp(source)
      // เคารพ EXIF — ไม่งั้นรูปจากมือถือตะแคง (บทเรียนเดียวกับ card-image.ts)
      .rotate()
      .resize({
        width: spec.maxEdge,
        height: spec.maxEdge,
        // `inside` = ย่อให้ทั้งใบอยู่ในกรอบ ไม่ครอปอะไรทิ้ง — ต่างจากการ์ด Meta ที่ใช้ `cover`
        // เพราะที่นั่นกรอบตายตัว ส่วนที่นี่กริดยืดตามสัดส่วนรูปอยู่แล้ว
        fit: 'inside',
        // 🛑 ห้ามขยายรูปที่เล็กกว่ากรอบ — ได้ไฟล์ใหญ่ขึ้นโดยไม่ได้รายละเอียดเพิ่มแม้แต่พิกเซลเดียว
        withoutEnlargement: true,
      })
      // ไม่ flatten: WebP รองรับ alpha (ต่างจาก JPEG ที่ต้องถมพื้นขาวก่อน)
      .webp({ quality: spec.quality })
      .toBuffer()

    return out.byteLength < source.byteLength ? out : null
  } catch {
    return null
  }
}
