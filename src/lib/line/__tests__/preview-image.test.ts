import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import { buildLinePreviewJpeg, PREVIEW_MAX_EDGE } from '@/lib/line/preview-image'
import { LINE_PREVIEW_MAX_SIZE } from '@/lib/chat-attachment'

/**
 * รูปทดสอบต้อง "บีบยาก" จริง — ภาพสีพื้นบีบเหลือไม่กี่ KB ทุกกรณี เทสจะเขียวโดยไม่ได้พิสูจน์อะไรเลย
 * ใช้ noise แบบสุ่มด้วย seed คงที่ (ไม่ใช้ Math.random — ผลเทสต้องซ้ำได้)
 */
async function noisyJpeg(width: number, height: number): Promise<Buffer> {
  const px = Buffer.alloc(width * height * 3)
  let seed = 42
  for (let i = 0; i < px.length; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    px[i] = seed % 256
  }
  return sharp(px, { raw: { width, height, channels: 3 } }).jpeg({ quality: 100 }).toBuffer()
}

describe('buildLinePreviewJpeg', () => {
  it('[blocker] รูปใหญ่ที่บีบยาก ต้องถูกย่อจนไม่เกินเพดาน preview 1MB ของ LINE', async () => {
    const source = await noisyJpeg(4000, 3000)
    // ถ้าไฟล์ต้นทางไม่ได้ใหญ่เกินเพดานตั้งแต่แรก เทสนี้ก็ไม่ได้พิสูจน์อะไร — กันไว้ก่อน
    expect(source.byteLength).toBeGreaterThan(LINE_PREVIEW_MAX_SIZE)

    const out = await buildLinePreviewJpeg(source, LINE_PREVIEW_MAX_SIZE)
    expect(out).not.toBeNull()
    expect(out!.byteLength).toBeLessThanOrEqual(LINE_PREVIEW_MAX_SIZE)
  }, 30_000)

  it('ผลลัพธ์เป็น JPEG จริงและด้านยาวสุดไม่เกิน PREVIEW_MAX_EDGE', async () => {
    const out = await buildLinePreviewJpeg(await noisyJpeg(3000, 1500), LINE_PREVIEW_MAX_SIZE)
    const meta = await sharp(out!).metadata()
    expect(meta.format).toBe('jpeg')
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(PREVIEW_MAX_EDGE)
  }, 30_000)

  it('รูปที่เล็กกว่าเป้าอยู่แล้วต้องไม่ถูกขยายขึ้น (withoutEnlargement)', async () => {
    const out = await buildLinePreviewJpeg(await noisyJpeg(320, 240), LINE_PREVIEW_MAX_SIZE)
    const meta = await sharp(out!).metadata()
    expect(meta.width).toBe(320)
    expect(meta.height).toBe(240)
  }, 30_000)

  it('[blocker] ไฟล์ที่ไม่ใช่รูป → คืน null ไม่ throw (ห้ามให้เรื่อง preview ล้มการส่งข้อความ)', async () => {
    await expect(
      buildLinePreviewJpeg(Buffer.from('ไม่ใช่รูปเลยสักนิด'), LINE_PREVIEW_MAX_SIZE),
    ).resolves.toBeNull()
  })

  it('เป้าเล็กจนทำไม่ได้จริง → คืน null ไม่ throw', async () => {
    await expect(buildLinePreviewJpeg(await noisyJpeg(2000, 2000), 200)).resolves.toBeNull()
  }, 30_000)
})
