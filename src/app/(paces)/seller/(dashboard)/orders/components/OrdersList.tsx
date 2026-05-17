/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/orders/components/OrdersList.tsx
 *
 * Adaptations from theme:
 * - toolbar: search input + type filter select + page-size select (ซ้าย) + "สร้างออเดอร์" (ขวา) ตาม list.html L62-71
 * - status tabs: underline style + count badge ต่อ tab (ตาม list.html L75-80)
 * - DataTable/TanStack: ถูก strip ออกทั้งหมด — ใช้ card layout (space-y-2.5 ของ OrderCard) แทน (spec D5)
 * - search = client globalFilter (เลขออเดอร์/ชื่อลูกค้า) ไม่ใช้ DataTable infrastructure
 * - pagination: custom footer ตาม list.html L92-98
 * - cancel modal: CancelOrderModal hosted ที่นี่ (controlled state cancelToken)
 * - empty state: SellerEmptyState compact; error: SellerErrorState (ไม่แตะ SellerErrorState.tsx)
 * - "สร้างออเดอร์" ลิงก์ → /orders/new (next/link ปกติ; Paces ไม่มี MUI)
 */

'use client'

import Icon from '@/components/wrappers/Icon'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { cn } from '@/utils/helpers'
import type { OrderRow, OrderStatus } from './data'
import OrderCard from './OrderCard'
import CancelOrderModal from './CancelOrderModal'
import SellerEmptyState from '../../_shared/SellerEmptyState'

// ─── tab config ──────────────────────────────────────────────────────────────
const STATUS_TABS: {
  value: string
  label: string
  badgeCls: string
}[] = [
  { value: 'all',       label: 'ทั้งหมด',       badgeCls: 'bg-default-200 text-default-700' },
  { value: 'PENDING',   label: 'รอดำเนินการ',   badgeCls: 'bg-warning/20 text-warning' },
  { value: 'SHIPPED',   label: 'จัดส่งแล้ว',    badgeCls: 'bg-primary/15 text-primary' },
  { value: 'CONFIRMED', label: 'สำเร็จ',        badgeCls: 'bg-success/15 text-success' },
  { value: 'CANCELLED', label: 'ยกเลิก',        badgeCls: 'bg-danger/15 text-danger' },
]

// ─── order type options สำหรับ filter select ────────────────────────────────
const TYPE_OPTIONS = [
  { value: '',         label: 'ประเภทออเดอร์' },
  { value: 'PHYSICAL', label: 'สินค้า' },
  { value: 'DIGITAL',  label: 'ดิจิทัล' },
  { value: 'SERVICE',  label: 'บริการ' },
]

// ─── page size options ────────────────────────────────────────────────────────
const PAGE_SIZES = [10, 25, 50]

type Props = {
  orders: OrderRow[]
  activeStatus: string
}

