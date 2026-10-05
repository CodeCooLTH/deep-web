/**
 * 00070 EXT T8 — ด่านขนาดของ updateTemplate เรียก measureTemplate จริง (ไม่แตะ DB: ด่านอยู่ก่อน transaction)
 */
import { describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ bytes: 0 }))
vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: vi.fn(async () => { throw new Error('ถึง tx แล้ว') }) } }))
vi.mock('@/services/line-report-access.service', () => ({ isOwnerPaidForReports: async () => true }))
vi.mock('@/lib/line-report/template-size', () => ({ measureTemplate: () => ({ bytes: m.bytes, limit: 30000, fullBytes: m.bytes, warnings: [] }) }))
import { updateTemplate } from '@/services/line-report-group.service'

const tpl = { v: 1, button: { show: true, label: 'เปิด Deep' }, blocks: [{ id: 'a', type: 'orders' }] }
const run = () => updateTemplate('o', 'g', { template: tpl, expectedVersion: 0 }).catch((e) => e)

describe('assertTemplateSize → measureTemplate', () => {
  it('bytes เกิน limit = TEMPLATE_TOO_LARGE ก่อนถึง tx', async () => {
    m.bytes = 30001
    const e = await run()
    expect(e.code).toBe('TEMPLATE_TOO_LARGE')
    expect(e.details).toEqual({ bytes: 30001, limit: 30000 })
  })
  it('bytes = limit พอดี = ผ่านด่าน (ไปถึง tx)', async () => {
    m.bytes = 30000
    expect((await run()).message).toBe('ถึง tx แล้ว')
  })
})
