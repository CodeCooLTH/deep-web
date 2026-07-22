import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/services/shop-channel.service', () => ({
  getChannelByExternalId: vi.fn(),
  markChannelTokenInvalid: vi.fn(),
}))
vi.mock('@/lib/facebook/graph', () => ({
  getContactProfile: vi.fn(),
  sendTextMessage: vi.fn(),
  GraphApiError: class extends Error {},
}))
// ทำไม vi.hoisted: vi.mock ถูก hoist ขึ้นบนสุดของไฟล์ก่อน const declaration ปกติ —
// ถ้าประกาศ saveFile ด้วย const ธรรมดาแล้วอ้างใน factory จะชน TDZ (ReferenceError)
const { saveFile } = vi.hoisted(() => ({ saveFile: vi.fn() }))
vi.mock('@/lib/storage', () => ({ saveFile }))

beforeAll(() => {
  process.env.CHANNEL_TOKEN_KEY = 'e'.repeat(64)
})

import { mirrorRemoteImage } from '@/services/channel-chat.service'

describe('mirrorRemoteImage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => vi.unstubAllGlobals())

  it('ดาวน์โหลดสำเร็จ → คืน fileId จาก storage', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'image/jpeg' }),
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(16)),
    })
    saveFile.mockResolvedValue('chat/abc.jpg')

    expect(await mirrorRemoteImage('https://cdn.fb/x.jpg')).toBe('chat/abc.jpg')
  })

  it('ดาวน์โหลดไม่สำเร็จ → คืน null ไม่ throw (ข้อความยังต้องถูกเก็บ)', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 404 })
    expect(await mirrorRemoteImage('https://cdn.fb/gone.jpg')).toBeNull()
    expect(saveFile).not.toHaveBeenCalled()
  })

  it('ไฟล์ใหญ่เกิน 5MB → คืน null ไม่อัปโหลด', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'image/jpeg', 'content-length': String(6 * 1024 * 1024) }),
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
    })
    expect(await mirrorRemoteImage('https://cdn.fb/big.jpg')).toBeNull()
    expect(saveFile).not.toHaveBeenCalled()
  })

  it('content-type ไม่ใช่รูป → คืน null', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'text/html' }),
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
    })
    expect(await mirrorRemoteImage('https://evil/x')).toBeNull()
  })

  it('content-type เป็น image/gif → คืน null ไม่เรียก saveFile เลย (storage/types.ts ไม่รองรับ gif — I-5)', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'image/gif' }),
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
    })
    expect(await mirrorRemoteImage('https://cdn.fb/x.gif')).toBeNull()
    expect(saveFile).not.toHaveBeenCalled()
  })
})
