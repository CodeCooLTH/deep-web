/**
 * 00086 S-3 — การ์ดคิวรายวัน: ชิปแบบการมา + บรรทัด "มาจากไหน" (ร้านบริการเท่านั้น — บอร์ดนี้ mount
 * เฉพาะ canUseAppointments = SERVICE_QUEUE)
 *
 * mutation ที่ต้องแดง:
 *  · ถอด `!== 'STOREFRONT'` ที่ sourceText ⇒ เทส STOREFRONT แดง ("หน้าร้าน" โผล่ซ้ำกับชิป)
 *  · คืน fallback 'ไม่ระบุช่องทาง' ⇒ เทส null แดง
 *  · ใช้ resolveArrivalMode ตรง ๆ แทน arrivalModeOf ⇒ เทส "ค่าที่ร้านเลือกชนะ" แดง
 *  · 00086 FR-001/002: ถอดเงื่อนไข WALK_IN ใน appointmentStageBadge ⇒ เทส "รอเริ่มงาน" แดง ·
 *    กลับไปติดชิปเฉพาะ WALK_IN ⇒ เทส "จองล่วงหน้า" แดง
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement as h } from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/queues',
  useSearchParams: () => new URLSearchParams(),
}))

import AppointmentDayCard from '../AppointmentDayCard'
import { AppointmentBoardCapsProvider } from '../AppointmentBoardCaps'
import type { AppointmentDayApiItem } from '../types'

/** นัดล่วงหน้า 3 วัน (สูตรเดิม = BOOKED) — ใช้แยกว่าชิปมาจากค่าที่เก็บ ไม่ใช่จากสูตร */
const BASE: AppointmentDayApiItem = {
  orderToken: 'tok-1', orderNo: 'DP1', createdAt: '2099-10-09T03:00:00.000Z', arrivalMode: null,
  start: '2099-10-12T03:00:00.000Z', end: '2099-10-12T04:00:00.000Z', appointmentStatus: 'SCHEDULED',
  buyerName: 'สมชาย', buyerContact: '0812345678', resource: { id: 'r1', name: 'ช่าง A' },
  source: null, salesChannel: null, customerAvatarUrl: null, conversationId: null,
  firstItemName: 'ตัดผม', itemCount: 1,
}

const render = (patch: Partial<AppointmentDayApiItem>) =>
  renderToStaticMarkup(
    h(AppointmentBoardCapsProvider, {
      value: { showMoney: false, canChat: false, canReschedule: false, canCreate: false, canRefundDeposit: false, canClose: false, viewerUserId: null, technicianOnly: false },
      children: h(AppointmentDayCard, { item: { ...BASE, ...patch }, now: new Date('2099-10-12T03:30:00.000Z'), onChanged: () => {} }),
    }),
  )

const count = (html: string, word: string) => html.split(word).length - 1

describe('AppointmentDayCard — บรรทัดที่มา (S-3)', () => {
  it('[blocker] STOREFRONT ⇒ ไม่แสดงที่มาเลย (ไม่มี "หน้าร้าน" · ไม่มี badge มุมรูป · ไม่มี "ช่องทาง" ใน aria)', () => {
    const html = render({ salesChannel: 'STOREFRONT' })
    expect(html).not.toContain('หน้าร้าน')
    expect(html).not.toContain('ช่องทาง')
  })

  it('[blocker] null ⇒ ไม่แสดงอะไร — ห้ามเติม "ไม่ระบุช่องทาง"', () => {
    const html = render({ salesChannel: null })
    expect(html).not.toContain('ไม่ระบุช่องทาง')
    expect(html).not.toContain('ช่องทาง')
  })

  it('LINE / FACEBOOK ⇒ แสดงชื่อช่องทาง', () => {
    expect(render({ salesChannel: 'LINE' })).toContain('LINE')
    expect(render({ salesChannel: 'FACEBOOK' })).toMatch(/Facebook/i)
  })

  it('มีเธรดแชท ⇒ แสดงชื่อเพจ (ชนะ salesChannel แม้เป็น STOREFRONT)', () => {
    const html = render({
      salesChannel: 'STOREFRONT',
      source: { channel: 'MESSENGER', pageName: 'เพจร้านทดสอบ', pageAvatarUrl: null },
    })
    expect(html).toContain('เพจร้านทดสอบ')
    expect(html).not.toContain('หน้าร้าน')
  })
})

