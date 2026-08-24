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
import { useSearchParams } from 'next/navigation'
// 🧪 PROTOTYPE — ลบพร้อมโฟลเดอร์ prototype/ ตอนเคาะ variant ที่ชนะ
import PrototypeSwitcher, { useProtoVariant } from './prototype/PrototypeSwitcher'
import { VariantA, VariantB, VariantC } from './prototype/ReturnSheetVariants'
import { choiceOf, draftCount, type ProtoDraft } from './prototype/return-shipping-choices'
import useLockBodyScroll from '@/hooks/useLockBodyScroll'

import Icon from '@/components/wrappers/Icon'
import { formatDateTime } from '@/lib/format-date'
import { pacesToast } from '@/lib/paces-toast'
import { pacesConfirm } from '@/lib/paces-swal'
import {
  RETURN_PAYER_TEXT,
  RETURN_STATUS,
  RETURN_TRACKING_SOURCE,
  RETURN_TRACKING_SOURCE_TEXT,
  computeRefundAmount,
  type ReturnPayer,
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
  const searchParams = useSearchParams()
  const protoVariant = useProtoVariant()
  const [busy, setBusy] = useState(false)
  const [eligibility, setEligibility] = useState<Eligibility | null>(null)
  const [returns, setReturns] = useState<ReturnRow[] | null>(null)
  const [form, setForm] = useState(false)
  const [qty, setQty] = useState<Record<string, number>>({})
  const [payer, setPayer] = useState<ReturnPayer>('SHOP')
  const [source, setSource] = useState<ReturnTrackingSource>('ISHIP')
  const [manualNo, setManualNo] = useState('')
  const [manualCourier, setManualCourier] = useState('')
  const [countAsCost, setCountAsCost] = useState(false)
  const [reason, setReason] = useState('')

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
      setForm(false)
      setQty({})
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

  const labelUrl = `/api/o/${orderToken}/return-label`

  /**
   * 🧪 PROTOTYPE (throwaway · components/prototype/README.md)
   *
   * เมื่อมี `?variant=A|B|C` ในลิงก์ → เรนเดอร์ฟอร์มร่างแทนของจริง เพื่อให้ user กดเทียบได้
   * บนหน้าเดียวกับของจริง (ข้อมูล/ความหนาแน่น/ขนาดชีต จริงทั้งหมด)
   *
   * 🛑 ไม่ยิง API — prototype ตอบคำถาม "ควรหน้าตายังไง" ไม่ใช่ "backend ทำงานไหม"
   * 🛑 ปิดสนิทใน production build — ตัวแปร env ตรวจตอน build ไม่ใช่ตอน render
   * ลบทั้งบล็อกนี้พร้อมโฟลเดอร์ prototype/ ตอนเคาะ variant ที่ชนะแล้ว
   */
  const protoOn = process.env.NODE_ENV !== 'production' && searchParams.get('variant') != null
  const protoBody =
    protoOn && eligibility ? (
      <>
        {/* HR12: ห้าม emoji ใน UI — ใช้ icon จริง (กฎครอบ prototype ด้วย ด่านจับได้ถูกแล้ว) */}
        <p className="bg-warning/15 text-warning-ink mb-3 flex items-start gap-1.5 rounded-lg px-3 py-2 text-2xs">
          <Icon icon="flask" className="mt-0.5 shrink-0 text-sm" aria-hidden="true" />
          <span>
            โหมดทดลองดีไซน์ — กดยืนยันแล้ว<strong>ไม่บันทึกอะไรจริง</strong> แค่โชว์ข้อมูลที่จะส่ง
          </span>
        </p>
        {(() => {
          const shared = {
            items: eligibility.items.filter((i) => i.remainingQty > 0),
            onCancel: () => onCloseSheet?.(),
            onSubmit: (d: ProtoDraft) => {
              pacesToast.success(
                `[ทดลอง] จะส่ง: ${draftCount(d)} ชิ้น · ${choiceOf(d.choice!).payer}/${choiceOf(d.choice!).trackingSource}`,
              )
            },
          }
          if (protoVariant === 'B') return <VariantB {...shared} />
          if (protoVariant === 'C') return <VariantC {...shared} />
          return <VariantA {...shared} />
        })()}
      </>
    ) : null

  const body = protoBody ?? (!eligibility ? (
    <p className="text-default-700 mb-0 flex items-center gap-2 text-sm">
      <Icon icon="loader-2" className="animate-spin text-base" aria-hidden="true" />
      กำลังโหลด…
    </p>
  ) : (
    renderBody()
  ))

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
              className="btn btn-sm btn-light shrink-0"
              onClick={onCloseSheet}
              aria-label="ปิด"
            >
              <Icon icon="x" className="size-4" aria-hidden="true" />
            </button>
          </div>
          {/* min-h-0 flex-1 = ส่วนที่เลื่อนได้หดเอง เนื้อหายาวจึงไม่ดันชีตทะลุจอ */}
          <div className="card-body min-h-0 flex-1 overflow-y-auto overscroll-contain">{body}</div>
        </div>
        {protoOn && <PrototypeSwitcher />}
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
        <button type="button" className="btn btn-sm btn-light shrink-0" onClick={toggle}>
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
                        className="btn btn-sm btn-light shrink-0"
                      >
                        เปิด
                      </a>
                      <button
                        type="button"
                        className="btn btn-sm btn-light shrink-0"
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
                        className="btn btn-sm btn-primary"
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
                          className="btn btn-sm btn-light"
                          disabled={busy}
                          onClick={() => act(r.id, 'receive')}
                        >
                          ได้รับของคืนแล้ว
                        </button>
                        {/* ยกเลิกเป็นปุ่มขอบ ไม่ใช่ปุ่มทึบ — ไม่ใช่ทางที่เราอยากให้กดเป็นอันดับแรก */}
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger"
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
              ) : !form ? (
                <button type="button" className="btn btn-sm btn-primary" onClick={() => setForm(true)}>
                  <Icon icon="plus" className="size-4" aria-hidden="true" />
                  เปิดเรื่องคืนของ
                </button>
              ) : (
                <div className="border-default-200 rounded-lg border p-3">
                  <p className="text-default-900 mb-2 text-xs font-semibold">เลือกรายการที่คืน</p>
                  {eligibility.items.map((i) => (
                    <div key={i.orderItemId} className="mb-2 flex items-center gap-2">
                      <span className="text-default-800 min-w-0 flex-1 truncate text-xs">
                        {i.name}
                        <span className="text-default-500"> · คืนได้ {i.remainingQty}</span>
                      </span>
                      <input
                        type="number"
                        min={0}
                        max={i.remainingQty}
                        disabled={i.remainingQty === 0}
                        className="form-input w-20 shrink-0"
                        value={qty[i.orderItemId] ?? 0}
                        onChange={(e) =>
                          setQty((q) => ({
                            ...q,
                            // clamp ที่ปลายทางด้วย — ผู้ใช้พิมพ์เกินได้เสมอ และ service ก็กันอีกชั้น
                            [i.orderItemId]: Math.max(
                              0,
                              Math.min(i.remainingQty, Number(e.target.value) || 0),
                            ),
                          }))
                        }
                      />
                    </div>
                  ))}

                  <p className="text-default-900 mb-3 mt-2 text-xs font-semibold">
                    ยอดที่จะคืน {formatBaht(refundPreview)}
                  </p>

                  <label className="form-label text-xs">ใครออกค่าส่งคืน</label>
                  <select
                    className="form-select mb-2"
                    value={payer}
                    onChange={(e) => {
                      const p = e.target.value as ReturnPayer
                      setPayer(p)
                      // ลูกค้าออกเอง = ระบบออกเลขให้ไม่ได้ (เครดิตเป็นของร้าน) — สลับให้อัตโนมัติ
                      // ดีกว่าปล่อยให้กดแล้วเจอ error ที่แก้ไม่ถูก
                      if (p === 'BUYER' && source === RETURN_TRACKING_SOURCE.ISHIP) setSource('MANUAL')
                    }}
                  >
                    <option value="SHOP">{RETURN_PAYER_TEXT.SHOP}</option>
                    <option value="BUYER">{RETURN_PAYER_TEXT.BUYER}</option>
                  </select>

                  <label className="form-label text-xs">เลขพัสดุขากลับ</label>
                  <select
                    className="form-select mb-2"
                    value={source}
                    onChange={(e) => setSource(e.target.value as ReturnTrackingSource)}
                  >
                    {payer === 'SHOP' && (
                      <option value="ISHIP">{RETURN_TRACKING_SOURCE_TEXT.ISHIP}</option>
                    )}
                    <option value="MANUAL">{RETURN_TRACKING_SOURCE_TEXT.MANUAL}</option>
                    <option value="NONE">{RETURN_TRACKING_SOURCE_TEXT.NONE}</option>
                  </select>

                  {source === RETURN_TRACKING_SOURCE.MANUAL && (
                    <div className="mb-2 flex gap-2">
                      <input
                        className="form-input flex-1"
                        placeholder="ชื่อขนส่ง"
                        value={manualCourier}
                        onChange={(e) => setManualCourier(e.target.value)}
                      />
                      <input
                        className="form-input flex-1"
                        placeholder="เลขพัสดุ"
                        value={manualNo}
                        onChange={(e) => setManualNo(e.target.value)}
                      />
                    </div>
                  )}

                  {/* ร้านจ่ายเอง = เป็นต้นทุนเสมอ ไม่ต้องถาม (resolveCountAsCost บังคับที่ service) */}
                  {payer === 'BUYER' && (
                    <label className="mb-2 flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        className="form-checkbox"
                        checked={countAsCost}
                        onChange={(e) => setCountAsCost(e.target.checked)}
                      />
                      บันทึกค่าส่งขากลับเป็นต้นทุนร้าน (ลูกค้าออกเลขเองแต่มาเรียกเก็บร้าน)
                    </label>
                  )}

                  <input
                    className="form-input mb-3"
                    placeholder="เหตุผล (ไม่บังคับ)"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />

                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      disabled={busy || selectedLines.length === 0}
                      onClick={submit}
                    >
                      เปิดใบคืน
                    </button>
                    <button type="button" className="btn btn-sm btn-light" onClick={() => setForm(false)}>
                      ยกเลิก
                    </button>
                  </div>
                </div>
              )}
      </>
    )
  }
}
