import { describe, it, expect } from 'vitest'
import sharp from 'sharp'

import { canHaveVariants, variantKey, IMAGE_VARIANTS } from './image-variants'
import { buildImageVariant } from './image-variants.server'
import { variantUrlOf, toFileUrl } from './file-url'

/**
 * [blocker] feature 00054 — รูปย่อข้างไฟล์ต้นฉบับ (TC-A1, TC-A2, TC-B1..B6)
 *
 * ใช้ sharp จริงไม่ mock — จุดทั้งหมดของเทสชุดนี้คือ "ไฟล์ที่ได้ออกมาหน้าตาถูกไหม"
 * การ mock sharp จะเหลือแค่การยืนยันว่าเราเรียกฟังก์ชันตามลำดับที่เราเขียนเอง
 * (docs/conventions/mutation-silence-means-weak-corpus.md — เทสที่ mock เพื่อนบ้านทิ้งเขียวตลอด)
 */

/** รูปทดสอบสีเดียว — ขนาดคุมได้เป๊ะ ทำให้เทสเรื่องขนาดไม่ขึ้นกับเนื้อรูป */
async function makeJpeg(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 80, b: 40 } },
  })
    .jpeg({ quality: 92 })
    .toBuffer()
}

describe('[blocker] variantKey', () => {
  it('คีย์ชาร์ดตามวันที่ → เติม .thumb.webp ท้ายชื่อไฟล์', () => {
    expect(variantKey('2026/08/11/uuid.jpg', 'thumb')).toBe('2026/08/11/uuid.thumb.webp')
    expect(variantKey('2026/08/11/uuid.jpg', 'lg')).toBe('2026/08/11/uuid.lg.webp')
  })

  it('ไฟล์เก่าที่ไม่มีโฟลเดอร์ (flat key) ก็ต้องได้ผลถูก', () => {
    expect(variantKey('uuid.png', 'thumb')).toBe('uuid.thumb.webp')
  })

  it('[กฎสำคัญ] ตัดเฉพาะจุดสุดท้าย ไม่ใช่ทุกจุด — ชื่อไฟล์มีจุดได้หลายตัว', () => {
    expect(variantKey('2026/08/11/a.b.c.jpg', 'thumb')).toBe('2026/08/11/a.b.c.thumb.webp')
  })

  it('[กฎสำคัญ] จุดที่อยู่ในชื่อโฟลเดอร์ไม่ใช่นามสกุล — ห้ามตัด', () => {
    expect(variantKey('2026.old/uuid', 'thumb')).toBe('2026.old/uuid.thumb.webp')
  })
})

describe('[blocker] variantUrlOf ปฏิเสธค่าที่ไม่ใช่คีย์ของบัคเก็ตเรา', () => {
  it('URL ภายนอก (อวาตาร์ Facebook) → null', () => {
    expect(variantUrlOf('https://scontent.xx.fbcdn.net/v/t1/abc.jpg', 'thumb')).toBeNull()
  })

  it('path ในเว็บเรา (seed / ค่าที่บางหน้าเซฟเป็น URL เต็ม) → null', () => {
    expect(variantUrlOf('/images/badges/gold.png', 'thumb')).toBeNull()
    expect(variantUrlOf('/api/files/2026/08/11/uuid.jpg', 'thumb')).toBeNull()
  })

  it('null / ค่าว่าง → null', () => {
    expect(variantUrlOf(null, 'thumb')).toBeNull()
    expect(variantUrlOf('', 'lg')).toBeNull()
  })

  it('storage key → URL ของ variant ที่ /api/files', () => {
    expect(variantUrlOf('2026/08/11/uuid.jpg', 'thumb')).toBe(
      '/api/files/2026/08/11/uuid.thumb.webp',
    )
  })

  it('ต้องชี้โดเมนเดียวกับต้นฉบับเสมอ (ไม่งั้น fallback สลับ src ไม่ได้)', () => {
    const key = '2026/08/11/uuid.jpg'
    expect(variantUrlOf(key, 'lg')?.startsWith('/api/files/')).toBe(true)
    expect(toFileUrl(key)?.startsWith('/api/files/')).toBe(true)
  })
})

