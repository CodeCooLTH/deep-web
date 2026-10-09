import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({
  expandClusters: vi.fn(),
  findFirst: vi.fn(),
  createMany: vi.fn(),
  updateMany: vi.fn(),
  productCount: vi.fn(),
  runFindFirst: vi.fn(),
  listInterested: vi.fn(),
  getAiSetting: vi.fn(),
  getEffective: vi.fn(),
  isPaid: vi.fn(),
  provider: vi.fn(),
}))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    chatMemory: { findFirst: m.findFirst, createMany: m.createMany, updateMany: m.updateMany },
    product: { count: m.productCount },
    aiSuggestRun: { findFirst: m.runFindFirst },
  },
}))
vi.mock('@/services/follow-up-scope', () => ({ expandClusters: m.expandClusters }))
vi.mock('@/services/chat-interested-product.service', () => ({ listInterestedProducts: m.listInterested }))
vi.mock('@/services/ai-setting.service', () => ({ getAiSetting: m.getAiSetting, getEffectiveAiSetting: m.getEffective }))
vi.mock('@/services/ai-suggest-quota.service', () => ({ isOwnerPaidPlan: m.isPaid }))
vi.mock('@/lib/reply-suggest-provider', () => ({ resolveSuggestProvider: m.provider }))

import { getMemoryPanel, resolveEffectiveMemory, saveMemoryByAdmin } from '@/services/chat-memory.service'

const row = (o: Record<string, unknown> = {}) => ({
  id: 'm1', shopId: 's1', conversationId: 'cA', text: 'เดิม', source: 'AI', version: 3,
  previousText: null, updatedAt: new Date('2026-10-09T00:00:00Z'), aiUpdatedAt: null, ...o,
})
const save = (o: Partial<Parameters<typeof saveMemoryByAdmin>[0]> = {}) =>
  saveMemoryByAdmin({ shopId: 's1', conversationId: 'cA', userId: 'u1', text: 'ใหม่', expectedVersion: 3, ...o })

beforeEach(() => {
  vi.resetAllMocks()
  m.expandClusters.mockResolvedValue(new Map([['cA', ['cA', 'cB']]]))
  m.findFirst.mockResolvedValue(row())
  m.updateMany.mockResolvedValue({ count: 1 })
})

describe('resolveEffectiveMemory', () => {
  it('ห้องไม่ใช่ของร้าน → null', async () => {
    m.expandClusters.mockResolvedValue(new Map())
    expect(await resolveEffectiveMemory('s1', 'cX')).toBeNull()
  })
  it('แถวมาจากห้องอื่นใน cluster → shared · query มี shopId + ห้องใน cluster', async () => {
    m.findFirst.mockResolvedValue(row({ conversationId: 'cB' }))
    const r = await resolveEffectiveMemory('s1', 'cA')
    expect(r?.shared).toBe(true)
    expect(m.findFirst.mock.calls[0][0].where).toEqual({ shopId: 's1', conversationId: { in: ['cA', 'cB'] } })
  })
})

