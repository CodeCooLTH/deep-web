'use client'

/**
 * BulkActionBar — bubble ลอยล่าง สำหรับ action กลุ่ม เมื่อเลือกหลายออเดอร์ใน desktop table
 *
 * โผล่เมื่อ selectedRows ≥ 1: นับจำนวน + [คัดลอกลิงก์] [ส่ง SMS กลุ่ม] [× ปิด=uncheck all]
 *  - copy: public order URL ทุกอันที่เลือก แยกบรรทัด ลง clipboard
 *  - ส่ง SMS: เฉพาะออเดอร์ที่ส่งได้ (ข้าม terminal) → Sweet Alert ยืนยัน ฿N ก่อน แล้วจึงเปิด
 *    overlay แสดงความคืบหน้าระหว่าง loop ทีละ token
 *  - ปิด: onClear() = table.resetRowSelection()
 *
 * Desktop-only (scope 2026-06-15) — mobile card ไม่มี checkbox
 *
 * 00080 ext (TD-013, user 2026-10-18) — [จัดส่งแล้ว] หลายใบ: ยิง route เดี่ยวตัวเดิมทีละใบ (สิทธิ์/idempotent/แจ้งเลข
 * อยู่ที่ service ที่เดียว) · ใบที่ไม่ใช่ "รอจัดส่ง" ข้ามและบอกจำนวนในคำถาม · ไม่มีเลิกทำแบบกลุ่ม (กดทีละใบในหน้าออเดอร์)
 * [ส่งสำเร็จ] หลายใบ (user 2026-10-19) — แบบเดียวกัน ใช้ manualDeliverable (canMarkDelivered ที่ server)
 *
 * Base (button/badge/card primitive): docs/system/ui-guideline/paces-component-reference.md §1/§6/§7
 * Base (progress dialog shell): theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/categories/components/AddCategoryModal.tsx
 *   (card overlay/backdrop — controlled React state)
 *
 * เส้นแบ่งกับ Sweet Alerts (Hard Rule 8): **ขั้น "ยืนยันจะส่งไหม" เป็น blocking confirm ธรรมดา
 * จึงต้องเป็น pacesConfirm** — เดิมทั้ง 3 ขั้นถูกยัดอยู่ใน custom overlay ตัวเดียวโดยอ้างว่า
 * "multi-phase progress ไม่เหมาะกับ Swal" ซึ่งจริงแค่กับสองขั้นหลัง ไม่ใช่กับขั้นแรก
 * ตอนนี้เหลือ overlay เฉพาะ sending (progress bar ของ loop) → done (สรุปสำเร็จ/ล้มเหลว)
 * ซึ่งเป็น progress/result panel ที่ Swal ทำไม่ได้จริง
 * Base (clipboard fallback): ../[token]/components/CopyLinkButton.tsx
 * Base (ปุ่ม "พิมพ์ใบปะหน้า" feature 00022): ปุ่ม "ส่ง SMS กลุ่ม" ในไฟล์เดียวกันนี้
 *   — ใช้ primitive ชุดเดิมทั้งหมด (btn + text-white/80 + rounded-full + gap-1.5 + spinner
 *     disabled:opacity-50) ไม่ได้เพิ่ม primitive ใหม่เข้ามาใน bar นี้
 */

import Icon from '@/components/wrappers/Icon'
import type { Row as TableRow } from '@tanstack/react-table'
import Link from 'next/link'
import { useCanTopUp, useHidePayments } from '@/components/paces/PaymentRestrictionProvider'
import { INSUFFICIENT_CREDIT_TEXT, NON_OWNER_INSUFFICIENT_CREDIT_TEXT } from '@/lib/payment-copy'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { postManualStep } from '@/lib/manual-shipment-client'
import { pacesConfirm } from '@/lib/paces-swal'
import { pacesToast } from '@/lib/paces-toast'
import type { OrderRow } from './data'
import { useViewerCan } from './OrderViewerRoles'
import { useLockBodyScroll } from '@/hooks/useLockBodyScroll'

