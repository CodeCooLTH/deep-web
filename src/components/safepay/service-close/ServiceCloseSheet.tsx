'use client'

/**
 * ServiceCloseSheet — "ปิดงาน" ของร้านบริการ กดครั้งเดียว: ผล + เงินที่เหลือ (feature 00073 · BRD FR-001/002)
 *
 * ขั้น 3 ของ flow 4 ขั้น — เงินภายในร้านนับตอนนี้ (วันปิดงาน) · ลูกค้ายืนยันทีหลังเพื่อขึ้นโปรไฟล์สาธารณะ
 * ดีไซน์: canvas บอร์ด 3 "ร้าน: ปิดงาน" (claude.ai/artifact/UKPrPYKWbJB8ScX4USBEdR)
 *
 * ใช้ร่วม 3 จุด (หน้างาน · บอร์ดคิววันนี้ · แชท) — คำ/เงื่อนไข/การแปล error อยู่ที่นี่ที่เดียว (HR16)
 *
 * สิทธิ์ (00071) — ซ่อนส่วนที่ไม่มีสิทธิ์ · ตัวบังคับจริงอยู่ที่ POST /api/orders/[token]/close:
 *   O4 ปิดงาน (ด่านเข้า) · O5 ส่วนรับเงิน · O6 คืนมัดจำ
 *
 * Base (เปลือกชีต · focus trap · ปุ่มเลือก · ช่องยอดเงิน): src/app/(paces)/seller/(chat)/_components/RecordPaymentSheet.tsx
 */

import { useEffect, useRef, useState } from 'react'

import Icon from '@/components/wrappers/Icon'
import { useLockBodyScroll } from '@/hooks/useLockBodyScroll'
import { pacesToast } from '@/lib/paces-toast'
import { ORDER_PAYMENT_METHOD_LABEL, type OrderMoney, type OrderPaymentMethod } from '@/lib/order-payment'
import { SERVICE_JOB_ERROR_MESSAGE, serviceCloseFootnote, type ServiceCloseOutcome } from '@/lib/service-job'

export interface ServiceCloseSheetProps {
  open: boolean
  onClose: () => void
  orderToken: string
  /** เลขงานบนหัวชีต — เธรด/บอร์ดหนึ่งมีหลายงาน กดผิดใบแล้วปิดผิดใบ */
  orderLabel: string
  /** ร้านของงาน (`?shopId=`) — แชทเปิดเธรดของอีกร้านได้ (BR-UNI-07) · null = ร้านที่ active */
  shopId?: string | null
  /** มีนัดไหม — walk-in ไม่มีตัวเลือก "ไม่มาตามนัด" */
  hasAppointment: boolean
  /**
   * เงินของงาน — null = ผู้ดูไม่มีสิทธิ์รับเงิน (O5) ⇒ ไม่มีส่วนเงินในชีต
   * ไม่ส่ง (undefined) = ชีตโหลดเองตอนเปิดจาก GET /api/orders/[token]/close (บอร์ดคิว/แชทไม่ได้ถือยอดไว้)
   */
  money?: OrderMoney | null
  /** คืนมัดจำได้ไหม (O6) — ไม่ได้ = เลือกได้แค่ "เก็บมัดจำ" */
  canRefundDeposit: boolean
  /** ลิงก์หน้าแก้ไขงาน — โชว์เมื่อยอดงาน ฿0 (ปิดแล้วแก้ไม่ได้ ต้องใส่ราคาก่อน) */
  editHref?: string | null
  /** ปิดสำเร็จ — ผู้เรียกรีเฟรชข้อมูลของตัวเอง */
  onClosed: () => void
  /** ผลที่เลือกไว้ตอนเปิด — เมนู "ไม่มาตามนัด" ของบอร์ดคิวเปิดชีตด้วย NO_SHOW */
  initialOutcome?: ServiceCloseOutcome
  /**
   * 00086 P3 — งานกดเริ่มงานแล้ว (Order.serviceStartedAt) ⇒ ไม่มีตัวเลือก "ไม่มาตามนัด" (เริ่มงาน = ลูกค้ามาแล้ว)
   * ไม่ส่ง = false = พฤติกรรมเดิม (ผู้เรียกที่ไม่ได้ถือค่านี้ — server ตอบ 409 SERVICE_JOB_NO_SHOW_AFTER_START แทน)
   */
  serviceStarted?: boolean
}

