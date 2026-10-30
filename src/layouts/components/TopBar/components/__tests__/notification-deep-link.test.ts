/**
 * notification-deep-link.test.ts — ลิงก์ของกระดิ่ง TopBar (00086 T11)
 * service_job_* → /orders/{refId} · staff_expense → /expenses · แชท → inbox · แถวส่วนตัวที่ไม่ใช่แชท → ไม่ navigate
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('simplebar-react', () => ({ default: () => null }))
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: null }) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/hooks/useShopSwitcher', () => ({ useShopSwitcher: () => ({}) }))
vi.mock('@/components/paces/ShopSwitchOverlay', () => ({ default: () => null }))
vi.mock('@/lib/paces-toast', () => ({ pacesToast: { error: vi.fn() } }))

import { deepLinkForKind } from '../NotificationDropdownPeople'

describe('deepLinkForKind', () => {
  it('งานบริการ → หน้างาน /orders/{refId}', () => {
    for (const kind of ['service_job_claimed', 'service_job_started', 'service_job_finished', 'service_job_closed']) {
      expect(deepLinkForKind({ kind, refId: 'tok', shopId: 's1' })).toBe('/orders/tok')
    }
  })

  it('staff_expense ยังไป /expenses · แชทไป inbox · แถวส่วนตัวอื่นไม่มีลิงก์', () => {
    expect(deepLinkForKind({ kind: 'staff_expense', refId: null, shopId: 's1' })).toBe('/expenses')
    expect(deepLinkForKind({ kind: 'chat_message', refId: 'c1', shopId: null })).toBe('/inbox/c1')
    expect(deepLinkForKind({ kind: 'badge_earned', refId: 'b', shopId: null })).toBeNull()
    // แถวงานบริการที่ไม่ผูกร้าน (ไม่ควรเกิด) — ไม่เดาปลายทาง
    expect(deepLinkForKind({ kind: 'service_job_started', refId: 'tok', shopId: null })).toBeNull()
  })
})
