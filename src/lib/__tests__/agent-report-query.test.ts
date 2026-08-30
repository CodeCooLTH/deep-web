/**
 * เทสตัวแปลง query string ของรายงานผลงานแอดมิน (feature 00059)
 *
 * 🛑 [blocker] — ตัวนี้ถูกเรียกจาก **สองทาง** (RSC ตอนโหลดหน้าแรก และ API ตอนเปลี่ยนตัวกรอง)
 * ถ้าสองทางตีความ query ไม่ตรงกัน ตัวเลขจะเปลี่ยนตอนกดกรองทั้งที่ไม่ควรเปลี่ยน — และไม่มี
 * `tsc`/build ตัวไหนเห็น เพราะทั้งสองฝั่ง "ถูก" ในตัวเอง
 */
import { describe, expect, it } from 'vitest'

import { MAX_RANGE_DAYS, parseReportQuery, REPORT_SOURCES } from '@/lib/agent-report-query'
import { TZ_OFFSET_MS } from '@/lib/date-range'

const DAY_MS = 24 * 60 * 60 * 1000
const spanDays = (r: { from: Date; to: Date }) => (r.to.getTime() - r.from.getTime()) / DAY_MS

describe('ช่วงเวลา', () => {
  it('[blocker] ไม่ส่งอะไรมาเลย → 7 วันล่าสุด (นิยามเดียวกับ resolveDateRange("7d"))', () => {
    const { filters, label } = parseReportQuery({})
    expect(spanDays(filters)).toBe(7)
    // ขอบต้องเป็นเที่ยงคืน "เวลาไทย" ไม่ใช่ของ server (บน Vercel เป็น UTC)
    expect((filters.from.getTime() + TZ_OFFSET_MS) % DAY_MS).toBe(0)
    expect((filters.to.getTime() + TZ_OFFSET_MS) % DAY_MS).toBe(0)
    expect(label.from < label.to).toBe(true)
  })

  it('[blocker] วันสุดท้ายที่ผู้ใช้พิมพ์ต้อง **รวม** อยู่ในช่วง', () => {
    const { filters, label } = parseReportQuery({ from: '2026-08-18', to: '2026-08-24' })
    expect(spanDays(filters)).toBe(7) // 18–24 รวมปลาย = 7 วัน ไม่ใช่ 6
    expect(label).toEqual({ from: '2026-08-18', to: '2026-08-24' })
  })

  it('[blocker] วันเดียว = 1 วันเต็ม ไม่ใช่ช่วงว่าง', () => {
    const { filters } = parseReportQuery({ from: '2026-08-20', to: '2026-08-20' })
    expect(spanDays(filters)).toBe(1)
  })

  it('[blocker] พิมพ์สลับหัวท้าย → สลับให้ ไม่ใช่คืนช่วงว่างที่อ่านเป็น "ไม่มีข้อมูล"', () => {
    const swapped = parseReportQuery({ from: '2026-08-24', to: '2026-08-18' })
    expect(swapped.filters.to.getTime()).toBeGreaterThan(swapped.filters.from.getTime())
    expect(spanDays(swapped.filters)).toBe(7)
  })

  it('[blocker] ยาวเกินเพดาน → หั่นให้ **และต้องติดธงบอก** ห้ามหั่นเงียบ', () => {
    const r = parseReportQuery({ from: '2026-01-01', to: '2026-08-24' })
    expect(spanDays(r.filters)).toBe(MAX_RANGE_DAYS)
    expect(r.clamped).toBe(true)
    // หั่นจาก "วันเริ่ม" ไม่ใช่ "วันจบ" — ผู้ใช้สนใจของล่าสุดเสมอ
    expect(r.label.to).toBe('2026-08-24')
  })

  it('[blocker] พอดีเพดานต้องไม่ถูกติดธง (ขอบแบบ "เท่ากับก็ผ่าน")', () => {
    // 92 วันนับแบบรวมปลาย: 2026-05-25 → 2026-08-24
    const r = parseReportQuery({ from: '2026-05-25', to: '2026-08-24' })
    expect(spanDays(r.filters)).toBe(MAX_RANGE_DAYS)
    expect(r.clamped).toBe(false)
  })

  it('[blocker] ค่าผิดรูปแบบ → ถอยไปค่าตั้งต้น ไม่ throw (ลิงก์ที่ส่งต่อกันต้องยังเปิดได้)', () => {
    for (const bad of ['', 'พรุ่งนี้', '2026-13-45', '18/08/2026', '2026-8-1']) {
      const r = parseReportQuery({ from: bad, to: bad })
      expect(spanDays(r.filters)).toBe(7)
      expect(r.clamped).toBe(false)
    }
  })

  it('[blocker] ส่งมาข้างเดียวก็ถอยไปค่าตั้งต้นทั้งคู่ (ห้ามได้ช่วงครึ่ง ๆ)', () => {
    expect(spanDays(parseReportQuery({ from: '2026-08-18' }).filters)).toBe(7)
    expect(spanDays(parseReportQuery({ to: '2026-08-24' }).filters)).toBe(7)
  })
})

describe('ตัวกรองอื่น', () => {
  it('[blocker] ช่องทางที่ไม่รู้จักถูกทิ้ง ไม่ใช่ส่งต่อเข้า SQL', () => {
    expect(parseReportQuery({ channel: 'MESSENGER' }).filters.channel).toBe('MESSENGER')
    expect(parseReportQuery({ channel: 'LINE' }).filters.channel).toBe('LINE')
    expect(parseReportQuery({ channel: 'TIKTOK' }).filters.channel).toBeNull()
    expect(parseReportQuery({ channel: "'; DROP TABLE" }).filters.channel).toBeNull()
  })

  it('[blocker] ที่มารับเฉพาะ 3 ค่าที่ระบบรู้จัก', () => {
    for (const s of REPORT_SOURCES) expect(parseReportQuery({ source: s }).filters.source).toBe(s)
    expect(parseReportQuery({ source: 'ORGANIC' }).filters.source).toBeNull()
  })

  it('[blocker] ค่าว่าง/ช่องว่างล้วน = ไม่กรอง (ไม่ใช่กรองด้วยสตริงว่าง)', () => {
    const r = parseReportQuery({ shopChannelId: '   ', agentId: '' })
    expect(r.filters.shopChannelId).toBeNull()
    expect(r.agentId).toBeNull()
  })
})

/**
 * mutation ที่ใช้พิสูจน์ (รันแล้วต้องแดง):
 *  1. `thaiMidnightUtc(..., toParts[2] + 1)` → `toParts[2]`      → เคส "รวมวันสุดท้าย" แดง
 *  2. ตัดการสลับช่วงกลับหัวออก                                    → เคส "พิมพ์สลับหัวท้าย" แดง
 *  3. `clamped = true` → ไม่ตั้งธง (หั่นเงียบ)                     → เคสเพดานแดง
 *  4. หั่นจากวันจบแทนวันเริ่ม                                      → เคสเพดานแดง (label.to เปลี่ยน)
 *  5. ถอด allow-list ของ channel/source ปล่อยค่าดิบผ่าน            → 2 เคสแดง
 */
