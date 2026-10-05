/**
 * routes.test.ts — owner API ของ line-report (00070 · API §2/§5 · SRS §4.3/§7)
 * service ภายใน mock หมด (ไม่แตะ DB) — ทดสอบเฉพาะชั้น route: auth / error map / validation / no-store / DELETE+leaveGroup
 * route ถูกสแกนจากดิสก์ — เพิ่ม route ใหม่แล้วไม่ลงตาราง LEVELS = เทสแดง
 */
import { readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LINE_REPORT_ERROR_CODES, LINE_REPORT_ERROR_STATUS, LineReportError, type LineReportErrorCode } from '@/lib/line-report/errors'

const h = vi.hoisted(() => ({
  access: { kind: 'OK', userId: 'owner1' } as { kind: string; userId?: string; reason?: string },
  botReady: true,
  throwFn: null as null | (() => never),
  calls: [] as string[],
  leave: vi.fn(),
  rebound: false,
  removeResult: { removed: true as const, leaveLineGroupId: 'Cabc' as string | null },
}))

vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => ({})) }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/line-report/config', () => ({ isReportBotReady: () => h.botReady }))
vi.mock('@/lib/line-report/line-client', () => ({ leaveGroup: (id: string) => h.leave(id) }))
vi.mock('@/services/line-report-access.service', async () => {
  const actual = await vi.importActual<typeof import('@/services/line-report-access.service')>('@/services/line-report-access.service')
  return { ...actual, requireReportAccess: async (_s: unknown, level: 'READ' | 'PAID') => actual.assertReportAccess(h.access as never, level) }
})
const svc = (name: string, value?: unknown) =>
  vi.fn(async (...a: unknown[]) => {
    h.calls.push(`${name}:${a.join(',')}`)
    if (h.throwFn) h.throwFn()
    return value
  })
vi.mock('@/services/line-report-group.service', () => ({
  listGroups: svc('list', { groups: [], meta: {} }),
  getGroupDetail: svc('detail', { group: { id: 'g1' } }),
  updateSettings: svc('update', { id: 'g1' }),
  updateTemplate: svc('tpl-put', { id: 'g1', measure: { bytes: 12000, limit: 30000, fullBytes: 31000, warnings: ['W'] } }),
  resetTemplate: svc('tpl-del', { id: 'g1' }),
  removeGroup: vi.fn(async (...a: unknown[]) => {
    h.calls.push(`remove:${a.join(',')}`)
    if (h.throwFn) h.throwFn()
    return h.removeResult
  }),
  ackAlert: svc('ack', { acked: true }),
  hasActiveBinding: vi.fn(async () => h.rebound),
}))
vi.mock('@/services/line-report-bind.service', () => ({
  createBindCode: svc('create', { groupId: 'g1', code: 'ABCD-EFGH', expiresAt: 'x', addFriendUrl: null, groupCount: 1 }),
  reissueBindCode: svc('reissue', { groupId: 'g1', status: 'PENDING', code: 'ABCD-EFGH', expiresAt: 'x', addFriendUrl: null }),
}))
vi.mock('@/services/line-report-shop.service', () => ({ replaceGroupShops: svc('shops', [{ shopId: 's1' }]) }))
vi.mock('@/services/line-report-send.service', () => ({
  sendTest: svc('test', { deliveryId: 'd1', sentAt: 's', remaining: 2, summary: 'x', extra: 'ต้องไม่หลุด' }),
}))

const ROOT = join(__dirname)
type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
/** ระดับสิทธิ์ของทุก handler (API §3) */
const LEVELS: Record<string, 'READ' | 'PAID'> = {
  'groups GET': 'READ',
  'bind-code POST': 'PAID',
  'groups/[id] GET': 'READ',
  'groups/[id] PATCH': 'PAID',
  'groups/[id] DELETE': 'READ',
  'groups/[id]/bind-code POST': 'PAID',
  'groups/[id]/shops PUT': 'PAID',
  'groups/[id]/template PUT': 'PAID',
  'groups/[id]/template DELETE': 'PAID',
  'groups/[id]/test POST': 'PAID',
  'groups/[id]/ack POST': 'READ',
}
// body ที่ผ่าน validation ของแต่ละ route
const BODY: Record<string, unknown> = {
  'bind-code POST': { shopIds: ['s1'], acknowledged: true },
  'groups/[id] PATCH': { showOrders: true },
  'groups/[id]/shops PUT': { shopIds: ['s1'] },
  'groups/[id]/template PUT': { template: { v: 1 }, expectedVersion: 0 },
}

