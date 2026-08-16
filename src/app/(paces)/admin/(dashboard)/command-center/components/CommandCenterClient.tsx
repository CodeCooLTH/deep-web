/**
 * บอร์ดสายพานงาน AI — client island เดียวของหน้า Command Center (00049 P4.3)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/crm/pipeline/components/Board.tsx
 *       + .../PipelinePage.tsx (โครง kanban เลื่อนแนวนอน + หัวคอลัมน์พร้อมตัวนับ)
 * skeleton / error state ยึด src/app/(paces)/admin/(dashboard)/topups/components/TopUpQueueTable.tsx
 *
 * 🛑 มือถือ (<768px) เอา 7 คอลัมน์เคียงกันไม่ได้จริง — ที่ 320px เนื้อที่ = 280px แต่ป้าย+ตัวนับ
 *    รวม ~700–770px (เกิน 2.5 เท่า) ⇒ แถบแท็บ pill เลื่อนแนวนอน + รายการแนวตั้งใต้แท็บที่เลือก
 *    (UX spec §2.3) · แท็บ "รอเคาะ" ถูกเลือกเป็นค่าเริ่มต้น
 */

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import Icon from '@/components/wrappers/Icon'
// 🛑 HR9: toast ใน (paces)/** ต้องผ่าน pacesToast เท่านั้น ห้าม react-toastify
import { pacesToast } from '@/lib/paces-toast'
import { pacesConfirm, pacesConfirmWithText } from '@/lib/paces-swal'
import { relativeTimeTh } from '@/lib/relative-time-th'
import {
  countAwaitingApproval,
  STAGE_COLUMNS,
  type BoardItem,
  type BoardResponse,
  type HeartbeatResponse,
  type Stage,
} from '@/lib/command-center'
import ItemCard from './ItemCard'
import NewTaskModal from './NewTaskModal'

const POLL_MS = 20_000

