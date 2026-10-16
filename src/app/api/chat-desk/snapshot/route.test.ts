import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))
vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
const listMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/shop-capability', () => ({ listAccessibleShopIds: listMock }))
const svc = vi.hoisted(() => ({ getDeskSnapshot: vi.fn(), sortShopIdsByName: vi.fn() }))
vi.mock('@/services/chat-desk.service', () => svc)

import { GET } from './route'
import { getServerSession } from 'next-auth'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const SNAP = { v: 1, shop: { id: A }, rooms: [] }
const req = (qs = '') => new NextRequest(`http://seller.deepth.local:4000/api/chat-desk/snapshot${qs}`)

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getServerSession).mockResolvedValue({ user: { id: 'u1', activeShopId: A } } as never)
  listMock.mockResolvedValue([A])
  svc.getDeskSnapshot.mockResolvedValue({ snapshot: SNAP, timings: { directory: 1, rooms: 2, daily: 3 } })
  svc.sortShopIdsByName.mockImplementation(async (ids: string[]) => [...ids].sort())
})

describe('GET /api/chat-desk/snapshot', () => {
  it('401 ไม่มี session / มี session แต่ไม่มี id (AC-CD-21)', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null)
    expect((await GET(req())).status).toBe(401)
    vi.mocked(getServerSession).mockResolvedValueOnce({ user: {} } as never)
    const r = await GET(req())
    expect(r.status).toBe(401)
    expect(await r.json()).toEqual({ error: 'unauthorized' })
    expect(listMock).not.toHaveBeenCalled()
  })

  it('200 เจ้าของ · ด่านใช้ cap X7 literal · no-store · Server-Timing ครบ 4 ช่วง (M-2)', async () => {
    const r = await GET(req())
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual(SNAP)
    expect(listMock).toHaveBeenCalledWith('u1', 'X7')
    expect(r.headers.get('cache-control')).toBe('private, no-store, max-age=0, must-revalidate')
    expect(r.headers.get('server-timing')).toMatch(/^guard;dur=[\d.]+, directory;dur=1.0, rooms;dur=2.0, daily;dur=3.0$/)
    expect(svc.getDeskSnapshot).toHaveBeenCalledWith(A, { platforms: [], pages: [], admins: [] })
  })

  it('403 FORBIDDEN_ROLE ADMIN (ไม่ถือ X7 ร้านใดเลย) — body ไม่มีข้อมูล และไม่แตะ service', async () => {
    listMock.mockResolvedValue([])
    const r = await GET(req())
    expect(r.status).toBe(403)
    expect(await r.json()).toEqual({ error: 'FORBIDDEN_ROLE' })
    expect(svc.getDeskSnapshot).not.toHaveBeenCalled()
  })

  it('403 ขอ shopId ที่ตนไม่ใช่เจ้าของ (OWNER ร้าน A, ADMIN ร้าน B) — ไม่ fallback ไปร้านอื่น (AC-CD-23)', async () => {
    const r = await GET(req(`?shopId=${B}`))
    expect(r.status).toBe(403)
    expect(svc.getDeskSnapshot).not.toHaveBeenCalled()
  })

  it('สลับ OWNER → ADMIN ระหว่างสองคำขอ: คำขอที่สองต้อง 403 (ตรวจสด ไม่ cache สิทธิ์ · AC-CD-24)', async () => {
    expect((await GET(req())).status).toBe(200)
    listMock.mockResolvedValue([])
    expect((await GET(req())).status).toBe(403)
  })

  it('400 INVALID_QUERY เมื่อ shopId ไม่ใช่ uuid · ตัวกรองผิดรูปถูกทิ้งเงียบ ไม่ 400', async () => {
    const bad = await GET(req('?shopId=nope'))
    expect(bad.status).toBe(400)
    expect(await bad.json()).toEqual({ error: 'INVALID_QUERY' })
    const ok = await GET(req('?platforms=XX,LINE&pages=zzz&admins=,,'))
    expect(ok.status).toBe(200)
    expect(svc.getDeskSnapshot).toHaveBeenLastCalledWith(A, { platforms: ['LINE'], pages: [], admins: [] })
  })

  it('หลายร้าน: ไม่ขอ + active ไม่ใช่ร้านเจ้าของ → ร้านแรกตามชื่อ', async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: 'u1', activeShopId: 'other' } } as never)
    listMock.mockResolvedValue([B, A])
    await GET(req())
    expect(svc.sortShopIdsByName).toHaveBeenCalled()
    expect(svc.getDeskSnapshot).toHaveBeenCalledWith(A, expect.anything())
  })

  it('service คืน null → 403 · service throw → 500 INTERNAL (ไม่รั่วข้อความ error)', async () => {
    svc.getDeskSnapshot.mockResolvedValueOnce(null)
    expect((await GET(req())).status).toBe(403)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    svc.getDeskSnapshot.mockRejectedValueOnce(new Error('secret db detail'))
    const r = await GET(req())
    expect(r.status).toBe(500)
    expect(await r.json()).toEqual({ error: 'INTERNAL' })
  })
})