function scanRoutes(dir = ROOT, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) scanRoutes(p, out)
    else if (e.name === 'route.ts') out.push(relative(ROOT, dir))
  }
  return out.filter((r) => r !== 'webhook')
}

async function call(routeDir: string, method: Method, body?: unknown, raw?: string) {
  const mod = await import(/* @vite-ignore */ `./${routeDir}/route`)
  const init: RequestInit = { method }
  if (raw !== undefined) init.body = raw
  else if (body !== undefined) init.body = JSON.stringify(body)
  return mod[method](new Request('http://seller.local/api/x', init), { params: Promise.resolve({ id: 'g1' }) }) as Promise<Response>
}
const entries = Object.keys(LEVELS).map((k) => {
  const [dir, method] = k.split(' ')
  return { key: k, dir, method: method as Method, level: LEVELS[k] }
})

beforeEach(() => {
  h.access = { kind: 'OK', userId: 'owner1' }
  h.botReady = true
  h.rebound = false
  h.throwFn = null
  h.calls.length = 0
  h.leave.mockReset().mockResolvedValue(true)
  h.removeResult = { removed: true, leaveLineGroupId: 'Cabc' }
})

describe('ตารางสิทธิ์ครบทุก handler', () => {
  it('route ที่สแกนได้ = ตาราง LEVELS (ไม่มี route ใหม่หลุดการเทส)', async () => {
    const found: string[] = []
    for (const dir of scanRoutes()) {
      const src = await import(/* @vite-ignore */ `./${dir}/route`)
      for (const m of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) if (typeof src[m] === 'function') found.push(`${dir} ${m}`)
    }
    expect(found.sort()).toEqual(Object.keys(LEVELS).sort())
  })
})

describe.each(entries)('$key (L=$level)', ({ key, dir, method, level }) => {
  it('ANON = 401 UNAUTHORIZED + no-store + ไม่แตะ service', async () => {
    h.access = { kind: 'ANON' }
    const r = await call(dir, method, BODY[key])
    expect(r.status).toBe(401)
    expect(r.headers.get('cache-control')).toBe('no-store')
    expect((await r.json()).error).toBe('UNAUTHORIZED')
    expect(h.calls).toEqual([])
  })
  it('ไม่ใช่เจ้าของร้าน (ADMIN) = 403 NOT_OWNER', async () => {
    h.access = { kind: 'NOT_OWNER', userId: 'u' }
    const r = await call(dir, method, BODY[key])
    expect(r.status).toBe(403)
    expect((await r.json()).error).toBe('NOT_OWNER')
  })
  it(level === 'PAID' ? 'LOCKED = 403 PACKAGE_REQUIRED' : 'LOCKED = ผ่าน (L1)', async () => {
    h.access = { kind: 'LOCKED', userId: 'owner1', reason: 'RENEWAL_FAILED' }
    const r = await call(dir, method, BODY[key])
    if (level === 'PAID') {
      expect(r.status).toBe(403)
      expect((await r.json()).error).toBe('PACKAGE_REQUIRED')
    } else expect(r.status).toBe(200)
  })
  it('OK = 2xx + no-store', async () => {
    const r = await call(dir, method, BODY[key])
    expect(r.status).toBe(key === 'bind-code POST' ? 201 : 200)
    expect(r.headers.get('cache-control')).toBe('no-store')
  })
  it('service ใช้ ownerId จาก session (scope เจ้าของ)', async () => {
    await call(dir, method, BODY[key])
    expect(h.calls.join('|')).toContain('owner1')
  })
})

