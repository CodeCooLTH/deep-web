/**
 * [blocker] (F-6) ใบที่ N เข้าคิวไม่สำเร็จ — ใบที่ 1..N-1 ที่เข้าคิวไปแล้ว **ต้องถูกสั่งระบาย**
 *
 * ที่มา: เส้นทาง `IMAGE_GRID` และ "ไฟล์แนบ + caption" วน `enqueueOutbound` ทีละใบ โดยมี
 * `after(deliverRoom(...))` อยู่ **หลังลูป** — ใบที่ 3 จาก 5 โยนเมื่อไหร่ ใบที่ 1-2 เป็นแถว
 * `QUEUED` ในฐานไปเรียบร้อยแล้ว แต่ throw วิ่งข้ามบรรทัดนั้นไปที่ `mapChatServiceError` ⇒
 * ไม่มีใครสั่งระบายเลย. ผู้ขายเห็น error → กดส่งใหม่ → ระหว่างนั้นตัวกวาดมาเจอแถวกำพร้าแล้วยิง
 * ออกไปให้ภายใน 1 นาที = **ลูกค้าได้ข้อความซ้ำ** โดยไม่มี tsc/build/เทสตัวไหนฟ้อง
 *
 * 🛑 เทสกลุ่มนี้เป็น **เทสพฤติกรรม ไม่ใช่เทสอ่านซอร์ส** โดยตั้งใจ (ต่างจาก
 * `queued-responses-drain.test.ts` ในโฟลเดอร์เดียวกันที่กันเฉพาะ "ลืมเขียนบรรทัดนั้น"):
 * สิ่งที่ต้องพิสูจน์คือ *ลำดับการทำงานตอนมี exception* ซึ่งการอ่านซอร์สตอบไม่ได้ — โค้ดที่มี
 * `after(deliverRoom(...))` ครบทุกบรรทัดก็ยังพังได้ ถ้ามันอยู่ผิดฝั่งของ throw
 *
 * เพื่อนบ้านถูก mock เท่าที่จำเป็นให้ handler เดินถึงจุดที่สนใจ — ตัวที่ **ไม่** mock คือ
 * `SendChatMessageSchema` (Valibot จริง) และตรรกะทั้งหมดในไฟล์ route เอง
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const enqueueOutbound = vi.fn()
const deliverRoom = vi.fn(async (_id: string, _owner: string) => 0)
const after = vi.fn((p: unknown) => p)

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: (p: unknown) => after(p),
}))
vi.mock('next-auth', () => ({
  getServerSession: vi.fn(async () => ({ user: { id: 'user-1' } })),
}))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/subdomain', () => ({ getSubdomain: () => 'seller' }))
vi.mock('@/lib/api-rate-limit', () => ({ checkApiRateLimit: () => true }))
vi.mock('@/services/chat-outbox.service', () => ({
  enqueueOutbound: (arg: unknown) => enqueueOutbound(arg),
  deliverRoom: (id: string, owner: string) => deliverRoom(id, owner),
}))
vi.mock('@/services/chat.service', () => ({ getMessages: vi.fn(), sendMessage: vi.fn() }))
vi.mock('@/services/channel-chat.service', () => ({
  syncMissingMessagesFromMeta: vi.fn(),
  resolveLineFlexImageUrl: vi.fn(),
  resolveMetaCardImageUrl: vi.fn(),
}))
vi.mock('@/services/product.service', () => ({
  getProductById: vi.fn(),
  getProductsByIds: vi.fn(async () => []),
}))
vi.mock('@/services/seller-push.service', () => ({ pushNewChatMessage: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    conversation: { findUnique: vi.fn(async () => ({ channel: 'LINE', shopId: 'shop-1' })) },
    user: { findUnique: vi.fn(async () => ({ displayName: 'ร้านทดสอบ', avatar: null })) },
    chatMessage: { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []) },
    order: { findFirst: vi.fn(async () => null) },
  },
}))

const { POST } = await import('../route')

/** คำขอขั้นต่ำที่ handler ต้องใช้จริง — มันอ่านแค่ header `host` กับ `json()` */
function req(body: unknown) {
  return {
    headers: new Headers({ host: 'seller.deepth.local' }),
    json: async () => body,
  } as unknown as Parameters<typeof POST>[0]
}

const params = { params: Promise.resolve({ id: 'conv-1' }) }

/** แถวที่ `enqueueOutbound` คืนตามปกติ — รูปร่างเท่าที่ `withSender` ต้องใช้ */
function row(id: string) {
  return { id, senderUserId: 'user-1', rawMessage: null }
}

beforeEach(() => {
  vi.clearAllMocks()
  deliverRoom.mockImplementation(async () => 0)
})

