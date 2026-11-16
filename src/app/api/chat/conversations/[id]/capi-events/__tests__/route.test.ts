/**
 * GET /api/chat/conversations/{id}/capi-events — TC-001..003 · TC-005 · TC-007 · TC-027 (00097)
 * ด่านจริงบน Postgres local (resolveConversationShopId + บทบาทจริง) — mock เฉพาะ session
 * 🛑 HR13/HR14: รันเฉพาะ DATABASE_URL = localhost:5434 · ลบเฉพาะ id ที่เทสสร้าง
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { encryptToken } from '@/lib/token-crypto'
import { FORBIDDEN_ROLE_BODY } from '@/lib/forbidden-role'

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
import { getServerSession } from 'next-auth'
import { GET } from '../route'

process.env.CHANNEL_TOKEN_KEY ||= 'ab'.repeat(32)
const url = process.env.DATABASE_URL ?? ''
const d = /@(localhost|127\.0\.0\.1):5434\//.test(url) ? describe : describe.skip
const run = randomUUID().slice(0, 8)
const ids = { users: [] as string[], shops: [] as string[] }
const f: Record<string, string> = {}
const call = (id: string) => GET(new Request(`http://x/api/chat/conversations/${id}/capi-events`), { params: Promise.resolve({ id }) })
const as = (userId: string | null, activeShopId: string | null) =>
  vi.mocked(getServerSession).mockResolvedValue((userId ? { user: { id: userId, activeShopId } } : null) as never)

d('00097 route capi-events (DB local)', () => {
  beforeAll(async () => {
    const user = async (tag: string) => {
      const u = await prisma.user.create({ data: { displayName: `${tag}-${run}`, username: `${tag}97r_${run}` }, select: { id: true } })
      ids.users.push(u.id)
      return u.id
    }
    const owner = await user('own'), chat = await user('chat'), outsider = await user('out'), owner2 = await user('own2')
    // ร้าน S1 = BUSINESS: owner = OWNER · chat = ADMIN[CHAT] (ไม่มี X9) · ร้าน S2 ของ owner2 (แชทห้องของ S2 ไว้เทสร้านที่ไม่ active)
    const mkShop = async (userId: string, kind: string, tag: string) => {
      const s = await prisma.shop.create({ data: { userId, shopName: `${tag}-${run}`, kind } as never, select: { id: true } })
      ids.shops.push(s.id)
      return s.id
    }
    const s1 = await mkShop(owner, 'BUSINESS', 's1')
    const s2 = await mkShop(owner2, 'BUSINESS', 's2')
    const personalOut = await mkShop(outsider, 'PERSONAL', 'p')
    await prisma.shopMember.createMany({
      data: [
        { shopId: s1, userId: owner, role: 'OWNER' },
        { shopId: s1, userId: chat, role: 'ADMIN', roles: ['CHAT'] },
        { shopId: s2, userId: owner2, role: 'OWNER' },
        { shopId: s2, userId: owner, role: 'OWNER' }, // owner เป็นเจ้าของทั้ง S1/S2 (TC-027 ข้อ 2)
        { shopId: s2, userId: chat, role: 'ADMIN', roles: ['CHAT'] }, // chat ไม่มี X9 ใน S2 (TC-027 ข้อ 1)
      ],
    })
    const ch = await prisma.shopChannel.create({
      data: { shopId: s1, provider: 'MESSENGER', externalId: `97${String(parseInt(run, 16)).padStart(10, '0')}`, name: 'เพจ', accessTokenEnc: encryptToken('T'), connectedByUserId: owner },
      select: { id: true },
    })
    const ch2 = await prisma.shopChannel.create({
      data: { shopId: s2, provider: 'MESSENGER', externalId: `98${String(parseInt(run, 16)).padStart(10, '0')}`, name: 'เพจ2', accessTokenEnc: encryptToken('T'), connectedByUserId: owner2 },
      select: { id: true },
    })
    const conv = (shopId: string, shopChannelId: string | null, channel: string) =>
      prisma.conversation.create({ data: { shopId, channel, shopChannelId } as never, select: { id: true } }).then((c) => c.id)
    f.convA = await conv(s1, ch.id, 'MESSENGER')
    f.convLine = await conv(s1, null, 'LINE')
    f.convS2 = await conv(s2, ch2.id, 'MESSENGER')
    const ds = await prisma.metaCapiDataset.create({ data: { shopId: s1, shopChannelId: ch.id, datasetId: `9${run}`, source: 'MANUAL', label: 'หลัก', tokenEnc: encryptToken('T'), events: ['PURCHASE'] } as never, select: { id: true } })
    await prisma.metaCapiEvent.create({
      data: { shopId: s1, datasetRowId: ds.id, conversationId: f.convA, eventKey: 'PURCHASE', dedupeKey: 'route-k1', eventTime: new Date(), pageId: 'p', psid: 'PSID-SECRET', payload: { value: 99 }, status: 'PENDING', reason: 'TOKEN_OR_PERMISSION', lastRequest: 'REQ-SECRET' },
    })
    Object.assign(f, { owner, chat, outsider, owner2, s1, s2, personalOut })
  }, 60_000)

  afterAll(async () => {
    if (ids.shops.length) {
      await prisma.conversation.deleteMany({ where: { shopId: { in: ids.shops } } })
      await prisma.shopChannel.deleteMany({ where: { shopId: { in: ids.shops } } }) // dataset/event cascade
      await prisma.shop.deleteMany({ where: { id: { in: ids.shops } } }) // member cascade
    }
    if (ids.users.length) await prisma.user.deleteMany({ where: { id: { in: ids.users } } })
    vi.unstubAllEnvs()
    await prisma.$disconnect()
  })

  beforeEach(() => {
    vi.stubEnv('OPEN_META_CAPI', '1')
    vi.stubEnv('META_CAPI_PILOT_SHOP_IDS', '')
  })

  it('TC-003: ไม่ล็อกอิน = 401 · id ไม่ใช่ uuid = 400 · ไม่มี groups', async () => {
    as(null, null)
    const r1 = await call(f.convA)
    expect(r1.status).toBe(401)
    expect(await r1.json()).not.toHaveProperty('groups')
    as(f.owner, f.s1)
    const r2 = await call('abc')
    expect(r2.status).toBe(400)
    expect(await r2.json()).not.toHaveProperty('groups')
  })

  it('TC-001: สมาชิกที่ไม่มี X9 = 403 FORBIDDEN_ROLE ไม่มี groups · no-store', async () => {
    as(f.chat, f.s1)
    const res = await call(f.convA)
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body).toEqual(FORBIDDEN_ROLE_BODY)
    expect(body).not.toHaveProperty('groups')
    expect(res.headers.get('cache-control')).toContain('no-store')
  })

  it('TC-002: คนนอกร้าน = 404 · ห้องไม่มี = 404 · ไม่มี groups', async () => {
    as(f.outsider, null) // ร้านส่วนตัวของคนนอก
    for (const [who, id] of [[f.outsider, f.convA], [f.owner, randomUUID()]] as const) {
      as(who, who === f.owner ? f.s1 : null)
      const res = await call(id)
      expect(res.status).toBe(404)
      expect(await res.json()).not.toHaveProperty('groups')
    }
  })

  it('TC-003: ฟีเจอร์ปิด / ร้านไม่อยู่ในรายชื่อทดลอง = 404 FEATURE_DISABLED ไม่มี groups', async () => {
    as(f.owner, f.s1)
    for (const off of [() => vi.stubEnv('OPEN_META_CAPI', ''), () => vi.stubEnv('META_CAPI_PILOT_SHOP_IDS', 'someone-else')]) {
      off()
      const res = await call(f.convA)
      expect(res.status).toBe(404)
      const body = await res.json()
      expect(body).toMatchObject({ code: 'FEATURE_DISABLED' })
      expect(body).not.toHaveProperty('groups')
    }
  })

  it('TC-005: OWNER ได้ 200 · ไม่มี psid/reason ดิบ/payload/dedupeKey · มี reasonKey · no-store', async () => {
    as(f.owner, f.s1)
    const res = await call(f.convA)
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toContain('no-store')
    const text = JSON.stringify(await res.json())
    for (const s of ['PSID-SECRET', 'REQ-SECRET', 'TOKEN_OR_PERMISSION', 'route-k1', 'payload', 'dedupeKey', 'psid']) expect(text).not.toContain(s)
    expect(JSON.parse(text)).toMatchObject({ visible: true, groups: [{ eventKey: 'PURCHASE', value: 99, datasets: [{ status: 'PENDING', reasonKey: 'waitToken' }] }] })
  })

  it('TC-007: ห้อง LINE = 200 visible:false groups ว่าง', async () => {
    as(f.owner, f.s1)
    const res = await call(f.convLine)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ visible: false, channelId: null, pageStopped: false, truncated: false, groups: [] })
  })

  it('TC-027: ตัดสินด้วยบทบาทในร้านของห้อง ไม่ใช่ร้าน active', async () => {
    as(f.chat, f.s1) // chat = CHAT ใน S2 (ไม่มี X9) แม้ active = S1
    expect((await call(f.convS2)).status).toBe(403)
    as(f.owner, f.s1) // owner = OWNER ทั้งสองร้าน · active = S1 · ห้องของ S2 ต้องผ่านเมื่อโหมดรวม
    await prisma.user.update({ where: { id: f.owner }, data: { chatScopeMode: 'UNIFIED' } })
    expect((await call(f.convS2)).status).toBe(200)
    await prisma.user.update({ where: { id: f.owner }, data: { chatScopeMode: 'SINGLE' } })
  })
})
