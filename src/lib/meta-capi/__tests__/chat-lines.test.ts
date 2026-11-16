// feature 00097 — TC-008..011 · TC-014: รวมกลุ่ม · ผลของกลุ่ม · แทรกไทม์ไลน์ · รวมบรรทัดติดกัน · fast-refresh
import { describe, expect, it } from 'vitest'
import {
  buildCapiTimeline, capiGroupResult, capiLineSummary, layoutCapiDays, capiNeedsFastRefresh, groupCapiRows,
  type CapiDatasetResult, type CapiLineGroup, type CapiRowLite, type CapiStatus,
} from '@/lib/meta-capi/chat-lines'
import type { CapiReasonKey } from '@/lib/meta-capi/ui'

let n = 0
const row = (o: Partial<CapiRowLite> & { label?: string | null; datasetId?: string }): CapiRowLite => ({
  id: `r${++n}`, dedupeKey: 'k1', eventKey: 'PURCHASE', status: 'SENT', reason: null, attempts: 1, sentAt: null,
  createdAt: '2026-11-16T04:20:00.000Z', payload: { value: 1070 },
  dataset: { label: o.label === undefined ? 'หลัก' : o.label, datasetId: o.datasetId ?? '111' },
  ...o,
}) as CapiRowLite

const ds = (status: CapiStatus, reasonKey: CapiReasonKey = 'none', sentAt: string | null = null): CapiDatasetResult =>
  ({ label: 'x', datasetId: '1', status, reasonKey, attempts: 1, sentAt })
const grp = (datasets: CapiDatasetResult[], at = '2026-11-16T04:00:00.000Z', id = at): CapiLineGroup => ({ id, eventKey: 'PURCHASE', at, value: null, datasets })
const SENT = grp([ds('SENT'), ds('SENT')])

describe('groupCapiRows (TC-008)', () => {
  it('รวมตาม dedupeKey · at = createdAt เก่าสุด · เรียงเก่า→ใหม่ · ชุดเรียงตามชื่อ', () => {
    const g = groupCapiRows([
      row({ id: 'b', dedupeKey: 'k1', label: 'เว็บ', datasetId: '2', status: 'PENDING', reason: 'RETRYING', createdAt: '2026-11-16T04:21:00.000Z' }),
      row({ id: 'a', dedupeKey: 'k1', label: 'หลัก', datasetId: '1', createdAt: '2026-11-16T04:20:00.000Z', sentAt: '2026-11-16T04:20:41.000Z' }),
      row({ id: 'c', dedupeKey: 'k0', eventKey: 'ADD_PAYMENT_INFO', createdAt: '2026-11-16T04:10:00.000Z' }),
    ])
    expect(g.map((x) => x.eventKey)).toEqual(['ADD_PAYMENT_INFO', 'PURCHASE'])
    expect(g[1].at).toBe('2026-11-16T04:20:00.000Z')
    expect(g[1].datasets.map((d) => [d.label, d.reasonKey, d.sentAt])).toEqual([['เว็บ', 'retrying', null], ['หลัก', 'none', '2026-11-16T04:20:41.000Z']])
    expect(g[1].id).toBe('b') // แถวแรกตามลำดับชื่อชุด ("เว็บ" < "หลัก")
    expect(g[1].value).toBe(1070)
  })
  it('payload ไม่ใช่ object / value ไม่ใช่ตัวเลข = null · ผลไม่มี dedupeKey/reason ดิบ', () => {
    const g = groupCapiRows([row({ payload: 'x' }), row({ dedupeKey: 'k2', payload: { value: 'NaN' } }), row({ dedupeKey: 'k3', payload: null })])
    expect(g.map((x) => x.value)).toEqual([null, null, null])
    expect(JSON.stringify(g)).not.toMatch(/dedupeKey|"reason"|psid/)
  })
  it('label null → คืน null (UI ใช้ datasetId) · เรียงด้วย datasetId', () => {
    const g = groupCapiRows([row({ label: null, datasetId: '9' }), row({ label: null, datasetId: '10' })])
    expect(g[0].datasets.map((d) => d.datasetId)).toEqual(['10', '9'])
    expect(g[0].datasets[0].label).toBeNull()
  })
})

