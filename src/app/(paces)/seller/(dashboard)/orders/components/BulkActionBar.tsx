'use client'

/**
 * BulkActionBar — bubble ลอยล่าง สำหรับ action กลุ่ม เมื่อเลือกหลายออเดอร์ใน desktop table
 *
 * โผล่เมื่อ selectedRows ≥ 1: นับจำนวน + [คัดลอกลิงก์] [ส่ง SMS กลุ่ม] [× ปิด=uncheck all]
 *  - copy: public order URL ทุกอันที่เลือก แยกบรรทัด ลง clipboard
 *  - ส่ง SMS: เฉพาะออเดอร์ที่ส่งได้ (ข้าม terminal) → confirm dialog แสดง ฿N ก่อนยิง (loop ทีละ token)
 *  - ปิด: onClear() = table.resetRowSelection()
 *
 * Desktop-only (scope 2026-06-15) — mobile card ไม่มี checkbox
 *
 * Base (button/badge/card primitive): docs/system/ui-guideline/paces-component-reference.md §1/§6/§7
 * Base (progress dialog shell): theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/categories/components/AddCategoryModal.tsx
 *   (card overlay/backdrop — controlled React state). หมายเหตุ: dialog นี้เป็น multi-phase progress
 *   (confirm → sending + progress bar → done breakdown) ไม่ใช่ confirm/alert ธรรมดา → คงเป็น custom
 *   card-overlay (Sweet Alerts ไม่เหมาะกับ progress loop; ดู safepay-ux Hard Rule 8 ขอบเขต = blocking alert/confirm)
 * Base (clipboard fallback): ../[token]/components/CopyLinkButton.tsx
 */

import Icon from '@/components/wrappers/Icon'
import type { Row as TableRow } from '@tanstack/react-table'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { pacesToast } from '@/lib/paces-toast'
import type { OrderRow } from './data'

interface BulkActionBarProps {
  selectedRows: TableRow<OrderRow>[]
  onClear: () => void
  /** buyer base URL (resolve ครั้งเดียวใน OrdersTable กัน hydration mismatch) */
  buyerBaseUrl: string
}

// terminal = ส่ง SMS ไม่ได้ (เหมือน OrderActions.tsx)
const isTerminal = (s: OrderRow['status']) => s === 'CONFIRMED' || s === 'CANCELLED'

