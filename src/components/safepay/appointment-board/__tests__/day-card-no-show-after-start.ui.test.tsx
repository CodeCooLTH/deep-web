/**
 * 00086 P3 — การ์ดคิวรายวัน: เริ่มงานแล้ว ⇒ ชีตปิดงานได้ `serviceStarted` (ซ่อน "ไม่มาตามนัด") + เมนู ⋯ ไม่มี "ไม่มาตามนัด"
 *
 * ชีตถูก mock เพื่ออ่าน prop ที่การ์ดส่งจริง (ชีตปิดอยู่ตอน SSR จึงไม่มี markup ให้ตรวจ) ·
 * การซ่อนตัวเลือกในชีตเองตรวจที่ technician-no-money.ui.test.tsx
 *
 * mutation ที่ต้องแดง: ลบ `serviceStarted={isServiceJobStarted(item)}` ใน AppointmentDayCard ⇒ เคส "เริ่มแล้ว" แดง
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement as h } from 'react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/queues',
  useSearchParams: () => new URLSearchParams(),
}))

const sheetProps: Record<string, unknown>[] = []
vi.mock('@/components/safepay/service-close/ServiceCloseSheet', () => ({
  default: (p: Record<string, unknown>) => {
    sheetProps.push(p)
    return null
  },
}))

import AppointmentDayCard from '../AppointmentDayCard'
import { AppointmentBoardCapsProvider, type AppointmentBoardCaps } from '../AppointmentBoardCaps'
import type { AppointmentDayApiItem } from '../types'
import { dayCardControls } from '@/lib/appointment-day-view'

const T = '2099-10-12T03:10:00.000Z'
const BASE: AppointmentDayApiItem = {
  orderToken: 'tok-1', orderNo: 'DP1', createdAt: '2099-10-09T03:00:00.000Z', arrivalMode: 'BOOKED',
  start: '2099-10-12T03:00:00.000Z', end: '2099-10-12T04:00:00.000Z', appointmentStatus: 'SCHEDULED',
  buyerName: 'สมชาย', buyerContact: '0812345678', resource: { id: 'r1', name: 'ช่าง A' },
  source: null, salesChannel: null, customerAvatarUrl: null, conversationId: null,
  firstItemName: 'ตัดผม', itemCount: 1, assignee: null, serviceStartedAt: null, serviceFinishedAt: null, serviceClosedAt: null,
}
const OWNER: AppointmentBoardCaps = {
  showMoney: true, canChat: true, canReschedule: true, canCreate: true, canRefundDeposit: true, canClose: true,
  viewerUserId: 'u-owner', technicianOnly: false,
}

const render = (patch: Partial<AppointmentDayApiItem>) => {
  sheetProps.length = 0
  renderToStaticMarkup(
    h(AppointmentBoardCapsProvider, {
      value: OWNER,
      children: h(AppointmentDayCard, { item: { ...BASE, ...patch }, now: new Date('2099-10-12T03:30:00.000Z'), onChanged: () => {} }),
    }),
  )
  expect(sheetProps).toHaveLength(1)
  return sheetProps[0]
}

describe('AppointmentDayCard → ServiceCloseSheet serviceStarted', () => {
  beforeEach(() => { sheetProps.length = 0 })

  it('[blocker] เริ่มงานแล้ว ⇒ serviceStarted = true (ชีตไม่มีไม่มาตามนัด)', () => {
    expect(render({ serviceStartedAt: T }).serviceStarted).toBe(true)
  })
  it('ยังไม่เริ่ม ⇒ serviceStarted = false (มีไม่มาตามนัดเหมือนเดิม)', () => {
    expect(render({}).serviceStarted).toBe(false)
  })
  it('[blocker] เมนู ⋯ : เริ่มแล้วไม่มี "ไม่มาตามนัด" · ยังไม่เริ่มมี', () => {
    const caps = { canClose: true, canReschedule: true, technicianOnly: false }
    expect(dayCardControls('close', caps, { isMine: false, started: true, finished: false }).menu?.noShow).toBe(false)
    expect(dayCardControls('close', caps, { isMine: false, started: false, finished: false }).menu?.noShow).toBe(true)
  })
})