const METHOD_OPTIONS: { value: OrderPaymentMethod; icon: string }[] = [
  { value: 'TRANSFER', icon: 'building-bank' },
  { value: 'CASH', icon: 'cash-banknote' },
  { value: 'OTHER', icon: 'dots' },
]

const baht = (n: number) =>
  `฿${n.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`

/** ข้อความ error ภาษาธุรกิจ — ห้ามโยนรหัสดิบขึ้นจอ (BR-SOV-05) */
function errorText(code: string | undefined): string {
  if (code && SERVICE_JOB_ERROR_MESSAGE[code]) return SERVICE_JOB_ERROR_MESSAGE[code]
  if (code === 'APPOINTMENT_NOT_STARTED') return 'ยังไม่ถึงเวลานัด — ปิดงานได้ตั้งแต่เวลาเริ่มนัด'
  if (code === 'FORBIDDEN_ROLE') return 'บทบาทของคุณทำส่วนนี้ไม่ได้ — ให้เจ้าของร้านหรือผู้จัดการทำ'
  if (code === 'AMOUNT_INVALID' || code === 'VALIDATION_ERROR') return 'ยอดเงินไม่ถูกต้อง ตรวจตัวเลขอีกครั้ง'
  return 'ปิดงานไม่สำเร็จ — รีเฟรชหน้าแล้วลองอีกครั้ง'
}

