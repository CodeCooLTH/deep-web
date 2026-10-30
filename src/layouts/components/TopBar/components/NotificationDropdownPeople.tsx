'use client'

/**
 * NotificationDropdownPeople — bell notification (Paces, seller/admin) — ปิด FLAG-3 (feat 00011 Deep Chat)
 *
 * เดิมเป็น static demo (user4..8 mock avatar) — แปลงเป็น client component fetch
 * `Notification` table จริง (kind=chat_message/badge_earned) ผ่าน GET /api/notifications,
 * mark-read ผ่าน POST /api/notifications/read
 *
 * Base markup (โครง dropdown/SimpleBar/item คงไว้):
 *   theme/paces/Admin/TS/src/layouts/components/TopBar/components/NotificationDropdownPeople.tsx
 * Base controlled-dropdown (useState + click-outside + Escape — เลี่ยง Preline hs-dropdown
 *   opacity ค้าง 0 เมื่อ re-render ระหว่างเปิด เช่นคลิก mark-read):
 *   src/components/safepay/FilterDropdown.tsx
 * Base loading-spinner + unread-tint (bg-primary/5 — HR7 exception precedent NotificationFeed.tsx:182):
 *   src/app/(paces)/seller/(dashboard)/notifications/components/NotificationFeed.tsx (L182, L245)
 *
 * Spec: docs/20 - Features/00011 - Deep Chat/UX-Design-Spec-Bell.md §Seller bell
 * ไม่มีปุ่ม "ดูทั้งหมด" ท้าย dropdown ตามข้อสรุป OQ1 (v1 dropdown-only)
 *
 * 00086 FR-020 (user ตัดสิน 2026-10-27): แจ้งเตือนที่ผูกร้าน (shopId) — ไอคอน/ลิงก์จาก src/lib/shop-notification.ts
 * · เป็นของ "ร้านอื่น" ที่ไม่ใช่ร้านที่เปิดอยู่ → โชว์ชื่อร้าน และกดแล้วสลับร้านก่อน (useShopSwitcher
 *   แบบเดียวกับ ChatShopAutoSwitch: overlay สั้น 800ms แล้ว hard-navigate ไปลิงก์ของแจ้งเตือน)
 *   เพราะหน้าปลายทางอ่านร้านจาก activeShopId — ไม่สลับก่อน = เปิดหน้าของผิดร้าน
 */

import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import { relativeTimeTh } from '@/lib/relative-time-th'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import ShopSwitchOverlay from '@/components/paces/ShopSwitchOverlay'
import { useShopSwitcher } from '@/hooks/useShopSwitcher'
import { isOtherShopNotification, shopNotificationHref, shopNotificationStyle } from '@/lib/shop-notification'
import { useEffect, useRef, useState } from 'react'
import SimpleBar from 'simplebar-react'

type NotificationItem = {
  id: string
  kind: string
  title: string
  body: string
  refId: string | null
  read: boolean
  createdAt: string
  // 00086 — null = แจ้งเตือนระดับบัญชี (badge/แชท)
  shopId?: string | null
  shopName?: string | null
}

type NotificationsResponse = {
  items: NotificationItem[]
  nextCursor: string | null
  unreadCount: number
}

// icon + สีตาม kind (spec: chat_message=message-circle primary, badge_earned=award warning, อื่น=bell default)
function iconForKind(kind: string): { icon: string; className: string } {
  if (kind === 'chat_message') return { icon: 'message-circle', className: 'text-primary' }
  if (kind === 'badge_earned') return { icon: 'award', className: 'text-warning' }
  // แจ้งเตือนของร้าน (staff_expense → receipt ฯลฯ) · kind ที่ไม่รู้จัก = bell เหมือนเดิม
  const st = shopNotificationStyle(kind)
  return { icon: st.icon, className: st.colorClass }
}

// deep-link ตาม kind — chat_message ไปที่ inbox ของ conversation, kind อื่นแค่ mark-read ไม่ navigate
// แจ้งเตือนของร้าน: ลิงก์รายแถว (service_job_* → /orders/{refId} · 00086 T11) หรือคงที่ตาม kind (staff_expense → /expenses)
export function deepLinkForKind(item: Pick<NotificationItem, 'kind' | 'refId' | 'shopId'>): string | null {
  if (item.kind === 'chat_message' && item.refId) return `/inbox/${item.refId}`
  if (item.shopId) return shopNotificationHref(item.kind, item.refId)
  return null
}