describe('[blocker] POST /messages — enqueue ล้มกลางชุด แล้วยังต้องระบายของที่เข้าคิวไปแล้ว', () => {
  it('IMAGE_GRID: ใบที่ 2 จาก 3 โยน ⇒ deliverRoom ยังถูกเรียก (ใบที่ 1 เป็นแถว QUEUED ไปแล้ว)', async () => {
    enqueueOutbound
      .mockImplementationOnce(async () => row('m1'))
      .mockImplementationOnce(async () => {
        throw new Error('BOOM')
      })

    const res = await POST(
      req({ type: 'IMAGE_GRID', imageFileIds: ['a.jpg', 'b.jpg', 'c.jpg'] }),
      params,
    )

    // ตัว handler ยังตอบ error ตามเดิม — สิ่งที่เทสนี้กันคือ "ของที่เข้าคิวไปแล้วถูกลืม"
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(enqueueOutbound).toHaveBeenCalledTimes(2)
    expect(
      deliverRoom.mock.calls.length,
      'ใบแรกเป็นแถว QUEUED ในฐานไปแล้ว — ไม่ระบาย = ตัวกวาดยิงทีหลังทับกับที่ผู้ขายกดส่งใหม่',
    ).toBe(1)
    expect(deliverRoom).toHaveBeenCalledWith('conv-1', 'after')
  })

  it('IMAGE_GRID: caption (แถวสุดท้าย) โยน ⇒ รูปที่เข้าคิวครบแล้วยังถูกระบาย', async () => {
    enqueueOutbound
      .mockImplementationOnce(async () => row('m1'))
      .mockImplementationOnce(async () => row('m2'))
      .mockImplementationOnce(async () => {
        throw new Error('BOOM')
      })

    const res = await POST(
      req({ type: 'IMAGE_GRID', imageFileIds: ['a.jpg', 'b.jpg'], body: 'ดูรูปนี้นะคะ' }),
      params,
    )

    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(enqueueOutbound).toHaveBeenCalledTimes(3)
    expect(deliverRoom).toHaveBeenCalledTimes(1)
  })

  it('IMAGE_GRID: ใบ **แรก** โยน ⇒ ไม่ระบาย (ยังไม่มีแถวไหนเกิด — ปลุก worker มาหาของที่ไม่มีอยู่)', async () => {
    enqueueOutbound.mockImplementationOnce(async () => {
      throw new Error('BOOM')
    })

    const res = await POST(
      req({ type: 'IMAGE_GRID', imageFileIds: ['a.jpg', 'b.jpg'] }),
      params,
    )

    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(enqueueOutbound).toHaveBeenCalledTimes(1)
    expect(deliverRoom).not.toHaveBeenCalled()
  })

  it('IMAGE_GRID: ทุกใบผ่าน ⇒ ตอบ 202 และระบายหนึ่งครั้ง (กันเทสข้างบนเขียวเพราะ handler พังทุกทาง)', async () => {
    enqueueOutbound
      .mockImplementationOnce(async () => row('m1'))
      .mockImplementationOnce(async () => row('m2'))

    const res = await POST(
      req({ type: 'IMAGE_GRID', imageFileIds: ['a.jpg', 'b.jpg'] }),
      params,
    )

    expect(res.status).toBe(202)
    expect(deliverRoom).toHaveBeenCalledTimes(1)
  })

  it('ไฟล์แนบ + caption: แถว caption โยน ⇒ แถวไฟล์แนบที่เข้าคิวแล้วยังถูกระบาย', async () => {
    enqueueOutbound
      .mockImplementationOnce(async () => row('m1'))
      .mockImplementationOnce(async () => {
        throw new Error('BOOM')
      })

    const res = await POST(
      req({ type: 'IMAGE', imageUrl: 'shop-1/x.jpg', body: 'ของมาแล้วค่ะ' }),
      params,
    )

    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(enqueueOutbound).toHaveBeenCalledTimes(2)
    expect(
      deliverRoom.mock.calls.length,
      'แถวไฟล์แนบเข้าคิวไปแล้วก่อน caption จะโยน — ลืมระบาย = ลูกค้าได้ไฟล์ซ้ำจากตัวกวาด',
    ).toBe(1)
  })

  it('ไฟล์แนบ + caption: ทั้งคู่ผ่าน ⇒ ตอบ 202 และระบายหนึ่งครั้ง', async () => {
    enqueueOutbound
      .mockImplementationOnce(async () => row('m1'))
      .mockImplementationOnce(async () => row('m2'))

    const res = await POST(
      req({ type: 'IMAGE', imageUrl: 'shop-1/x.jpg', body: 'ของมาแล้วค่ะ' }),
      params,
    )

    expect(res.status).toBe(202)
    expect(deliverRoom).toHaveBeenCalledTimes(1)
  })
})
