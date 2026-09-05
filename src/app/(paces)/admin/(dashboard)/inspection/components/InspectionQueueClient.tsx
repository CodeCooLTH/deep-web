'use client'

/**
 * InspectionQueueClient — คิวรอบตรวจทั้งระบบ + งานค้าง + มอบหมายผู้ตรวจ
 * (feature 00060 · T13 · UX Design Spec Surface D)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/orders/components/OrdersList.tsx
 *   (DataTable + card-header toolbar pattern) — filter dropdown ใช้ `FilterDropdown`
 *   (`src/components/safepay/FilterDropdown.tsx`) แทน native `<select>` ของ theme ดิบ ตาม
 *   `docs/system/ui-guideline/paces-component-reference.md` §3b ("dropdown ใน list/toolbar ที่
 *   re-render = FilterDropdown ห้าม hs-dropdown ดิบ")
 * Base (stat cards): theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/page.tsx +
 *   components/StatisticCard.tsx (ใช้ `StatisticCard`/`AdminStat` ตัวที่มีอยู่แล้วใน
 *   `src/views/dashboards/ecommerce/StatisticCard.tsx` — ของเดิมที่ /admin/dashboard ใช้อยู่)
 *
 * 🛑 `overdueUnassigned`/`overdueAssigned` ห้ามยุบเป็นตัวเลขเดียว (Controller instruction) —
 * สองค่านี้สั่งให้ทีมทำคนละเรื่อง จึงแยกเป็นการ์ดคนละใบระดับบนสุด และแยกคอลัมน์ในตาราง backlog
 * รายขั้น/วิธีตรวจด้านล่าง — `fraudSignalCount` อยู่ระดับบนสุดเช่นกัน ไม่ซ่อนในตาราง backlog
 *
 * 🛑 ไม่มี endpoint กลางที่ list "ผู้ตรวจทั้งหมด" (`/api/admin/users` ไม่มีตัวกรอง `isInspector`
 * และ cap 50 แถวเรียงตาม createdAt — แก้ endpoint นั้นอยู่นอกขอบเขต 2 ไดเรกทอรีของ task นี้)
 * ⇒ ช่องมอบหมายเป็น "พิมพ์ค้นหาชื่อ/username/เบอร์" แล้วกรอง `isInspector===true` ฝั่ง client
 * ก่อนใส่เป็น option ของ `<select>` จริง (ผูกค่าเข้าฟอร์ม ไม่ใช่ action menu ตามสเปก) — ระบุเป็น
 * known-gap ในรายงานให้ Controller พิจารณาเพิ่ม `?isInspector=true` ที่ endpoint นั้นภายหลัง
 */

import { useMemo, useState } from 'react'
import DataTable from '@/components/table/DataTable'
import TablePagination from '@/components/table/TablePagination'
import Icon from '@/components/wrappers/Icon'
import FilterDropdown from '@/components/safepay/FilterDropdown'
import { pacesToast } from '@/lib/paces-toast'
import { pacesConfirm } from '@/lib/paces-swal'
import { formatDateTH } from '@/lib/format-date'
import { INSPECTION_STEP_LABEL_TH, type InspectionMethod, type InspectionStep } from '@/lib/inspection/checks'
import StatisticCard, { type AdminStat } from '@/views/dashboards/ecommerce/StatisticCard'
import { createColumnHelper, getCoreRowModel, getPaginationRowModel, useReactTable } from '@tanstack/react-table'
import { cn } from '@/utils/helpers'

// 🛑 `step`/`method` เป็น `number`/`string` ดิบ ตรงกับที่ `listRoundsForAdmin()` คืนจริง
// (Prisma `Int`/`String` ไม่ใช่ literal union) — cast เป็น `InspectionStep`/`InspectionMethod`
// เฉพาะตอน index ตาราง label เท่านั้น ไม่ประกาศ field เป็น union type ตรง ๆ ที่นี่
export type RoundRow = {
  roundId: string
  shopId: string
  shopName: string
  roomId: string | null
  roomName: string | null
  step: number
  method: string
  checkKeys: string[]
  dueAt: string | null
  assignedAt: string | null
  completedAt: string | null
  inspectorUserId: string | null
  inspectorDisplayName: string | null
  isOverdue: boolean
  suspectedFraudNote: string | null
}

export type BacklogBucket = { step: number; method: string; overdueUnassigned: number; overdueAssigned: number; dueSoon: number }

type UserSearchRow = { id: string; displayName?: string; username?: string; isInspector?: boolean }

