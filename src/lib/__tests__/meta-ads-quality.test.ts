import { describe, it, expect, vi } from 'vitest'
import { fetchQuality, classifyQualityError, actionValue, videoValue, parseAdRow, ACTION } from '@/lib/meta-ads-quality'

// TODO(BRD §6): fixture จำลองตามรูปร่างในเอกสาร Meta — ต้องแทนด้วย payload จริงที่จับจากร้านนำร่อง
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })
const args = { adAccountId: '1234567890', token: 'TKN', since: '2026-10-01', until: '2026-10-31' }
const act = (t: string, v: string) => ({ action_type: t, value: v })

describe('parser', () => {
  it('action ที่ไม่มี = null · "0" จริง = 0 · ไม่มี actions เลย = null', () => {
    const actions = [act(ACTION.started, '88'), act(ACTION.block, '0')]
    expect(actionValue(actions, ACTION.started)).toBe(88)
    expect(actionValue(actions, ACTION.block)).toBe(0)
    expect(actionValue(actions, ACTION.depth3)).toBeNull()
    expect(actionValue(undefined, ACTION.started)).toBeNull()
  })
  it('video field ไม่มี = null · มี = ตัวเลข', () => {
    expect(videoValue(undefined)).toBeNull()
    expect(videoValue([])).toBeNull()
    expect(videoValue([{ action_type: 'video_view', value: '42' }])).toBe(42)
  })
  it('แถวแอด: map ครบ + ไม่อ่าน purchase · ไม่มี ad_id = ทิ้ง', () => {
    const r = parseAdRow({
      ad_id: '111', ad_name: 'โปร', adset_name: 'ชุด', campaign_name: 'แคมเปญ', impressions: '1000', reach: '400', inline_link_clicks: '30',
      actions: [act(ACTION.started, '10'), act('purchase', '99')], video_thruplay_watched_actions: [act('video_view', '7')],
    })
    expect(r).toMatchObject({ adId: '111', chats: 10, depth2: null, clicks: 30, impressions: 1000, video: { thruplay: 7, p25: null } })
    expect(JSON.stringify(r)).not.toContain('99')
    expect(parseAdRow({ ad_name: 'x' })).toBeNull()
  })
})

