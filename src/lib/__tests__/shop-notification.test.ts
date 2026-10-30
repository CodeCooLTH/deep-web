/**
 * shop-notification.test.ts — ไอคอน/ลิงก์/ข้อความของแจ้งเตือนของร้าน (00086 FR-020 + T11 FR-014)
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {} }))

import { SERVICE_JOB_NOTIFICATION_KINDS } from '@/services/service-job-notify.service'
import { shopNotificationHref, shopNotificationLabel, shopNotificationStyle } from '@/lib/shop-notification'

describe('shop-notification', () => {
  it('ทุก kind ของ notifier งานบริการมีสไตล์ + ลิงก์หน้างาน (กันเพิ่ม kind แล้วลืมที่นี่)', () => {
    expect(SERVICE_JOB_NOTIFICATION_KINDS).toHaveLength(4)
    for (const k of SERVICE_JOB_NOTIFICATION_KINDS) {
      expect(shopNotificationStyle(k).icon).not.toBe('bell')
      expect(shopNotificationHref(k, 'abc')).toBe('/orders/abc')
      expect(shopNotificationHref(k, null)).toBeNull()
    }
  })

  it('ไอคอน/สีตาม UX spec T11', () => {
    expect(shopNotificationStyle('service_job_claimed')).toMatchObject({ icon: 'user-check', feedIcon: 'solar:user-check-rounded-bold-duotone', colorClass: 'text-info' })
    expect(shopNotificationStyle('service_job_started')).toMatchObject({ icon: 'player-play', feedIcon: 'solar:play-circle-bold-duotone', colorClass: 'text-primary' })
    expect(shopNotificationStyle('service_job_finished')).toMatchObject({ icon: 'clock', feedIcon: 'solar:clock-circle-bold-duotone', colorClass: 'text-warning' })
    expect(shopNotificationStyle('service_job_closed')).toMatchObject({ icon: 'clipboard-check', feedIcon: 'solar:check-circle-bold-duotone', colorClass: 'text-primary' })
  })

  it('staff_expense / kind ไม่รู้จัก ไม่เปลี่ยน', () => {
    expect(shopNotificationHref('staff_expense', 'whatever')).toBe('/expenses')
    expect(shopNotificationHref('staff_expense', null)).toBe('/expenses')
    expect(shopNotificationHref('mystery', 'x')).toBeNull()
    expect(shopNotificationLabel('staff_expense', 'ก บันทึก', '฿1')).toBe('ก บันทึก ฿1')
    expect(shopNotificationLabel('mystery', 'ก', '')).toBe('ก')
  })

  it('ข้อความงานบริการคั่น " · " ไม่มี body = ไม่ห้อย', () => {
    expect(shopNotificationLabel('service_job_closed', 'ก ปิดงาน', 'ล้างแอร์ · คุณข')).toBe('ก ปิดงาน · ล้างแอร์ · คุณข')
    expect(shopNotificationLabel('service_job_closed', 'ก ปิดงาน', '')).toBe('ก ปิดงาน')
  })
})
