import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * INT-1..6 ของ feature 00021 (Shop Video Showcase) — หนี้ที่ระบุไว้ใน TestCase.md
 *
 * สิ่งที่คุ้มค่าที่สุดที่จะเทสในฟีเจอร์นี้คือ **ด่านตรวจความเป็นเจ้าของใน PUT** ไม่ใช่ happy path
 * เพราะถ้าด่านนี้รั่ว ร้านจะยิง request ตรงใส่ API แล้วเอา id คลิปของคนอื่นมาแปะบนหน้าร้าน
 * ตัวเองได้ ซึ่งทำลายเหตุผลทั้งหมดของฟีเจอร์ (UI ที่ให้เลือกอย่างเดียวไม่ใช่การป้องกัน)
 *
 * และเคสที่สำคัญไม่แพ้กันคือ INT-2: **ดึงรายการจากแพลตฟอร์มไม่สำเร็จ ต้องไม่ถูกตีความว่า
 * "คลิปไม่ใช่ของร้านนี้"** — เคยเป็นบั๊กจริง (service คืน [] ตอน fetch fail → route สรุปว่า
 * ไม่มีคลิปไหนเป็นของร้าน → ตอบ 403 กล่าวหาร้านที่สุจริตทั้งที่ Meta ล่ม)
 *
 * mock ทั้งหมด ไม่ต่อ DB จริง (DB dev = prod ตัวเดียวกัน — ดู prisma-shared-db-drift.md)
 * pattern เดียวกับ src/app/api/chat/conversations/route.test.ts
 */

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))

const requireActiveShopMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/shop-context', () => ({ requireActiveShop: requireActiveShopMock }))

// vi.hoisted: vi.mock ถูก hoist ขึ้นก่อน const ปกติ — อ้าง const ธรรมดาใน factory จะชน TDZ
const svc = vi.hoisted(() => ({
  listPickableVideos: vi.fn(),
  getShopVideos: vi.fn(),
  replaceShopVideos: vi.fn(),
}))
vi.mock('@/services/shop-video.service', () => ({
  ...svc,
  MAX_SHOP_VIDEOS: 6,
}))

import { GET, PUT } from './route'
import { getServerSession } from 'next-auth'

const SHOP_ID = 'shop-1'
const USER_ID = 'user-1'

/** คลิปที่เป็นของร้านนี้จริง (มาจากบัญชีที่เชื่อมไว้) */
const OWNED = [
  { provider: 'FACEBOOK', videoId: 'fb-111', permalink: 'https://www.facebook.com/reel/111' },
  { provider: 'INSTAGRAM', videoId: 'igCode1', permalink: 'https://www.instagram.com/reel/igCode1/' },
]

function putRequest(items: unknown) {
  return new NextRequest('http://seller.deepth.local/api/shops/current/videos', {
    method: 'PUT',
    body: JSON.stringify({ items }),
    headers: { 'content-type': 'application/json' },
  })
}

function signedIn() {
  vi.mocked(getServerSession).mockResolvedValue({ user: { id: USER_ID } } as never)
  requireActiveShopMock.mockResolvedValue({ shop: { id: SHOP_ID } })
}

beforeEach(() => {
  vi.clearAllMocks()
  svc.getShopVideos.mockResolvedValue([])
  svc.replaceShopVideos.mockResolvedValue(undefined)
})