describe('AppointmentDayCard — ชิปแบบการมา (S-3)', () => {
  it('[blocker] ร้านเลือก WALK_IN ⇒ ชิป "หน้าร้าน" แม้เวลานัดห่างเวลาเปิดบิล (ค่าที่เก็บชนะสูตร)', () => {
    const html = render({ arrivalMode: 'WALK_IN', salesChannel: 'STOREFRONT' })
    // ชิปเดียว — บรรทัดที่มาไม่พูดซ้ำ
    expect(count(html, 'หน้าร้าน')).toBe(1)
    expect(html).not.toContain('เดินเข้ามา')
  })

  it('[blocker] BOOKED (เก็บไว้หรือสูตรเดิม) ⇒ ชิป "จองล่วงหน้า" (00086 FR-002) · ไม่มี "หน้าร้าน"', () => {
    for (const arrivalMode of ['BOOKED', null] as const) {
      const html = render({ arrivalMode })
      expect(count(html, 'จองล่วงหน้า')).toBe(1)
      expect(html).not.toContain('หน้าร้าน')
    }
  })

  it('WALK_IN ⇒ ไม่มีชิป "จองล่วงหน้า" (ชิปเดียวต่อใบ)', () => {
    // title ของชิปหน้าร้านมีวลี "ไม่ได้จองล่วงหน้า" — นับเฉพาะป้ายที่เห็น
    expect(render({ arrivalMode: 'WALK_IN' })).not.toContain('>จองล่วงหน้า<')
  })

  it('ใบเก่าไม่มีค่าเก็บ + เปิดบิลตอนลูกค้ามาถึง ⇒ สูตรเดิมยังให้ชิป "หน้าร้าน"', () => {
    const html = render({ arrivalMode: null, createdAt: BASE.start })
    expect(count(html, 'หน้าร้าน')).toBe(1)
  })
})

describe('AppointmentDayCard — ป้ายสถานะงานหน้าร้าน (00086 FR-001)', () => {
  it('[blocker] WALK_IN + SCHEDULED ⇒ "รอเริ่มงาน" ไม่ใช่ "นัดแล้ว" (ทั้งป้ายและ aria-label)', () => {
    const html = render({ arrivalMode: 'WALK_IN' })
    expect(html).toContain('รอเริ่มงาน')
    expect(html).not.toContain('นัดแล้ว')
    expect(html).toContain('สถานะ รอเริ่มงาน')
  })

  it('[blocker] จองล่วงหน้า ⇒ "นัดแล้ว" เหมือนเดิม', () => {
    const html = render({ arrivalMode: 'BOOKED' })
    expect(html).toContain('นัดแล้ว')
    expect(html).not.toContain('รอเริ่มงาน')
  })

  it('WALK_IN แต่สถานะนัดเดินไปแล้ว (ให้บริการแล้ว) ⇒ ป้ายเดิมของสถานะนั้น', () => {
    const html = render({ arrivalMode: 'WALK_IN', appointmentStatus: 'COMPLETED' })
    expect(html).toContain('ให้บริการแล้ว')
    expect(html).not.toContain('รอเริ่มงาน')
  })
})

describe('StartWalkInSheet — บอก server ว่าเป็นหน้าร้าน', () => {
  it('[blocker] PATCH body ส่ง arrivalMode: WALK_IN', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/app/(paces)/seller/(chat)/_components/StartWalkInSheet.tsx'),
      'utf8',
    )
    const at = src.indexOf("method: 'PATCH'")
    expect(at, 'ต้องมี PATCH').toBeGreaterThan(-1)
    // ตัดเฉพาะก้อน body ของคำขอนี้ (ถึงวงเล็บปิดแรก) — ไม่นับคำที่อยู่ที่อื่นในไฟล์
    const from = src.indexOf('body: JSON.stringify({', at)
    const body = src.slice(from, src.indexOf('}),', from))
    expect(body).toMatch(/arrivalMode:\s*'WALK_IN'/)
  })
})
