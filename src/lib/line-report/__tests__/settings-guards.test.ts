import { describe, expect, it } from 'vitest'
import {
  CUTOFF_OPTIONS,
  addableSlots,
  buildShopRows,
  canAddTime,
  canEnableSend,
  canRemoveTime,
  cutoffFromValue,
  cutoffLabel,
  cutoffToValue,
  isAutoReportOff,
  isLastMetric,
  isLastShop,
  previewState,
  shopDisabledReason,
  toggleShop,
  withTime,
  withoutTime,
  type MetricKey,
  type ShopRow,
} from '../settings-guards'

const metrics = (on: Partial<Record<MetricKey, boolean>>): Record<MetricKey, boolean> => ({
  showOrders: false,
  showSales: false,
  showCancelled: false,
  showTopProducts: false,
  showProfit: false,
  ...on,
})

describe('เวลา', () => {
  it('canAddTime: 3 เวลาเพิ่มได้ · ครบ 4 เพิ่มไม่ได้ (ขอบเขต)', () => {
    expect(canAddTime([540, 720, 1080])).toBe(true)
    expect(canAddTime([540, 720, 1080, 1440])).toBe(false)
    expect(canAddTime([])).toBe(true)
  })
  it('addableSlots ตัดค่าที่เลือกแล้ว · 48 ค่าเมื่อว่าง', () => {
    expect(addableSlots([])).toHaveLength(48)
    expect(addableSlots([540]).some((o) => o.minutes === 540)).toBe(false)
    expect(addableSlots([540])).toHaveLength(47)
  })
  it('withTime เรียงและไม่ซ้ำ · withoutTime ตัดเฉพาะตัวนั้น', () => {
    expect(withTime([1080, 540], 720)).toEqual([540, 720, 1080])
    expect(withTime([540], 540)).toEqual([540])
    expect(withoutTime([540, 720], 540)).toEqual([720])
  })
  it('canRemoveTime: เหลือ 1 เวลาและยังเปิดรายวัน/รายเดือน → ลบไม่ได้ · ปิดทั้งคู่ → ลบได้', () => {
    expect(canRemoveTime([540], { dailyEnabled: true, monthlyEnabled: false })).toBe(false)
    expect(canRemoveTime([540], { dailyEnabled: false, monthlyEnabled: true })).toBe(false)
    expect(canRemoveTime([540], { dailyEnabled: false, monthlyEnabled: false })).toBe(true)
    expect(canRemoveTime([540, 720], { dailyEnabled: true, monthlyEnabled: true })).toBe(true)
    expect(canRemoveTime([], { dailyEnabled: true, monthlyEnabled: false })).toBe(false)
  })
  it('canEnableSend: ต้องมีเวลา ≥1', () => {
    expect(canEnableSend([])).toBe(false)
    expect(canEnableSend([540])).toBe(true)
  })
})

describe('ตัวเลข', () => {
  it('isLastMetric: ตัวเดียวที่ติ๊ก → จริงเฉพาะตัวนั้น', () => {
    const s = metrics({ showSales: true })
    expect(isLastMetric(s, 'showSales')).toBe(true)
    expect(isLastMetric(s, 'showOrders')).toBe(false)
  })
  it('มี 2 ตัวขึ้นไป → ไม่มีตัวสุดท้าย · กำไรนับเป็นหนึ่งใน 5', () => {
    expect(isLastMetric(metrics({ showSales: true, showProfit: true }), 'showSales')).toBe(false)
    expect(isLastMetric(metrics({ showProfit: true }), 'showProfit')).toBe(true)
  })
})

