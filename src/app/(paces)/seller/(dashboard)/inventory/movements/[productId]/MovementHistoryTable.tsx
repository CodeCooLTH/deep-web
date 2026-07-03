'use client'

/**
 * MovementHistoryTable — ตารางประวัติการเคลื่อนไหวสต็อก (S-19, feature 00009 Deep Stock Pro)
 *
 * Base:
 *   - table markup (plain <table>, ไม่ TanStack — Design Decision #4 ของ UX-Design-Spec §S-18/S-19) ←
 *     theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(inventory)/product-stocks/components/ProductStockTable.tsx
 *     (โครง card > card-header search/page-size > table table-hover > thead-sm > card-footer)
 *   - delta signed สี+เครื่องหมาย ← src/app/(paces)/seller/(dashboard)/wallet/components/WalletTransactionTable.tsx:90-104
 *     (amount column signed+color) — ancestor theme: .../orders/components/OrdersList.tsx
 *   - โหลดเพิ่ม spinner ← src/app/(paces)/seller/(dashboard)/notifications/components/NotificationTimeline.tsx:216-225
 *     (sentinel spinner block) — ancestor theme: theme/paces/Admin/TS/src/app/(admin)/apps/crm/activities/page.tsx
 *
 * Adaptations:
 * - ไม่มี search/filter/pagination (spec ระบุ "ไม่ต้อง sort/filter/pagination") — "โหลดเพิ่ม" แบบ manual
 *   cursor call จริงไปหา GET /api/inventory/movements (ไม่ local slice)
 * - refId ไม่แสดงเป็นคอลัมน์ (design decision — เป็น order.id ไม่ใช่ publicToken, link ไป order นอก scope)
 * - error โหลดเพิ่ม → pacesToast.error (HR9 — ไม่ใช้ react-toastify/alert ใน (paces)/**)
 */

import { useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import { cn } from '@/utils/helpers'
import { formatDateTime } from '@/lib/format-date'
import { pacesToast } from '@/lib/paces-toast'

export type MovementRow = {
  id: string
  delta: number
  resultingQty: number
  source: string
  note: string | null
  actorUserId: string | null
  /** ISO string (RSC ส่ง Date.toISOString() มาแล้ว) — ใช้ทั้ง format แสดงผล และเป็น cursor สำหรับ "โหลดเพิ่ม" */
  createdAt: string
}

type ApiResponse = { items: MovementRow[]; nextCursor: string | null }

// แหล่งที่มา — badge label + token ตาม Content spec (S-19)
const SOURCE_META: Record<string, { label: string; cls: string }> = {
  ORDER_DEDUCT: { label: 'คำสั่งซื้อ', cls: 'bg-default-100 text-default-600' },
  ORDER_RESTOCK: { label: 'คืนสต็อก (ยกเลิก)', cls: 'bg-success/15 text-success' },
  MANUAL_ADJUST: { label: 'ปรับเอง', cls: 'bg-info/15 text-info' },
}

// note='นำเข้าจาก CSV' ทับ label ของ MANUAL_ADJUST เป็น "นำเข้า CSV" (ยัง badge token เดียวกัน bg-info/15)
function sourceBadge(row: MovementRow): { label: string; cls: string } {
  if (row.source === 'MANUAL_ADJUST' && row.note === 'นำเข้าจาก CSV') {
    return { label: 'นำเข้า CSV', cls: 'bg-info/15 text-info' }
  }
  return SOURCE_META[row.source] ?? { label: row.source, cls: 'bg-default-100 text-default-600' }
}

type Props = {
  productId: string
  initialItems: MovementRow[]
  initialNextCursor: string | null
}

const MovementHistoryTable = ({ productId, initialItems, initialNextCursor }: Props) => {
  const [items, setItems] = useState<MovementRow[]>(initialItems)
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor)
  const [loading, setLoading] = useState(false)

  const loadMore = async () => {
    if (!nextCursor || loading) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ productId, cursor: nextCursor, take: '20' })
      const res = await fetch(`/api/inventory/movements?${params.toString()}`)
      if (!res.ok) throw new Error('load-more failed')
      const data: ApiResponse = await res.json()
      setItems((prev) => [...prev, ...data.items])
      setNextCursor(data.nextCursor)
    } catch {
      pacesToast.error('โหลดเพิ่มไม่สำเร็จ ลองใหม่อีกครั้ง')
    } finally {
      setLoading(false)
    }
  }

  // empty state — ยังไม่มีประวัติเลย
  if (items.length === 0) {
    return (
      <div className="card">
        <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
          <Icon icon="history" className="text-default-300 size-12" aria-hidden="true" />
          <p className="text-default-400 text-sm">ยังไม่มีประวัติการเคลื่อนไหวของสินค้านี้</p>
        </div>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="overflow-x-auto">
        <table className="table table-hover">
          <thead className="thead-sm">
            <tr className="bg-light/25 text-2xs uppercase">
              <th>เวลา</th>
              <th>การเปลี่ยนแปลง</th>
              <th>คงเหลือหลังรายการ</th>
              <th>แหล่งที่มา</th>
              <th>หมายเหตุ</th>
              <th>ผู้ทำรายการ</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => {
              const badge = sourceBadge(row)
              const isPositive = row.delta > 0
              const isNegative = row.delta < 0
              return (
                <tr key={row.id}>
                  <td className="text-default-400 text-sm whitespace-nowrap">{formatDateTime(row.createdAt)}</td>
                  <td>
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 font-semibold tabular-nums',
                        isPositive && 'text-success',
                        isNegative && 'text-danger',
                        !isPositive && !isNegative && 'text-default-500',
                      )}
                    >
                      {isPositive && <Icon icon="arrow-up" className="text-sm" aria-hidden="true" />}
                      {isNegative && <Icon icon="arrow-down" className="text-sm" aria-hidden="true" />}
                      {isPositive ? `+${row.delta}` : row.delta}
                    </span>
                  </td>
                  <td className="text-default-700 tabular-nums">{row.resultingQty}</td>
                  <td>
                    <span className={cn('badge', badge.cls)}>{badge.label}</span>
                  </td>
                  <td className="text-default-600 text-sm">{row.note ?? '—'}</td>
                  <td className="text-default-600 text-sm">
                    {row.actorUserId === null ? 'ระบบ (อัตโนมัติ)' : 'คุณ'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* card-footer — "โหลดเพิ่ม" (cursor จริง) / "แสดงครบแล้ว" เมื่อ nextCursor=null */}
      <div className="card-footer flex justify-center">
        {nextCursor ? (
          <button
            type="button"
            onClick={loadMore}
            disabled={loading}
            className="btn btn-sm border-default-300 text-default-800 hover:border-default-400 inline-flex items-center gap-2 border disabled:opacity-60"
          >
            {loading ? (
              <>
                <span
                  className="border-primary size-4 animate-spin rounded-full border-2 border-t-transparent"
                  role="status"
                  aria-label="กำลังโหลด"
                />
                กำลังโหลด...
              </>
            ) : (
              <>
                <Icon icon="chevron-down" className="text-base" />
                โหลดเพิ่ม
              </>
            )}
          </button>
        ) : (
          <span className="text-default-400 text-sm">แสดงครบแล้ว</span>
        )}
      </div>
    </div>
  )
}

export default MovementHistoryTable
