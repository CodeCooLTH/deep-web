/**
 * OrdersList — mobile orders (Shopee-IA × Paces skin, v8.2)
 *
 * header: [← back] [search] [filter btn → full modal] [bell]  → sticky top
 * tabs: status filter (count badge, underline)  → primary nav
 * list: OrderCard standalone + lazy-load on scroll (IntersectionObserver, ไม่มี pagination)
 * filter modal: full-screen — order type (แทน select เดิม)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/orders/components/OrdersList.tsx
 *       (tabs underline + count); modal pattern: theme/paces/.../_modal.css
 * SellerMobileHeader คืน null สำหรับ /orders → หน้านี้เป็นเจ้าของ header เอง
 */

'use client'

import Icon from '@/components/wrappers/Icon'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { cn } from '@/utils/helpers'
import type { OrderRow } from './data'
import OrderCard from './OrderCard'
import { pacesConfirm } from '@/lib/paces-swal'
import { pacesToast } from '@/lib/paces-toast'
import SellerEmptyState from '../../_shared/SellerEmptyState'
import OrdersTable from './OrdersTable'

// ─── status tabs ────────────────────────────────────────────────────────────
const STATUS_TABS: { value: string; label: string }[] = [
  { value: 'all',       label: 'ทั้งหมด' },
  { value: 'PENDING',   label: 'รอดำเนินการ' },
  { value: 'SHIPPED',   label: 'จัดส่งแล้ว' },
  { value: 'CONFIRMED', label: 'สำเร็จ' },
  { value: 'CANCELLED', label: 'ยกเลิก' },
]

// ─── order type options (ใช้ใน filter modal) ────────────────────────────────
const TYPE_OPTIONS = [
  { value: '',         label: 'ทุกประเภท' },
  { value: 'PHYSICAL', label: 'สินค้า' },
  { value: 'DIGITAL',  label: 'ดิจิทัล' },
  { value: 'SERVICE',  label: 'บริการ' },
]

const PAGE = 8 // จำนวนต่อรอบ lazy-load

type Props = {
  orders: OrderRow[]
  activeStatus: string
}