describe('capiGroupResult (TC-008)', () => {
  it('ทุกชุด SENT = uniform SENT + sentAt = max', () => {
    const r = capiGroupResult({ datasets: [ds('SENT', 'none', '2026-11-16T04:00:00.000Z'), ds('SENT', 'none', '2026-11-16T04:05:00.000Z')] })
    expect(r).toMatchObject({ kind: 'uniform', status: 'SENT', okCount: 2, total: 2, worst: 'SENT', sentAt: '2026-11-16T04:05:00.000Z', shortReasonKey: null })
  })
  it('ทุกชุด FAILED = uniform + เหตุผลสั้นของชุดแรก', () => {
    expect(capiGroupResult({ datasets: [ds('FAILED', 'rejected'), ds('FAILED', 'rejected')] })).toMatchObject({ kind: 'uniform', status: 'FAILED', shortReasonKey: 'rejected', sentAt: null })
  })
  it('mixed: SENT+PENDING / SENT+SKIPPED / FAILED+PENDING — worst ตาม FAILED>PENDING>SKIPPED>SENT', () => {
    expect(capiGroupResult({ datasets: [ds('SENT'), ds('PENDING', 'retrying')] })).toMatchObject({ kind: 'mixed', worst: 'PENDING', okCount: 1, total: 2, sentAt: null })
    expect(capiGroupResult({ datasets: [ds('SENT'), ds('SKIPPED', 'tooOld')] })).toMatchObject({ kind: 'mixed', worst: 'SKIPPED', okCount: 1 })
    expect(capiGroupResult({ datasets: [ds('PENDING', 'retrying'), ds('FAILED', 'rejected')] })).toMatchObject({ kind: 'mixed', worst: 'FAILED', okCount: 0 })
    expect(capiGroupResult({ datasets: [ds('SKIPPED', 'tooOld'), ds('PENDING', 'waitToken')] }).worst).toBe('PENDING')
  })
  it('ทุกชุด queued = sending · queued+SENT = mixed (ไม่ใช่ sending)', () => {
    expect(capiGroupResult({ datasets: [ds('PENDING', 'queued'), ds('PENDING', 'queued')] }).kind).toBe('sending')
    expect(capiGroupResult({ datasets: [ds('PENDING', 'queued'), ds('SENT')] })).toMatchObject({ kind: 'mixed', worst: 'PENDING', okCount: 1 })
  })
  it('ชุดเดียว PENDING retrying = uniform PENDING + retrying', () => {
    expect(capiGroupResult({ datasets: [ds('PENDING', 'retrying')] })).toMatchObject({ kind: 'uniform', status: 'PENDING', shortReasonKey: 'retrying' })
  })
})

describe('capiGroupResult sentAt', () => {
  it('ทุกชุด SENT แต่ไม่มี sentAt สักชุด = null (ไม่ใช่ 1970)', () => {
    expect(capiGroupResult({ datasets: [ds('SENT'), ds('SENT')] }).sentAt).toBeNull()
    expect(capiGroupResult({ datasets: [ds('SENT', 'none', '2026-11-16T04:00:00.000Z'), ds('SENT')] }).sentAt).toBe('2026-11-16T04:00:00.000Z')
  })
})

describe('capiNeedsFastRefresh (TC-014)', () => {
  it('queued/retrying = true · waitToken อย่างเดียว/ว่าง = false', () => {
    expect(capiNeedsFastRefresh([grp([ds('PENDING', 'queued')])])).toBe(true)
    expect(capiNeedsFastRefresh([grp([ds('SENT'), ds('PENDING', 'retrying')])])).toBe(true)
    expect(capiNeedsFastRefresh([grp([ds('PENDING', 'waitToken')])])).toBe(false)
    expect(capiNeedsFastRefresh([])).toBe(false)
  })
})

