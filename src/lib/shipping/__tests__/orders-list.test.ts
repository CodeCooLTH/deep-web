import { describe, it, expect } from 'vitest'
import {
  hoverFetchPlan, planBulkPrint, parseSkippedDetail, buildSkippedEntries, skippedListHtml,
  podMapUrl, podCopyLines, podTimeIso, FLASH_ONE_BY_ONE, type BulkLabelRow,
} from '../orders-list'

const row = (o: Partial<BulkLabelRow>): BulkLabelRow => ({
  token: 'T1', orderLabel: '#1', recipient: 'สมชาย', shipmentId: 's1', provider: 'ISHIP', status: 'CREATED', ...o,
})

describe('hoverFetchPlan', () => {
  it('ISHIP/FLASH ใช้ base ตาม provider', () => {
    expect(hoverFetchPlan({ provider: 'FLASH', shipmentId: 'x', status: 'CREATED' }))
      .toEqual({ kind: 'fetch', url: '/api/seller/flash/shipments/x/traces' })
    expect(hoverFetchPlan({ provider: 'ISHIP', shipmentId: 'x' }))
      .toEqual({ kind: 'fetch', url: '/api/seller/iship/shipments/x/traces' })
  })
  it('NEEDS_REVIEW ไม่ยิง · ไม่มี id ไม่ยิง', () => {
    expect(hoverFetchPlan({ provider: 'FLASH', shipmentId: 'x', status: 'NEEDS_REVIEW' }).kind).toBe('review')
    expect(hoverFetchPlan({ provider: 'MANUAL', shipmentId: null }).kind).toBe('none')
  })
})

describe('planBulkPrint', () => {
  it('มีแต่ Flash: 1 ใบ = single, ≥2 = list · ปน = bulk', () => {
    expect(planBulkPrint([row({ provider: 'FLASH' })])).toBe('single-flash')
    expect(planBulkPrint([row({ provider: 'FLASH' }), row({ provider: 'FLASH', token: 'T2' })])).toBe('flash-list')
    expect(planBulkPrint([row({ provider: 'FLASH' }), row({})])).toBe('bulk')
    expect(planBulkPrint([row({})])).toBe('bulk')
  })
})

describe('buildSkippedEntries', () => {
  it('จับคู่ด้วย shipmentId และ token · ใบ Flash มีลิงก์ · printed นับเฉพาะที่พิมพ์จริง', () => {
    const rows = [
      row({ token: 'A', shipmentId: 'sa' }),
      row({ token: 'B', shipmentId: 'sb', provider: 'FLASH', orderLabel: '#2' }),
      row({ token: 'C', shipmentId: null, provider: null, status: null, orderLabel: '#3' }),
    ]
    const skipped = parseSkippedDetail(encodeURIComponent(JSON.stringify([
      { shipmentId: 'sb', reason: FLASH_ONE_BY_ONE },
      { shipmentId: 'C', reason: 'ยังไม่ได้สร้างพัสดุสำหรับคำสั่งซื้อนี้' },
    ])))
    const { entries, printed } = buildSkippedEntries(rows, skipped, 2)
    expect(printed).toBe(1)
    expect(entries.map((e) => e.orderLabel)).toEqual(['#2', '#3'])
    expect(entries[0].flashShipmentId).toBe('sb')
    expect(entries[1].flashShipmentId).toBeNull()
  })
  it('ใบ Flash ที่ server ไม่รายงานก็ต้องขึ้น · NEEDS_REVIEW ไม่มีลิงก์', () => {
    const rows = [row({ provider: 'FLASH' }), row({ token: 'Z', provider: 'FLASH', shipmentId: 'sz', status: 'NEEDS_REVIEW' })]
    const { entries, printed } = buildSkippedEntries(rows, [])
    expect(entries).toHaveLength(2)
    expect(entries[0].flashShipmentId).toBe('s1')
    expect(entries[1].flashShipmentId).toBeNull()
    expect(printed).toBe(0)
  })
  it('detail พัง แต่ header บอกข้าม 2 ⇒ printed ไม่เกินจริง', () => {
    expect(parseSkippedDetail('%E0%A4')).toEqual([])
    expect(buildSkippedEntries([row({}), row({ token: 'B' }), row({ token: 'C' })], [], 2).printed).toBe(1)
  })
})

describe('skippedListHtml', () => {
  it('escape ข้อมูลผู้ใช้ · ลิงก์ noopener + min-h-11', () => {
    const html = skippedListHtml(
      [{ orderLabel: '#1', recipient: '<img onerror=x>', reason: 'r', flashShipmentId: 'abc' }], 'intro')
    expect(html).not.toContain('<img')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('/api/seller/flash/shipments/abc/label')
    expect(html).toContain('min-h-11')
  })
})

describe('POD helpers', () => {
  it('podMapUrl / podTimeIso', () => {
    expect(podMapUrl(13.7, 100.5)).toBe('https://www.google.com/maps?q=13.7,100.5')
    expect(podMapUrl(null, 100)).toBeNull()
    expect(podTimeIso('1612762153')).toBe(new Date(1612762153000).toISOString())
    expect(podTimeIso('2026-10-22T09:28:00Z')).toBe('2026-10-22T09:28:00.000Z')
    expect(podTimeIso('ไม่ใช่เวลา')).toBeNull()
  })
  it('podCopyLines ข้ามช่องว่าง', () => {
    const lines = podCopyLines(
      { signer: 'สมชาย', signerTypeText: 'ผู้รับเอง', podUrl: null, photos: ['u1'], lat: 1, lng: 2, deliveredAt: null },
      (s) => s,
    )
    expect(lines).toEqual(['  ผู้เซ็นรับ: สมชาย (ผู้รับเอง)', '  ตำแหน่งพนักงานตอนส่ง: 1, 2', '  รูปที่ 1: u1'])
  })
})