export default function OrdersList({ orders, activeStatus }: Props) {
  const router   = useRouter()
  const pathname = usePathname()

  const [localStatus, setLocalStatus] = useState<string>(activeStatus ?? 'all')
  const [search,      setSearch]      = useState('')
  const [typeFilter,  setTypeFilter]  = useState('')
  const [visibleCount, setVisibleCount] = useState(PAGE)
  const [filterOpen,  setFilterOpen]  = useState(false)

  const sentinelRef = useRef<HTMLDivElement | null>(null)

  // ─── tabs: swipe ซ้าย/ขวาทั้งจอเพื่อสลับ tab (แบบ Shopee) + auto-scroll tab active เข้าจอ ───
  const tabsRef = useRef<HTMLDivElement | null>(null)
  const touchStart = useRef<{ x: number; y: number; inHeader: boolean }>({ x: 0, y: 0, inHeader: false })

  const switchTabByDir = (dir: number) => {
    const idx = STATUS_TABS.findIndex((t) => t.value === localStatus)
    const next = idx + dir
    if (next >= 0 && next < STATUS_TABS.length) handleStatusTab(STATUS_TABS[next].value)
  }
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0]
    touchStart.current = {
      x: t.clientX,
      y: t.clientY,
      // ปัดที่ header (search/tab strip) → ไม่สลับ (ปล่อยให้ strip เลื่อน / search ทำงาน)
      inHeader: !!(e.target as HTMLElement).closest('[data-orders-header]'),
    }
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStart.current.inHeader) return
    const t = e.changedTouches[0]
    const dx = t.clientX - touchStart.current.x
    const dy = t.clientY - touchStart.current.y
    // ต้องเป็น swipe แนวนอนชัดเจน (กันชนกับ scroll แนวตั้ง)
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return
    switchTabByDir(dx < 0 ? 1 : -1) // ปัดซ้าย = tab ถัดไป, ปัดขวา = ก่อนหน้า
  }

  // เลื่อน tab ที่ active เข้ามากลางจอเมื่อสลับ (โดยเฉพาะจาก swipe)
  useEffect(() => {
    tabsRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [localStatus])

  // ─── status tab click (sync URL) ───────────────────────────────────────────
  const handleStatusTab = (value: string) => {
    setLocalStatus(value)
    if (value === 'all') router.push(pathname, { scroll: false })
    else router.push(`${pathname}?status=${value}`, { scroll: false })
  }

  // ─── count per status ───────────────────────────────────────────────────────
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: orders.length }
    for (const o of orders) counts[o.status] = (counts[o.status] ?? 0) + 1
    return counts
  }, [orders])

  // ─── filter pipeline ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = orders
    if (localStatus !== 'all') list = list.filter((o) => o.status === localStatus)
    if (typeFilter) list = list.filter((o) => o.orderType === typeFilter)
    if (search.trim()) {
      const q = search.toLowerCase().trim()
      list = list.filter(
        (o) =>
          o.id.toLowerCase().includes(q) ||
          o.publicToken.toLowerCase().includes(q) ||
          (o.buyerName ?? '').toLowerCase().includes(q) ||
          o.buyer.toLowerCase().includes(q),
      )
    }
    return list
  }, [orders, localStatus, typeFilter, search])

  // reset lazy-load เมื่อ filter/search/status เปลี่ยน
  useEffect(() => {
    setVisibleCount(PAGE)
  }, [localStatus, typeFilter, search])

  // ─── lazy-load: เพิ่ม visibleCount เมื่อ sentinel เข้า viewport ───────────────
  const visible = filtered.slice(0, visibleCount)
  const hasMore = visibleCount < filtered.length

  useEffect(() => {
    if (!hasMore) return
    const el = sentinelRef.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setVisibleCount((c) => c + PAGE)
      },
      { rootMargin: '200px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [hasMore, filtered.length])

  // ─── cancel callbacks (Sweet Alerts confirm — Hard Rule safepay-ux #8) ──────────
  const handleCancelRequest = async (token: string) => {
    const order = orders.find((o) => o.publicToken === token)
    const label = order ? `ออเดอร์ #${order.id.toUpperCase()}` : 'ออเดอร์นี้'
    const ok = await pacesConfirm.danger('ยกเลิกออเดอร์นี้?', `${label} จะถูกปิด · ย้อนกลับไม่ได้`, {
      confirmButtonText: 'ยืนยันยกเลิก',
      cancelButtonText: 'ไม่ใช่ตอนนี้',
    })
    if (!ok) return
    try {
      const res = await fetch(`/api/orders/${token}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (res.ok) {
        pacesToast.success('ยกเลิกออเดอร์แล้ว')
        router.refresh()
      } else {
        const data = await res.json().catch(() => ({}))
        pacesToast.error(typeof data?.error === 'string' ? data.error : 'ยกเลิกออเดอร์ไม่สำเร็จ กรุณาลองใหม่')
      }
    } catch {
      pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
    }
  }

  const activeFilterCount = typeFilter ? 1 : 0

  return (
    <>
      {/* ─── Desktop (≥lg): DataTable แบบ Paces theme ──────────────────────── */}
      <div className="hidden lg:block">
        <OrdersTable orders={orders} />
      </div>

      {/* ─── Mobile/Tablet (<lg): card layout เดิม (ห้ามแตะ logic ข้างใน) ─── */}
      <div className="lg:hidden">
      {/* phone: full-bleed (-mx-4 หักล้าง shell padding); tablet+ (md): center + max-width
          กันการ์ดยืดเต็มกว้างบน tablet (responsive). marker .orders-fullbleed = CSS :has() scope
          onTouch*: swipe ซ้าย/ขวาเพื่อสลับ status tab */}
      <div
        className="orders-fullbleed -mx-4 md:mx-auto md:max-w-2xl"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
      {/* ─── Sticky header (พื้นขาว bg-card): back + search + filter + bell + tabs ──
          z-30: Paces .btn มี position:relative z-index:10 → ปุ่มในการ์ดจะทะลุทับ header
          ตอน scroll ถ้า header z ≤ 10. ดัน z-30 ให้ชนะ (modal = z-50 ยังเหนือกว่า) */}
      <div data-orders-header className="sticky top-0 z-30 bg-card px-2 pt-6">
        <div className="flex items-center gap-2">
          {/* back → /dashboard (แท็บหลัก: กลับหน้าหลัก) */}
          <Link
            href="/dashboard"
            aria-label="ย้อนกลับ"
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-default-700"
          >
            <Icon icon="arrow-left" className="text-xl" />
          </Link>

          {/* search */}
          <div className="relative flex-1">
            <Icon icon="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-default-500" />
            <input
              type="text"
              className="form-input w-full !pl-9"
              placeholder="ค้นหาออเดอร์..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* filter → full modal */}
          <button
            type="button"
            onClick={() => setFilterOpen(true)}
            aria-label="ตัวกรอง"
            className="relative inline-flex size-10 shrink-0 items-center justify-center rounded-lg border border-default-300 text-default-700"
          >
            <Icon icon="adjustments-horizontal" className="text-lg" />
            {activeFilterCount > 0 && (
              <span className="absolute -right-1 -top-1 size-2.5 rounded-full bg-primary ring-2 ring-body-bg" />
            )}
          </button>

          {/* bell → /notifications */}
          <Link
            href="/notifications"
            aria-label="การแจ้งเตือน"
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-default-700"
          >
            <Icon icon="bell" className="text-xl" />
          </Link>

          {/* สร้างออเดอร์ — desktop เท่านั้น (มือถือใช้ FAB ใน bottom nav) */}
          <Link
            href="/orders/new"
            className="btn hidden shrink-0 bg-primary text-white hover:bg-primary-hover lg:inline-flex"
          >
            <Icon icon="plus" className="text-sm" />
            สร้างออเดอร์
          </Link>
        </div>

        {/* status tabs — เลื่อนแนวนอน (ซ่อน scrollbar); สลับด้วย swipe ทั้งจอ
            ตัวอักษร inactive = สีดำ (text-default-900), active = primary + underline */}
        <div ref={tabsRef} className="no-scrollbar mt-2 flex gap-1 overflow-x-auto border-b border-default-200">
          {STATUS_TABS.map((tab) => {
            const active = localStatus === tab.value
            const count  = statusCounts[tab.value] ?? 0
            return (
              <button
                key={tab.value}
                type="button"
                data-active={active}
                onClick={() => handleStatusTab(tab.value)}
                className={cn(
                  'relative inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors focus:outline-none',
                  active
                    ? 'border-primary text-primary'
                    : 'border-transparent text-default-900',
                )}
              >
                {tab.label}
                <span className={cn('rounded-full px-1.5 text-xs', active ? 'bg-primary/15 text-primary' : 'bg-default-200 text-default-600')}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ─── Order cards + lazy-load ──────────────────────────────────────────── */}
      {visible.length === 0 ? (
        <div className="card mt-3">
          <div className="card-body">
            <SellerEmptyState
              compact
              icon="shopping-cart-off"
              title="ไม่มีออเดอร์ในสถานะนี้"
              action={{ label: '+ สร้างออเดอร์แรก', href: '/orders/new' }}
            />
          </div>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {visible.map((order) => (
            <OrderCard key={order.publicToken} order={order} onCancelRequest={handleCancelRequest} />
          ))}

          {/* sentinel — IntersectionObserver โหลดเพิ่มเมื่อเลื่อนถึง */}
          {hasMore && (
            <div ref={sentinelRef} className="flex items-center justify-center gap-2 py-4 text-xs text-default-500">
              <span className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              กำลังโหลด...
            </div>
          )}
          {!hasMore && filtered.length > PAGE && (
            <p className="py-3 text-center text-xs text-default-400">ครบทุกออเดอร์แล้ว ({filtered.length})</p>
          )}
        </div>
      )}
      </div>{/* /full-bleed wrapper */}
      </div>{/* /lg:hidden mobile wrapper */}

      {/* ─── Filter modal (full screen) — อยู่นอก lg:hidden เพราะเป็น overlay ใช้ทุก breakpoint ───────────────────────────────────────── */}
      {filterOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-card" role="dialog" aria-modal="true" aria-label="ตัวกรอง">
          <div className="flex items-center gap-3 border-b border-default-200 px-4 py-3">
            <button
              type="button"
              onClick={() => setFilterOpen(false)}
              aria-label="ปิด"
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-default-700"
            >
              <Icon icon="x" className="text-xl" />
            </button>
            <span className="text-lg font-semibold text-default-900">ตัวกรอง</span>
          </div>

          <div className="flex-1 overflow-auto p-4">
            <p className="mb-2 text-sm font-medium text-default-900">ประเภทออเดอร์</p>
            <div className="space-y-1">
              {TYPE_OPTIONS.map((opt) => {
                const active = typeFilter === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setTypeFilter(opt.value)}
                    className={cn(
                      'flex w-full items-center justify-between rounded-lg border px-4 py-3 text-sm transition-colors',
                      active ? 'border-primary bg-primary/5 text-primary' : 'border-default-200 text-default-700',
                    )}
                  >
                    {opt.label}
                    {active && <Icon icon="check" className="text-base" />}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex gap-2 border-t border-default-200 p-4">
            <button
              type="button"
              onClick={() => setTypeFilter('')}
              className="btn flex-1 border-default-300 text-default-700"
            >
              ล้างตัวกรอง
            </button>
            <button
              type="button"
              onClick={() => setFilterOpen(false)}
              className="btn flex-1 bg-primary text-white hover:bg-primary-hover"
            >
              ดูผลลัพธ์
            </button>
          </div>
        </div>
      )}

    </>
  )
}
