import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DeskSnapshot } from '@/lib/chat-desk/types'

const m = vi.hoisted(() => ({
  hook: { snapshot: null as unknown, status: 'ok' as string, lastUpdatedAt: 1_760_600_000_000 as number | null, refresh: () => {} },
  presence: { status: 'ready' as 'ready' | 'unavailable', keys: ['k1'] },
}))
vi.mock('@/hooks/useDeskSnapshot', () => ({ useDeskSnapshot: () => m.hook }))
vi.mock('@/hooks/useChatDeskPresence', () => ({ useChatDeskPresence: () => m.presence }))
vi.mock('@/components/PageBreadcrumb', () => ({ default: ({ title, action }: { title: string; action?: React.ReactNode }) => <div><h4>{title}</h4>{action}</div> }))
vi.mock('../DeskCanvas', () => ({ default: () => <div data-canvas /> }))

import DeskPageClient from '../DeskPageClient'

const U1 = '11111111-1111-4111-8111-111111111111'
const snap = (over: Partial<DeskSnapshot> = {}): DeskSnapshot => ({
  v: 1, serverNow: Date.parse('2026-10-16T07:10:00.000Z'), shop: { id: 's1', name: 'ร้านทดสอบ', kind: 'BUSINESS' },
  sla: { firstResponseSec: 300, source: 'default' }, filters: { platforms: [], pages: [], admins: [] }, awaiting: { capped: false },
  rooms: [
    { id: 'r1', name: 'สมหญิง', platform: 'MESSENGER', pageId: 'p1', state: 'WAITING', askedAt: '2026-10-16T07:00:00.000Z', lastInboundAt: '2026-10-16T07:00:00.000Z', repliedAt: null, desk: null },
    ...['a', 'b', 'c', 'd'].map((i) => ({ id: `d${i}`, name: `คนที่ ${i}`, platform: 'LINE' as const, pageId: null, state: 'AT_DESK' as const, askedAt: null, lastInboundAt: null, repliedAt: '2026-10-16T07:09:00.000Z', desk: { kind: 'ADMIN' as const, userId: U1 } })),
  ],
  members: [{ userId: U1, name: 'Palmy', role: 'ADMIN', canChat: true, presenceKey: 'k1' }],
  channels: [{ id: 'p1', name: 'เพจหลัก', provider: 'FACEBOOK' }],
  daily: { status: 'OK', asOf: '', firstResponseAvgSec: 90, responseAvgSec: 120, responseSampleCount: 4, unattributedReplyCount: 7, answeredOutsideSystemConversations: 1, resolvedToday: 9 },
  ...over,
})
const render = (view: '2d' | '3d' | null = '2d') =>
  renderToStaticMarkup(<DeskPageClient ownerShops={[{ id: 's1', name: 'ร้านทดสอบ' }]} initialShopId="s1" initialFilters={{ platforms: [], pages: [], admins: [] }} initialView={view} />)

beforeEach(() => {
  m.hook = { snapshot: snap(), status: 'ok', lastUpdatedAt: 1_760_600_000_000, refresh: () => {} }
  m.presence = { status: 'ready', keys: ['k1'] }
})

describe('DeskPageClient — สถานะหน้า', () => {
  it('2D: เลานจ์ + โต๊ะแสดงครบทุกคน (ไม่ตัดที่ 3) + sr-only สรุป', () => {
    const h = render('2d')
    expect(h).toContain('เลานจ์ · ลูกค้ารอคำตอบ (1)')
    for (const n of ['a', 'b', 'c', 'd']) expect(h).toContain(`คนที่ ${n}`)
    expect(h).toContain('รอคำตอบ 1 คน เกินเวลาตอบ 1 คน')
  })

  it('3D (จอแคบ): แถบเครื่องมือ + แถบสรุปล่าง + ปุ่มสัญลักษณ์ · ไม่มีการ์ดลอย (การ์ดลอยเฉพาะ lg)', () => {
    const h = render('3d')
    expect(h).toContain('role="toolbar"')
    expect(h).toContain('ดูทั้งหมด')
    expect(h).toContain('สัญลักษณ์')
    expect(h).not.toContain('ภาพรวมห้องแชท')
  })

  it('forbidden: การ์ดไม่มีสิทธิ์ ไม่มีข้อมูลร้าน/ห้องเหลือ', () => {
    m.hook = { snapshot: null, status: 'forbidden', lastUpdatedAt: null, refresh: () => {} }
    const h = render()
    expect(h).toContain('หน้านี้ดูได้เฉพาะเจ้าของร้าน')
    expect(h).not.toContain('สมหญิง')
    expect(h).not.toContain('ร้านทดสอบ')
  })

  it('error ครั้งแรก: มีปุ่มลองใหม่ (ปุ่มจริง ไม่ใช่ลิงก์)', () => {
    m.hook = { snapshot: null, status: 'error', lastUpdatedAt: null, refresh: () => {} }
    const h = render()
    expect(h).toContain('โหลดโต๊ะแชทไม่สำเร็จ')
    expect(h).toMatch(/<button[^>]*>ลองใหม่<\/button>/)
  })

  it('ร้านไม่มีแชทเลย: empty พร้อมลิงก์ตั้งค่าช่องทาง', () => {
    m.hook = { ...m.hook, snapshot: snap({ rooms: [], channels: [] }) }
    const h = render()
    expect(h).toContain('ร้านนี้ยังไม่มีแชท')
    expect(h).toContain('href="/settings/channels"')
  })

  it('ตัวกรองทำให้ว่าง: แถบ "ไม่พบห้องตามตัวกรองที่เลือก" ไม่ใช่ห้องว่างจริง (ใช้ 3D บน lg ไม่ได้ในเทส node → ตรวจที่ 2D มือถือ)', () => {
    m.hook = { ...m.hook, snapshot: snap({ rooms: [], filters: { platforms: ['LINE'], pages: [], admins: [] } }) }
    const h = render('2d')
    expect(h).toContain('ไม่พบห้องตามตัวกรองที่เลือก')
    expect(h).toContain('ล้างตัวกรอง')
  })

  it('presence ล่ม: ออนไลน์ "—" (ไม่ใช่ 0/1) และโต๊ะแอดมินไม่ขึ้นออฟไลน์', () => {
    m.presence = { status: 'unavailable', keys: [] }
    const h = render('2d')
    expect(h).toContain('ตรวจสถานะออนไลน์ไม่ได้ตอนนี้')
    expect(h).not.toContain('ออฟไลน์')
    expect(h).not.toContain('0/1')
  })

  it('หลายร้าน: มีตัวสลับร้าน · ร้านเดียว: ไม่มี', () => {
    const multi = renderToStaticMarkup(<DeskPageClient ownerShops={[{ id: 's1', name: 'ร้านเอ' }, { id: 's2', name: 'ร้านบี' }]} initialShopId="s1" initialFilters={{ platforms: [], pages: [], admins: [] }} initialView="2d" />)
    expect(multi).toContain('aria-haspopup="menu"')
    expect(render('2d')).not.toContain('aria-haspopup="menu"')
  })
})
