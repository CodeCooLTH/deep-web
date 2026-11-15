import { describe, it, expect, vi } from 'vitest'
import { fetchAdInsights, classifyInsightsError } from '@/lib/meta-ads-insights'

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })
const acct = { name: 'ร้านทดสอบ', currency: 'THB', timezone_name: 'Asia/Bangkok' }
const args = { adAccountId: '1234567890', token: 'TKN', since: '2026-10-01', until: '2026-10-31' }

// แถวที่ไม่มี field ใหม่ของ 00094 = null ทั้งหมด (ไม่ใช่ 0)
const NO_EXTRA = { adsetId: null, adsetName: null, campaignId: null, campaignName: null, impressions: null, clicks: null, chatsMeta: null }

describe('fetchAdInsights', () => {
  it('00094: parse ลำดับชั้น + impressions/clicks/แชท Meta · ไม่มี action = null', async () => {
    const doFetch = (async (url: string) => {
      if (url.includes('/act_1234567890?')) return json(200, acct)
      return json(200, { data: [
        { ad_id: 'A', ad_name: 'a', adset_id: '11', adset_name: 's', campaign_id: '22', campaign_name: 'c', spend: '10', date_start: '2026-10-01',
          impressions: '1000', inline_link_clicks: '40', actions: [{ action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '7' }, { action_type: 'link_click', value: '40' }] },
        { ad_id: 'B', spend: '1', date_start: '2026-10-01', impressions: '5', actions: [] },
      ] })
    }) as unknown as typeof fetch
    const r = await fetchAdInsights({ ...args, doFetch })
    expect(r.rows[0]).toEqual({ adId: 'A', adName: 'a', day: '2026-10-01', spend: 10, adsetId: '11', adsetName: 's', campaignId: '22', campaignName: 'c', impressions: 1000, clicks: 40, chatsMeta: 7 })
    expect(r.rows[1]).toMatchObject({ impressions: 5, clicks: null, chatsMeta: null, adsetId: null })
  })

  it('ดึงบัญชี + แถวรายแอดรายวัน + ตามหน้า paging', async () => {
    const calls: { url: string; auth: string | null }[] = []
    const doFetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url, auth: new Headers(init?.headers).get('Authorization') })
      if (url.includes('/act_1234567890?')) return json(200, acct)
      if (url.includes('page2')) return json(200, { data: [{ ad_id: 'B', ad_name: 'b', spend: '5.5', date_start: '2026-10-02' }] })
      return json(200, {
        data: [{ ad_id: 'A', ad_name: 'a', spend: '10.25', date_start: '2026-10-01', campaign_id: 111, campaign_name: 'แคมเปญ', adset_id: '222', adset_name: 'ชุด' }],
        paging: { next: 'https://graph.facebook.com/v21.0/act_1234567890/insights?page2=1' },
      })
    }) as unknown as typeof fetch
    const r = await fetchAdInsights({ ...args, doFetch })
    expect(r).toEqual({
      state: 'OK', accountName: 'ร้านทดสอบ', currency: 'THB', tz: 'Asia/Bangkok',
      rows: [
        { adId: 'A', adName: 'a', day: '2026-10-01', spend: 10.25, ...NO_EXTRA, campaignId: '111', campaignName: 'แคมเปญ', adsetId: '222', adsetName: 'ชุด' },
        { adId: 'B', adName: 'b', day: '2026-10-02', spend: 5.5, ...NO_EXTRA },
      ],
    })
    expect(calls.every((c) => c.auth === 'Bearer TKN')).toBe(true)
    const first = calls.find((c) => c.url.includes('/insights'))!.url
    expect(first).toContain('level=ad')
    expect(first).toContain('time_increment=1')
    expect(first).toContain('campaign_id') // FR-012 ลำดับชั้นมาจาก query เดิม
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
