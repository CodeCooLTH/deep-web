import { describe, expect, it } from 'vitest'

import { fetchSpendBeforeHour } from './meta-ads-hourly'

const ok = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch
const row = (h: string, spend: string) => ({ spend, hourly_stats_aggregated_by_advertiser_time_zone: `${h}:00:00 - ${h}:59:59` })
const base = { adAccountId: '123456', token: 't', day: '2026-11-15' }

describe('fetchSpendBeforeHour', () => {
  it('รวมเฉพาะชั่วโมงก่อนเวลาตัด', async () => {
    const r = await fetchSpendBeforeHour({ ...base, beforeHour: 10, doFetch: ok({ data: [row('08', '10.5'), row('09', '20.25'), row('10', '99'), row('23', '1')] }) })
    expect(r).toEqual({ state: 'OK', spend: 30.75 })
  })
  it('ชั่วโมงอ่านไม่ออก = ERROR (ไม่เดา)', async () => {
    const r = await fetchSpendBeforeHour({ ...base, beforeHour: 10, doFetch: ok({ data: [{ spend: '5' }] }) })
    expect(r.state).toBe('ERROR')
  })
  it('ไม่มีแถวเลย = UNAVAILABLE ไม่ใช่ 0 (บัญชีที่ไม่ได้เปิด breakdown รายชั่วโมง)', async () => {
    const r = await fetchSpendBeforeHour({ ...base, beforeHour: 10, doFetch: ok({ data: [] }) })
    expect(r.state).toBe('UNAVAILABLE')
  })
  it('token หมดอายุ = AUTH', async () => {
    const r = await fetchSpendBeforeHour({ ...base, beforeHour: 10, doFetch: ok({ error: { code: 190 } }, 400) })
    expect(r.state).toBe('AUTH')
  })
  it('paging นอกโฮสต์ Graph = ERROR', async () => {
    const r = await fetchSpendBeforeHour({ ...base, beforeHour: 10, doFetch: ok({ data: [], paging: { next: 'https://evil.example/x' } }) })
    expect(r.state).toBe('ERROR')
  })
})
