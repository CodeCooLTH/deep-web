'use client'

/**
 * RecordPaymentSheet — บันทึก "รับเงินแล้ว" ของออเดอร์หนึ่งใบ + ดู/ยกเลิกประวัติ (feature 00050)
 *
 * หัวหน้าสั่งตรง ๆ (2026-08-15): *"มี action ให้ admin กดง่ายๆ ที่หน้า chat"* — ก่อนหน้านี้ระบบ
 * รู้แค่ว่า *ควรเก็บ* มัดจำเท่าไร (`Order.depositAmount`) ไม่มีที่บันทึกว่า **ได้รับแล้ว**
 *
 * ## ทำไมมีประวัติ + ปุ่มยกเลิกอยู่ในชีตเดียวกัน
 *
 * กฎของฟีเจอร์นี้คือ **"จ่ายมาแล้ว แก้ไม่ได้"** (หัวหน้ายืนยันเอง) ⇒ ไม่มีปุ่มแก้ยอด
 * ถ้าไม่มีทาง **ยกเลิกรายการ** อยู่ตรงนี้ด้วย กฎนั้นจะกลายเป็น "กรอกผิดแล้วจบเลย" ซึ่งเป็น
 * ทางตันที่ผู้ใช้ต้องโทรหาแอดมิน — คลาสเดียวกับบัญชี Apple ที่ค้างเมื่อ 2026-08-15
 * (`known-limitation-vs-unfinished.md`: ข้อจำกัดที่กินเคสที่ฟีเจอร์ถูกสร้างมาเพื่อแก้ = ยังไม่เสร็จ)
 *
 * วางที่ `(chat)/_components` เพราะจะถูกเรียกจากทั้งแถบมือถือ (`OrderProgressBar`) และแผงขวา
 * เดสก์ท็อป (`CustomerPanel`) — และวันหน้าน่าจะจากหน้า `/orders/[token]` ด้วย
 *
 * Base (เปลือกชีต + focus trap + แยก error retryable): ./AppointmentSummarySheet.tsx
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import Icon from '@/components/wrappers/Icon'
import { useLockBodyScroll } from '@/hooks/useLockBodyScroll'
import { pacesToast } from '@/lib/paces-toast'
import { pacesConfirmWithReason } from '@/lib/paces-swal'
import { formatDateTimeTH } from '@/lib/format-date'
import {
  ORDER_PAYMENT_KIND_LABEL,
  ORDER_PAYMENT_METHOD_LABEL,
  suggestedPayment,
  type OrderMoney,
  type OrderPaymentKind,
  type OrderPaymentMethod,
} from '@/lib/order-payment'
import { VOID_PAYMENT_REASONS, checkPaymentAmount } from '@/lib/chat-order-actions'

/** แถวประวัติที่ `GET /api/orders/[token]/payments` คืนมา */
interface PaymentHistoryRow {
  id: string
  kind: string
  amount: string
  method: string
  slipFileId: string | null
  note: string | null
  receivedAt: string
  voidedAt: string | null
  voidedReason: string | null
}