interface BulkActionBarProps {
  selectedRows: TableRow<OrderRow>[]
  onClear: () => void
  /** buyer base URL (resolve ครั้งเดียวใน OrdersTable กัน hydration mismatch) */
  buyerBaseUrl: string
  /**
   * ร้านเชื่อมต่อ iShip อยู่และเป็นร้านขายออนไลน์ (feature 00022; vertical=ONLINE_SALES ตั้งแต่ 00028)
   * false = ไม่ render ปุ่มพิมพ์ใบปะหน้าเลย — ร้านสินค้าและบริการ/บ้านพัก/ร้านที่ไม่ได้เชื่อมต่อ
   * ต้องไม่เห็นปุ่มนี้ ไม่ใช่เห็นแล้วกดไม่ได้ (BR-ISHIP-01)
   */
  ishipEnabled?: boolean
  /**
   * คำเรียกของร้าน — ส่งมาจาก OrdersTable (ร้านบริการผันเป็นงานบริการ/ลูกค้า) · ไม่ส่ง = คำเดิมของร้านขายของ
   * orderWord = "ออเดอร์" ในจำนวนนับ · linkNoun = "คำสั่งซื้อ" ในประโยคลิงก์ · buyerNoun = "ผู้ซื้อ"
   */
  orderWord?: string
  linkNoun?: string
  buyerNoun?: string
}

// terminal = ส่ง SMS ไม่ได้ (เหมือน OrderActions.tsx)
const isTerminal = (s: OrderRow['status']) => s === 'CONFIRMED' || s === 'CANCELLED'

