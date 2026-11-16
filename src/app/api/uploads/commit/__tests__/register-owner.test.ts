// 00095 — commit แบบ CHAT ไม่มีเธรด (ทางที่ฟอร์มบอทติดตามอัปรูป) ต้องลงทะเบียนเจ้าของร้านให้ไฟล์ (MediaAsset)
// ไม่งั้นด่าน assertOwnedImages ปฏิเสธรูปที่ร้านเพิ่งอัปเอง · ไม่ใช้ DB (mock ทั้งหมด)
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))
const m = vi.hoisted(() => ({
  reconcile: vi.fn(async () => ({ fileId: 'survivor.png' })),
  gate: vi.fn(),
  claim: { fileId: '2026/11/16/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png', userId: 'u1', purpose: 'CHAT', maxSize: 5_000_000 } as Record<string, unknown>,
}))
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => ({ user: { id: 'u1' } })) }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/storage', () => ({ getFileMeta: vi.fn(async () => ({ size: 1000, ext: 'png' })), deleteFile: vi.fn(async () => {}) }))
vi.mock('@/lib/upload-ticket', () => ({ verifyUploadTicket: vi.fn(() => m.claim) }))
vi.mock('@/lib/shop-capability', () => ({ requireShopCapability: m.gate }))
vi.mock('@/services/media-asset.service', () => ({ reconcileUploadedFile: m.reconcile }))
vi.mock('@/services/image-variant.service', () => ({ generateImageVariants: vi.fn(async () => {}) }))
vi.mock('../../_shared', () => ({ resolveChatChannelForUser: vi.fn() }))

import { NextRequest } from 'next/server'
import { POST } from '../route'

const call = () =>
  POST(new NextRequest('http://x/api/uploads/commit', { method: 'POST', body: JSON.stringify({ ticket: 't', name: 'a.png', mime: 'image/png' }) }))

describe('POST /api/uploads/commit — CHAT ไม่มีเธรด', () => {
  beforeEach(() => {
    m.reconcile.mockClear()
    m.gate.mockReset()
  })
  it('ผ่านด่าน H2 → ลงทะเบียน MediaAsset ด้วย shopId ของด่าน และตอบ fileId ของผู้ชนะ', async () => {
    m.gate.mockResolvedValue({ ok: true, shopId: 'shop-1', userId: 'u1' })
    const res = await call()
    expect(res.status).toBe(201)
    expect((await res.json()).fileId).toBe('survivor.png')
    expect(m.reconcile).toHaveBeenCalledWith(expect.objectContaining({ shopId: 'shop-1', fileId: m.claim.fileId, contentType: 'image/png' }))
  })
  it('ไม่ผ่านด่าน H2 → 403 และไม่ลงทะเบียน', async () => {
    m.gate.mockResolvedValue({ ok: false })
    expect((await call()).status).toBe(403)
    expect(m.reconcile).not.toHaveBeenCalled()
  })
  it('ลงทะเบียนล้ม → อัปโหลดไม่ล้ม ใช้ fileId เดิม', async () => {
    m.gate.mockResolvedValue({ ok: true, shopId: 'shop-1', userId: 'u1' })
    m.reconcile.mockRejectedValueOnce(new Error('db down'))
    const res = await call()
    expect(res.status).toBe(201)
    expect((await res.json()).fileId).toBe(m.claim.fileId)
  })
})