export default function BulkActionBar({ selectedRows, onClear, buyerBaseUrl }: BulkActionBarProps) {
  const [smsDialogOpen, setSmsDialogOpen] = useState(false)

  const selectedCount = selectedRows.length
  const eligibleRows = selectedRows.filter((r) => !isTerminal(r.original.status))
  const eligibleCount = eligibleRows.length
  const skippedCount = selectedCount - eligibleCount
  const visible = selectedCount > 0

  const handleCopy = async () => {
    const text = selectedRows.map((r) => `${buyerBaseUrl}/o/${r.original.shortCode || r.original.publicToken}`).join('\n')
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // fallback HTTP context (ตาม CopyLinkButton)
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.focus()
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    pacesToast.success(`คัดลอก ${selectedCount} ลิงก์แล้ว`)
  }

  return (
    <>
      {/* fixed-bar centering — no Paces token (Hard Rule 7 exception) */}
      <div
        className={`fixed bottom-8 left-1/2 z-50 -translate-x-1/2 transition-all duration-200 ${
          visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0'
        }`}
        aria-hidden={!visible}
      >
        {/* dark pill bar — bg-dark ตัดกับตารางขาว เห็นชัด/CTA เด่น (ux 2026-06-15) */}
        <div className="bg-dark rounded-full shadow-lg flex items-center py-2">
          {/* zone 1: count */}
          <div className="flex items-center gap-2 ps-4 pe-3">
            <span className="badge bg-primary text-white rounded-full">{selectedCount}</span>
            <span className="text-xs text-white/70 font-medium text-nowrap">ออเดอร์ที่เลือก</span>
          </div>

          <span className="border-l border-white/20 self-stretch my-1.5" aria-hidden="true" />

          {/* zone 2: actions */}
          <div className="flex items-center gap-1.5 px-2">
            <button
              type="button"
              onClick={handleCopy}
              className="btn text-white/80 hover:text-white hover:bg-white/10 rounded-full inline-flex items-center gap-1.5 text-nowrap"
            >
              <Icon icon="copy" className="size-4.5" />
              คัดลอกลิงก์
            </button>

            <button
              type="button"
              onClick={() => setSmsDialogOpen(true)}
              disabled={eligibleCount === 0}
              title={eligibleCount === 0 ? 'ออเดอร์ที่เลือกทั้งหมดเสร็จสิ้นแล้ว ส่ง SMS ไม่ได้' : undefined}
              className="btn bg-primary hover:bg-primary-hover text-white rounded-full inline-flex items-center gap-1.5 text-nowrap disabled:pointer-events-none disabled:opacity-50"
            >
              <Icon icon="message-forward" className="size-4.5" />
              ส่ง SMS
            </button>
          </div>

          <span className="border-l border-white/20 self-stretch my-1.5" aria-hidden="true" />

          {/* zone 3: close */}
          <div className="ps-1 pe-2">
            <button
              type="button"
              onClick={onClear}
              aria-label="ยกเลิกการเลือก"
              className="btn btn-icon text-white/60 hover:bg-white/10 hover:text-danger rounded-full"
            >
              <Icon icon="x" className="size-4.5" />
            </button>
          </div>
        </div>
      </div>

      <BulkSmsConfirmDialog
        open={smsDialogOpen}
        eligibleRows={eligibleRows}
        skippedCount={skippedCount}
        onClose={() => setSmsDialogOpen(false)}
        onComplete={() => {
          setSmsDialogOpen(false)
          onClear()
        }}
      />
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

type Phase = 'confirm' | 'sending' | 'done'

interface BulkSmsConfirmDialogProps {
  open: boolean
  eligibleRows: TableRow<OrderRow>[]
  skippedCount: number
  onClose: () => void
  onComplete: () => void
}

function BulkSmsConfirmDialog({ open, eligibleRows, skippedCount, onClose, onComplete }: BulkSmsConfirmDialogProps) {
  const total = eligibleRows.length
  const [phase, setPhase] = useState<Phase>('confirm')
  const [progress, setProgress] = useState({ sent: 0, failed: 0 })
  const [creditError, setCreditError] = useState(false)

  // reset state ทุกครั้งที่เปิด dialog
  useEffect(() => {
    if (open) {
      setPhase('confirm')
      setProgress({ sent: 0, failed: 0 })
      setCreditError(false)
    }
  }, [open])

  // ปิดได้เมื่อไม่ได้กำลังส่ง; phase done → ปิด = onComplete (clear selection)
  const dismiss = () => {
    if (phase === 'sending') return
    if (phase === 'done') onComplete()
    else onClose()
  }

  // Escape ปิด dialog (ยกเว้นระหว่างส่ง)
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') dismiss()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, phase])

  const handleSend = async () => {
    setPhase('sending')
    let sent = 0
    let failed = 0
    let credit = false

    for (const row of eligibleRows) {
      try {
        // NO body — RC-8: route ดึง buyer phone เองผ่าน DAL
        const res = await fetch(`/api/orders/${row.original.publicToken}/send-sms`, { method: 'POST' })
        if (res.ok) {
          sent++
        } else if (res.status === 402) {
          // เครดิตไม่พอ — หยุด loop (ตัวถัด ๆ ก็จะ fail เหมือนกัน)
          credit = true
          break
        } else {
          failed++
        }
      } catch {
        failed++
      }
      setProgress({ sent, failed })
    }

    if (credit) failed = total - sent // ที่เหลือถือว่าส่งไม่สำเร็จเพราะเครดิตหมด
    setCreditError(credit)
    setProgress({ sent, failed })
    setPhase('done')

    if (sent === total) {
      pacesToast.success(`ส่ง SMS แล้ว ${sent} ออเดอร์ หัก ฿${sent} จากเครดิต`)
    } else if (sent === 0) {
      pacesToast.error(credit ? 'เครดิต SMS ไม่พอ' : 'ส่ง SMS ล้มเหลวทั้งหมด กรุณาลองใหม่')
    } else {
      pacesToast.warning(`ส่ง SMS สำเร็จ ${sent}/${total} ออเดอร์`)
    }
  }

  if (!open) return null

  const pct = total > 0 ? Math.round(((progress.sent + progress.failed) / total) * 100) : 0

  return (
    <div
      className="size-full fixed top-0 start-0 z-80 overflow-x-hidden overflow-y-auto bg-dark/40 flex items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bulkSmsDialogLabel"
      tabIndex={-1}
      onClick={(e) => {
        if (e.target === e.currentTarget) dismiss()
      }}
    >
      <div className="ease-in-out transition-all duration-200 sm:max-w-sm w-[calc(100%-24px)] m-3 sm:mx-auto flex items-center">
        <div className="w-full flex flex-col card pointer-events-auto">

          {/* Header */}
          <div className="card-header p-5">
            <h3 id="bulkSmsDialogLabel" className="font-medium text-sm">ส่ง SMS แบบกลุ่ม</h3>
            <button
              type="button"
              aria-label="ปิด"
              onClick={dismiss}
              disabled={phase === 'sending'}
              className="disabled:opacity-40"
            >
              <Icon icon="x" className="text-2xl align-middle text-default-600" />
            </button>
          </div>

          {/* Body */}
          {phase === 'confirm' && (
            <div className="card-body flex flex-col items-center text-center gap-4 py-6">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Icon icon="message-forward" className="text-3xl" />
              </span>
              <div>
                <p className="font-semibold text-default-800 text-base">ส่ง SMS ให้ {total} ออเดอร์?</p>
                <p className="mt-1 text-sm text-default-500">
                  ระบบจะส่งลิงก์คำสั่งซื้อทาง SMS ให้ผู้ซื้อแต่ละออเดอร์ และหัก ฿{total} จากเครดิต SMS ของคุณ
                </p>
              </div>
              {skippedCount > 0 && (
                <p className="flex items-center gap-1.5 text-xs text-warning w-full justify-center" role="alert">
                  <Icon icon="alert-triangle" className="size-4 shrink-0" />
                  ข้าม {skippedCount} ออเดอร์ที่เสร็จสิ้น/ยกเลิกแล้ว (ส่ง SMS ไม่ได้)
                </p>
              )}
            </div>
          )}

          {phase === 'sending' && (
            <div className="card-body flex flex-col items-center text-center gap-4 py-6">
              <Icon icon="loader-2" className="text-3xl text-primary animate-spin" />
              <p className="text-sm text-default-600">กำลังส่ง SMS... ({progress.sent + progress.failed}/{total})</p>
              <div className="w-full bg-default-100 rounded-full h-1.5 overflow-hidden">
                <div className="bg-primary h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )}

          {phase === 'done' && (
            <div className="card-body flex flex-col items-center text-center gap-4 py-6">
              {progress.failed === 0 ? (
                <>
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-success/10 text-success">
                    <Icon icon="circle-check" className="text-3xl" />
                  </span>
                  <p className="font-semibold text-default-800 text-base">ส่ง SMS สำเร็จ {progress.sent} ออเดอร์</p>
                </>
              ) : (
                <>
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-warning/10 text-warning">
                    <Icon icon="alert-circle" className="text-3xl" />
                  </span>
                  <div>
                    <p className="font-semibold text-default-800 text-base">สำเร็จ {progress.sent} · ล้มเหลว {progress.failed} ออเดอร์</p>
                    {creditError && (
                      <p className="mt-1 text-sm text-default-500">
                        เครดิต SMS ไม่พอ —{' '}
                        <Link href="/wallet" className="text-primary underline">เติมเครดิต</Link>
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Footer */}
          <div className="flex justify-end items-center gap-x-2 border-t border-default-300 card-body">
            {phase === 'confirm' && (
              <>
                <button type="button" className="btn bg-light hover:text-primary" onClick={onClose}>ยกเลิก</button>
                <button
                  type="button"
                  className="btn bg-primary text-white hover:opacity-90 inline-flex items-center gap-2"
                  onClick={handleSend}
                >
                  ส่ง SMS (฿{total})
                </button>
              </>
            )}
            {phase === 'sending' && (
              <button type="button" className="btn bg-light opacity-40" disabled>กำลังส่ง...</button>
            )}
            {phase === 'done' && (
              <button type="button" className="btn bg-primary text-white hover:opacity-90" onClick={onComplete}>ปิด</button>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
