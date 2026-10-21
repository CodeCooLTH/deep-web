'use client'

/**
 * TagsClient — รายการแท็กของร้าน + ตัวแก้ inline + ข้อควรรู้ (feature 00083 T8)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/orders/components/OrdersList.tsx
 *   (DataTable + mobileCard + TablePagination + getSortedRowModel/getPaginationRowModel — ตัดตัวกรองสถานะ/จำนวนต่อหน้า)
 *   + src/app/(paces)/seller/(dashboard)/settings/auto-reply/AutoReplyListing.tsx (input-icon-group ค้นหา)
 *   + src/app/(paces)/seller/(dashboard)/settings/auto-notify/components/AutoNotifyClient.tsx (openEditor/closeEditor/beforeunload)
 *   + theme: .../ui/badges/page.tsx (badge) · .../ui/list-group/page.tsx (ข้อควรรู้)
 *
 * mutation แล้วใช้ router.refresh() — props ชุดใหม่ไหลเข้า state ผ่าน prevInitial (ไม่ optimistic: rooms ต้องมาจาก server)
 */
import {
  createColumnHelper,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'

import { getChannelDisplay } from '@/app/(paces)/seller/(chat)/inbox/components/ChannelBadge'
import DataTable from '@/components/table/DataTable'
import TablePagination from '@/components/table/TablePagination'
import Icon from '@/components/wrappers/Icon'
import { fmt } from '@/i18n/fmt'
import { useT } from '@/i18n/LocaleProvider'
import { pacesConfirm } from '@/lib/paces-swal'
import { cn } from '@/utils/helpers'
import TagEditor from './TagEditor'
import { rowKey, type EditorTarget, type TagLimits, type TagRow } from './types'

const PAGE_SIZE = 20
const SEARCH_FROM = 10
const COUNTER_FROM = 40
const columnHelper = createColumnHelper<TagRow>()

type EditMeta = { activeKey: string | null; open: (key: string) => void }

function EditButton({ row, meta, compact }: { row: TagRow; meta: EditMeta; compact?: boolean }) {
  const t = useT().tagManager
  const key = rowKey(row)
  return (
    <button
      type="button"
      data-tag-trigger={key}
      aria-expanded={meta.activeKey === key}
      aria-label={fmt(t.editAria, { name: row.name })}
      onClick={() => meta.open(key)}
      className={cn('btn border-default-300 text-default-800 border', compact ? 'btn-icon size-11' : 'btn-sm min-h-8')}
    >
      <Icon icon="pencil" className="size-4" aria-hidden="true" />
      {!compact && t.edit}
    </button>
  )
}

function TagBadge({ row }: { row: TagRow }) {
  const t = useT().tagManager
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1.5">
      <span className="badge bg-primary/15 text-primary-ink max-w-full min-w-0 truncate text-xs font-semibold">{row.name}</span>
      {!row.registered && <span className="badge border-default-300 bg-card text-default-700 border text-xs whitespace-nowrap">{t.unregistered}</span>}
    </span>
  )
}

function RoomsText({ n }: { n: number }) {
  const t = useT().tagManager
  return n === 0 ? (
    <span className="text-default-600 text-sm">{t.noRooms}</span>
  ) : (
    <span className="text-default-900 text-sm tabular-nums">{fmt(t.rooms, { n: n.toLocaleString() })}</span>
  )
}

function KeywordChips({ keywords }: { keywords: string[] }) {
  const t = useT().tagManager
  if (keywords.length === 0) return <span className="text-default-700 text-sm">{t.manualOnly}</span>
  const rest = keywords.length - 3
  return (
    <span className="flex flex-wrap items-center gap-1">
      {keywords.slice(0, 3).map((k) => (
        <span key={k} className="border-default-300 bg-card text-default-800 max-w-full min-w-0 truncate rounded border px-2 py-0.5 text-xs">
          “{k}”
        </span>
      ))}
      {rest > 0 && <span className="text-default-700 text-xs tabular-nums">+{rest}</span>}
    </span>
  )
}

