/**
 * 00071 P3-T4 — โดเมนร้าน/ธุรกิจ/ตั้งค่า: เรียก handler จริงของแต่ละกลุ่ม × บทบาท
 * ด่านจริง (requireShopCapability + ตาราง can) ทำงานเต็ม — mock เฉพาะตัว resolve สมาชิกและ service ปลายทาง
 * "ผ่านด่าน" = status ไม่ใช่ 401/403 (handler ไปต่อถึงขั้น validate/service) · "ไม่ผ่าน" = 403 และ service ไม่ถูกเรียก
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const ctx = vi.hoisted(() => ({ role: 'OWNER' as 'OWNER' | 'ADMIN', roles: [] as string[], shopOwner: 'u1' }))
const svc = vi.hoisted(() => ({
  getVerifications: vi.fn(), updateShop: vi.fn(), cancelPkg: vi.fn(), inspection: vi.fn(),
}))
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => ({ user: { id: 'u1' } })) }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/shop-context', () => ({
  requireShopForRequest: vi.fn(async () => ({
    ok: true,
    target: {
      shop: { id: 's1', kind: 'BUSINESS', vertical: 'ONLINE_SALES', userId: ctx.shopOwner },
      kind: 'BUSINESS', role: ctx.role, roles: ctx.roles, locked: false, lockReason: null,
    },
  })),
}))
vi.mock('@/services/verification.service', () => ({ getVerifications: svc.getVerifications, submitVerification: vi.fn() }))
vi.mock('@/services/shop.service', () => ({
  updateShop: svc.updateShop, setShopSlug: vi.fn(), updateShopPayout: vi.fn(),
  PayoutForbiddenError: class extends Error {}, PayoutReauthFailedError: class extends Error {}, PayoutReauthUnavailableError: class extends Error {},
}))
vi.mock('@/services/receipt.service', () => ({ ReceiptError: class extends Error {}, updateReceiptProfile: vi.fn() }))
vi.mock('@/services/business-package.service', () => ({ cancelBusinessPackage: svc.cancelPkg }))
vi.mock('@/services/inspection-owner.service', () => ({ getInspectionForOwner: svc.inspection }))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))

import { GET as verificationGet } from '@/app/api/verification/route'
import { PATCH as shopPatch } from '@/app/api/shops/[id]/route'
import { POST as slugPost } from '@/app/api/shops/slug/route'
import { PATCH as receiptPatch } from '@/app/api/shops/receipt-profile/route'
import { PATCH as payoutPatch } from '@/app/api/shops/payout/route'
import { POST as cancelPost } from '@/app/api/business/cancel/route'
import { GET as inspectionGet } from '@/app/api/seller/inspection/route'
import { PUT as builderPut } from '@/app/api/shops/current/page-builder/route'
import { gatePage } from '@/lib/shop-capability'

const req = (body: unknown = {}) => new NextRequest('http://x/api', { method: 'POST', body: JSON.stringify(body) })
const idParams = { params: Promise.resolve({ id: 's1' }) }

type Case = { name: string; cap: string; deny?: string; call: () => Promise<Response | undefined>; service?: ReturnType<typeof vi.fn> }
const CASES: Case[] = [
  { name: 'verification GET', cap: 'T1', call: () => verificationGet(), service: svc.getVerifications },
  { name: 'shops/[id] PATCH', cap: 'T1', call: () => shopPatch(req({}), idParams as never), service: svc.updateShop },
  { name: 'shops/slug POST', cap: 'T1', call: () => slugPost(req({})) },
  { name: 'page-builder PUT', cap: 'T1', call: () => builderPut(req({})) },
  { name: 'receipt-profile PATCH', cap: 'X5', call: () => receiptPatch(req({})) },
  { name: 'payout PATCH', cap: 'T3', call: () => payoutPatch(req({})) },
  { name: 'business/cancel POST', cap: 'T4', call: () => cancelPost(), service: svc.cancelPkg },
  { name: 'inspection GET', cap: 'T4', deny: 'NOT_OWNER', call: () => inspectionGet(new NextRequest('http://x/api')), service: svc.inspection },
]

// เจ้าของหลัก = shop.userId ตรงผู้ใช้ · เจ้าของร่วม = role OWNER แต่ shop.userId เป็นคนอื่น
const ACTORS: { who: string; set: () => void; allow: Record<string, boolean> }[] = [
  { who: 'เจ้าของหลัก', set: () => Object.assign(ctx, { role: 'OWNER', roles: [], shopOwner: 'u1' }), allow: { T1: true, X5: true, T3: true, T4: true } },
  { who: 'เจ้าของร่วม', set: () => Object.assign(ctx, { role: 'OWNER', roles: [], shopOwner: 'other' }), allow: { T1: true, X5: true, T3: true, T4: false } },
  { who: 'ผู้ดูแล', set: () => Object.assign(ctx, { role: 'ADMIN', roles: ['MANAGER'], shopOwner: 'other' }), allow: { T1: true, X5: true, T3: false, T4: false } },
  { who: 'ตอบแชท', set: () => Object.assign(ctx, { role: 'ADMIN', roles: ['CHAT'], shopOwner: 'other' }), allow: { T1: false, X5: false, T3: false, T4: false } },
  { who: 'เปิดบิล', set: () => Object.assign(ctx, { role: 'ADMIN', roles: ['BILLING'], shopOwner: 'other' }), allow: { T1: false, X5: false, T3: false, T4: false } },
  { who: 'ฝ่ายช่าง', set: () => Object.assign(ctx, { role: 'ADMIN', roles: ['TECHNICIAN'], shopOwner: 'other' }), allow: { T1: false, X5: false, T3: false, T4: false } },
]

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  Object.values(svc).forEach((f) => f.mockReset().mockResolvedValue([]))
})

describe.each(CASES)('$name (cap $cap)', ({ cap, call, service, deny }) => {
  it.each(ACTORS)('$who', async ({ set, allow }) => {
    set()
    const res = await call().catch(() => null)
    if (allow[cap]) {
      // ผ่านด่าน: ไปต่อถึง validate/service (อาจเป็น 200/400/404 ฯลฯ) — แค่ต้องไม่ถูกปฏิเสธเรื่องสิทธิ์
      expect(!res || (res.status !== 401 && res.status !== 403)).toBe(true)
    } else {
      expect(res?.status).toBe(403)
      // รูป error ต่างกันตามชุด: flat string (ส่วนใหญ่) · { error: { code } } (page-builder) · NOT_OWNER (inspection)
      const e = (await res!.json()).error
      const code = typeof e === 'string' ? e : e.code
      expect(code).toMatch(/^(FORBIDDEN|NOT_OWNER)/)
      if (deny) expect(code).toBe(deny) // ชุดที่ UI อ่านรหัสเฉพาะ ต้องคงรหัสเดิม
      if (service) expect(service).not.toHaveBeenCalled()
    }
  })
})

// หน้า (RSC) ตัดสินด้วย gatePage ตัวเดียวกับ API — ค่า cap ตรงตามที่หน้าเรียก (settings = S2 ตามมติ C-2 ไม่ใช่ T3)
describe('gatePage ของหน้าโดเมนร้าน', () => {
  const sess = { user: { id: 'u1' } }
  const ok = async (cap: Parameters<typeof gatePage>[1]) => (await gatePage(sess, cap)).ok
  it('settings (S2): ผู้ดูแลผ่าน · ตอบแชท/เปิดบิล/ช่างไม่ผ่าน', async () => {
    Object.assign(ctx, { role: 'ADMIN', roles: ['MANAGER'], shopOwner: 'other' })
    expect(await ok('S2')).toBe(true)
    for (const r of ['CHAT', 'BILLING', 'TECHNICIAN']) {
      Object.assign(ctx, { role: 'ADMIN', roles: [r] })
      expect(await ok('S2'), r).toBe(false)
    }
  })
  it('admins/invites (T2) เจ้าของเท่านั้น · subscriptions/inspection/line-reports (T4) เจ้าของหลักเท่านั้น', async () => {
    Object.assign(ctx, { role: 'ADMIN', roles: ['MANAGER'], shopOwner: 'other' })
    expect(await ok('T2')).toBe(false)
    Object.assign(ctx, { role: 'OWNER', roles: [], shopOwner: 'other' })
    expect(await ok('T2')).toBe(true)
    expect(await ok('T4')).toBe(false)
    ctx.shopOwner = 'u1'
    expect(await ok('T4')).toBe(true)
  })
})
