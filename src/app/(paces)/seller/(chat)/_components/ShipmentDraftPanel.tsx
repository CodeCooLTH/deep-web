'use client'

/**
 * ShipmentDraftPanel — เนื้อในหน้าต่าง "พัสดุ" ของแชท (feature 00022, user request 2026-07-27)
 *
 * เดิมปุ่มบนการ์ดออเดอร์ยิง POST /shipments ตรง ๆ โดยส่งแค่ orderToken — ร้านแก้ที่อยู่/ขนาด/
 * ขนส่ง/COD ไม่ได้เลย ทั้งที่เพิ่งคุยเรื่องที่อยู่กับลูกค้าอยู่ในห้องนั้นเอง ต้องออกไปหน้า
 * คำสั่งซื้อแล้วเดินกลับมา
 *
 * ตัวนี้เป็นแค่ตัวประกอบ: โหลด context → ตัดสินโหมด → ยืม component กลางชุดเดียวกับหน้าคำสั่งซื้อ
 * ส่วนที่เป็นเรื่องของแชทจริง ๆ มีอย่างเดียวคือ "แจ้งเลขติดตามในห้องนี้"
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import { pacesConfirmAsync } from '@/lib/paces-swal'
import { resolveOrderVocab } from '@/lib/seller-menu'
import { resolveOrderStatusBadge } from '@/lib/order-stage'
import {
  deliveredConfirmCopy,
  manualStepToast,
  MANUAL_STEP_FAILED,
  postManualStep,
} from '@/lib/manual-shipment-client'
import { toastPaymentNotice } from '@/components/safepay/iship/payment-notice-toast'
import SenderIncompleteNotice from '@/components/safepay/iship/SenderIncompleteNotice'
import ShipmentCreateForm, { type Courier } from '@/components/safepay/iship/ShipmentCreateForm'
import ShipmentLinkPanel from '@/components/safepay/iship/ShipmentLinkPanel'
import ShipmentStatusView from '@/components/safepay/iship/ShipmentStatusView'
import { useIShipCouriers } from '@/components/safepay/iship/useIShipCouriers'
import ShipForm from '@/app/(paces)/seller/(dashboard)/orders/[token]/components/ShipForm'
import type { ShipmentPanelJson, ShipmentViewJson } from '@/lib/iship/context'
import { courierInitials, courierLogoUrl } from '@/lib/iship/courier'
import {
  decidePanelView,
  isViewOnlyPanelView,
  manualDoneStep,
  orderStatusLabel,
  trackingMessage,
  type TrackingMessageMode,
} from '@/lib/chat-shipment-panel'

interface Props {
  conversationId: string
  orderToken: string
  onDone: () => void
  /**
   * รายงานว่าตอนนี้แผงเป็น "อ่านอย่างเดียว" ไหม — หน้าต่างที่ครอบอยู่ใช้ตัดสินว่าตอนกดปิด
   * ต้องถามยืนยันหรือไม่ (ดู viewOnlyRef ใน DraftOrderProvider) แผงนี้สลับระหว่างดูสถานะกับ
   * ฟอร์มได้ในตัวเอง ตัวที่รู้ความจริงจึงเป็นแผง (ตัดสินจาก decidePanelView ใน lib)
   */
  onViewOnlyChange?: (viewOnly: boolean) => void
}

type Method = 'MANUAL' | 'ISHIP' | 'ISHIP_LINK'

/** id คงที่ — ปุ่มยืนยันอยู่นอก <form> ของ ShipForm จึงอ้างผ่าน attribute form= */
const MANUAL_FORM_ID = 'chat-shipment-manual-form'

/**
 * Base: orders/[token]/components/ShipmentEntryModal.tsx (ลำดับ/ป้าย/ไอคอนต้องตรงกัน — ถ้าแก้ที่นั่น
 * แก้ที่นี่ด้วย) ต่างแค่ไอคอนอยู่บนป้ายอยู่ล่าง เพราะหน้าต่างแชทแคบ (328px) ป้าย "สร้างพัสดุ iShip"
 * แนวนอนจะหักหลายบรรทัด
 */
