'use client'

/**
 * OrdersExport — ปุ่ม "ส่งออก" + โมดัลเลือกขอบเขต/รูปแบบ (feature 00086)
 *
 * component เดียวใช้ทั้งตารางเดสก์ท็อปและการ์ดมือถือ (BRD FR-EXP-01) — แต่ละจอส่ง `getTokens`
 * ที่อ่านแถวจากตัวกรองชุดเดียวกับที่ render จอนั้นเอง ⇒ ไฟล์ตามตัวกรอง = จอ (FR-EXP-02)
 * เห็นเฉพาะเจ้าของร้าน (P3 · มติ user 2026-10-29) — ตัวบังคับจริงอยู่ที่ /api/orders/export
 *
 * Base (เปลือกโมดัล — dialog/backdrop/Escape/focus trap/คืน focus/ล็อก scroll):
 *   src/app/(paces)/seller/(dashboard)/orders/components/IShipImportModal.tsx
 * radio: form-radio ท่าเดียวกับ components/safepay/iship/ShipmentLinkPanel.tsx
 */

import { useEffect, useId, useRef, useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import { useLockBodyScroll } from '@/hooks/useLockBodyScroll'
import { pacesToast } from '@/lib/paces-toast'
import { EXPORT_MAX_ROWS, type ExportFormat, type ExportScope } from '@/lib/order-export-limits'
import { useViewerCan } from './OrderViewerRoles'

interface Props {
  /** publicToken ของแถวที่กรองแล้ว ตามลำดับบนจอ (ทุกหน้า ไม่ใช่เฉพาะหน้าที่แสดง) */
  getTokens: () => string[]
  filteredCount: number
  totalCount: number
  /** คำเรียกตามประเภทร้าน เช่น "คำสั่งซื้อ" — ใช้ในหัวโมดัล */
  noun: string
  className?: string
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

const fmt = (n: number) => n.toLocaleString('th-TH')

export default function OrdersExport({ getTokens, filteredCount, totalCount, noun, className = '' }: Props) {
  const canExport = useViewerCan('P3')
  const [open, setOpen] = useState(false)
  if (!canExport) return null
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`btn border-default-300 text-default-700 hover:bg-default-100 shrink-0 border ${className}`}
      >
        <Icon icon="download" className="text-sm" aria-hidden="true" />
        ส่งออก
      </button>
      {open && (
        <ExportModal
          onClose={() => setOpen(false)}
          getTokens={getTokens}
          filteredCount={filteredCount}
          totalCount={totalCount}
          noun={noun}
        />
      )}
    </>
  )
}

