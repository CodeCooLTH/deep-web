import { describe, expect, it } from 'vitest'
import { fetchAdDetails } from './meta-ads-details'

const res = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as unknown as Response

describe('fetchAdDetails', () => {
  it('reach/ความถี่จาก insights ช่วงเดียว + สถานะ/วัตถุประสงค์จาก /ads · token อยู่ใน header ไม่อยู่ใน URL', async () => {
    const urls: string[] = []
    const auth: string[] = []
    const doFetch = (async (url: string, init: RequestInit) => {
      urls.push(url); auth.push((init.headers as Record<string, string>).Authorization)
      if (url.includes('/insights')) return res({ data: [{ ad_id: '11', reach: '1000', frequency: '1.8' }, { ad_id: '22', reach: '50' }] })
      return res({ data: [{ id: '11', effective_status: 'ACTIVE', campaign: { objective: 'OUTCOME_ENGAGEMENT' } }] })
    }) as unknown as typeof fetch
    const r = await fetchAdDetails({ adAccountId: '123456', token: 'SECRET', since: '2026-11-01', until: '2026-11-16', doFetch })
    expect(r.state).toBe('OK')
    expect(r.ads['11']).toEqual({ reach: 1000, frequency: 1.8, status: 'ACTIVE', objective: 'OUTCOME_ENGAGEMENT' })
    expect(r.ads['22']).toEqual({ reach: 50, frequency: null, status: null, objective: null })
    expect(urls.every((u) => !u.includes('SECRET'))).toBe(true)
    expect(auth.every((h) => h === 'Bearer SECRET')).toBe(true)
    expect(urls[0]).not.toContain('time_increment')
  })
  it('โทเคนหมด = AUTH · บัญชีไม่ใช่ตัวเลข = ERROR ไม่ยิง', async () => {
    const doFetch = (async () => res({ error: { code: 190 } }, 400)) as unknown as typeof fetch
    expect((await fetchAdDetails({ adAccountId: '123456', token: 't', since: 'a', until: 'b', doFetch })).state).toBe('AUTH')
    expect((await fetchAdDetails({ adAccountId: '12/../x', token: 't', since: 'a', until: 'b', doFetch })).state).toBe('ERROR')
  })
  it('paging ไปโฮสต์อื่น = ERROR (กัน token รั่ว)', async () => {
    const doFetch = (async () => res({ data: [], paging: { next: 'https://evil.example/x' } })) as unknown as typeof fetch
    expect((await fetchAdDetails({ adAccountId: '123456', token: 't', since: 'a', until: 'b', doFetch })).state).toBe('ERROR')
  })
})