const SEGMENTS: { value: Method; label: string; icon: string }[] = [
  { value: 'MANUAL', label: 'ส่งเอง', icon: 'edit' },
  { value: 'ISHIP', label: 'สร้างพัสดุ iShip', icon: 'package-export' },
  { value: 'ISHIP_LINK', label: 'เลือกจาก iShip', icon: 'link' },
]

export default function ShipmentDraftPanel({ conversationId, orderToken, onDone, onViewOnlyChange }: Props) {
  const [ctx, setCtx] = useState<ShipmentPanelJson | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  /**
   * ปิดไว้เป็นค่าเริ่มต้น — การส่งข้อความหาลูกค้าเป็นการกระทำที่ถอนคืนไม่ได้
   * ร้านต้องเป็นคนเลือกจังหวะเอง (มีปุ่ม "แจ้งเลขในแชท" ในหน้าสถานะให้กดเมื่อพร้อม)
   * เดิมติ๊กไว้ให้ เลยกลายเป็นส่งอัตโนมัติทุกครั้งที่เปิดพัสดุ (user report 2026-07-29)
   */
  const [notify, setNotify] = useState(false)
  const [forceForm, setForceForm] = useState(false)
  // ค่าเริ่มต้นของร้านที่เชื่อม iShip = "สร้างพัสดุ iShip" (พฤติกรรมเดิมของแผงนี้)
  const [method, setMethod] = useState<Method>('ISHIP')
  const [sending, setSending] = useState(false)
  const [manualSubmitting, setManualSubmitting] = useState(false)
  // ขนส่งที่เลือกอยู่ในฟอร์มส่งเอง — ให้ตัวอย่างข้อความตรงกับที่จะส่งจริง
  const [manualProvider, setManualProvider] = useState<string | null>(null)
  const segRefs = useRef<(HTMLButtonElement | null)[]>([])

  const ready = ctx?.ishipState === 'READY' ? ctx : null
  const view = ctx
    ? decidePanelView({
        ishipState: ctx.ishipState,
        orderStatus: ctx.orderStatus,
        ishipShipment: ctx.shipment,
        hasManual: ctx.manualShipment !== null,
        senderBlocked: Boolean(ready?.blockedBy),
        forceForm,
      })
    : null

  const { couriers, error: couriersError } = useIShipCouriers(Boolean(ready && !ready.blockedBy))

  /**
   * "อ่านอย่างเดียว" = ไม่มีช่องให้กรอกสักช่อง (ดูสถานะ/ส่งเองแล้ว/สถานะไม่เปิดให้แจ้ง/ผู้ส่งไม่ครบ)
   * ตัวตัดสินอยู่ใน lib/chat-shipment-panel.ts ให้เทสจับได้
   */
  const viewOnly = view !== null && isViewOnlyPanelView(view)
  useEffect(() => {
    onViewOnlyChange?.(viewOnly)
  }, [viewOnly, onViewOnlyChange])

  useEffect(() => {
    let alive = true
    setLoadError(null)
    void (async () => {
      try {
        const res = await fetch(
          `/api/seller/iship/order-context?orderToken=${encodeURIComponent(orderToken)}`,
          { cache: 'no-store' },
        )
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } }
          if (alive) setLoadError(body.error?.message ?? 'โหลดข้อมูลการจัดส่งไม่สำเร็จ')
          return
        }
        const body = (await res.json()) as ShipmentPanelJson
        if (alive) setCtx(body)
      } catch {
        if (alive) setLoadError('โหลดข้อมูลการจัดส่งไม่สำเร็จ')
      }
    })()
    return () => {
      alive = false
    }
  }, [orderToken, reloadKey])

  /** แทนที่ใบ iShip ใน context */
  const patchShipment = (shipment: ShipmentViewJson | null) =>
    setCtx((c) => (c ? { ...c, shipment } : c))

  /**
   * แจ้งเลขติดตามในห้องนี้ — ข้อความประกอบที่ server (renderer ตัวเดียวกับส่งอัตโนมัติ, 00078 T14)
   * จึงส่งแค่ orderToken: server อ่านเลข/ขนส่งสดจากพัสดุที่เพิ่งบันทึกเอง
   */
  const sendTracking = useCallback(async (): Promise<boolean> => {
    const res = await fetch(`/api/chat/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'TRACKING', orderRefToken: orderToken }),
    })
    return res.ok
  }, [conversationId, orderToken])

  async function handleCreated(shipment: ShipmentViewJson) {
    // สร้างไม่ผ่าน → ไม่มีเลขให้แจ้ง ปล่อยให้หน้าสถานะแสดงเหตุผลและปุ่มลองใหม่
    if (shipment.status !== 'CREATED' || !shipment.trackingNo) {
      patchShipment(shipment)
      setForceForm(false)
      return
    }

    if (notify) {
      const ok = await sendTracking()
      // พัสดุถูกเปิดไปแล้วจริง ๆ ต่อให้ส่งข้อความไม่ผ่าน — ห้ามบอกว่า "ล้มเหลว" ลอย ๆ
      // ไม่งั้นร้านจะกดซ้ำแล้วนึกว่าไม่มีอะไรเกิดขึ้น (กันซ้ำไว้แล้วแต่ก็สับสนอยู่ดี)
      if (!ok) {
        pacesToast.warning(
          `สร้างพัสดุแล้ว (${shipment.trackingNo}) แต่ส่งข้อความไม่สำเร็จ กรุณาแจ้งลูกค้าเอง`,
        )
        patchShipment(shipment)
        setForceForm(false)
        return
      }
      // แผงกำลังจะถูกปิด → toast คือหลักฐานเดียวที่เหลือ ต้องคงคำยืนยันสำเร็จไว้ในประโยคเดียวกัน
      if (!toastPaymentNotice(shipment.paymentNotice, 'สร้างพัสดุและแจ้งเลขติดตามแล้ว'))
        pacesToast.success('สร้างพัสดุและแจ้งเลขติดตามแล้ว')
      onDone()
      return
    }

    // ไม่ได้ติ๊กแจ้ง — ปิดแผงเหมือนเคสแจ้งแล้ว (user สั่ง 2026-10-12: "สร้างเสร็จอยากให้ปิดไปเลย")
    // เดิมค้างที่หน้าสถานะเพื่อให้กด "แจ้งเลขในแชท" ได้ — ตอนนี้ toast คือหลักฐานเดียวที่เหลือ
    // จึงต้องมีเลขพัสดุในประโยค · แจ้งเลขทีหลังได้จากการ์ดออเดอร์ (เปิดหน้าต่างพัสดุใหม่)
    if (!toastPaymentNotice(shipment.paymentNotice, `สร้างพัสดุแล้ว (${shipment.trackingNo})`))
      pacesToast.success(`สร้างพัสดุแล้ว (${shipment.trackingNo})`)
    onDone()
  }

  /** ส่งเองบันทึกสำเร็จ — ลำดับเดียวกับ handleCreated และปิดเลยเช่นกัน (ShipForm ปิด toast ของตัวเองไว้) */
  async function handleManualSaved(saved: { provider: string; trackingNo: string }) {
    if (!notify) {
      pacesToast.success(`บันทึกเลขพัสดุแล้ว (${saved.trackingNo}) สถานะ "รอจัดส่ง"`)
      onDone()
      return
    }
    let ok = false
    try {
      ok = await sendTracking()
    } catch {
      ok = false
    }
    // บันทึกไปแล้วจริง — ไม่มีหน้าสถานะค้างให้กดแจ้งซ้ำ จึงต้องมีเลขในประโยค
    // (ร้านแจ้งทีหลังได้จากมุมมองส่งเองแล้วตอนเปิดหน้าต่างใหม่)
    if (ok) pacesToast.success('บันทึกเลขพัสดุและแจ้งเลขติดตามแล้ว')
    else
      pacesToast.warning(
        `บันทึกเลขพัสดุแล้ว (${saved.trackingNo}) แต่ส่งข้อความไม่สำเร็จ กรุณาแจ้งลูกค้าเอง`,
      )
    onDone()
  }

  async function notifyNow(trackingNo: string | null) {
    if (!trackingNo || sending) return
    setSending(true)
    try {
      const ok = await sendTracking()
      if (ok) pacesToast.success('แจ้งเลขติดตามในแชทแล้ว')
      else pacesToast.error('ส่งข้อความไม่สำเร็จ กรุณาลองใหม่')
    } catch {
      pacesToast.error('ส่งข้อความไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setSending(false)
    }
  }

  /**
   * 00080 — "จัดส่งแล้ว" / "ส่งสำเร็จ" จากแผง · busy ใช้ตัว `sending` ร่วมกับปุ่มแจ้งเลข (กันกดสองปุ่มพร้อมกัน)
   * สำเร็จ → toast ในแชท → onDone() · ล้ม → แผงไม่ปิด (ให้กดซ้ำได้)
   */
  async function runStep(action: 'DISPATCH' | 'DELIVER') {
    if (sending) return
    const noun = resolveOrderVocab(ctx?.vertical ?? 'ONLINE_SALES').noun
    if (action === 'DISPATCH') {
      setSending(true)
      try {
        const t = manualStepToast('dispatch', await postManualStep(orderToken, 'dispatch'), noun)
        pacesToast.chat[t.type](t.message)
        if (t.type !== 'error') onDone()
        else setReloadKey((k) => k + 1) // 409/403 = สถานะเปลี่ยนไปแล้ว โหลด context ใหม่
      } catch {
        pacesToast.chat.error(MANUAL_STEP_FAILED)
        setReloadKey((k) => k + 1)
      } finally {
        setSending(false)
      }
      return
    }
    const result = await pacesConfirmAsync({
      ...deliveredConfirmCopy(noun, ctx?.isCodUnpaid === true),
      run: async () => {
        setSending(true)
        try {
          return await postManualStep(orderToken, 'delivered')
        } finally {
          setSending(false)
        }
      },
    })
    if (!result) return
    const t = manualStepToast('delivered', result, noun)
    pacesToast.chat[t.type](t.message)
    if (t.type !== 'error') onDone()
    else setReloadKey((k) => k + 1)
  }

  /** ทางออกของใบ FAILED / ผู้ส่งไม่ครบ — ไปฟอร์มส่งเอง (ปิดทางตันของ state-snapshots กับดัก FAILED) */
  function goManual() {
    setMethod('MANUAL')
    setForceForm(true)
  }

  async function copyTracking(trackingNo: string) {
    try {
      await navigator.clipboard.writeText(trackingNo)
      pacesToast.success('คัดลอกเลขติดตามแล้ว')
    } catch {
      // clipboard ต้องการ https — บน dev ที่ไม่ใช่ https จะล้มเหลว ให้บอกตามตรง
      pacesToast.warning('คัดลอกอัตโนมัติไม่ได้ กรุณาเลือกและคัดลอกด้วยตัวเอง')
    }
  }

  // ลูกศรซ้าย/ขวา + Home/End ตาม APG ของ radiogroup (เหมือน ShipmentEntryModal)
  const onSegKeyDown = (e: React.KeyboardEvent, index: number) => {
    const delta =
      e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    let next = -1
    if (delta !== 0) next = (index + delta + SEGMENTS.length) % SEGMENTS.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = SEGMENTS.length - 1
    if (next < 0) return
    e.preventDefault()
    setMethod(SEGMENTS[next].value)
    segRefs.current[next]?.focus()
  }

  /** ช่องติ๊กแจ้งในแชท + ตัวอย่างข้อความ — ใช้ร่วมกันทั้งฟอร์ม iShip และฟอร์มส่งเอง */
  const notifyBlock = (mode: TrackingMessageMode, courierName: string | null, verb: string) => (
    <>
      <label className="flex min-h-11 items-start gap-2">
        <input
          type="checkbox"
          className="form-checkbox mt-0.5"
          checked={notify}
          onChange={(e) => setNotify(e.target.checked)}
        />
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-default-900">แจ้งเลขติดตามในแชทหลัง{verb}</span>
          <span className="block text-xs text-default-700">
            ส่งเป็นข้อความให้ลูกค้าในห้องนี้ทันทีที่{verb}เสร็จ
          </span>
          {mode === 'MANUAL' && ctx?.trackingNoticeTiming === 'ON_DISPATCH' && (
            <span className="mt-0.5 block text-xs text-default-700">
              ร้านตั้งให้ส่งเลขตอนกด &quot;จัดส่งแล้ว&quot;
            </span>
          )}
        </span>
      </label>

      {notify && (
        <div className="mt-2 rounded-lg border border-dashed border-default-300 bg-default-50 px-3 py-2.5">
          <p className="mb-1 text-xs font-semibold tracking-wide text-default-700">ข้อความที่ลูกค้าจะได้รับ</p>
          {/* ยังไม่มีเลขจริงจนกว่าจะบันทึกสำเร็จ — ห้ามโชว์เลขตัวอย่างให้เข้าใจผิด
              ตัวอย่างนี้ยังประกอบฝั่ง client (trackingMessage — preview เท่านั้น เพราะยังไม่มีเลข) ข้อความจริงประกอบที่ server */}
          <p className="mb-0 whitespace-pre-line text-xs text-default-700">
            {trackingMessage(mode, null, courierName)}
          </p>
        </div>
      )}
    </>
  )

  const ghostBtn =
    'btn inline-flex w-full items-center justify-center gap-2 text-default-700 hover:bg-default-100 min-h-11'

  if (loadError) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <p className="mb-0 flex items-start gap-2 rounded-lg bg-danger/15 px-3 py-2.5 text-sm text-danger">
          <Icon icon="tabler:alert-circle" className="mt-0.5 shrink-0 text-base" aria-hidden="true" />
          <span>{loadError}</span>
        </p>
        <button
          type="button"
          onClick={() => setReloadKey((k) => k + 1)}
          className="btn inline-flex w-full items-center justify-center gap-2 bg-primary p-3 text-white hover:bg-primary-hover"
        >
          <Icon icon="tabler:refresh" className="text-base" aria-hidden="true" />
          ลองใหม่
        </button>
      </div>
    )
  }

  if (!ctx || !view) {
    return (
      <div className="flex flex-col gap-3 p-4" aria-busy="true">
        <span className="h-24 animate-pulse rounded-lg bg-default-100" />
        <span className="h-32 animate-pulse rounded-lg bg-default-100" />
        <span className="h-11 animate-pulse rounded-lg bg-default-100" />
      </div>
    )
  }

  // กล่อง D — สถานะ "ปกติ" ที่แจ้งเลขไม่ได้ ใช้ warning ไม่ใช่แดง และไม่มีปุ่มตัน
  if (view === 'STATUS_BLOCKED') {
    return (
      <div className="p-4">
        <p className="mb-0 flex items-start gap-2 rounded-lg bg-warning/15 px-3 py-2.5 text-sm text-warning-ink">
          <Icon icon="tabler:alert-triangle" className="mt-0.5 shrink-0 text-base" aria-hidden="true" />
          <span>
            คำสั่งซื้อนี้อยู่สถานะ{orderStatusLabel(ctx.orderStatus)} จึงแจ้งเลขพัสดุไม่ได้ ตรวจสถานะได้ที่การ์ดคำสั่งซื้อ
          </span>
        </p>
      </div>
    )
  }

  // มุมมอง C — ส่งเองไปแล้ว ไม่มีข้อมูลขนส่งให้ติดตาม จึงไม่มี timeline และไม่ใช้สีเขียว
  // (ไม่มีใครยืนยัน — เลขมาจากมือร้านเอง)
  if (view === 'MANUAL_DONE' && ctx.manualShipment) {
    const { provider, trackingNo } = ctx.manualShipment
    const logo = courierLogoUrl(null, provider)
    const step = manualDoneStep(ctx.orderStatus)
    const badge = step.stage ? resolveOrderStatusBadge(ctx.orderStatus, step.stage) : resolveOrderStatusBadge(ctx.orderStatus)
    return (
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-start gap-3">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt={provider} className="ring-default-200 size-11 shrink-0 rounded-lg object-contain ring-1" />
          ) : (
            <span className="bg-default-100 text-default-700 flex size-11 shrink-0 items-center justify-center rounded-lg text-sm font-bold">
              {courierInitials(provider, null)}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => void copyTracking(trackingNo)}
              aria-label={`คัดลอกเลขติดตาม ${trackingNo}`}
              className="btn -ms-1 inline-flex max-w-full items-center gap-2 p-1 text-start"
            >
              <span className="min-w-0 truncate text-lg font-bold tabular-nums text-default-900">{trackingNo}</span>
              <span className="bg-primary/15 text-primary-ink flex size-7 shrink-0 items-center justify-center rounded-lg">
                <Icon icon="tabler:copy" className="text-base" aria-hidden="true" />
              </span>
            </button>
            <p className="mb-0 mt-1 flex min-w-0 items-center gap-2">
              <span className="shrink-0 rounded-full bg-default-100 px-2 py-0.5 text-xs font-medium text-default-700">
                ส่งเอง
              </span>
              {/* ป้ายสถานะจาก SSOT เดียวกับหน้าออเดอร์ — ห้ามประกอบ class เอง */}
              <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}>
                <Icon icon={`tabler:${badge.icon}`} className="text-sm" aria-hidden="true" />
                {badge.label}
              </span>
              <span className="min-w-0 truncate text-xs text-default-700">{provider}</span>
            </p>
          </div>
        </div>
        {step.action && (
          <p className="mb-0 text-xs text-default-700">
            {step.action === 'DISPATCH'
              ? 'ยังไม่ได้ส่งออก กด "จัดส่งแล้ว" เมื่อนำพัสดุไปส่ง · ระบบไม่ได้ติดตามสถานะกับขนส่งให้'
              : 'ส่งออกแล้ว กด "ส่งสำเร็จ" เมื่อลูกค้าได้รับของ · ระบบไม่ได้ติดตามสถานะกับขนส่งให้'}
          </p>
        )}
        {!step.action && <p className="mb-0 text-xs text-default-700">ส่งเอง ระบบจึงไม่ได้ติดตามสถานะพัสดุให้</p>}
        {step.action && (
          <button
            type="button"
            onClick={() => void runStep(step.action!)}
            disabled={sending}
            aria-busy={sending || undefined}
            className="btn inline-flex min-h-12 w-full items-center justify-center gap-2 bg-primary p-3 text-white hover:bg-primary-hover disabled:opacity-60"
          >
            <Icon
              icon={sending ? 'tabler:loader-2' : step.action === 'DISPATCH' ? 'tabler:truck-delivery' : 'tabler:circle-check'}
              className={sending ? 'animate-spin text-base' : 'text-base'}
              aria-hidden="true"
            />
            {step.action === 'DISPATCH' ? 'จัดส่งแล้ว' : 'ส่งสำเร็จ'}
          </button>
        )}
        <button
          type="button"
          onClick={() => void notifyNow(trackingNo)}
          disabled={sending}
          className={step.action ? `${ghostBtn} disabled:opacity-60` : 'btn inline-flex w-full items-center justify-center gap-2 bg-primary p-3 text-white hover:bg-primary-hover disabled:opacity-60'}
        >
          <Icon icon="tabler:send" className="text-base" aria-hidden="true" />
          แจ้งเลขในแชท
        </button>
        <p className="mb-0 text-xs text-default-700">
          <Link href={`/orders/${orderToken}`} className="inline-flex min-h-11 items-center text-primary-ink underline">
            แก้เลขพัสดุได้ที่หน้าคำสั่งซื้อ
          </Link>
        </p>
      </div>
    )
  }

  if (view === 'SENDER_BLOCKED' && ready?.blockedBy) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <SenderIncompleteNotice missing={ready.blockedBy.missing} missingReceiver={ready.missingReceiver} />
        <button type="button" onClick={goManual} className={ghostBtn}>
          <Icon icon="tabler:edit" className="text-base" aria-hidden="true" />
          ส่งเองแทน
        </button>
      </div>
    )
  }

  if (view === 'ISHIP_STATUS' && ctx.shipment) {
    return (
      <>
        <ShipmentStatusView
          shipment={ctx.shipment}
          // ผู้รับ/สินค้ามากับ context ที่โหลดไว้แล้ว — ไม่มีคำขอเพิ่ม (user 2026-08-07 "ข้อมูลน้อย")
          receiver={ready?.receiver}
          items={ready?.items}
          onCancelled={() => {
            patchShipment(null)
            setForceForm(false)
          }}
          onRetried={(s) => patchShipment(s)}
          onEditRequest={() => setForceForm(true)}
          actions={
            <button
              type="button"
              onClick={() => void notifyNow(ctx.shipment?.trackingNo ?? null)}
              disabled={sending || !ctx.shipment.trackingNo}
              // w-full: ปุ่มนี้ไปนั่งใน flex-1 ของแถบล่างใน ShipmentStatusView ต้องกางเต็มช่องที่ได้
              className="btn inline-flex w-full items-center justify-center gap-1.5 bg-primary py-2.5 text-white hover:bg-primary-hover disabled:opacity-60"
            >
              {sending ? (
                <span className="inline-block size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <Icon icon="tabler:send" className="text-base" aria-hidden="true" />
              )}
              แจ้งเลขในแชท
            </button>
          }
        />
        {ctx.shipment.status === 'FAILED' && (
          <div className="px-4 pb-4">
            <button type="button" onClick={goManual} className={ghostBtn}>
              <Icon icon="tabler:edit" className="text-base" aria-hidden="true" />
              ส่งเองแทน
            </button>
          </div>
        )}
      </>
    )
  }

  /**
   * ฟอร์มส่งเอง — reuse ShipForm ของหน้าคำสั่งซื้อ (alwaysOpen + hideActions) ปุ่มยืนยันวาดเองในกระแส
   * (หน้าต่างแชทไม่มี sticky footer) แล้วยิง submit กลับผ่าน form=
   */
  const manualSection = (
    <div className="flex flex-col gap-3 p-4">
      <p className="mb-0 text-xs text-default-700">
        ส่งของกับขนส่งเอง แล้วกรอกเลขพัสดุที่นี่ ออเดอร์จะอยู่ที่ &quot;รอจัดส่ง&quot; จนกว่าจะกด &quot;จัดส่งแล้ว&quot;
      </p>
      <ShipForm
        publicToken={orderToken}
        alwaysOpen
        hideActions
        showShipCost={ctx?.canSetShipCost === true}
        silentSuccess
        formId={MANUAL_FORM_ID}
        onSuccess={(saved) => void handleManualSaved(saved)}
        onSubmittingChange={setManualSubmitting}
        onProviderChange={setManualProvider}
      />
      <div className="border-t border-default-200 pt-3">{notifyBlock('MANUAL', manualProvider, 'บันทึก')}</div>
      <button
        type="submit"
        form={MANUAL_FORM_ID}
        disabled={manualSubmitting}
        className="btn inline-flex w-full items-center justify-center gap-2 bg-primary p-3 text-white hover:bg-primary-hover disabled:opacity-60"
      >
        {manualSubmitting ? (
          <Icon icon="tabler:loader-2" className="animate-spin text-base" aria-hidden="true" />
        ) : (
          <Icon icon="tabler:truck" className="text-base" aria-hidden="true" />
        )}
        {manualSubmitting ? 'กำลังบันทึก...' : 'บันทึกเลขพัสดุ'}
      </button>
    </div>
  )

  // ร้านไม่เชื่อม iShip / ผู้ส่งไม่ครบแล้วเลือกส่งเองแทน — "ส่งเอง" คือทั้งหน้าต่าง ไม่มีแถบเลือก
  if (view === 'MANUAL_ONLY' || !ready) return manualSection

  /**
   * segmented 3 ทาง — โครง/ลำดับ/ป้ายตาม ShipmentEntryModal (radiogroup + roving tabindex)
   *
   * โชว์แม้ตอน forceForm (ลองใหม่หลังล้มเหลว) โดยเจตนา — เคส "ยิงสำเร็จแต่คำตอบหาย"
   * คือเคสที่กด "ลองใหม่" ซ้ำเท่าไรก็ไม่ช่วย ต้องมาหาใบที่เกิดขึ้นจริงแล้วผูกเอง
   * ปิดทั้งแถบตอนกำลังบันทึกส่งเอง กันสลับแท็บแล้ว unmount ฟอร์มที่กำลังรอ response
   */
  const SEG = 'btn inline-flex flex-1 flex-col items-center justify-center gap-1 px-1 text-xs min-h-11'
  const segCls = (active: boolean) =>
    active
      ? `${SEG} bg-primary text-white border border-primary`
      : `${SEG} border border-default-300 bg-card text-default-700 hover:bg-default-50`

  const modeSwitch = (
    <div className="flex px-4 pt-4" role="radiogroup" aria-label="เลือกวิธีจัดส่ง">
      {SEGMENTS.map((seg, i) => (
        <button
          key={seg.value}
          ref={(el) => {
            segRefs.current[i] = el
          }}
          type="button"
          role="radio"
          aria-checked={method === seg.value}
          tabIndex={method === seg.value ? 0 : -1}
          onKeyDown={(e) => onSegKeyDown(e, i)}
          onClick={() => setMethod(seg.value)}
          disabled={manualSubmitting}
          className={`${segCls(method === seg.value)} ${
            i === 0 ? 'rounded-e-none' : i === SEGMENTS.length - 1 ? '-ms-px rounded-s-none' : '-ms-px rounded-none'
          } disabled:opacity-60`}
        >
          <Icon icon={`tabler:${seg.icon}`} className="text-sm" aria-hidden="true" />
          {seg.label}
        </button>
      ))}
    </div>
  )

  if (method === 'MANUAL') {
    return (
      <div>
        {modeSwitch}
        {manualSection}
      </div>
    )
  }

  if (method === 'ISHIP_LINK') {
    return (
      <div>
        {modeSwitch}
        <ShipmentLinkPanel
          orderToken={orderToken}
          onLinked={handleCreated}
          onSwitchToCreate={() => setMethod('ISHIP')}
        />
      </div>
    )
  }

  return (
    <div>
      {modeSwitch}
      <ShipmentCreateForm
        orderToken={orderToken}
        missingReceiver={ready.missingReceiver}
        receiver={ready.receiver}
        sender={ready.sender}
        items={ready.items}
        codSuggested={ready.codSuggested}
        defaults={ready.defaults}
        couriers={couriers as Courier[]}
        couriersError={couriersError}
        onCreated={handleCreated}
        onExists={() => {
          setForceForm(false)
          setReloadKey((k) => k + 1)
        }}
        extraFields={({ courierName }) => notifyBlock('ISHIP', courierName, 'สร้าง')}
      />
    </div>
  )
}