function ExportModal({
  onClose,
  getTokens,
  filteredCount,
  totalCount,
  noun,
}: Omit<Props, 'className'> & { onClose: () => void }) {
  const uid = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const hasFilter = filteredCount !== totalCount
  const [scope, setScope] = useState<ExportScope>(hasFilter ? 'filtered' : 'all')
  const [format, setFormat] = useState<ExportFormat>('xlsx')
  const [busy, setBusy] = useState(false)
  const count = scope === 'filtered' ? filteredCount : totalCount
  const blocked = count === 0 ? 'EMPTY' : count > EXPORT_MAX_ROWS ? 'TOO_MANY' : null
  const busyRef = useRef(false)
  busyRef.current = busy
  // onClose จากพ่อเป็นฟังก์ชันใหม่ทุก render — เก็บใน ref ไม่ให้ effect ด้านล่างรันซ้ำแล้วดึง focus กลับช่องแรก
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)[0]?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (!busyRef.current) onCloseRef.current()
        return
      }
      if (e.key !== 'Tab') return
      const nodes = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      if (!nodes || nodes.length === 0) return
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previouslyFocused?.focus()
    }
  }, [])

  useLockBodyScroll(true)

  async function download() {
    if (busy || blocked) return
    setBusy(true)
    try {
      const res = await fetch('/api/orders/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scope === 'filtered' ? { scope, format, tokens: getTokens() } : { scope, format }),
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        pacesToast.error(
          err.error === 'TOO_MANY'
            ? `เกิน ${fmt(EXPORT_MAX_ROWS)} ใบ — เลือกช่วงเวลาให้แคบลงแล้วส่งออกทีละช่วง`
            : err.error === 'EMPTY'
              ? 'ไม่มีรายการให้ส่งออก'
              : 'สร้างไฟล์ไม่สำเร็จ ลองกดอีกครั้ง ถ้ายังไม่ได้ให้รีเฟรชหน้า',
        )
        return
      }
      const blob = await res.blob()
      const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? `orders.${format}`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
      pacesToast.success(`ส่งออก ${fmt(Number(res.headers.get('X-Export-Count') ?? count))} ใบแล้ว`)
      onClose()
    } catch {
      pacesToast.error('สร้างไฟล์ไม่สำเร็จ ลองกดอีกครั้ง ถ้ายังไม่ได้ให้รีเฟรชหน้า')
    } finally {
      setBusy(false)
    }
  }

  const radioRow = 'flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-1 text-sm sm:min-h-0 sm:py-1.5'

  return (
    <div
      ref={dialogRef}
      className="bg-dark/40 fixed start-0 top-0 z-80 flex size-full items-center overflow-x-hidden overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${uid}-title`}
      tabIndex={-1}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose()
      }}
    >
      <div className="m-3 flex w-[calc(100%-24px)] items-center transition-all duration-200 ease-in-out sm:mx-auto sm:max-w-md"> {/* w-[calc(100%-24px)]: carve-out เดิมจาก IShipImportModal (Base) — เว้นขอบ 12px บนจอแคบ */}
        <div className="card pointer-events-auto flex w-full flex-col">
          <div className="card-header p-5">
            <h3 id={`${uid}-title`} className="flex items-center gap-1.5 text-sm font-medium">
              <Icon icon="download" className="text-base" aria-hidden="true" />
              ส่งออก{noun}
            </h3>
            <button type="button" aria-label="ปิด" onClick={onClose} disabled={busy}>
              <Icon icon="x" className="text-default-600 align-middle text-2xl" />
            </button>
          </div>

          <div className="card-body space-y-4 p-5">
            <fieldset>
              <legend className="text-default-800 mb-1.5 text-sm font-semibold">ขอบเขต</legend>
              {hasFilter && (
                <label className={radioRow}>
                  <input type="radio" className="form-radio" name={`${uid}-scope`} checked={scope === 'filtered'} onChange={() => setScope('filtered')} />
                  <span>
                    ตามตัวกรองที่เลือก · <span className="tabular-nums">{fmt(filteredCount)}</span> ใบ
                  </span>
                </label>
              )}
              <label className={radioRow}>
                <input type="radio" className="form-radio" name={`${uid}-scope`} checked={scope === 'all'} onChange={() => setScope('all')} />
                <span>
                  ทั้งหมดในร้าน · <span className="tabular-nums">{fmt(totalCount)}</span> ใบ
                </span>
              </label>
            </fieldset>

            <fieldset>
              <legend className="text-default-800 mb-1.5 text-sm font-semibold">รูปแบบไฟล์</legend>
              <label className={radioRow}>
                <input type="radio" className="form-radio" name={`${uid}-format`} checked={format === 'xlsx'} onChange={() => setFormat('xlsx')} />
                <Icon icon="file-spreadsheet" className="text-default-600 text-base" aria-hidden="true" />
                <span>
                  Excel (.xlsx)
                  <span className="text-default-600 block text-xs">เปิดใน Excel หรือ Google Sheets ได้ทันที</span>
                </span>
              </label>
              <label className={radioRow}>
                <input type="radio" className="form-radio" name={`${uid}-format`} checked={format === 'csv'} onChange={() => setFormat('csv')} />
                <Icon icon="file-type-csv" className="text-default-600 text-base" aria-hidden="true" />
                <span>
                  CSV (.csv)
                  <span className="text-default-600 block text-xs">ใช้นำเข้าโปรแกรมอื่น</span>
                </span>
              </label>
            </fieldset>

            {blocked && (
              <p id={`${uid}-blocked`} role="status" className="bg-warning/15 text-warning-ink mb-0 flex items-start gap-2 rounded-lg px-3 py-2 text-xs">
                <Icon icon={blocked === 'EMPTY' ? 'info-circle' : 'alert-triangle'} className="mt-0.5 shrink-0 text-sm" aria-hidden="true" />
                {blocked === 'EMPTY'
                  ? 'ไม่มีรายการให้ส่งออก'
                  : `เกิน ${fmt(EXPORT_MAX_ROWS)} ใบ — เลือกช่วงเวลาให้แคบลงแล้วส่งออกทีละช่วง`}
              </p>
            )}
          </div>

          <div className="card-footer flex justify-end gap-2.5 p-5">
            <button type="button" onClick={onClose} disabled={busy} className="btn border-default-300 text-default-700 hover:bg-default-100 border">
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={download}
              disabled={busy || !!blocked}
              aria-busy={busy}
              aria-describedby={blocked ? `${uid}-blocked` : undefined}
              className="btn bg-primary hover:bg-primary-hover text-white disabled:opacity-60"
            >
              <Icon icon={busy ? 'loader-2' : 'download'} className={busy ? 'animate-spin text-sm' : 'text-sm'} aria-hidden="true" />
              {busy ? 'กำลังสร้างไฟล์...' : 'ดาวน์โหลด'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