export interface RecordPaymentSheetProps {
  open: boolean
  onClose: () => void
  /** ออเดอร์ที่กำลังรับเงิน */
  orderToken: string
  /** ป้ายที่ผู้ใช้เห็น (เลขคำสั่งซื้อ) — กันกดผิดใบตอนมีหลายใบในเธรดเดียว */
  orderLabel: string
  /**
   * ร้านของเธรดนี้ — ส่งต่อเป็น `?shopId=`
   *
   * 🛑 ห้ามปล่อยให้ server เดาจาก `activeShopId`: กล่องแชทเปิดเธรดของร้าน B ได้ขณะ active
   * อยู่ร้าน A (BR-UNI-07) ⇒ จะได้ปุ่มที่กดกี่ครั้งก็ไม่ผ่าน (บทเรียน iShip retry 2026-08-06)
   */
  shopId: string | null
  /** สถานะเงิน ณ ตอนเปิด — คำนวณจากข้อมูลที่ server ส่งมากับออเดอร์แล้ว ไม่ต้องยิงซ้ำ */
  money: OrderMoney
  /**
   * สลิปจากแชทที่จะแนบไปกับก้อนนี้ (feature 00050) — `Media.fileId` ของรูปที่กดค้างมา
   *
   * 🛑 **แนบสลิป ≠ ได้รับเงิน** — ค่านี้เป็นแค่ *หลักฐานประกอบ* ที่ผูกไปกับแถวเงิน คนยังต้อง
   * กดยืนยันยอดเองอยู่ดี (มติหัวหน้า 2026-08-15 ข้อ 1) ⇒ ห้ามใช้ค่านี้ข้ามขั้นตอนยืนยัน
   */
  initialSlipFileId?: string | null
  /** ยิงเมื่อมีการเปลี่ยนแปลงเงิน (บันทึก/ยกเลิก) — ผู้เรียกต้อง refresh ข้อมูลของตัวเอง */
  onChanged?: (money: OrderMoney) => void
}

const KIND_OPTIONS: { value: OrderPaymentKind; icon: string }[] = [
  { value: 'DEPOSIT', icon: 'coin' },
  { value: 'BALANCE', icon: 'cash' },
]

const METHOD_OPTIONS: { value: OrderPaymentMethod; icon: string }[] = [
  { value: 'TRANSFER', icon: 'building-bank' },
  { value: 'CASH', icon: 'cash-banknote' },
  { value: 'OTHER', icon: 'dots' },
]

const NOTE_MAX = 200

