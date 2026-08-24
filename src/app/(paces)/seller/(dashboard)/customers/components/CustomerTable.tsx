'use client'

/**
 * CustomerTable — ตาราง/การ์ดลูกค้าของ seller
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/customers/components/CustomerTable.tsx
 *
 * ── feature 00057 ────────────────────────────────────────────────────────────
 * 1. **ค้นหา/กรองย้ายไปฝั่ง server** (`?q=` `?warn=` `?repeat=`) — ของเดิมใช้ TanStack
 *    `globalFilter` บน array ที่ `contact` ถูก mask ไปแล้ว ⇒ ค้นเบอร์เต็มไม่มีทางเจอ
 * 2. ทุกแถวกดได้ → `/customers/{key}` (เดสก์ท็อป: `onRowClick` ของ DataTable ซึ่งมี guard
 *    ปุ่ม/ลิงก์ในตัวแล้ว · มือถือ: stretched-link แบบเดียวกับ `ProductCard.tsx`/`OrderCard.tsx`)
 * 3. ไอคอนสัญญาณเตือนท้ายชื่อ — component เดียวกับตาราง `/orders`
 * 4. ปุ่มแสดงเบอร์เต็มทีละแถว (ยิง endpoint ตอนกด ไม่ฝังเบอร์มากับหน้า)
 *
 * 🛑 ลิงก์โปรไฟล์สาธารณะแยกออกจาก "ชื่อ" มาเป็นไอคอนของตัวเอง — เดิมทั้งชื่อเป็น `<a>` ไปโดเมน
 * buyer พอทั้งแถวกดได้แล้วไปหน้าโปรไฟล์ในระบบ การให้ *ชื่อ* (พื้นที่ที่คนกดมากที่สุด) พาไป
 * คนละที่กับ *แถว* คือกับดักที่ผู้ใช้ไม่มีทางเดาถูก
 */