describe('error table: LineReportError → HTTP ตาม API §5 (ไม่ใช่ 500)', () => {
  const thrown = LINE_REPORT_ERROR_CODES.filter((c) => c !== 'INTERNAL' && c !== 'INVALID_SIGNATURE' && c !== 'UNAUTHORIZED' && c !== 'NOT_OWNER')
  it.each(thrown)('%s', async (code: LineReportErrorCode) => {
    h.throwFn = () => {
      throw new LineReportError(code, { rule: 'X' })
    }
    const r = await call('groups/[id]', 'PATCH', { showOrders: true })
    expect(r.status).toBe(LINE_REPORT_ERROR_STATUS[code])
    expect(r.status).not.toBe(500)
    const b = await r.json()
    expect(b.error).toBe(code)
    expect(typeof b.message).toBe('string')
    expect(b.details).toEqual({ rule: 'X' })
    expect(r.headers.get('cache-control')).toBe('no-store')
  })
  it('error นอกชุด = 500 INTERNAL ไม่รั่ว message', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    h.throwFn = () => {
      throw new Error('secret SQL detail')
    }
    const r = await call('groups', 'GET')
    expect(r.status).toBe(500)
    const text = JSON.stringify(await r.json())
    expect(text).toContain('INTERNAL')
    expect(text).not.toContain('secret')
    expect(JSON.stringify(spy.mock.calls)).not.toContain('secret')
    spy.mockRestore()
  })
})

describe('validation', () => {
  it.each([
    ['bind-code', 'POST', { shopIds: [], acknowledged: true }, 'shopIds'],
    ['bind-code', 'POST', { shopIds: ['a'], acknowledged: false }, 'acknowledged'],
    ['groups/[id]', 'PATCH', { bogus: 1 }, null],
    ['groups/[id]', 'PATCH', {}, null],
    ['groups/[id]', 'PATCH', { dailyTimes: [45] }, 'dailyTimes.0'],
    ['groups/[id]/shops', 'PUT', { shopIds: ['a', 'a'] }, 'shopIds'],
  ] as const)('%s %s %j → 400 VALIDATION', async (dir, method, body, field) => {
    const r = await call(dir, method, body)
    expect(r.status).toBe(400)
    const b = await r.json()
    expect(b.error).toBe('VALIDATION')
    expect(Array.isArray(b.details.fields)).toBe(true)
    if (field) expect(b.details.fields).toContain(field)
    expect(h.calls).toEqual([])
  })
  it('JSON เสีย = 400 VALIDATION', async () => {
    const r = await call('bind-code', 'POST', undefined, '{oops')
    expect(r.status).toBe(400)
    expect((await r.json()).error).toBe('VALIDATION')
  })
})

describe('BOT_NOT_CONFIGURED = 503 (bind-code ×2 + test)', () => {
  it.each([
    ['bind-code', 'POST', { shopIds: ['s1'], acknowledged: true }],
    ['groups/[id]/bind-code', 'POST', undefined],
    ['groups/[id]/test', 'POST', undefined],
  ] as const)('%s', async (dir, method, body) => {
    h.botReady = false
    const r = await call(dir, method, body)
    expect(r.status).toBe(503)
    expect((await r.json()).error).toBe('BOT_NOT_CONFIGURED')
    expect(h.calls).toEqual([])
  })
})

describe('response shape', () => {
  it('test คืนเฉพาะ 4 ฟิลด์ตามสัญญา', async () => {
    const b = await (await call('groups/[id]/test', 'POST')).json()
    expect(Object.keys(b).sort()).toEqual(['deliveryId', 'remaining', 'sentAt', 'summary'])
  })
  it('PATCH ห่อเป็น { group }, shops ห่อเป็น { shops }', async () => {
    expect(await (await call('groups/[id]', 'PATCH', { showOrders: true })).json()).toEqual({ group: { id: 'g1' } })
    expect(await (await call('groups/[id]/shops', 'PUT', { shopIds: ['s1'] })).json()).toEqual({ shops: [{ shopId: 's1' }] })
  })
  it('scope: กลุ่มคนอื่น = 404 GROUP_NOT_FOUND', async () => {
    h.throwFn = () => {
      throw new LineReportError('GROUP_NOT_FOUND')
    }
    for (const [d, m] of [['groups/[id]', 'GET'], ['groups/[id]/ack', 'POST'], ['groups/[id]', 'DELETE']] as const) {
      const r = await call(d, m)
      expect(r.status).toBe(404)
    }
  })
})

