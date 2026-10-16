import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
const scopeMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/chat-scope', async (orig) => ({ ...(await orig<typeof import('@/lib/chat-scope')>()), resolveChatScope: scopeMock }))

import { GET } from './route'
import { getServerSession } from 'next-auth'
import { presenceKeyFor } from '@/lib/chat-desk/presence-key'

beforeEach(() => {
  vi.clearAllMocks()
  process.env.NEXTAUTH_SECRET = 'route-test-secret'
  vi.mocked(getServerSession).mockResolvedValue({ user: { id: 'u1', activeShopId: 's1' } } as never)
  scopeMock.mockResolvedValue({ shopIds: ['s1', 's2'] })
})

describe('GET /api/chat/presence-keys', () => {
  it('401 ไม่รู้ว่าเป็นใคร', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null)
    expect((await GET()).status).toBe(401)
  })

  it('200 คีย์ของผู้เรียกทุกร้านในขอบเขต H1 · ไม่มี userId ในคีย์ · no-store (AC-CD-30)', async () => {
    const r = await GET()
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body).toEqual({ keys: [{ shopId: 's1', key: presenceKeyFor('s1', 'u1') }, { shopId: 's2', key: presenceKeyFor('s2', 'u1') }] })
    expect(scopeMock).toHaveBeenCalledWith({ user: { id: 'u1', activeShopId: 's1' } }, 'H1')
    expect(JSON.stringify(body)).not.toContain('"u1"')
    expect(r.headers.get('cache-control')).toBe('private, no-store, max-age=0, must-revalidate')
  })

  it('403 FORBIDDEN_ROLE เมื่อมีร้านแต่ไม่ถือ H1 (BILLING ล้วน) · 404 เมื่อ resolve ร้านไม่ได้', async () => {
    scopeMock.mockResolvedValueOnce({ shopIds: [] })
    const r = await GET()
    expect(r.status).toBe(403)
    expect(await r.json()).toEqual({ error: 'FORBIDDEN_ROLE' })
    scopeMock.mockResolvedValueOnce(null)
    expect((await GET()).status).toBe(404)
  })

  it('NEXTAUTH_SECRET ขาด → 500 INTERNAL', async () => {
    delete process.env.NEXTAUTH_SECRET
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await GET()
    expect(r.status).toBe(500)
    expect(await r.json()).toEqual({ error: 'INTERNAL' })
  })
})
