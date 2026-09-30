import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { formatDate, formatDateTime, formatDayMonth, formatDateStampBE } from '@/lib/format-date'
import { resolveRangeFromParams, MAX_CUSTOM_RANGE_DAYS, DATE_RANGE_OPTIONS } from '@/lib/date-range'
import { formatBahtCompact } from '@/lib/format-money'

/**
 * 2026-10-01 — user สั่ง: วันที่ทั้งระบบเป็น วัน-เดือน-ปี ("02-09-2569") · การ์ดกราฟ /sales ใหม่ ·
 * ตัวกรองช่วงเวลาต้องใช้ได้จริงทุกแท็บ
 */

// 1 ก.ย. 2026 17:30 UTC = 2 ก.ย. 2026 00:30 น. เวลาไทย — ขอบเที่ยงคืนที่ server UTC ตัดผิดได้
const EDGE = new Date('2026-09-01T17:30:05Z')

describe('[blocker] วันที่ตัวกลางเรียง วัน-เดือน-ปี พ.ศ.', () => {
  it('formatDate → DD-MM-YYYY(พ.ศ.) ตามเวลาไทย', () => {
    expect(formatDate(EDGE)).toBe('02-09-2569')
    expect(formatDate('2026-09-02')).toBe('02-09-2569')
  })

  it('formatDateTime → DD-MM-YYYY HH:mm:ss', () => {
    expect(formatDateTime(EDGE)).toBe('02-09-2569 00:30:05')
  })

  it('formatDayMonth (ป้ายแกนกราฟ) → DD-MM ไม่มีปี', () => {
    expect(formatDayMonth(EDGE)).toBe('02-09')
  })

  it('formatDateStampBE (ชื่อไฟล์) ยังเรียงได้ — ปีนำหน้า', () => {
    expect(formatDateStampBE(EDGE)).toBe('25690902')
    expect(formatDateStampBE('2026-10-01') > formatDateStampBE('2026-09-30')).toBe(true)
  })

  it('ค่าผิด → "—" ไม่ throw', () => {
    expect(formatDate(null)).toBe('—')
    expect(formatDateTime('not-a-date')).toBe('—')
  })
})

describe('[blocker] ตารางที่โชว์ วัน-เดือน-ปี ต้องเรียงจากค่าดิบ ไม่ใช่ข้อความ', () => {
  // "01-10-2569" < "30-09-2569" เมื่อเรียงเป็นสตริง — ตารางที่เรียงจากข้อความจะเรียงผิดข้ามเดือน
  const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

  it('SalesTable เรียงคอลัมน์วันที่ด้วย row.original.date', () => {
    const src = read('src/app/(paces)/seller/(dashboard)/sales/components/SalesTable.tsx')
    expect(src).toMatch(/sortingFn:\s*\(a, b\)\s*=>\s*a\.original\.date\.localeCompare\(b\.original\.date\)/)
  })

  it('ตารางคลังสินค้าได้ ISO ดิบจาก RSC แล้วจัดรูปตอนแสดง', () => {
    expect(read('src/app/(paces)/seller/(dashboard)/inventory/page.tsx')).toMatch(/updatedAt:\s*p\.updatedAt\.toISOString\(\)/)
    expect(read('src/app/(paces)/seller/(dashboard)/inventory/components/InventoryManagementTable.tsx')).toMatch(
      /formatDateTime\(getValue\(\)\)/,
    )
  })
})

