'use client'

/**
 * AutoReplyListing — ตาราง listing กลุ่มคำตอบอัตโนมัติ (feature 00023, S-13)
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
 *   - สถานะเป็นปุ่ม 3 ค่า (ไม่ใช้งาน/ทดสอบ/ตอบลูกค้าจริง) กดแล้วมีผลทันที ไม่ใช่ badge อ่านอย่างเดียว
 *     (บทเรียน 2026-07-29: user เปิดสวิตช์ในฟอร์มแล้วไม่ได้กดบันทึก → ระบบไม่ตอบ แล้วงงว่าทำไม)
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
import DeleteConfirmationModal from '@/components/table/DeleteConfirmationModal'
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
  /** จำนวนแชทที่ผูกไว้ทดสอบ — TEST ที่เป็น 0 = ไม่ตอบใครเลยจริง ๆ ต้องเตือน */
  testThreadCount: number
  ruleCount: number
  updatedAt: string
}

/** ป้ายสถานะ — เขียวสงวนให้ "ตอบลูกค้าจริง" เท่านั้นตาม Verified-Means-Green
 *  เหลือง = ทดสอบ (เตือนว่ายังไม่ถึงลูกค้าทุกคน) · เทา = ไม่ทำงาน */
const STATUS_META: Record<string, { label: string; badge: string; icon: string }> = {
  LIVE: { label: 'ตอบลูกค้าจริง', badge: 'bg-success/15 text-success', icon: 'broadcast' },
  TEST: { label: 'ทดสอบ', badge: 'bg-warning/15 text-warning', icon: 'flask' },
  OFFLINE: { label: 'ไม่ใช้งาน', badge: 'bg-default-200 text-default-500', icon: 'circle-off' },
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

const columnHelper = createColumnHelper<KeywordRow>()

/** ป้ายสถานะแบบกดได้ — กดแล้วเปิดเมนู 3 ค่า (user 2026-07-29 "ให้ตั้งค่าทดสอบได้ทีละอัน")
 *  ไม่ใช้ ChoiceSelect เพราะในตารางต้องการป้ายที่อ่านสถานะได้ทันทีโดยไม่ต้องมีกรอบ input */
function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? STATUS_META.OFFLINE
  return (
    <span className={cn('badge text-2xs inline-flex items-center gap-1 py-0 font-semibold', meta.badge)}>
      <Icon icon={meta.icon} className="size-3" aria-hidden="true" />
      {meta.label}
    </span>
  )
}

type Props = {
  keywords: KeywordRow[]
  canEdit: boolean
  /** สวิตช์ระดับร้าน — อยู่ในหัวตารางแทนการ์ดแยก (user 2026-07-30 "ทำไมการตั้งค่ามันมาอยู่หน้าลิส") */
  shopEnabled: boolean
  shopSwitchBusy: boolean
  onShopSwitch: (next: boolean) => void
}

/**
 * ปุ่มหยุดฉุกเฉิน — ไม่ใช่สวิตช์ที่ต้องจำไปเปิด (user 2026-07-30)
 *
 * เดิมเป็น `form-switch` ค้างอยู่ในหัวตาราง ซึ่งซ้ำกับสถานะรายแถว (ไม่ใช้งาน/ทดสอบ/ตอบลูกค้าจริง)
 * และสร้างกับดักเดิมกลับมา: แถวเป็น "ตอบลูกค้าจริง" แต่เงียบ เพราะสวิตช์ร้านปิดอยู่คนละที่
 * ตอนนี้สวิตช์ร้านเปิดให้เองตอนกลุ่มแรกออกจาก "ไม่ใช้งาน" (ดู updateKeyword) เหลือไว้เป็น
 * "การกระทำ" สำหรับกรณีบอทพูดผิดแล้วต้องหยุดทุกกลุ่มในคลิกเดียว — ไม่ใช่ "สถานะ" ที่ต้องเรียนรู้
 */
function EmergencyStopButton({
  busy, canEdit, onStop,
}: { busy: boolean; canEdit: boolean; onStop: () => void }) {
  if (!canEdit) return null
  return (
    <button
      type="button"
      className="btn btn-sm btn-soft-danger flex-none"
      disabled={busy}
      onClick={onStop}
      title="หยุดการตอบอัตโนมัติทุกกลุ่มทันที โดยไม่ต้องแก้ทีละกลุ่ม"
    >
      <Icon icon="player-stop" className="size-4" aria-hidden="true" />
      หยุดตอบทั้งหมด
    </button>
  )
}