const NotificationDropdownPeople = () => {
  const router = useRouter()
  const { data: session } = useSession()
  const activeShopId = (session?.user as { activeShopId?: string | null } | undefined)?.activeShopId ?? null
  // ผู้ใช้ตั้งใจ "อ่านแจ้งเตือน" ไม่ได้ตั้งใจสลับร้าน — overlay สั้น (เหตุผลเดียวกับ ChatShopAutoSwitch)
  const { switching, target, switchShop } = useShopSwitcher({ minOverlayMs: 800 })
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [markingAll, setMarkingAll] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const fetchNotifications = () => {
    setLoading(true)
    setError(false)
    fetch('/api/notifications')
      .then((res) => (res.ok ? (res.json() as Promise<NotificationsResponse>) : Promise.reject(new Error('fetch failed'))))
      .then((data) => {
        setItems(data.items)
        setUnreadCount(data.unreadCount)
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }

  // fetch on mount
  useEffect(() => {
    fetchNotifications()
  }, [])

  // refetch on dropdown open (OQ3)
  useEffect(() => {
    if (open) fetchNotifications()
  }, [open])

  // controlled dropdown: click-outside + Escape (FilterDropdown pattern — ไม่ใช้ hs-dropdown attribute)
  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  const handleItemClick = async (item: NotificationItem) => {
    // optimistic local read
    const wasUnread = !item.read
    setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, read: true } : n)))
    if (wasUnread) setUnreadCount((prev) => Math.max(0, prev - 1))

    try {
      const res = await fetch('/api/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id }),
      })
      if (!res.ok) throw new Error('mark-read failed')
    } catch {
      pacesToast.error('ทำเครื่องหมายอ่านแล้วไม่สำเร็จ กรุณาลองใหม่')
    }

    const link = deepLinkForKind(item)
    setOpen(false)
    if (link && isOtherShopNotification(item.shopId, activeShopId)) {
      switchShop(item.shopId as string, { name: item.shopName ?? undefined }, { landingPath: link })
      return
    }
    if (link) router.push(link)
  }

  const handleMarkAllRead = async () => {
    if (markingAll || unreadCount === 0) return
    setMarkingAll(true)
    const prevItems = items
    const prevUnread = unreadCount
    setItems((prev) => prev.map((n) => ({ ...n, read: true })))
    setUnreadCount(0)
    try {
      const res = await fetch('/api/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res.ok) throw new Error('mark-all-read failed')
    } catch {
      setItems(prevItems)
      setUnreadCount(prevUnread)
      pacesToast.error('ทำเครื่องหมายอ่านแล้วทั้งหมดไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setMarkingAll(false)
    }
  }

  const badgeLabel = unreadCount > 9 ? '9+' : String(unreadCount)

  return (
    <div className="topbar-item relative inline-flex" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="topbar-link relative flex items-center"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="การแจ้งเตือน"
      >
        <Icon icon="bell" className="topbar-link-icon" />
        {unreadCount > 0 && (
          <span className="badge bg-danger absolute -end-px -top-4 size-4 rounded-full leading-0 text-white text-2xs">
            {badgeLabel}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute top-full end-0 z-30 mt-1 min-w-80 rounded border border-default-300 bg-card p-0 shadow-lg"
          role="menu"
          aria-orientation="vertical"
        >
          <div className="border-default-300 border-b px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <h6 className="text-base font-semibold">การแจ้งเตือน</h6>
              {unreadCount > 0 && (
                <span className="badge badge-label py-1.5 bg-danger/15 text-danger">{unreadCount} ใหม่</span>
              )}
            </div>
          </div>

          <div className="border-default-100 flex items-center justify-end border-b px-4 py-2">
            <button
              type="button"
              onClick={handleMarkAllRead}
              disabled={markingAll || unreadCount === 0}
              className="text-primary hover:text-primary/80 flex items-center gap-1 text-xs transition-colors disabled:opacity-50"
            >
              <Icon icon="solar:check-read-line-duotone" className="text-base" />
              อ่านทั้งหมด
            </button>
          </div>

          <SimpleBar style={{ maxHeight: '340px' }}>
            {loading && (
              <div className="flex items-center justify-center gap-3 py-8">
                <div
                  className="animate-spin size-5 border-2 border-primary border-t-transparent rounded-full"
                  role="status"
                  aria-label="กำลังโหลด"
                />
                <span className="text-sm text-default-500 font-medium">กำลังโหลด...</span>
              </div>
            )}

            {!loading && error && (
              <div className="flex flex-col items-center gap-2 py-8 text-default-400">
                <Icon icon="alert-circle" className="text-3xl text-default-300" />
                <p className="text-sm">โหลดการแจ้งเตือนไม่สำเร็จ</p>
                <button type="button" onClick={fetchNotifications} className="text-primary hover:text-primary/80 text-xs">
                  ลองใหม่
                </button>
              </div>
            )}

            {!loading && !error && items.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-10 text-default-400">
                <Icon icon="bell-off" className="text-3xl text-default-300" />
                <p className="text-sm">ยังไม่มีการแจ้งเตือน</p>
              </div>
            )}

            {!loading &&
              !error &&
              items.map((item) => {
                const { icon, className } = iconForKind(item.kind)
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleItemClick(item)}
                    className={`dropdown-item w-full gap-3 px-4.5 py-3 text-start text-wrap ${
                      /* unread tint — HR7 exception precedent NotificationFeed.tsx:182 (Paces ไม่มี token tint ระดับนี้) */
                      !item.read ? 'bg-primary/5 rounded-lg' : ''
                    }`}
                  >
                    <span className="shrink-0">
                      <span className="size-9 rounded-full bg-light flex items-center justify-center">
                        <Icon icon={icon} className={`text-lg ${className}`} />
                      </span>
                    </span>

                    <span className="grow min-w-0 text-default-400">
                      <span className="font-medium text-body-color block truncate">{item.title}</span>
                      <span className="block truncate">{item.body}</span>
                      {item.shopName && isOtherShopNotification(item.shopId, activeShopId) && (
                        <span className="flex items-center gap-1 text-xs min-w-0">
                          <Icon icon="building-store" className="shrink-0" />
                          <span className="truncate">{item.shopName}</span>
                        </span>
                      )}
                      <span className="text-xs">{relativeTimeTh(new Date(item.createdAt).getTime())}</span>
                    </span>
                  </button>
                )
              })}
          </SimpleBar>
        </div>
      )}
      <ShopSwitchOverlay show={switching} targetName={target?.name} targetKind={target?.kind} targetLogo={target?.logo} />
    </div>
  )
}

export default NotificationDropdownPeople
