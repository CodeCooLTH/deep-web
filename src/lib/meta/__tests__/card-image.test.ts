import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import {
  buildMetaCardJpeg,
  META_CARD_WIDTH,
  META_CARD_HEIGHT,
  META_CARD_MAX_BYTES,
} from '@/lib/meta/card-image'

/** noise seed คงที่ — ภาพสีพื้นบีบเหลือไม่กี่ KB เทสจะเขียวโดยไม่ได้พิสูจน์อะไร */
async function noisy(width: number, height: number, channels: 3 | 4 = 3): Promise<Buffer> {
  const px = Buffer.alloc(width * height * channels)
  let seed = 7
  for (let i = 0; i < px.length; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    px[i] = seed % 256
  }
  return sharp(px, { raw: { width, height, channels } })
    .png()
    .toBuffer()
}

describe('กรอบรูปการ์ด Meta', () => {
  it('[blocker] ต้องเป็นจัตุรัส — ตรงกับกรอบการ์ดในแอปผู้ขาย (aspect-square) ทั้งสองฝั่งครอปเหมือนกัน', () => {
    // 🛑 ตรึงเป็น "อัตราส่วน" ไม่ใช่เทียบกับค่าคงที่ตัวเอง — เทสที่เขียนว่า `meta.height === META_CARD_HEIGHT`
    // จะเขียวตลอดแม้มีคนเปลี่ยนกรอบกลับไปเป็น 1.91:1 เพราะสองฝั่งของสมการขยับพร้อมกัน (จับได้ตอน
    // ทดสอบด้วย mutation 2026-08-11)
    expect(META_CARD_WIDTH).toBe(META_CARD_HEIGHT)
  })
})

describe('buildMetaCardJpeg', () => {
  it('[blocker] ออกมาเป็นกรอบจัตุรัสเสมอ — ตรงกับกรอบการ์ดในแอปผู้ขาย (ครอปเหมือนกันทั้งสองฝั่ง)', async () => {
    const out = await buildMetaCardJpeg(await noisy(1000, 1000), META_CARD_MAX_BYTES)
    expect(out).not.toBeNull()
    const meta = await sharp(out!).metadata()
    expect(meta.width).toBe(META_CARD_WIDTH)
    expect(meta.height).toBe(META_CARD_HEIGHT)
    expect(meta.format).toBe('jpeg')
  }, 30_000)

  it('[blocker] ไม่เกินเพดานขนาดไฟล์', async () => {
    const out = await buildMetaCardJpeg(await noisy(3000, 3000), META_CARD_MAX_BYTES)
    expect(out).not.toBeNull()
    expect(out!.byteLength).toBeLessThanOrEqual(META_CARD_MAX_BYTES)
  }, 30_000)

  it('[blocker] รูปแนวตั้ง/แนวนอนก็ได้กรอบเดียวกันและ "เต็มกรอบ" ไม่มีแถบขาว (user สั่ง: ชอบรูปเต็ม ๆ)', async () => {
    for (const [w, h] of [
      [2000, 1047],
      [900, 1600],
    ] as const) {
      const out = (await buildMetaCardJpeg(await noisy(w, h), META_CARD_MAX_BYTES))!
      const meta = await sharp(out).metadata()
      expect(meta.width).toBe(META_CARD_WIDTH)
      expect(meta.height).toBe(META_CARD_HEIGHT)
      // เต็มกรอบ = ขอบต้องไม่ใช่สีขาวล้วน (contain จะได้แถบขาวที่ขอบด้านใดด้านหนึ่งเสมอ)
      const { data } = await sharp(out).raw().toBuffer({ resolveWithObject: true })
      const corner = data[0] + data[1] + data[2]
      expect(corner).toBeLessThan(255 * 3)
    }
  }, 60_000)

  it('PNG โปร่งใส → พื้นขาว ไม่ใช่ดำ (JPEG ไม่มี alpha — ไม่ flatten จะได้พื้นดำ)', async () => {
    // ภาพโปร่งใสล้วน: หลัง flatten ต้องได้พื้นขาว
    const transparent = await sharp({
      create: { width: 600, height: 600, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toBuffer()
    const out = await buildMetaCardJpeg(transparent, META_CARD_MAX_BYTES)
    const { data } = await sharp(out!).raw().toBuffer({ resolveWithObject: true })
    // จุดกลางภาพต้องขาว (ค่าใกล้ 255 ทั้ง 3 ช่อง)
    const mid = (Math.floor(META_CARD_HEIGHT / 2) * META_CARD_WIDTH + Math.floor(META_CARD_WIDTH / 2)) * 3
    expect(data[mid]).toBeGreaterThan(240)
    expect(data[mid + 1]).toBeGreaterThan(240)
    expect(data[mid + 2]).toBeGreaterThan(240)
  }, 30_000)

  it('[blocker] ไฟล์ที่ไม่ใช่รูป → คืน null ไม่ throw (การ์ดยังต้องส่งออกได้)', async () => {
    await expect(buildMetaCardJpeg(Buffer.from('ไม่ใช่รูป'), META_CARD_MAX_BYTES)).resolves.toBeNull()
  })
})