function OnOrderText({ remove }: { remove: boolean }) {
  const t = useT().tagManager
  return remove ? <span className="text-primary-ink text-sm font-medium">{t.removes}</span> : <span className="text-default-700 text-sm">{t.keeps}</span>
}

export default function TagsClient({ tags: initial, limits }: { tags: TagRow[]; limits: TagLimits }) {
  const t = useT().tagManager
  const router = useRouter()
  const [tags, setTags] = useState(initial)
  const [prevInitial, setPrevInitial] = useState(initial)
  if (initial !== prevInitial) {
    setPrevInitial(initial)
    setTags(initial)
  }
  const [search, setSearch] = useState('')
  const [sorting, setSorting] = useState<SortingState>([])
  const [editor, setEditor] = useState<EditorTarget | null>(null)
  const [dirty, setDirty] = useState(false)
  const editorWrapRef = useRef<HTMLDivElement>(null)

  const registeredCount = tags.filter((x) => x.registered).length
  const full = registeredCount >= limits.maxTags
  const empty = tags.length === 0
  const editingTag = editor?.mode === 'edit' ? (tags.find((x) => rowKey(x) === editor.key) ?? null) : null
  // แท็กที่กำลังแก้หายไปจากรายการ (อีกเครื่องลบ → refresh) = ปิดตัวแก้ ไม่ค้างฟอร์มผี
  const editorGone = editor?.mode === 'edit' && !editingTag
  useEffect(() => {
    if (editorGone) {
      setDirty(false)
      setEditor(null)
    }
  }, [editorGone])

  // ปิดแท็บ/รีเฟรชขณะค้าง = เบราว์เซอร์ถามเอง (ท่าเดียวกับ AutoNotifyClient)
  useEffect(() => {
    if (!dirty) return
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [dirty])

  const focusTrigger = (key: string) =>
    requestAnimationFrame(() => {
      // DataTable วางทั้งตารางและการ์ดมือถือ (ซ่อนด้วย CSS) → เลือกปุ่มที่มองเห็นอยู่จริง
      const el = Array.from(document.querySelectorAll<HTMLElement>(`[data-tag-trigger="${CSS.escape(key)}"]`)).find((n) => n.offsetParent !== null)
      el?.focus()
    })

  const openEditor = async (next: EditorTarget) => {
    if (editor && dirty) {
      const ok = await pacesConfirm.warning(t.discardTitle, t.discardBody, { confirmButtonText: t.discardConfirm, cancelButtonText: t.discardKeep })
      if (!ok) return
    }
    setDirty(false)
    setEditor(next)
    // <xl ตัวแก้อยู่เหนือรายการ → เลื่อนไปหา (เคารพ prefers-reduced-motion) · xl+ อยู่คอลัมน์ข้างจอ ไม่ต้องเลื่อน
    requestAnimationFrame(() => {
      if (window.matchMedia('(min-width: 1280px)').matches) return
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      editorWrapRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
    })
  }
  const closeEditor = () => {
    const key = editor?.mode === 'edit' ? editor.key : 'add'
    setDirty(false)
    setEditor(null)
    focusTrigger(key)
  }
  const done = () => {
    closeEditor()
    router.refresh()
  }

  const columns = useMemo(
    () => [
      columnHelper.accessor('name', {
        header: t.colTag,
        // แท็กที่ยังไม่ตั้งค่าอยู่ท้ายเสมอ (ตามชื่อไทย) — ตรงกับลำดับจาก server
        sortingFn: (a, b) => Number(!a.original.registered) - Number(!b.original.registered) || a.original.name.localeCompare(b.original.name, 'th'),
        cell: ({ row }) => <TagBadge row={row.original} />,
      }),
      columnHelper.accessor('rooms', {
        header: t.colRooms,
        enableGlobalFilter: false,
        cell: ({ row }) => <RoomsText n={row.original.rooms} />,
      }),
      columnHelper.display({
        id: 'keywords',
        header: t.colKeywords,
        enableSorting: false,
        cell: ({ row }) => <KeywordChips keywords={row.original.keywords} />,
      }),
      columnHelper.display({
        id: 'onOrder',
        header: t.colOnOrder,
        enableSorting: false,
        cell: ({ row }) => <OnOrderText remove={row.original.removeOnOrderCreate} />,
      }),
      columnHelper.display({
        id: 'actions',
        header: () => <span className="sr-only">{t.colActions}</span>,
        enableSorting: false,
        cell: ({ row, table }) => <EditButton row={row.original} meta={table.options.meta as EditMeta} />,
      }),
    ],
    [t],
  )

  const activeKey = editor?.mode === 'edit' ? editor.key : null

  const table = useReactTable({
    data: tags,
    columns,
    state: { sorting, globalFilter: search },
    initialState: { pagination: { pageSize: PAGE_SIZE } },
    // แถวส่งสถานะตัวแก้ผ่าน meta — ไม่ประกาศ component ในตัว render
    meta: { activeKey, open: (key: string) => void openEditor({ mode: 'edit', key }) } satisfies EditMeta,
    onSortingChange: setSorting,
    onGlobalFilterChange: setSearch,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: 'includesString',
  })
  const pageIndex = table.getState().pagination.pageIndex
  const total = table.getFilteredRowModel().rows.length
  const start = pageIndex * PAGE_SIZE + 1
  const end = Math.min(start + PAGE_SIZE - 1, total)

  const addButton = (
    <button
      id="tag-add"
      data-tag-trigger="add"
      type="button"
      disabled={full}
      onClick={() => void openEditor({ mode: 'add' })}
      className="btn bg-primary hover:bg-primary-hover min-h-11 text-white lg:min-h-0"
    >
      <Icon icon="plus" className="size-4" aria-hidden="true" />
      {t.addTag}
    </button>
  )

  const notes = [
    { text: t.note1, icon: <Icon icon="info-circle" className="text-default-500 mt-0.5 size-4 shrink-0" aria-hidden="true" /> },
    { text: t.note2, icon: <ChannelMarks channels={['MESSENGER', 'INSTAGRAM']} /> },
    { text: t.note3, icon: <ChannelMarks channels={['LINE']} /> },
    { text: t.note4, icon: <Icon icon="info-circle" className="text-default-500 mt-0.5 size-4 shrink-0" aria-hidden="true" /> },
  ]

  return (
    <div className="gap-base grid xl:grid-cols-3">
      {editor && (
        <div ref={editorWrapRef} className="scroll-mt-20 xl:sticky xl:top-20 xl:col-start-3 xl:row-start-1 xl:self-start">
          <TagEditor
            key={editor.mode === 'edit' ? editor.key : 'add'}
            tag={editingTag}
            preset={editor.mode === 'add' ? editor.preset : undefined}
            tags={tags}
            limits={limits}
            onClose={closeEditor}
            onDirtyChange={setDirty}
            onDone={done}
          />
        </div>
      )}

      <div className="card xl:col-span-2 xl:col-start-1 xl:row-span-2 xl:row-start-1">
        {empty ? (
          <div className="card-body">
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <Icon icon="tags" className="text-default-500 size-8" aria-hidden="true" />
              <h4 className="text-default-900 text-base font-semibold">{t.emptyTitle}</h4>
              <p className="text-default-700 max-w-md text-sm">{t.emptyBody}</p>
              <div className="border-default-300 mt-2 w-full max-w-xl rounded-lg border border-dashed p-3 text-start">
                <span className="badge bg-default-100 text-default-800 mb-2 text-xs">{t.exampleBadge}</span>
                <div className="text-default-800 flex flex-col gap-2 text-sm lg:flex-row lg:flex-wrap lg:items-center">
                  <span>{t.exampleSay}</span>
                  <Icon icon="arrow-down" className="size-4 shrink-0 lg:hidden" aria-hidden="true" />
                  <Icon icon="arrow-right" className="hidden size-4 shrink-0 lg:block" aria-hidden="true" />
                  <span className="flex flex-wrap items-center gap-1.5">
                    {t.exampleTagged} <span className="badge bg-primary/15 text-primary-ink text-xs font-semibold">{t.exampleName}</span>
                  </span>
                  <Icon icon="arrow-down" className="size-4 shrink-0 lg:hidden" aria-hidden="true" />
                  <Icon icon="arrow-right" className="hidden size-4 shrink-0 lg:block" aria-hidden="true" />
                  <span>{t.exampleRemoved}</span>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                {addButton}
                <button
                  type="button"
                  onClick={() => void openEditor({ mode: 'add', preset: { name: t.exampleName, keyword: t.exampleKeyword } })}
                  className="btn border-default-300 text-default-800 min-h-11 border lg:min-h-0"
                >
                  {t.useExample}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="card-header flex-wrap gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                {tags.length > SEARCH_FROM && (
                  <div className="input-icon-group max-w-xs flex-1">
                    <Icon icon="search" className="input-icon" aria-hidden="true" />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      type="text"
                      className="form-input min-h-11 lg:min-h-0"
                      placeholder={t.searchLabel}
                      aria-label={t.searchLabel}
                    />
                  </div>
                )}
                {registeredCount >= COUNTER_FROM && (
                  <span className="text-default-700 text-xs tabular-nums">{fmt(t.countOf, { n: registeredCount, max: limits.maxTags })}</span>
                )}
              </div>
              {addButton}
              {full && <p className="text-default-700 w-full text-sm">{fmt(t.fullHint, { max: limits.maxTags })}</p>}
            </div>
            <DataTable<TagRow>
              table={table}
              emptyMessage={
                <span className="flex flex-col items-center gap-2">
                  {fmt(t.noMatch, { q: search })}
                  <button type="button" onClick={() => setSearch('')} className="btn border-default-300 text-default-800 min-h-11 border lg:min-h-0">
                    {t.clearSearch}
                  </button>
                </span>
              }
              mobileCard={(row) => {
                const r = row.original
                return (
                  <div className={cn('px-4 py-3.5', activeKey === rowKey(r) && 'bg-primary/5')}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <TagBadge row={r} />
                      </div>
                      <EditButton row={r} meta={table.options.meta as EditMeta} compact />
                    </div>
                    <div className="mt-1.5">
                      <KeywordChips keywords={r.keywords} />
                    </div>
                    <p className="text-default-700 mt-1 flex flex-wrap items-center gap-x-1 text-sm">
                      <RoomsText n={r.rooms} />
                      <span aria-hidden="true">·</span>
                      <OnOrderText remove={r.removeOnOrderCreate} />
                    </p>
                  </div>
                )
              }}
            />
            {total > PAGE_SIZE && (
              <div className="card-footer">
                <TablePagination
                  totalItems={total}
                  start={start}
                  end={end}
                  itemsName={t.itemsName}
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
          </>
        )}
      </div>

      <div className="card xl:col-start-3">
        <div className="card-header">
          <h4 className="card-title">{t.notesTitle}</h4>
        </div>
        <div className="card-body">
          <ul className="divide-default-200 divide-y">
            {notes.map((n) => (
              <li key={n.text} className="flex items-start gap-2 py-3 first:pt-0 last:pb-0">
                {n.icon}
                <p className="text-default-700 text-sm">{n.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

/** โลโก้ช่องทางจริงจากกล่องแชท — ไม่ประดิษฐ์ไอคอนใหม่ */
function ChannelMarks({ channels }: { channels: string[] }) {
  return (
    <span className="mt-0.5 flex shrink-0 items-center gap-1" aria-hidden="true">
      {channels.map((c) => {
        const d = getChannelDisplay(c)
        return d.logoSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={c} src={d.logoSrc} alt="" width={16} height={16} className="size-4" />
        ) : (
          <Icon key={c} icon={d.icon} className="size-4" />
        )
      })}
    </span>
  )
}
