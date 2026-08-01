'use client'

/**
 * AutoReplyListing — ตาราง listing กลุ่มคำตอบอัตโนมัติ (feature 00023, S-13 / S-15)
 *
 * Base: src/app/(paces)/seller/(dashboard)/products/components/ProductsListing.tsx
 *   (ซึ่ง Base เดิม = theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(products)/products/
 *    components/ProductsListing.tsx) — ยกมาทั้งโครง: DataTable + TanStack useReactTable,
 *   toolbar ใน card-header (ค้นหา `input-icon-group` / "กรอง:" / จำนวนต่อหน้า / ปุ่มสร้าง),
 *   mobile toolbar แยก (search pill + filter chips), mobileCard, card-footer + TablePagination,
 *   DeleteConfirmationModal
 *
 * เปลี่ยนจาก Base:
 *   - columns: name / โหมด / คำตรวจจับ / คำตอบ / สถานะ / แก้ไขล่าสุด / การจัดการ
 *   - ไม่มีรูปสินค้า → leading เป็นไอคอนกลุ่มคำแทน thumbnail
 *   - คอลัมน์สถานะเป็น "ป้ายอ่านอย่างเดียว" (ไม่ใช้งาน/ทดสอบ/ตอบลูกค้าจริง) ไม่ใช่สวิตช์
 *     ที่เปลี่ยนสถานะอยู่ "หน้าแก้ไขกลุ่มคำ" (`[id]/KeywordEditorClient.tsx`) ที่เดียว
 *     (user สั่งตรง 2026-07-30: "สถานะตรงนี้ให้แสดงสถานะปัจจุบัน ไม่ใช่ให้เป็น switch ตรงนี้")
 *     ย้อนการตัดสินใจ 2026-07-29 ที่เคยเอาปุ่ม 3 ค่ามาไว้ในตาราง — ห้ามเอาสวิตช์กลับมาที่นี่
 *   - ตัวเลือกจำนวนต่อหน้าใช้ ChoiceSelect ไม่ใช่ `<select>` ดิบ (Hard Rule 7 / theme-guard)
 */
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ColumnDef,
  ColumnFiltersState,
  createColumnHelper,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from '@tanstack/react-table'
import DataTable from '@/components/table/DataTable'
import TablePagination from '@/components/table/TablePagination'
import ChoiceSelect from '@/components/wrappers/ChoiceSelect'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import { pacesConfirm } from '@/lib/paces-swal'
import { formatDateTime } from '@/lib/format-date'
import { cn } from '@/utils/helpers'

export type KeywordRow = {
  id: string
  name: string
  matchType: string
  priority: number
  /** 'OFFLINE' | 'TEST' | 'LIVE' — ค่าเดียวจบ แทน isActive+mode เดิม */
  status: string
  phraseCount: number
  /** คำตรวจจับจริง (สูงสุด 10 คำแรก) — user 2026-07-30 "อยากให้แสดงข้อความที่ตรวจจับเลย" */
  phrases: string[]
  /** จำนวนแชทที่ผูกไว้ทดสอบ — TEST ที่เป็น 0 = ไม่ตอบใครเลยจริง ๆ ต้องเตือน */
  testThreadCount: number
  ruleCount: number
  updatedAt: string
}

/** ป้ายสถานะ — เขียวสงวนให้ "ตอบลูกค้าจริง" เท่านั้นตาม Verified-Means-Green
 *  เหลือง = ทดสอบ (เตือนว่ายังไม่ถึงลูกค้าทุกคน)
 *
 *  รูปทรงบอกความหมายเอง: fill (tint) = กำลังทำงาน · outline = ไม่ทำงาน
 *  OFFLINE ใช้ outline ไม่ใช่ tint เทา เพราะ `bg-default-200 text-default-500` เดิม = 2.12:1
 *  ตก AA ยับ และมันคือสถานะที่เห็นบ่อยที่สุด (กลุ่มสร้างใหม่เป็น OFFLINE เสมอ);
 *  `border-default-300 bg-card text-default-700` = 4.69:1 ผ่าน AA และถอยกว่า text-default-800 */
