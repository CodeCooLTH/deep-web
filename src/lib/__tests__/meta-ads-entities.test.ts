import { describe, it, expect, vi } from 'vitest'
import { fetchEntities, parseCampaign, parseAdset, parseEntityAd } from '@/lib/meta-ads-entities'

// TODO(BRD §6): fixture จำลองตามเอกสาร Meta — ต้องแทนด้วย payload จริงของร้านนำร่อง
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })
const args = { adAccountId: '1234567890', token: 'TKN', adIds: ['111', '222'] }

describe('parser', () => {
  it('campaign/adset/ad: map ครบ · ไม่มี id = ทิ้ง · ไม่มี creative = thumbnail null', () => {
    expect(parseCampaign({ id: '1', name: 'c', objective: 'OUTCOME_SALES', effective_status: 'ACTIVE' })).toEqual({ id: '1', name: 'c', objective: 'OUTCOME_SALES', status: 'ACTIVE' })
    expect(parseCampaign({ name: 'x' })).toBeNull()
    expect(parseAdset({ id: '2', name: 's', effective_status: 'PAUSED', campaign_id: '1' })).toEqual({ id: '2', name: 's', status: 'PAUSED', campaignId: '1' })
    expect(parseEntityAd({ id: '3', effective_status: 'ACTIVE', adset_id: '2', campaign_id: '1', creative: { thumbnail_url: 'https://x/t.jpg' } })).toEqual({ id: '3', status: 'ACTIVE', adsetId: '2', campaignId: '1', thumbnailUrl: 'https://x/t.jpg' })
    expect(parseEntityAd({ id: '4' })).toMatchObject({ thumbnailUrl: null, adsetId: null })
  })
})

describe('fetchEntities', () => {
  it('E1/E2/E3: path+field ถูก · filtering ad.id ตัวเลขล้วน · token ใน header เท่านั้น', async () => {
    const calls: { url: string; auth: string | null }[] = []
    const doFetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url, auth: new Headers(init?.headers).get('Authorization') })
      if (url.includes('/campaigns?')) return json(200, { data: [{ id: '1', name: 'c', objective: 'MESSAGES', effective_status: 'ACTIVE' }] })
      if (url.includes('/adsets?')) return json(200, { data: [{ id: '2', name: 's', effective_status: 'ACTIVE', campaign_id: '1' }] })
      return json(200, { data: [{ id: '111', adset_id: '2', campaign_id: '1', effective_status: 'ACTIVE', creative: { thumbnail_url: 'https://t' } }] })
    }) as unknown as typeof fetch
    const r = await fetchEntities({ ...args, adIds: ['111', 'x;drop', '222'], doFetch })
    expect(r.state).toBe('OK')
    expect(r.campaigns).toHaveLength(1)
    expect(r.adsets[0].campaignId).toBe('1')
    expect(r.ads[0].thumbnailUrl).toBe('https://t')
    expect(calls.every((c) => c.auth === 'Bearer TKN' && !c.url.includes('TKN'))).toBe(true)
    const adUrl = new URL(calls.find((c) => c.url.includes('/ads?'))!.url)
    expect(JSON.parse(adUrl.searchParams.get('filtering')!)).toEqual([{ field: 'ad.id', operator: 'IN', value: ['111', '222'] }])
    expect(adUrl.searchParams.get('fields')).toContain('creative{thumbnail_url}')
  })

  it('ad id เกิน 200 → แบ่งหลายคำขอ ไม่ทิ้งเงียบ', async () => {
    const ids = Array.from({ length: 450 }, (_, i) => String(1000 + i))
    const urls: string[] = []
    const doFetch = (async (url: string) => { urls.push(url); return json(200, { data: [] }) }) as unknown as typeof fetch
    await fetchEntities({ ...args, adIds: ids, doFetch })
    expect(urls.filter((u) => u.includes('/ads?'))).toHaveLength(3)
  })

  it('ไม่มี ad id ที่ใช้ได้ → ไม่ยิง E3 · id บัญชีไม่ใช่ตัวเลข → ERROR ไม่ยิงเลย', async () => {
    const doFetch = vi.fn(async (_url: string) => json(200, { data: [] }))
    await fetchEntities({ ...args, adIds: ['x'], doFetch: doFetch as unknown as typeof fetch })
    expect(doFetch.mock.calls.every(([u]) => !String(u).includes('/ads?'))).toBe(true)
    const none = vi.fn()
    expect((await fetchEntities({ ...args, adAccountId: '../me', doFetch: none as unknown as typeof fetch })).state).toBe('ERROR')
    expect(none).not.toHaveBeenCalled()
  })

  it.each([[190, 'AUTH'], [17, 'ERROR'], [100, 'UNAVAILABLE']])('Graph code %i → %s (คำขอเดียวล้ม = ทั้งก้อนล้ม ไม่โชว์ครึ่ง ๆ)', async (code, state) => {
    const doFetch = (async (url: string) => (url.includes('/adsets?') ? json(400, { error: { code, message: 'x' } }) : json(200, { data: [] }))) as unknown as typeof fetch
    expect(await fetchEntities({ ...args, doFetch })).toEqual({ state, campaigns: [], adsets: [], ads: [] })
  })

  it('paging.next ชี้โฮสต์อื่น → ERROR (กัน token รั่ว) · ตามหน้า graph ได้', async () => {
    const evil = (async () => json(200, { data: [], paging: { next: 'https://evil.example/x' } })) as unknown as typeof fetch
    expect((await fetchEntities({ ...args, doFetch: evil })).state).toBe('ERROR')
    const doFetch = (async (url: string) => {
      if (url.includes('p2')) return json(200, { data: [{ id: '9', name: 'c9' }] })
      if (url.includes('/campaigns?')) return json(200, { data: [{ id: '8' }], paging: { next: 'https://graph.facebook.com/v21.0/act_1234567890/campaigns?p2=1' } })
      return json(200, { data: [] })
    }) as unknown as typeof fetch
    expect((await fetchEntities({ ...args, doFetch })).campaigns.map((c) => c.id)).toEqual(['8', '9'])
  })
})
