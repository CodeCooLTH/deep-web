'use client'

/**
 * ReturnPanel — ระบบคืนของในหน้าออเดอร์และในห้องแชท (feature 00056 · P4)
 *
 * 🛑 component เดียวใช้ 2 จอ (หน้ารายละเอียด + แผงออเดอร์ในห้องแชท) ตามที่หัวหน้าสั่งว่า
 * "กดคืนของจาก order detail + หน้าแชทได้เลย" — ถ้าเขียนสองตัว ปุ่ม/กติกาจะเลื่อนออกจากกัน
 * แน่นอน (บทเรียนซ้ำจาก sibling-surface-parity.md) ต่างกันแค่ `compact` ที่ย่อ padding
 *
 * โหลดข้อมูลตอน **กางเท่านั้น** — ออเดอร์ส่วนใหญ่ไม่มีการคืนของ การยิง API ทุกใบตั้งแต่
 * paint แรกคือค่าใช้จ่ายที่แทบไม่มีใครได้ใช้
 *
 * Base: การ์ด `.card` + `.card-header` ของ Paces (โครงเดียวกับ ShippingCard ที่อยู่ติดกัน)
 */

import { useCallback, useEffect, useState } from 'react'
import useLockBodyScroll from '@/hooks/useLockBodyScroll'

import Icon from '@/components/wrappers/Icon'
import { formatDateTime } from '@/lib/format-date'
import { pacesToast } from '@/lib/paces-toast'
import { pacesConfirm } from '@/lib/paces-swal'
import {
  RETURN_PAYER_TEXT,
  RETURN_SHIPPING_CHOICES,
  RETURN_STATUS,
  RETURN_TRACKING_SOURCE,
  RETURN_TRACKING_SOURCE_TEXT,
  computeRefundAmount,
  returnShippingChoice,
  type ReturnPayer,
  type ReturnShippingChoiceKey,
  type ReturnTrackingSource,
} from '@/lib/order-return'
import { formatBaht } from '@/lib/format-money'

type EligibleItem = {
  orderItemId: string
  name: string
  orderedQty: number
  returnedQty: number
  remainingQty: number
  unitPrice: number
}

type Eligibility = {
  canReturn: boolean
  blockedText: string | null
  items: EligibleItem[]
}

export type ReturnRow = {
  id: string
  status: string
  payer: ReturnPayer
  trackingSource: ReturnTrackingSource
  manualTrackingNo: string | null
  manualCourier: string | null
  countAsCost: boolean
  refundAmount: number | null
  createdAt: string
  trackingNo: string | null
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  REQUESTED: { label: 'รอส่งคืน', cls: 'bg-warning/15 text-warning-ink' },
  SHIPPING: { label: 'กำลังส่งคืน', cls: 'bg-info/15 text-info-ink' },
  // ผลทางบัญชีเกิดที่นี่ (ยอดขายหาย) — ใช้ warning ไม่ใช่ success เพราะไม่ใช่ผลที่ร้านอยากได้
  RECEIVED: { label: 'รับของคืนแล้ว', cls: 'bg-warning/15 text-warning-ink' },
  CANCELLED: { label: 'ยกเลิกแล้ว', cls: 'bg-default-100 text-default-700' },
}