describe('ร้าน', () => {
  const gs = [
    { shopId: 'a', name: 'A', vertical: 'ONLINE_SALES', kind: 'BUSINESS', state: 'OK' },
    { shopId: 'l', name: 'L', vertical: 'SERVICE_QUEUE', kind: 'BUSINESS', state: 'LOCKED' },
  ]
  const rep = [
    { id: 'a', name: 'A', vertical: 'ONLINE_SALES', kind: 'BUSINESS' },
    { id: 'b', name: 'B', vertical: null, kind: 'PERSONAL' },
  ]
  const rows = buildShopRows(gs, rep)

  it('buildShopRows: ร้านเดิมก่อน ไม่ซ้ำ · vertical null → ONLINE_SALES · state ไม่รู้จัก → DELETED', () => {
    expect(rows.map((r) => r.id)).toEqual(['a', 'l', 'b'])
    expect(rows[2].vertical).toBe('ONLINE_SALES')
    expect(buildShopRows([{ ...gs[0], state: 'PURGED' }], [])[0].state).toBe('DELETED')
  })
  it('isLastShop', () => {
    expect(isLastShop(['a'], 'a')).toBe(true)
    expect(isLastShop(['a', 'b'], 'a')).toBe(false)
    expect(isLastShop(['b'], 'a')).toBe(false)
  })
  it('toggleShop: เพิ่ม/ถอด · ถอดตัวสุดท้ายที่ใช้งานได้ไม่ได้ (แม้มีร้านล็อกค้างอยู่) · ร้านล็อกแตะไม่ได้', () => {
    expect(toggleShop(rows, ['a', 'l'], 'b')).toEqual(['a', 'l', 'b'])
    expect(toggleShop(rows, ['a', 'l', 'b'], 'b')).toEqual(['a', 'l'])
    expect(toggleShop(rows, ['a', 'l'], 'a')).toEqual(['a', 'l'])
    expect(toggleShop(rows, ['a', 'l'], 'l')).toEqual(['a', 'l'])
    expect(toggleShop(rows, ['a'], 'zzz')).toEqual(['a'])
  })
  it('toggleShop: ชนเพดาน 10 เพิ่มไม่ได้ แต่ถอดได้', () => {
    const many: ShopRow[] = Array.from({ length: 11 }, (_, i) => ({ id: `s${i}`, name: `S${i}`, vertical: 'ONLINE_SALES', kind: 'BUSINESS', state: 'OK' }))
    const ten = many.slice(0, 10).map((r) => r.id)
    expect(toggleShop(many, ten, 's10')).toEqual(ten)
    expect(toggleShop(many, ten, 's0')).toHaveLength(9)
  })
  it('shopDisabledReason: ร้านถูกลบ ไม่ใช้ข้อความ "ล็อกเพราะแพ็กเกจ"', () => {
    const r = buildShopRows([{ shopId: 'd', name: 'D', vertical: 'ONLINE_SALES', kind: 'BUSINESS', state: 'DELETED' }], [])
    expect(shopDisabledReason(r, ['d'], 'd', true)).toBe('ร้านนี้ถูกลบแล้ว จึงไม่ถูกรวมในรายงาน')
  })
  it('shopDisabledReason: ล็อก → เหตุผล · ตัวสุดท้าย → ต้องเลือกอย่างน้อย 1 · ครบ 10 → แถวที่ยังไม่ติ๊ก · ปกติ null', () => {
    expect(shopDisabledReason(rows, ['a', 'l'], 'l', true)).toContain('ถูกล็อกเพราะแพ็กเกจ')
    expect(shopDisabledReason(rows, ['a', 'l'], 'a', true)).toBe('ต้องเลือกอย่างน้อย 1 ร้าน')
    expect(shopDisabledReason(rows, ['a', 'b', 'l'], 'a', true)).toBeNull()
    expect(shopDisabledReason(rows, ['a'], 'a', false)).toBeNull()
    const many: ShopRow[] = Array.from({ length: 11 }, (_, i) => ({ id: `s${i}`, name: `S${i}`, vertical: 'ONLINE_SALES', kind: 'BUSINESS', state: 'OK' }))
    expect(shopDisabledReason(many, many.slice(0, 10).map((r) => r.id), 's10', true)).toBe('เลือกได้สูงสุด 10 ร้าน')
    expect(shopDisabledReason(many, many.slice(0, 9).map((r) => r.id), 's10', true)).toBeNull()
  })
})

describe('วันตัดรอบ', () => {
  it('32 ตัวเลือก: 1..31 แล้วสิ้นเดือน · แปลงค่า select ไป-กลับ', () => {
    expect(CUTOFF_OPTIONS).toHaveLength(32)
    expect(CUTOFF_OPTIONS[31]).toBeNull()
    expect(cutoffLabel(null)).toBe('สิ้นเดือน')
    expect(cutoffLabel(6)).toBe('วันที่ 6')
    expect(cutoffFromValue(cutoffToValue(null))).toBeNull()
    expect(cutoffFromValue(cutoffToValue(31))).toBe(31)
  })
})

describe('พรีวิว + แบนเนอร์ info', () => {
  it('isAutoReportOff: เปิดอย่างใดอย่างหนึ่ง = ไม่ใช่', () => {
    expect(isAutoReportOff({ dailyEnabled: false, monthlyEnabled: false })).toBe(true)
    expect(isAutoReportOff({ dailyEnabled: true, monthlyEnabled: false })).toBe(false)
    expect(isAutoReportOff({ dailyEnabled: false, monthlyEnabled: true })).toBe(false)
  })
  it('previewState: ตัวที่ปิดอยู่ disabled · รายเดือนต้องมี cycle · ถอยไปใบที่เปิดอยู่', () => {
    const both = { dailyEnabled: true, monthlyEnabled: true }
    expect(previewState('MONTHLY', both, true)).toEqual({ kind: 'MONTHLY', dailyDisabled: false, monthlyDisabled: false })
    expect(previewState('MONTHLY', both, false)).toEqual({ kind: 'DAILY', dailyDisabled: false, monthlyDisabled: true })
    expect(previewState('MONTHLY', { dailyEnabled: true, monthlyEnabled: false }, true).kind).toBe('DAILY')
    expect(previewState('DAILY', { dailyEnabled: false, monthlyEnabled: true }, true).kind).toBe('MONTHLY')
    expect(previewState('DAILY', { dailyEnabled: false, monthlyEnabled: false }, false)).toEqual({ kind: 'DAILY', dailyDisabled: true, monthlyDisabled: true })
  })
})
