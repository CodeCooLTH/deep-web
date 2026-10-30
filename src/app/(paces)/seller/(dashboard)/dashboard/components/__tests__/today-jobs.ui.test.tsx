/**
 * TodayJobs (หน้าแรกช่างล้วน ร้านบริการ · 00086 P3 · T9 · BRD FR-008)
 *
 * mutation ที่ต้องแดง:
 *  · การ์ด "ยังไม่มีคนรับ" render เมื่อ 0 ⇒ เทส "ซ่อนเมื่อ 0" แดง
 *  · ลบ showAssignee ออกจากแถว ⇒ who-line แดง
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement as h } from 'react'
import { th } from '@/i18n/dictionaries/th'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/i18n/LocaleProvider', () => ({ useT: () => th }))

import { TodayJobsView } from '../TodayJobs'
import { technicianTodayGroups } from '@/lib/technician-jobs'
import type { AppointmentDayApiItem } from '@/components/safepay/appointment-board/types'

const ME = 'u-me'
const item = (token: string, p: Partial<AppointmentDayApiItem> = {}): AppointmentDayApiItem => ({
  orderToken: token, orderNo: `DP-${token}`, createdAt: '2026-10-20T03:00:00.000Z', arrivalMode: 'BOOKED',
  start: '2026-10-29T03:00:00.000Z', end: '2026-10-29T04:00:00.000Z', appointmentStatus: 'SCHEDULED',
  buyerName: `ลูกค้า-${token}`, buyerContact: null, resource: { id: 'r1', name: 'งานล้าง' },
  source: null, salesChannel: null, customerAvatarUrl: null, conversationId: null,
  firstItemName: null, itemCount: 1, assignee: null, serviceStartedAt: null, serviceFinishedAt: null, serviceClosedAt: null,
  ...p,
})
const MINE = { assignee: { userId: ME, displayName: 'สมศักดิ์' } }
const OTHER = { assignee: { userId: 'u-x', displayName: 'วิชัย' } }

const render = (items: AppointmentDayApiItem[] | null, failed = false) =>
  renderToStaticMarkup(
    h(TodayJobsView, {
      failed,
      groups: items ? technicianTodayGroups(items, ME) : null,
      onRetry: () => {},
      onRowClick: () => {},
    }),
  )

describe('TodayJobs — หน้าแรกช่างล้วน', () => {
  it('[blocker] "งานของฉันวันนี้ · N งาน" นับเฉพาะของฉันที่ยังไม่ปิด · "ยังไม่มีคนรับ · N งาน" + คำแนะนำ', () => {
    const html = render([item('m1', MINE), item('m2', { ...MINE, appointmentStatus: 'COMPLETED' }), item('u1'), item('u2'), item('o1', OTHER)])
    expect(html).toContain('งานของฉันวันนี้ · 1 งาน')
    expect(html).toContain('ยังไม่มีคนรับ · 2 งาน')
    expect(html).toContain('งานจะย้ายมาอยู่ในงานของคุณ')
    expect(html).not.toContain('ลูกค้า-o1')
    expect(html).not.toContain('ลูกค้า-m2')
    // ดูทั้งหมด → หน้า "งานของฉัน"
    expect(html).toContain('href="/my-jobs"')
  })
  it('[blocker] ไม่มีงานที่ยังไม่มีคนรับ ⇒ ไม่มีการ์ดที่สอง', () => {
    const html = render([item('m1', MINE), item('o1', OTHER)])
    expect(html).not.toContain('ยังไม่มีคนรับ ·')
    expect(html).not.toContain('งานจะย้ายมาอยู่ในงานของคุณ')
  })
  it('ไม่มีงานของฉัน ⇒ "วันนี้ยังไม่มีงานของคุณ" + ลิงก์ตารางงาน', () => {
    const html = render([item('u1')])
    expect(html).not.toContain('· 0 งาน')
    expect(html).toContain('>งานของฉันวันนี้<')
    expect(html).toContain('วันนี้ยังไม่มีงานของคุณ')
    expect(html).toContain('href="/queues"')
    expect(html).toContain('ยังไม่มีคนรับ · 1 งาน')
  })
  it('แถวมี who-line (ชื่อ/ยังไม่มีคนรับ)', () => {
    const html = render([item('m1', MINE), item('u1')])
    expect(html).toContain('<span class="truncate">สมศักดิ์</span>')
    expect(html).toContain('>ยังไม่มีคนรับ<')
  })
  it('เกิน 3 งาน ⇒ แสดง 3 + ลิงก์ "ดูงานของฉันทั้งหมด (N)"', () => {
    const html = render(['a', 'b', 'c', 'd'].map((x) => item(x, MINE)))
    expect(html).toContain('ดูงานของฉันทั้งหมด (4)')
    expect(html).not.toContain('ลูกค้า-d')
  })
  it('โหลด: skeleton ในการ์ดแรก ไม่มีการ์ดที่สอง · ล้ม: ข้อความ + ลองอีกครั้ง', () => {
    const loading = render(null)
    expect(loading).toContain('animate-pulse')
    expect(loading).toContain('>งานของฉันวันนี้<')
    expect(loading).not.toContain('ยังไม่มีคนรับ')
    const failed = render(null, true)
    expect(failed).toContain(th.dashboard.todayJobsLoadFailed)
    expect(failed).toContain(th.dashboard.todayJobsRetry)
  })
})