export default function ReturnPanel({
  orderToken,
  initialCount,
  compact = false,
  asSheet = false,
  sheetOpen = false,
  onCloseSheet,
}: {
  orderToken: string
  /** จำนวนใบคืนที่ server นับมาให้ — 0 = ยังไม่เคยมีการคืน (ยังกางเพื่อเปิดใบใหม่ได้) */
  initialCount: number
  compact?: boolean
  /**
   * โหมดชีต — ใช้ในห้องแชท ซึ่งเปิดจากเมนู `⋮` ของออเดอร์แต่ละใบ
   *
   * 🛑 ในรายการแชทมีออเดอร์หลายใบบนจอเดียว การ์ดคงที่ต่อใบจะกลายเป็น N การ์ดที่กินพื้นที่
   * เท่ากับรายการจริง และขึ้นแม้ใบนั้นคืนไม่ได้ (= เสียงรบกวนล้วน) — user ทักเองว่าผิดที่
   * ปุ่มต้องอยู่ในเมนูของออเดอร์ใบนั้นตาม `docs/conventions/seller-action-placement.md`
   */
  asSheet?: boolean
  sheetOpen?: boolean
  onCloseSheet?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [eligibility, setEligibility] = useState<Eligibility | null>(null)
  const [returns, setReturns] = useState<ReturnRow[] | null>(null)
  const [form, setForm] = useState(false)
  /**
   * ขั้นของฟอร์ม — 1 เลือกวิธีคืน · 2 เลือกของ
   *
   * 🛑 ถามวิธีคืนก่อน เพราะนั่นคือสิ่งที่ร้าน **ตกลงกับลูกค้าไปแล้ว** ก่อนจะมากดในระบบ
   * ส่วน "ของกี่ชิ้น" เป็นรายละเอียดที่ต้องเปิดออเดอร์ดู — ถามเรื่องที่ตัดสินใจแล้วก่อน
   * ทำให้ผ่านขั้นแรกได้เร็ว และขั้นสองไม่มีอะไรมาแย่งสายตาตอนนับจำนวน (ซึ่งคือเงิน)
   */
  const [step, setStep] = useState<1 | 2>(1)
  const [qty, setQty] = useState<Record<string, number>>({})
  /**
   * 🛑 ตัวเลือกเดียว ไม่ใช่ payer + source แยกกัน
   *
   * เดิมเป็น select 2 ตัวที่ขึ้นต่อกัน แล้วต้องมีโค้ดสลับ source ให้อัตโนมัติเมื่อ payer เปลี่ยน
   * (คู่ `BUYER + ISHIP` เป็นไปไม่ได้ — ระบบตัดเครดิต iShip ของร้านเสมอ) ⇒ ผู้ใช้เห็นช่องที่
   * ตัวเองไม่ได้แตะเปลี่ยนค่าเอง ซึ่งอ่านเป็นบั๊ก · ยุบเป็นลิสต์เดียวแล้วคู่ที่เป็นไปไม่ได้
   * **หายไปจากโครงสร้าง** ไม่ใช่แค่ถูกซ่อน (หัวหน้าเสนอเอง: "ให้เลือกเป็น radio จะได้ง่ายๆ")
   */
  const [choiceKey, setChoiceKey] = useState<ReturnShippingChoiceKey | null>(null)
  const [manualNo, setManualNo] = useState('')
  const [manualCourier, setManualCourier] = useState('')
  const [countAsCost, setCountAsCost] = useState(false)
  const [reason, setReason] = useState('')

  const choice = choiceKey ? returnShippingChoice(choiceKey) : null
  const payer: ReturnPayer = choice?.payer ?? 'SHOP'
  const source: ReturnTrackingSource = choice?.trackingSource ?? 'ISHIP'
  /** ขั้นที่ 1 ผ่านหรือยัง — เกณฑ์เดียว ใช้ทั้งปุ่ม "ถัดไป" และปุ่มยืนยันปลายทาง */
  const stepOneReady = choice != null && (!choice.needsTracking || manualNo.trim() !== '')

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/orders/${orderToken}/returns`, { cache: 'no-store' })
      if (!res.ok) throw new Error('failed')
      const data = (await res.json()) as Eligibility & { returns?: ReturnRow[] }
      setEligibility(data)
      setReturns(data.returns ?? [])
    } catch {
      pacesToast.error('โหลดข้อมูลการคืนของไม่สำเร็จ')
    }
  }, [orderToken])

  const toggle = () => {
    const next = !open
    setOpen(next)
    if (next && !eligibility) void load()
  }

  /**
   * โหมดชีต: เปิดเมื่อไหร่โหลดทันที — ผู้ใช้กดจากเมนูแล้วต้องเห็นของเลย ไม่ใช่ต้องกดซ้ำ
   * 🛑 dep เป็น `load` ที่เป็น `useCallback` ตัวเดียว ไม่ใช่ object ที่ hook คืนทั้งก้อน
   * (docs/conventions/hook-return-identity-in-deps.md — ลูปยิง API ไม่หยุดเคยเกิดมาแล้ว)
   */
  useEffect(() => {
    if (asSheet && sheetOpen && !eligibility) void load()
  }, [asSheet, sheetOpen, eligibility, load])

  // ล็อก scroll ของหน้าเมื่อชีตเปิด — โมดัลที่ประกอบเองด้วย React state ต้องเรียกเสมอ
  // (docs/conventions/overlay-scroll-lock.md · การแปลง hs-overlay เป็น controlled div
  //  ทิ้งการล็อกที่เคยได้ฟรีไปทุกใบ ไม่มีใครสังเกตจนผู้ใช้เจอบนมือถือ)
  useLockBodyScroll(asSheet && sheetOpen)

  const selectedLines = (eligibility?.items ?? [])
    .filter((i) => (qty[i.orderItemId] ?? 0) > 0)
    .map((i) => ({ qty: qty[i.orderItemId]!, unitPrice: i.unitPrice }))
  const refundPreview = computeRefundAmount(selectedLines)

  const submit = async () => {
    setBusy(true)
    try {
      const res = await fetch(`/api/orders/${orderToken}/returns`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          items: Object.entries(qty)
            .filter(([, q]) => q > 0)
            .map(([orderItemId, q]) => ({ orderItemId, qty: q })),
          reason: reason.trim() || null,
          payer,
          trackingSource: source,
          manualTrackingNo: source === RETURN_TRACKING_SOURCE.MANUAL ? manualNo : null,
          manualCourier: source === RETURN_TRACKING_SOURCE.MANUAL ? manualCourier : null,
          countAsCost,
        }),
      })
      const data = await res.json()
      // ข้อความจาก API บอกทางแก้อยู่แล้ว (คืนได้อีกกี่ชิ้น/ทำไมคืนไม่ได้) — แสดงตรง ๆ
      if (!res.ok) throw new Error(data?.error ?? 'เปิดใบคืนไม่สำเร็จ')
      pacesToast.success('เปิดใบคืนของแล้ว')
      closeForm()
      await load()
    } catch (e) {
      pacesToast.error(e instanceof Error ? e.message : 'เปิดใบคืนไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  const act = async (returnId: string, action: 'ship' | 'receive' | 'cancel') => {
    if (action === 'receive') {
      // บอกผลที่ตามมาให้ครบก่อนกด — ตรงนี้คือจุดเดียวที่ยอดขายเปลี่ยน (BRD §2)
      const ok = await pacesConfirm.warning(
        'ยืนยันว่าได้รับของคืนแล้ว?',
        'ยอดขายของรายการที่คืนจะถูกหักออก และปิดเรื่องคืนของใบนี้',
        { confirmButtonText: 'ได้รับของคืนแล้ว' },
      )
      if (!ok) return
    }
    setBusy(true)
    try {
      const res = await fetch(`/api/orders/${orderToken}/returns/${returnId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'ทำรายการไม่สำเร็จ')
      pacesToast.success(
        action === 'ship' ? 'บันทึกการส่งคืนแล้ว' : action === 'receive' ? 'รับของคืนแล้ว' : 'ยกเลิกเรื่องคืนของแล้ว',
      )
      await load()
    } catch (e) {
      pacesToast.error(e instanceof Error ? e.message : 'ทำรายการไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  /** ปิดฟอร์ม + ล้างร่างทั้งชุด — เดิมล้างแค่ `qty` ทำให้วิธีคืนของรอบก่อนค้างมารอบถัดไป */
  const closeForm = () => {
    setForm(false)
    setStep(1)
    setQty({})
    setChoiceKey(null)
    setManualNo('')
    setManualCourier('')
    setCountAsCost(false)
    setReason('')
  }

  const labelUrl = `/api/o/${orderToken}/return-label`

  const body = !eligibility ? (
    <p className="text-default-700 mb-0 flex items-center gap-2 text-sm">
      <Icon icon="loader-2" className="animate-spin text-base" aria-hidden="true" />
      กำลังโหลด…
    </p>
  ) : (
    renderBody()
  )

  /**
   * โหมดชีต — เปิดจากเมนู `⋮` ของออเดอร์ในห้องแชท
   *
   * ฉากเบลอ + แผงยึดขอบล่างบนมือถือ / กลางจอบนเดสก์ท็อป · `role="dialog"` ต้องมี
   * `aria-modal` คู่กันเสมอ ไม่งั้นผู้ใช้ screen reader อ่านหลุดออกไปหลังฉาก
   * (docs/conventions/aria-name-requires-supporting-role.md)
   */
  if (asSheet) {
    if (!sheetOpen) return null
    return (
      /* Base: RecordPaymentSheet.tsx / AppointmentSummarySheet.tsx — โครงชีตของโปรเจกต์นี้
         (`z-90` · `.card` · `max-h-full` + `min-h-0 flex-1`) ห้ามคิดเลข z/ความสูงเอง:
         🛑 ร่างแรกใช้ `z-[1090]` + `max-h-[85dvh]` (arbitrary → HR7 แดง) และหัวชีต `z-10`
         ซึ่งเทส [blocker] `paces-sticky-z-index` จับได้ว่าจะถูก `.btn` (z-10 ในตัว) ทับ */
      <div
        className="fixed inset-0 z-90 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
        role="dialog"
        aria-modal="true"
        aria-label="การคืนของ"
        onMouseDown={(e) => {
          // ปิดเฉพาะเมื่อกดที่ "ฉากเบลอ" จริง ๆ — ใช้ target===currentTarget แทน stopPropagation
          // ที่ลูก เพราะการลากเลือกข้อความในแผงแล้วปล่อยนอกแผงจะกลายเป็นการปิดโดยไม่ได้ตั้งใจ
          if (e.target === e.currentTarget) onCloseSheet?.()
        }}
      >
        <div className="card bg-card flex h-full max-h-full w-full flex-col rounded-b-none sm:h-auto sm:max-w-lg sm:rounded-lg">
          <div className="card-header flex flex-nowrap items-center justify-between gap-2">
            <h5 className="card-title flex min-w-0 items-center gap-1.5">
              <Icon icon="arrow-back-up" className="text-default-600 size-4 shrink-0" />
              <span className="truncate">การคืนของ</span>
            </h5>
            <button
              type="button"
              className="btn btn-sm bg-light text-default-700 shrink-0 hover:bg-light-hover"
              onClick={onCloseSheet}
              aria-label="ปิด"
            >
              <Icon icon="x" className="size-4" aria-hidden="true" />
            </button>
          </div>
          {/* min-h-0 flex-1 = ส่วนที่เลื่อนได้หดเอง เนื้อหายาวจึงไม่ดันชีตทะลุจอ */}
          <div className="card-body min-h-0 flex-1 overflow-y-auto overscroll-contain">{body}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="card-header flex-nowrap items-center justify-between gap-2">
        <h5 className="card-title flex min-w-0 items-center gap-1.5">
          <Icon icon="arrow-back-up" className="text-default-600 size-4 shrink-0" />
          <span className="truncate">การคืนของ</span>
          {initialCount > 0 && (
            <span className="badge bg-warning/15 text-warning-ink text-2xs shrink-0">
              {initialCount}
            </span>
          )}
        </h5>
        <button type="button" className="btn btn-sm bg-light text-default-700 shrink-0 hover:bg-light-hover" onClick={toggle}>
          {open ? 'ซ่อน' : 'จัดการ'}
        </button>
      </div>

      {open && <div className={compact ? 'card-body !p-3' : 'card-body'}>{body}</div>}
    </div>
  )

  /** เนื้อหาจริง — ใช้ร่วมทั้งโหมดการ์ดและโหมดชีต ห้ามเขียนสองชุด (sibling-surface-parity) */
  function renderBody() {
    if (!eligibility) return null
    return (
      <>
              {/* ── ใบคืนที่มีอยู่ ─────────────────────────────────────────── */}
              {(returns ?? []).map((r) => (
                <div key={r.id} className="border-default-200 mb-3 rounded-lg border p-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className={`badge text-2xs ${STATUS_META[r.status]?.cls ?? ''}`}>
                      {STATUS_META[r.status]?.label ?? r.status}
                    </span>
                    <span className="text-default-600 text-2xs">
                      {RETURN_PAYER_TEXT[r.payer]} · {RETURN_TRACKING_SOURCE_TEXT[r.trackingSource]}
                    </span>
                    {/* ลูกค้าออกค่าส่งแต่ร้านรับผิดชอบ = ต้องเห็นชัด ไม่งั้นตัวเลขต้นทุนอ่านไม่ออก */}
                    {r.payer === 'BUYER' && r.countAsCost && (
                      <span className="badge bg-default-100 text-default-700 text-2xs">
                        นับเป็นต้นทุนร้าน
                      </span>
                    )}
                    <span className="text-default-500 text-2xs">
                      {formatDateTime(r.createdAt)}
                    </span>
                  </div>

                  {(r.trackingNo || r.manualTrackingNo) && (
                    <p className="text-default-800 mb-2 text-xs font-semibold tabular-nums">
                      {r.manualCourier ? `${r.manualCourier} · ` : ''}
                      {r.trackingNo ?? r.manualTrackingNo}
                    </p>
                  )}

                  {/* การ์ดใบปะหน้า — เฉพาะใบที่ระบบออกเลขให้ (หัวหน้าสั่ง: ให้ลูกค้าพิมพ์ได้) */}
                  {r.trackingSource === RETURN_TRACKING_SOURCE.ISHIP && r.trackingNo && (
                    <div className="bg-default-50 border-default-200 mb-2 flex items-center gap-2 rounded-lg border p-2">
                      <Icon icon="file-type-pdf" className="text-default-600 size-5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-default-900 mb-0 text-xs font-medium">ใบปะหน้าพัสดุขากลับ</p>
                        <p className="text-default-600 mb-0 text-2xs">ส่งลิงก์นี้ให้ลูกค้าพิมพ์ติดกล่อง</p>
                      </div>
                      <a
                        href={labelUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-sm bg-light text-default-700 shrink-0 hover:bg-light-hover"
                      >
                        เปิด
                      </a>
                      <button
                        type="button"
                        className="btn btn-sm bg-light text-default-700 shrink-0 hover:bg-light-hover"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(
                              `${window.location.origin}${labelUrl}`,
                            )
                            pacesToast.success('คัดลอกลิงก์ใบปะหน้าแล้ว')
                          } catch {
                            // clipboard ต้องการ https — บอกทางออกที่ทำได้จริงบนมือถือ
                            pacesToast.error('คัดลอกไม่สำเร็จ — กดเปิดแล้วคัดลอกจากแถบที่อยู่')
                          }
                        }}
                      >
                        คัดลอกลิงก์
                      </button>
                    </div>
                  )}

                  {r.refundAmount != null && (
                    <p className="text-default-700 mb-2 text-xs">
                      ยอดที่คืน {formatBaht(r.refundAmount)}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {r.status === RETURN_STATUS.REQUESTED && (
                      <button
                        type="button"
                        className="btn btn-sm bg-primary text-white hover:bg-primary-hover disabled:opacity-60"
                        disabled={busy}
                        onClick={() => act(r.id, 'ship')}
                      >
                        {r.trackingSource === RETURN_TRACKING_SOURCE.ISHIP
                          ? 'ออกเลขพัสดุขากลับ'
                          : 'บันทึกว่าส่งคืนแล้ว'}
                      </button>
                    )}
                    {(r.status === RETURN_STATUS.REQUESTED || r.status === RETURN_STATUS.SHIPPING) && (
                      <>
                        <button
                          type="button"
                          className="btn btn-sm bg-light text-default-700 hover:bg-light-hover"
                          disabled={busy}
                          onClick={() => act(r.id, 'receive')}
                        >
                          ได้รับของคืนแล้ว
                        </button>
                        {/* ยกเลิกเป็นปุ่มขอบ ไม่ใช่ปุ่มทึบ — ไม่ใช่ทางที่เราอยากให้กดเป็นอันดับแรก */}
                        <button
                          type="button"
                          className="btn btn-sm border border-danger text-danger hover:bg-danger/15 disabled:opacity-60"
                          disabled={busy}
                          onClick={() => act(r.id, 'cancel')}
                        >
                          ยกเลิกเรื่องคืน
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}

              {/* ── เปิดใบใหม่ ─────────────────────────────────────────────── */}
              {!eligibility.canReturn ? (
                <p className="text-default-700 mb-0 flex items-start gap-2 text-xs">
                  <Icon icon="info-circle" className="mt-0.5 shrink-0 text-sm" aria-hidden="true" />
                  {eligibility.blockedText}
                </p>
              ) : !form && !asSheet ? (
                /* 🛑 ปุ่มนี้มีเฉพาะโหมดการ์ด — โหมดชีตเปิดจาก `⋮ → คืนของ` ซึ่งผู้ใช้บอกเจตนา
                   ไปแล้ว การให้กด "เปิดเรื่องคืนของ" ซ้ำคือคลิกที่ไม่ได้ตัดสินใจอะไรเพิ่ม
                   (หัวหน้าทักเอง 2026-08-25: "ทำไมยังต้องกดเปิดเรื่องคืนของ") */
                <button type="button" className="btn btn-sm bg-primary text-white hover:bg-primary-hover disabled:opacity-60" onClick={() => setForm(true)}>
                  <Icon icon="plus" className="size-4" aria-hidden="true" />
                  เปิดเรื่องคืนของ
                </button>
              ) : (
                <div className="border-default-200 rounded-lg border p-3">{renderForm()}</div>
              )}
      </>
    )
  }

  /**
   * ฟอร์มเปิดใบคืน — 2 ขั้น: วิธีคืน → ของที่คืน
   *
   * ดีไซน์นี้มาจาก prototype 3 แบบที่เทียบกันบนหน้าจริง (branch `proto/return-sheet-redesign`)
   * หัวหน้าเคาะแบบ A ด้วยเหตุผลว่าตรงกับที่สั่งตรงตัว "กดปุ่มคืนของแล้วให้เลือกเป็น radio"
   */
  function renderForm() {
    if (!eligibility) return null

    // ── ขั้น 1 · ตกลงกับลูกค้าไว้ยังไง ────────────────────────────────
    if (step === 1) {
      return (
        <>
          <p className="text-default-900 mb-0.5 text-sm font-semibold">ตกลงกับลูกค้าไว้ยังไง</p>
          <p className="text-default-600 mb-3 text-xs">เลือกข้อที่ตรงกับที่คุยกันไว้</p>

          <div className="flex flex-col gap-2" role="radiogroup" aria-label="วิธีคืนของ">
            {RETURN_SHIPPING_CHOICES.map((c) => {
              const on = choiceKey === c.key
              return (
                /* label ห่อ input ทั้งก้อน = กดตรงไหนของการ์ดก็ติด และยังได้ชื่อจาก markup จริง
                   ไม่ต้องพึ่ง aria-label (docs/conventions/aria-name-requires-supporting-role.md) */
                <label
                  key={c.key}
                  className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 ${
                    on ? 'border-primary bg-primary/5' : 'border-default-200'
                  }`}
                >
                  <input
                    type="radio"
                    name="return-shipping-choice"
                    className="form-radio mt-0.5 shrink-0"
                    checked={on}
                    onChange={() => {
                      setChoiceKey(c.key)
                      // ล้างค่าที่ไม่เกี่ยวกับข้อใหม่ — ไม่งั้นเลขพัสดุที่พิมพ์ไว้ตอนเลือกข้ออื่น
                      // จะถูกส่งไปด้วยแล้วโดน TRACKING_NOT_ALLOWED ที่ผู้ใช้แก้ไม่ถูก
                      if (!c.needsTracking) {
                        setManualNo('')
                        setManualCourier('')
                      }
                      if (!c.costOptional) setCountAsCost(false)
                    }}
                  />
                  <Icon icon={c.icon} className="text-default-600 mt-0.5 size-5 shrink-0" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="text-default-900 block text-sm font-medium">{c.title}</span>
                    <span className="text-default-600 block text-xs">{c.detail}</span>
                  </span>
                </label>
              )
            })}
          </div>

          {choice?.needsTracking && (
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input
                className="form-input sm:flex-1"
                placeholder="ชื่อขนส่ง"
                value={manualCourier}
                onChange={(e) => setManualCourier(e.target.value)}
                aria-label="ชื่อขนส่งขากลับ"
              />
              <input
                className="form-input sm:flex-1"
                placeholder="เลขพัสดุ *"
                value={manualNo}
                onChange={(e) => setManualNo(e.target.value)}
                aria-label="เลขพัสดุขากลับ"
              />
            </div>
          )}

          {/* ถามเฉพาะตอนลูกค้าออกค่าส่ง — ร้านจ่ายเองบังคับเป็นต้นทุนอยู่แล้ว (resolveCountAsCost)
              ถามไปก็หลอกว่าเลือกได้ทั้งที่ติ๊กออกแล้วไม่มีผล */}
          {choice?.costOptional && (
            <label className="mt-2 flex items-start gap-2 text-xs">
              <input
                type="checkbox"
                className="form-checkbox mt-0.5"
                checked={countAsCost}
                onChange={(e) => setCountAsCost(e.target.checked)}
              />
              <span>
                ลูกค้าออกเลขเอง แต่<span className="font-semibold">มาเรียกเก็บร้านทีหลัง</span> — บันทึกเป็นต้นทุนร้าน
              </span>
            </label>
          )}

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              className="btn btn-sm bg-primary flex-1 text-white hover:bg-primary-hover disabled:opacity-60"
              disabled={!stepOneReady}
              onClick={() => setStep(2)}
            >
              ถัดไป — เลือกของที่คืน
            </button>
            <button
              type="button"
              className="btn btn-sm bg-light text-default-700 hover:bg-light-hover"
              onClick={() => (asSheet ? onCloseSheet?.() : closeForm())}
            >
              ยกเลิก
            </button>
          </div>
        </>
      )
    }

    // ── ขั้น 2 · คืนของชิ้นไหนบ้าง ──────────────────────────────────
    return (
      <>
        {/* ปุ่มย้อนกลับพูดชื่อข้อที่เลือกไว้ด้วย = ไม่ต้องจำ และแก้ได้ในคลิกเดียว */}
        <button type="button" className="btn btn-sm bg-light text-default-700 mb-3 max-w-full hover:bg-light-hover" onClick={() => setStep(1)}>
          <Icon icon="arrow-left" className="size-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{choice?.title}</span>
        </button>

        <p className="text-default-900 mb-2 text-sm font-semibold">คืนของชิ้นไหนบ้าง</p>
        {eligibility.items.map((i) => {
          const n = qty[i.orderItemId] ?? 0
          const setN = (next: number) =>
            // clamp ที่นี่ด้วย — ปุ่มกันไว้แล้วแต่ service ก็กันอีกชั้น ค่าที่ส่งออกต้องถูกเสมอ
            setQty((q) => ({ ...q, [i.orderItemId]: Math.max(0, Math.min(i.remainingQty, next)) }))
          return (
            <div
              key={i.orderItemId}
              className="border-default-200 mb-2 flex items-center gap-2 rounded-lg border p-2.5"
            >
              <span className="min-w-0 flex-1">
                <span className="text-default-900 block truncate text-sm">{i.name}</span>
                <span className="text-default-500 block text-xs">
                  ซื้อ {i.orderedQty} · คืนได้ {i.remainingQty} · {formatBaht(i.unitPrice)}/ชิ้น
                </span>
              </span>
              {/* stepper — ยกโครงจาก `orders/new/components/QuickLineItem.tsx` (โดเมนเดียวกัน:
                  รายการสินค้า + จำนวน) ตาม docs/conventions/sibling-surface-parity.md
                  ต่างกันจุดเดียว: ตรงกลางเป็นตัวเลขอ่านอย่างเดียว ไม่ใช่ช่องพิมพ์ — คืนของมี
                  เพดาน `remainingQty` ที่แข็ง การเปิดให้พิมพ์คือการเชิญให้พิมพ์เกินแล้วโดนดีดกลับ */}
              <div className="border-default-300 flex shrink-0 items-center overflow-hidden rounded-lg border">
                <button
                  type="button"
                  className="text-primary inline-flex size-9 items-center justify-center disabled:opacity-40"
                  disabled={n <= 0}
                  onClick={() => setN(n - 1)}
                  aria-label={`ลดจำนวนที่คืนของ ${i.name}`}
                >
                  <Icon icon="minus" className="size-4" aria-hidden="true" />
                </button>
                {/* live region ทำหน้าที่แทน `<input>` ของ sibling: ตัวเลขนี้โฟกัสไม่ได้ ผู้ใช้
                    screen reader จึงต้องได้ยินค่าที่เปลี่ยนหลังกด ±  ไม่งั้นกดแล้วเงียบสนิท
                    🛑 ไม่ใส่ `aria-label` — บน live region ชื่อจากผู้เขียนจะไปแทนที่ *เนื้อหา*
                    ที่ต้องถูกอ่าน ซึ่งก็คือตัวเลข (บริบทว่าของชิ้นไหนอยู่ที่ปุ่มที่เพิ่งกดแล้ว) */}
                <span
                  className="border-default-200 w-10 border-x py-1.5 text-center text-sm font-bold tabular-nums"
                  role="status"
                >
                  {n}
                </span>
                <button
                  type="button"
                  className="text-primary inline-flex size-9 items-center justify-center disabled:opacity-40"
                  disabled={n >= i.remainingQty}
                  onClick={() => setN(n + 1)}
                  aria-label={`เพิ่มจำนวนที่คืนของ ${i.name}`}
                >
                  <Icon icon="plus" className="size-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          )
        })}

        <input
          className="form-input mt-3"
          placeholder="เหตุผล (ไม่บังคับ)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          aria-label="เหตุผลที่คืน"
        />

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <span className="text-default-900 text-sm font-semibold">
            คืน {formatBaht(refundPreview)}
          </span>
          <button
            type="button"
            className="btn btn-sm bg-primary text-white hover:bg-primary-hover disabled:opacity-60"
            disabled={busy || selectedLines.length === 0 || !stepOneReady}
            onClick={submit}
          >
            เปิดใบคืน
          </button>
        </div>
      </>
    )
  }
}