describe('buildCapiTimeline (TC-009..011)', () => {
  const msg = (id: string, at: string | null) => ({ id, createdAt: at })
  const shape = (t: ReturnType<typeof buildCapiTimeline<{ id: string; createdAt: string | null }>>) =>
    t.map((i) => (i.type === 'message' ? i.m.id : `capi${i.groups.length}`))

  it('แทรกตามเวลา · เวลาเท่ากันข้อความมาก่อน · optimistic (ไม่มี createdAt) อยู่ท้าย', () => {
    const m = [msg('m10', '2026-11-16T03:00:00Z'), msg('m11', '2026-11-16T04:00:00Z'), msg('m1130', '2026-11-16T04:30:00Z'), msg('opt', null)]
    const g = [grp([ds('SENT')], '2026-11-16T03:30:00Z', 'g1'), grp([ds('SENT')], '2026-11-16T04:30:00Z', 'g2')]
    expect(shape(buildCapiTimeline(m, g, { hasOlder: false }))).toEqual(['m10', 'capi1', 'm11', 'm1130', 'capi1', 'opt'])
  })
  it('hasOlder:true ตัดกลุ่มที่เก่ากว่าข้อความแรก · false แสดงทุกกลุ่ม', () => {
    const m = [msg('m12', '2026-11-16T05:00:00Z')]
    const g = [grp([ds('SENT')], '2026-11-16T04:00:00Z')]
    expect(shape(buildCapiTimeline(m, g, { hasOlder: true }))).toEqual(['m12'])
    expect(shape(buildCapiTimeline(m, g, { hasOlder: false }))).toEqual(['capi1', 'm12'])
  })
  it('รวมกลุ่มติดกันวันเดียวกัน · ข้อความคั่น/ข้ามวัน (เขตเวลาไทย) ไม่รวม', () => {
    const three = [grp([ds('SENT')], '2026-11-16T04:00:00Z', 'a'), grp([ds('SENT')], '2026-11-16T04:01:00Z', 'b'), grp([ds('FAILED', 'rejected')], '2026-11-16T04:02:00Z', 'c')]
    expect(shape(buildCapiTimeline([], three, { hasOlder: false }))).toEqual(['capi3'])
    expect(shape(buildCapiTimeline([msg('x', '2026-11-16T04:01:30Z')], three, { hasOlder: false }))).toEqual(['capi2', 'x', 'capi1'])
    // 16:59 UTC = 23:59 ไทยวันที่ 16 · 17:01 UTC = 00:01 ไทยวันที่ 17
    const cross = [grp([ds('SENT')], '2026-11-16T16:59:00Z', 'p'), grp([ds('SENT')], '2026-11-16T17:01:00Z', 'q')]
    expect(shape(buildCapiTimeline([], cross, { hasOlder: false }))).toEqual(['capi1', 'capi1'])
  })
  it('groups ว่าง = ข้อความเดิมตามลำดับ', () => {
    const m = [msg('a', '2026-11-16T04:00:00Z'), msg('b', null)]
    expect(shape(buildCapiTimeline(m, [], { hasOlder: true }))).toEqual(['a', 'b'])
  })
  it('SENT group ตัวอย่างไม่ถูกแก้ (ฟังก์ชันล้วน)', () => {
    const before = JSON.stringify(SENT)
    buildCapiTimeline([msg('a', '2026-11-16T05:00:00Z')], [SENT, SENT], { hasOlder: false })
    expect(JSON.stringify(SENT)).toBe(before)
  })
})