export default function BulkActionBar({
  selectedRows,
  onClear,
  buyerBaseUrl,
  ishipEnabled = false,
  orderWord = 'ออเดอร์',
  linkNoun = 'คำสั่งซื้อ',
  buyerNoun = 'ผู้ซื้อ',
}: BulkActionBarProps) {
  // O7 ส่ง SMS · S1 พิมพ์ใบปะหน้า (พัสดุ) — ผู้ดูที่ไม่มีสิทธิ์ไม่เห็นปุ่ม
  const canSms = useViewerCan('O7')
  const canShip = useViewerCan('S1')
  const [smsDialogOpen, setSmsDialogOpen] = useState(false)
  const [printing, setPrinting] = useState(false)
  const router = useRouter()
  /** null = ว่าง · ตัวเลข = ทำไปแล้วกี่ใบ (โชว์บนปุ่มระหว่างวน) */
  const [dispatchDone, setDispatchDone] = useState<number | null>(null)
  const [deliveredDone, setDeliveredDone] = useState<number | null>(null)

  /**
   * พิมพ์ใบปะหน้าหลายใบ — เปิดแท็บใหม่ให้สั่งพิมพ์ได้ทันที
   *
   * ต้องดึงเป็น blob เองแทนที่จะ <a target="_blank"> เพราะ endpoint นี้เป็น POST
   * (ส่งรายการที่เลือกไปใน body) และเราต้องอ่าน header ที่บอกว่ารายการไหนถูกข้าม
   * FR-ISHIP-031 บังคับว่าต้องบอก ห้ามตัดทิ้งเงียบ — ถ้าเงียบ ร้านจะนึกว่าพิมพ์ครบ
   * แล้วปิดงาน จนมีกล่องที่ไม่มีใบปะหน้าไปโผล่ที่ขนส่ง
   */
  const handlePrintLabels = async () => {
    setPrinting(true)
    try {
      const res = await fetch('/api/seller/iship/labels/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderTokens: selectedRows.map((r) => r.original.shortCode || r.original.publicToken),
        }),
        cache: 'no-store',
      })

      if (!res.ok) {
        let message = 'พิมพ์ใบปะหน้าไม่สำเร็จ'
        try {
          const body = (await res.json()) as { error?: { message?: string } }
          if (body.error?.message) message = body.error.message
        } catch {
          // ใช้ข้อความ default
        }
        pacesToast.error(message)
        return
      }

      const skippedCountHeader = Number(res.headers.get('x-skipped-count') ?? '0')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank', 'noopener')
      // ปล่อย object URL หลังแท็บใหม่โหลดเสร็จ — revoke ทันทีจะทำให้แท็บว่างเปล่า
      setTimeout(() => URL.revokeObjectURL(url), 60_000)

      if (skippedCountHeader > 0) {
        const detail = res.headers.get('x-skipped-detail')
        let reason = ''
        try {
          const items = JSON.parse(decodeURIComponent(detail ?? '[]')) as { reason: string }[]
          reason = items[0]?.reason ? ` (${items[0].reason})` : ''
        } catch {
          // ไม่ต้องมีเหตุผลก็ยังต้องบอกจำนวนที่ข้าม
        }
        pacesToast.warning(`พิมพ์แล้ว แต่ข้าม ${skippedCountHeader} รายการ${reason}`)
      } else {
        pacesToast.success(`เปิดใบปะหน้า ${selectedRows.length} ใบแล้ว`)
      }
    } catch {
      pacesToast.error('พิมพ์ใบปะหน้าไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setPrinting(false)
    }
  }

  const selectedCount = selectedRows.length
  const eligibleRows = selectedRows.filter((r) => !isTerminal(r.original.status))
  const eligibleCount = eligibleRows.length
  const skippedCount = selectedCount - eligibleCount
  const visible = selectedCount > 0

  // "รอจัดส่ง" มาจาก shippingStage ที่ server คำนวณด้วยตัวตัดสินกลาง — ไม่เดาจาก status เอง
  const dispatchRows = selectedRows.filter((r) => r.original.shippingStage === 'AWAITING_DISPATCH')

  const handleBulkDispatch = async () => {
    if (dispatchDone !== null || dispatchRows.length === 0) return
    const skipped = selectedCount - dispatchRows.length
    const ok = await pacesConfirm.question(
      `บันทึกว่าจัดส่งแล้ว ${dispatchRows.length} ${orderWord}?`,
      `สถานะจะเปลี่ยนจาก "รอจัดส่ง" เป็น "กำลังจัดส่ง" · ถ้าตั้งให้แจ้งเลขพัสดุตอนกดจัดส่งแล้ว ลูกค้าจะได้รับข้อความตอนนี้${
        skipped > 0 ? `\n\nข้าม ${skipped} ${orderWord}ที่ไม่ได้อยู่ในขั้นรอจัดส่ง` : ''
      }`,
      { confirmButtonText: `จัดส่งแล้ว (${dispatchRows.length})` },
    )
    if (!ok) return
    let done = 0
    let failed = 0
    setDispatchDone(0)
    // ทีละใบ ไม่ยิงขนาน — ร้านเดียวกันแตะ ledger แจ้งเลขชุดเดียวกัน · 409/403 นับเป็นไม่สำเร็จแล้วไปใบถัดไป
    for (const row of dispatchRows) {
      try {
        const r = await postManualStep(row.original.publicToken, 'dispatch')
        if (r.kind === 'ok') done++
        else failed++
      } catch {
        failed++
      }
      setDispatchDone(done + failed)
    }
    setDispatchDone(null)
    if (failed === 0) pacesToast.success(`บันทึกจัดส่งแล้ว ${done} ${orderWord}`)
    else if (done === 0) pacesToast.error('บันทึกไม่สำเร็จ ลองกดอีกครั้ง ถ้ายังไม่ได้ให้รีเฟรชหน้า')
    else pacesToast.warning(`บันทึกจัดส่งแล้ว ${done}/${done + failed} ${orderWord} · ที่เหลือให้เปิดดูทีละใบ`)
    onClear()
    router.refresh()
  }

  // "ส่งสำเร็จ" — manualDeliverable มาจาก canMarkDelivered() ที่ server (ตัวเดียวกับหน้ารายละเอียด)
  const deliveredRows = selectedRows.filter((r) => r.original.manualDeliverable === true)

  /**
   * [ส่งสำเร็จ] หลายใบ (user 2026-10-19) — ยิง route เดี่ยวตัวเดิมทีละใบ เหมือน handleBulkDispatch
   * ย้อนกลับไม่ได้ + นับเป็นยอดขาย ⇒ ยืนยันก่อนเสมอ และบอกจำนวน COD ที่ยังไม่บันทึกรับเงินในคำถาม
   * (ทีละใบใช้ deliveredConfirmCopy แบบเตือน — หลายใบรวมไว้ในคำถามเดียว)
   */
  const handleBulkDelivered = async () => {
    if (deliveredDone !== null || deliveredRows.length === 0) return
    const skipped = selectedCount - deliveredRows.length
    const codUnpaid = deliveredRows.filter((r) => r.original.codUnpaid === true).length
    const ok = await pacesConfirm.question(
      `ยืนยันว่าส่งถึงลูกค้าแล้ว ${deliveredRows.length} ${orderWord}?`,
      `${orderWord}ที่เลือกจะเป็น "สำเร็จ" และนับเป็นยอดขาย ย้อนกลับไม่ได้ · ประวัติจะบันทึกว่าร้านเป็นผู้ปิดงาน${
        codUnpaid > 0
          ? `\n\nมี ${codUnpaid} ${orderWord}เก็บเงินปลายทางที่ยังไม่บันทึกรับเงิน — กด "ได้รับเงินปลายทางแล้ว" ทีหลังเมื่อเงินเข้า`
          : ''
      }${skipped > 0 ? `\n\nข้าม ${skipped} ${orderWord}ที่ไม่ได้อยู่ในขั้นกำลังจัดส่ง (ส่งเอง)` : ''}`,
      { confirmButtonText: `ส่งสำเร็จ (${deliveredRows.length})` },
    )
    if (!ok) return
    let done = 0
    let failed = 0
    setDeliveredDone(0)
    for (const row of deliveredRows) {
      try {
        const r = await postManualStep(row.original.publicToken, 'delivered')
        if (r.kind === 'ok') done++
        else failed++
      } catch {
        failed++
      }
      setDeliveredDone(done + failed)
    }
    setDeliveredDone(null)
    if (failed === 0) pacesToast.success(`ปิดงานแล้ว ${done} ${orderWord}`)
    else if (done === 0) pacesToast.error('บันทึกไม่สำเร็จ ลองกดอีกครั้ง ถ้ายังไม่ได้ให้รีเฟรชหน้า')
    else pacesToast.warning(`ปิดงานแล้ว ${done}/${done + failed} ${orderWord} · ที่เหลือให้เปิดดูทีละใบ`)
    onClear()
    router.refresh()
  }

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

  /**
   * ขั้นยืนยันก่อนส่ง — Sweet Alert (Hard Rule 8) ไม่ใช่ overlay ที่เขียนเอง
   *
   * ต้องบอกจำนวนที่ "ข้าม" ในคำถามด้วย ไม่ใช่บอกทีหลัง เพราะร้านตัดสินใจจากยอดเงินที่จะถูกหัก
   * (฿1/ออเดอร์) ซึ่งนับเฉพาะออเดอร์ที่ส่งได้จริง
   */
  const handleSmsClick = async () => {
    const skippedNote =
      skippedCount > 0 ? `\n\nข้าม ${skippedCount} ${orderWord}ที่เสร็จสิ้น/ยกเลิกแล้ว (ส่ง SMS ไม่ได้)` : ''
    const ok = await pacesConfirm.question(
      `ส่ง SMS ให้ ${eligibleCount} ${orderWord}?`,
      `ระบบจะส่งลิงก์${linkNoun}ทาง SMS ให้${buyerNoun}แต่ละ${orderWord} และหัก ฿${eligibleCount} จากกระเป๋าเงินของคุณ${skippedNote}`,
      { confirmButtonText: `ส่ง SMS (฿${eligibleCount})` },
    )
    if (ok) setSmsDialogOpen(true)
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
            <span className="text-xs text-white/70 font-medium text-nowrap">{orderWord}ที่เลือก</span>
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

            {canSms && (
            <button
              type="button"
              onClick={() => void handleSmsClick()}
              disabled={eligibleCount === 0}
              title={eligibleCount === 0 ? `${orderWord}ที่เลือกทั้งหมดเสร็จสิ้นแล้ว ส่ง SMS ไม่ได้` : undefined}
              className="btn bg-primary hover:bg-primary-hover text-white rounded-full inline-flex items-center gap-1.5 text-nowrap disabled:pointer-events-none disabled:opacity-50"
            >
              <Icon icon="message-forward" className="size-4.5" />
              ส่ง SMS
            </button>
            )}
          </div>

          <span className="border-l border-white/20 self-stretch my-1.5" aria-hidden="true" />

          {/* zone 3: close */}
          <div className="ps-1 pe-2">
            {canShip && dispatchRows.length > 0 && (
              <button
                type="button"
                onClick={() => void handleBulkDispatch()}
                disabled={dispatchDone !== null}
                className="btn text-white/80 hover:text-white hover:bg-white/10 rounded-full inline-flex items-center gap-1.5 text-nowrap disabled:pointer-events-none disabled:opacity-50"
              >
                <Icon icon={dispatchDone !== null ? 'loader-2' : 'truck-delivery'} className={`size-4.5 ${dispatchDone !== null ? 'animate-spin' : ''}`} />
                {dispatchDone !== null ? `กำลังบันทึก ${dispatchDone}/${dispatchRows.length}` : `จัดส่งแล้ว (${dispatchRows.length})`}
              </button>
            )}
            {/* Base: ปุ่ม "จัดส่งแล้ว" ด้านบน (primitive ชุดเดียวกันทุกตัว) */}
            {canShip && deliveredRows.length > 0 && (
              <button
                type="button"
                onClick={() => void handleBulkDelivered()}
                disabled={deliveredDone !== null}
                className="btn text-white/80 hover:text-white hover:bg-white/10 rounded-full inline-flex items-center gap-1.5 text-nowrap disabled:pointer-events-none disabled:opacity-50"
              >
                <Icon icon={deliveredDone !== null ? 'loader-2' : 'circle-check'} className={`size-4.5 ${deliveredDone !== null ? 'animate-spin' : ''}`} />
                {deliveredDone !== null ? `กำลังบันทึก ${deliveredDone}/${deliveredRows.length}` : `ส่งสำเร็จ (${deliveredRows.length})`}
              </button>
            )}
            {ishipEnabled && canShip && (
              <button
                type="button"
                onClick={handlePrintLabels}
                disabled={printing}
                className="btn text-white/80 hover:text-white hover:bg-white/10 rounded-full inline-flex items-center gap-1.5 text-nowrap disabled:pointer-events-none disabled:opacity-50"
              >
                <Icon icon="printer" className="size-4.5" />
                พิมพ์ใบปะหน้า
              </button>
            )}
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

      <BulkSmsProgressDialog
        open={smsDialogOpen}
        eligibleRows={eligibleRows}
        orderWord={orderWord}
        onComplete={() => {
          setSmsDialogOpen(false)
          onClear()
        }}
      />
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

type Phase = 'sending' | 'done'

interface BulkSmsProgressDialogProps {
  open: boolean
  eligibleRows: TableRow<OrderRow>[]
  onComplete: () => void
  orderWord: string
}

/**
 * overlay แสดงความคืบหน้าของ loop ส่ง SMS + สรุปผล — เปิดหลังผู้ใช้กดยืนยันใน Sweet Alert แล้ว
 * เท่านั้น (ขั้นยืนยันอยู่ที่ handleSmsClick ตาม Hard Rule 8) จึงเริ่มยิงทันทีที่ open
 */
function BulkSmsProgressDialog({ open, eligibleRows, onComplete, orderWord }: BulkSmsProgressDialogProps) {
  // ห้ามแสดงคำ/ลิงก์ที่พาไปจ่ายเงินเมื่ออยู่ในแอป iOS (Guideline 3.1.1)
  const hidePayments = useHidePayments()
  const canTopUp = useCanTopUp()
  const total = eligibleRows.length
  const [phase, setPhase] = useState<Phase>('sending')
  const [progress, setProgress] = useState({ sent: 0, failed: 0 })
  const [creditError, setCreditError] = useState(false)
  /**
   * กันยิงซ้ำ — effect ที่ผูกกับ `open` ถูกเรียก 2 รอบใน StrictMode (dev) และ SMS ใบละ ฿1 จริง
   * ถ้าไม่กัน ร้านจะถูกหักเงินสองเท่าโดยไม่มีอะไรบนจอบอก
   */
  const startedRef = useRef(false)

  useEffect(() => {
    if (!open) {
      startedRef.current = false
      return
    }
    if (startedRef.current) return
    startedRef.current = true
    setPhase('sending')
    setProgress({ sent: 0, failed: 0 })
    setCreditError(false)
    void handleSend()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // ปิดได้เมื่อส่งจบแล้วเท่านั้น — ระหว่างยิง loop ปิดไม่ได้ (ปิดแล้ว loop ยังวิ่งต่อ = หักเงินเงียบ)
  const dismiss = () => {
    if (phase === 'done') onComplete()
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
          // ยอดเงินไม่พอ — หยุด loop (ตัวถัด ๆ ก็จะ fail เหมือนกัน)
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

    if (credit) failed = total - sent // ที่เหลือถือว่าส่งไม่สำเร็จเพราะยอดเงินหมด
    setCreditError(credit)
    setProgress({ sent, failed })
    setPhase('done')

    if (sent === total) {
      pacesToast.success(`ส่ง SMS แล้ว ${sent} ${orderWord} หัก ฿${sent} จากยอดเงิน`)
    } else if (sent === 0) {
      pacesToast.error(credit ? 'ยอดเงินไม่พอ' : 'ส่ง SMS ล้มเหลวทั้งหมด กรุณาลองใหม่')
    } else {
      pacesToast.warning(`ส่ง SMS สำเร็จ ${sent}/${total} ${orderWord}`)
    }
  }

  // ตรึงหน้าข้างหลังขณะโมดัลเปิด — controlled modal ไม่ได้ของนี้จาก Preline (ดู useLockBodyScroll)
  useLockBodyScroll(open)

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
      <div className="ease-in-out transition-all duration-200 sm:max-w-sm w-[calc(100%-24px)] m-3 sm:mx-auto flex items-center"> {/* w-[calc(100%-24px)]: carve-out ของโครง modal — เว้นขอบ 12px (m-3) รอบโมดัลบนจอแคบ ไม่มี Paces token ให้ค่านี้; pattern เดียวกับ IShipImportModal.tsx ในโฟลเดอร์นี้ และ theme components/table/DeleteConfirmationModal.tsx */}
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
                  <p className="font-semibold text-default-800 text-base">ส่ง SMS สำเร็จ {progress.sent} {orderWord}</p>
                </>
              ) : (
                <>
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-warning/10 text-warning">
                    <Icon icon="alert-circle" className="text-3xl" />
                  </span>
                  <div>
                    <p className="font-semibold text-default-800 text-base">สำเร็จ {progress.sent} · ล้มเหลว {progress.failed} {orderWord}</p>
                    {/* 🛑 ในแอป iOS ห้ามมีลิงก์/คำที่พาไปจ่ายเงิน (Guideline 3.1.1) — บอกได้แค่
                        สาเหตุว่าทำต่อไม่ได้ ผู้ขายเห็นยอดคงเหลือจากหน้าแรก/หน้ากระเป๋าเงินอยู่แล้ว */}
                    {creditError && (
                      <p className="mt-1 text-sm text-default-500">
                        {!canTopUp ? (
                          NON_OWNER_INSUFFICIENT_CREDIT_TEXT
                        ) : hidePayments ? (
                          INSUFFICIENT_CREDIT_TEXT
                        ) : (
                          <>
                            ยอดเงินไม่พอ —{' '}
                            <Link href="/wallet" className="text-primary underline">เติมเงิน</Link>
                          </>
                        )}
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Footer */}
          <div className="flex justify-end items-center gap-x-2 border-t border-default-300 card-body">
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