const METHOD_LABEL: Record<string, string> = { AUTO: 'อัตโนมัติ', DOCUMENT: 'เอกสาร', VIDEO_CALL: 'วิดีโอคอล', ONSITE: 'ลงพื้นที่' }

const columnHelper = createColumnHelper<RoundRow>()

type Props = {
  initialRounds: RoundRow[]
  initialBacklog: BacklogBucket[]
  initialFraudSignalCount: number
  initialNextCursor: string | null
}

export default function InspectionQueueClient({ initialRounds, initialBacklog, initialFraudSignalCount, initialNextCursor }: Props) {
  const [rounds, setRounds] = useState(initialRounds)
  const [backlog, setBacklog] = useState(initialBacklog)
  const [fraudSignalCount, setFraudSignalCount] = useState(initialFraudSignalCount)
  const [nextCursor, setNextCursor] = useState(initialNextCursor)
  const [loading, setLoading] = useState(false)

  const [assignment, setAssignment] = useState<'ALL' | 'UNASSIGNED' | 'ASSIGNED'>('ALL')
  const [overdueOnly, setOverdueOnly] = useState<'false' | 'true'>('false')
  const [stepFilter, setStepFilter] = useState<'All' | '1' | '2' | '3' | '4'>('All')
  const [methodFilter, setMethodFilter] = useState<'All' | InspectionMethod>('All')
  const [fraudOnly, setFraudOnly] = useState<'false' | 'true'>('false')

  // ── มอบหมายผู้ตรวจ (inline panel ต่อแถว — form-select ผูกค่าเข้าฟอร์มจริง) ──────────
  const [assigningId, setAssigningId] = useState<string | null>(null)
  const [inspectorQuery, setInspectorQuery] = useState('')
  const [inspectorOptions, setInspectorOptions] = useState<UserSearchRow[]>([])
  const [selectedInspectorId, setSelectedInspectorId] = useState('')
  const [assignBusy, setAssignBusy] = useState(false)

  const fetchRounds = async (params: { assignment: string; overdueOnly: string; step: string; method: string; fraud: string }) => {
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      if (params.assignment !== 'ALL') qs.set('assignment', params.assignment)
      if (params.overdueOnly === 'true') qs.set('overdueOnly', 'true')
      if (params.step !== 'All') qs.set('step', params.step)
      if (params.method !== 'All') qs.set('method', params.method)
      if (params.fraud === 'true') qs.set('hasFraudSignal', 'true')
      qs.set('limit', '200')

      const res = await fetch(`/api/admin/inspection/rounds?${qs.toString()}`)
      const data = (await res.json().catch(() => null)) as
        | { rounds: RoundRow[]; backlog: BacklogBucket[]; fraudSignalCount: number; nextCursor: string | null }
        | { error: string; message?: string }
        | null
      if (!res.ok || data === null || !('rounds' in data)) {
        pacesToast.error((data as { message?: string } | null)?.message ?? 'โหลดคิวงานไม่สำเร็จ ลองใหม่อีกครั้ง')
        return
      }
      setRounds(data.rounds)
      setBacklog(data.backlog)
      setFraudSignalCount(data.fraudSignalCount)
      setNextCursor(data.nextCursor)
    } finally {
      setLoading(false)
    }
  }

  const applyFilter = (next: Partial<{ assignment: string; overdueOnly: string; step: string; method: string; fraud: string }>) => {
    const merged = {
      assignment: next.assignment ?? assignment,
      overdueOnly: next.overdueOnly ?? overdueOnly,
      step: next.step ?? stepFilter,
      method: next.method ?? methodFilter,
      fraud: next.fraud ?? fraudOnly,
    }
    if (next.assignment !== undefined) setAssignment(next.assignment as typeof assignment)
    if (next.overdueOnly !== undefined) setOverdueOnly(next.overdueOnly as typeof overdueOnly)
    if (next.step !== undefined) setStepFilter(next.step as typeof stepFilter)
    if (next.method !== undefined) setMethodFilter(next.method as typeof methodFilter)
    if (next.fraud !== undefined) setFraudOnly(next.fraud as typeof fraudOnly)
    void fetchRounds(merged)
  }

  // ── ตัวชี้วัดงานค้าง — รวมทุก bucket แยกคอลัมน์ ห้ามยุบเป็นเลขเดียว ─────────────────
  const totals = backlog.reduce(
    (acc, b) => ({
      overdueUnassigned: acc.overdueUnassigned + b.overdueUnassigned,
      overdueAssigned: acc.overdueAssigned + b.overdueAssigned,
      dueSoon: acc.dueSoon + b.dueSoon,
    }),
    { overdueUnassigned: 0, overdueAssigned: 0, dueSoon: 0 },
  )

  const stats: AdminStat[] = [
    { title: 'รอมอบหมาย (เลยกำหนด)', value: totals.overdueUnassigned, icon: 'user-exclamation', tone: 'warning' },
    { title: 'มอบหมายแล้ว รอผล (เลยกำหนด)', value: totals.overdueAssigned, icon: 'clock-exclamation', tone: 'primary' },
    { title: 'ใกล้ครบกำหนด (≤7 วัน)', value: totals.dueSoon, icon: 'calendar-time', tone: 'info' },
    { title: 'สัญญาณฉ้อโกงที่ยังไม่จัดการ', value: fraudSignalCount, icon: 'alert-triangle', tone: 'secondary' },
  ]

  // ── ค้นหาผู้ตรวจ ──────────────────────────────────────────────────────────────
  const searchInspectors = async (q: string) => {
    setInspectorQuery(q)
    if (q.trim().length < 2) {
      setInspectorOptions([])
      return
    }
    const res = await fetch(`/api/admin/users?search=${encodeURIComponent(q.trim())}`)
    if (!res.ok) return
    const data = (await res.json().catch(() => [])) as UserSearchRow[]
    setInspectorOptions(Array.isArray(data) ? data.filter((u) => u.isInspector === true) : [])
  }

  const openAssign = (roundId: string) => {
    setAssigningId(roundId)
    setInspectorQuery('')
    setInspectorOptions([])
    setSelectedInspectorId('')
  }

  const submitAssign = async (round: RoundRow) => {
    if (!selectedInspectorId) {
      pacesToast.error('กรุณาเลือกผู้ตรวจก่อน')
      return
    }
    let reassign = false
    if (round.inspectorUserId !== null) {
      const ok = await pacesConfirm.warning(
        'เปลี่ยนผู้ตรวจของรอบนี้?',
        `กำลังดึงงานออกจากมือ ${round.inspectorDisplayName ?? 'ผู้ตรวจคนเดิม'} — เขาจะไม่เห็นรอบนี้ในคิวงานอีกทันที`,
      )
      if (!ok) return
      reassign = true
    }

    setAssignBusy(true)
    try {
      const res = await fetch(`/api/admin/inspection/rounds/${round.roundId}/assign`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ inspectorUserId: selectedInspectorId, reassign }),
      })
      const data = (await res.json().catch(() => null)) as
        | { inspectorUserId: string; inspectorDisplayName: string; assignedAt: string; reassignedFrom: string | null }
        | { message?: string }
        | null
      if (!res.ok || data === null || !('inspectorDisplayName' in data)) {
        pacesToast.error((data as { message?: string } | null)?.message ?? 'มอบหมายไม่สำเร็จ ลองใหม่อีกครั้ง')
        return
      }
      setRounds((rs) =>
        rs.map((r) =>
          r.roundId === round.roundId
            ? { ...r, inspectorUserId: data.inspectorUserId, inspectorDisplayName: data.inspectorDisplayName, assignedAt: data.assignedAt }
            : r,
        ),
      )
      pacesToast.success(
        data.reassignedFrom ? `มอบหมายแล้ว — ดึงงานออกจาก ${data.reassignedFrom} แล้ว` : 'มอบหมายผู้ตรวจแล้ว',
      )
      setAssigningId(null)
    } finally {
      setAssignBusy(false)
    }
  }

  const columns = useMemo(
    () => [
      columnHelper.accessor('shopName', {
        header: 'ร้าน / ที่พัก',
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-default-900">{row.original.shopName}</p>
            {row.original.roomName && <p className="truncate text-xs text-default-500">{row.original.roomName}</p>}
          </div>
        ),
      }),
      columnHelper.accessor('step', {
        header: 'ขั้น / วิธีตรวจ',
        cell: ({ row }) => (
          <span className="text-xs text-default-700">
            {INSPECTION_STEP_LABEL_TH[row.original.step as InspectionStep]} · {METHOD_LABEL[row.original.method] ?? row.original.method}
          </span>
        ),
      }),
      columnHelper.accessor('dueAt', {
        header: 'ครบกำหนด',
        cell: ({ row }) => (
          <span className={cn('text-xs font-medium', row.original.isOverdue ? 'text-danger-ink' : 'text-default-700')}>
            {row.original.dueAt ? formatDateTH(row.original.dueAt) : 'ไม่ระบุ'}
            {row.original.isOverdue && (
              <span className="badge ms-1.5 bg-danger/15 text-danger-ink">เลยกำหนด</span>
            )}
          </span>
        ),
      }),
      columnHelper.accessor('inspectorDisplayName', {
        header: 'ผู้ตรวจ',
        cell: ({ row }) =>
          row.original.inspectorDisplayName ? (
            <span className="text-sm text-default-800">{row.original.inspectorDisplayName}</span>
          ) : (
            <span className="badge bg-warning/15 text-warning-ink">ยังไม่มอบหมาย</span>
          ),
      }),
      columnHelper.accessor('suspectedFraudNote', {
        header: 'ฉ้อโกง',
        cell: ({ row }) =>
          row.original.suspectedFraudNote ? (
            <span className="badge bg-secondary/15 text-secondary-ink" title={row.original.suspectedFraudNote}>
              <Icon icon="alert-triangle" className="size-3" aria-hidden="true" />
              มีบันทึก
            </span>
          ) : (
            <span className="text-xs text-default-400">—</span>
          ),
      }),
      columnHelper.display({
        id: 'action',
        header: () => <div className="text-end">มอบหมาย</div>,
        cell: ({ row }) => {
          const round = row.original
          if (assigningId !== round.roundId) {
            return (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => openAssign(round.roundId)}
                  className="btn btn-sm border border-default-300 text-default-800"
                >
                  {round.inspectorUserId ? 'เปลี่ยนผู้ตรวจ' : 'มอบหมาย'}
                </button>
              </div>
            )
          }
          return (
            <div className="w-64 space-y-1.5 text-start">
              <input
                type="text"
                value={inspectorQuery}
                onChange={(e) => void searchInspectors(e.target.value)}
                placeholder="พิมพ์ชื่อ/username ผู้ตรวจ…"
                className="form-input form-input-sm"
              />
              <select
                value={selectedInspectorId}
                onChange={(e) => setSelectedInspectorId(e.target.value)}
                className="form-select form-select-sm"
              >
                <option value="">— เลือกผู้ตรวจ —</option>
                {inspectorOptions.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.displayName ?? u.username ?? u.id}
                  </option>
                ))}
              </select>
              <div className="flex justify-end gap-1.5">
                <button type="button" onClick={() => setAssigningId(null)} className="btn btn-sm bg-light text-dark">
                  ยกเลิก
                </button>
                <button
                  type="button"
                  disabled={assignBusy}
                  onClick={() => void submitAssign(round)}
                  className="btn btn-sm bg-primary text-white hover:bg-primary-hover disabled:opacity-50"
                >
                  ยืนยัน
                </button>
              </div>
            </div>
          )
        },
      }),
    ],
    // inspectorOptions/inspectorQuery/selectedInspectorId/assigningId/assignBusy เปลี่ยนบ่อย
    // ตอนกำลังมอบหมาย ต้อง re-derive columns ใหม่ให้ cell อ่านค่าปัจจุบัน (closures ของ TanStack
    // column def จับค่าตอนสร้างเท่านั้น)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [assigningId, inspectorOptions, inspectorQuery, selectedInspectorId, assignBusy],
  )

  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 })
  const table = useReactTable({
    data: rounds,
    columns,
    state: { pagination },
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  })
  const pageIndex = table.getState().pagination.pageIndex
  const pageSize = table.getState().pagination.pageSize
  const totalItems = rounds.length
  const start = totalItems === 0 ? 0 : pageIndex * pageSize + 1
  const end = Math.min(pageIndex * pageSize + pageSize, totalItems)

  return (
    <>
      <div className="mb-base grid grid-cols-1 gap-base md:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => (
          <StatisticCard key={s.title} stat={s} />
        ))}
      </div>

      {/* backlog รายขั้น/วิธีตรวจ — ห้ามยุบเป็นตัวเลขเดียว: คนละคอลัมน์ = คนละปัญหา */}
      {backlog.length > 0 && (
        <div className="card mb-base">
          <div className="card-header">
            <h4 className="card-title">งานค้างแยกตามขั้นและวิธีตรวจ</h4>
          </div>
          <div className="table-wrapper">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>ขั้น</th>
                  <th>วิธีตรวจ</th>
                  <th>รอมอบหมาย (เลยกำหนด)</th>
                  <th>มอบหมายแล้ว รอผล (เลยกำหนด)</th>
                  <th>ใกล้ครบกำหนด (≤7 วัน)</th>
                </tr>
              </thead>
              <tbody>
                {backlog.map((b) => (
                  <tr key={`${b.step}-${b.method}`}>
                    <td>{INSPECTION_STEP_LABEL_TH[b.step as InspectionStep]}</td>
                    <td>{METHOD_LABEL[b.method] ?? b.method}</td>
                    <td className={b.overdueUnassigned > 0 ? 'font-semibold text-warning-ink' : 'text-default-500'}>
                      {b.overdueUnassigned}
                    </td>
                    <td className={b.overdueAssigned > 0 ? 'font-semibold text-danger-ink' : 'text-default-500'}>
                      {b.overdueAssigned}
                    </td>
                    <td className="text-default-600">{b.dueSoon}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header flex flex-wrap items-center gap-2.5">
          <span className="me-1 shrink-0 text-sm font-semibold text-default-700">กรอง:</span>
          <FilterDropdown
            icon="user-check"
            defaultLabel="การมอบหมาย"
            value={assignment}
            resetValue="ALL"
            options={[
              { value: 'ALL', label: 'ทั้งหมด' },
              { value: 'UNASSIGNED', label: 'ยังไม่มอบหมาย' },
              { value: 'ASSIGNED', label: 'มอบหมายแล้ว' },
            ]}
            onChange={(v) => applyFilter({ assignment: v })}
          />
          <FilterDropdown
            icon="alert-triangle"
            value={overdueOnly}
            resetValue="false"
            options={[
              { value: 'false', label: 'ทุกกำหนดเวลา' },
              { value: 'true', label: 'เฉพาะเลยกำหนด' },
            ]}
            onChange={(v) => applyFilter({ overdueOnly: v })}
          />
          <FilterDropdown
            icon="stairs"
            defaultLabel="ขั้น"
            value={stepFilter}
            resetValue="All"
            options={[
              { value: 'All', label: 'ทุกขั้น' },
              { value: '1', label: INSPECTION_STEP_LABEL_TH[1] },
              { value: '2', label: INSPECTION_STEP_LABEL_TH[2] },
              { value: '3', label: INSPECTION_STEP_LABEL_TH[3] },
              { value: '4', label: INSPECTION_STEP_LABEL_TH[4] },
            ]}
            onChange={(v) => applyFilter({ step: v })}
          />
          <FilterDropdown
            icon="clipboard-list"
            defaultLabel="วิธีตรวจ"
            value={methodFilter}
            resetValue="All"
            options={[
              { value: 'All', label: 'ทุกวิธี' },
              { value: 'DOCUMENT', label: 'เอกสาร' },
              { value: 'VIDEO_CALL', label: 'วิดีโอคอล' },
              { value: 'ONSITE', label: 'ลงพื้นที่' },
            ]}
            onChange={(v) => applyFilter({ method: v })}
          />
          <FilterDropdown
            icon="flag"
            value={fraudOnly}
            resetValue="false"
            options={[
              { value: 'false', label: 'ทุกรายการ' },
              { value: 'true', label: 'มีสัญญาณฉ้อโกง' },
            ]}
            onChange={(v) => applyFilter({ fraud: v })}
          />
          {loading && <Icon icon="loader-2" className="size-4 animate-spin text-default-400" aria-hidden="true" />}
        </div>

        <DataTable<RoundRow>
          table={table}
          showHeaders
          emptyMessage={
            <div className="flex flex-col items-center gap-2 py-8">
              <Icon icon="clipboard-off" className="text-4xl text-default-300" aria-hidden="true" />
              <p className="font-semibold text-default-500">ไม่มีรอบตรวจตรงกับตัวกรองนี้</p>
            </div>
          }
        />

        {rounds.length > 0 && (
          <div className="card-footer">
            <TablePagination
              totalItems={totalItems}
              start={start}
              end={end}
              itemsName="รอบ"
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

        {/* cursor pagination ของ API ยังไม่ผูกเต็มรูป (out of scope เวลาที่มี) — โหลดครั้งละ 200
            แถวตามตัวกรองปัจจุบัน ถ้ายังมีมากกว่านั้นให้บีบด้วยตัวกรองก่อน */}
        {nextCursor && (
          <div className="card-footer border-t border-dashed border-default-300 text-center text-xs text-default-500">
            มีรอบตรวจมากกว่า 200 รายการตามตัวกรองนี้ — ใช้ตัวกรองด้านบนเพื่อจำกัดผลลัพธ์
          </div>
        )}
      </div>
    </>
  )
}
