import sharp from 'sharp'
import { describe, expect, it, vi, beforeEach } from 'vitest'

const upsert = vi.fn()
vi.mock('./prisma', () => ({ prisma: { mediaImageSize: { upsert: (...a: unknown[]) => upsert(...a) } } }))

import { readImageSize, recordImageSize } from './image-dimensions.server'

beforeEach(() => upsert.mockReset())

describe('readImageSize [blocker]', () => {
  it('JPEG EXIF orientation 6 → กว้าง/สูงสลับ', async () => {
    const buf = await sharp({ create: { width: 200, height: 100, channels: 3, background: '#f00' } })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer()
    expect(await readImageSize(buf)).toEqual({ width: 100, height: 200 })
  })

  it('GIF เคลื่อนไหว → ใช้ความสูงเฟรมเดียว', async () => {
    const raw = Buffer.alloc(20 * 10 * 4 * 3, 128) // 3 เฟรมซ้อนแนวตั้ง
    const buf = await sharp(raw, { raw: { width: 20, height: 30, channels: 4, pageHeight: 10 } })
      .gif()
      .toBuffer()
    expect(await readImageSize(buf)).toEqual({ width: 20, height: 10 })
  })

  it('ไม่ใช่รูป → null ไม่ throw', async () => {
    expect(await readImageSize(Buffer.from('not an image'))).toBeNull()
  })
})

describe('recordImageSize', () => {
  it('upsert เมื่ออ่านได้ / ไม่เรียกเมื่ออ่านไม่ได้ / prisma ล้มไม่ throw', async () => {
    const buf = await sharp({ create: { width: 8, height: 4, channels: 3, background: '#000' } }).png().toBuffer()
    await recordImageSize('f1', buf)
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { fileId: 'f1' } }))
    upsert.mockClear()
    await recordImageSize('f2', Buffer.from('x'))
    expect(upsert).not.toHaveBeenCalled()
    upsert.mockRejectedValueOnce(new Error('db'))
    await expect(recordImageSize('f3', buf)).resolves.toBeUndefined()
  })
})