describe('saveMemoryByAdmin', () => {
  it('801 ตัว → INVALID_TEXT ไม่เขียน', async () => {
    expect(await save({ text: 'ก'.repeat(801) })).toEqual({ ok: false, code: 'INVALID_TEXT' })
    expect(m.updateMany).not.toHaveBeenCalled()
  })
  it('800 ตัวพอดี ผ่าน · \\n → บรรทัดเดียว', async () => {
    await save({ text: 'ก\n\nข' })
    expect(m.updateMany.mock.calls[0][0].data.text).toBe('ก ข')
    expect((await save({ text: 'ก'.repeat(800) })).ok).toBe(true)
  })
  it('CAS: WHERE มี id+shopId+version · bump version · previousText · source ADMIN', async () => {
    await save()
    const a = m.updateMany.mock.calls[0][0]
    expect(a.where).toEqual({ id: 'm1', shopId: 's1', version: 3 })
    expect(a.data).toMatchObject({ text: 'ใหม่', source: 'ADMIN', version: 4, previousText: 'เดิม', updatedByUserId: 'u1' })
  })
  it('ข้อความเดิมว่าง → previousText null · ว่างทั้งหมด → text "" ยังเขียน', async () => {
    m.findFirst.mockResolvedValue(row({ text: '' }))
    await save()
    expect(m.updateMany.mock.calls[0][0].data.previousText).toBeNull()
    m.findFirst.mockResolvedValue(row())
    await save({ text: '  \n ' })
    expect(m.updateMany.mock.calls[1][0].data.text).toBe('')
  })
  it('ข้อความเท่าเดิม → ไม่เขียน ไม่ bump', async () => {
    const r = await save({ text: 'เดิม\n' })
    expect(m.updateMany).not.toHaveBeenCalled()
    expect(r.ok && r.memory.version).toBe(3)
  })
  it('expectedVersion ไม่ตรง → VERSION_CONFLICT พร้อม current ไม่เขียน', async () => {
    const r = await save({ expectedVersion: 2 })
    expect(r).toMatchObject({ ok: false, code: 'VERSION_CONFLICT', current: { text: 'เดิม', version: 3, source: 'AI' } })
    expect(m.updateMany).not.toHaveBeenCalled()
  })
  it('แพ้ CAS (count 0) → VERSION_CONFLICT ด้วยข้อความของคนที่ชนะ', async () => {
    m.updateMany.mockResolvedValue({ count: 0 })
    m.findFirst.mockResolvedValueOnce(row()).mockResolvedValueOnce(row({ text: 'คนแรก', version: 4, source: 'ADMIN' }))
    const r = await save()
    expect(r).toMatchObject({ ok: false, code: 'VERSION_CONFLICT', current: { text: 'คนแรก', version: 4 } })
  })
  it('ไม่มีแถว: expectedVersion null → createMany skipDuplicates · count 0 → conflict', async () => {
    m.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(row({ version: 1, text: 'ใหม่', source: 'ADMIN' }))
    m.createMany.mockResolvedValue({ count: 1 })
    expect((await save({ expectedVersion: null })).ok).toBe(true)
    expect(m.createMany.mock.calls[0][0].skipDuplicates).toBe(true)
    m.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(row({ text: 'ชนะ' }))
    m.createMany.mockResolvedValue({ count: 0 })
    expect(await save({ expectedVersion: null })).toMatchObject({ code: 'VERSION_CONFLICT', current: { text: 'ชนะ' } })
  })
  it('ไม่มีแถวแต่ client ถือ version → conflict current null', async () => {
    m.findFirst.mockResolvedValue(null)
    expect(await save({ expectedVersion: 2 })).toEqual({ ok: false, code: 'VERSION_CONFLICT', current: null })
  })
  it('ห้องไม่ใช่ของร้าน → NOT_FOUND', async () => {
    m.expandClusters.mockResolvedValue(new Map())
    expect(await save()).toEqual({ ok: false, code: 'NOT_FOUND' })
  })
})

describe('getMemoryPanel', () => {
  beforeEach(() => {
    m.provider.mockReturnValue('gemini')
    m.listInterested.mockResolvedValue([])
    m.productCount.mockResolvedValue(0)
    m.getAiSetting.mockResolvedValue({})
    m.getEffective.mockReturnValue({ includeCustomerContext: true, includeProductContext: false })
    m.isPaid.mockRejectedValue(new Error('x'))
    m.runFindFirst.mockResolvedValue(null)
  })
  it('ห้องไม่ใช่ของร้าน → null', async () => {
    m.expandClusters.mockResolvedValue(new Map())
    expect(await getMemoryPanel('s1', 'cX')).toBeNull()
  })
  it('ประกอบ ai object · isOwnerPaidPlan ล้ม = non-paid', async () => {
    const r = await getMemoryPanel('s1', 'cA')
    expect(m.getEffective).toHaveBeenCalledWith({}, false)
    expect(r?.ai).toEqual({
      provider: 'gemini', writes: false, readsMemory: true, readsProducts: false, updating: false, noteReadByAi: true,
    })
    expect(r?.canUseProducts).toBe(false)
    expect(r?.memory?.text).toBe('เดิม')
  })
  it('updating จากแถว THINKING · typhoon writes · มีสินค้า → canUseProducts', async () => {
    m.provider.mockReturnValue('typhoon')
    m.runFindFirst.mockResolvedValue({ id: 'r' })
    m.productCount.mockResolvedValue(2)
    const r = await getMemoryPanel('s1', 'cA')
    expect(r?.ai).toMatchObject({ writes: true, updating: true, noteReadByAi: false })
    expect(r?.canUseProducts).toBe(true)
    const w = m.runFindFirst.mock.calls[0][0].where
    expect(w).toMatchObject({ shopId: 's1', trigger: 'MEMORY_UPDATE', status: 'THINKING', conversationId: 'cA' })
  })
})
