import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * 00071 D-3 — โหมด SELF ต้องไม่มียอดขายตัวเลขในแผ่น response (ทั้ง list และ detail)
 * กวาดทั้งก้อน ไม่เช็คทีละ key — ชั้นที่เพิ่มทีหลังต้องโดนจับด้วย
 */
vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
const accessMock = vi.hoisted(() => vi.fn())
vi.mock('@/services/agent-report-access.service', () => ({ resolveAgentReportAccess: accessMock }))
const perf = vi.hoisted(() => ({ getAgentPerformanceOverview: vi.fn(), getAgentPerformance: vi.fn() }))
vi.mock('@/services/agent-performance.service', () => perf)

import { GET as listGET } from './route'
import { GET as detailGET } from './[agentId]/route'
import { getServerSession } from 'next-auth'

const m = { conversations: 3, revenue: 1500 }
const SELF = { kind: 'SELF', canSeeRevenue: false, userId: 'a1', scopeToAgentUserId: 'a1', shop: { id: 's1' } }

/** เดินทั้งก้อน — คืน path ของ key `revenue` ที่ยังเป็นตัวเลข */
function numericRevenuePaths(v: unknown, path = ''): string[] {
  if (Array.isArray(v)) return v.flatMap((x, i) => numericRevenuePaths(x, `${path}[${i}]`))
  if (v && typeof v === 'object')
    return Object.entries(v).flatMap(([k, x]) =>
      k === 'revenue' && typeof x === 'number' ? [`${path}.${k}`] : numericRevenuePaths(x, `${path}.${k}`),
    )
  return []
}

describe('agents API — SELF ไม่มี revenue ตัวเลข', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: 'a1' } } as never)
    accessMock.mockResolvedValue(SELF)
    perf.getAgentPerformanceOverview.mockResolvedValue({
      overview: m, previous: m, leaderboard: [{ agentUserId: 'a1', revenue: 900 }], agents: [],
    })
    perf.getAgentPerformance.mockResolvedValue({
      agent: { userId: 'a1' }, metrics: m, previous: m, trend: [{ day: '2026-10-01', revenue: 700 }],
    })
  })

  it('list', async () => {
    const body = await (await listGET(new NextRequest('http://x/api/seller/reports/agents'))).json()
    expect(body.overview.conversations).toBe(3) // ตัวเลขอื่นยังอยู่
    expect(numericRevenuePaths(body)).toEqual([])
  })

  it('detail', async () => {
    const res = await detailGET(new NextRequest('http://x/api/seller/reports/agents/a1'), { params: Promise.resolve({ agentId: 'a1' }) })
    const body = await res.json()
    expect(body.metrics.conversations).toBe(3)
    expect(numericRevenuePaths(body)).toEqual([])
  })

  it('FULL ยังได้ revenue ครบ', async () => {
    accessMock.mockResolvedValue({ ...SELF, kind: 'FULL', canSeeRevenue: true })
    const body = await (await listGET(new NextRequest('http://x/api/seller/reports/agents'))).json()
    expect(numericRevenuePaths(body).length).toBeGreaterThan(0)
  })
})
