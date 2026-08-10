/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/reviews/components/ProductReviews.tsx
 *
 * Adaptations from theme:
 * - Data รับจาก RSC props (ไม่ใช่ productReviewData mock)
 * - Reviewer column: initials avatar แทนรูป (ไม่มี user photo ใน SafePay)
 * - Product column: icon แทนรูปสินค้า (orderItems ไม่มี snapshot image)
 * - Order link: /seller/orders/{token} — internal seller route (proxy rewrite ไม่จำเป็นเพราะ explicit)
 *   ไม่ใช้ /o/{token} เพราะนั่นคือ buyer-domain route ที่จะ 404 บน seller subdomain
 * - date: รับเป็น dateISO (ISO string จาก RSC) แล้ว format เป็นภาษาไทยใน client
 * - filterFns: {} ใส่ใน useReactTable ทุก instance (ป้องกัน TanStack warning)
 * - Stripped: ApexChart review-trend, Delete action, Export dropdown (ไม่มีใน MVP)
 * - Stripped: DeleteConfirmationModal, row selection (SafePay ไม่ให้ seller ลบรีวิว)
 * - Stripped: Status badge (SafePay ไม่มี published/draft บน review)
 * - Stripped: Select wrapper react-select — ใช้ native select แทน (เบากว่า)
 */

'use client'

