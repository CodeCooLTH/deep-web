'use client'

/**
 * คลังคำถามของกลุ่ม — ตาราง + ค้นหา + ชิปกรอง + เลือกหลายข้อ + Modal เพิ่ม/แก้ + Modal ย้ายกลุ่ม
 * feature 00023 · phase `00023-qna` · S-13
 *
 * SSOT: docs/superpowers/specs/2026-07-31-00023-qna-ux-design-spec.md §หน้า A (+ Theme Source Mapping)
 *
 * Base:
 *   - toolbar (mobile pill + desktop card-header), ชิปกรอง, mobileCard, card-footer + TablePagination
 *     -> src/app/(paces)/seller/(dashboard)/settings/auto-reply/AutoReplyListing.tsx
 *        (Base เดิม = theme/paces/.../(products)/products/components/ProductsListing.tsx)
 *   - checkbox ในแถว -> src/app/(paces)/seller/(dashboard)/orders/components/OrdersTable.tsx
 *   - form-switch / form-radio -> theme/paces/Admin/TS/src/app/(admin)/form/elements/components/ChecksRadioSwitches.tsx
 *   - modal/sheet shell -> src/app/(paces)/seller/(chat)/inbox/[conversationId]/components/CustomerPanelSheet.tsx
 *        (Base เดิม = theme/paces/.../ui/offcanvas/page.tsx + ui/modals/page.tsx)
 *
 * ยังไม่รวมในไฟล์นี้โดยเจตนา (กันชนไฟล์กับงานขนาน): ปุ่มนำเข้า/ส่งออก CSV (S-16)
 * และช่องอัปโหลดรูปใน Modal 1 (S-21) — สองงานนั้นจะมาต่อในไฟล์นี้ทีหลังตามลำดับ
 */
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Icon from '@/components/wrappers/Icon'
import TablePagination from '@/components/table/TablePagination'
import { pacesToast } from '@/lib/paces-toast'
import { pacesConfirm } from '@/lib/paces-swal'
import { cn } from '@/utils/helpers'

export type QnaRow = {
  id: string
  question: string
  answer: string
  isActive: boolean
  useCount: number
}

type OtherKeyword = { id: string; name: string; status: string; qnaCount: number }

type Props = {
  keywordId: string
  keywordName: string
  canEdit: boolean
  initialItems: QnaRow[]
  initialStats: { total: number; active: number; totalUses: number }
  otherKeywords: OtherKeyword[]
}

const FILTER_CHIPS = [
  { key: 'ALL', label: 'ทั้งหมด' },
  { key: 'ACTIVE', label: 'ใช้งานอยู่' },
  { key: 'INACTIVE', label: 'ปิดไว้' },
  { key: 'NEVER_USED', label: 'ไม่เคยถูกใช้' },
] as const

type FilterKey = (typeof FILTER_CHIPS)[number]['key']

const PAGE_SIZE = 10

/** ป้ายสถานะกลุ่มใน Modal ย้าย — คำเดียวกับหน้ารายการกลุ่มคำ ไม่ตั้งชื่อใหม่ */
const KEYWORD_STATUS_LABEL: Record<string, string> = {
  LIVE: 'ตอบลูกค้าจริง',
  TEST: 'ทดสอบ',
  OFFLINE: 'ไม่ใช้งาน',
}