describe('layoutCapiDays (แทรกระดับแถว)', () => {
  const dayOf = (iso: string) => iso.slice(0, 10)
  const r = (id: string, at: string | null) => ({ day: (at ?? '2026-11-16').slice(0, 10), at, r: id })
  const shape = (t: ReturnType<typeof layoutCapiDays<string>>) =>
    t.map((d) => `${d.day}:${d.items.map((i) => (i.type === 'row' ? i.r : `capi${i.groups.length}`)).join(',')}`)

  it('อัลบั้ม = แถวเดียว at ท้ายแถว: กลุ่มก่อนท้ายแถวมาก่อนทั้งอัลบั้ม ไม่แทรกกลาง', () => {
    // อัลบั้ม album ถูกวัดที่ข้อความท้าย 04:10 · กลุ่ม 04:05 (หลังรูปแรก ก่อนรูปท้าย) ต้องอยู่ก่อน album
    const rows = [r('album', '2026-11-16T04:10:00Z'), r('next', '2026-11-16T05:00:00Z')]
    expect(shape(layoutCapiDays(rows, [grp([ds('SENT')], '2026-11-16T04:05:00Z')], { hasOlder: false }, dayOf))).toEqual(['2026-11-16:capi1,album,next'])
  })
  it('เวลาเท่ากับท้ายแถว = ตามหลังแถวนั้น (ไม่คั่นระหว่างบับเบิลกับ meta)', () => {
    const rows = [r('bubble', '2026-11-16T04:10:00Z'), r('next', '2026-11-16T05:00:00Z')]
    expect(shape(layoutCapiDays(rows, [grp([ds('SENT')], '2026-11-16T04:10:00Z')], { hasOlder: false }, dayOf))).toEqual(['2026-11-16:bubble,capi1,next'])
  })
  it('วันที่มีแต่เหตุการณ์ได้หัววันของตัวเอง · วันเดียวกับแถวถัดไปรวมในหัววันเดียว', () => {
    const rows = [r('d1', '2026-11-15T04:00:00Z'), r('d3', '2026-11-17T04:00:00Z')]
    const g = [grp([ds('SENT')], '2026-11-16T04:00:00Z', 'g2'), grp([ds('SENT')], '2026-11-17T03:00:00Z', 'g3')]
    expect(shape(layoutCapiDays(rows, g, { hasOlder: false }, dayOf))).toEqual(['2026-11-15:d1', '2026-11-16:capi1', '2026-11-17:capi1,d3'])
  })
  it('hasOlder ตัดกลุ่มเก่ากว่าแถวแรก · ไม่มีกลุ่ม = แถวเดิม', () => {
    const rows = [r('a', '2026-11-16T05:00:00Z')]
    expect(shape(layoutCapiDays(rows, [grp([ds('SENT')], '2026-11-16T04:00:00Z')], { hasOlder: true }, dayOf))).toEqual(['2026-11-16:a'])
    expect(shape(layoutCapiDays(rows, [], { hasOlder: false }, dayOf))).toEqual(['2026-11-16:a'])
  })
})

describe('capiLineSummary', () => {
  it('ทุกเหตุการณ์ SENT = allReceived · ปนกัน = worst ตามลำดับ · ทุกอันยังไม่ยิง = sending', () => {
    expect(capiLineSummary([grp([ds('SENT')]), grp([ds('SENT'), ds('SENT')])])).toMatchObject({ allReceived: true, worst: 'SENT', okCount: 2, total: 2, sending: false })
    expect(capiLineSummary([grp([ds('SENT')]), grp([ds('FAILED', 'rejected')]), grp([ds('PENDING', 'retrying')])])).toMatchObject({ allReceived: false, worst: 'FAILED', okCount: 1, total: 3 })
    expect(capiLineSummary([grp([ds('SENT')]), grp([ds('SENT'), ds('SKIPPED', 'tooOld')])])).toMatchObject({ worst: 'SKIPPED', okCount: 1 })
    expect(capiLineSummary([grp([ds('PENDING', 'queued')]), grp([ds('PENDING', 'queued')])]).sending).toBe(true)
    expect(capiLineSummary([grp([ds('PENDING', 'queued')]), grp([ds('SENT')])]).sending).toBe(false)
  })
})