import DataTable from '@/components/table/DataTable'
import TablePagination from '@/components/table/TablePagination'
import Rating from '@/components/Rating'
import { formatDateTime } from '@/lib/format-date'
import Icon from '@/components/wrappers/Icon'
import ratingsImg from '@/assets/images/ratings.svg'
import Image from 'next/image'
import Link from 'next/link'
import { useMemo, useRef, useState } from 'react'
import {
  ColumnFiltersState,
  createColumnHelper,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import ReviewImageGallery from './ReviewImageGallery'
import ShopReplyBlock from './ShopReplyBlock'
import type { ReviewRow, SummaryData } from './data'

type Props = {
  reviews: ReviewRow[]
  summary: SummaryData
}

const starRatings = [5, 4, 3, 2, 1] as const

const columnHelper = createColumnHelper<ReviewRow>()


const ProductReviews = ({ reviews, summary }: Props) => {
  const [globalFilter, setGlobalFilter] = useState('')
  // feature 00041 — แท็บกรอง + แถวที่กำลังเปิดฟอร์มตอบ
  // 🛑 openReplyId อยู่ที่นี่ตัวเดียว ไม่ใช่ state ในแต่ละแถว: บังคับให้เปิดได้ทีละใบ
  // (ผู้ขายตอบทีละใบอยู่แล้ว และไม่ต้องเก็บดราฟต์หลายชุดพร้อมกัน)
  const [tab, setTab] = useState<'all' | 'unanswered'>('all')
  const [openReplyId, setOpenReplyId] = useState<string | null>(null)
  // ดราฟต์ต่อรีวิว — เก็บที่นี่ ไม่ใช่ใน ShopReplyBlock เพราะแถวถูก unmount ตอนสลับแท็บ/เปลี่ยนหน้า
  // และเพราะเดสก์ท็อป+มือถือ render แถวเดียวกันพร้อมกัน (ดูเหตุผลเต็มที่ props ของ ShopReplyBlock)
  const [drafts, setDrafts] = useState<Record<string, string>>({})

  // เปิดฟอร์ม: ตั้งค่าเริ่มต้นจากคำตอบที่บันทึกไว้ **เฉพาะเมื่อยังไม่มีดราฟต์ค้าง**
  // ถ้าเขียนทับทุกครั้ง ข้อความที่พิมพ์ค้างจะหายตอนเปิดแถวเดิมซ้ำ
  const openReply = (row: ReviewRow) => {
    setDrafts((prev) => (row.id in prev ? prev : { ...prev, [row.id]: row.shopReply?.comment ?? '' }))
    setOpenReplyId(row.id)
  }
  const tableRef = useRef<HTMLDivElement>(null)
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 5 })

  // นับจาก reviews ก้อนเดียวกับที่ตารางใช้ — ห้ามนับด้วยวิธีอื่น ไม่งั้นกดตัวเลข 7 แล้วเจอ 6
  const unansweredCount = useMemo(() => reviews.filter((r) => !r.shopReply).length, [reviews])
  const visibleReviews = useMemo(
    () => (tab === 'unanswered' ? reviews.filter((r) => !r.shopReply) : reviews),
    [reviews, tab],
  )

  const goToUnanswered = () => {
    setTab('unanswered')
    setPagination((p) => ({ ...p, pageIndex: 0 }))
    // Safari ไม่ทำตาม prefers-reduced-motion กับ behavior:'smooth' ของ JS API ให้เอง — เช็คเอง
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    tableRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  }

  const columns = [
    columnHelper.accessor('productName', {
      header: 'สินค้า',
      cell: ({ row }) => (
        <div className="flex items-center gap-base">
          {/* Product image omitted — orderItems ไม่มี snapshot image */}
          <div className="bg-default-100 text-default-400 size-11 rounded flex items-center justify-center">
            <Icon icon="package" className="text-lg" />
          </div>
          <h5>
            <span className="text-default-800 text-sm font-medium">{row.original.productName}</span>
          </h5>
        </div>
      ),
    }),
    columnHelper.accessor('reviewerLabel', {
      header: 'ผู้รีวิว',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex items-center gap-2.5">
          {/* Avatar initials — ไม่มีรูปผู้ใช้ใน SafePay MVP */}
          <div className="bg-primary/10 text-primary rounded-full size-10 flex items-center justify-center font-bold shrink-0">
            {row.original.reviewerInitial}
          </div>
          <div>
            <h5 className="text-sm leading-tight font-medium text-default-800">
              {row.original.reviewerLabel}
            </h5>
          </div>
        </div>
      ),
    }),
    columnHelper.accessor('rating', {
      header: 'รีวิว',
      enableSorting: false,
      cell: ({ row }) => (
        <>
          <Rating rating={row.original.rating} />
          <p className={`mt-2 text-sm ${row.original.comment ? 'text-default-700 italic' : 'text-default-400 italic'}`}>
            {row.original.comment ?? 'ไม่มีความคิดเห็น'}
          </p>
          <ReviewImageGallery images={row.original.images} thumbClassName="size-12" />
          {/* คำตอบร้านอยู่ในคอลัมน์เดียวกับรีวิว เพราะเป็นบทสนทนาเดียวกัน — แยกคอลัมน์แล้วจะขาดจากกัน
              และเป็นลำดับเดียวกับที่ผู้ซื้อเห็นบน /o/{token} */}
          <ShopReplyBlock
            orderToken={row.original.orderToken}
            reply={row.original.shopReply}
            editing={openReplyId === row.original.id}
            onOpen={() => openReply(row.original)}
            onClose={() => setOpenReplyId(null)}
            draft={drafts[row.original.id] ?? ''}
            onDraftChange={(v) => setDrafts((prev) => ({ ...prev, [row.original.id]: v }))}
          />
        </>
      ),
    }),
    columnHelper.accessor('dateISO', {
      header: 'วันที่',
      cell: ({ row }) => (
        <span className="text-default-500 text-sm">
          {formatDateTime(row.original.dateISO)}
        </span>
      ),
    }),
    {
      id: 'actions',
      header: 'ออเดอร์',
      enableSorting: false,
      enableColumnFilter: false,
      cell: ({ row }: { row: { original: ReviewRow } }) => (
        // seller subdomain route — proxy rewrite ครอบ /orders/{token} → /seller/orders/{token}
        // ไม่ใช้ /o/{token} เพราะเป็น buyer-domain route — 404 บน seller.deepth.local
        <Link
          href={`/orders/${row.original.orderToken}`}
          className="btn btn-sm border border-default-300 text-default-800 hover:border-default-400 flex items-center gap-1"
        >
          <Icon icon="receipt" className="text-base" />
          ดู
        </Link>
      ),
    },
  ]

  const table = useReactTable({
    data: visibleReviews,
    columns,
    state: { columnFilters, pagination, globalFilter },
    // 🛑 ค้นจาก haystack ที่ประกอบเอง — ค่าเริ่มต้นของ TanStack ไล่ทุก accessor column ซึ่งแปลว่า
    // (ก) `comment` ไม่ถูกค้นเลยเพราะไม่ได้เป็นคอลัมน์ ทั้งที่เป็นฟิลด์เดียวที่คนอยากค้น
    // (ข) `dateISO` เป็นสตริงดิบ พิมพ์เลขตัวเดียวก็ match แทบทุกแถว และพิมพ์ปีที่เห็นบนจอ (2569) ไม่เจอ
    globalFilterFn: (row, _columnId, value: string) => {
      const q = value.trim().toLowerCase()
      if (!q) return true
      const r = row.original
      const haystack = [r.comment ?? '', r.reviewerLabel, r.productName, formatDateTime(r.dateISO)]
        .join(' ')
        .toLowerCase()

      return haystack.includes(q)
    },
    onColumnFiltersChange: setColumnFilters,
    onPaginationChange: setPagination,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    // filterFns object บังคับต้องมีแม้ว่าจะว่าง เพื่อหลีกเลี่ยง TanStack warning
    filterFns: {},
  })

  const pageIndex = table.getState().pagination.pageIndex
  const pageSize = table.getState().pagination.pageSize
  const totalItems = table.getFilteredRowModel().rows.length
  const start = pageIndex * pageSize + 1
  const end = Math.min(start + pageSize - 1, totalItems)

  return (
    <div className="card">
      {/* ── Summary header: ซ้าย = rating overview + distribution, ขวา = chart placeholder ── */}
      {/* grid-cols-1 sm:grid-cols-12 — stack เหนือกันบน mobile ป้องกัน cram */}
      <div className="border-default-300 border-b border-dashed">
        <div className="grid grid-cols-1 lg:grid-cols-2">
          {/* ซ้าย: rating overview + distribution bars */}
          {/* lg:border-e — ลบขอบลอยตอน stack บน mobile */}
          <div className="border-default-300 grid grid-cols-1 sm:grid-cols-12 lg:border-e border-dashed">
            <div className="sm:col-span-7">
              {/* p-4 sm:p-7.5 — ลด padding บน mobile */}
              <div className="flex items-center gap-base p-4 sm:p-7.5 sm:gap-7.5">
                {/* w-16 sm:w-[95px] — ย่อรูปบน mobile */}
                <Image src={ratingsImg} alt="Ratings" className={'h-auto w-16 sm:w-[95px]' /* carve-out HR7: 95px = ความกว้างจริงของ ratings.svg (ตรงกับ width={95}) ไม่ใช่ค่าที่เลือกเอง — ใช้ token ใกล้เคียงจะทำให้ภาพถูกสเกลเบลอ */} width={95} />
                <div className="flex flex-col gap-y-2.5">
                  <h3 className="flex items-center gap-2.5 text-xl font-bold">
                    {summary.total > 0 ? summary.avgRating.toFixed(1) : '—'}
                    <Icon icon="star-filled" className="text-xl text-warning" />
                  </h3>
                  <p className="text-default-500 text-sm">
                    จาก {summary.total} รีวิวที่ยืนยันแล้ว
                  </p>
                  <div>
                    {/* text-success-ink ไม่ใช่ text-success — บนพื้น success/15 ตัวหลังได้ 2.11:1 (ตก AA)
                        ส่วน -ink ได้ 6.68:1 เฉดเดียวกัน เข้มขึ้นอย่างเดียว (contrast-fix-keeps-hue) */}
                    <span className="badge badge-label bg-success/15 text-success-ink font-semibold">
                      คะแนนจริงจากลูกค้า
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Distribution bars (5 → 1 ดาว) */}
            <div className="sm:col-span-5">
              <div className="space-y-2.5 mt-2 p-4 sm:p-5">
                {starRatings.map((star) => {
                  const count = summary.distribution[star] ?? 0
                  const pct = summary.total > 0 ? Math.round((count / summary.total) * 100) : 0
                  return (
                    <div className="flex items-center gap-2.5" key={star}>
                      <div className="text-sm text-nowrap min-w-12.5">{star} ดาว</div>
                      <div
                        className="bg-default-100 flex h-2 w-full overflow-hidden rounded-full"
                        role="progressbar"
                        aria-valuenow={pct}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      >
                        <div
                          className="bg-primary flex flex-col justify-center overflow-hidden rounded-s-full text-center text-xs whitespace-nowrap text-white transition duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="text-end">
                        <span className="badge bg-light text-dark">{count}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* ขวา: จำนวนรีวิวที่ยังไม่ได้ตอบ — จุดโฟกัสเดียวของหน้านี้
              🛑 แทนที่ placeholder "กราฟแนวโน้มรีวิว" เดิม ซึ่งแสดงข้อความเดิมตลอดกาลไม่ว่า
              ข้อมูลจะเป็นเท่าไหร่ = พื้นที่ตายที่กินครึ่งหัวการ์ด (feedback_dead_tile_change_what_it_counts)
              เขียวใช้ตรงนี้จุดเดียวและใช้เมื่อ "งานค้าง = 0" ซึ่งเป็นข้อเท็จจริงที่คำนวณได้จริง
              ไม่ใช่ป้ายชมเชย (Verified-Means-Green) */}
          <div className="flex items-center justify-center p-4 sm:p-7.5">
            {summary.total === 0 ? (
              <p className="text-default-400 text-sm">ยังไม่มีรีวิวให้ตอบ</p>
            ) : unansweredCount === 0 ? (
              <div className="text-center">
                <div className="bg-success/15 text-success-ink mx-auto mb-2.5 flex size-14 items-center justify-center rounded-full">
                  <Icon icon="check" className="text-2xl" />
                </div>
                <p className="text-default-600 text-sm">ตอบครบทุกรีวิวแล้วในตอนนี้</p>
              </div>
            ) : (
              <div className="text-center">
                <div className="bg-danger/15 text-danger-ink mx-auto mb-2.5 flex size-14 items-center justify-center rounded-full">
                  <Icon icon="message-circle-exclamation" className="text-2xl" />
                </div>
                <h3 className="text-2xl font-bold tabular-nums">{unansweredCount}</h3>
                <p className="text-default-500 mb-2.5 text-sm">รีวิวที่ยังไม่ได้ตอบ</p>
                <button type="button" className="btn btn-sm bg-primary hover:bg-primary-hover text-white" onClick={goToUnanswered}>
                  ตอบตอนนี้
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── แท็บกรอง ── กรองฝั่ง client จากก้อนเดียวกับตาราง ไม่ query ใหม่
          ซ่อนทั้งแถบเมื่อไม่มีรีวิวเลย (ไม่มีประโยชน์ให้กรองลิสต์ว่าง)
          Base pattern: src/app/(paces)/seller/(chat)/inbox/comments/CommentsClient.tsx (underline tab) */}
      {summary.total > 0 && (
        <div
          ref={tableRef}
          role="tablist"
          aria-label="กรองรีวิว"
          className="border-default-300 flex items-center gap-1 border-b border-dashed px-4 pt-3"
        >
          {([
            { key: 'all', label: 'ทั้งหมด', count: summary.total },
            { key: 'unanswered', label: 'ยังไม่ตอบ', count: unansweredCount },
          ] as const).map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => {
                setTab(t.key)
                setPagination((p) => ({ ...p, pageIndex: 0 }))
              }}
              className={`inline-flex min-h-11 items-center gap-1.5 border-b-2 px-3 text-sm font-medium ${
                tab === t.key
                  ? 'border-primary text-primary'
                  : 'text-default-500 hover:text-default-800 border-transparent'
              }`}
            >
              {t.label}
              <span className={`badge ${tab === t.key ? 'bg-primary/15 text-primary' : 'bg-light text-dark'} tabular-nums`}>
                {t.count > 99 ? '99+' : t.count}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* ── Toolbar ── */}
      <div className="card-header">
        <div className="flex gap-2">
          <div className="input-icon-group">
            <Icon icon="search" className="input-icon" />
            <input
              type="search"
              placeholder="ค้นหารีวิว..."
              className="form-input w-full ps-10"
              value={globalFilter ?? ''}
              onChange={(e) => setGlobalFilter(e.target.value)}
            />
          </div>
        </div>
        <div className="ms-auto">
          <div className="flex items-center gap-2.5">
            {/* Native select แทน react-select เพื่อลด bundle size */}
            <select
              className="form-select"
              value={table.getState().pagination.pageSize}
              onChange={(e) => table.setPageSize(Number(e.target.value))}
            >
              {[5, 10, 15, 20].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── Data table ── */}
      <DataTable
        table={table}
        emptyMessage={
          globalFilter ? (
            <div className="py-10 text-center">
              <Icon icon="search-off" className="text-default-300 mb-3 text-5xl" />
              <p className="text-default-500">ไม่พบรีวิวที่ตรงกับคำค้นหา</p>
              <button type="button" className="btn btn-sm bg-light mt-2.5" onClick={() => setGlobalFilter('')}>
                ล้างคำค้นหา
              </button>
            </div>
          ) : tab === 'unanswered' ? (
            <div className="py-10 text-center">
              <Icon icon="check" className="text-success-ink mb-3 text-5xl" />
              <p className="text-default-500">ตอบครบทุกรีวิวแล้ว</p>
              <p className="text-default-400 mt-1 text-sm">ไม่มีรีวิวที่รอคำตอบตอนนี้</p>
            </div>
          ) : (
            <div className="py-10 text-center">
              <Icon icon="star" className="text-default-300 mb-3 text-5xl" />
              <p className="text-default-400">ยังไม่มีรีวิว</p>
              <p className="text-default-400 mt-1 text-sm">รีวิวจะปรากฏที่นี่หลังลูกค้ายืนยันออเดอร์</p>
            </div>
          )
        }
        mobileCard={(row) => {
          const r = row.original
          // 3-zone: leading avatar | main content | trailing date
          // items-start เพราะ comment หลายบรรทัด (ไม่ใช่ items-center)
          return (
            <div className="flex items-start gap-3 px-1 py-3.5">
              {/* leading: avatar initial ผู้รีวิว */}
              <div className="size-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold text-sm shrink-0">
                {r.reviewerInitial}
              </div>
              {/* main: ชื่อ + ดาว + comment + ชื่อสินค้า/ออเดอร์ */}
              <div className="min-w-0 flex-1">
                <p className="text-default-800 truncate text-sm font-medium">{r.reviewerLabel}</p>
                {/* 🛑 เดิมเป็นตัวอักษร ★/☆ ดิบ ขณะที่เดสก์ท็อปใช้ <Rating/> — ดาวชุดเดียวกัน
                    มาจากคนละที่ ต่างกันได้เงียบ ๆ เมื่อมีคนแก้ข้างเดียว (HR16) */}
                <Rating rating={r.rating} className="text-sm" />
                {/* line-clamp-2 ป้องกัน comment ยาวดัน layout */}
                {r.comment ? (
                  <p className="text-default-600 mt-0.5 line-clamp-2 text-sm">{r.comment}</p>
                ) : (
                  <p className="text-default-400 mt-0.5 text-sm italic">ไม่มีความคิดเห็น</p>
                )}
                {/* ชื่อสินค้า + ปุ่มดูออเดอร์ (tap ≥44px: inline-flex min-h-11 + padding) */}
                <div className="flex items-center justify-between gap-2 mt-1">
                  <span className="text-default-400 truncate text-xs">{r.productName}</span>
                  <Link
                    href={`/orders/${r.orderToken}`}
                    className="text-primary -mr-2 inline-flex min-h-11 shrink-0 items-center gap-1 px-2 text-xs font-medium"
                  >
                    ดูออเดอร์
                    <Icon icon="chevron-right" className="text-sm" />
                  </Link>
                </div>
                <ReviewImageGallery images={r.images} thumbClassName="size-14" />
                <ShopReplyBlock
                  orderToken={r.orderToken}
                  reply={r.shopReply}
                  editing={openReplyId === r.id}
                  onOpen={() => openReply(r)}
                  onClose={() => setOpenReplyId(null)}
                  draft={drafts[r.id] ?? ''}
                  onDraftChange={(v) => setDrafts((prev) => ({ ...prev, [r.id]: v }))}
                  compact
                />
              </div>
              {/* trailing: วันที่ */}
              <div className="shrink-0">
                <p className="text-default-400 text-xs leading-tight whitespace-nowrap">
                  {formatDateTime(r.dateISO)}
                </p>
              </div>
            </div>
          )
        }}
      />

      {/* ── Pagination ── */}
      {table.getRowModel().rows.length > 0 && (
        <div className="card-footer border-light">
          <TablePagination
            totalItems={totalItems}
            start={start}
            end={end}
            showInfo
            itemsName="รีวิว"
            previousPage={table.previousPage}
            canPreviousPage={table.getCanPreviousPage()}
            pageCount={table.getPageCount()}
            pageIndex={table.getState().pagination.pageIndex}
            setPageIndex={table.setPageIndex}
            nextPage={table.nextPage}
            canNextPage={table.getCanNextPage()}
          />
        </div>
      )}
    </div>
  )
}

export default ProductReviews
