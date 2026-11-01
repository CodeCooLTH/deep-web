/**
 * GET /api/chat/conversations/{id}/thread-state — ด่านสิทธิ์เดียวกับ /preview (00088 แชท Native)
 * ร้าน = ร้านของเธรดที่ด่าน H1 resolve (ไม่ใช่ร้าน active) · 401/400/404/403 ไม่มีข้อมูลหลุด
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
const gate = vi.hoisted(() => ({ resolveConversationShopId: vi.fn() }))
vi.mock('@/lib/chat-scope', () => gate)
const svc = vi.hoisted(() => ({ getNativeThreadState: vi.fn() }))
vi.mock('@/services/chat-thread-state.service', () => svc)

import { getServerSession } from 'next-auth'
import { GET } from './route'

const ID = '11111111-1111-4111-8111-111111111111'
const call = (id = ID) => GET(new Request(`http://x/api/chat/conversations/${id}/thread-state`), { params: Promise.resolve({ id }) })

beforeEach(() => {
  vi.mocked(getServerSession).mockResolvedValue({ user: { id: 'u1', activeShopId: 'shop-active' } } as never)
  gate.resolveConversationShopId.mockReset()
  svc.getNativeThreadState.mockReset()
})

describe('thread-state', () => {
  it('ไม่ล็อกอิน = 401 · id ไม่ใช่ uuid = 400 · ไม่เรียก service', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null as never)
    expect((await call()).status).toBe(401)
    expect((await call('abc')).status).toBe(400)
    expect(svc.getNativeThreadState).not.toHaveBeenCalled()
  })
  it('ใช้ร้านของเธรด + ผู้ใช้จาก session · no-store', async () => {
    gate.resolveConversationShopId.mockResolvedValue({ scope: {}, shopId: 'shop-of-thread' })
    svc.getNativeThreadState.mockResolvedValue({ shopId: 'shop-of-thread', tokenInvalid: true })
    const res = await call()
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toContain('no-store')
    expect(svc.getNativeThreadState).toHaveBeenCalledWith(ID, 'shop-of-thread', 'u1')
    expect((await res.json()).tokenInvalid).toBe(true)
  })
  it('ไม่ใช่ร้านของฉัน = 404 · บทบาทไม่พอ = 403 · service null = 404', async () => {
    gate.resolveConversationShopId.mockResolvedValue(null)
    expect((await call()).status).toBe(404)
    gate.resolveConversationShopId.mockResolvedValue({ denied: true })
    expect((await call()).status).toBe(403)
    gate.resolveConversationShopId.mockResolvedValue({ scope: {}, shopId: 's' })
    svc.getNativeThreadState.mockResolvedValue(null)
    expect((await call()).status).toBe(404)
  })
})
