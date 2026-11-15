import { describe, expect, it } from 'vitest'
import { groupDaily, seriesOf } from '../buckets'
import type { DailyPoint } from '../types'

const P = (day: string, o: Partial<DailyPoint> = {}): DailyPoint => ({ day, sales: 100, coveredSales: 100, orders: 1, chats: 10, spend: 50, impressions: 1000, clicks: 10, chatsMeta: 5, reach: 800, ...o })

describe('groupDaily', () => {
  it('day = คืนเดิม label d/m', () => {
    const b = groupDaily([P('2026-11-02'), P('2026-11-03')], 'day')
    expect(b.map((x) => x.label)).toEqual(['2/11', '3/11']); expect(b[0].reach).toBe(800); expect(b[0].partial).toBe(false)
  })
  it('สัปดาห์จันทร์–อาทิตย์ (2026-11-02 = จันทร์) และ partial เมื่อไม่ครบ 7 วัน', () => {
    const full = ['02', '03', '04', '05', '06', '07', '08'].map((d) => P(`2026-11-${d}`))
    const b = groupDaily([...full, P('2026-11-09'), P('2026-11-10')], 'week')
    expect(b).toHaveLength(2)
    expect(b[0].day).toBe('2026-11-02'); expect(b[0].partial).toBe(false); expect(b[0].sales).toBe(700)
    expect(b[1].day).toBe('2026-11-09'); expect(b[1].partial).toBe(true)
  })
  it('อาทิตย์ถูกจัดเข้าสัปดาห์ของจันทร์ก่อนหน้า', () => {
    const b = groupDaily([P('2026-11-08'), P('2026-11-09')], 'week')
    expect(b.map((x) => x.day)).toEqual(['2026-11-02', '2026-11-09'])
  })
  it('เดือน: ผลรวม + partial', () => {
    const days = Array.from({ length: 30 }, (_, i) => P(`2026-11-${String(i + 1).padStart(2, '0')}`))
    const b = groupDaily([...days, P('2026-12-01')], 'month')
    expect(b[0].partial).toBe(false); expect(b[0].orders).toBe(30); expect(b[1].partial).toBe(true)
  })
  it('reach ข้ามวัน = null แต่ช่องวันเดียวคงค่า', () => {
    expect(groupDaily([P('2026-11-02'), P('2026-11-03')], 'week')[0].reach).toBeNull()
    expect(groupDaily([P('2026-11-02')], 'week')[0].reach).toBe(800)
  })
  it('null คงเป็น null ถ้าทุกจุด null · รวมเฉพาะที่มีค่า', () => {
    const b = groupDaily([P('2026-11-02', { spend: null }), P('2026-11-03', { spend: null })], 'week')
    expect(b[0].spend).toBeNull()
    const c = groupDaily([P('2026-11-02', { spend: null }), P('2026-11-03', { spend: 70 })], 'week')
    expect(c[0].spend).toBe(70)
  })
})

describe('seriesOf', () => {
  it('อัตราจาก Σ/Σ ไม่ใช่ค่าเฉลี่ยรายวัน', () => {
    // วัน A ctr 10% (10/100) วัน B ctr 1% (100/10000) → เฉลี่ย 5.5 แต่ Σ/Σ = 110/10100 = 1.09
    const b = groupDaily([P('2026-11-02', { clicks: 10, impressions: 100 }), P('2026-11-03', { clicks: 100, impressions: 10000 })], 'week')
    expect(seriesOf(b, 'ctr')).toEqual([1.09])
  })
  it('roas = coveredSales/spend · cpa = spend/orders · closeRate · aov', () => {
    const b = [P('2026-11-02', { sales: 400, coveredSales: 300, spend: 100, orders: 2, chats: 8 })]
    expect(seriesOf(b, 'roas')).toEqual([3]); expect(seriesOf(b, 'cpa')).toEqual([50]); expect(seriesOf(b, 'closeRate')).toEqual([25]); expect(seriesOf(b, 'aov')).toEqual([200])
  })
  it('ตัวหาร 0/null → null', () => {
    const b = [P('2026-11-02', { spend: null, orders: 0, clicks: 0, reach: null })]
    for (const k of ['roas', 'cpa', 'cpc', 'frequency', 'aov'] as const) expect(seriesOf(b, k)).toEqual([null])
  })
  it('cpm/costPerChatMeta/frequency', () => {
    const b = [P('2026-11-02')]
    expect(seriesOf(b, 'cpm')).toEqual([50]); expect(seriesOf(b, 'costPerChatMeta')).toEqual([10]); expect(seriesOf(b, 'frequency')).toEqual([1.25])
  })
})