const STATUS_META: Record<string, { label: string; badge: string; icon: string }> = {
  LIVE: { label: 'ตอบลูกค้าจริง', badge: 'bg-success/15 text-success', icon: 'broadcast' },
  TEST: { label: 'ทดสอบ', badge: 'bg-warning/15 text-warning', icon: 'flask' },
  OFFLINE: { label: 'ไม่ใช้งาน', badge: 'border-default-300 bg-card text-default-700 border', icon: 'circle-off' },
}

const STATUS_OPTIONS = [
  { value: 'All', label: 'ทุกสถานะ' },
  { value: 'LIVE', label: 'ตอบลูกค้าจริง' },
  { value: 'TEST', label: 'ทดสอบ' },
  { value: 'OFFLINE', label: 'ไม่ใช้งาน' },
]

const PAGE_SIZE_OPTIONS = [5, 10, 15, 20].map((n) => ({ value: String(n), label: String(n) }))

const STATUS_CHIPS = [
  { key: 'All', label: 'ทั้งหมด' },
  { key: 'LIVE', label: 'ตอบลูกค้าจริง' },
  { key: 'TEST', label: 'ทดสอบ' },
  { key: 'OFFLINE', label: 'ไม่ใช้งาน' },
]

/** ชิปคำตรวจจับ — เห็นคำจริงทันทีโดยไม่ต้องเปิดเข้าไปดู; เกิน 4 คำสรุปเป็น "+n" กันแถวสูงเกิน */
function PhraseChips({ phrases, total }: { phrases: string[]; total: number }) {
  if (total === 0) {
    return <span className="text-warning text-xs">ยังไม่มีคำตรวจจับ</span>
  }
  const shown = phrases.slice(0, 4)
  const rest = total - shown.length
  return (
    <div className="flex flex-wrap items-center gap-1">
      {shown.map((phrase) => (
        <span key={phrase} className="bg-primary/10 text-primary rounded px-2 py-0.5 text-xs font-medium">
          {phrase}
        </span>
      ))}
      {rest > 0 && <span className="text-default-400 text-xs">+{rest}</span>}
    </div>
  )
}

const columnHelper = createColumnHelper<KeywordRow>()

/** ป้ายสถานะ — อ่านอย่างเดียว ไม่ใช่ control
 *  Base: theme/paces/.../dashboard/analytics/components/TotalVisitors.tsx:21-23 (badge ที่มีไอคอนข้างใน)
 *  ไม่ใส่ `rounded-full`: ในหน้านี้ pill ถูกใช้กับของที่กดได้อยู่แล้ว (filter chip / ปุ่มสร้างมือถือ)
 *  เหลี่ยม = อ่านอย่างเดียว — affordance ต่างกันตั้งแต่รูปทรง */
function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? STATUS_META.OFFLINE
  return (
    <span
      className={cn(
        'badge inline-flex items-center gap-1 py-0 text-xs font-semibold whitespace-nowrap',
        meta.badge,
      )}
    >
      <Icon icon={meta.icon} className="size-3.5" aria-hidden="true" />
      {meta.label}
    </span>
  )
}

/**
 * เซลล์สถานะ — ใช้ตัวเดียวกันทั้งตาราง desktop และการ์ดมือถือ
 *
 * ที่เปลี่ยนสถานะอยู่หน้าแก้ไขที่เดียว (ห้ามเอาสวิตช์กลับมาที่นี่ — ดูคอมเมนต์หัวไฟล์):
 * หน้าแก้ไขคือที่เดียวที่มีบริบทครบ (คำตรวจจับ / คำตอบ / แชททดสอบ) และ guard ของ backend
 * 2 ใน 3 ตัวแก้ได้เฉพาะที่นั่น — กดในตารางแล้วถูกปฏิเสธก็ต้องเด้งไปหน้าแก้ไขอยู่ดี
 *
 * เดิมเขียนโครงซ้ำ 2 ที่และเคส TEST+0 แชทหน้าตาไม่เหมือนกันจริง (desktop = ไอคอนเปล่า + title,
 * mobile = badge ที่สอง) — ยุบเป็นตัวเดียวเพื่อให้ของเดียวกันมีหน้าตาเดียว
 */
