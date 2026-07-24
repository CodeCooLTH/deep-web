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

// ทำไมใช้ new Response(...) จริงแทน object ปลอม: (S-1) mirrorRemoteImage อ่าน body ผ่าน
// res.body.getReader() (streaming) ไม่ใช่ res.arrayBuffer() แล้ว — ต้องมี body เป็น
// ReadableStream จริงถึงจะเทสต์ path นี้ได้ (Node 22 undici ให้ Response.body เป็น stream จริง)
function fakeFbResponse(body: Uint8Array | null, init: { status?: number; contentType?: string } = {}) {
  const headers: Record<string, string> = {}
  if (init.contentType) headers['content-type'] = init.contentType
  return new Response(body as BodyInit | null, { status: init.status ?? 200, headers })
}

describe('mirrorRemoteImage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => vi.unstubAllGlobals())

  it('ดาวน์โหลดสำเร็จจาก host ของ Meta → คืน fileId จาก storage', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      fakeFbResponse(new Uint8Array(16), { contentType: 'image/jpeg' }),
    )
    saveFile.mockResolvedValue('chat/abc.jpg')

    expect(await mirrorRemoteImage('https://scontent.fbcdn.net/x.jpg')).toBe('chat/abc.jpg')
  })

  it('ดาวน์โหลดไม่สำเร็จ → คืน null ไม่ throw (ข้อความยังต้องถูกเก็บ)', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(fakeFbResponse(null, { status: 404 }))
    expect(await mirrorRemoteImage('https://scontent.fbcdn.net/gone.jpg')).toBeNull()
    expect(saveFile).not.toHaveBeenCalled()
  })

  it('ไฟล์ใหญ่เกิน 25MB (จริง ไม่ใช่แค่ header โกหก) → ยกเลิกกลางทางระหว่างอ่าน คืน null ไม่อัปโหลด', async () => {
    const big = new Uint8Array(26 * 1024 * 1024)
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      fakeFbResponse(big, { contentType: 'image/jpeg' }),
    )
    expect(await mirrorRemoteImage('https://scontent.fbcdn.net/big.jpg')).toBeNull()
    expect(saveFile).not.toHaveBeenCalled()
  })

  // "รองรับทุกอย่าง" (user 2026-07-24): จาก Meta CDN (host allow-list ผ่านแล้ว) content-type ใดก็เก็บได้
  // ไม่มี allow-list ชนิดไฟล์แล้ว — ชนิดแปลกได้ generic ext, serve เป็น attachment (ปลอดภัยด้วย nosniff)
  it('content-type แปลก (text/html) → ยังเก็บได้ด้วย generic ext + skipValidation (จาก Meta CDN ปลอดภัย)', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      fakeFbResponse(new Uint8Array(8), { contentType: 'text/html' }),
    )
    saveFile.mockResolvedValue('chat/x.html')
    expect(await mirrorRemoteImage('https://graph.facebook.com/x')).toBe('chat/x.html')
    expect(saveFile).toHaveBeenCalledWith(expect.anything(), { skipValidation: true })
  })

  it('content-type image/gif → mirror สำเร็จ (รองรับ GIF/สติกเกอร์เคลื่อนไหว)', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      fakeFbResponse(new Uint8Array(8), { contentType: 'image/gif' }),
    )
    saveFile.mockResolvedValue('chat/x.gif')
    expect(await mirrorRemoteImage('https://scontent.fbcdn.net/x.gif')).toBe('chat/x.gif')
    expect(saveFile).toHaveBeenCalledWith(expect.anything(), { skipValidation: true })
  })

  // (S-1) SSRF guard — host นอก allow-list ต้องไม่ยิง fetch ออกไปเลย
  it('host นอก allow-list (ไม่ใช่ CDN ของ Meta) → คืน null และไม่เรียก fetch เลย', async () => {
    expect(await mirrorRemoteImage('https://internal.example.com/x.jpg')).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('SSRF ผ่าน internal/metadata address → คืน null และไม่เรียก fetch เลย', async () => {
    expect(await mirrorRemoteImage('http://169.254.169.254/latest/meta-data/')).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('host ปลอมตัวเป็น fbcdn.net (evil-fbcdn.net) → ปฏิเสธ ไม่ผ่าน suffix match มั่ว ๆ', async () => {
    expect(await mirrorRemoteImage('https://evil-fbcdn.net/x.jpg')).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('protocol เป็น http (ไม่ใช่ https) แม้ host จะถูก → ปฏิเสธ ไม่เรียก fetch', async () => {
    expect(await mirrorRemoteImage('http://scontent.fbcdn.net/x.jpg')).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('URL parse ไม่ได้ (malformed) → คืน null ไม่ throw', async () => {
    expect(await mirrorRemoteImage('not-a-url')).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('host เป็น cdninstagram.com หรือ subdomain → ผ่าน allow-list', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      fakeFbResponse(new Uint8Array(16), { contentType: 'image/png' }),
    )
    saveFile.mockResolvedValue('chat/ig.png')
    expect(await mirrorRemoteImage('https://scontent.cdninstagram.com/x.png')).toBe('chat/ig.png')
  })
})