describe('[blocker] buildImageVariant', () => {
  it('thumb กว้างไม่เกิน 480 · lg ด้านยาวไม่เกิน 1280 · ทั้งคู่เป็น WebP', async () => {
    // 1080×1920 = สัดส่วนรูปจากมือถือจริงที่วัดมาจาก prod
    const src = await makeJpeg(1080, 1920)

    const thumb = await buildImageVariant(src, 'thumb')
    const lg = await buildImageVariant(src, 'lg')
    expect(thumb).not.toBeNull()
    expect(lg).not.toBeNull()

    const tm = await sharp(thumb!).metadata()
    const lm = await sharp(lg!).metadata()

    expect(tm.format).toBe('webp')
    expect(lm.format).toBe('webp')
    expect(Math.max(tm.width!, tm.height!)).toBeLessThanOrEqual(IMAGE_VARIANTS.thumb.maxEdge)
    expect(Math.max(lm.width!, lm.height!)).toBeLessThanOrEqual(IMAGE_VARIANTS.lg.maxEdge)
    // 🛑 ต้องต่างกันจริง — ถ้าสองขนาดออกมาเท่ากัน แปลว่ามีคนสลับ/ก็อปสเปกมาทับกัน
    expect(Math.max(tm.width!, tm.height!)).toBeLessThan(Math.max(lm.width!, lm.height!))
  })

  it('รักษาสัดส่วนเดิม (fit:inside ไม่ครอป)', async () => {
    const src = await makeJpeg(1000, 500)
    const thumb = await buildImageVariant(src, 'thumb')
    const m = await sharp(thumb!).metadata()
    expect(m.width! / m.height!).toBeCloseTo(2, 1)
  })

  it('[กฎสำคัญ] ไม่ขยายรูปที่เล็กกว่ากรอบ — ได้ไฟล์ใหญ่ขึ้นโดยไม่ได้รายละเอียดเพิ่ม', async () => {
    const src = await makeJpeg(200, 200)
    const thumb = await buildImageVariant(src, 'thumb')
    if (thumb) {
      const m = await sharp(thumb).metadata()
      expect(m.width).toBe(200)
      expect(m.height).toBe(200)
    }
  })

  it('ย่อแล้วต้องเล็กลงจริง (ไม่งั้นคืน null)', async () => {
    const src = await makeJpeg(1080, 1920)
    const thumb = await buildImageVariant(src, 'thumb')
    expect(thumb!.byteLength).toBeLessThan(src.byteLength)
  })

  it('ไฟล์ที่ไม่ใช่รูป → null ไม่ throw (การอัปโหลดต้องไม่ล้มเพราะย่อรูปไม่ผ่าน)', async () => {
    await expect(buildImageVariant(Buffer.from('ไม่ใช่รูปเลย'), 'thumb')).resolves.toBeNull()
  })
})

describe('[blocker] canHaveVariants', () => {
  it('รับเฉพาะรูป raster ที่ย่อแล้วไม่เสียอะไร', () => {
    for (const ext of ['jpg', 'jpeg', 'png', 'webp', 'JPG', '.png']) {
      expect(canHaveVariants(ext)).toBe(true)
    }
  })

  it('[กฎสำคัญ] ไม่รับ gif — sharp จะเหลือเฟรมเดียว ภาพเคลื่อนไหวหายไป', () => {
    expect(canHaveVariants('gif')).toBe(false)
  })

  it('ไม่รับไฟล์ที่ไม่ใช่รูป', () => {
    for (const ext of ['pdf', 'mp4', 'mp3', 'docx', 'heic', '']) {
      expect(canHaveVariants(ext)).toBe(false)
    }
  })
})
