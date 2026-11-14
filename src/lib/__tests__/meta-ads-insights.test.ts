import { describe, it, expect, vi } from 'vitest'
import { fetchAdInsights, classifyInsightsError } from '@/lib/meta-ads-insights'

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })
const acct = { name: 'ร้านทดสอบ', currency: 'THB', timezone_name: 'Asia/Bangkok' }
const args = { adAccountId: '1234567890', token: 'TKN', since: '2026-10-01', until: '2026-10-31' }

describe('fetchAdInsights', () => {
  it('ดึงบัญชี + แถวรายแอดรายวัน + ตามหน้า paging', async () => {
    const calls: { url: string; auth: string | null }[] = []
    const doFetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url, auth: new Headers(init?.headers).get('Authorization') })
      if (url.includes('/act_1234567890?')) return json(200, acct)
      if (url.includes('page2')) return json(200, { data: [{ ad_id: 'B', ad_name: 'b', spend: '5.5', date_start: '2026-10-02' }] })
      return json(200, {
        data: [{ ad_id: 'A', ad_name: 'a', spend: '10.25', date_start: '2026-10-01' }],
        paging: { next: 'https://graph.facebook.com/v21.0/act_1234567890/insights?page2=1' },
      })
    }) as unknown as typeof fetch
    const r = await fetchAdInsights({ ...args, doFetch })
    expect(r).toEqual({
      state: 'OK', accountName: 'ร้านทดสอบ', currency: 'THB', tz: 'Asia/Bangkok',
      rows: [{ adId: 'A', adName: 'a', day: '2026-10-01', spend: 10.25 }, { adId: 'B', adName: 'b', day: '2026-10-02', spend: 5.5 }],
    })
    expect(calls.every((c) => c.auth === 'Bearer TKN')).toBe(true)
    const first = calls.find((c) => c.url.includes('/insights'))!.url
    expect(first).toContain('level=ad')
    expect(first).toContain('time_increment=1')
    expect(first).not.toContain('TKN') // token ห้ามอยู่ใน URL
  })

  it('รหัสบัญชีไม่ใช่ตัวเลขล้วน → ERROR และไม่ยิง Graph เลย (กัน path ที่แนบ token)', async () => {
    const doFetch = vi.fn()
    const r = await fetchAdInsights({ ...args, adAccountId: '../me', doFetch: doFetch as unknown as typeof fetch })
    expect(r.state).toBe('ERROR')
    expect(doFetch).not.toHaveBeenCalled()
  })

  it('สกุลเงินไม่ใช่ THB → CURRENCY (ไม่เรียก insights)', async () => {
    const doFetch = (async () => json(200, { ...acct, currency: 'USD' })) as unknown as typeof fetch
    const r = await fetchAdInsights({ ...args, doFetch })
    expect(r).toMatchObject({ state: 'CURRENCY', currency: 'USD', rows: [] })
  })

  it.each([[190, 'AUTH'], [200, 'AUTH'], [10, 'AUTH'], [4, 'ERROR'], [17, 'ERROR'], [32, 'ERROR'], [613, 'ERROR'], [1, 'ERROR']])('Graph code %i → %s', async (code, state) => {
    const doFetch = (async () => json(400, { error: { code, message: 'x' } })) as unknown as typeof fetch
    expect((await fetchAdInsights({ ...args, doFetch })).state).toBe(state)
  })

  it('5xx / ต่อไม่ติด / timeout → ERROR (ไม่ throw)', async () => {
    expect((await fetchAdInsights({ ...args, doFetch: (async () => json(503, {})) as unknown as typeof fetch })).state).toBe('ERROR')
    expect((await fetchAdInsights({ ...args, doFetch: (async () => { throw new Error('net') }) as unknown as typeof fetch })).state).toBe('ERROR')
    const hang = ((_u: string, init?: RequestInit) => new Promise((_r, rej) => init?.signal?.addEventListener('abort', () => rej(new Error('aborted'))))) as unknown as typeof fetch
    expect((await fetchAdInsights({ ...args, doFetch: hang, timeoutMs: 20 })).state).toBe('ERROR')
  })

  it('paging.next ชี้โฮสต์อื่น → ไม่ตาม (กัน token รั่ว) = ERROR', async () => {
    const doFetch = (async (url: string) => {
      if (url.includes('/act_1234567890?')) return json(200, acct)
      return json(200, { data: [], paging: { next: 'https://evil.example/x' } })
    }) as unknown as typeof fetch
    expect((await fetchAdInsights({ ...args, doFetch })).state).toBe('ERROR')
  })
})

describe('classifyInsightsError', () => {
  it('จับคู่รหัส', () => {
    expect(classifyInsightsError(400, { error: { code: 190 } })).toBe('AUTH')
    expect(classifyInsightsError(500, null)).toBe('ERROR')
    expect(classifyInsightsError(0, null)).toBe('ERROR')
  })
})
