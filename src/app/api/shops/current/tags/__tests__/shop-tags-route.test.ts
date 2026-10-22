/** 00083 — เทสชั้น route ของ tags (TC-050 static · TC-053..055) · service/gate mock ไม่แตะ DB */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ShopTagError, type ShopTagErrorCode } from '@/services/shop-tag.service'

const h = vi.hoisted(() => ({
  gate: { ok: true, shopId: 'shop1', userId: 'u1', active: { locked: false }, roles: ['OWNER'] } as Record<string, unknown>,
  svc: vi.fn(),
}))
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => ({})) }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/shop-capability', () => ({ requireShopCapability: vi.fn(async () => h.gate) }))
vi.mock('@/services/shop-tag.service', async () => {
  const actual = await vi.importActual<typeof import('@/services/shop-tag.service')>('@/services/shop-tag.service')
  return {
    ...actual,
    listShopTags: (...a: unknown[]) => h.svc('list', ...a),
    createShopTag: (...a: unknown[]) => h.svc('create', ...a),
    updateShopTag: (...a: unknown[]) => h.svc('update', ...a),
    deleteShopTag: (...a: unknown[]) => h.svc('delete', ...a),
  }
})

import * as coll from '../route'
import * as item from '../[tagId]/route'
import { SHOP_TAG_ERRORS } from '@/lib/shop-tag-route-errors'

const ID = '6c1e4f2a-1b2c-4d3e-8f4a-5b6c7d8e9f01'
const req = (method: string, body?: unknown) =>
  new Request('http://seller.deepth.local/api/shops/current/tags', {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as never
const ctx = (tagId = ID) => ({ params: Promise.resolve({ tagId }) })

beforeEach(() => {
  h.svc.mockReset()
  h.gate = { ok: true, shopId: 'shop1', userId: 'u1', active: { locked: false }, roles: ['OWNER'] }
})

describe('TC-053 map error', () => {
  it.each(Object.entries(SHOP_TAG_ERRORS))('%s → status ตามตาราง + no-store + message ไทย', async (code, m) => {
    h.svc.mockRejectedValue(new ShopTagError(code as ShopTagErrorCode))
    const res = await coll.POST(req('POST', { name: 'vip' }))
    expect(res.status).toBe(m.status)
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    expect(await res.json()).toEqual({ error: code, message: m.message })
  })
  it('error ไม่รู้จัก → 500 INTERNAL_ERROR ไม่ echo ข้อความ', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    h.svc.mockRejectedValue(new Error('secret db detail'))
    const res = await coll.GET()
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'INTERNAL_ERROR' })
  })
})

describe('TC-054 gate + validation', () => {
  it('gate ไม่ผ่าน → คืน response ของด่าน ไม่เรียก service', async () => {
    h.gate = { ok: false, response: Response.json({ error: 'FORBIDDEN_ROLE' }, { status: 403 }) }
    expect((await coll.POST(req('POST', { name: 'x' }))).status).toBe(403)
    expect((await item.DELETE(req('DELETE'), ctx())).status).toBe(403)
    expect(h.svc).not.toHaveBeenCalled()
  })
  it('ร้านล็อก → 403 SHOP_LOCKED ทุกเมธอดเขียน ก่อนอ่าน body · GET ยังอ่านได้', async () => {
    h.gate = { ...h.gate, active: { locked: true } }
    for (const res of [await coll.POST(req('POST', { name: 'x' })), await item.PATCH(req('PATCH', { name: 'x' }), ctx()), await item.DELETE(req('DELETE'), ctx())]) {
      expect(res.status).toBe(403)
      expect((await res.json()).error).toBe('SHOP_LOCKED')
    }
    h.svc.mockResolvedValue({ tags: [] })
    expect((await coll.GET()).status).toBe(200)
  })
  it.each([
    ['ชื่อว่าง', { name: '  ' }],
    ['คีย์เกิน shopId', { name: 'vip', shopId: 'other' }],
    ['คำสั้นเกิน', { name: 'vip', keywords: ['ก'] }],
    ['คำเกิน 50', { name: 'vip', keywords: Array.from({ length: 51 }, (_, i) => `คำที่${i}x`) }],
  ])('POST %s → 400 VALIDATION_ERROR + issues', async (_n, body) => {
    const res = await coll.POST(req('POST', body))
    expect(res.status).toBe(400)
    const j = await res.json()
    expect(j.error).toBe('VALIDATION_ERROR')
    expect(j.issues.length).toBeGreaterThan(0)
    expect(h.svc).not.toHaveBeenCalled()
  })
  it('POST body ไม่ใช่ JSON → 400', async () => {
    const r = new Request('http://x/', { method: 'POST', body: 'not json' }) as never
    expect((await coll.POST(r)).status).toBe(400)
  })
  it('PATCH body ว่าง {} → 400', async () => {
    expect((await item.PATCH(req('PATCH', {}), ctx())).status).toBe(400)
  })
})

