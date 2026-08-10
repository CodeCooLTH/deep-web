/**
 * [blocker] POST /api/orders/[token]/slip ต้องรับ body ทั้งแบบ JSON `{fileId}` และ multipart
 *
 * ที่มา 2026-08-10: ฝั่งผู้จอง (`BookingGuestView.tsx`) ย้ายไป direct upload ตั้งแต่ `3a1650ae`
 * แล้วส่ง JSON มา แต่ route เรียก `request.formData()` อย่างเดียว → throw ทุกครั้ง → 500 →
 * หน้าจอขึ้นแค่ "แนบสลิปไม่สำเร็จ ลองอีกครั้ง" ⇒ **ผู้จองแนบสลิปไม่ได้ 100%**
 *
 * ทำไมต้องเป็นเทส: ไม่มี gate ไหนของโปรเจกต์เห็น — `tsc`/build ผ่านหมดเพราะทั้งสองฝั่ง
 * "ถูก" ในตัวเอง (client ส่ง JSON ถูกต้อง · route parse multipart ถูกต้อง) สิ่งที่ผิดคือ
 * **ทั้งคู่ไม่ได้คุยกัน** — คลาสเดียวกับ `docs/conventions/external-payload-schema.md`
 *
 * 🛑 แดง = ทางใดทางหนึ่งขาดไป ห้าม merge
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const BUYER_ID = 'user_buyer_1'
const TOKEN = 'tok_abc'

const getServerSession = vi.fn()
const findUnique = vi.fn()
const attachSlip = vi.fn()
const getFileMeta = vi.fn()
const saveFile = vi.fn()
const deleteFile = vi.fn()
const validateUpload = vi.fn()

vi.mock('next-auth', () => ({ getServerSession: (...a: unknown[]) => getServerSession(...a) }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/prisma', () => ({ prisma: { order: { findUnique: (...a: unknown[]) => findUnique(...a) } } }))
vi.mock('@/services/order.service', () => ({ attachSlip: (...a: unknown[]) => attachSlip(...a) }))
vi.mock('@/lib/storage', () => ({
  getFileMeta: (...a: unknown[]) => getFileMeta(...a),
  saveFile: (...a: unknown[]) => saveFile(...a),
  deleteFile: (...a: unknown[]) => deleteFile(...a),
  validateUpload: (...a: unknown[]) => validateUpload(...a),
}))

// import หลัง vi.mock เสมอ (hoisting ของ vitest ครอบ vi.mock แต่ไม่ครอบ import ที่ผูก mock)
const { POST } = await import('../route')

type Body = BodyInit | null
function post(body: Body, headers: Record<string, string> = {}) {
  const req = new Request(`https://x.test/api/orders/${TOKEN}/slip`, { method: 'POST', body, headers })
  return POST(req as never, { params: Promise.resolve({ token: TOKEN }) })
}

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { id: BUYER_ID } })
  findUnique.mockResolvedValue({ buyerUserId: BUYER_ID })
  attachSlip.mockImplementation(async (_t: string, fileId: string) => ({ slipFileId: fileId }))
  getFileMeta.mockResolvedValue({ size: 1024, ext: 'jpg' })
})

describe('POST /api/orders/[token]/slip', () => {
  it('รับ JSON { fileId } จาก direct upload แล้วผูกกับออเดอร์', async () => {
    const res = await post(JSON.stringify({ fileId: 'file_1.jpg' }), {
      'content-type': 'application/json',
    })

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ slipFileId: 'file_1.jpg' })
    expect(attachSlip).toHaveBeenCalledWith(TOKEN, 'file_1.jpg')
    // ต้องไม่แตะ saveFile — ไฟล์ขึ้น storage ไปแล้วตั้งแต่ขั้น commit
    expect(saveFile).not.toHaveBeenCalled()
  })

  it('ยังรับ multipart ได้เหมือนเดิม (OrderDetailMobile ยังไม่ย้าย)', async () => {
    saveFile.mockResolvedValue('file_2.jpg')
    const fd = new FormData()
    fd.set('file', new File(['x'], 'slip.jpg', { type: 'image/jpeg' }))

    const res = await post(fd)

    expect(res.status).toBe(200)
    expect(saveFile).toHaveBeenCalledOnce()
    expect(attachSlip).toHaveBeenCalledWith(TOKEN, 'file_2.jpg')
  })

  it('fileId ที่ไม่มีไฟล์อยู่จริงบน storage → 404 ไม่ผูกเข้าออเดอร์', async () => {
    getFileMeta.mockResolvedValue(null)

    const res = await post(JSON.stringify({ fileId: 'file_ghost.jpg' }), {
      'content-type': 'application/json',
    })

    expect(res.status).toBe(404)
    expect(attachSlip).not.toHaveBeenCalled()
  })

  it('JSON ที่ไม่มี fileId → 400 (ไม่ตกไปทาง multipart จนกลายเป็น 500)', async () => {
    const res = await post(JSON.stringify({}), { 'content-type': 'application/json' })

    expect(res.status).toBe(400)
    expect(attachSlip).not.toHaveBeenCalled()
  })

  it('ออเดอร์ของคนอื่น → 403 ก่อนแตะ body', async () => {
    findUnique.mockResolvedValue({ buyerUserId: 'user_other' })

    const res = await post(JSON.stringify({ fileId: 'file_1.jpg' }), {
      'content-type': 'application/json',
    })

    expect(res.status).toBe(403)
    expect(attachSlip).not.toHaveBeenCalled()
  })

  it('attachSlip ล้ม (ออเดอร์ไม่ใช่ PENDING) → 400 และ **ไม่ลบไฟล์** ของผู้ใช้ทิ้ง', async () => {
    attachSlip.mockRejectedValue(new Error('แนบสลิปได้เฉพาะคำสั่งซื้อที่รอดำเนินการ'))

    const res = await post(JSON.stringify({ fileId: 'file_1.jpg' }), {
      'content-type': 'application/json',
    })

    expect(res.status).toBe(400)
    // ไฟล์ไม่ได้เกิดจากคำขอนี้ — ลบทิ้งคือทำลายไฟล์ที่ผู้ใช้อาจแนบไว้ที่อื่นแล้ว
    expect(deleteFile).not.toHaveBeenCalled()
  })
})
