/**
 * expense-staff.db.test.ts — 00086 FR-018/019 "ค่าใช้จ่ายของฉัน" ของพนักงานร้านบริการ บน Postgres จริง
 *
 * - ด่าน resolveStaffExpenseAccess: ร้านบริการ ∧ ADMIN ∧ ธง canRecordExpense เท่านั้น (เจ้าของ/ไม่มีธง/ร้านออนไลน์ = ปฏิเสธ)
 * - route /api/expenses/mine* เดินตัวจริงทั้งเส้น (mock แค่ getServerSession) — คืนเฉพาะแถวของตัวเอง · แถวคนอื่น = 404
 * - HR16: แถวที่พนักงานบันทึกไหลเข้า listExpenses ของเจ้าของ + ยอดค่าใช้จ่ายใน P&L / กราฟรายงานร้านบริการ เหมือนแถวเจ้าของ
 *
 * 🛑 HR13/HR14: รันเฉพาะ DATABASE_URL = localhost:5434 · ลบเฉพาะ id ที่เทสสร้าง (ไม่มี deleteMany เปล่า)
 * mutation ที่ต้องแดง: ตัดเงื่อนไข createdByUserId ออกจาก listExpenses / updateOwnExpense / deleteOwnExpense
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { NextRequest } from 'next/server'

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
// after() ของ Next รันได้เฉพาะใน request scope จริง — route ยิงแจ้งเตือนเจ้าของ (FR-020) ผ่าน after()
// ไฟล์นี้ทดสอบเรื่องสิทธิ์/ข้อมูลค่าใช้จ่าย จึงตัดงานเบื้องหลังทิ้ง (แจ้งเตือนทดสอบใน staff-expense-notify.db.test.ts)
vi.mock('next/server', async (orig) => ({ ...(await orig<typeof import('next/server')>()), after: () => {} }))

import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { resolveStaffExpenseAccess } from '@/services/expense-access.service'
import { listExpenses, serializeExpense } from '@/services/expense.service'
import { getPnlReport } from '@/services/pnl.service'
import { expenseBuckets } from '@/services/service-report.service'
import { resolveDateRange } from '@/lib/date-range'
import { GET as mineGet, POST as minePost } from '@/app/api/expenses/mine/route'
import { PATCH as minePatch, DELETE as mineDelete } from '@/app/api/expenses/mine/[id]/route'

const url = process.env.DATABASE_URL ?? ''
const isLocal = /@(localhost|127\.0\.0\.1):5434\//.test(url)
const d = isLocal ? describe : describe.skip
const run = randomUUID().slice(0, 8)

const ids = { users: [] as string[], shops: [] as string[], members: [] as string[] }
const f: Record<string, string> = {}

// วันที่คงที่ในอดีต — ร้านเพิ่งสร้างจึงไม่มีแถวอื่นในช่วงนี้ (ยอดรวมตรวจได้เป๊ะ)
const DAY = '2026-03-15'
const sessionOf = (userId: string, shopId: string) => ({ user: { id: userId, activeShopId: shopId } })
const as = (userId: string, shopId: string) => vi.mocked(getServerSession).mockResolvedValue(sessionOf(userId, shopId) as never)
const req = (path: string, init?: { method?: string; body?: unknown }) =>
  new NextRequest(`http://localhost${path}`, {
    method: init?.method ?? 'GET',
    ...(init?.body !== undefined ? { body: JSON.stringify(init.body), headers: { 'content-type': 'application/json' } } : {}),
  })
const idParams = (id: string) => ({ params: Promise.resolve({ id }) })

d('00086 ค่าใช้จ่ายของพนักงาน (DB local)', () => {
  beforeAll(async () => {
    const mkUser = async (t: string) => {
      const u = await prisma.user.create({ data: { displayName: `es-${run}-${t}`, username: `es_${run}_${t}` }, select: { id: true } })
      ids.users.push(u.id)
      return u.id
    }
    const mkShop = async (t: string, vertical: string) => {
      const owner = await mkUser(`${t}-own`)
      const s = await prisma.shop.create({
        data: { userId: owner, shopName: `es-${run}-${t}`, kind: 'BUSINESS', vertical } as never, select: { id: true },
      })
      ids.shops.push(s.id)
      const o = await prisma.shopMember.create({ data: { shopId: s.id, userId: owner, role: 'OWNER', roles: [] }, select: { id: true } })
      ids.members.push(o.id)
      f[`${t}Shop`] = s.id
      f[`${t}Owner`] = owner
    }
    const add = async (key: string, shopKey: string, roles: string[], canRecordExpense: boolean) => {
      const uid = await mkUser(key)
      const x = await prisma.shopMember.create({
        data: { shopId: f[shopKey], userId: uid, role: 'ADMIN', roles, canRecordExpense }, select: { id: true },
      })
      ids.members.push(x.id)
      f[key] = uid
    }
    await mkShop('svc', 'SERVICE_QUEUE')
    await add('staffA', 'svcShop', ['CHAT'], true)
    await add('staffB', 'svcShop', ['TECHNICIAN'], true)
    await add('staffNoFlag', 'svcShop', ['CHAT'], false)
    await mkShop('onl', 'ONLINE_SALES')
    await add('onlStaff', 'onlShop', ['CHAT'], true)

    // แถวของเจ้าของ (ผ่านทางเจ้าของเดิม = ตารางเดียวกัน)
    const ownerRow = await prisma.expense.create({
      data: { shopId: f.svcShop, createdByUserId: f.svcOwner, category: 'RENT', amount: 1000, expenseDate: new Date(`${DAY}T00:00:00.000Z`) },
      select: { id: true },
    })
    f.ownerExpense = ownerRow.id
  })

  afterAll(async () => {
    // Expense → User เป็น Restrict: ลบแถวค่าใช้จ่ายของร้านเทสก่อน (ขอบเขตเฉพาะร้านที่สร้าง)
    if (ids.shops.length) await prisma.expense.deleteMany({ where: { shopId: { in: ids.shops } } })
    if (ids.members.length) await prisma.shopMember.deleteMany({ where: { id: { in: ids.members } } })
    if (ids.shops.length) await prisma.shop.deleteMany({ where: { id: { in: ids.shops } } })
    if (ids.users.length) await prisma.user.deleteMany({ where: { id: { in: ids.users } } })
    await prisma.$disconnect()
  })

  // ── ด่าน ──────────────────────────────────────────────────────────────────
  describe('resolveStaffExpenseAccess', () => {
    it('พนักงานร้านบริการที่มีธง → GRANTED พร้อม shopId/userId ของตัวเอง', async () => {
      expect(await resolveStaffExpenseAccess(sessionOf(f.staffA, f.svcShop))).toEqual({ kind: 'GRANTED', shopId: f.svcShop, userId: f.staffA })
    })
    it('[blocker] พนักงานไม่มีธง → FORBIDDEN', async () => {
      expect(await resolveStaffExpenseAccess(sessionOf(f.staffNoFlag, f.svcShop))).toEqual({ kind: 'FORBIDDEN' })
    })
    it('[blocker] ร้าน ONLINE_SALES แม้ธงเป็น true → FORBIDDEN', async () => {
      expect(await resolveStaffExpenseAccess(sessionOf(f.onlStaff, f.onlShop))).toEqual({ kind: 'FORBIDDEN' })
    })
    it('[blocker] เจ้าของ → FORBIDDEN บนทางนี้ (เจ้าของใช้ /api/expenses F1/F2)', async () => {
      expect(await resolveStaffExpenseAccess(sessionOf(f.svcOwner, f.svcShop))).toEqual({ kind: 'FORBIDDEN' })
    })
    it('session ไม่มี id → UNAUTH (ไม่ query ด้วย id ว่าง)', async () => {
      expect(await resolveStaffExpenseAccess({ user: { activeShopId: f.svcShop } })).toEqual({ kind: 'UNAUTH' })
    })
  })

  // ── route ทั้งเส้น ────────────────────────────────────────────────────────
  describe('/api/expenses/mine', () => {
    it('POST บันทึกด้วยผู้ใช้จาก session เสมอ (body ปลอม createdByUserId ไม่มีผล) + คืนชื่อผู้บันทึก', async () => {
      as(f.staffA, f.svcShop)
      const res = await minePost(req('/api/expenses/mine', {
        method: 'POST', body: { category: 'OTHER', amount: 150, expenseDate: DAY, note: 'ค่าน้ำแข็ง', createdByUserId: f.staffB },
      }))
      expect(res.status).toBe(201)
      expect(res.headers.get('cache-control')).toContain('no-store')
      const body = await res.json()
      expect(body).toMatchObject({ shopId: f.svcShop, createdByUserId: f.staffA, createdByName: `es-${run}-staffA`, amount: 150, expenseDate: DAY })
      f.aExpense = body.id

      as(f.staffB, f.svcShop)
      const resB = await minePost(req('/api/expenses/mine', { method: 'POST', body: { category: 'PACKAGING', amount: 70, expenseDate: DAY } }))
      expect(resB.status).toBe(201)
      f.bExpense = (await resB.json()).id
    })

    it('POST body ไม่ผ่าน schema → 400', async () => {
      as(f.staffA, f.svcShop)
      expect((await minePost(req('/api/expenses/mine', { method: 'POST', body: { category: 'OTHER', amount: 0 } }))).status).toBe(400)
    })

    it('[blocker] GET คืนเฉพาะแถวที่ตัวเองบันทึก (ไม่เห็นของเจ้าของ/เพื่อน) และไม่มียอดรวม', async () => {
      as(f.staffA, f.svcShop)
      const res = await mineGet(req('/api/expenses/mine'))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(Array.isArray(body)).toBe(true)
      expect(body.map((e: { id: string }) => e.id)).toEqual([f.aExpense])
      expect(body.every((e: { createdByUserId: string }) => e.createdByUserId === f.staffA)).toBe(true)
      expect(JSON.stringify(body)).not.toMatch(/total/i)

      // ช่วงวันที่ก็ยังกรองผู้บันทึก
      const ranged = await (await mineGet(req(`/api/expenses/mine?start=${DAY}&end=${DAY}`))).json()
      expect(ranged.map((e: { id: string }) => e.id)).toEqual([f.aExpense])
    })

    it('[blocker] PATCH แถวของคนอื่น (เพื่อน/เจ้าของ) → 404 และแถวไม่เปลี่ยน', async () => {
      as(f.staffA, f.svcShop)
      for (const id of [f.bExpense, f.ownerExpense]) {
        const res = await minePatch(req(`/api/expenses/mine/${id}`, { method: 'PATCH', body: { amount: 1 } }), idParams(id))
        expect(res.status).toBe(404)
      }
      const b = await prisma.expense.findUniqueOrThrow({ where: { id: f.bExpense } })
      const o = await prisma.expense.findUniqueOrThrow({ where: { id: f.ownerExpense } })
      expect([Number(b.amount), Number(o.amount)]).toEqual([70, 1000])
    })

    it('[blocker] DELETE แถวของคนอื่น → 404 และแถวยังอยู่', async () => {
      as(f.staffA, f.svcShop)
      for (const id of [f.bExpense, f.ownerExpense]) {
        expect((await mineDelete(req(`/api/expenses/mine/${id}`, { method: 'DELETE' }), idParams(id))).status).toBe(404)
      }
      expect(await prisma.expense.count({ where: { id: { in: [f.bExpense, f.ownerExpense] } } })).toBe(2)
    })

    it('PATCH แถวของตัวเอง → 200 พร้อมชื่อผู้บันทึก', async () => {
      as(f.staffA, f.svcShop)
      const res = await minePatch(req(`/api/expenses/mine/${f.aExpense}`, { method: 'PATCH', body: { amount: 200 } }), idParams(f.aExpense))
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ id: f.aExpense, amount: 200, createdByName: `es-${run}-staffA` })
    })

    it('[blocker] ไม่มีธง / ร้านออนไลน์ / เจ้าของ → 403 FORBIDDEN_ROLE ทุกเมธอด', async () => {
      const cases: [string, string][] = [[f.staffNoFlag, f.svcShop], [f.onlStaff, f.onlShop], [f.svcOwner, f.svcShop]]
      for (const [u, s] of cases) {
        as(u, s)
        const responses = [
          await mineGet(req('/api/expenses/mine')),
          await minePost(req('/api/expenses/mine', { method: 'POST', body: { category: 'OTHER', amount: 5 } })),
          await minePatch(req(`/api/expenses/mine/${f.aExpense}`, { method: 'PATCH', body: { amount: 9 } }), idParams(f.aExpense)),
          await mineDelete(req(`/api/expenses/mine/${f.aExpense}`, { method: 'DELETE' }), idParams(f.aExpense)),
        ]
        for (const r of responses) {
          expect(r.status).toBe(403)
          expect(await r.json()).toEqual({ error: 'FORBIDDEN_ROLE' })
        }
      }
      // ไม่มีแถวใหม่หลุดเข้าไป และแถวของ A ไม่ถูกแตะ
      expect(await prisma.expense.count({ where: { shopId: { in: [f.svcShop, f.onlShop] } } })).toBe(3)
      expect(Number((await prisma.expense.findUniqueOrThrow({ where: { id: f.aExpense } })).amount)).toBe(200)
    })

    it('ไม่มีร้าน (NO_SHOP) → 409 ทุกเมธอด — ไม่ชน 404 "ไม่พบแถว" ที่โมดัลถือว่าลบไปแล้ว (MINOR-4)', async () => {
      const u = await prisma.user.create({ data: { displayName: `es-${run}-noshop`, username: `es_${run}_noshop` }, select: { id: true } })
      ids.users.push(u.id)
      vi.mocked(getServerSession).mockResolvedValue({ user: { id: u.id, activeShopId: null } } as never)
      const responses = [
        await mineGet(req('/api/expenses/mine')),
        await minePost(req('/api/expenses/mine', { method: 'POST', body: { category: 'OTHER', amount: 5 } })),
        await minePatch(req(`/api/expenses/mine/${f.aExpense}`, { method: 'PATCH', body: { amount: 9 } }), idParams(f.aExpense)),
        await mineDelete(req(`/api/expenses/mine/${f.aExpense}`, { method: 'DELETE' }), idParams(f.aExpense)),
      ]
      for (const r of responses) {
        expect(r.status).toBe(409)
        expect(await r.json()).toEqual({ error: 'NO_SHOP' })
      }
      expect(Number((await prisma.expense.findUniqueOrThrow({ where: { id: f.aExpense } })).amount)).toBe(200)
    })

    it('ไม่มี id ใน session → 401', async () => {
      vi.mocked(getServerSession).mockResolvedValue({ user: {} } as never)
      expect((await mineGet(req('/api/expenses/mine'))).status).toBe(401)
    })
  })

  // ── HR16: แถวพนักงาน = แถวเจ้าของ ในทุกตัวเลขของรายงาน ─────────────────────────
  describe('HR16 parity', () => {
    it('[blocker] เจ้าของเห็นแถวของพนักงานใน listExpenses พร้อมชื่อผู้บันทึก', async () => {
      const rows = (await listExpenses(f.svcShop)).map(serializeExpense)
      expect(rows.map((r) => r.id).sort()).toEqual([f.ownerExpense, f.aExpense, f.bExpense].sort())
      const byId = Object.fromEntries(rows.map((r) => [r.id, r.createdByName]))
      expect(byId[f.aExpense]).toBe(`es-${run}-staffA`)
      expect(byId[f.bExpense]).toBe(`es-${run}-staffB`)
      expect(byId[f.ownerExpense]).toBe(`es-${run}-svc-own`)
    })

    it('[blocker] ยอดค่าใช้จ่ายใน P&L และกราฟรายงานร้านบริการรวมแถวพนักงาน (1000 + 200 + 70)', async () => {
      const range = resolveDateRange('custom', DAY, DAY)
      const pnl = await getPnlReport(f.svcShop, range, 'SERVICE_QUEUE')
      expect(pnl.totalExpense).toBe(1270)

      const buckets = await expenseBuckets(f.svcShop, 'daily', 2026, 2, 31)
      expect(buckets[14]).toBe(1270)
      expect(buckets.reduce((a, b) => a + b, 0)).toBe(1270)
    })

    it('DELETE แถวของตัวเอง → 200 แล้วหายจากยอดของเจ้าของด้วย', async () => {
      as(f.staffA, f.svcShop)
      const res = await mineDelete(req(`/api/expenses/mine/${f.aExpense}`, { method: 'DELETE' }), idParams(f.aExpense))
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ deleted: true })
      const pnl = await getPnlReport(f.svcShop, resolveDateRange('custom', DAY, DAY), 'SERVICE_QUEUE')
      expect(pnl.totalExpense).toBe(1070)
    })
  })
})
