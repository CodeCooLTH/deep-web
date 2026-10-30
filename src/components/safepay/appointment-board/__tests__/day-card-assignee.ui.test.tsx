/**
 * 00086 P3 (T9 · FR-008) — การ์ดคิวรายวัน + แถวนัด: ผู้รับผิดชอบ · ป้ายระหว่างทำงาน · ปุ่มปิดงานของช่างล้วน
 *
 * mutation ที่ต้องแดง:
 *  · ลบ `technicianOnly` ออกจาก dayCardControls ที่การ์ด ⇒ "ช่างล้วนงานคนอื่นไม่มีปุ่มปิด" แดง
 *  · ลบ who-line ใน AppointmentDayCard ⇒ "ยังไม่มีคนรับ" แดง
 *  · ลบ assigneeAriaSuffix จาก aria-label ⇒ aria แดง
 *  · เปลี่ยนค่าตั้งต้น showAssignee เป็น true ⇒ "ชีตเลือกวันไม่เปลี่ยน" แดง
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement as h } from 'react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/queues',
  useSearchParams: () => new URLSearchParams(),
}))

import AppointmentDayCard from '../AppointmentDayCard'
import AppointmentDayRows from '../AppointmentDayRows'
import { AppointmentBoardCapsProvider, type AppointmentBoardCaps } from '../AppointmentBoardCaps'
import type { AppointmentDayApiItem } from '../types'

const ME = 'u-me'
const T = '2099-10-12T03:10:00.000Z'
const BASE: AppointmentDayApiItem = {
  orderToken: 'tok-1', orderNo: 'DP1', createdAt: '2099-10-09T03:00:00.000Z', arrivalMode: 'BOOKED',
  start: '2099-10-12T03:00:00.000Z', end: '2099-10-12T04:00:00.000Z', appointmentStatus: 'SCHEDULED',
  buyerName: 'สมชาย', buyerContact: '0812345678', resource: { id: 'r1', name: 'ช่าง A' },
  source: null, salesChannel: null, customerAvatarUrl: null, conversationId: null,
  firstItemName: 'ตัดผม', itemCount: 1, assignee: null, serviceStartedAt: null, serviceFinishedAt: null, serviceClosedAt: null,
}
const CLOSED_CAPS: AppointmentBoardCaps = {
  showMoney: false, canChat: false, canReschedule: false, canCreate: false, canRefundDeposit: false, canClose: false,
  viewerUserId: null, technicianOnly: false,
}
const TECH: Partial<AppointmentBoardCaps> = { canClose: true, viewerUserId: ME, technicianOnly: true }
const OWNER: Partial<AppointmentBoardCaps> = { canClose: true, canReschedule: true, showMoney: true, canChat: true, viewerUserId: 'u-owner', technicianOnly: false }

const card = (patch: Partial<AppointmentDayApiItem>, caps: Partial<AppointmentBoardCaps> = {}) =>
  renderToStaticMarkup(
    h(AppointmentBoardCapsProvider, {
      value: { ...CLOSED_CAPS, ...caps },
      // now หลังเวลานัด ⇒ action = 'close'
      children: h(AppointmentDayCard, { item: { ...BASE, ...patch }, now: new Date('2099-10-12T03:30:00.000Z'), onChanged: () => {} }),
    }),
  )
const MINE = { assignee: { userId: ME, displayName: 'สมศักดิ์' } }
const OTHER = { assignee: { userId: 'u-other', displayName: 'วิชัย' } }

describe('AppointmentDayCard — who-line + ป้าย (FR-008)', () => {
  it('[blocker] ไม่มีคนรับ ⇒ "ยังไม่มีคนรับ" (warning-ink) + aria ต่อท้าย', () => {
    const html = card({})
    expect(html).toContain('text-warning-ink truncate font-semibold">ยังไม่มีคนรับ<')
    expect(html).toMatch(/aria-label="เปิดรายละเอียดนัดของ สมชาย[^"]* ยังไม่มีคนรับ"/)
  })
  it('[blocker] มีคนรับ ⇒ ชื่อเปล่า ๆ (ไม่เติม "ช่าง") + aria "ผู้รับผิดชอบ {ชื่อ}"', () => {
    const html = card(OTHER)
    expect(html).toContain('<span class="truncate">วิชัย</span>')
    expect(html).toMatch(/aria-label="[^"]* ผู้รับผิดชอบ วิชัย"/)
    expect(html).not.toContain('ยังไม่มีคนรับ')
  })
  it('เริ่มแล้ว ⇒ ป้าย "กำลังให้บริการ" · ทำเสร็จ ⇒ "ทำเสร็จ · รอปิดงาน" (แทนป้ายนัด)', () => {
    expect(card({ ...MINE, serviceStartedAt: T })).toContain('กำลังให้บริการ')
    const done = card({ ...MINE, serviceStartedAt: T, serviceFinishedAt: T })
    expect(done).toContain('ทำเสร็จ · รอปิดงาน')
    expect(done).not.toContain('กำลังให้บริการ')
  })
})

describe('AppointmentDayCard — ปุ่มปิดงานของช่างล้วน (TD-004 · FR-011)', () => {
  it('[blocker] ช่างล้วน งานคนอื่นที่ทำเสร็จแล้ว ⇒ ไม่มีปุ่มปิด ไม่มี ⋯', () => {
    const html = card({ ...OTHER, serviceStartedAt: T, serviceFinishedAt: T }, TECH)
    expect(html).not.toContain('ปิดงาน</button>')
    expect(html).not.toContain('ตัวเลือกอื่นของนัด')
  })
  it('[blocker] ช่างล้วน งานของตัวเองที่ยังไม่ทำเสร็จ ⇒ ไม่มีปุ่มปิด', () => {
    expect(card({ ...MINE, serviceStartedAt: T }, TECH)).not.toContain('ปิดงาน</button>')
    expect(card(MINE, TECH)).not.toContain('ปิดงาน</button>')
  })
  it('[blocker] ช่างล้วน งานของตัวเองที่ทำเสร็จแล้ว ⇒ มีปุ่มปิดงาน (ไม่มี ⋯ ไม่มาตามนัด)', () => {
    const html = card({ ...MINE, serviceStartedAt: T, serviceFinishedAt: T }, TECH)
    expect(html).toContain('ปิดงาน</button>')
    expect(html).not.toContain('ตัวเลือกอื่นของนัด')
  })
  it('เจ้าของ: ปิดงานได้ทุกใบเหมือนเดิม (ก่อนเริ่ม/ไม่มีคนรับ) + ⋯', () => {
    const html = card({}, OWNER)
    expect(html).toContain('ปิดงาน</button>')
    expect(html).toContain('ตัวเลือกอื่นของนัด')
  })
})

describe('AppointmentDayRows — showAssignee', () => {
  const rows = (props: Record<string, unknown>, items: AppointmentDayApiItem[] = [{ ...BASE, ...OTHER, serviceStartedAt: T }]) =>
    renderToStaticMarkup(h(AppointmentDayRows, { items, onRowClick: () => {}, ...props }))

  it('[blocker] ค่าตั้งต้น (ชีตเลือกวันของฟอร์มสร้างงาน) ⇒ ไม่มีผู้รับผิดชอบ · ป้ายนัดเดิม · aria เดิม', () => {
    const html = rows({})
    expect(html).not.toContain('วิชัย')
    expect(html).not.toContain('ผู้รับผิดชอบ')
    expect(html).not.toContain('กำลังให้บริการ')
    expect(html).not.toContain('ยังไม่มีคนรับ')
  })
  it('[blocker] showAssignee ⇒ who-line + ป้ายระหว่างทำงาน + aria ต่อผู้รับผิดชอบ', () => {
    const html = rows({ showAssignee: true })
    expect(html).toContain('<span class="truncate">วิชัย</span>')
    expect(html).toContain('กำลังให้บริการ')
    expect(html).toMatch(/aria-label="[^"]*สถานะ กำลังให้บริการ[^"]* ผู้รับผิดชอบ วิชัย"/)
  })
  it('showAssignee ไม่มีคนรับ ⇒ "ยังไม่มีคนรับ" ทั้งในแถวและ aria', () => {
    const html = rows({ showAssignee: true }, [{ ...BASE }])
    expect(html).toContain('>ยังไม่มีคนรับ<')
    expect(html).toMatch(/aria-label="[^"]* ยังไม่มีคนรับ"/)
  })
  // critique P1-10 — ที่ 390px ป้ายยาวเป็น sibling แล้วชื่อถูกตัด ⇒ showAssignee ย้ายป้ายเข้าคอลัมน์ชื่อเป็นบรรทัดที่ 3
  it('[blocker] showAssignee ⇒ ป้ายอยู่ในคอลัมน์ชื่อ (หลัง who-line) ไม่ใช่ sibling ข้างคอลัมน์', () => {
    const html = rows({ showAssignee: true }, [{ ...BASE, ...OTHER, serviceStartedAt: T, serviceFinishedAt: T }])
    const who = html.indexOf('>วิชัย<')
    const badge = html.indexOf('class="badge mt-1 ')
    expect(who).toBeGreaterThan(0)
    expect(badge).toBeGreaterThan(who)
    // ป้ายต้องอยู่ก่อนคอลัมน์ปิด (ยังอยู่ใน min-w-0 flex-1) — ปิด span ของ who-line แล้วตามด้วยป้ายทันที
    expect(html.slice(badge)).toMatch(/^class="badge mt-1 [^"]*">ทำเสร็จ · รอปิดงาน<\/span><\/span>/)
    expect(html).not.toContain('class="badge shrink-0 ')
  })
  it('[blocker] ไม่ส่ง showAssignee (ชีตเลือกวัน ฯลฯ) ⇒ ป้ายตำแหน่งเดิม (sibling shrink-0)', () => {
    const html = rows({})
    expect(html).toContain('class="badge shrink-0 ')
    expect(html).not.toContain('class="badge mt-1 ')
  })
  // QA 2026-10-30 — รายการวันของบอร์ด /queues จอกลาง (768–1023) เคยขึ้น "นัดแล้ว" ให้งานหน้าร้านทุกขั้น
  it('[blocker] serviceBadges (บอร์ด /queues) ⇒ ป้ายงานบริการ ไม่มีบรรทัดผู้รับผิดชอบ · ป้ายตำแหน่งเดิม', () => {
    const walk = { ...BASE, arrivalMode: 'WALK_IN' as const }
    expect(rows({ serviceBadges: true }, [walk])).toContain('>รอเริ่มงาน<')
    expect(rows({ serviceBadges: true }, [{ ...walk, serviceStartedAt: T }])).toContain('>กำลังให้บริการ<')
    const done = rows({ serviceBadges: true }, [{ ...walk, serviceStartedAt: T, serviceFinishedAt: T }])
    expect(done).toContain('>ทำเสร็จ · รอปิดงาน<')
    expect(done).not.toContain('ผู้รับผิดชอบ')
    expect(done).not.toContain('ยังไม่มีคนรับ')
    expect(done).toContain('class="badge shrink-0 ')
    // ไม่ส่ง = ป้ายนัดเดิม
    expect(rows({}, [walk])).toContain('>นัดแล้ว<')
  })
  it('showDate ⇒ วันที่ในคอลัมน์เวลา + aria "วันที่" · ค่าตั้งต้นไม่มี', () => {
    expect(rows({ showAssignee: true, showDate: true })).toContain(' วันที่ ')
    expect(rows({ showAssignee: true })).not.toContain(' วันที่ ')
  })
})
