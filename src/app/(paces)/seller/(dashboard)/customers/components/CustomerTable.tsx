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
import { CustomerBehaviorIcons } from '@/components/safepay/CustomerBehaviorBadges'
import CustomerTrustBar from '@/components/safepay/CustomerTrustBar'
import ListBusyOverlay, {
  useListBusy,
} from '@/app/(paces)/seller/(dashboard)/_shared/ListBusyOverlay'
import Icon from '@/components/wrappers/Icon'
import { formatDateTime } from '@/lib/format-date'
import { formatBaht } from '@/lib/format-money'
import { pacesToast } from '@/lib/paces-toast'
import { resolveBuyerBaseUrl } from '@/lib/buyer-url'
import type { CustomerListFilter } from '@/lib/customer-directory'
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
      <span className="text-default-500 select-all text-sm tabular-nums">
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
  initialFilter: CustomerListFilter
  /** จำนวนลูกค้าที่มีสัญญาณเตือน — โชว์บนชิปให้เห็นก่อนกด (ตัวเลขเดียวกับการ์ดสถิติ) */
  watchCount: number
}

/**
 * ชิปกรอง — เลือกได้ทีละอัน แทนดรอปดาวน์ 2 ตัวของเดิม
 *
 * 🛑 ป้ายต้องบอก **ขอบเขต** ในตัวเอง — "เคยตีกลับกับร้านนี้" เป็นระดับร้าน ส่วนแถบใน
 * แต่ละแถวเป็น **ทั้งระบบ** ถ้าเขียนแค่ "เคยตีกลับ" ผู้ใช้จะอ่านว่าเป็นชุดเดียวกัน (HR16)
 */
const FILTER_CHIPS: { value: CustomerListFilter; label: string; tone?: 'warning' }[] = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'warn', label: 'ต้องเฝ้าระวัง', tone: 'warning' },
  { value: 'returned', label: 'เคยตีกลับกับร้านนี้' },
  { value: 'repeat', label: 'ซื้อซ้ำ' },
]

