/**
 * GET /api/chat/conversations/{id}/preview — ฟิลด์ `shopId` (00088 แชท native เปิดห้องจากแจ้งเตือนต้องรู้ร้านของเธรด)
 *
 * ด่านสิทธิ์ (resolveConversationShopId) ไม่ได้แก้ในงานนี้ — mock เพื่อยืนยันแค่ว่า
 *  1. shopId ที่ตอบ = ร้านที่ด่านเพิ่ง resolve (ไม่ใช่ร้าน active ใน session)
 *  2. ฟิลด์เดิมของ toast เว็บไม่เปลี่ยน · 404/403 เดิมไม่มี shopId หลุดออกไป
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
const gate = vi.hoisted(() => ({ resolveConversationShopId: vi.fn() }))
vi.mock('@/lib/chat-scope', () => gate)
const svc = vi.hoisted(() => ({ getConversationToastPreview: vi.fn() }))
vi.mock('@/services/chat.service', () => svc)

import { getServerSession } from 'next-auth'
import { GET } from './route'

const ID = '11111111-1111-4111-8111-111111111111'
const call = () => GET(new Request(`http://x/api/chat/conversations/${ID}/preview`), { params: Promise.resolve({ id: ID }) })
const PREVIEW = {
  conversationId: ID,
  senderName: 'ลูกค้า',
  senderAvatarUrl: null,
  preview: 'สวัสดี',
  channel: 'LINE',
  channelName: 'ร้านทำเล็บ',
  lastMessageAt: '2026-11-01T00:00:00.000Z',
}

beforeEach(() => {
  vi.mocked(getServerSession).mockResolvedValue({ user: { id: 'u1', activeShopId: 'shop-active' } } as never)
  gate.resolveConversationShopId.mockReset()
  svc.getConversationToastPreview.mockReset()
})

describe('preview — shopId ของเธรด', () => {
  it('ตอบ shopId = ร้านของเธรดที่ด่านสิทธิ์ resolve (ไม่ใช่ร้าน active)', async () => {
    gate.resolveConversationShopId.mockResolvedValue({ scope: {}, shopId: 'shop-of-thread' })
    svc.getConversationToastPreview.mockResolvedValue(PREVIEW)
    const res = await call()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.shopId).toBe('shop-of-thread')
    expect(svc.getConversationToastPreview).toHaveBeenCalledWith(ID, 'shop-of-thread')
  })
  it('ฟิลด์เดิมที่ toast เว็บใช้ไม่เปลี่ยน', async () => {
    gate.resolveConversationShopId.mockResolvedValue({ scope: {}, shopId: 's' })
    svc.getConversationToastPreview.mockResolvedValue(PREVIEW)
    const body = await (await call()).json()
    const { shopId: _added, ...rest } = body
    expect(rest).toEqual(PREVIEW)
  })
  it('ไม่ใช่ร้านของฉัน = 404 · บทบาทไม่พอ = 403 — ไม่มี shopId หลุด', async () => {
    gate.resolveConversationShopId.mockResolvedValue(null)
    const r404 = await call()
    expect(r404.status).toBe(404)
    expect((await r404.json()).shopId).toBeUndefined()
    gate.resolveConversationShopId.mockResolvedValue({ denied: true })
    const r403 = await call()
    expect(r403.status).toBe(403)
    expect((await r403.json()).shopId).toBeUndefined()
  })
})