export default function OrdersList({ orders, activeStatus }: Props) {
  const router   = useRouter()
  const pathname = usePathname()

  // ─── local UI state ───────────────────────────────────────────────────────
  const [localStatus, setLocalStatus] = useState<string>(activeStatus ?? 'all')
  const [search,      setSearch]      = useState('')
  const [typeFilter,  setTypeFilter]  = useState('')
  const [pageSize,    setPageSize]    = useState(10)
  const [pageIndex,   setPageIndex]   = useState(0)

  // cancel modal
  const [cancelToken,   setCancelToken]   = useState<string | null>(null)
  const [cancelDisplay, setCancelDisplay] = useState<string | undefined>(undefined)

  // ─── handle status tab click ─────────────────────────────────────────────
  const handleStatusTab = (value: string) => {
    setLocalStatus(value)
    setPageIndex(0)
    // sync URL ด้วย pathname เต็ม เพื่อให้ pushState อัปเดต address bar จริง
    // (relative `?status=` ไม่ trigger pushState ใน Next 16 App Router — ต้องใช้ pathname + query string)
    if (value === 'all') {
      router.push(pathname, { scroll: false })
    } else {
      router.push(`${pathname}?status=${value}`, { scroll: false })
    }
  }

  // ─── count per status ─────────────────────────────────────────────────────
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: orders.length }
    for (const o of orders) {
      counts[o.status] = (counts[o.status] ?? 0) + 1
    }
    return counts
  }, [orders])

  // ─── client filter pipeline ───────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = orders

    // 1. status tab
    if (localStatus !== 'all') {
      list = list.filter((o) => o.status === localStatus)
    }

    // 2. order type filter
    if (typeFilter) {
      list = list.filter((o) => o.orderType === typeFilter)
    }

    // 3. global search: เลขออเดอร์ (id/publicToken) หรือ ชื่อลูกค้า/buyer
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

  // ─── pagination ──────────────────────────────────────────────────────────
  const totalItems = filtered.length
  const pageCount  = Math.max(1, Math.ceil(totalItems / pageSize))
  const safePage   = Math.min(pageIndex, pageCount - 1)
  const start      = safePage * pageSize
  const end        = Math.min(start + pageSize, totalItems)
  const paginated  = filtered.slice(start, end)

  const handleSearch = (v: string) => {
    setSearch(v)
    setPageIndex(0)
  }
  const handleTypeFilter = (v: string) => {
    setTypeFilter(v)
    setPageIndex(0)
  }
  const handlePageSize = (v: number) => {
    setPageSize(v)
    setPageIndex(0)
  }

  // ─── cancel modal callbacks ──────────────────────────────────────────────
  const handleCancelRequest = (token: string) => {
    // หา displayId จาก orders
    const order = orders.find((o) => o.publicToken === token)
    setCancelToken(token)
    setCancelDisplay(order?.id.toUpperCase())
  }

  return (
    <>
      {/* ─── Main orders card ─────────────────────────────────────────────── */}
      <div className="card">

        {/* card-header: search + filters (ซ้าย) + สร้างออเดอร์ (ขวา) ตาม list.html L62-71 */}
        <div className="card-header flex-wrap gap-3">
          {/* ซ้าย: search + type filter + page size
              ลบ flex-1 ออก — ไม่ให้ container stretch เต็มแถว ซึ่งทำให้ selects ถูกดันลงแถวล่าง
              flex-wrap เฉพาะ mobile; md+ บังคับ flex-nowrap ให้ 1 แถว */}
          <div className="flex flex-wrap items-center gap-2 md:flex-nowrap">
            {/* search input พร้อม icon */}
            <div className="relative">
              <Icon icon="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-default-500 text-sm" />
              <input
                type="text"
                className="form-input w-full !pl-9 sm:w-64"
                placeholder="ค้นหาออเดอร์..."
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
              />
            </div>

            {/* filter ประเภทออเดอร์ */}
            <select
              className="form-select w-auto"
              value={typeFilter}
              onChange={(e) => handleTypeFilter(e.target.value)}
            >
              {TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            {/* page size */}
            <select
              className="form-select w-auto"
              value={pageSize}
              onChange={(e) => handlePageSize(Number(e.target.value))}
            >
              {PAGE_SIZES.map((s) => (
                <option key={s} value={s}>
                  แสดง {s}
                </option>
              ))}
            </select>
          </div>

          {/* ขวา: ปุ่มสร้างออเดอร์ — next/link ปกติ (Paces ไม่มี MUI) */}
          <Link
            href="/orders/new"
            className="btn bg-primary text-white hover:bg-primary-hover shrink-0"
          >
            <Icon icon="plus" className="text-sm" />
            สร้างออเดอร์
          </Link>
        </div>

        {/* status tabs — underline style ตาม list.html L74-80 */}
        <div className="flex gap-1 overflow-x-auto border-b border-default-300 px-3">
          {STATUS_TABS.map((tab) => {
            const active = localStatus === tab.value
            const count  = statusCounts[tab.value] ?? 0
            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => handleStatusTab(tab.value)}
                className={cn(
                  'relative inline-flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap',
                  'border-b-2 transition-colors focus:outline-none shrink-0',
                  active
                    ? 'text-primary border-primary'
                    : 'text-default-500 border-transparent hover:text-primary hover:border-default-400',
                )}
              >
                {tab.label}
                <span className={cn('ml-1 rounded-full px-1.5 text-xs', tab.badgeCls)}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        {/* card-body: รายการ order การ์ด */}
        <div className="card-body">
          {paginated.length === 0 ? (
            /* empty state — ไม่มีออเดอร์ในแท็บ/filter นี้ */
            <SellerEmptyState
              compact
              icon="shopping-cart-off"
              title="ไม่มีออเดอร์ในสถานะนี้"
              action={{ label: '+ สร้างออเดอร์แรก', href: '/orders/new' }}
            />
          ) : (
            <div className="space-y-2.5">
              {paginated.map((order) => (
                <OrderCard
                  key={order.publicToken}
                  order={order}
                  onCancelRequest={handleCancelRequest}
                />
              ))}
            </div>
          )}
        </div>

        {/* card-footer: pagination ตาม list.html L92-98 */}
        {totalItems > 0 && (
          <div className="card-footer">
            <p className="text-xs text-default-500">
              แสดง <span>{Math.min(end, totalItems) - start}</span> จาก {totalItems} ออเดอร์
            </p>
            <div className="flex gap-1">
              <button
                type="button"
                className="btn btn-sm border-default-300 text-default-700 disabled:opacity-40"
                disabled={safePage === 0}
                onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
              >
                ก่อนหน้า
              </button>

              {Array.from({ length: pageCount }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  className={cn(
                    'btn btn-sm',
                    i === safePage
                      ? 'bg-primary text-white'
                      : 'border-default-300 text-default-700',
                  )}
                  onClick={() => setPageIndex(i)}
                >
                  {i + 1}
                </button>
              ))}

              <button
                type="button"
                className="btn btn-sm border-default-300 text-default-700 disabled:opacity-40"
                disabled={safePage >= pageCount - 1}
                onClick={() => setPageIndex((p) => Math.min(pageCount - 1, p + 1))}
              >
                ถัดไป
              </button>
            </div>
          </div>
        )}
      </div>

      {/* CancelOrderModal — hosted ที่นี่เพราะ state cancelToken อยู่ที่ list level */}
      <CancelOrderModal
        open={cancelToken !== null}
        token={cancelToken}
        displayId={cancelDisplay}
        onClose={() => {
          setCancelToken(null)
          setCancelDisplay(undefined)
        }}
      />
    </>
  )
}
