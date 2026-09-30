import { describe, expect, it, vi, beforeEach } from 'vitest'

const findUnique = vi.fn()
const record = vi.fn()
vi.mock('@/lib/prisma', () => ({ prisma: { mediaAsset: { findUnique: (...a: unknown[]) => findUnique(...a), create: vi.fn().mockResolvedValue({}) } } }))
vi.mock('@/lib/image-dimensions.server', () => ({ recordImageSize: (...a: unknown[]) => record(...a) }))
vi.mock('@/lib/storage', () => ({ saveFile: vi.fn().mockResolvedValue('new-id'), getFile: vi.fn(), deleteFile: vi.fn() }))
vi.mock('@/services/channel-chat.service', () => ({ isUniqueViolationOn: () => false }))

import { writeDedupedFile } from './media-asset.service'

const buf = Buffer.from('abc')
const opts = { shopId: 's', filenamePrefix: 'p' }
beforeEach(() => { record.mockReset(); findUnique.mockReset() })

describe('writeDedupedFile → recordImageSize [blocker]', () => {
  it('dedup hit เรียกด้วย fileId ที่คืนจริง', async () => {
    findUnique.mockResolvedValue({ fileId: 'old-id' })
    expect(await writeDedupedFile(buf, 'image/jpeg', opts)).toBe('old-id')
    expect(record).toHaveBeenCalledWith('old-id', buf)
  })
  it('miss เรียกด้วย fileId ใหม่', async () => {
    findUnique.mockResolvedValue(null)
    expect(await writeDedupedFile(buf, 'image/jpeg', opts)).toBe('new-id')
    expect(record).toHaveBeenCalledWith('new-id', buf)
  })
  it('ไม่ใช่รูป → ไม่เรียก', async () => {
    findUnique.mockResolvedValue({ fileId: 'old-id' })
    await writeDedupedFile(buf, 'video/mp4', opts)
    expect(record).not.toHaveBeenCalled()
  })
})