function StatusCell({ status, testThreadCount }: { status: string; testThreadCount: number }) {
  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      <StatusBadge status={status} />
      {/* TEST ที่ยังไม่ผูกแชท = ป้ายบอก "ทดสอบ" แต่จริง ๆ ไม่ตอบใครเลย ต้องพูดออกมาเป็นข้อความ
          ไม่ใช่ไอคอนเปล่า + title (title ไม่เด้งบนมือถือ ซึ่งคือ surface หลักของ seller)
          สีเหลืองอยู่ที่ไอคอนเท่านั้น — text-warning บนพื้นขาว = 1.66:1 อ่านไม่ออก
          ไม่ทำเป็น badge ใบที่สอง เพราะ badge 2 ใบข้างกันอ่านเหมือน "สองสถานะ" ซึ่งไม่จริง
          และไม่ขึ้นกับ OFFLINE เพราะ OFFLINE ที่ไม่ตอบใครคือสิ่งที่ตั้งใจ
          text-pretty: คอลัมน์สถานะแคบ ข้อความนี้หัก 2 บรรทัดได้ — กันคำโดดท้ายบรรทัด */}
      {status === 'TEST' && testThreadCount === 0 && (
        <span className="text-default-700 flex items-start gap-1 text-xs text-pretty">
          <Icon icon="alert-triangle" className="text-warning size-3.5 shrink-0" aria-hidden="true" />
          ยังไม่ได้เลือกแชท จึงยังไม่ตอบใคร
        </span>
      )}
    </div>
  )
}

type Props = {
  keywords: KeywordRow[]
  canEdit: boolean
}