import DataTable from '@/components/table/DataTable'
import TablePagination from '@/components/table/TablePagination'
import FilterDropdown from '@/components/safepay/FilterDropdown'
import { CustomerBehaviorIcons } from '@/components/safepay/CustomerBehaviorBadges'
import ListBusyOverlay, {
  useListBusy,
} from '@/app/(paces)/seller/(dashboard)/_shared/ListBusyOverlay'
import Icon from '@/components/wrappers/Icon'
import { formatDateTime } from '@/lib/format-date'
import { formatBaht } from '@/lib/format-money'
import { pacesToast } from '@/lib/paces-toast'
import { resolveBuyerBaseUrl } from '@/lib/buyer-url'
import type { RepeatFilter } from '@/lib/customer-directory'
import {
  createColumnHelper,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from '@tanstack/react-table'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { CustomerRow } from './data'

/** หน่วงก่อนยิงคำค้นไป server — สั้นพอให้รู้สึกทันที ยาวพอไม่ยิงทุกตัวอักษร */
const SEARCH_DEBOUNCE_MS = 350

const columnHelper = createColumnHelper<CustomerRow>()

/* ────────────────────────────────────────────────────────────────────────────
 * ปุ่มแสดงเบอร์เต็มทีละแถว
 *
 * 🛑 ประกาศไว้ที่ **ระดับโมดูล** ไม่ใช่ในตัว render ของ CustomerTable — component ที่ประกาศ
 * ในตัว render เป็นชนิดใหม่ทุก re-render ⇒ React unmount ทิ้งทั้งซับทรีแล้ว mount ใหม่ทุกครั้ง
 * ที่แม่ setState (state ที่เปิดเผยเบอร์ไว้จะหายทุกครั้งที่พิมพ์ค้นหา)
 * (`docs/conventions/component-declared-in-render.md`)
 * ──────────────────────────────────────────────────────────────────────────── */
function ContactCell({ row }: { row: CustomerRow }) {
  const [full, setFull] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const reveal = useCallback(async () => {
    if (loading) return
    setLoading(true)
    try {
      const res = await fetch(`/api/seller/customers/${encodeURIComponent(row.key)}/contact`)
      if (!res.ok) {
        // อ่านข้อความจาก server ถ้าอ่านได้ — 4xx/5xx ของโปรเจกต์นี้ตอบ { error } เสมอ
        const msg = await res
          .json()
          .then((d: { error?: string }) => d?.error)
          .catch(() => null)
        pacesToast.error(msg || 'แสดงเบอร์ไม่สำเร็จ กรุณาลองใหม่')
        return
      }
      const data = (await res.json()) as { contact?: string }
      if (!data.contact) {
        pacesToast.error('ลูกค้ารายนี้ไม่มีข้อมูลติดต่อ')
        return
      }
      setFull(data.contact)
    } catch {
      pacesToast.error('แสดงเบอร์ไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setLoading(false)
    }
  }, [loading, row.key])

  return (
    <span className="inline-flex items-center gap-1">
      {/* select-all: คลิกเดียวเลือกทั้งเบอร์ ไม่ต้องลาก (ท่าเดียวกับตาราง /orders) */}
      <span className="text-default-500 select-all font-mono text-sm tabular-nums">
        {full ?? row.contact}
      </span>
      {row.hasContact && (
        <button
          type="button"
          onClick={() => (full ? setFull(null) : reveal())}
          disabled={loading}
          // มือถือต้องได้พื้นที่นิ้ว 44px แต่เดสก์ท็อปใช้เมาส์ — ย่อได้โดยไม่ลดความหมาย
          className="text-default-400 hover:text-default-700 inline-flex size-11 shrink-0 items-center justify-center rounded-full disabled:opacity-50 lg:size-7"
          aria-label={full ? 'ซ่อนเบอร์โทร' : 'แสดงเบอร์โทรเต็ม'}
          title={full ? 'ซ่อนเบอร์โทร' : 'แสดงเบอร์โทรเต็ม'}>
          <Icon
            icon={loading ? 'loader-2' : full ? 'eye-off' : 'eye'}
            className={loading ? 'animate-spin text-sm' : 'text-sm'}
            aria-hidden="true"
          />
        </button>
      )}
    </span>
  )
}

type CustomerTableProps = {
  customers: CustomerRow[]
  /** ร้านนี้มีลูกค้าอยู่บ้างไหม (ก่อนกรอง) — ใช้แยกข้อความ empty 2 แบบ */
  hasAnyCustomer: boolean
  initialQuery: string
  initialWarn: boolean
  initialRepeat: RepeatFilter | null
}

const CustomerTable = ({
  customers,
  hasAnyCustomer,
  initialQuery,
  initialWarn,
  initialRepeat,
}: CustomerTableProps) => {
  const router = useRouter()
  const pathname = usePathname()
  const busy = useListBusy()
  // 🛑 destructure ออกมาก่อนใส่ deps — ใส่ `busy` ทั้งก้อนจะเป็นลูปยิงไม่หยุด
  // (`docs/conventions/hook-return-identity-in-deps.md`)
  const { begin, run } = busy

  const [query, setQuery] = useState(initialQuery)

  // buyerBase ต้องเป็น state เพราะ window ไม่พร้อมตอน SSR
  const [buyerBase, setBuyerBase] = useState('https://deepthailand.app')
  useEffect(() => {
    setBuyerBase(resolveBuyerBaseUrl())
  }, [])

  /**
   * กระจกของตัวกรองปัจจุบัน — ให้ effect ของช่องค้นหาอ่านค่าล่าสุดได้โดย **ไม่ต้องใส่ใน deps**
   * (ถ้าใส่ การเปลี่ยนตัวกรองจะไปกระตุ้น effect ของคำค้นให้ push ซ้ำอีกรอบโดยไม่จำเป็น)
   */
  const filtersRef = useRef({ warn: initialWarn, repeat: initialRepeat })
  filtersRef.current = { warn: initialWarn, repeat: initialRepeat }

  const pushWith = useCallback(
    (next: { q: string; warn: boolean; repeat: RepeatFilter | null }) => {
      const params = new URLSearchParams()
      if (next.q) params.set('q', next.q)
      if (next.warn) params.set('warn', '1')
      if (next.repeat) params.set('repeat', next.repeat)
      const qs = params.toString()
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [router, pathname],
  )

  /**
   * ช่องค้นหา: `setQuery` เป็น setState ธรรมดา (ไม่อยู่ใน transition) ตัวอักษรจึงตามนิ้วทัน —
   * `begin()` เปิดแผงโหลดระหว่างพิมพ์ ส่วน `run()` คาแผงไว้จนกว่า RSC ชุดใหม่จะมาถึงจริง
   */
  const firstRun = useRef(true)
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false
      return
    }
    begin()
    const timer = setTimeout(() => {
      run(() => pushWith({ q: query, ...filtersRef.current }))
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query, begin, run, pushWith])

  const openProfile = useCallback(
    (key: string) => {
      run(() => router.push(`/customers/${encodeURIComponent(key)}`))
    },
    [router, run],
  )

  const columns = [
    columnHelper.accessor('displayName', {
      header: 'ลูกค้า',
      cell: ({ row }) => (
        <div className="flex min-w-0 items-center gap-3">
          {/* Avatar placeholder: ใช้ initial แทน image — ไม่มี avatar ใน MVP */}
          <div className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
            {row.original.initial}
          </div>
          <h5 className="flex min-w-0 items-center gap-1 text-sm font-medium">
            <span className="max-w-full truncate">{row.original.displayName}</span>
            {row.original.isRegistered && row.original.username && (
              // ใช้ <a> แทน next/link เพราะเป็น cross-domain nav ไปยัง buyer domain
              // href เป็น absolute URL เพื่อป้องกัน proxy /seller/u/{username} → 404
              <a
                href={`${buyerBase}/u/${row.original.username}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-default-400 hover:text-primary shrink-0"
                aria-label={`เปิดโปรไฟล์สาธารณะของ ${row.original.displayName}`}
                title="เปิดโปรไฟล์สาธารณะ">
                <Icon icon="external-link" className="text-sm" aria-hidden="true" />
              </a>
            )}
            <CustomerBehaviorIcons badges={row.original.badges} />
          </h5>
        </div>
      ),
    }),
    columnHelper.accessor('contact', {
      header: 'ติดต่อ',
      cell: ({ row }) => <ContactCell row={row.original} />,
    }),
    columnHelper.accessor('totalOrders', {
      header: 'ออเดอร์ทั้งหมด',
      cell: ({ row }) => <span className="font-medium">{row.original.totalOrders}</span>,
    }),
    columnHelper.accessor('totalSpent', {
      header: () => (
        <div className="flex flex-col">
          <span>ยอดซื้อสะสม</span>
          <span className="text-2xs text-default-400 font-normal">(นับเป็นยอดขายแล้ว)</span>
        </div>
      ),
      cell: ({ row }) => (
        <span className="text-default-900 text-sm font-semibold tabular-nums">
          {formatBaht(row.original.totalSpent)}
        </span>
      ),
    }),
    columnHelper.accessor('lastOrderISO', {
      header: 'ออเดอร์ล่าสุด',
      cell: ({ row }) => (
        // แปลง ISO string → formatDateTime (พ.ศ., tz ไทย)
        <span className="text-default-500 text-sm">{formatDateTime(row.original.lastOrderISO)}</span>
      ),
    }),
  ]

  const [sorting, setSorting] = useState<SortingState>([])
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 8 })

  const table = useReactTable({
    data: customers,
    columns,
    state: { sorting, pagination },
    onSortingChange: (updater) => run(() => setSorting(updater)),
    onPaginationChange: (updater) => run(() => setPagination(updater)),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    // ไม่มี column filter / global filter อีกแล้ว — การกรองเกิดที่ server ทั้งหมด
    filterFns: {},
  })

  const pageIndex = table.getState().pagination.pageIndex
  const pageSize = table.getState().pagination.pageSize
  const totalItems = customers.length
  const start = pageIndex * pageSize + 1
  const end = Math.min(start + pageSize - 1, totalItems)

  const hasFilter = !!query || initialWarn || !!initialRepeat
  const emptyMessage = hasAnyCustomer
    ? 'ไม่พบลูกค้าที่ตรงกับตัวกรองนี้'
    : 'ยังไม่มีลูกค้า — รอผู้ซื้อสั่งซื้อสินค้าจากร้านค้าของคุณ'

  const clearFilters = () => {
    setQuery('')
    run(() => pushWith({ q: '', warn: false, repeat: null }))
  }

  return (
    <div className="card">
      <div className="card-header">
        <div className="flex gap-2.5">
          <div className="input-icon-group">
            <Icon icon="search" className="input-icon" />
            <input
              type="search"
              placeholder="ค้นหาชื่อ หรือ เบอร์โทร"
              className="form-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 md:flex-nowrap">
          <FilterDropdown
            icon="alert-triangle"
            value={initialWarn ? 'warn' : 'All'}
            resetValue="All"
            defaultLabel="สัญญาณเตือน"
            options={[
              { value: 'All', label: 'ทั้งหมด' },
              { value: 'warn', label: 'มีสัญญาณเตือน' },
            ]}
            onChange={(v) =>
              run(() =>
                pushWith({ q: query, warn: v === 'warn', repeat: filtersRef.current.repeat }),
              )
            }
          />
          <FilterDropdown
            icon="repeat"
            value={initialRepeat ?? 'All'}
            resetValue="All"
            defaultLabel="ประวัติการซื้อ"
            options={[
              { value: 'All', label: 'ทั้งหมด' },
              { value: 'repeat', label: 'ซื้อซ้ำแล้ว' },
              { value: 'first', label: 'ซื้อครั้งเดียว' },
            ]}
            onChange={(v) =>
              run(() =>
                pushWith({
                  q: query,
                  warn: filtersRef.current.warn,
                  repeat: v === 'repeat' || v === 'first' ? v : null,
                }),
              )
            }
          />
          <select
            className="form-select"
            value={pageSize}
            onChange={(e) => run(() => table.setPageSize(Number(e.target.value)))}>
            {[5, 8, 10, 15, 20].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 🛑 `relative` อยู่ที่กล่องผลลัพธ์เท่านั้น — แผงโหลดต้องไม่ทับ card-header ซึ่งเป็นสิ่งที่
          ผู้ใช้เพิ่งกดและกำลังจะกดต่อ (ช่องค้นหาจะหายไปใต้แผงตั้งแต่ตัวอักษรแรก) */}
      <div className="relative">
        <DataTable<CustomerRow>
          table={table}
          emptyMessage={emptyMessage}
          onRowClick={(row) => openProfile(row.original.key)}
          mobileCard={(row) => {
            const c = row.original
            return (
              // stretched-link: ลิงก์กินทั้งใบเป็นชั้นล่างสุด ปุ่มจริงยกขึ้น z-10
              // (แพตเทิร์นเดียวกับ ProductCard.tsx / OrderCard.tsx)
              <div className="relative flex flex-col">
                <Link
                  href={`/customers/${encodeURIComponent(c.key)}`}
                  className="absolute inset-0 z-0"
                  aria-label={`ดูโปรไฟล์ของ ${c.displayName}`}
                />
                <div className="flex items-center gap-3 px-1 py-3.5">
                  <div className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
                    {c.initial}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-default-900 flex min-w-0 items-center gap-1 text-sm font-medium">
                      <span className="max-w-full truncate">{c.displayName}</span>
                      <CustomerBehaviorIcons badges={c.badges} />
                    </p>
                    <span className="relative z-10 inline-flex">
                      <ContactCell row={c} />
                    </span>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-default-900 text-sm leading-tight font-semibold">
                      {c.totalOrders}
                    </p>
                    <p className="text-2xs text-default-400 leading-tight">ออเดอร์</p>
                  </div>
                </div>
                {/* row 2: ล่าสุด + ยอดซื้อสะสม — เส้นทึบ (dashed สงวนให้ .card-header เท่านั้น) */}
                <div className="border-default-100 flex items-center justify-between gap-3 border-t px-1 pt-3 pb-3.5">
                  <div>
                    <p className="text-2xs text-default-400">ล่าสุด</p>
                    <p className="text-default-500 text-sm">{formatDateTime(c.lastOrderISO)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xs text-default-400">ยอดซื้อสะสม (นับเป็นยอดขายแล้ว)</p>
                    <p className="text-default-900 text-sm font-semibold tabular-nums">
                      {formatBaht(c.totalSpent)}
                    </p>
                  </div>
                </div>
              </div>
            )
          }}
        />
        {/* ผลลัพธ์ว่างเพราะตัวกรอง → ต้องมีทางออกให้กด ไม่ใช่ปล่อยให้ผู้ใช้เดาว่าต้องล้างเอง */}
        {totalItems === 0 && hasAnyCustomer && hasFilter && (
          <div className="flex justify-center pb-6">
            <button type="button" onClick={clearFilters} className="btn border-default-300 gap-1">
              <Icon icon="filter-off" className="text-sm" aria-hidden="true" />
              ล้างตัวกรอง
            </button>
          </div>
        )}
        <ListBusyOverlay busy={busy.busy} />
      </div>

      {totalItems > 0 && (
        <div className="card-footer">
          <TablePagination
            totalItems={totalItems}
            start={start}
            end={end}
            itemsName="รายการ"
            showInfo
            previousPage={table.previousPage}
            canPreviousPage={table.getCanPreviousPage()}
            pageCount={table.getPageCount()}
            pageIndex={pageIndex}
            setPageIndex={table.setPageIndex}
            nextPage={table.nextPage}
            canNextPage={table.getCanNextPage()}
          />
        </div>
      )}
    </div>
  )
}

export default CustomerTable
