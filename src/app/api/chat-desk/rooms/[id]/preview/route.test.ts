import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))
vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
const listMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/shop-capability', () => ({ listAccessibleShopIds: listMock }))
const svc = vi.hoisted(() => ({ getRoomPreview: vi.fn() }))
vi.mock('@/services/chat-desk.service', () => svc)

import { GET } from './route'
import { getServerSession } from 'next-auth'

const ROOM = '33333333-3333-4333-8333-333333333333'
const PREVIEW = { room: { id: ROOM }, messages: [], truncated: false }
const call = (id = ROOM) =>
  GET(new NextRequest(`http://seller.deepth.local:4000/api/chat-desk/rooms/${id}/preview`), { params: Promise.resolve({ id }) })

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getServerSession).mockResolvedValue({ user: { id: 'u1' } } as never)
  listMock.mockResolvedValue(['s1'])
  svc.getRoomPreview.mockResolvedValue(PREVIEW)
})

describe('GET /api/chat-desk/rooms/[id]/preview', () => {
  it('401 ไม่รู้ว่าเป็นใคร', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce({ user: {} } as never)
    expect((await call()).status).toBe(401)
  })

  it('200 · scope ห้องด้วยร้านที่ถือ X7 · no-store', async () => {
    const r = await call()
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual(PREVIEW)
    expect(listMock).toHaveBeenCalledWith('u1', 'X7')
    expect(svc.getRoomPreview).toHaveBeenCalledWith(['s1'], ROOM)
    expect(r.headers.get('cache-control')).toBe('private, no-store, max-age=0, must-revalidate')
  })

  it('404 (ไม่ใช่ 403): ADMIN ไม่มีร้านเจ้าของ · ห้องร้านอื่น/ไม่มีห้อง — ไม่ยืนยันว่าห้องมีอยู่ (AC-CD-26)', async () => {
    listMock.mockResolvedValue([])
    const admin = await call()
    expect(admin.status).toBe(404)
    expect(await admin.json()).toEqual({ error: 'NOT_FOUND' })
    expect(svc.getRoomPreview).not.toHaveBeenCalled()
    listMock.mockResolvedValue(['s1'])
    svc.getRoomPreview.mockResolvedValue(null)
    expect((await call()).status).toBe(404)
  })

  it('400 INVALID_ID เมื่อ id ไม่ใช่ uuid · 500 INTERNAL เมื่อ service ล้ม', async () => {
    const bad = await call('not-a-uuid')
    expect(bad.status).toBe(400)
    expect(await bad.json()).toEqual({ error: 'INVALID_ID' })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    svc.getRoomPreview.mockRejectedValueOnce(new Error('boom'))
    expect((await call()).status).toBe(500)
  })
})