describe('TC-055 สำเร็จ + ใช้ shopId จาก gate', () => {
  it('POST 201 + default ของ input ถูกส่งต่อ', async () => {
    h.svc.mockResolvedValue({ id: ID, shopId: 'shop1', name: 'vip', nameKey: 'vip', keywords: [], removeOnOrderCreate: false, createdByUserId: 'u1', createdAt: new Date('2026-10-21T00:00:00Z') })
    const res = await coll.POST(req('POST', { name: ' vip ' }))
    expect(res.status).toBe(201)
    // คอลัมน์ภายในต้องไม่หลุดไปถึง client
    expect(await res.json()).toEqual({ tag: { id: ID, name: 'vip', registered: true, keywords: [], removeOnOrderCreate: false, createdAt: '2026-10-21T00:00:00.000Z' } })
    expect(h.svc).toHaveBeenCalledWith('create', 'shop1', 'u1', { name: 'vip', keywords: [], removeOnOrderCreate: false })
  })
  it('PATCH 200 ส่ง shopId จาก gate เสมอ', async () => {
    h.svc.mockResolvedValue({ tag: { id: ID, shopId: 'shop1', name: 'vip', nameKey: 'vip', keywords: [], removeOnOrderCreate: true, createdAt: new Date('2026-10-21T00:00:00Z') }, renamedRooms: 2 })
    const res = await item.PATCH(req('PATCH', { removeOnOrderCreate: true }), ctx())
    expect(res.status).toBe(200)
    expect(h.svc).toHaveBeenCalledWith('update', 'shop1', ID, { removeOnOrderCreate: true })
  })
  it('tagId ไม่ใช่ uuid → 404 TAG_NOT_FOUND ไม่เรียก service', async () => {
    const res = await item.DELETE(req('DELETE'), ctx('abc'))
    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe('TAG_NOT_FOUND')
    expect(h.svc).not.toHaveBeenCalled()
  })
  it('DELETE 200 { ok, removedFromRooms }', async () => {
    h.svc.mockResolvedValue({ removedFromRooms: 3 })
    const res = await item.DELETE(req('DELETE'), ctx())
    expect(await res.json()).toEqual({ ok: true, removedFromRooms: 3 })
  })
})

describe('TC-050 static: ทุก code ที่ service โยนมีใน map', () => {
  it("throw new ShopTagError('X') ทุกจุดมี X ใน SHOP_TAG_ERRORS", () => {
    const src = readFileSync(join(process.cwd(), 'src/services/shop-tag.service.ts'), 'utf8')
    const codes = [...src.matchAll(/new ShopTagError\('([A-Z_]+)'\)/g)].map((m) => m[1])
    expect(codes.length).toBeGreaterThan(0)
    for (const c of codes) expect(SHOP_TAG_ERRORS, c).toHaveProperty(c)
  })
})