export default function CommandCenterClient() {
  const [board, setBoard] = useState<BoardResponse | null>(null)
  const [heartbeat, setHeartbeat] = useState<HeartbeatResponse | null>(null)
  /** null = ยังไม่เคยโหลดสำเร็จเลย ⇒ บล็อกทั้งหน้า · string = ข้อความ error ล่าสุด */
  const [fatal, setFatal] = useState<string | null>(null)
  const [fetchedAt, setFetchedAt] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<Stage>('ready')
  const [busy, setBusy] = useState<number | null>(null)
  const [showNew, setShowNew] = useState(false)
  /** บังคับ re-render ทุกนาที ให้ "ค้างขั้นนี้ X" กับ "รีเฟรชล่าสุด" เดินเองโดยไม่ต้องยิง API */
  const [, setTick] = useState(0)

  const loadingRef = useRef(false)

  const load = useCallback(async () => {
    // กันยิงซ้อนตอน poll ชนกับการกดปุ่ม — ไม่ใช้ state เพราะต้องอ่านค่าล่าสุดในทันที
    if (loadingRef.current) return
    loadingRef.current = true
    try {
      const [b, h] = await Promise.all([
        fetch('/api/admin/command-center/board', { cache: 'no-store' }),
        fetch('/api/admin/command-center/heartbeat', { cache: 'no-store' }),
      ])

      if (b.ok) {
        setBoard(await b.json())
        setFatal(null)
        setFetchedAt(Date.now())
      } else {
        const body = await b.json().catch(() => null)
        setFatal(body?.error ?? 'อ่านข้อมูลจาก GitHub ไม่สำเร็จตอนนี้ — ระบบจะลองใหม่อัตโนมัติ')
      }

      // 🛑 heartbeat ล้มไม่บล็อกหน้า — เป็นข้อมูลรอง (UX spec §7)
      setHeartbeat(h.ok ? await h.json() : null)
    } catch {
      setFatal('อ่านข้อมูลจาก GitHub ไม่สำเร็จตอนนี้ — ระบบจะลองใหม่อัตโนมัติ')
    } finally {
      loadingRef.current = false
    }
  }, [])

  useEffect(() => {
    void load()
    const id = setInterval(() => void load(), POLL_MS)
    return () => clearInterval(id)
    // 🛑 dep เฉพาะ `load` ที่เป็น useCallback([]) — ห้ามใส่ state ที่ effect นี้ setState เอง
    //    ไม่งั้นได้ลูปยิง API ไม่หยุด (docs/conventions/hook-return-identity-in-deps.md)
  }, [load])

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 60_000)
    return () => clearInterval(id)
  }, [])

  async function act(
    item: BoardItem,
    path: string,
    body: Record<string, unknown> | null,
    okMessage: string,
  ) {
    setBusy(item.number)
    try {
      const res = await fetch(`/api/admin/command-center/items/${item.number}/${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      })
      const payload = await res.json().catch(() => null)
      if (!res.ok) {
        pacesToast.error(payload?.error ?? 'ทำรายการไม่สำเร็จ ลองใหม่อีกครั้ง')
        return
      }
      pacesToast.success(okMessage)
      await load()
    } catch {
      pacesToast.error('ทำรายการไม่สำเร็จ ลองใหม่อีกครั้ง')
    } finally {
      setBusy(null)
    }
  }

  async function onApprove(item: BoardItem) {
    const ok = await pacesConfirm({
      title: 'ยืนยันติดป้าย "พร้อมขึ้น"?',
      // บอกผลจริงที่จะเกิด ไม่ใช่คำสั่งเปล่า — กดแล้วของขึ้น prod เองเมื่อด่านผ่านครบ
      text: `PR #${item.number} จะถูก merge และขึ้น prod อัตโนมัติเมื่อด่านทุกด่านผ่าน`,
      confirmButtonText: 'เคาะเลย',
    })
    if (ok) await act(item, 'approve', null, `เคาะ #${item.number} แล้ว`)
  }

  async function onReject(item: BoardItem) {
    const reason = await pacesConfirmWithText({
      title: `ตีกลับใบงาน #${item.number}?`,
      html: 'ใบงานจะกลับไปขั้น "เขียนโค้ด" พร้อมเหตุผลที่คุณเขียน',
      placeholder: 'บอกสิ่งที่ต้องแก้ ไม่ใช่แค่สิ่งที่ผิด',
      validationMessage: 'กรุณาระบุเหตุผลก่อนตีกลับ',
      confirmButtonText: 'ตีกลับ',
      maxLength: 2000,
    })
    if (reason) await act(item, 'reject', { reason }, `ตีกลับ #${item.number} แล้ว`)
  }

  async function onStop(item: BoardItem) {
    const ok = await pacesConfirm.danger(
      `หยุดใบงาน #${item.number}?`,
      'ป้ายขั้นทั้งหมดจะถูกถอด ใบงานจะหายจากบอร์ดแต่ยังอยู่บน GitHub',
      { confirmButtonText: 'หยุดงาน' },
    )
    if (ok) await act(item, 'stop', null, `หยุด #${item.number} แล้ว`)
  }

  /* ── สถานะรวม ────────────────────────────────────────────── */

  const q = query.trim().toLowerCase()
  const columns = (board?.columns ?? []).map((c) => ({
    ...c,
    items: q
      ? c.items.filter(
          (i) => i.title.toLowerCase().includes(q) || String(i.number).includes(q),
        )
      : c.items,
  }))

  // 🛑 เลขนี้กับปุ่มบนการ์ดมาจาก symbol เดียวกัน — นับเฉพาะใบที่ยังไม่ถูกเคาะ
  //    (ถ้านับทั้งคอลัมน์ เลขจะไม่ลดหลังกด แล้วผู้ใช้จะกดซ้ำใบเดิม)
  const awaiting = countAwaitingApproval(board?.columns ?? [])
  const hermesDown = heartbeat?.watchdogIssue.open === true

  /* ── จอที่ยังไม่มีข้อมูลเลย ────────────────────────────────── */

  if (fatal && !board) {
    return (
      <>
        <PageBreadcrumb title="สายพานงาน AI" />
        <div className="card">
          <div className="flex flex-col items-center gap-3 p-10 text-center">
            <Icon icon="cloud-off" className="size-10 text-danger-ink" />
            <p className="text-sm text-danger-ink">{fatal}</p>
          </div>
        </div>
      </>
    )
  }

  const loading = !board

  return (
    <>
      <PageBreadcrumb
        title="สายพานงาน AI"
        action={
          <button
            type="button"
            onClick={() => setShowNew(true)}
            className="btn bg-primary text-white hover:bg-primary-hover">
            <Icon icon="plus" className="me-1 size-4" />
            สั่งงานใหม่
          </button>
        }
      />

      {/* ── แถบสถานะบน — เด่นที่สุดในหน้าตาม requirement ── */}
      <div className={`card mb-4 ${hermesDown ? 'bg-danger/15' : ''}`}>
        <div className="flex flex-wrap items-center justify-between gap-4 p-4">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={`size-2 shrink-0 rounded-full ${hermesDown ? 'bg-danger' : 'bg-success'}`}
            />
            <p className={`text-sm ${hermesDown ? 'text-danger-ink' : 'text-default-700'}`}>
              {hermesDown
                ? 'เครื่อง Hermes ขาดการติดต่อ — งานจะไม่เดินจนกว่าจะกลับมา'
                : heartbeat?.lastHeartbeatAt
                  ? `Hermes: ทำงานล่าสุด ${relativeTimeTh(new Date(heartbeat.lastHeartbeatAt).getTime())}`
                  : 'Hermes: ยังไม่เคยรายงานชีพจร'}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {awaiting === 0 ? (
              <span className="flex items-center gap-2 text-sm text-default-700">
                <Icon icon="circle-check" className="size-5 text-success" />
                ไม่มีงานรอเคาะ
              </span>
            ) : (
              <>
                <span className="text-sm text-default-700">รอเคาะ</span>
                <span className="text-3xl font-bold tabular-nums text-primary-ink">{awaiting}</span>
                <button
                  type="button"
                  onClick={() => setTab('ready')}
                  className="text-sm text-primary hover:underline">
                  ดู
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* โควตาหมดแต่ยังมีข้อมูลเก่า — ต้องบอกว่าข้อมูลเป็นของเมื่อไหร่
          (partial-data-must-be-labeled-or-filled.md — เลขที่ดูเหมือนสดแต่ไม่สด อันตรายกว่าไม่มีเลข) */}
      {board?.degraded && (
        <div className="card mb-4 bg-warning/15">
          <div className="flex items-start gap-2 p-3">
            <Icon icon="alert-triangle" className="mt-0.5 size-4 shrink-0 text-warning-ink" />
            <p className="text-sm text-warning-ink">
              โควตาเรียก GitHub หมดชั่วคราว — ข้อมูลด้านล่างเป็นของ{' '}
              {board.degradedSince ? relativeTimeTh(new Date(board.degradedSince).getTime()) : 'ก่อนหน้านี้'}{' '}
              จะลองใหม่อัตโนมัติ
            </p>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header flex-nowrap items-center justify-between gap-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาหัวข้อ…"
            aria-label="ค้นหาหัวข้องาน"
            className="form-input max-w-xs"
          />
          {/* ไม่มีปุ่ม refresh แมนนวล — ซ้ำกับ auto-poll ที่ทำงานอยู่แล้ว (UX spec §3) */}
          <span className="shrink-0 text-xs text-default-500">
            {fetchedAt ? `รีเฟรชล่าสุด ${relativeTimeTh(fetchedAt)}` : 'กำลังโหลด…'}
          </span>
        </div>

        {/* ── มือถือ: แท็บ pill เลื่อนแนวนอน ── */}
        <div className="flex gap-2 overflow-x-auto px-4 pb-3 md:hidden">
          {STAGE_COLUMNS.map((c) => {
            const col = columns.find((x) => x.stage === c.stage)
            const active = tab === c.stage
            return (
              <button
                key={c.stage}
                type="button"
                onClick={() => setTab(c.stage)}
                className={`badge shrink-0 whitespace-nowrap px-3 py-2 ${
                  active ? 'bg-primary text-white' : 'bg-default-100 text-default-700'
                }`}>
                {c.label} {col?.items.length ?? 0}
              </button>
            )
          })}
        </div>

        <div className="p-4 pt-0">
          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-20 animate-pulse rounded-lg bg-default-100" />
              ))}
            </div>
          ) : (
            <>
              {/* มือถือ: คอลัมน์เดียวตามแท็บที่เลือก */}
              <div className="md:hidden">
                <ColumnBody
                  items={columns.find((c) => c.stage === tab)?.items ?? []}
                  busy={busy}
                  onApprove={onApprove}
                  onReject={onReject}
                  onStop={onStop}
                />
              </div>

              {/* เดสก์ท็อป/แท็บเล็ต: 7 คอลัมน์เลื่อนแนวนอน — ready ขวาสุดตามสายพานจริง */}
              <div className="hidden gap-3 overflow-x-auto md:flex">
                {columns.map((c) => (
                  <div
                    key={c.stage}
                    className={`w-64 shrink-0 rounded-lg p-2 ${
                      c.stage === 'ready' ? 'border-s-3 border-primary bg-default-50' : 'bg-default-50'
                    }`}>
                    <div className="mb-2 px-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-default-900">
                          {c.label}
                        </span>
                        <span className="shrink-0 text-sm tabular-nums text-default-500">
                          {c.items.length}
                        </span>
                      </div>
                      {c.agent && (
                        <span className="block truncate text-xs text-default-500">{c.agent}</span>
                      )}
                    </div>
                    <ColumnBody
                      items={c.items}
                      busy={busy}
                      onApprove={onApprove}
                      onReject={onReject}
                      onStop={onStop}
                    />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {showNew && (
        <NewTaskModal
          onClose={() => setShowNew(false)}
          onCreated={(created) => {
            setShowNew(false)
            pacesToast.success(`สั่งงานแล้ว — ใบงาน #${created.number}`)
            void load()
          }}
        />
      )}
    </>
  )
}

function ColumnBody({
  items,
  busy,
  onApprove,
  onReject,
  onStop,
}: {
  items: BoardItem[]
  busy: number | null
  onApprove: (i: BoardItem) => void
  onReject: (i: BoardItem) => void
  onStop: (i: BoardItem) => void
}) {
  if (items.length === 0) {
    // ข้อความเรียบกลางคอลัมน์ ไม่มีภาพประกอบใหญ่ (UX spec §7) — คอลัมน์ว่างคือเรื่องปกติ
    return <p className="py-6 text-center text-xs text-default-500">ไม่มีใบงาน</p>
  }
  return (
    <>
      {items.map((item) => (
        <ItemCard
          key={item.number}
          item={item}
          busy={busy === item.number}
          onApprove={onApprove}
          onReject={onReject}
          onStop={onStop}
        />
      ))}
    </>
  )
}