describe('fetchQuality', () => {
  it('Q1: พารามิเตอร์ครบ + token อยู่ใน header เท่านั้น + ตามหน้า paging', async () => {
    const calls: { url: string; auth: string | null }[] = []
    const doFetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url, auth: new Headers(init?.headers).get('Authorization') })
      if (url.includes('page2')) return json(200, { data: [{ ad_id: '2', impressions: '5' }] })
      return json(200, { data: [{ ad_id: '1', actions: [act(ACTION.started, '3')] }], paging: { next: 'https://graph.facebook.com/v21.0/act_1234567890/insights?page2=1' } })
    }) as unknown as typeof fetch
    const r = await fetchQuality({ ...args, kind: 'ad', doFetch })
    expect(r.state).toBe('OK')
    expect(r.rows.map((x) => x.adId)).toEqual(['1', '2'])
    expect(calls.every((c) => c.auth === 'Bearer TKN' && !c.url.includes('TKN'))).toBe(true)
    const u = new URL(calls[0].url)
    expect(u.searchParams.get('level')).toBe('ad')
    expect(u.searchParams.get('action_report_time')).toBe('conversion')
    expect(u.searchParams.get('time_increment')).toBeNull()
    expect(u.searchParams.get('fields')).toContain('video_thruplay_watched_actions')
    expect(u.searchParams.get('fields')).not.toContain('purchase')
  })

  it('Q3/Q4: breakdown + filtering ad.id เฉพาะตัวเลขล้วน · Q1 ไม่ส่ง filtering', async () => {
    const urls: string[] = []
    const doFetch = (async (url: string) => { urls.push(url); return json(200, { data: [] }) }) as unknown as typeof fetch
    await fetchQuality({ ...args, kind: 'placement', adIds: ['123', 'x;drop'], doFetch })
    await fetchQuality({ ...args, kind: 'agegender', doFetch })
    await fetchQuality({ ...args, kind: 'ad', adIds: ['123'], doFetch })
    const [p, g, a] = urls.map((u) => new URL(u).searchParams)
    expect(p.get('breakdowns')).toBe('publisher_platform,platform_position')
    expect(JSON.parse(p.get('filtering')!)).toEqual([{ field: 'ad.id', operator: 'IN', value: ['123'] }])
    expect(g.get('breakdowns')).toBe('age,gender')
    expect(g.get('filtering')).toBeNull()
    expect(a.get('filtering')).toBeNull()
  })

  it('data ว่าง = OK + rows ว่าง (การ์ดแยก "ไม่มีข้อมูลจาก Meta" ไม่ใช่ 0)', async () => {
    const r = await fetchQuality({ ...args, kind: 'account', doFetch: (async () => json(200, { data: [] })) as unknown as typeof fetch })
    expect(r).toEqual({ state: 'OK', rows: [] })
  })

  it('Q3/Q4 parse: ตำแหน่ง/อายุ-เพศ', async () => {
    const p = await fetchQuality({ ...args, kind: 'placement', doFetch: (async () => json(200, { data: [{ publisher_platform: 'facebook', platform_position: 'feed', spend: '12.5', impressions: '100', inline_link_clicks: '4', actions: [act(ACTION.started, '2')] }] })) as unknown as typeof fetch })
    expect(p.rows[0]).toEqual({ platform: 'facebook', position: 'feed', spend: 12.5, impressions: 100, clicks: 4, chats: 2 })
    const g = await fetchQuality({ ...args, kind: 'agegender', doFetch: (async () => json(200, { data: [{ age: '25-34', gender: 'female', spend: '5', impressions: '9', reach: '8' }] })) as unknown as typeof fetch })
    expect(g.rows[0]).toEqual({ age: '25-34', gender: 'female', spend: 5, impressions: 9, reach: 8, chats: null })
  })

  it('รหัสบัญชีไม่ใช่ตัวเลขล้วน → ERROR ไม่ยิง Graph', async () => {
    const doFetch = vi.fn()
    expect((await fetchQuality({ ...args, kind: 'ad', adAccountId: '../me', doFetch: doFetch as unknown as typeof fetch })).state).toBe('ERROR')
    expect(doFetch).not.toHaveBeenCalled()
  })

  it('paging.next โฮสต์อื่น / เกิน MAX_PAGES → ERROR (ห้ามตัวเลขบางส่วน)', async () => {
    const evil = (async () => json(200, { data: [{ ad_id: '1' }], paging: { next: 'https://evil.example/x' } })) as unknown as typeof fetch
    expect((await fetchQuality({ ...args, kind: 'ad', doFetch: evil })).state).toBe('ERROR')
    const endless = (async () => json(200, { data: [{ ad_id: '1' }], paging: { next: 'https://graph.facebook.com/v21.0/x?p=1' } })) as unknown as typeof fetch
    expect((await fetchQuality({ ...args, kind: 'ad', doFetch: endless })).state).toBe('ERROR')
  })

  it('timeout / ต่อไม่ติด → ERROR ไม่ throw', async () => {
    const hang = ((_u: string, init?: RequestInit) => new Promise((_r, rej) => init?.signal?.addEventListener('abort', () => rej(new Error('aborted'))))) as unknown as typeof fetch
    expect((await fetchQuality({ ...args, kind: 'ad', doFetch: hang, timeoutMs: 20 })).state).toBe('ERROR')
    expect((await fetchQuality({ ...args, kind: 'ad', doFetch: (async () => { throw new Error('net') }) as unknown as typeof fetch })).state).toBe('ERROR')
  })
})

describe('classifyQualityError', () => {
  it.each([
    [190, 'x', 'AUTH'], [200, 'x', 'AUTH'], [17, 'x', 'ERROR'], [80004, 'x', 'ERROR'], [613, 'x', 'ERROR'], [4, 'x', 'ERROR'],
    [100, 'Invalid parameter', 'UNAVAILABLE'], [1, 'This breakdown requires async report', 'UNAVAILABLE'], [1, 'Please reduce the amount of data', 'ERROR'],
  ])('code %i (%s) → %s', (code, message, want) => expect(classifyQualityError(400, { error: { code, message } })).toBe(want))
  it('5xx ไม่มี body → ERROR', () => expect(classifyQualityError(503, null)).toBe('ERROR'))
})