describe('PUT — ด่านตรวจความเป็นเจ้าของ (BR-V1)', () => {
  it('INT-1: คลิปที่ไม่อยู่ในบัญชีที่เชื่อมไว้ → 403 NOT_OWNED และไม่เขียนอะไรลง DB', async () => {
    signedIn()
    svc.listPickableVideos.mockResolvedValue({ items: OWNED, failed: false })

    const res = await PUT(putRequest([{ provider: 'FACEBOOK', videoId: 'ของคนอื่น-999' }]))

    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('NOT_OWNED')
    expect(svc.replaceShopVideos).not.toHaveBeenCalled()
  })

  it('INT-2: ดึงรายการจากแพลตฟอร์มไม่สำเร็จ → 503 VERIFY_UNAVAILABLE ไม่ใช่ 403', async () => {
    signedIn()
    // items ว่างเพราะ "ตรวจไม่ได้" ไม่ใช่เพราะ "ร้านไม่มีคลิป" — failed บอกความต่างนี้
    svc.listPickableVideos.mockResolvedValue({ items: [], failed: true })

    const res = await PUT(putRequest([{ provider: 'FACEBOOK', videoId: 'fb-111' }]))

    // 403 ที่ตำแหน่งนี้จะแปลว่า "คลิปนี้ไม่ใช่ของคุณ" ซึ่งเป็นการกล่าวหาร้านที่สุจริต
    expect(res.status).toBe(503)
    expect((await res.json()).code).toBe('VERIFY_UNAVAILABLE')
    expect(svc.replaceShopVideos).not.toHaveBeenCalled()
  })

  it('INT-2b: บางช่องทางถามไม่สำเร็จ แต่คลิปที่ขอมายืนยันได้ครบ → ต้องบันทึกได้ ไม่บล็อก', async () => {
    signedIn()
    svc.listPickableVideos.mockResolvedValue({ items: OWNED, failed: true })

    const res = await PUT(putRequest([{ provider: 'FACEBOOK', videoId: 'fb-111' }]))

    expect(res.status).toBe(200)
    expect(svc.replaceShopVideos).toHaveBeenCalledTimes(1)
  })

  it('INT-4: บันทึกสำเร็จ = แทนที่ทั้งชุด และส่งต่อเฉพาะคลิปที่ยืนยันแล้ว', async () => {
    signedIn()
    svc.listPickableVideos.mockResolvedValue({ items: OWNED, failed: false })

    const res = await PUT(
      putRequest([
        { provider: 'INSTAGRAM', videoId: 'igCode1' },
        { provider: 'FACEBOOK', videoId: 'fb-111' },
      ]),
    )

    expect(res.status).toBe(200)
    const [shopIdArg, itemsArg] = svc.replaceShopVideos.mock.calls[0]
    expect(shopIdArg).toBe(SHOP_ID)
    expect(itemsArg).toHaveLength(2)
    // ลำดับที่ร้านส่งมา = ลำดับที่แสดงบนหน้าร้าน ต้องไม่ถูกสลับ
    expect(itemsArg.map((i: { videoId: string }) => i.videoId)).toEqual(['igCode1', 'fb-111'])
  })

  it('INT-3: เกินจำนวนสูงสุด → ไม่บันทึก', async () => {
    signedIn()
    const many = Array.from({ length: 7 }, (_, i) => ({ provider: 'FACEBOOK', videoId: `fb-${i}` }))
    svc.listPickableVideos.mockResolvedValue({
      items: many.map((m) => ({ ...m, permalink: `https://www.facebook.com/reel/${m.videoId}` })),
      failed: false,
    })

    const res = await PUT(putRequest(many))

    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(svc.replaceShopVideos).not.toHaveBeenCalled()
  })

  it('payload ผิดรูป (ไม่มี items / provider ที่ไม่รองรับ) → 400 ไม่ถึงชั้นตรวจเจ้าของ', async () => {
    signedIn()
    svc.listPickableVideos.mockResolvedValue({ items: OWNED, failed: false })

    const bad = await PUT(putRequest([{ provider: 'MYSPACE', videoId: 'x' }]))
    expect(bad.status).toBe(400)
    expect(svc.listPickableVideos).not.toHaveBeenCalled()
  })
})

describe('ขอบเขตสิทธิ์ (INT-5, INT-6)', () => {
  it('INT-6: ไม่มี session → 401 และไม่แตะข้อมูลเลย', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null as never)

    const res = await PUT(putRequest([{ provider: 'FACEBOOK', videoId: 'fb-111' }]))

    expect(res.status).toBe(401)
    expect(requireActiveShopMock).not.toHaveBeenCalled()
    expect(svc.replaceShopVideos).not.toHaveBeenCalled()
  })

  it('INT-5: ขอบเขตร้านมาจาก session เท่านั้น — ไม่มีร้าน active → 404', async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: USER_ID } } as never)
    requireActiveShopMock.mockResolvedValue(null)

    const res = await PUT(putRequest([{ provider: 'FACEBOOK', videoId: 'fb-111' }]))

    expect(res.status).toBe(404)
    expect(svc.replaceShopVideos).not.toHaveBeenCalled()
  })

  it('INT-5b: shopId ที่ client แนบมาใน body ต้องไม่มีผล — ใช้ร้านจาก session เสมอ', async () => {
    signedIn()
    svc.listPickableVideos.mockResolvedValue({ items: OWNED, failed: false })

    const req = new NextRequest('http://seller.deepth.local/api/shops/current/videos', {
      method: 'PUT',
      body: JSON.stringify({
        shopId: 'ร้านคนอื่น',
        items: [{ provider: 'FACEBOOK', videoId: 'fb-111' }],
      }),
      headers: { 'content-type': 'application/json' },
    })
    await PUT(req)

    expect(svc.listPickableVideos).toHaveBeenCalledWith(SHOP_ID)
    expect(svc.replaceShopVideos.mock.calls[0][0]).toBe(SHOP_ID)
  })
})

describe('GET', () => {
  it('คืนคลิปที่เลือกไว้ + รายการที่เลือกได้ + เพดานจำนวน', async () => {
    signedIn()
    svc.getShopVideos.mockResolvedValue([{ id: 'v1', provider: 'FACEBOOK', videoId: 'fb-111' }])
    svc.listPickableVideos.mockResolvedValue({ items: OWNED, failed: false })

    const body = await (await GET()).json()

    expect(body.selected).toHaveLength(1)
    expect(body.available).toHaveLength(2)
    expect(body.partial).toBe(false)
    expect(body.max).toBe(6)
  })

  it('ช่องทางที่ดึงไม่สำเร็จต้องบอกออกไป ไม่ใช่เงียบเหมือนร้านไม่มีคลิป', async () => {
    signedIn()
    svc.listPickableVideos.mockResolvedValue({ items: [], failed: true })

    const body = await (await GET()).json()

    expect(body.partial).toBe(true)
  })

  it('ไม่มี session → 401', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null as never)
    expect((await GET()).status).toBe(401)
  })
})