export default function ServiceCloseSheet({
  open,
  onClose,
  orderToken,
  orderLabel,
  shopId = null,
  hasAppointment,
  money: moneyProp,
  canRefundDeposit,
  editHref = null,
  onClosed,
  initialOutcome = 'SERVED',
  serviceStarted = false,
}: ServiceCloseSheetProps) {
  useLockBodyScroll(open)
  /** มีตัวเลือก "ไม่มาตามนัด" ไหม — walk-in ไม่มี (มาแล้วโดยนิยาม) · เริ่มงานแล้วไม่มี (00086) */
  const noShowAllowed = hasAppointment && !serviceStarted

  const [outcome, setOutcome] = useState<ServiceCloseOutcome>('SERVED')
  const [amountText, setAmountText] = useState('')
  const [method, setMethod] = useState<OrderPaymentMethod>('TRANSFER')
  const [deposit, setDeposit] = useState<'KEEP' | 'REFUND'>('KEEP')
  const [saving, setSaving] = useState(false)
  /** เงินที่ใช้จริงในชีต — มาจาก prop หรือโหลดเอง · 'loading' = กำลังโหลด (ปุ่มปิดงานรอไว้ก่อน) */
  const [loaded, setLoaded] = useState<OrderMoney | null | 'loading'>(moneyProp === undefined ? 'loading' : moneyProp)
  const money = loaded === 'loading' ? null : loaded

  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const restoreRef = useRef<HTMLElement | null>(null)

  // ค่าตั้งต้นทุกครั้งที่เปิด — ชีตถูก render ค้างโดยผู้เรียกที่มีหลายงาน (เหตุผลเดียวกับ Base)
  useEffect(() => {
    if (!open) return
    setOutcome(noShowAllowed ? initialOutcome : 'SERVED')
    setMethod('TRANSFER')
    setDeposit('KEEP')
    if (moneyProp !== undefined) {
      setLoaded(moneyProp)
      return
    }
    // โหลดเงินล่าสุดเอง — ยอดค้างต้องเป็นของจริง ณ ตอนปิด ไม่ใช่ของที่ค้างอยู่ในรายการ
    setLoaded('loading')
    let cancelled = false
    const qs = shopId ? `?shopId=${encodeURIComponent(shopId)}` : ''
    fetch(`/api/orders/${orderToken}/close${qs}`, { cache: 'no-store' })
      .then((r) => r.json().catch(() => ({})))
      .then((j: { money?: OrderMoney | null }) => {
        if (!cancelled) setLoaded(j.money ?? null)
      })
      .catch(() => {
        // โหลดไม่ได้ = ปิดได้โดยไม่มีส่วนรับเงิน (ร้านบันทึกเงินแยกได้) ดีกว่าค้างชีตไว้
        if (!cancelled) setLoaded(null)
      })
    return () => {
      cancelled = true
    }
  }, [open, moneyProp, orderToken, shopId, noShowAllowed, initialOutcome])

  // เสนอยอดค้างทั้งหมดเมื่อรู้ยอดแล้ว — กรณีส่วนใหญ่คือเก็บส่วนที่เหลือครบตอนจบงาน
  useEffect(() => {
    if (!open || loaded === 'loading') return
    setAmountText(loaded && loaded.outstanding > 0 ? String(loaded.outstanding) : '')
  }, [open, loaded])

  useEffect(() => {
    if (!open) return
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose()
    }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [open, onClose, saving])

  // โฟกัส: ย้ายเข้า · ขังไว้ · คืนที่เดิม (aria-modal ไม่ได้ขังคีย์บอร์ดให้ — Base)
  useEffect(() => {
    if (!open) return
    restoreRef.current = document.activeElement as HTMLElement | null
    const t = setTimeout(() => closeRef.current?.focus(), 0)
    const onTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !panelRef.current) return
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
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

  if (!open) return null

  // ไม่มีตัวเลือกไม่มาตามนัด = ส่ง SERVED เสมอ แม้ state ค้างจากรอบก่อน (กันส่ง NO_SHOW ที่จอไม่ได้ให้เลือก)
  const effectiveOutcome: ServiceCloseOutcome = noShowAllowed ? outcome : 'SERVED'
  const served = effectiveOutcome === 'SERVED'
  const amount = amountText.trim() === '' ? 0 : Number(amountText)
  const amountInvalid = amountText.trim() !== '' && (!Number.isFinite(amount) || amount <= 0)
  /** ยอดงาน ฿0 — ปิดแล้วถูกล็อก (มติ D3) ⇒ ต้องเตือนให้ใส่ราคาก่อน ไม่ใช่ปล่อยปิดเงียบ ๆ */
  const zeroPrice = money !== null && money.totalAmount <= 0
  const remainingAfter = money ? Math.max(0, money.outstanding - (served ? amount : 0)) : 0
  const hasDepositReceived = money !== null && money.totalReceived > 0

  const cta = served
    ? amount > 0
      ? `ปิดงาน · รับ ${baht(amount)}`
      : 'ปิดงาน'
    : deposit === 'REFUND'
      ? 'บันทึกไม่มาตามนัด · คืนมัดจำ'
      : 'บันทึกว่าไม่มาตามนัด'

  async function handleSubmit() {
    if (saving || (served && amountInvalid)) return
    setSaving(true)
    try {
      const qs = shopId ? `?shopId=${encodeURIComponent(shopId)}` : ''
      const res = await fetch(`/api/orders/${orderToken}/close${qs}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          outcome: effectiveOutcome,
          payment: served && money && amount > 0 ? { amount, method } : null,
          deposit,
        }),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
      if (!res.ok) {
        pacesToast.error(json.message ?? errorText(json.error))
        return
      }
      pacesToast.success(served ? 'ปิดงานแล้ว' : 'บันทึกว่าไม่มาตามนัดแล้ว')
      onClosed()
      onClose()
    } catch {
      pacesToast.error('ปิดงานไม่สำเร็จ ตรวจสอบสัญญาณแล้วลองใหม่')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-90 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="close-sheet-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !saving) onClose()
      }}
    >
      <div
        ref={panelRef}
        className="card bg-card flex max-h-full w-full flex-col rounded-b-none sm:rounded-lg sm:max-w-lg"
      >
        <div className="card-header flex flex-nowrap items-center justify-between gap-2">
          <h5 id="close-sheet-title" className="mb-0 flex min-w-0 grow items-center gap-2 text-base">
            <Icon icon="clipboard-check" className="text-primary shrink-0 text-lg" />
            <span className="truncate">ปิดงาน · {orderLabel}</span>
          </h5>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="ปิด"
            className="btn btn-icon text-default-700 hover:bg-default-100 size-11! shrink-0"
          >
            <Icon icon="x" className="text-lg" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4">
          {/* ── ผล ── walk-in / เริ่มงานแล้ว ไม่มีตัวเลือกไม่มาตามนัด (ลูกค้ามาแล้ว) */}
          {noShowAllowed && (
            <section>
              <p className="text-default-700 mb-2 text-xs font-semibold">ผลของงานนี้</p>
              <div className="flex gap-2" role="group" aria-label="ผลของงาน">
                <button
                  type="button"
                  onClick={() => setOutcome('SERVED')}
                  aria-pressed={served}
                  className={`btn min-h-11 flex-1 items-center justify-center gap-2 ${
                    served ? 'bg-success/15 text-success-ink' : 'bg-default-100 text-default-800 hover:bg-default-200'
                  }`}
                >
                  <Icon icon="circle-check-filled" className="text-base" aria-hidden="true" />
                  ให้บริการแล้ว
                </button>
                <button
                  type="button"
                  onClick={() => setOutcome('NO_SHOW')}
                  aria-pressed={!served}
                  className={`btn min-h-11 flex-1 items-center justify-center gap-2 ${
                    !served ? 'bg-danger/15 text-danger-ink' : 'bg-default-100 text-default-800 hover:bg-default-200'
                  }`}
                >
                  <Icon icon="clock-off" className="text-base" aria-hidden="true" />
                  ไม่มาตามนัด
                </button>
              </div>
            </section>
          )}

          {/* ── ยอดงาน ฿0 ── ปิดแล้วแก้ไม่ได้ (มติ D3) ร้านซ่อมที่ประเมินราคาทีหลังต้องใส่ราคาก่อน */}
          {served && zeroPrice && (
            <p role="status" className="text-warning-ink bg-warning/15 mb-0 flex items-start gap-1.5 rounded-lg px-3 py-2 text-xs">
              <Icon icon="alert-triangle" className="mt-0.5 shrink-0 text-sm" aria-hidden="true" />
              <span className="min-w-0">
                งานนี้ยังไม่ได้ใส่ราคา — ปิดงานแล้วจะแก้ไขไม่ได้ (ต้องเปิดงานอีกครั้งก่อน)
                {editHref && (
                  <>
                    {' · '}
                    <a href={editHref} className="font-semibold underline">ใส่ราคาก่อน</a>
                  </>
                )}
              </span>
            </p>
          )}

          {/* ── เงิน (O5) ── ตัวเลขทั้งหมดมาจาก computeOrderMoney ตัวเดียว (HR16) */}
          {served && money && (
            <>
              <section className="bg-default-100 rounded-lg p-3">
                <dl className="mb-0 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <dt className="text-default-600 text-xs">ยอดงาน</dt>
                    <dd className="text-default-900 mb-0 text-sm font-semibold tabular-nums">{baht(money.totalAmount)}</dd>
                  </div>
                  <div>
                    <dt className="text-default-600 text-xs">รับแล้ว</dt>
                    <dd className="text-success-ink mb-0 text-sm font-semibold tabular-nums">{baht(money.totalReceived)}</dd>
                  </div>
                  <div>
                    <dt className="text-default-600 text-xs">ค้าง</dt>
                    <dd className={`mb-0 text-sm font-semibold tabular-nums ${money.outstanding > 0 ? 'text-warning-ink' : 'text-default-900'}`}>
                      {baht(money.outstanding)}
                    </dd>
                  </div>
                </dl>
              </section>

              {money.outstanding > 0 && (
                <>
                  <section>
                    <label htmlFor="close-amount" className="text-default-700 mb-2 block text-xs font-semibold">
                      รับเงินที่เหลือตอนนี้ <span className="text-default-500 font-normal">(เว้นว่าง = ยังไม่รับ)</span>
                    </label>
                    <input
                      id="close-amount"
                      type="number"
                      inputMode="decimal"
                      min={0.01}
                      step={0.01}
                      value={amountText}
                      onChange={(e) => setAmountText(e.target.value)}
                      className="form-input min-h-11 text-right text-lg font-semibold tabular-nums"
                      placeholder="0"
                      aria-invalid={amountInvalid}
                      aria-describedby="close-amount-note"
                    />
                    {/* เตือน ≠ ห้าม — ปิดทั้งที่ค้างได้ (ALLOW_COMPLETE_WITH_OUTSTANDING) แต่ต้องรู้ตัว ณ วินาทีนั้น */}
                    <p
                      id="close-amount-note"
                      role={amountInvalid ? 'alert' : 'status'}
                      className={`mb-0 mt-2 text-xs ${
                        amountInvalid ? 'text-danger-ink' : remainingAfter > 0 ? 'text-warning-ink' : 'text-default-600'
                      }`}
                    >
                      {amountInvalid
                        ? 'ยอดเงินต้องมากกว่า 0'
                        : remainingAfter > 0
                          ? `ปิดงานแล้วยังค้าง ${baht(remainingAfter)} — ตามเก็บได้ในหน้าการเงินร้าน`
                          : 'รับครบ ไม่มียอดค้าง'}
                    </p>
                  </section>

                  {amount > 0 && (
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
                              method === o.value ? 'bg-primary/15 text-primary-ink' : 'bg-default-100 text-default-800 hover:bg-default-200'
                            }`}
                          >
                            <Icon icon={o.icon} className="text-base" aria-hidden="true" />
                            {ORDER_PAYMENT_METHOD_LABEL[o.value]}
                          </button>
                        ))}
                      </div>
                    </section>
                  )}
                </>
              )}
            </>
          )}

          {/* ไม่มีสิทธิ์รับเงิน (เช่น ช่าง) — ปิดได้ เงินให้คนที่มีสิทธิ์บันทึก (00071)
              00086 FR-011 ข้อความตรงตัว BRD · คำเดียวทั้ง 3 จุดที่ใช้ชีตนี้ (หน้างาน · บอร์ดคิว · แชท) */}
          {served && !money && loaded !== 'loading' && (
            <p className="text-default-700 bg-default-100 mb-0 flex items-start gap-1.5 rounded-lg px-3 py-2 text-xs">
              <Icon icon="lock" className="mt-0.5 shrink-0 text-sm" aria-hidden="true" />
              <span className="min-w-0">ปิดงานได้ แต่รับเงินไม่ได้ · ยอดที่เหลือให้เจ้าของร้านหรือฝ่ายเปิดบิลบันทึก</span>
            </p>
          )}

          {/* ── มัดจำตอนไม่มาตามนัด (มติ D1) ── เก็บ = เป็นยอดขาย (ค่าตั้งต้น) · คืน = ยอด 0 */}
          {!served && (
            <section>
              {hasDepositReceived || money === null ? (
                <>
                  <p className="text-default-700 mb-2 text-xs font-semibold">
                    มัดจำ{money ? ` ${baht(money.totalReceived)}` : ''}
                  </p>
                  <div className="flex gap-2" role="group" aria-label="มัดจำ">
                    <button
                      type="button"
                      onClick={() => setDeposit('KEEP')}
                      aria-pressed={deposit === 'KEEP'}
                      className={`btn min-h-11 flex-1 items-center justify-center gap-2 ${
                        deposit === 'KEEP' ? 'bg-primary/15 text-primary-ink' : 'bg-default-100 text-default-800 hover:bg-default-200'
                      }`}
                    >
                      <Icon icon="coin" className="text-base" aria-hidden="true" />
                      เก็บมัดจำ
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeposit('REFUND')}
                      aria-pressed={deposit === 'REFUND'}
                      disabled={!canRefundDeposit}
                      className={`btn min-h-11 flex-1 items-center justify-center gap-2 disabled:opacity-50 ${
                        deposit === 'REFUND' ? 'bg-primary/15 text-primary-ink' : 'bg-default-100 text-default-800 hover:bg-default-200'
                      }`}
                    >
                      <Icon icon="arrow-back-up" className="text-base" aria-hidden="true" />
                      คืนมัดจำ
                    </button>
                  </div>
                  <p className="text-default-600 mb-0 mt-2 text-xs">
                    {deposit === 'KEEP'
                      ? 'มัดจำนับเป็นยอดขายของวันนี้'
                      : 'รายการมัดจำจะถูกยกเลิกพร้อมเหตุผล "คืนมัดจำ" — ประวัติยังอยู่ ไม่ได้ถูกลบ'}
                    {!canRefundDeposit && ' · คืนมัดจำได้เฉพาะเจ้าของร้านหรือผู้จัดการ'}
                  </p>
                </>
              ) : (
                <p className="text-default-700 bg-default-100 mb-0 rounded-lg px-3 py-2 text-xs">
                  งานนี้ไม่มีมัดจำ — ยอดขายของงานนี้เป็น ฿0
                </p>
              )}
            </section>
          )}

          {/* ไม่มี O5 (money = null) = ไม่พูดเรื่องเงิน · ระหว่างโหลดก็ยังไม่พูด กันช่างเห็นข้อความเงินแวบหนึ่ง */}
          <p className="text-default-600 mb-0 text-xs">{serviceCloseFootnote(money !== null)}</p>
        </div>

        <div className="border-default-200 shrink-0 border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"> {/* carve-out HR7: safe-area ไม่มี token ในธีม Paces — แถบปุ่มยึดขอบจอจึงต้องรับ inset เอง */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="btn bg-default-100 text-default-800 hover:bg-default-200 min-h-11 flex-1 disabled:opacity-60"
            >
              ยังไม่ปิด
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={saving || loaded === 'loading' || (served && amountInvalid)}
              className={`btn min-h-11 flex-[2] items-center justify-center gap-2 text-white disabled:opacity-60 ${
                served ? 'bg-primary hover:bg-primary-hover' : 'bg-danger hover:bg-danger/90'
              }`}
            >
              <Icon icon={saving ? 'loader-2' : 'check'} className={`text-base ${saving ? 'animate-spin' : ''}`} aria-hidden="true" />
              {cta}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
