/**
 * 00086 P3 T4 — route งานของช่าง: finish · assign · assign/claim · start (body) · close/outcome (actorRoles) · service-staff · photo-settings · POST /api/orders
 *
 * ด่านบทบาทเดินผ่าน requireShopCapability ตัวจริง (mock แค่ prisma + service ปลายทาง) — แบบเดียวกับ role-gates.route.test.ts
 * ตาราง error → HTTP ไล่ครบทุกรหัสใน 00086-p3-plan §1.1 ต่อทุก route ที่ต้อง map
 *
 * Mutation (รายงานใน handback):
 *   ลบแถว finish/assign/claim ใน route-capabilities → route-capability-inventory แดง
 *   ลบ branch ServiceJobNotFinishedError ใน serviceJobErrorResponse → "close · NOT_FINISHED 409" ได้ 500 แดง
 *   ลบ canClaimServiceJob ใน claim route → "CHAT ล้วน claim → 403 CLAIM_TECHNICIAN_ONLY" แดง (service mock ไม่ตรวจ)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))

const db = vi.hoisted(() => ({
  shop: { findUnique: vi.fn() },
  shopMember: { findUnique: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))

const svc = vi.hoisted(() => ({
  startServiceJob: vi.fn(),
  finishServiceJob: vi.fn(),
  closeServiceJob: vi.fn(),
  reopenServiceJob: vi.fn(),
  assignServiceJob: vi.fn(),
  unassignServiceJob: vi.fn(),
  claimServiceJob: vi.fn(),
  listServiceStaff: vi.fn(),
  updateServiceJobPhotoSettings: vi.fn(),
  createOrder: vi.fn(),
}))
vi.mock('@/services/service-job.service', () => ({
  startServiceJob: svc.startServiceJob,
  finishServiceJob: svc.finishServiceJob,
  closeServiceJob: svc.closeServiceJob,
  reopenServiceJob: svc.reopenServiceJob,
  assignServiceJob: svc.assignServiceJob,
  unassignServiceJob: svc.unassignServiceJob,
  claimServiceJob: svc.claimServiceJob,
  listServiceStaff: svc.listServiceStaff,
  updateServiceJobPhotoSettings: svc.updateServiceJobPhotoSettings,
}))
vi.mock('@/services/order.service', async (orig) => ({ ...(await orig<object>()), createOrder: svc.createOrder }))

import { getServerSession } from 'next-auth'
import { POST as startPost } from '../[token]/start/route'
import { POST as finishPost } from '../[token]/finish/route'
import { POST as assignPost, DELETE as assignDelete } from '../[token]/assign/route'
import { POST as claimPost } from '../[token]/assign/claim/route'
import { POST as closePost } from '../[token]/close/route'
import { POST as outcomePost } from '../[token]/appointment/outcome/route'
import { POST as createOrderRoute } from '../route'
import { GET as staffGet } from '@/app/api/shops/current/service-staff/route'
import { PATCH as photoPatch } from '@/app/api/shops/current/service-job-photo-settings/route'
import {
  AssigneeNotTechnicianError,
  ServiceJobAlreadyAssignedError,
  ServiceJobAlreadyClosedError,
  ServiceJobClaimTechnicianOnlyError,
  ServiceJobNotAssigneeError,
  ServiceJobNotFinishedError,
  ServiceJobNotFoundError,
  ServiceJobNotStartableError,
  ServiceJobNotStartedError,
  ServiceJobPhotoMissingError,
  ServiceJobPhotoRequiredError,
  ServiceJobPhotosDisabledError,
  ServiceJobTooManyPhotosError,
  ServiceJobUnassignedError,
} from '@/lib/service-job'
import { AppointmentFeatureUnavailableError, AppointmentNotStartedError } from '@/lib/appointments'

const SHOP = '11111111-1111-4111-8111-111111111111'
const TOKEN = 'tok-1'
const params = { params: Promise.resolve({ token: TOKEN }) }

function asRole(roles: string[], vertical = 'SERVICE_QUEUE', flags: { canCloseJob?: boolean } = {}) {
  vi.mocked(getServerSession).mockResolvedValue({ user: { id: 'u1', activeShopId: SHOP } } as never)
  const role = roles.includes('OWNER') ? 'OWNER' : 'ADMIN'
  const memberRoles = roles.includes('OWNER') ? [] : roles
  const member = { role, roles: memberRoles, canCloseJob: false, canRecordExpense: false, ...flags }
  db.shop.findUnique.mockResolvedValue({
    id: SHOP, userId: 'owner-x', kind: 'BUSINESS', vertical, deletedAt: null, packageLockedAt: null, packageLockReason: null,
    payoutBankCode: null, payoutAccountNo: null, payoutAccountName: null, payoutPromptPayId: null,
    members: [member],
  })
  db.shopMember.findUnique.mockResolvedValue(member)
}

const req = (url: string, method: string, body?: unknown) =>
  new NextRequest(`http://seller.deepth.local${url}`, {
    method,
    ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  })

beforeEach(() => {
  vi.clearAllMocks()
  svc.startServiceJob.mockResolvedValue({ serviceStartedAt: new Date('2026-10-27T03:00:00Z'), alreadyStarted: false })
  svc.finishServiceJob.mockResolvedValue({ serviceFinishedAt: new Date('2026-10-27T04:00:00Z'), alreadyFinished: false })
  svc.closeServiceJob.mockResolvedValue({ serviceClosedAt: new Date(), appointmentStatus: 'COMPLETED', money: { totalAmount: 1 } })
  svc.assignServiceJob.mockResolvedValue({ assignedUserId: 'tech-1', assigneeName: 'ช่างนิด' })
  svc.unassignServiceJob.mockResolvedValue({ assignedUserId: null })
  svc.claimServiceJob.mockResolvedValue({ assignedUserId: 'u1' })
  svc.listServiceStaff.mockResolvedValue([{ userId: 'tech-1', displayName: 'ช่างนิด' }])
  svc.updateServiceJobPhotoSettings.mockResolvedValue({ mode: 'OPTIONAL', buyerVisible: false })
  svc.createOrder.mockResolvedValue({ id: 'o1', items: [], assignedUserId: null })
})

// ─── ด่านบทบาท ───────────────────────────────────────────────────────────────────────────────
describe('ด่านบทบาทของ route ใหม่ (requireShopCapability ตัวจริง)', () => {
  const callFinish = () => finishPost(req(`/api/orders/${TOKEN}/finish`, 'POST'), params)
  const callAssign = () => assignPost(req(`/api/orders/${TOKEN}/assign`, 'POST', { userId: 'tech-1' }), params)
  const callUnassign = () => assignDelete(req(`/api/orders/${TOKEN}/assign`, 'DELETE'), params)
  const callClaim = () => claimPost(req(`/api/orders/${TOKEN}/assign/claim`, 'POST'), params)
  const callStaff = () => staffGet(req('/api/shops/current/service-staff', 'GET'))
  const callPhoto = () => photoPatch(req('/api/shops/current/service-job-photo-settings', 'PATCH', { mode: 'NONE' }))

  const cases: [string, () => Promise<Response>, Record<string, number>][] = [
    // O4
    ['finish', callFinish, { OWNER: 200, MANAGER: 200, CHAT: 200, TECHNICIAN: 200, BILLING: 403 }],
    // O2s (TD-009) — ช่างล้วนมอบงานไม่ได้
    ['assign POST', callAssign, { OWNER: 200, MANAGER: 200, CHAT: 200, BILLING: 200, TECHNICIAN: 403 }],
    ['assign DELETE', callUnassign, { OWNER: 200, MANAGER: 200, CHAT: 200, BILLING: 200, TECHNICIAN: 403 }],
    // O4 + ถือ TECHNICIAN
    ['assign/claim', callClaim, { TECHNICIAN: 200, OWNER: 403, MANAGER: 403, CHAT: 403, BILLING: 403 }],
    ['service-staff', callStaff, { OWNER: 200, MANAGER: 200, CHAT: 200, BILLING: 200, TECHNICIAN: 403 }],
    // Q2
    ['service-job-photo-settings', callPhoto, { OWNER: 200, MANAGER: 200, CHAT: 403, BILLING: 403, TECHNICIAN: 403 }],
  ]
  for (const [name, call, expected] of cases) {
    for (const [role, status] of Object.entries(expected)) {
      it(`${name} · ${role} → ${status}`, async () => {
        asRole([role])
        expect((await call()).status).toBe(status)
      })
    }
  }

  it('claim: CHAT ล้วน (มี O4 ไม่ถือช่าง) → 403 SERVICE_JOB_CLAIM_TECHNICIAN_ONLY · ไม่เรียก service', async () => {
    asRole(['CHAT'])
    const res = await callClaim()
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('SERVICE_JOB_CLAIM_TECHNICIAN_ONLY')
    expect(svc.claimServiceJob).not.toHaveBeenCalled()
  })
  it('claim: BILLING (ไม่มี O4) → 403 FORBIDDEN_ROLE', async () => {
    asRole(['BILLING'])
    expect((await (await callClaim()).json()).error).toBe('FORBIDDEN_ROLE')
  })
  it('claim: CHAT+TECHNICIAN รับได้ · ส่ง actorRoles เข้า service', async () => {
    asRole(['CHAT', 'TECHNICIAN'])
    const res = await callClaim()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ assignedUserId: 'u1' })
    expect(svc.claimServiceJob).toHaveBeenCalledWith({ shopId: SHOP, orderToken: TOKEN, actorUserId: 'u1', actorRoles: ['CHAT', 'TECHNICIAN'] })
  })
  it('service-staff ร้าน ONLINE_SALES → 200 จาก service (ซึ่งคืน [])', async () => {
    asRole(['OWNER'], 'ONLINE_SALES')
    svc.listServiceStaff.mockResolvedValue([])
    expect(await (await callStaff()).json()).toEqual({ staff: [] })
  })
  it('service-staff ?from=&to=&exclude= → ส่งช่วงเข้า service (ป้ายว่าง/ติดงาน · มติ 2026-10-30)', async () => {
    asRole(['OWNER'])
    const f = '2031-03-05T07:00:00.000Z', t = '2031-03-05T09:00:00.000Z'
    const res = await staffGet(req(`/api/shops/current/service-staff?from=${f}&to=${t}&exclude=tok-1`, 'GET'))
    expect(res.status).toBe(200)
    expect(svc.listServiceStaff).toHaveBeenCalledWith(SHOP, { window: { from: new Date(f), to: new Date(t) }, excludeToken: 'tok-1' })
  })
  it('service-staff ช่วงผิดรูป → รายชื่อแบบเดิม (ไม่ใช่ 400)', async () => {
    asRole(['OWNER'])
    const res = await staffGet(req('/api/shops/current/service-staff?from=x&to=y', 'GET'))
    expect(res.status).toBe(200)
    expect(svc.listServiceStaff).toHaveBeenCalledWith(SHOP)
  })
  // P3-T8 — ฟอร์มสร้างงานในกล่องแชทรวมหลายร้านส่ง shopId ของร้านเธรด (แบบ service-resources)
  it('service-staff ?shopId= → ใช้ร้านที่ระบุ', async () => {
    asRole(['OWNER'])
    const res = await staffGet(req(`/api/shops/current/service-staff?shopId=${SHOP}`, 'GET'))
    expect(res.status).toBe(200)
    expect(svc.listServiceStaff).toHaveBeenCalledWith(SHOP)
  })
  it('service-staff ?shopId= ร้านที่ไม่ได้เป็นสมาชิก → 403 · ไม่ถอยไปร้าน active · ไม่เรียก service', async () => {
    asRole(['OWNER'])
    db.shopMember.findUnique.mockResolvedValue(null)
    const res = await staffGet(req('/api/shops/current/service-staff?shopId=22222222-2222-4222-8222-222222222222', 'GET'))
    expect(res.status).toBe(403)
    expect(svc.listServiceStaff).not.toHaveBeenCalled()
  })
})

// ─── body / payload ─────────────────────────────────────────────────────────────────────────
describe('start / finish — body ไม่บังคับ + validation', () => {
  for (const [name, call, fn] of [
    ['start', startPost, svc.startServiceJob],
    ['finish', finishPost, svc.finishServiceJob],
  ] as const) {
    it(`${name}: ไม่มี body → เรียก service โดยไม่มีรูป · ส่ง actorRoles = ctx.roles`, async () => {
      asRole(['TECHNICIAN'])
      const res = await call(req(`/api/orders/${TOKEN}/${name}`, 'POST'), params)
      expect(res.status).toBe(200)
      expect(fn).toHaveBeenCalledWith(expect.objectContaining({ actorRoles: ['TECHNICIAN'], photoFileIds: undefined, actorUserId: 'u1' }))
    })
    it(`${name}: รูป + note → ส่งต่อ (note trim)`, async () => {
      asRole(['OWNER'])
      await call(req(`/api/orders/${TOKEN}/${name}`, 'POST', { photoFileIds: ['f1.jpg'], note: '  ล้างแล้ว ' }), params)
      expect(fn).toHaveBeenCalledWith(expect.objectContaining({ photoFileIds: ['f1.jpg'], note: 'ล้างแล้ว' }))
    })
    for (const [label, body] of [
      ['JSON เสีย', '{oops'],
      ['รูป 11 รูป', { photoFileIds: Array.from({ length: 11 }, (_, i) => `f${i}.jpg`) }],
      ['note 1001 ตัว', { note: 'ก'.repeat(1001) }],
      ['photoFileIds ไม่ใช่ array', { photoFileIds: 'f1.jpg' }],
    ] as const) {
      it(`${name}: ${label} → 400 VALIDATION_ERROR ไม่เรียก service`, async () => {
        asRole(['OWNER'])
        const res = await call(req(`/api/orders/${TOKEN}/${name}`, 'POST', body), params)
        expect(res.status).toBe(400)
        expect((await res.json()).error).toBe('VALIDATION_ERROR')
        expect(fn).not.toHaveBeenCalled()
      })
    }
  }
  it('finish response = { serviceFinishedAt, alreadyFinished } ไม่มีคีย์เงิน', async () => {
    asRole(['TECHNICIAN'])
    const body = await (await finishPost(req(`/api/orders/${TOKEN}/finish`, 'POST'), params)).json()
    expect(Object.keys(body).sort()).toEqual(['alreadyFinished', 'serviceFinishedAt'])
  })
})

describe('assign — body', () => {
  it('ไม่มี userId → 400', async () => {
    asRole(['OWNER'])
    expect((await assignPost(req(`/api/orders/${TOKEN}/assign`, 'POST', {}), params)).status).toBe(400)
    expect(svc.assignServiceJob).not.toHaveBeenCalled()
  })
  it('POST → { assignedUserId, assigneeName } · DELETE → { assignedUserId: null }', async () => {
    asRole(['BILLING'])
    expect(await (await assignPost(req(`/api/orders/${TOKEN}/assign`, 'POST', { userId: 'tech-1' }), params)).json())
      .toEqual({ assignedUserId: 'tech-1', assigneeName: 'ช่างนิด' })
    expect(await (await assignDelete(req(`/api/orders/${TOKEN}/assign`, 'DELETE'), params)).json()).toEqual({ assignedUserId: null })
  })
})

describe('close / outcome — ส่ง actorRoles เข้า closeServiceJob (ด่านช่างล้วนอยู่ใน service)', () => {
  it('close: ช่างที่ติ๊กปิดงานได้ → actorRoles [TECHNICIAN]', async () => {
    asRole(['TECHNICIAN'], 'SERVICE_QUEUE', { canCloseJob: true })
    const res = await closePost(req(`/api/orders/${TOKEN}/close`, 'POST', { outcome: 'SERVED' }), params)
    expect(res.status).toBe(200)
    expect(svc.closeServiceJob).toHaveBeenCalledWith(expect.objectContaining({ actorRoles: ['TECHNICIAN'] }))
  })
  it('outcome: actorRoles ส่งเหมือนกัน', async () => {
    asRole(['TECHNICIAN'], 'SERVICE_QUEUE', { canCloseJob: true })
    const res = await outcomePost(req(`/api/orders/${TOKEN}/appointment/outcome`, 'POST', { outcome: 'COMPLETED' }), params)
    expect(res.status).toBe(200)
    expect(svc.closeServiceJob).toHaveBeenCalledWith(expect.objectContaining({ actorRoles: ['TECHNICIAN'] }))
  })
})

// ─── ตาราง error → HTTP (plan §1.1) ─────────────────────────────────────────────────────────
describe('ตาราง error → route → HTTP (ครบทุกรหัส)', () => {
  type Route = 'start' | 'finish' | 'close' | 'outcome' | 'assign' | 'claim'
  const invoke: Record<Route, { fn: ReturnType<typeof vi.fn>; call: () => Promise<Response>; roles: string[] }> = {
    start: { fn: svc.startServiceJob, call: () => startPost(req(`/api/orders/${TOKEN}/start`, 'POST'), params), roles: ['TECHNICIAN'] },
    finish: { fn: svc.finishServiceJob, call: () => finishPost(req(`/api/orders/${TOKEN}/finish`, 'POST'), params), roles: ['TECHNICIAN'] },
    close: { fn: svc.closeServiceJob, call: () => closePost(req(`/api/orders/${TOKEN}/close`, 'POST', { outcome: 'SERVED' }), params), roles: ['OWNER'] },
    outcome: { fn: svc.closeServiceJob, call: () => outcomePost(req(`/api/orders/${TOKEN}/appointment/outcome`, 'POST', { outcome: 'COMPLETED' }), params), roles: ['OWNER'] },
    assign: { fn: svc.assignServiceJob, call: () => assignPost(req(`/api/orders/${TOKEN}/assign`, 'POST', { userId: 'x' }), params), roles: ['OWNER'] },
    claim: { fn: svc.claimServiceJob, call: () => claimPost(req(`/api/orders/${TOKEN}/assign/claim`, 'POST'), params), roles: ['TECHNICIAN'] },
  }
  const table: [string, () => Error, Route[], number, string][] = [
    ['NotAssignee', () => new ServiceJobNotAssigneeError('ช่างหน่อย', 'START'), ['start', 'finish', 'close', 'outcome'], 403, 'SERVICE_JOB_NOT_ASSIGNEE'],
    ['Unassigned', () => new ServiceJobUnassignedError(), ['start', 'finish', 'close', 'outcome'], 409, 'SERVICE_JOB_UNASSIGNED'],
    ['NotStarted', () => new ServiceJobNotStartedError(), ['finish'], 409, 'SERVICE_JOB_NOT_STARTED'],
    ['NotFinished', () => new ServiceJobNotFinishedError(), ['close', 'outcome'], 409, 'SERVICE_JOB_NOT_FINISHED'],
    ['AlreadyAssigned', () => new ServiceJobAlreadyAssignedError('ช่างนิด'), ['claim'], 409, 'SERVICE_JOB_ALREADY_ASSIGNED'],
    ['PhotoRequired', () => new ServiceJobPhotoRequiredError(), ['start', 'finish'], 400, 'SERVICE_JOB_PHOTO_REQUIRED'],
    ['PhotosDisabled', () => new ServiceJobPhotosDisabledError(), ['start', 'finish'], 400, 'SERVICE_JOB_PHOTOS_DISABLED'],
    ['PhotoMissing', () => new ServiceJobPhotoMissingError(), ['start', 'finish'], 400, 'SERVICE_JOB_PHOTO_MISSING'],
    ['TooManyPhotos', () => new ServiceJobTooManyPhotosError(), ['start', 'finish'], 400, 'SERVICE_JOB_TOO_MANY_PHOTOS'],
    ['ClaimTechnicianOnly', () => new ServiceJobClaimTechnicianOnlyError(), ['claim'], 403, 'SERVICE_JOB_CLAIM_TECHNICIAN_ONLY'],
    ['AssigneeNotTechnician', () => new AssigneeNotTechnicianError(), ['assign'], 400, 'ASSIGNEE_NOT_TECHNICIAN'],
    ['NotFound', () => new ServiceJobNotFoundError(), ['finish', 'assign', 'claim'], 404, 'SERVICE_JOB_NOT_FOUND'],
    ['AlreadyClosed', () => new ServiceJobAlreadyClosedError(), ['finish', 'assign', 'claim'], 409, 'SERVICE_JOB_ALREADY_CLOSED'],
    ['NotStartable', () => new ServiceJobNotStartableError(), ['finish'], 409, 'SERVICE_JOB_NOT_STARTABLE'],
    ['FeatureNotAvailable', () => new AppointmentFeatureUnavailableError(), ['finish', 'assign', 'claim'], 403, 'FEATURE_NOT_AVAILABLE'],
    ['AppointmentNotStarted', () => new AppointmentNotStartedError(), ['start'], 409, 'APPOINTMENT_NOT_STARTED'],
  ]
  for (const [name, make, routes, status, code] of table) {
    for (const r of routes) {
      it(`${r} · ${name} → ${status} ${code}`, async () => {
        const { fn, call, roles } = invoke[r]
        asRole(roles, 'SERVICE_QUEUE', { canCloseJob: true })
        fn.mockRejectedValueOnce(make())
        const res = await call()
        expect(res.status).toBe(status)
        const body = await res.json()
        expect(body.error).toBe(code)
        expect(typeof body.message).toBe('string')
      })
    }
  }
  it('NOT_ASSIGNEE/ALREADY_ASSIGNED แนบ assigneeName + ข้อความมีชื่อ (คำกริยาตาม action)', async () => {
    asRole(['TECHNICIAN'], 'SERVICE_QUEUE', { canCloseJob: true })
    svc.closeServiceJob.mockRejectedValueOnce(new ServiceJobNotAssigneeError('ช่างหน่อย', 'CLOSE'))
    const a = await (await invoke.close.call()).json()
    expect(a).toMatchObject({ assigneeName: 'ช่างหน่อย', message: 'งานนี้เป็นของ ช่างหน่อย · ปิดงานได้เฉพาะผู้รับผิดชอบ' })
    svc.claimServiceJob.mockRejectedValueOnce(new ServiceJobAlreadyAssignedError('ช่างนิด'))
    const b = await (await invoke.claim.call()).json()
    expect(b).toMatchObject({ assigneeName: 'ช่างนิด', message: 'มีคนรับงานนี้แล้ว · ช่างนิด' })
  })
})

// ─── POST /api/orders assignedUserId ────────────────────────────────────────────────────────
describe('POST /api/orders — assignedUserId (API §4.3)', () => {
  const body = (extra: object = {}) => ({ type: 'SERVICE', buyerContact: '0812345678', items: [{ name: 'ล้างแอร์', qty: 1, price: 500 }], ...extra })
  it('ร้านบริการ → ส่ง assignedUserId ต่อให้ createOrder', async () => {
    asRole(['OWNER'])
    const res = await createOrderRoute(req('/api/orders', 'POST', body({ assignedUserId: 'tech-1' })))
    expect(res.status).toBe(201)
    expect(svc.createOrder).toHaveBeenCalledWith(SHOP, expect.objectContaining({ assignedUserId: 'tech-1' }), expect.anything())
  })
  it('ร้านบริการ · ไม่ใช่ช่าง (service throw) → 400 ASSIGNEE_NOT_TECHNICIAN', async () => {
    asRole(['OWNER'])
    svc.createOrder.mockRejectedValueOnce(new AssigneeNotTechnicianError())
    const res = await createOrderRoute(req('/api/orders', 'POST', body({ assignedUserId: 'chat-1' })))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('ASSIGNEE_NOT_TECHNICIAN')
  })
  it('ร้านบริการ · assignedUserId ผิดชนิด → 400 ไม่เรียก createOrder', async () => {
    asRole(['OWNER'])
    expect((await createOrderRoute(req('/api/orders', 'POST', body({ assignedUserId: 42 })))).status).toBe(400)
    expect(svc.createOrder).not.toHaveBeenCalled()
  })
  it('ร้าน ONLINE_SALES → ละทิ้ง (assignedUserId undefined)', async () => {
    asRole(['OWNER'], 'ONLINE_SALES')
    await createOrderRoute(req('/api/orders', 'POST', body({ assignedUserId: 'tech-1' })))
    expect(svc.createOrder.mock.calls[0][1].assignedUserId).toBeUndefined()
  })
})
