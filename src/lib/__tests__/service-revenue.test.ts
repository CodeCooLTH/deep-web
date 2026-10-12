/**
 * [blocker] feature 00073 — ยอดขายร้านบริการนับตอน "ร้านปิดงาน" · ร้านอื่นกติกาเดิมเป๊ะ
 *
 * สองด้านที่ต้องจริงพร้อมกัน:
 *  1. ร้านบริการ: งานที่ปิดแล้ว (serviceClosedAt) = ยอดขาย ณ วันปิดงาน · ไม่มาตามนัด = มัดจำที่เก็บ
 *  2. ร้านขายของ/ที่พัก: ได้ `revenueOrderWhere`/`countsAsRevenue` เดิมทุกตัวอักษร (มติ user 2026-10-11)
 */
import { describe, expect, it } from 'vitest'
import {
  countsAsRevenue,
  countsAsRevenueFor,
  countsAsServiceRevenue,
  revenueDateFor,
  revenueOrderWhere,
  revenueWindowWhere,
  serviceNoShowRevenue,
  serviceRevenueOrderWhere,
  SERVICE_NON_REVENUE_STATUSES,
} from '../order-revenue'
import { revenueOrderSql, revenueOrderSqlFor, serviceRevenueOrderSql } from '../agent-performance-sql'

const closed = new Date('2026-10-11T07:00:00Z')
const created = new Date('2026-09-28T03:00:00Z')
const window = { gte: new Date('2026-10-01T00:00:00Z'), lt: new Date('2026-11-01T00:00:00Z') }

describe('countsAsServiceRevenue', () => {
  it('ปิดงานแล้ว = นับ ไม่ว่าลูกค้าจะยืนยันหรือยัง', () => {
    expect(countsAsServiceRevenue({ status: 'PENDING', serviceClosedAt: closed })).toBe(true)
    expect(countsAsServiceRevenue({ status: 'CONFIRMED', serviceClosedAt: closed })).toBe(true)
  })
  it('ยังไม่ปิด = ไม่นับ แม้ลูกค้ายืนยันแล้ว (ยอดเข้าตอนร้านปิดงานเท่านั้น)', () => {
    expect(countsAsServiceRevenue({ status: 'CONFIRMED', serviceClosedAt: null })).toBe(false)
    expect(countsAsServiceRevenue({ status: 'PENDING', serviceClosedAt: null })).toBe(false)
  })
  it('ยกเลิก/คืนทั้งใบ/ร่าง ไม่นับแม้มีวันปิดงาน', () => {
    for (const status of SERVICE_NON_REVENUE_STATUSES) {
      expect(countsAsServiceRevenue({ status, serviceClosedAt: closed })).toBe(false)
    }
  })
})

describe('[blocker] แยก vertical', () => {
  const confirmedNotClosed = { status: 'CONFIRMED', serviceClosedAt: null, shipments: [] }
  const pendingClosed = { status: 'PENDING', serviceClosedAt: closed, shipments: [] }

  it('ร้านขายของ/ที่พัก = countsAsRevenue เดิม (ไม่อ่าน serviceClosedAt เลย)', () => {
    for (const v of ['ONLINE_SALES', 'LODGING', null, undefined, 'UNKNOWN']) {
      expect(countsAsRevenueFor(confirmedNotClosed, v)).toBe(countsAsRevenue(confirmedNotClosed))
      expect(countsAsRevenueFor(pendingClosed, v)).toBe(countsAsRevenue(pendingClosed))
    }
    expect(countsAsRevenueFor(pendingClosed, 'ONLINE_SALES')).toBe(false)
  })
  it('ร้านบริการ = งานที่ปิดแล้ว', () => {
    expect(countsAsRevenueFor(confirmedNotClosed, 'SERVICE_QUEUE')).toBe(false)
    expect(countsAsRevenueFor(pendingClosed, 'SERVICE_QUEUE')).toBe(true)
  })
  it('where: ร้านอื่นได้ของเดิม + createdAt · ร้านบริการตัดช่วงด้วยวันปิดงาน', () => {
    expect(revenueWindowWhere('ONLINE_SALES', window)).toEqual({ ...revenueOrderWhere, createdAt: window })
    expect(revenueWindowWhere('LODGING', window)).toEqual({ ...revenueOrderWhere, createdAt: window })
    const svc = revenueWindowWhere('SERVICE_QUEUE', window)
    expect(svc).toEqual(serviceRevenueOrderWhere(window))
    expect(svc).not.toHaveProperty('createdAt')
    expect(svc).toMatchObject({ serviceClosedAt: window, status: { notIn: [...SERVICE_NON_REVENUE_STATUSES] } })
  })
  it('วันที่ของยอด: ร้านบริการ = วันปิดงาน · ร้านอื่น = createdAt', () => {
    const o = { createdAt: created, serviceClosedAt: closed }
    expect(revenueDateFor(o, 'SERVICE_QUEUE')).toEqual(closed)
    expect(revenueDateFor(o, 'ONLINE_SALES')).toEqual(created)
  })
  it('SQL: ร้านอื่นได้สูตรเดิมทุกตัวอักษร · ร้านบริการอ่าน serviceClosedAt + สถานะชุดเดียวกัน', () => {
    expect(revenueOrderSqlFor('o', false)).toBe(revenueOrderSql('o'))
    const svc = revenueOrderSqlFor('o', true)
    expect(svc).toBe(serviceRevenueOrderSql('o'))
    expect(svc).toContain('o."serviceClosedAt" IS NOT NULL')
    for (const st of SERVICE_NON_REVENUE_STATUSES) expect(svc).toContain(`'${st}'`)
  })
})

describe('ไม่มาตามนัด = มัดจำที่เก็บไว้ (มติ D1)', () => {
  it('เก็บมัดจำ → ยอด = เงินที่รับไว้', () => {
    expect(serviceNoShowRevenue([{ amount: '500.00', voidedAt: null }])).toBe(500)
  })
  it('คืนมัดจำ (void) → ยอด 0', () => {
    expect(serviceNoShowRevenue([{ amount: '500.00', voidedAt: closed }])).toBe(0)
  })
  it('ไม่มีมัดจำ → 0', () => {
    expect(serviceNoShowRevenue([])).toBe(0)
  })
})