describe('DELETE → leaveGroup best-effort', () => {
  it('มี lineGroupId → เรียก leave คืน botLeft true', async () => {
    h.leave.mockResolvedValue(true)
    const r = await call('groups/[id]', 'DELETE')
    expect(await r.json()).toEqual({ removed: true, botLeft: true })
    expect(h.leave).toHaveBeenCalledWith('Cabc')
  })
  it('LOW-2: มีแถว ACTIVE ถือ lineGroupId เดิมแล้ว (ผูกใหม่) → ไม่เรียก leave, botLeft false', async () => {
    h.rebound = true
    const r = await call('groups/[id]', 'DELETE')
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ removed: true, botLeft: false })
    expect(h.leave).not.toHaveBeenCalled()
  })
  it('บอทไม่อยู่แล้ว (leave=false) → botLeft false', async () => {
    h.leave.mockResolvedValue(false)
    expect((await (await call('groups/[id]', 'DELETE')).json()).botLeft).toBe(false)
  })
  it('ไม่มี id (PENDING/INACTIVE) → ไม่เรียก leave, botLeft null', async () => {
    h.removeResult = { removed: true, leaveLineGroupId: null }
    const r = await call('groups/[id]', 'DELETE')
    expect(await r.json()).toEqual({ removed: true, botLeft: null })
    expect(h.leave).not.toHaveBeenCalled()
  })
  it('leave ล้ม → ยัง 200 botLeft false (ไม่ใช่ 500)', async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    h.leave.mockRejectedValue(new Error('LINE down'))
    const r = await call('groups/[id]', 'DELETE')
    expect(r.status).toBe(200)
    expect((await r.json()).botLeft).toBe(false)
    spy.mockRestore()
  })
  it('removeGroup ล้ม (404) → ไม่เรียก leave', async () => {
    h.throwFn = () => {
      throw new LineReportError('GROUP_NOT_FOUND')
    }
    expect((await call('groups/[id]', 'DELETE')).status).toBe(404)
    expect(h.leave).not.toHaveBeenCalled()
  })
})

describe('template PUT/DELETE (EXT T8)', () => {
  const T = 'groups/[id]/template'
  it('PUT สำเร็จ: { group, warnings, size } และ measure ไม่หลุดเข้า group', async () => {
    const b = await (await call(T, 'PUT', { template: { v: 1 }, expectedVersion: 0, confirmProfit: true })).json()
    expect(b).toEqual({ group: { id: 'g1' }, warnings: ['W'], size: { bytes: 12000, limit: 30000 } })
  })
  it('DELETE สำเร็จ: { group }', async () => {
    expect(await (await call(T, 'DELETE')).json()).toEqual({ group: { id: 'g1' } })
  })
  it.each([
    [{ template: { v: 1 } }],
    [{ template: { v: 1 }, expectedVersion: -1 }],
    [{ template: { v: 1 }, expectedVersion: 1.5 }],
    [{ template: { v: 1 }, expectedVersion: 0, extra: 1 }],
  ])('body ผิด %j → 400 VALIDATION ไม่แตะ service', async (body) => {
    const r = await call(T, 'PUT', body)
    expect(r.status).toBe(400)
    expect((await r.json()).error).toBe('VALIDATION')
    expect(h.calls).toEqual([])
  })
  it('body > 64KB (ความยาวจริง) → 400 TEMPLATE_TOO_LARGE ไม่แตะ service', async () => {
    const r = await call(T, 'PUT', undefined, JSON.stringify({ template: { v: 1, pad: 'x'.repeat(65 * 1024) }, expectedVersion: 0 }))
    expect(r.status).toBe(400)
    expect((await r.json()).error).toBe('TEMPLATE_TOO_LARGE')
    expect(h.calls).toEqual([])
  })
  it('content-length เกิน 64KB → ตัดก่อนอ่าน body', async () => {
    const mod = await import(/* @vite-ignore */ `./${T}/route`)
    const req = new Request('http://seller.local/api/x', { method: 'PUT', body: '{}', headers: { 'content-length': '70000' } })
    const r = (await mod.PUT(req, { params: Promise.resolve({ id: 'g1' }) })) as Response
    expect(r.status).toBe(400)
    expect(h.calls).toEqual([])
  })
  it.each([['TEMPLATE_INVALID', 400], ['TEMPLATE_STALE', 409], ['GROUP_NOT_FOUND', 404]] as const)('service โยน %s → %i + details', async (code, status) => {
    h.throwFn = () => {
      throw new LineReportError(code, { rule: 'R' })
    }
    const r = await call(T, 'PUT', { template: { v: 1 }, expectedVersion: 0 })
    expect(r.status).toBe(status)
    expect((await r.json()).details).toEqual({ rule: 'R' })
  })
})