export default function AutoReplyListing({
  keywords, canEdit, shopEnabled, shopSwitchBusy, onShopSwitch,
}: Props) {
  async function confirmStop() {
    const ok = await pacesConfirm.danger(
      'หยุดตอบอัตโนมัติทุกกลุ่ม?',
      'ลูกค้าที่ทักเข้ามาหลังจากนี้จะไม่ได้รับคำตอบอัตโนมัติเลย จนกว่าจะกดเปิดกลับ — การตั้งค่าทั้งหมดยังอยู่ครบ',
      { confirmButtonText: 'หยุดทั้งหมด' },
    )
    if (ok) onShopSwitch(false)
  }

  const router = useRouter()
  const [data, setData] = useState<KeywordRow[]>(() => [...keywords])
  const [globalFilter, setGlobalFilter] = useState('')
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 })
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [statusChip, setStatusChip] = useState('All')
  const [busyId, setBusyId] = useState<string | null>(null)

  /**
   * เปลี่ยนสถานะกลุ่มคำทันทีที่เลือก — optimistic แล้วคืนค่าเดิมถ้าเซิร์ฟเวอร์ปฏิเสธ
   *
   * ปฏิเสธได้จริง 2 กรณี และทั้งคู่ต้องบอกเหตุผล ไม่ใช่เด้งกลับเงียบ ๆ:
   *   - ออกจาก "ไม่ใช้งาน" ทั้งที่ยังไม่มีคำตรวจจับหรือคำตอบ
   *   - ตั้งเป็น "ทดสอบ" ทั้งที่ยังไม่ได้เลือกแชทสำหรับทดสอบเลย
   */
  async function changeStatus(row: KeywordRow, next: string) {
    if (!canEdit || busyId || next === row.status) return
    // ขาไป LIVE = ลูกค้าจริงทุกคนเริ่มได้รับคำตอบ ถามก่อนเสมอ
    // ขาอื่นไม่ถาม (เป็นการลดขอบเขต ไม่ใช่ขยาย)
    if (next === 'LIVE') {
      const ok = await pacesConfirm.warning(
        `ให้ "${row.name}" ตอบลูกค้าจริง?`,
        'หลังจากนี้ลูกค้าทุกคนที่ทักเข้ามาและพิมพ์ตรงกับคำในกลุ่มนี้ จะได้รับคำตอบอัตโนมัติทันที',
        { confirmButtonText: 'ตอบลูกค้าจริง' },
      )
      if (!ok) return
    }
    setBusyId(row.id)
    setData((rows) => rows.map((r) => (r.id === row.id ? { ...r, status: next } : r)))
    try {
      const res = await fetch(`/api/shops/auto-reply/keywords/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ status: next }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'บันทึกไม่สำเร็จ')
      pacesToast.success(`"${row.name}" → ${STATUS_META[next]?.label ?? next}`)
      // เข้าโหมดทดสอบ = ต้องไปเลือกแชทในหน้าแก้ไข ไม่งั้นไม่มีอะไรเกิดขึ้น
      if (next === 'TEST' && row.testThreadCount === 0) {
        pacesToast.warning('ยังไม่ได้เลือกแชทสำหรับทดสอบ — เปิดกลุ่มคำนี้แล้วเพิ่มแชทก่อน')
      }
    } catch (e) {
      setData((rows) => rows.map((r) => (r.id === row.id ? { ...r, status: row.status } : r)))
      pacesToast.error(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ')
    } finally {
      setBusyId(null)
    }
  }

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
                {row.original.phraseCount > 0
                  ? `${row.original.phraseCount} คำตรวจจับ`
                  : 'ยังไม่มีคำตรวจจับ'}
              </p>
            </div>
          </div>
        ),
      }),
      columnHelper.accessor('phraseCount', {
        header: 'คำตรวจจับ',
        cell: ({ row }) => <span className="text-default-600">{row.original.phraseCount}</span>,
      }),
      columnHelper.accessor('ruleCount', {
        header: 'คำตอบ',
        cell: ({ row }) => <span className="text-default-600">{row.original.ruleCount}</span>,
      }),
      columnHelper.accessor('status', {
        header: 'สถานะ',
        filterFn: 'equalsString',
        enableColumnFilter: true,
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            {canEdit ? (
              <div className="w-40">
                <ChoiceSelect
                  options={STATUS_OPTIONS.filter((o) => o.value !== 'All')}
                  value={row.original.status}
                  search={false}
                  disabled={busyId === row.original.id}
                  onChange={(v) => changeStatus(row.original, v as string)}
                  ariaLabel={`สถานะของ ${row.original.name}`}
                />
              </div>
            ) : (
              <StatusBadge status={row.original.status} />
            )}
            {row.original.status === 'TEST' && row.original.testThreadCount === 0 && (
              <span
                className="text-warning"
                title="ยังไม่ได้เลือกแชทสำหรับทดสอบ — กลุ่มนี้จะไม่ตอบใครเลย"
              >
                <Icon icon="alert-triangle" className="size-4" aria-hidden="true" />
              </span>
            )}
          </div>
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
                onClick={() => {
                  'use no memo'
                  setDeletingId(row.original.id)
                }}
                data-hs-overlay="#confirm-delete-modal"
                suppressHydrationWarning
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
    [canEdit, busyId],
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

  async function handleDelete() {
    const id = deletingId
    if (!id) return
    try {
      const res = await fetch(`/api/shops/auto-reply/keywords/${id}`, {
        method: 'DELETE',
        cache: 'no-store',
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'ลบไม่สำเร็จ')
      setData((prev) => prev.filter((k) => k.id !== id))
      setDeletingId(null)
      setPagination((p) => ({ ...p, pageIndex: 0 }))
      pacesToast.success('ลบกลุ่มคำเรียบร้อย')
      router.refresh()
    } catch (e) {
      pacesToast.error(e instanceof Error ? e.message : 'ลบไม่สำเร็จ')
    } finally {
      window.HSOverlay?.close('#confirm-delete-modal')
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
          {shopEnabled && (
            <EmergencyStopButton busy={shopSwitchBusy} canEdit={canEdit} onStop={confirmStop} />
          )}
          {canEdit && (
            <Link href="/settings/auto-reply/new" className="btn bg-primary hover:bg-primary-hover text-white">
              <Icon icon="plus" aria-hidden="true" />
              สร้างกลุ่มคำ
            </Link>
          )}
        </div>
      </div>

      {!shopEnabled && (
        <div className="bg-warning/10 border-default-200 flex items-center gap-2.5 border-y px-4 py-2.5">
          <span className="bg-warning flex size-7 flex-none items-center justify-center rounded-lg text-white">
            <Icon icon="alert-triangle" className="size-4" aria-hidden="true" />
          </span>
          <p className="text-default-700 mb-0 flex-1 text-sm">
            หยุดตอบทั้งหมดอยู่ — การตั้งค่าทุกกลุ่มยังอยู่ครบ แต่ลูกค้าจะยังไม่ได้รับคำตอบ
          </p>
          {canEdit && (
            <button
              type="button"
              className="btn btn-sm btn-soft-primary flex-none"
              disabled={shopSwitchBusy}
              onClick={() => onShopSwitch(true)}
            >
              เปิดกลับ
            </button>
          )}
        </div>
      )}

      <DataTable<KeywordRow>
        table={table}
        emptyMessage="ไม่พบกลุ่มคำ"
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
                <p className="text-default-400 mt-0.5 mb-0 text-xs">
                  {k.phraseCount} คำตรวจจับ · {k.ruleCount} คำตอบ
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <StatusBadge status={k.status} />
                  {k.status === 'TEST' && k.testThreadCount === 0 && (
                    <span className="badge bg-warning/15 text-warning text-2xs py-0 font-semibold">
                      ยังไม่ได้เลือกแชท
                    </span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
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

      <DeleteConfirmationModal
        onConfirm={handleDelete}
        selectedCount={1}
        itemName="กลุ่มคำ"
        modalTitle="ยืนยันการลบ"
        confirmButtonText="ลบ"
        cancelButtonText="ยกเลิก"
      >
        <p className="text-default-500">
          ลบกลุ่มคำนี้แล้วคำตอบทั้งหมดในกลุ่มจะหายไปด้วย และกู้คืนไม่ได้
        </p>
      </DeleteConfirmationModal>
    </div>
  )
}