export default function AutoReplyListing({ keywords, canEdit }: Props) {

  const router = useRouter()
  const [data, setData] = useState<KeywordRow[]>(() => [...keywords])
  const [globalFilter, setGlobalFilter] = useState('')
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 })
  const [statusChip, setStatusChip] = useState('All')

  const columns: ColumnDef<KeywordRow, any>[] = useMemo(
    () => [
      columnHelper.accessor('name', {
        header: 'กลุ่มคำ',
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <span className="bg-default-100 flex size-9 shrink-0 items-center justify-center rounded">
              <Icon icon="message-2-bolt" className="text-default-400 size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h5 className="mb-0.5">
                <Link
                  href={`/settings/auto-reply/${row.original.id}`}
                  className="hover:text-primary font-medium"
                >
                  {row.original.name}
                </Link>
              </h5>
              <p className="text-default-400 text-2xs mb-0">
                {row.original.ruleCount} คำตอบ
              </p>
            </div>
          </div>
        ),
      }),
      columnHelper.accessor('phraseCount', {
        header: 'คำตรวจจับ',
        enableSorting: false,
        /* คอลัมน์สถานะแคบลงมากหลังถอดปุ่ม 3 ค่า (~250px → ~150px) — ยกความกว้างที่คืนมา
           ให้คอลัมน์นี้ (ตารางเป็น auto-layout: จองสัดส่วนไว้ตรงนี้ ที่เหลือค่อยแบ่งตามเนื้อหา)
           ยิ่งกว้าง = PhraseChips โชว์คำจริงได้มากขึ้นก่อนจะสรุปเป็น "+n" */
        meta: { headerClassName: 'w-2/5', cellClassName: 'w-2/5' },
        cell: ({ row }) => <PhraseChips phrases={row.original.phrases} total={row.original.phraseCount} />,
      }),
      columnHelper.accessor('status', {
        header: 'สถานะ',
        filterFn: 'equalsString',
        enableColumnFilter: true,
        enableSorting: false,
        /* อ่านอย่างเดียวทั้ง OWNER และ STAFF — ไม่มี ternary canEdit แล้ว จะไม่มี write control
           เผลอโผล่ในตารางที่คนกำลังกวาดตาหาข้อมูล */
        cell: ({ row }) => (
          <StatusCell status={row.original.status} testThreadCount={row.original.testThreadCount} />
        ),
      }),
      columnHelper.accessor('updatedAt', {
        header: 'แก้ไขล่าสุด',
        cell: ({ row }) => (
          <span className="text-default-500 text-sm">
            {formatDateTime(new Date(row.original.updatedAt))}
          </span>
        ),
      }),
      columnHelper.display({
        id: 'actions',
        header: 'การจัดการ',
        cell: ({ row }) => (
          <div className="flex items-center justify-center gap-1.5">
            {/* NOTE: ปุ่ม "คลังคำถาม" เคยอยู่ตรงนี้ (2026-08-01) แล้วย้ายออกในวันเดียวกันตาม
                ที่ user สั่ง — ไปอยู่ในหน้าแก้ไขกลุ่มคำ ใต้การ์ด "คำตอบที่ลูกค้าจะได้รับ"
                ซึ่งเป็นที่ที่มันควรอยู่ (คลังคือทางที่สองของการหาคำตอบให้กลุ่มนี้)
                ไอคอนลอยในแถวทำให้ผู้ใช้ต้องเดาความหมาย ห้ามเอากลับมา */}
            <Link
              href={`/settings/auto-reply/${row.original.id}`}
              className="btn btn-icon btn-sm border-default-300 text-default-800 hover:border-default-400 border"
              aria-label={`แก้ไข ${row.original.name}`}
            >
              <Icon icon="pencil" className="text-base" aria-hidden="true" />
            </Link>
            {canEdit && (
              <button
                type="button"
                className="btn btn-icon btn-sm border-default-300 text-default-800 hover:border-default-400 border"
                onClick={() => confirmDelete(row.original)}
                aria-label={`ลบ ${row.original.name}`}
              >
                <Icon icon="trash" className="text-danger text-base" aria-hidden="true" />
              </button>
            )}
          </div>
        ),
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canEdit],
  )

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter, columnFilters, pagination },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: 'includesString',
    filterFns: {},
    enableColumnFilters: true,
    enableRowSelection: false,
  })

  const pageIndex = table.getState().pagination.pageIndex
  const pageSize = table.getState().pagination.pageSize
  const totalItems = table.getFilteredRowModel().rows.length
  const start = pageIndex * pageSize + 1
  const end = Math.min(start + pageSize - 1, totalItems)

  const currentStatusFilter = (table.getColumn('status')?.getFilterValue() as string) ?? 'All'

  function handleChipChange(chip: string) {
    setStatusChip(chip)
    table.getColumn('status')?.setFilterValue(chip === 'All' ? undefined : chip)
  }

  /**
   * ลบกลุ่มคำ — ถามด้วย pacesConfirm (Swal) ไม่ใช่ Preline overlay
   *
   * WARNING: ของเดิมใช้ `DeleteConfirmationModal` + `data-hs-overlay` ตามหน้าสินค้า
   * แต่กดแล้ว modal ไม่เปิดเลยบนหน้านี้ (บั๊กจริง จับได้ตอน E2E 2026-07-30 — ปุ่มลบกดแล้ว
   * ไม่มีอะไรเกิดขึ้น) Preline ผูก data-attribute ตอน autoInit ซึ่งไม่ครอบ element ที่
   * mount ทีหลัง. convention ของโปรเจกต์สำหรับ confirm dialog ใน (paces) คือ Swal อยู่แล้ว
   * (ดู memory feedback_sweet_alerts_modal) และในไฟล์นี้ก็ใช้ pacesConfirm ที่อื่นแล้ว
   */
  async function confirmDelete(row: KeywordRow) {
    const ok = await pacesConfirm.danger(
      `ลบ "${row.name}"?`,
      'คำตรวจจับและคำตอบทั้งหมดในกลุ่มนี้จะหายไปด้วย และกู้คืนไม่ได้',
      { confirmButtonText: 'ลบกลุ่มคำ' },
    )
    if (!ok) return
    const id = row.id
    try {
      const res = await fetch(`/api/shops/auto-reply/keywords/${id}`, {
        method: 'DELETE',
        cache: 'no-store',
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'ลบไม่สำเร็จ')
      setData((prev) => prev.filter((k) => k.id !== id))
      setPagination((p) => ({ ...p, pageIndex: 0 }))
      pacesToast.success('ลบกลุ่มคำเรียบร้อย')
      router.refresh()
    } catch (e) {
      pacesToast.error(e instanceof Error ? e.message : 'ลบไม่สำเร็จ')
    }
  }

  return (
    <div className="card">
      {/* ===== Mobile toolbar (ซ่อนบน lg ขึ้นไป) — Base ProductsListing.tsx ===== */}
      <div className="space-y-2.5 px-4 pt-3 pb-2 lg:hidden">
        <div className="flex items-center gap-2">
          <div className="input-icon-group flex-1">
            <Icon icon="search" className="input-icon" />
            <input
              value={globalFilter ?? ''}
              onChange={(e) => setGlobalFilter(e.target.value)}
              type="text"
              className="form-input"
              placeholder="ค้นหากลุ่มคำ..."
              aria-label="ค้นหากลุ่มคำ"
            />
          </div>
          {/* คิวคำถามที่ตอบไม่ได้ (S-15) — บนมือถือเหลือแค่ไอคอนเพราะแถวนี้แคบ
              มีข้อความเต็มใน aria-label/title แล้ว · min-h-11 = tap-target เท่าปุ่มข้าง ๆ */}
          <Link
            href="/settings/auto-reply/unanswered"
            className="btn btn-icon btn-sm bg-light text-default-700 min-h-11 shrink-0 rounded-full"
            aria-label="คำถามที่ตอบไม่ได้"
            title="คำถามที่ตอบไม่ได้"
          >
            <Icon icon="inbox" className="size-4" aria-hidden="true" />
          </Link>
          {canEdit && (
            <Link
              href="/settings/auto-reply/new"
              /* min-h-11 (44px): tap-target มือถือ — btn-sm สูงราว 31px ไม่พอ
                 (Paces ไม่มี touch-min token, comment กำกับตาม Hard Rule 7) */
              className="btn btn-sm bg-primary hover:bg-primary-hover min-h-11 shrink-0 rounded-full text-white"
            >
              <Icon icon="plus" className="size-4" aria-hidden="true" />
              สร้าง
            </Link>
          )}
        </div>
        {/* no-scrollbar = safepay-overrides.css; Paces ไม่มี token สำหรับแถบเลื่อนแนวนอน */}
        <div className="no-scrollbar -mx-4 overflow-x-auto px-4 whitespace-nowrap">
          <div className="inline-flex gap-2">
            {STATUS_CHIPS.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={() => handleChipChange(chip.key)}
                className={cn(
                  'badge cursor-pointer rounded-full border px-3 py-1 text-xs font-medium',
                  statusChip === chip.key
                    ? 'bg-primary border-primary text-white'
                    : 'bg-default-100 text-default-500 border-transparent',
                )}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ===== Desktop card-header — Base ProductsListing.tsx ===== */}
      <div className="card-header hidden lg:flex">
        <div className="flex gap-2.5">
          <div className="input-icon-group">
            <Icon icon="search" className="input-icon" />
            <input
              value={globalFilter ?? ''}
              onChange={(e) => setGlobalFilter(e.target.value)}
              type="text"
              className="form-input"
              placeholder="ค้นหากลุ่มคำ..."
              aria-label="ค้นหากลุ่มคำ"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 md:flex-nowrap">
          <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:items-center md:gap-3">
            <span className="font-semibold">กรอง:</span>
            <div className="w-40">
              <ChoiceSelect
                options={STATUS_OPTIONS}
                value={currentStatusFilter}
                search={false}
                onChange={(v) =>
                  table.getColumn('status')?.setFilterValue(v === 'All' ? undefined : v)
                }
                ariaLabel="กรองตามสถานะ"
              />
            </div>
          </div>
          <div className="w-20">
            <ChoiceSelect
              options={PAGE_SIZE_OPTIONS}
              value={String(pageSize)}
              search={false}
              onChange={(v) => table.setPageSize(Number(v))}
              ariaLabel="จำนวนต่อหน้า"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* คิวคำถามที่ตอบไม่ได้ (phase 00023-qna, S-15) — เป็นปุ่มรอง (bg-light)
              ไม่ใช่ primary เพราะงานหลักของหน้านี้ยังเป็นการจัดการกลุ่มคำ
              ส่วนคิวคือ "งานที่ระบบเก็บมาให้" ซึ่งเข้าถึงเมื่อพร้อมจะนั่งกรอก */}
          <Link href="/settings/auto-reply/unanswered" className="btn bg-light text-default-700">
            <Icon icon="inbox" aria-hidden="true" />
            คำถามที่ตอบไม่ได้
          </Link>
          {canEdit && (
            <Link href="/settings/auto-reply/new" className="btn bg-primary hover:bg-primary-hover text-white">
              <Icon icon="plus" aria-hidden="true" />
              สร้างกลุ่มคำ
            </Link>
          )}
        </div>
      </div>

      <DataTable<KeywordRow>
        table={table}
        emptyMessage={
          keywords.length === 0
            ? 'ยังไม่มีกลุ่มคำ — เริ่มจากคำที่ลูกค้ามักถาม เช่น "สนใจ" หรือ "ราคา"'
            : 'ไม่มีกลุ่มคำที่ตรงกับคำค้นหาหรือตัวกรอง'
        }
        mobileCard={(row) => {
          const k = row.original
          return (
            <div className="flex items-center gap-3 px-4 py-3.5">
              <span className="bg-default-100 flex size-11 shrink-0 items-center justify-center rounded-lg">
                <Icon icon="message-2-bolt" className="text-default-300 size-6" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <Link
                  href={`/settings/auto-reply/${k.id}`}
                  className="text-default-800 hover:text-primary block truncate text-sm font-medium"
                >
                  {k.name}
                </Link>
                <div className="mt-1">
                  <PhraseChips phrases={k.phrases} total={k.phraseCount} />
                </div>
                {/* เซลล์สถานะตัวเดียวกับตาราง desktop — ของเดียวกันต้องหน้าตาเดียว */}
                <div className="mt-1.5">
                  <StatusCell status={k.status} testThreadCount={k.testThreadCount} />
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {/* ปุ่ม "คลังคำถาม" ย้ายไปหน้าแก้ไขกลุ่มคำแล้ว — ดูหมายเหตุในคอลัมน์ "การจัดการ" ของตาราง */}
                <Link
                  href={`/settings/auto-reply/${k.id}`}
                  /* size-11 (44px) tap-target มือถือ — เหตุผลเดียวกับปุ่มสร้างด้านบน */
                  className="btn btn-icon border-default-300 text-default-800 hover:border-default-400 size-11 min-h-0 border"
                  aria-label={`แก้ไข ${k.name}`}
                >
                  <Icon icon="pencil" className="text-base" aria-hidden="true" />
                </Link>
              </div>
            </div>
          )
        }}
      />

      {table.getRowModel().rows.length > 0 && (
        <div className="card-footer">
          <TablePagination
            totalItems={totalItems}
            start={start}
            end={end}
            itemsName="กลุ่มคำ"
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