const CustomerTable = ({
  customers,
  hasAnyCustomer,
  initialQuery,
  initialFilter,
  watchCount,
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
  const filtersRef = useRef(initialFilter)
  filtersRef.current = initialFilter

  const pushWith = useCallback(
    (next: { q: string; f: CustomerListFilter }) => {
      const params = new URLSearchParams()
      if (next.q) params.set('q', next.q)
      if (next.f !== 'all') params.set('f', next.f)
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
      run(() => pushWith({ q: query, f: filtersRef.current }))
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
          {/*
            🛑 ชื่อต้องเป็น `<Link>` ไม่ใช่ `<span>` — เดิมทางเข้าหน้าโปรไฟล์บนเดสก์ท็อปมี
            **ทางเดียว** คือ `onRowClick` ที่ `DataTable` แปะลง `<tr>` เปล่า ๆ (ไม่มี tabIndex
            ไม่มี role ไม่มี key handler) ⇒ **ผู้ใช้คีย์บอร์ด/AT เข้าหน้านี้ไม่ได้เลย**
            (WCAG 2.1.1 ระดับ A) ขณะที่ PRODUCT.md ประกาศว่าคีย์บอร์ดใช้งานได้ครบ ·
            คอมเมนต์ใน `DataTable` เขียนเองว่าคลิกทั้งแถวเป็น "ทางลัด ไม่ใช่ทางเดียว"
            แต่ตารางนี้ไม่มีคอลัมน์ปุ่มไอคอนเลยสักคอลัมน์ · ของแถม: ตอนนี้มีอะไรบอกว่ากดได้
            (เดิมรู้ได้จาก `cursor-pointer` ตอนเอาเมาส์ไปวางเท่านั้น)

            เลิกใช้ `<h5>` ด้วย — เป็น heading ระดับ 5 ต่อ **ทุกแถว** (8 อันต่อหน้า) ที่ไม่ได้
            เปิดหัวข้อของอะไรเลย ⇒ AT ที่เดินตามโครงหัวข้อจะได้รายการหัวข้อปลอม 8 อัน
          */}
          <div className="flex min-w-0 items-center gap-1 text-sm font-medium">
            <Link
              href={`/customers/${encodeURIComponent(row.original.key)}`}
              onClick={(e) => e.stopPropagation()}
              className="text-default-900 hover:text-primary max-w-full truncate">
              {row.original.displayName}
            </Link>
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
          </div>
        </div>
      ),
    }),
    columnHelper.display({
      id: 'trust',
      /**
       * 🛑 ป้ายต้องบอกขอบเขตในตัวเอง — ตัวเลขชุดนี้ **ข้ามร้าน** ต่างจากการ์ดสถิติหัวหน้า
       * และชิป "เคยตีกลับกับร้านนี้" ซึ่งเป็นระดับร้าน ถ้าเขียนแค่ "ความน่าเชื่อถือ" เฉย ๆ
       * ผู้ใช้จะอ่านว่าเป็นชุดเดียวกันทั้งหน้า
       */
      header: () => (
        <div className="flex flex-col">
          <span>ความน่าเชื่อถือ</span>
          <span className="text-2xs text-default-400 font-normal">(ทั้งระบบ)</span>
        </div>
      ),
      meta: { cellClassName: 'min-w-56' },
      cell: ({ row }) => <CustomerTrustBar reputation={row.original.trust} />,
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

  const hasFilter = !!query || initialFilter !== 'all'
  const emptyMessage = hasAnyCustomer
    ? 'ไม่พบลูกค้าที่ตรงกับตัวกรองนี้'
    : 'ยังไม่มีลูกค้า — รอผู้ซื้อสั่งซื้อสินค้าจากร้านค้าของคุณ'

  const clearFilters = () => {
    setQuery('')
    run(() => pushWith({ q: '', f: 'all' }))
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
      </div>

      {/* ชิปกรอง — เลื่อนแนวนอนได้บนมือถือโดยไม่ทำให้ทั้งหน้าเลื่อนข้าง
          `-mx-4 px-4` ให้แถบกินเต็มขอบการ์ดแต่ยังมีระยะขอบตอนเลื่อนสุด
          `min-h-11` = 44px พื้นที่นิ้วตามเกณฑ์ (ชิปที่เตี้ยกว่านี้กดพลาดบนมือถือ) */}
      <div className="border-default-200 -mx-4 flex gap-2 overflow-x-auto border-b border-dashed px-4 pb-3">
        {FILTER_CHIPS.map((c) => {
          const active = initialFilter === c.value
          return (
            <button
              key={c.value}
              type="button"
              aria-pressed={active}
              onClick={() => run(() => pushWith({ q: query, f: c.value }))}
              className={`btn min-h-11 shrink-0 rounded-full text-xs font-semibold whitespace-nowrap ${
                active
                  ? 'bg-primary text-white'
                  : c.tone === 'warning'
                    ? 'bg-warning/15 text-warning-ink border-warning/50 border'
                    : 'border-default-300 text-default-800 border'
              }`}>
              {c.label}
              {c.value === 'warn' && watchCount > 0 && ` ${watchCount}`}
            </button>
          )
        })}
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
              <div className="relative flex items-start gap-3 px-1 py-3.5">
                <Link
                  href={`/customers/${encodeURIComponent(c.key)}`}
                  className="absolute inset-0 z-0"
                  aria-label={`ดูโปรไฟล์ของ ${c.displayName}`}
                />
                <div className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
                  {c.initial}
                </div>

                {/* 🛑 `min-w-0` ที่กล่อง + `max-w-full truncate` ที่ชื่อ + `shrink-0` ที่ป้าย —
                    ต้องมาเป็นชุด ไม่งั้นชื่อยาว 34 ตัวอักษรจะดันแถวกว้างเกินจอแล้วการ์ด
                    หลุดขอบซ้าย (เกิดจริงบน prod 2026-08-12 กับเพจชื่อยาว) */}
                <div className="min-w-0 flex-1">
                  <p className="text-default-900 mb-0 flex min-w-0 items-center gap-1 text-sm font-medium">
                    <span className="max-w-full truncate">{c.displayName}</span>
                    <CustomerBehaviorIcons badges={c.badges} />
                  </p>
                  <CustomerTrustBar reputation={c.trust} />
                  <span className="relative z-10 mt-1 inline-flex">
                    <ContactCell row={c} />
                  </span>
                </div>

                {/* ยอดซื้อสะสมยังเด่นเท่าความน่าเชื่อถือ (user ย้ำ 2026-08-25) — ไม่ใช่
                    ข้อความเทาเล็ก ๆ ท้ายบรรทัด · `shrink-0` กัน flex บีบจนตัวเลขตัด */}
                <div className="shrink-0 text-right">
                  <p className="text-default-900 mb-0 text-sm font-semibold tabular-nums">
                    {formatBaht(c.totalSpent)}
                  </p>
                  <p className="text-2xs text-default-400 mb-0 leading-tight">
                    {c.totalOrders} ออเดอร์
                  </p>
                  <p className="text-2xs text-default-400 mb-0 leading-tight">
                    {formatDateTime(c.lastOrderISO)}
                  </p>
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