describe('[blocker] ช่วงเวลาหน้าการเงิน — ชุดเดียวทุกแท็บ', () => {
  it('ไม่มีพารามิเตอร์ = เดือนนี้', () => {
    const r = resolveRangeFromParams({})
    expect(r.preset).toBe('month')
    expect(r.custom).toBeNull()
  })

  it('preset ที่รู้จักถูกใช้ตรง ๆ', () => {
    expect(resolveRangeFromParams({ range: '7d' }).preset).toBe('7d')
  })

  it('กำหนดเองที่ถูกต้อง → custom พร้อมขอบวันเวลาไทย', () => {
    const r = resolveRangeFromParams({ range: 'custom', start: '2026-09-01', end: '2026-09-30' })
    expect(r.preset).toBe('custom')
    expect(r.custom).toEqual(['2026-09-01', '2026-09-30'])
    // เที่ยงคืนไทยของ 1 ก.ย. = 31 ส.ค. 17:00 UTC
    expect(r.resolved.orderRange.gte.toISOString()).toBe('2026-08-31T17:00:00.000Z')
    expect(r.resolved.orderRange.lt.toISOString()).toBe('2026-09-30T17:00:00.000Z')
  })

  it('ลิงก์เก่า ?from=&to= ยังใช้ได้ (ตีเป็นกำหนดเอง)', () => {
    const r = resolveRangeFromParams({ from: '2026-09-01', to: '2026-09-15' })
    expect(r.preset).toBe('custom')
    expect(r.custom).toEqual(['2026-09-01', '2026-09-15'])
  })

  it('ค่าผิด/กลับด้าน/วันไม่มีจริง/ยาวเกินเพดาน → ตกไป fallback ไม่ throw', () => {
    for (const sp of [
      { range: 'custom', start: '2026-09-30', end: '2026-09-01' },
      { range: 'custom', start: '2026-02-31', end: '2026-03-05' },
      { range: 'custom', start: 'x', end: 'y' },
      { range: 'custom' },
      { range: 'custom', start: '2020-01-01', end: '2026-01-01' },
      { range: 'bogus' },
    ]) {
      const r = resolveRangeFromParams(sp)
      expect(r.preset, JSON.stringify(sp)).toBe('month')
      expect(r.custom).toBeNull()
    }
    expect(MAX_CUSTOM_RANGE_DAYS).toBeGreaterThanOrEqual(366)
  })

  it('ช่วงยาวพอดีเพดานยังผ่าน', () => {
    const r = resolveRangeFromParams({ range: 'custom', start: '2025-01-01', end: '2025-12-31' })
    expect(r.preset).toBe('custom')
  })

  it('ป้ายตัวเลือกมีครบ 5 ตัวและเรียงตามเดิม', () => {
    expect(DATE_RANGE_OPTIONS.map((o) => o.value)).toEqual(['today', '7d', '30d', 'month', 'custom'])
  })

  it('ตัวกรองช่วงเวลาของ /sales ต้องคงพารามิเตอร์อื่นใน URL (เช่น ?tab=)', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/app/(paces)/seller/(dashboard)/sales/components/SalesDateRange.tsx'),
      'utf8',
    )
    expect(src).toContain('new URLSearchParams(searchParams.toString())')
    expect(src).not.toMatch(/router\.push\(`\?from=/)
  })

  it('แท็บกำไรขาดทุนมีตัวเลือกช่วงเวลา และทุกแท็บอ่านช่วงจาก resolveRangeFromParams ตัวเดียว', () => {
    const page = readFileSync(join(process.cwd(), 'src/app/(paces)/seller/(dashboard)/sales/page.tsx'), 'utf8')
    expect(page.match(/resolveRangeFromParams\(/g)).toHaveLength(1)
    expect(page.match(/\{rangeFilter\}/g)?.length).toBeGreaterThanOrEqual(2)
    expect(page).not.toMatch(/label\.start\} – \$\{range\.label\.end/)
  })
})

describe('formatBahtCompact — ป้ายแกนกราฟ', () => {
  it('ย่อหลักพัน/ล้าน', () => {
    expect(formatBahtCompact(40000)).toBe('฿40k')
    expect(formatBahtCompact(12500)).toBe('฿12.5k')
    expect(formatBahtCompact(1_200_000)).toBe('฿1.2M')
    expect(formatBahtCompact(900)).toBe('฿900')
    expect(formatBahtCompact(0)).toBe('฿0')
  })
})
