import { describe, it, expect, vi, beforeEach } from 'vitest'

const keys: unknown[][] = []
const stored: unknown[] = []
vi.mock('next/cache', () => ({
  // แคชจำลอง: จดคีย์ + สิ่งที่ "ถูกเก็บ" — โยน = ไม่ถูกเก็บ ตามพฤติกรรมจริงของ unstable_cache
  unstable_cache: (fn: (...a: unknown[]) => Promise<unknown>, key: unknown[]) => {
    keys.push(key)
    return async (...a: unknown[]) => { const v = await fn(...a); stored.push(v); return v }
  },
}))
const findUnique = vi.fn()
vi.mock('@/lib/prisma', () => ({ prisma: { metaAudienceConnection: { findUnique: (...a: unknown[]) => findUnique(...a) } } }))
vi.mock('@/lib/token-crypto', () => ({ decryptToken: () => 'TKN' }))
const fetchQuality = vi.fn()
vi.mock('@/lib/meta-ads-quality', () => ({ fetchQuality: (...a: unknown[]) => fetchQuality(...a) }))

import { getQualityBundle } from '@/services/meta-ads-quality.service'

const base = { shopId: 'shopA', since: '2026-10-01', until: '2026-10-31' }
const conn = { adAccountId: '1234567890', stoppedReason: null, tokenEnc: 'x' }
beforeEach(() => { keys.length = 0; stored.length = 0; findUnique.mockReset(); fetchQuality.mockReset() })

describe('getQualityBundle', () => {
  it('คีย์แคชผูก ชนิดคำขอ + ร้าน + บัญชี + ช่วง + ชุดแอด (สองร้าน/สองชุดแอดไม่ใช้แคชร่วมกัน)', async () => {
    findUnique.mockResolvedValue(conn)
    fetchQuality.mockResolvedValue({ state: 'OK', rows: [{ x: 1 }] })
    await Promise.all(Object.values(getQualityBundle({ ...base, adId: '999' })))
    await getQualityBundle({ ...base, shopId: 'shopB' }).placement
    const k = Object.fromEntries(keys.map((x) => [`${x[1]}|${x[2]}|${x[6]}`, x]))
    expect(Object.keys(k)).toContain('ad|shopA|all')
    expect(Object.keys(k)).toContain('account|shopA|all')
    expect(keys.filter((x) => x[1] === 'placement').map((x) => x[6]).length).toBe(2)
    expect(keys.find((x) => x[1] === 'placement' && x[2] === 'shopA')![6]).not.toBe('all') // กรองแอดเดียว
    expect(keys.find((x) => x[2] === 'shopB')![3]).toBe('1234567890')
  })

  it('แคชเฉพาะผลสำเร็จ: OK ถูกเก็บ · AUTH/ERROR/UNAVAILABLE ผ่านทางโยน (ไม่ถูกเก็บ) และคืนสถานะตรง ๆ', async () => {
    findUnique.mockResolvedValue(conn)
    fetchQuality.mockResolvedValue({ state: 'OK', rows: [{ x: 1 }] })
    const b = getQualityBundle(base) // ยิงครบ 4 คำขอทันที
    const ok = await b.ad
    await Promise.all(Object.values(b))
    expect(ok).toMatchObject({ status: 'OK' })
    expect(ok.fetchedAt).toBeTypeOf('number')
    expect(stored).toHaveLength(4)

    stored.length = 0
    for (const s of ['AUTH', 'ERROR', 'UNAVAILABLE'] as const) {
      fetchQuality.mockResolvedValue({ state: s, rows: [] })
      expect(await getQualityBundle(base).ad).toMatchObject({ status: s, rows: [], fetchedAt: null })
    }
    expect(stored).toEqual([])
  })

  it('คำตอบสำเร็จแต่ data ว่าง → EMPTY (ไม่ใช่ 0 / ไม่ใช่ error)', async () => {
    findUnique.mockResolvedValue(conn)
    fetchQuality.mockResolvedValue({ state: 'OK', rows: [] })
    expect(await getQualityBundle(base).account).toMatchObject({ status: 'EMPTY' })
  })

  it('คำขอหนึ่งล้มไม่ลากการ์ดอื่น (FR-008)', async () => {
    findUnique.mockResolvedValue(conn)
    fetchQuality.mockImplementation(async (a: { kind: string }) => (a.kind === 'placement' ? { state: 'UNAVAILABLE', rows: [] } : { state: 'OK', rows: [{ x: 1 }] }))
    const b = getQualityBundle(base)
    expect(await b.placement).toMatchObject({ status: 'UNAVAILABLE' })
    expect(await b.ad).toMatchObject({ status: 'OK' })
    expect(await b.agegender).toMatchObject({ status: 'OK' })
  })

  it('เลือกเพจแต่ไม่มีแอดมีแชท ([]) → EMPTY โดยไม่ยิง Graph · แอดเดียวชนะชุดเพจ', async () => {
    findUnique.mockResolvedValue(conn)
    const b = getQualityBundle({ ...base, scopeAdIds: [] })
    expect(await b.placement).toMatchObject({ status: 'EMPTY' })
    expect(fetchQuality).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'placement' }))
    fetchQuality.mockResolvedValue({ state: 'OK', rows: [{ x: 1 }] })
    await getQualityBundle({ ...base, scopeAdIds: ['1', '2'], adId: '3' }).placement
    expect(fetchQuality).toHaveBeenCalledWith(expect.objectContaining({ kind: 'placement', adIds: ['3'] }))
  })

  it('ถูกหยุดเพราะโทเคน/สิทธิ์ → AUTH ไม่ยิง Graph · ไม่มีแถวเชื่อมต่อ → ERROR ไม่ยิง Graph', async () => {
    findUnique.mockResolvedValue({ ...conn, stoppedReason: 'TOKEN_OR_PERMISSION' })
    expect(await getQualityBundle(base).ad).toMatchObject({ status: 'AUTH' })
    findUnique.mockRejectedValue(new Error('db'))
    expect(await getQualityBundle(base).ad).toMatchObject({ status: 'ERROR' })
    expect(fetchQuality).not.toHaveBeenCalled()
  })

})


