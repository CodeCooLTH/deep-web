import { describe, expect, it } from 'vitest'
import { buildSampleSummary, buildStaticSampleSummary, STATIC_SAMPLE_SHOPS } from '../preview-sample'
import { buildSummaryReportFlex } from '@/lib/line/flex-summary-report'
import { combineTotals } from '../aggregate'

const AT = '2026-10-05T14:02:00.000Z'
const flatText = (n: unknown): string[] => {
  if (!n || typeof n !== 'object') return []
  const o = n as Record<string, unknown>
  return [
    ...(typeof o.text === 'string' ? [o.text] : []),
    ...(Array.isArray(o.contents) ? o.contents.flatMap(flatText) : []),
    ...(o.body ? flatText(o.body) : []),
  ]
}

describe('preview-sample', () => {
  it('ร้านล็อก/ลบ → EXCLUDED (ได้บรรทัด "ไม่รวมร้าน" จาก builder จริง) และไม่นับยอด', () => {
    const s = buildSampleSummary({
      shops: [
        { id: 'a', name: 'ร้าน ก', vertical: 'ONLINE_SALES', state: 'OK' },
        { id: 'b', name: 'ร้าน ข', vertical: 'ONLINE_SALES', state: 'LOCKED' },
        { id: 'c', name: 'ร้าน ค', vertical: 'ONLINE_SALES', state: 'DELETED' },
      ],
      window: { startIso: '2026-10-05', endIso: '2026-10-05' },
      computedAtIso: AT,
    })
    expect(s.shops.map((x) => x.state)).toEqual(['OK', 'EXCLUDED', 'EXCLUDED'])
    expect(s.shops[1].excludedReason).toBe('LOCKED')
    expect(combineTotals(s.shops).orders).toBe(32)
    const text = flatText(buildSummaryReportFlex({ summary: s, kind: 'DAILY', showProfit: false })[0].contents).join('\n')
    expect(text).toContain('ไม่รวมร้าน ร้าน ข (ถูกล็อก)')
    expect(text).toContain('ไม่รวมร้าน ร้าน ค (ถูกลบ)')
  })
  it('ร้านตัวอย่างคงที่: deterministic + ไม่มีคำว่า "ออเดอร์" ในข้อความที่ builder ผัน (ร้านขายของ = คำสั่งซื้อ)', () => {
    const a = buildStaticSampleSummary('2026-10-05', AT)
    expect(a).toEqual(buildStaticSampleSummary('2026-10-05', AT))
    expect(a.shops).toHaveLength(STATIC_SAMPLE_SHOPS.length)
    const text = flatText(buildSummaryReportFlex({ summary: a, kind: 'DAILY', showProfit: false })[0].contents).join('\n')
    expect(text).not.toContain('ออเดอร์')
    expect(text).toContain('คำสั่งซื้อ')
    expect(text).not.toContain('กำไร')
  })
  it('computedAt มาจากผู้เรียกเท่านั้น', () => {
    expect(buildStaticSampleSummary('2026-10-05', AT).window.computedAt).toBe(AT)
  })
})
