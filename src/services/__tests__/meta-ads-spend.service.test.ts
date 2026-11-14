import { describe, it, expect, vi, beforeEach } from 'vitest'

const keys: unknown[][] = []
const stored: unknown[] = []
vi.mock('next/cache', () => ({
  // แคชจำลอง: จดคีย์ + จดสิ่งที่ "ถูกเก็บ" (resolve) — โยน = ไม่ถูกเก็บ ตามพฤติกรรมจริงของ unstable_cache
  unstable_cache: (fn: (...a: unknown[]) => Promise<unknown>, key: unknown[]) => {
    keys.push(key)
    return async (...a: unknown[]) => { const v = await fn(...a); stored.push(v); return v }
  },
}))
const findUnique = vi.fn()
vi.mock('@/lib/prisma', () => ({ prisma: { metaAudienceConnection: { findUnique: (...a: unknown[]) => findUnique(...a) } } }))
vi.mock('@/lib/token-crypto', () => ({ decryptToken: () => 'TKN' }))
const fetchAdInsights = vi.fn()
vi.mock('@/lib/meta-ads-insights', () => ({ fetchAdInsights: (...a: unknown[]) => fetchAdInsights(...a) }))

import { getAdSpend } from '@/services/meta-ads-spend.service'

const NONE = { accountName: null, currency: null, tz: null, rows: [] }
beforeEach(() => { keys.length = 0; stored.length = 0; findUnique.mockReset(); fetchAdInsights.mockReset() })

describe('getAdSpend', () => {
  it('ไม่มีแถวเชื่อมต่อ → NOT_CONNECTED ไม่ยิง Graph', async () => {
    findUnique.mockResolvedValue(null)
    expect((await getAdSpend('s1', '2026-11-01', '2026-11-14')).state).toBe('NOT_CONNECTED')
    expect(fetchAdInsights).not.toHaveBeenCalled()
  })

  it('ถูกหยุดเพราะโทเคน/สิทธิ์ → AUTH ไม่ยิง Graph', async () => {
    findUnique.mockResolvedValue({ adAccountId: '1234567890', stoppedReason: 'TOKEN_OR_PERMISSION' })
    expect((await getAdSpend('s1', '2026-11-01', '2026-11-14')).state).toBe('AUTH')
    expect(fetchAdInsights).not.toHaveBeenCalled()
  })

  it('คีย์แคชผูกร้าน + บัญชี + ช่วง (สองร้านไม่ใช้แคชร่วมกัน)', async () => {
    findUnique.mockResolvedValue({ adAccountId: '1234567890', stoppedReason: null, tokenEnc: 'x' })
    fetchAdInsights.mockResolvedValue({ state: 'OK', ...NONE })
    await getAdSpend('shopA', '2026-11-01', '2026-11-14')
    await getAdSpend('shopB', '2026-11-01', '2026-11-14')
    expect(keys[0]).toEqual(['ad-spend', 'shopA', '1234567890', '2026-11-01', '2026-11-14'])
    expect(keys[1]).toEqual(['ad-spend', 'shopB', '1234567890', '2026-11-01', '2026-11-14'])
  })

  it('ผลไม่สำเร็จคืนสถานะนั้นตรง ๆ (ผ่านทางโยน = ไม่ถูกแคช)', async () => {
    findUnique.mockResolvedValue({ adAccountId: '1234567890', stoppedReason: null, tokenEnc: 'x' })
    fetchAdInsights.mockResolvedValue({ state: 'CURRENCY', ...NONE, currency: 'USD' })
    const r = await getAdSpend('s1', '2026-11-01', '2026-11-14')
    expect(r.state).toBe('CURRENCY')
    expect(r.currency).toBe('USD')
    expect(stored).toEqual([])
  })

  it('แถวเชื่อมต่อหายระหว่างทาง → ERROR ผ่านทางโยน (ไม่คืนค่าปกติให้แคชเก็บ)', async () => {
    findUnique.mockResolvedValueOnce({ adAccountId: '1234567890', stoppedReason: null }).mockResolvedValueOnce(null)
    const r = await getAdSpend('s1', '2026-11-01', '2026-11-14')
    expect(r.state).toBe('ERROR')
    expect(fetchAdInsights).not.toHaveBeenCalled()
    expect(stored).toEqual([])
  })

  it('ผลสำเร็จถูกเก็บในแคช', async () => {
    findUnique.mockResolvedValue({ adAccountId: '1234567890', stoppedReason: null, tokenEnc: 'x' })
    fetchAdInsights.mockResolvedValue({ state: 'OK', ...NONE })
    await getAdSpend('s1', '2026-11-01', '2026-11-14')
    expect(stored).toHaveLength(1)
  })
})
