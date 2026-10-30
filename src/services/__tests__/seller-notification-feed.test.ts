/**
 * seller-notification-feed.test.ts — mergeSellerFeed (00086 FR-020 · ฟังก์ชันบริสุทธิ์)
 * รวม activity + Notification ของร้าน เรียงใหม่→เก่า ตัดจำนวน · ลิงก์/สถานะอ่านของแจ้งเตือนมาถูก
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {} }))

import { mergeSellerFeed, pickServiceJobThumbs } from '@/services/seller-notification-feed.service'
import type { NotificationView } from '@/services/notification.service'

const at = (h: number) => new Date(Date.UTC(2026, 9, 27, h))
const notif = (id: string, h: number, kind = 'staff_expense', read = false): NotificationView => ({
  id, kind, title: 'สมชาย บันทึกค่าใช้จ่าย', body: '฿100 · อื่นๆ', refId: null, read, createdAt: at(h), shopId: 's1', shopName: 'ร้าน',
})

describe('mergeSellerFeed', () => {
  it('เรียงตามเวลารวมสองแหล่ง และตัดตาม take', () => {
    const feed = mergeSellerFeed(
      [
        { type: 'ORDER_CREATED', label: 'สร้างคำสั่งซื้อ', at: at(5), href: '/orders/x' },
        { type: 'REVIEW_RECEIVED', label: 'รีวิว', at: at(1) },
      ],
      [notif('n1', 3), notif('n2', 7, 'staff_expense', true)],
      3,
    )
    expect(feed.map((i) => i.key)).toEqual(['n-n2', expect.stringMatching(/^a-ORDER_CREATED/), 'n-n1'])
    expect(feed[0]).toMatchObject({ source: 'notification', id: 'n2', read: true, href: '/expenses', label: 'สมชาย บันทึกค่าใช้จ่าย ฿100 · อื่นๆ' })
    expect(feed[1]).toMatchObject({ source: 'activity', href: '/orders/x' })
  })

  it('kind ที่ยังไม่รู้จัก → ไม่มีลิงก์ (ไม่เดาปลายทาง)', () => {
    const [item] = mergeSellerFeed([], [notif('n3', 1, 'service_job')], 5)
    expect(item.href).toBeUndefined()
  })
})

// ── 00086 T11: แถวงานบริการ (service_job_*) ────────────────────────────────────
const sj = (id: string, h: number, kind: string, refId: string | null = 'tok'): NotificationView => ({
  id, kind, title: 'สมศักดิ์ เริ่มงาน', body: 'ล้างแอร์ · คุณสมชาย', refId, read: false, createdAt: at(h), shopId: 's1', shopName: 'ร้าน',
})
const closedActivity = (token: string, h: number) => ({ type: 'SERVICE_CLOSED' as const, label: `ปิดงาน ${token}`, at: at(h), href: `/orders/${token}` })

describe('mergeSellerFeed — งานบริการ (00086 T11)', () => {
  it('href รายแถว /orders/{refId} · ข้อความคั่นด้วย " · " (FR-014)', () => {
    const [item] = mergeSellerFeed([], [sj('n1', 1, 'service_job_started')], 5)
    expect(item).toMatchObject({ href: '/orders/tok', label: 'สมศักดิ์ เริ่มงาน · ล้างแอร์ · คุณสมชาย' })
  })

  it('ทั้ง 4 kind ได้ลิงก์หน้างาน · ไม่มี refId = ไม่มีลิงก์', () => {
    for (const k of ['service_job_claimed', 'service_job_started', 'service_job_finished', 'service_job_closed']) {
      expect(mergeSellerFeed([], [sj('n', 1, k)], 5)[0].href).toBe('/orders/tok')
    }
    expect(mergeSellerFeed([], [sj('n', 1, 'service_job_closed', null)], 5)[0].href).toBeUndefined()
  })

  it('body ว่าง → ไม่มี " · " ห้อย', () => {
    const [item] = mergeSellerFeed([], [{ ...sj('n1', 1, 'service_job_claimed'), body: '' }], 5)
    expect(item.label).toBe('สมศักดิ์ เริ่มงาน')
  })

  it('staff_expense ยังต่อด้วยช่องว่าง + ไป /expenses (ไม่เปลี่ยน)', () => {
    const [item] = mergeSellerFeed([], [notif('n1', 1)], 5)
    expect(item).toMatchObject({ href: '/expenses', label: 'สมชาย บันทึกค่าใช้จ่าย ฿100 · อื่นๆ' })
  })

  it('ตัดซ้ำ: มี service_job_closed ของ token เดียวกัน → activity "ปิดงาน" หาย · token อื่นยังอยู่', () => {
    const feed = mergeSellerFeed(
      [closedActivity('tok', 2), closedActivity('other', 3), { type: 'ORDER_CREATED', label: 'x', at: at(4), href: '/orders/tok' }],
      [sj('n1', 2, 'service_job_closed')],
      10,
    )
    const activity = feed.filter((i) => i.source === 'activity')
    expect(activity.map((i) => i.href)).toEqual(['/orders/tok', '/orders/other'])
    expect(activity.find((i) => i.source === 'activity' && i.type === 'SERVICE_CLOSED')?.href).toBe('/orders/other')
    expect(feed.filter((i) => i.source === 'notification')).toHaveLength(1)
  })

  it('ไม่มี service_job_closed (เช่นคนปิดงานเอง) → activity "ปิดงาน" อยู่ตามเดิม', () => {
    const feed = mergeSellerFeed([closedActivity('tok', 2)], [sj('n1', 1, 'service_job_finished'), notif('n2', 1)], 10)
    expect(feed.some((i) => i.source === 'activity' && i.type === 'SERVICE_CLOSED')).toBe(true)
  })

  it('ตัดซ้ำก่อนตัดจำนวน — ช่องที่ว่างถูกเติมด้วยรายการถัดไป', () => {
    const feed = mergeSellerFeed(
      [closedActivity('tok', 5), { type: 'REVIEW_RECEIVED', label: 'รีวิว', at: at(1) }],
      [sj('n1', 5, 'service_job_closed')],
      2,
    )
    expect(feed.map((i) => i.source)).toEqual(['notification', 'activity'])
  })

  it('รูปย่อ: เริ่มงาน ← ก่อนทำ · ทำเสร็จ ← หลังทำ · รูปแรกเท่านั้น · รับงาน/ปิดงานไม่มี', () => {
    const rows = [sj('s', 1, 'service_job_started'), sj('f', 2, 'service_job_finished'), sj('c', 3, 'service_job_claimed'), sj('x', 4, 'service_job_closed')]
    const thumbs = pickServiceJobThumbs(rows, [
      { phase: 'BEFORE', fileIds: ['b1', 'b2'], token: 'tok' },
      { phase: 'AFTER', fileIds: ['a1'], token: 'tok' },
    ])
    expect(Object.fromEntries(thumbs)).toEqual({ s: 'b1', f: 'a1' })
    const feed = mergeSellerFeed([], rows, 10, thumbs)
    const byId = Object.fromEntries(feed.map((i) => [i.key, i.source === 'notification' ? i.thumbFileId : undefined]))
    expect(byId).toEqual({ 'n-s': 'b1', 'n-f': 'a1', 'n-c': undefined, 'n-x': undefined })
  })

  it('รูปย่อ: บันทึกไม่มีรูป / ของงานอื่น → ไม่มีรูปย่อ', () => {
    const thumbs = pickServiceJobThumbs([sj('s', 1, 'service_job_started')], [
      { phase: 'BEFORE', fileIds: [], token: 'tok' },
      { phase: 'BEFORE', fileIds: ['z'], token: 'other' },
    ])
    expect(thumbs.size).toBe(0)
  })
})
