import { describe, it, expect, vi, beforeEach } from 'vitest'

// bug 2026-10-10: รูป ~4MB ส่งเข้า Messenger แล้ว Meta upload timeout — รูปใหญ่ต้องส่งฉบับย่อ
const m = vi.hoisted(() => ({
  getFileMeta: vi.fn(),
  getFile: vi.fn(),
  getFileUrl: vi.fn(async (id: string) => `signed:${id}`),
  find: vi.fn(),
  write: vi.fn(),
  build: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/lib/storage', async (orig) => ({
  ...(await orig<typeof import('@/lib/storage')>()),
  getFileMeta: m.getFileMeta,
  getFile: m.getFile,
  getFileUrl: m.getFileUrl,
}))
vi.mock('@/services/media-asset.service', () => ({ findMediaAssetBySourceKey: m.find, writeDedupedFile: m.write }))
vi.mock('@/lib/line/preview-image', async (orig) => ({
  ...(await orig<typeof import('@/lib/line/preview-image')>()),
  buildLinePreviewJpeg: m.build,
}))

import { resolveMetaSendImageUrl } from '@/services/channel-chat.service'

const MB = 1024 * 1024

describe('resolveMetaSendImageUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.find.mockResolvedValue(null)
    m.getFile.mockResolvedValue({ buffer: Buffer.from('x') })
    m.build.mockResolvedValue(Buffer.from('small'))
    m.write.mockResolvedValue('small.jpg')
  })

  it('รูปเล็ก (≤1MB) ส่งต้นฉบับ ไม่ย่อ', async () => {
    m.getFileMeta.mockResolvedValue({ size: 500 * 1024, ext: 'jpg' })
    expect(await resolveMetaSendImageUrl('orig.jpg', { shopId: 's1' })).toBe('signed:orig.jpg')
    expect(m.build).not.toHaveBeenCalled()
  })

  it('รูปใหญ่ (4MB) ส่งฉบับย่อ และเก็บด้วย sourceKey', async () => {
    m.getFileMeta.mockResolvedValue({ size: 4 * MB, ext: 'jpeg' })
    expect(await resolveMetaSendImageUrl('orig.jpg', { shopId: 's1' })).toBe('signed:small.jpg')
    expect(m.write).toHaveBeenCalledWith(expect.any(Buffer), 'image/jpeg', expect.objectContaining({ sourceKey: 'derived:metasend:orig.jpg' }))
  })

  it('เคยย่อแล้ว = ใช้ของเดิม ไม่ย่อซ้ำ', async () => {
    m.getFileMeta.mockResolvedValue({ size: 4 * MB, ext: 'jpeg' })
    m.find.mockResolvedValue({ fileId: 'cached.jpg' })
    expect(await resolveMetaSendImageUrl('orig.jpg', { shopId: 's1' })).toBe('signed:cached.jpg')
    expect(m.build).not.toHaveBeenCalled()
  })

  it('ย่อไม่ได้/พลาด = ถอยไปส่งต้นฉบับ', async () => {
    m.getFileMeta.mockResolvedValue({ size: 4 * MB, ext: 'jpeg' })
    m.build.mockResolvedValue(null)
    expect(await resolveMetaSendImageUrl('orig.jpg', { shopId: 's1' })).toBe('signed:orig.jpg')
    m.getFile.mockRejectedValue(new Error('boom'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await resolveMetaSendImageUrl('orig.jpg', { shopId: 's1' })).toBe('signed:orig.jpg')
  })
})