const baht = (n: number) =>
  `฿${n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function RecordPaymentSheet({
  open,
  onClose,
  orderToken,
  orderLabel,
  shopId,
  money: initialMoney,
  initialSlipFileId = null,
  onChanged,
}: RecordPaymentSheetProps) {
  useLockBodyScroll(open)

  const [money, setMoney] = useState<OrderMoney>(initialMoney)
  const [kind, setKind] = useState<OrderPaymentKind>('BALANCE')
  const [amountText, setAmountText] = useState('')
  const [method, setMethod] = useState<OrderPaymentMethod>('TRANSFER')
  const [note, setNote] = useState('')
  /** สลิปที่จะแนบไปกับก้อนนี้ — ถอดออกได้ (แนบมาผิดใบเป็นเรื่องที่เกิดจริง) */
  const [slipFileId, setSlipFileId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [history, setHistory] = useState<PaymentHistoryRow[] | null>(null)
  /** แยก "ลองใหม่มีโอกาส" (เน็ต/5xx) ออกจาก "server ตัดสินแล้ว" (4xx) — Base ทำแบบเดียวกัน */
  const [historyError, setHistoryError] = useState<{ message: string; retryable: boolean } | null>(null)
  const [voidingId, setVoidingId] = useState<string | null>(null)

  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const restoreRef = useRef<HTMLElement | null>(null)

  const qs = shopId ? `?shopId=${encodeURIComponent(shopId)}` : ''

  /**
   * ตั้งค่าตั้งต้นทุกครั้งที่ **เปิด** — ไม่ใช่ครั้งเดียวตอน mount
   *
   * ชีตนี้ถูก render ค้างไว้โดยผู้เรียกได้ (การ์ดหลายใบใช้ instance เดียวกัน) ⇒ ถ้าตั้งค่าตอน
   * mount อย่างเดียว เปิดใบที่สองจะได้ยอดที่เสนอของใบแรกติดมา ซึ่งเป็นตัวเลขที่ "ดูถูก" พอที่
   * จะไม่มีใครเอะใจ
   */
  useEffect(() => {
    if (!open) return
    const s = suggestedPayment(initialMoney)
    setMoney(initialMoney)
    setKind(s.kind)
    setAmountText(s.amount > 0 ? String(s.amount) : '')
    setMethod('TRANSFER')
    setNote('')
    setSlipFileId(initialSlipFileId)
  }, [open, initialMoney, initialSlipFileId])

  const loadHistory = useCallback(async () => {
    setHistory(null)
    setHistoryError(null)
    try {
      const res = await fetch(`/api/orders/${orderToken}/payments${qs}`, { cache: 'no-store' })
      const json: unknown = await res.json().catch(() => ({}))
      if (!res.ok) {
        setHistoryError({
          message: (json as { error?: string }).error ?? 'โหลดประวัติการรับเงินไม่สำเร็จ',
          retryable: res.status >= 500,
        })
        return
      }
      setHistory(((json as { payments?: PaymentHistoryRow[] }).payments ?? []))
    } catch {
      setHistoryError({ message: 'โหลดประวัติการรับเงินไม่สำเร็จ', retryable: true })
    }
  }, [orderToken, qs])

  useEffect(() => {
    if (!open) return
    void loadHistory()
  }, [open, loadHistory])

  useEffect(() => {
    if (!open) return
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving && !voidingId) onClose()
    }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [open, onClose, saving, voidingId])

  /**
   * โฟกัส: ย้ายเข้า · ขังไว้ · คืนที่เดิมตอนปิด
   *
   * 🛑 `aria-modal="true"` บอก screen reader ว่าข้างหลังไม่มีอยู่ แต่ไม่ได้ทำอะไรกับคีย์บอร์ดเลย
   * ถ้าไม่มีบล็อกนี้ ผู้ใช้คีย์บอร์ดจะ Tab ทะลุออกไปหน้าที่ตัวเองมองไม่เห็นแล้ว
   */
  useEffect(() => {
    if (!open) return
    restoreRef.current = document.activeElement as HTMLElement | null
    // โฟกัสปุ่มปิด ไม่ใช่ช่องยอดเงิน — ปุ่มแรกที่คีย์บอร์ดแตะต้องเป็นทางออก
    const t = setTimeout(() => closeRef.current?.focus(), 0)
    const onTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !panelRef.current) return
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onTab)
    return () => {
      clearTimeout(t)
      document.removeEventListener('keydown', onTab)
      restoreRef.current?.focus?.()
    }
  }, [open])

  const amount = Number(amountText)
  const check = useMemo(() => checkPaymentAmount({ amount, kind, money }), [amount, kind, money])

  const applyMoney = useCallback(
    (next: OrderMoney) => {
      setMoney(next)
      onChanged?.(next)
    },
    [onChanged],
  )

  async function handleSave() {
    if (check.blocking || saving) return
    setSaving(true)
    try {
      const res = await fetch(`/api/orders/${orderToken}/payments${qs}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind,
          amount,
          method,
          slipFileId,
          note: note.trim() || null,
        }),
      })
      const json: unknown = await res.json().catch(() => ({}))
      if (!res.ok) {
        pacesToast.error(errorText((json as { error?: string }).error))
        return
      }
      const next = (json as { money?: OrderMoney }).money
      if (next) applyMoney(next)
      pacesToast.success(`บันทึกรับเงิน ${baht(amount)} แล้ว`)
      void loadHistory()
      // ตั้งค่าตั้งต้นรอบใหม่จากยอดที่เพิ่งอัปเดต — ร้านมักรับเงินสองก้อนติดกัน (มัดจำแล้วส่วนที่เหลือ)
      if (next) {
        const s = suggestedPayment(next)
        setKind(s.kind)
        setAmountText(s.amount > 0 ? String(s.amount) : '')
        setNote('')
        // 🛑 ล้างสลิป: ก้อนถัดไปเป็นเงินคนละก้อน แนบสลิปใบเดิมซ้ำ = หลักฐานที่โกหก
        setSlipFileId(null)
      }
    } catch {
      pacesToast.error('บันทึกไม่สำเร็จ ตรวจสอบสัญญาณแล้วลองใหม่')
    } finally {
      setSaving(false)
    }
  }

  async function handleVoid(row: PaymentHistoryRow) {
    const reason = await pacesConfirmWithReason({
      title: 'ยกเลิกรายการรับเงิน',
      html: `${ORDER_PAYMENT_KIND_LABEL[row.kind as OrderPaymentKind] ?? row.kind} ${baht(Number(row.amount))} · ${formatDateTimeTH(row.receivedAt)}<br>รายการจะยังอยู่ในประวัติพร้อมเหตุผล ไม่ได้ถูกลบ`,
      options: VOID_PAYMENT_REASONS,
      validationMessage: 'เลือกเหตุผลก่อน',
      confirmButtonText: 'ยกเลิกรายการนี้',
      cancelButtonText: 'ไม่ใช่ตอนนี้',
    })
    if (!reason) return

    setVoidingId(row.id)
    try {
      const res = await fetch(`/api/orders/${orderToken}/payments/${row.id}${qs}`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      const json: unknown = await res.json().catch(() => ({}))
      if (!res.ok) {
        pacesToast.error(errorText((json as { error?: string }).error))
        return
      }
      const next = (json as { money?: OrderMoney }).money
      if (next) applyMoney(next)
      pacesToast.success('ยกเลิกรายการแล้ว')
      void loadHistory()
    } catch {
      pacesToast.error('ยกเลิกไม่สำเร็จ ตรวจสอบสัญญาณแล้วลองใหม่')
    } finally {
      setVoidingId(null)
    }
  }

  if (!open) return null

  const busy = saving || voidingId !== null

  return (
    <div
      className="fixed inset-0 z-90 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pay-sheet-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose()
      }}
    >
      <div
        ref={panelRef}
        /* `max-h-full` พอแล้ว ไม่ต้อง `sm:max-h-[90vh]`: กล่องนอกเป็น `inset-0` + `sm:p-4`
           ⇒ 100% ของมันคือความสูงจอลบระยะขอบอยู่แล้ว และ `min-h-0 flex-1` ที่เนื้อในทำให้
           ส่วนที่เลื่อนได้หดเอง (ประวัติยาวไม่ดันชีตทะลุจอ) — ชุดเดียวกับ Base เป๊ะ */
        className="card bg-card flex h-full max-h-full w-full flex-col rounded-b-none sm:h-auto sm:rounded-lg sm:max-w-lg"
      >
        <div className="card-header flex flex-nowrap items-center justify-between gap-2">
          <h5 id="pay-sheet-title" className="mb-0 flex min-w-0 grow items-center gap-2 text-base">
            <Icon icon="cash-banknote" className="text-primary shrink-0 text-lg" />
            {/* เลขคำสั่งซื้ออยู่บนหัว — เธรดเดียวมีได้หลายใบ กดผิดใบแล้วเงินไปผิดที่ */}
            <span className="truncate">รับเงิน · {orderLabel}</span>
          </h5>
          {/* size-11! = 44px — `.btn.btn-icon` ของธีมเป็น 37px และบนมือถือชีตนี้เต็มจอ
              (ไม่มีฉากหลังให้แตะ) ปุ่มนี้จึงเป็นทางออกเดียว */}
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="ปิด"
            className="btn btn-icon text-default-700 hover:bg-default-100 size-11! shrink-0"
          >
            <Icon icon="x" className="text-lg" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4">
          {/* ── สรุปยอด ── ตัวเลขทั้งหมดมาจาก computeOrderMoney ตัวเดียว ไม่บวกเองที่นี่ (HR16) */}
          <section className="bg-default-100 rounded-lg p-3">
            <dl className="mb-0 grid grid-cols-3 gap-2 text-center">
              <div>
                <dt className="text-default-600 text-xs">ยอดรวม</dt>
                <dd className="text-default-900 mb-0 text-sm font-semibold tabular-nums">
                  {baht(money.totalAmount)}
                </dd>
              </div>
              <div>
                <dt className="text-default-600 text-xs">รับแล้ว</dt>
                <dd className="text-success-ink mb-0 text-sm font-semibold tabular-nums">
                  {baht(money.totalReceived)}
                </dd>
              </div>
              <div>
                <dt className="text-default-600 text-xs">ค้าง</dt>
                <dd
                  className={`mb-0 text-sm font-semibold tabular-nums ${
                    money.outstanding > 0 ? 'text-warning-ink' : 'text-default-900'
                  }`}
                >
                  {baht(money.outstanding)}
                </dd>
              </div>
            </dl>
            {money.hasDeposit && (
              /* บอกยอดที่ "ตกลงไว้" แยกจากที่ "รับแล้ว" เสมอ — สองคำนี้คือทั้งหมดที่ BR-SQ-02 ป้องกัน */
              <p className="text-default-600 mb-0 mt-2 border-t border-dashed pt-2 text-center text-xs">
                มัดจำที่ตกลงไว้ {baht(money.depositAgreed)} · รับแล้ว {baht(money.depositReceived)}
              </p>
            )}
          </section>

          {/* ── ประเภทเงิน ── */}
          <section>
            <p className="text-default-700 mb-2 text-xs font-semibold">บันทึกเป็น</p>
            <div className="flex gap-2" role="group" aria-label="ประเภทเงินที่รับ">
              {KIND_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setKind(o.value)}
                  aria-pressed={kind === o.value}
                  className={`btn min-h-11 flex-1 items-center justify-center gap-2 ${
                    kind === o.value
                      ? 'bg-primary hover:bg-primary-hover text-white'
                      : 'bg-default-100 text-default-800 hover:bg-default-200'
                  }`}
                >
                  <Icon icon={o.icon} className="text-base" aria-hidden="true" />
                  {ORDER_PAYMENT_KIND_LABEL[o.value]}
                </button>
              ))}
            </div>
          </section>

          {/* ── ยอดเงิน ── */}
          <section>
            <label htmlFor="pay-amount" className="text-default-700 mb-2 block text-xs font-semibold">
              ยอดเงินที่รับ
            </label>
            {/* 🛑 `min-h-11` ไม่ใช่ `h-11` — `_forms.css` ไม่ได้ห่อ `@layer` ⇒ `.form-input`
                (`h-11 lg:h-9.25`) ชนะ utility ที่ตั้ง `height` แต่แพ้คนละ property
                และ `lg:` เป็น viewport query ไม่ใช่ container ⇒ ชีต `sm:max-w-lg` บนจอกว้าง
                จะได้ช่องสูง 37px ทั้งที่นิ้วมีที่แตะเท่ามือถือ (`unlayered-css-beats-utilities.md`) */}
            <input
              id="pay-amount"
              type="number"
              inputMode="decimal"
              min={0.01}
              step={0.01}
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
              className="form-input min-h-11 text-right text-lg font-semibold tabular-nums"
              placeholder="0.00"
              aria-describedby={check.message ? 'pay-amount-note' : undefined}
            />
            {check.message && (
              /* เตือน ≠ ห้าม — สีตามชนิด: บล็อกได้ danger · เตือนเฉย ๆ ได้ warning
                 `role="status"` ไม่ใช่ `alert` สำหรับตัวเตือน เพื่อไม่ขัดจังหวะตอนกำลังพิมพ์ */
              <p
                id="pay-amount-note"
                role={check.blocking ? 'alert' : 'status'}
                className={`mb-0 mt-2 flex items-start gap-1.5 rounded-lg px-3 py-2 text-xs ${
                  check.blocking ? 'text-danger-ink bg-danger/15' : 'text-warning-ink bg-warning/15'
                }`}
              >
                <Icon icon="alert-triangle" className="mt-0.5 shrink-0 text-sm" aria-hidden="true" />
                <span className="min-w-0">{check.message}</span>
              </p>
            )}
          </section>

          {/* ── วิธีรับเงิน ── เงินสดหน้าร้านต้องบันทึกได้โดยไม่มีสลิป (BR-SQ-13) */}
          <section>
            <p className="text-default-700 mb-2 text-xs font-semibold">รับมาทางไหน</p>
            <div className="flex gap-2" role="group" aria-label="วิธีรับเงิน">
              {METHOD_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setMethod(o.value)}
                  aria-pressed={method === o.value}
                  className={`btn min-h-11 flex-1 items-center justify-center gap-1.5 text-sm ${
                    method === o.value
                      ? 'bg-primary/15 text-primary-ink'
                      : 'bg-default-100 text-default-800 hover:bg-default-200'
                  }`}
                >
                  <Icon icon={o.icon} className="text-base" aria-hidden="true" />
                  {ORDER_PAYMENT_METHOD_LABEL[o.value]}
                </button>
              ))}
            </div>
          </section>

          {/* ── สลิปที่แนบมา ── โผล่เฉพาะตอนกดมาจากรูปในแชท */}
          {slipFileId && (
            <section>
              <p className="text-default-700 mb-2 text-xs font-semibold">หลักฐานที่แนบ</p>
              <div className="bg-default-100 flex items-center gap-2 rounded-lg px-3 py-2.5">
                <Icon icon="paperclip" className="text-default-700 shrink-0 text-base" aria-hidden="true" />
                {/* ห้ามเขียนว่า "สลิปยืนยันแล้ว" — ระบบไม่ได้อ่านสลิป คนเป็นคนยืนยันยอด */}
                <span className="text-default-800 min-w-0 grow text-sm">รูปจากแชท 1 รูป</span>
                <button
                  type="button"
                  onClick={() => setSlipFileId(null)}
                  aria-label="ไม่แนบรูปนี้"
                  className="btn btn-icon text-default-600 hover:bg-default-200 size-11! shrink-0"
                >
                  <Icon icon="x" className="text-base" />
                </button>
              </div>
            </section>
          )}

          {/* ── หมายเหตุ ── */}
          <section>
            <label htmlFor="pay-note" className="text-default-700 mb-2 block text-xs font-semibold">
              หมายเหตุ <span className="text-default-500 font-normal">(ไม่บังคับ)</span>
            </label>
            {/* `form-textarea` ไม่ใช่ `form-input` — เหตุผลเดียวกับ min-h-11 ข้างบน */}
            <textarea
              id="pay-note"
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))}
              maxLength={NOTE_MAX}
              rows={2}
              className="form-textarea"
              placeholder="เช่น โอนผ่านพร้อมเพย์ ลงท้าย 1234"
            />
          </section>

          {/* ── ประวัติ ── */}
          <section>
            <p className="text-default-700 mb-2 text-xs font-semibold">ประวัติการรับเงิน</p>
            {historyError ? (
              <div role="alert">
                <p className="text-danger-ink bg-danger/15 mb-0 rounded-lg px-3 py-2 text-sm">
                  {historyError.message}
                </p>
                {historyError.retryable && (
                  <button
                    type="button"
                    onClick={() => void loadHistory()}
                    className="btn bg-default-100 text-default-800 hover:bg-default-200 mt-2 min-h-11 w-full gap-2"
                  >
                    <Icon icon="refresh" className="text-base" aria-hidden="true" />
                    ลองอีกครั้ง
                  </button>
                )}
              </div>
            ) : history === null ? (
              <p className="text-default-500 mb-0 py-3 text-center text-sm" role="status">
                กำลังโหลดประวัติ…
              </p>
            ) : history.length === 0 ? (
              /* ห้ามเขียนว่า "ยังไม่ได้จ่าย" — ระบบรู้แค่ว่ายังไม่มีใครกดยืนยัน ไม่ได้รู้ว่าเงินเข้าหรือยัง */
              <p className="text-default-500 bg-default-100 mb-0 rounded-lg px-3 py-3 text-center text-sm">
                ยังไม่มีใครกดยืนยันการรับเงินของใบนี้
              </p>
            ) : (
              <ul className="divide-default-200 mb-0 divide-y divide-dashed">
                {history.map((row) => {
                  const voided = row.voidedAt !== null
                  return (
                    <li key={row.id} className="flex items-start gap-2 py-2.5">
                      <Icon
                        icon={voided ? 'receipt-off' : 'receipt'}
                        className={`mt-0.5 shrink-0 text-base ${voided ? 'text-default-400' : 'text-success-ink'}`}
                        aria-hidden="true"
                      />
                      <div className="min-w-0 grow">
                        <p
                          className={`mb-0 text-sm font-semibold tabular-nums ${
                            voided ? 'text-default-500 line-through' : 'text-default-900'
                          }`}
                        >
                          {baht(Number(row.amount))}
                          <span className="text-default-600 ms-2 text-xs font-normal">
                            {ORDER_PAYMENT_KIND_LABEL[row.kind as OrderPaymentKind] ?? row.kind}
                            {' · '}
                            {ORDER_PAYMENT_METHOD_LABEL[row.method as OrderPaymentMethod] ?? row.method}
                          </span>
                        </p>
                        <p className="text-default-500 mb-0 text-xs">
                          {formatDateTimeTH(row.receivedAt)}
                          {row.note ? ` · ${row.note}` : ''}
                        </p>
                        {voided && (
                          /* เหตุผลต้องอยู่ติดกับแถว — ประวัติที่บอกว่า "ยกเลิก" แต่ไม่บอกว่าทำไม
                             ไม่ได้ตอบคำถามที่คนเปิดดูย้อนหลังกำลังถามอยู่ */
                          <p className="text-default-600 mb-0 mt-0.5 text-xs">
                            ยกเลิกแล้ว
                            {row.voidedReason ? ` — ${row.voidedReason}` : ''}
                          </p>
                        )}
                      </div>
                      {!voided && (
                        <button
                          type="button"
                          onClick={() => void handleVoid(row)}
                          disabled={busy}
                          aria-label={`ยกเลิกรายการ ${baht(Number(row.amount))}`}
                          className="btn btn-icon text-default-600 hover:bg-danger/15 hover:text-danger-ink size-11! shrink-0 disabled:opacity-50"
                        >
                          <Icon
                            icon={voidingId === row.id ? 'loader-2' : 'trash'}
                            className={`text-base ${voidingId === row.id ? 'animate-spin' : ''}`}
                          />
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </div>

        <div className="border-default-200 shrink-0 border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"> {/* carve-out HR7: safe-area ไม่มี token ในธีม Paces — แถบปุ่มยึดขอบจอจึงต้องรับ inset เอง */}
          {/* carve-out HR7: safe-area ไม่มี token ในธีม Paces */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="btn bg-default-100 text-default-800 hover:bg-default-200 min-h-11 flex-1 disabled:opacity-60"
            >
              ปิด
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={busy || check.blocking}
              className="btn bg-primary hover:bg-primary-hover min-h-11 flex-[2] items-center justify-center gap-2 text-white disabled:opacity-60"
            >
              <Icon
                icon={saving ? 'loader-2' : 'check'}
                className={`text-base ${saving ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              บันทึกการรับเงิน
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * แปลง error code จาก API เป็นคำที่บอกทางออก
 *
 * 🛑 ห้ามตกไปที่ "ลองใหม่อีกครั้ง" สำหรับโค้ดที่ลองกี่ครั้งก็เท่าเดิม — นั่นคือคำเชิญให้กดวน
 * สิ่งที่ไม่มีวันสำเร็จ (บทเรียน iShip 2026-08-06)
 */
function errorText(code: string | undefined): string {
  switch (code) {
    case 'ORDER_NOT_FOUND':
      return 'ไม่พบคำสั่งซื้อนี้ในร้านที่เปิดอยู่ ลองปิดแล้วเปิดเธรดใหม่'
    case 'PAYMENT_NOT_FOUND':
      return 'ไม่พบรายการนี้แล้ว อาจมีคนในทีมยกเลิกไปก่อน'
    case 'ALREADY_VOIDED':
      return 'รายการนี้ถูกยกเลิกไปแล้วโดยคนในทีม'
    case 'AMOUNT_INVALID':
    case 'VALIDATION_ERROR':
      return 'ยอดเงินไม่ถูกต้อง ตรวจตัวเลขอีกครั้ง'
    case 'FORBIDDEN':
      return 'ไม่มีสิทธิ์ในร้านนี้'
    default:
      return 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง'
  }
}