export default function QnaListingClient({
  keywordId,
  keywordName,
  canEdit,
  initialItems,
  initialStats,
  otherKeywords,
}: Props) {
  const router = useRouter()
  const [items, setItems] = useState<QnaRow[]>(initialItems)
  const [stats, setStats] = useState(initialStats)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterKey>('ALL')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [pageIndex, setPageIndex] = useState(0)
  const [busy, setBusy] = useState(false)

  const [editing, setEditing] = useState<QnaRow | 'NEW' | null>(null)
  const [moveOpen, setMoveOpen] = useState(false)

  /* ── กรอง + ค้นหาในหน่วยความจำ ─────────────────────────────────────────────
   * คลังต่อกลุ่มมีหลักสิบถึงหลักร้อยข้อ (scope baseline ตั้งเพดาน similarity ไว้ที่ ~200)
   * การกรองฝั่ง client จึงเร็วกว่าและทำให้ชิป/ค้นหาตอบสนองทันทีโดยไม่ยิง API ทุกตัวอักษร
   * ถ้าวันหนึ่งคลังโตเกินหลักพัน ค่อยย้ายไปกรองที่ API (service รองรับ filter/search อยู่แล้ว) */
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((it) => {
      if (filter === 'ACTIVE' && !it.isActive) return false
      if (filter === 'INACTIVE' && it.isActive) return false
      if (filter === 'NEVER_USED' && it.useCount !== 0) return false
      if (!q) return true
      return it.question.toLowerCase().includes(q) || it.answer.toLowerCase().includes(q)
    })
  }, [items, search, filter])

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  const safePage = Math.min(pageIndex, pageCount - 1)
  const paged = visible.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)

  const selectedOnPage = paged.filter((r) => selected.has(r.id))
  const allOnPageSelected = paged.length > 0 && selectedOnPage.length === paged.length

  function resetPaging() {
    setPageIndex(0)
    setSelected(new Set())
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAllOnPage() {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allOnPageSelected) paged.forEach((r) => next.delete(r.id))
      else paged.forEach((r) => next.add(r.id))
      return next
    })
  }

  /** อ่านข้อความ error จาก API — ทุก route ของฟีเจอร์นี้คืน `{ error: string }` เสมอ */
  async function readError(res: Response, fallback: string): Promise<string> {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    return body?.error ?? fallback
  }

  async function toggleActive(row: QnaRow) {
    if (!canEdit || busy) return
    const nextActive = !row.isActive
    // optimistic — สวิตช์ต้องขยับทันที ไม่งั้นผู้ใช้กดซ้ำเพราะคิดว่าไม่ติด
    setItems((prev) => prev.map((r) => (r.id === row.id ? { ...r, isActive: nextActive } : r)))
    setStats((s) => ({ ...s, active: s.active + (nextActive ? 1 : -1) }))
    try {
      const res = await fetch(`/api/shops/auto-reply/keywords/${keywordId}/qna/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: nextActive }),
      })
      if (!res.ok) throw new Error(await readError(res, 'บันทึกไม่สำเร็จ'))
      pacesToast.success(nextActive ? 'เปิดใช้งานคำถามนี้แล้ว' : 'ปิดใช้งานคำถามนี้แล้ว')
    } catch (e) {
      // ย้อนกลับให้ตรงความจริง — ปล่อยให้ค้างสถานะที่ไม่ได้บันทึกคือการโกหกผู้ใช้
      setItems((prev) => prev.map((r) => (r.id === row.id ? { ...r, isActive: row.isActive } : r)))
      setStats((s) => ({ ...s, active: s.active + (nextActive ? -1 : 1) }))
      pacesToast.error(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ')
    }
  }

  async function runBulk(action: 'ACTIVATE' | 'DEACTIVATE' | 'DELETE' | 'MOVE', targetKeywordId?: string) {
    if (!canEdit || busy || selected.size === 0) return
    const ids = [...selected]
    setBusy(true)
    try {
      const res = await fetch(`/api/shops/auto-reply/keywords/${keywordId}/qna/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qnaIds: ids, action, targetKeywordId }),
      })
      if (!res.ok) throw new Error(await readError(res, 'ทำรายการไม่สำเร็จ'))
      const result = (await res.json()) as { ok: number; failed: { id: string; reason: string }[] }

      // WARNING: ต้องอ่าน failed[] เสมอ — endpoint นี้คืน 200 แม้บางข้อทำไม่สำเร็จ
      // (ย้ายไปกลุ่มที่มีคำถามซ้ำอยู่แล้วเป็นเคสปกติ) ถ้าโชว์แต่ ok ผู้ใช้จะเข้าใจว่าครบ
      if (result.failed.length > 0) {
        pacesToast.warning(`ทำสำเร็จ ${result.ok} ข้อ · ไม่สำเร็จ ${result.failed.length} ข้อ (คำถามซ้ำในกลุ่มปลายทาง)`)
      } else {
        const verb =
          action === 'ACTIVATE'
            ? `เปิดใช้งาน ${result.ok} ข้อแล้ว`
            : action === 'DEACTIVATE'
              ? `ปิดใช้งาน ${result.ok} ข้อแล้ว`
              : action === 'DELETE'
                ? `ลบ ${result.ok} คำถามเรียบร้อย`
                : `ย้าย ${result.ok} ข้อไปกลุ่มใหม่แล้ว`
        pacesToast.success(verb)
      }
      setSelected(new Set())
      setMoveOpen(false)
      router.refresh()
    } catch (e) {
      pacesToast.error(e instanceof Error ? e.message : 'ทำรายการไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  async function confirmBulkDelete() {
    const n = selected.size
    const ok = await pacesConfirm.danger(
      `ลบ ${n} คำถามออกจากคลัง?`,
      'คำถามและคำตอบที่เลือกจะหายไปและกู้คืนไม่ได้',
      { confirmButtonText: `ลบ ${n} ข้อ` },
    )
    if (ok) await runBulk('DELETE')
  }

  async function deleteOne(row: QnaRow) {
    if (!canEdit || busy) return
    const ok = await pacesConfirm.danger(
      'ลบคำถามนี้ออกจากคลัง?',
      'คำถามและคำตอบจะหายไปและกู้คืนไม่ได้',
      { confirmButtonText: 'ลบ' },
    )
    if (!ok) return
    setBusy(true)
    try {
      const res = await fetch(`/api/shops/auto-reply/keywords/${keywordId}/qna/${row.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error(await readError(res, 'ลบไม่สำเร็จ'))
      pacesToast.success('ลบคำถามเรียบร้อย')
      router.refresh()
    } catch (e) {
      pacesToast.error(e instanceof Error ? e.message : 'ลบไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  const showEmptyLibrary = items.length === 0
  const showNoMatch = items.length > 0 && visible.length === 0

  return (
    <div className="card">
      {/* ===== card-header: ชื่อคลัง + สถิติ + ปุ่มเพิ่ม ===== */}
      <div className="card-header flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h4 className="card-title">คลังข้อมูลของกลุ่ม &ldquo;{keywordName}&rdquo;</h4>
          <p className="text-default-500 mt-1 text-xs">
            {stats.total.toLocaleString('th-TH')} ข้อ · ใช้งานอยู่ {stats.active.toLocaleString('th-TH')} ·
            ถูกใช้ตอบรวม {stats.totalUses.toLocaleString('th-TH')} ครั้ง
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => setEditing('NEW')}
            /* min-h-11 (44px): tap-target มือถือ — btn-sm สูงราว 31px ไม่พอ
               (Paces ไม่มี touch-min token, comment กำกับตาม Hard Rule 7) */
            className="btn btn-sm bg-primary hover:bg-primary-hover min-h-11 shrink-0 rounded-full text-white"
          >
            <Icon icon="plus" className="size-4" aria-hidden="true" />
            เพิ่มคำถาม
          </button>
        )}
      </div>

      {/* ===== toolbar: ค้นหา + ชิปกรอง ===== */}
      <div className="space-y-2.5 px-4 pt-3 pb-2">
        <div className="input-icon-group">
          <Icon icon="search" className="input-icon" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              resetPaging()
            }}
            type="text"
            className="form-input"
            placeholder="ค้นหาจากคำถามหรือคำตอบ"
            aria-label="ค้นหาจากคำถามหรือคำตอบ"
          />
        </div>
        {/* no-scrollbar = safepay-overrides.css; Paces ไม่มี token สำหรับแถบเลื่อนแนวนอน */}
        <div className="no-scrollbar -mx-4 overflow-x-auto px-4 whitespace-nowrap">
          <div className="inline-flex gap-2">
            {FILTER_CHIPS.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={() => {
                  setFilter(chip.key)
                  resetPaging()
                }}
                className={cn(
                  'badge cursor-pointer rounded-full border px-3 py-1 text-xs font-medium',
                  filter === chip.key
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

      {/* ===== bulk row (desktop เท่านั้น ตาม precedent BulkActionBar) ===== */}
      {canEdit && selected.size > 0 && (
        <div className="bg-primary/10 border-default-200 hidden items-center gap-2 border-y px-4 py-2 lg:flex">
          <span className="text-default-700 text-sm font-semibold">เลือกไว้ {selected.size} ข้อ</span>
          <div className="ms-auto flex flex-wrap items-center gap-2">
            <button type="button" disabled={busy} onClick={() => runBulk('ACTIVATE')} className="btn btn-sm bg-primary/15 text-primary">
              <Icon icon="check" className="size-4" aria-hidden="true" />
              เปิดใช้งาน
            </button>
            <button type="button" disabled={busy} onClick={() => runBulk('DEACTIVATE')} className="btn btn-sm bg-light text-default-700">
              <Icon icon="ban" className="size-4" aria-hidden="true" />
              ปิด
            </button>
            <button
              type="button"
              disabled={busy || otherKeywords.length === 0}
              title={otherKeywords.length === 0 ? 'ยังไม่มีกลุ่มคำอื่นให้ย้ายไป' : undefined}
              onClick={() => setMoveOpen(true)}
              className="btn btn-sm bg-light text-default-700"
            >
              <Icon icon="arrow-right" className="size-4" aria-hidden="true" />
              ย้ายไปกลุ่มอื่น
            </button>
            <button type="button" disabled={busy} onClick={confirmBulkDelete} className="btn btn-sm bg-danger/15 text-danger">
              <Icon icon="trash" className="size-4" aria-hidden="true" />
              ลบ
            </button>
          </div>
        </div>
      )}

      {/* ===== รายการ ===== */}
      {showEmptyLibrary ? (
        <div className="card-body flex flex-col items-center gap-3 py-12 text-center">
          <Icon icon="message-2-bolt" className="text-default-300 size-12" aria-hidden="true" />
          <h5 className="text-default-800 font-semibold">ยังไม่มีคำถามในคลังนี้</h5>
          <p className="text-default-500 max-w-md text-sm">
            เพิ่มคำถามที่ลูกค้ามักถามซ้ำ ๆ ไว้ล่วงหน้า หรือรอให้ระบบเก็บจากคิวคำถามที่ตอบไม่ได้ก็ได้
          </p>
          {canEdit && (
            <button type="button" onClick={() => setEditing('NEW')} className="btn bg-primary hover:bg-primary-hover min-h-11 rounded-full text-white">
              <Icon icon="plus" className="size-4" aria-hidden="true" />
              เพิ่มคำถามแรก
            </button>
          )}
          <Link href="/settings/auto-reply/unanswered" className="text-primary text-sm hover:underline">
            ไปที่คิวคำถามที่ตอบไม่ได้
          </Link>
        </div>
      ) : showNoMatch ? (
        <div className="card-body flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-default-500 text-sm">ไม่พบคำถามที่ตรงกับคำค้นหาหรือตัวกรอง</p>
          <button
            type="button"
            onClick={() => {
              setSearch('')
              setFilter('ALL')
              resetPaging()
            }}
            className="btn btn-sm bg-light text-default-700"
          >
            ล้างตัวกรอง
          </button>
        </div>
      ) : (
        <ul className="divide-default-200 divide-y">
          {canEdit && (
            <li className="text-default-500 hidden items-center gap-3 px-4 py-2 text-xs lg:flex">
              <input
                type="checkbox"
                className="form-checkbox form-checkbox-light size-4.5"
                checked={allOnPageSelected}
                onChange={toggleSelectAllOnPage}
                aria-label="เลือกทั้งหน้า"
              />
              <span>เลือกทั้งหน้า</span>
            </li>
          )}
          {paged.map((row) => (
            <li
              key={row.id}
              className={cn('flex items-start gap-3 px-4 py-3', !row.isActive && 'opacity-60')}
            >
              {canEdit && (
                <input
                  type="checkbox"
                  className="form-checkbox form-checkbox-light mt-1 hidden size-4.5 lg:block"
                  checked={selected.has(row.id)}
                  onChange={() => toggleSelect(row.id)}
                  aria-label={`เลือก ${row.question}`}
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-default-800 truncate text-sm font-medium">{row.question}</p>
                {/* คำตอบยาวผิดปกติต้องไม่ดันแถวสูง — truncate 1 บรรทัดเสมอ เห็นเต็มตอนกดแก้ */}
                <p className="text-default-400 truncate text-xs">{row.answer || 'ตอบด้วยรูปอย่างเดียว'}</p>
              </div>
              <span className="text-default-500 shrink-0 text-xs tabular-nums">
                {row.useCount.toLocaleString('th-TH')} ครั้ง
              </span>
              {canEdit && (
                <>
                  <button
                    type="button"
                    onClick={() => setEditing(row)}
                    className="btn btn-icon btn-sm bg-light text-default-700 shrink-0"
                    aria-label={`แก้ไข ${row.question}`}
                  >
                    <Icon icon="pencil" className="size-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteOne(row)}
                    className="btn btn-icon btn-sm bg-light text-danger shrink-0"
                    aria-label={`ลบ ${row.question}`}
                  >
                    <Icon icon="trash" className="size-4" aria-hidden="true" />
                  </button>
                  <input
                    type="checkbox"
                    className="form-switch form-switch-sm mt-1 shrink-0"
                    checked={row.isActive}
                    onChange={() => toggleActive(row)}
                    aria-label={row.isActive ? `ปิดใช้งาน ${row.question}` : `เปิดใช้งาน ${row.question}`}
                  />
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {visible.length > PAGE_SIZE && (
        <div className="card-footer">
          <TablePagination
            totalItems={visible.length}
            start={safePage * PAGE_SIZE + 1}
            end={Math.min((safePage + 1) * PAGE_SIZE, visible.length)}
            itemsName="ข้อ"
            previousPage={() => setPageIndex((p) => Math.max(0, p - 1))}
            canPreviousPage={safePage > 0}
            pageCount={pageCount}
            pageIndex={safePage}
            setPageIndex={setPageIndex}
            nextPage={() => setPageIndex((p) => Math.min(pageCount - 1, p + 1))}
            canNextPage={safePage < pageCount - 1}
          />
        </div>
      )}

      <p className="text-default-400 px-4 pb-4 text-xs">
        ตัวกรอง &ldquo;ไม่เคยถูกใช้&rdquo; คือตัวที่จะได้ใช้บ่อยสุด — ข้อที่กรอกไว้แล้วไม่มีใครถามเลย
        คือคำถามที่ร้านเดาเอง ไม่ใช่คำถามที่ลูกค้าถามจริง
      </p>

      {editing && (
        <QnaEditModal
          keywordId={keywordId}
          row={editing === 'NEW' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            router.refresh()
          }}
        />
      )}

      {moveOpen && (
        <MoveGroupModal
          count={selected.size}
          keywords={otherKeywords}
          busy={busy}
          onClose={() => setMoveOpen(false)}
          onMove={(targetId) => runBulk('MOVE', targetId)}
        />
      )}
    </div>
  )
}

/* ══ Modal 1 — เพิ่ม/แก้ไขคำถาม ══════════════════════════════════════════════
 * shell: fixed inset-0 + items-end (bottom sheet มือถือ) / lg:items-center (centered desktop)
 * Base: CustomerPanelSheet.tsx */
function QnaEditModal({
  keywordId,
  row,
  onClose,
  onSaved,
}: {
  keywordId: string
  row: QnaRow | null
  onClose: () => void
  onSaved: () => void
}) {
  const [question, setQuestion] = useState(row?.question ?? '')
  const [answer, setAnswer] = useState(row?.answer ?? '')
  const [isActive, setIsActive] = useState(row?.isActive ?? true)
  const [saving, setSaving] = useState(false)

  const canSave = question.trim().length > 0 && answer.trim().length > 0 && !saving

  async function save() {
    if (!canSave) return
    setSaving(true)
    try {
      const url = row
        ? `/api/shops/auto-reply/keywords/${keywordId}/qna/${row.id}`
        : `/api/shops/auto-reply/keywords/${keywordId}/qna`
      const res = await fetch(url, {
        method: row ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, answer, ...(row ? { isActive } : {}) }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? 'บันทึกไม่สำเร็จ')
      }
      pacesToast.success('บันทึกคำถามเรียบร้อย')
      onSaved()
    } catch (e) {
      pacesToast.error(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-80 flex items-end justify-center bg-black/40 lg:items-center">
      <div className="bg-card max-h-[85dvh] w-full overflow-y-auto rounded-t-2xl lg:max-h-[80dvh] lg:max-w-lg lg:rounded-2xl"> {/* HR7 carve-out: ไม่มี token viewport-height ใน Paces scale — precedent CustomerPanelSheet.tsx บรรทัดเดียวกัน */}
        <div className="border-default-200 flex items-center justify-between border-b px-4 py-3">
          <h5 className="font-semibold">{row ? 'แก้ไขคำถาม' : 'เพิ่มคำถามใหม่'}</h5>
          <button type="button" onClick={onClose} className="btn btn-icon btn-sm bg-light text-default-700" aria-label="ปิด">
            <Icon icon="x" className="size-4" aria-hidden="true" />
          </button>
        </div>
        <div className="space-y-4 px-4 py-4">
          <div>
            <label htmlFor="qna-question" className="form-label">คำถาม</label>
            <input
              id="qna-question"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="form-input"
              maxLength={500}
              placeholder="พิมพ์คำถามแบบที่ลูกค้าพิมพ์จริง"
            />
            <p className="text-default-400 mt-1 text-xs">
              ระบบจับคู่ตรงตัว 100% ตอนนี้ (ยังไม่รองรับความหมายใกล้เคียง) — พิมพ์ให้ตรงกับที่ลูกค้ามักพิมพ์จริง
            </p>
          </div>
          <div>
            <label htmlFor="qna-answer" className="form-label">คำตอบ</label>
            <textarea
              id="qna-answer"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              className="form-textarea"
              rows={4}
              maxLength={2000}
              placeholder="คำตอบนี้จะถูกส่งถึงลูกค้าตรงตัวทุกอักษร"
            />
          </div>
          {row && (
            <label className="flex items-center justify-between">
              <span className="text-default-700 text-sm">ใช้งานคำถามนี้</span>
              <input
                type="checkbox"
                className="form-switch"
                checked={isActive}
                onChange={() => setIsActive((v) => !v)}
              />
            </label>
          )}
        </div>
        <div className="border-default-200 flex justify-end gap-2 border-t px-4 py-3">
          <button type="button" onClick={onClose} className="btn bg-light text-default-700 min-h-11">
            ยกเลิก
          </button>
          <button type="button" onClick={save} disabled={!canSave} className="btn bg-primary hover:bg-primary-hover min-h-11 text-white">
            บันทึก
          </button>
        </div>
      </div>
    </div>
  )
}

/* ══ Modal 2 — ย้ายไปกลุ่มอื่น ═══════════════════════════════════════════════
 * radio-card list: ทั้งแถวคลิกได้ (label ห่อ input) — pattern จาก AccountSwitcherSheet.tsx
 * ประกอบกับ form-radio primitive ของ Paces */
function MoveGroupModal({
  count,
  keywords,
  busy,
  onClose,
  onMove,
}: {
  count: number
  keywords: OtherKeyword[]
  busy: boolean
  onClose: () => void
  onMove: (targetKeywordId: string) => void
}) {
  const [target, setTarget] = useState<string | null>(null)

  return (
    <div className="fixed inset-0 z-80 flex items-end justify-center bg-black/40 lg:items-center">
      <div className="bg-card max-h-[85dvh] w-full overflow-y-auto rounded-t-2xl lg:max-h-[80dvh] lg:max-w-md lg:rounded-2xl"> {/* HR7 carve-out: ไม่มี token viewport-height ใน Paces scale — precedent CustomerPanelSheet.tsx บรรทัดเดียวกัน */}
        <div className="border-default-200 flex items-center justify-between border-b px-4 py-3">
          <h5 className="font-semibold">ย้าย {count} ข้อไปกลุ่มอื่น</h5>
          <button type="button" onClick={onClose} className="btn btn-icon btn-sm bg-light text-default-700" aria-label="ปิด">
            <Icon icon="x" className="size-4" aria-hidden="true" />
          </button>
        </div>
        <div className="px-4 py-4">
          <p className="form-label">เลือกกลุ่มปลายทาง</p>
          <div className="border-default-200 divide-default-200 divide-y rounded-lg border">
            {keywords.map((k) => (
              <label key={k.id} className="flex cursor-pointer items-start gap-3 px-3 py-2.5">
                <input
                  type="radio"
                  name="qna-move-target"
                  className="form-radio mt-1"
                  checked={target === k.id}
                  onChange={() => setTarget(k.id)}
                />
                <span className="min-w-0 flex-1">
                  <span className="text-default-800 block truncate text-sm font-medium">{k.name}</span>
                  <span className="text-default-500 block text-xs">
                    {KEYWORD_STATUS_LABEL[k.status] ?? k.status} · {k.qnaCount.toLocaleString('th-TH')} ข้อ
                  </span>
                </span>
              </label>
            ))}
          </div>
        </div>
        <div className="border-default-200 flex justify-end gap-2 border-t px-4 py-3">
          <button type="button" onClick={onClose} className="btn bg-light text-default-700 min-h-11">
            ยกเลิก
          </button>
          <button
            type="button"
            disabled={!target || busy}
            onClick={() => target && onMove(target)}
            className="btn bg-primary hover:bg-primary-hover min-h-11 text-white"
          >
            ย้าย {count} ข้อ
          </button>
        </div>
      </div>
    </div>
  )
}
