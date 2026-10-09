/** loadPromptMemory (00019-ext-mem U9): fail-soft · สวิตช์ปิด = ไม่อ่านส่วนนั้น · updatedDay จาก thaiDayKey */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({ expandClusters: vi.fn(), findFirst: vi.fn(), listPrompt: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({ prisma: { chatMemory: { findFirst: m.findFirst } } }))
vi.mock('@/services/follow-up-scope', () => ({ expandClusters: m.expandClusters }))
vi.mock('@/services/chat-interested-product.service', () => ({
  listInterestedProducts: vi.fn(),
  listInterestedForPrompt: m.listPrompt,
}))
vi.mock('@/services/ai-setting.service', () => ({ getAiSetting: vi.fn(), getEffectiveAiSetting: vi.fn() }))
vi.mock('@/services/ai-suggest-quota.service', () => ({ isOwnerPaidPlan: vi.fn() }))
vi.mock('@/lib/reply-suggest-provider', () => ({ resolveSuggestProvider: vi.fn() }))

import { loadPromptMemory } from '@/services/chat-memory.service'
import { thaiDayKey } from '@/lib/format-date'

const at = new Date('2026-10-08T20:00:00Z')
const P = { shopId: 's1', conversationId: 'cA', includeMemory: true, includeProducts: true }
const PROD = { name: 'D21', optionLabel: 'L', state: 'ACTIVE', price: '450.00', stockQty: 3 }

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  m.expandClusters.mockResolvedValue(new Map([['cA', ['cA']]]))
  m.findFirst.mockResolvedValue({ id: 'm1', conversationId: 'cA', text: 'ใส่ไซส์ L', updatedAt: at })
  m.listPrompt.mockResolvedValue([PROD])
})

describe('loadPromptMemory', () => {
  it('คืนความจำ (updatedDay = thaiDayKey) + สินค้า', async () => {
    expect(await loadPromptMemory(P)).toEqual({ memory: { text: 'ใส่ไซส์ L', updatedDay: thaiDayKey(at) }, products: [PROD] })
  })
  it('includeX=false → ไม่อ่านส่วนนั้นเลย', async () => {
    const r = await loadPromptMemory({ ...P, includeMemory: false, includeProducts: false })
    expect(r).toEqual({ memory: null, products: [] })
    expect(m.expandClusters).not.toHaveBeenCalled()
    expect(m.findFirst).not.toHaveBeenCalled()
    expect(m.listPrompt).not.toHaveBeenCalled()
  })
  it('ความจำล้ม → memory null แต่สินค้ายังมา · ไม่ throw', async () => {
    m.findFirst.mockRejectedValue(new Error('db'))
    expect(await loadPromptMemory(P)).toEqual({ memory: null, products: [PROD] })
  })
  it('สินค้าล้ม → [] แต่ความจำยังมา', async () => {
    m.listPrompt.mockRejectedValue(new Error('db'))
    expect((await loadPromptMemory(P)).memory?.text).toBe('ใส่ไซส์ L')
    expect((await loadPromptMemory(P)).products).toEqual([])
  })
  it('ข้อความว่าง / ห้องไม่ใช่ของร้าน → null', async () => {
    m.findFirst.mockResolvedValue({ id: 'm1', conversationId: 'cA', text: '  ', updatedAt: at })
    expect((await loadPromptMemory(P)).memory).toBeNull()
    m.expandClusters.mockResolvedValue(new Map())
    expect((await loadPromptMemory(P)).memory).toBeNull()
  })
})
