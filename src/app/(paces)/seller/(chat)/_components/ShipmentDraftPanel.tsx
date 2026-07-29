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

import { useCallback, useEffect, useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import SenderIncompleteNotice from '@/components/safepay/iship/SenderIncompleteNotice'
import ShipmentCreateForm, { type Courier } from '@/components/safepay/iship/ShipmentCreateForm'
import ShipmentStatusView from '@/components/safepay/iship/ShipmentStatusView'
import { useIShipCouriers } from '@/components/safepay/iship/useIShipCouriers'
import type { ShipmentContextJson, ShipmentViewJson } from '@/lib/iship/context'

interface Props {
  conversationId: string
  orderToken: string
  onDone: () => void
}

/** ข้อความแจ้งเลข — ข้อความธรรมดา ใช้ได้ทุกช่องทาง (Messenger/IG ไม่รองรับการ์ดของเรา) */
function trackingMessage(trackingNo: string, courierName: string | null): string {
  return courierName
    ? `จัดส่งด้วย ${courierName}\nเลขติดตามพัสดุ: ${trackingNo}`
    : `เลขติดตามพัสดุ: ${trackingNo}`
}

export default function ShipmentDraftPanel({ conversationId, orderToken, onDone }: Props) {
  const [ctx, setCtx] = useState<ShipmentContextJson | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  /**
   * ปิดไว้เป็นค่าเริ่มต้น — การส่งข้อความหาลูกค้าเป็นการกระทำที่ถอนคืนไม่ได้
   * ร้านต้องเป็นคนเลือกจังหวะเอง (มีปุ่ม "แจ้งเลขในแชท" ในหน้าสถานะให้กดเมื่อพร้อม)
   * เดิมติ๊กไว้ให้ เลยกลายเป็นส่งอัตโนมัติทุกครั้งที่เปิดพัสดุ (user report 2026-07-29)
   */
  const [notify, setNotify] = useState(false)
  const [forceForm, setForceForm] = useState(false)
  const [sending, setSending] = useState(false)

  const { couriers, error: couriersError } = useIShipCouriers(!!ctx && !ctx.blockedBy)

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
        const body = (await res.json()) as ShipmentContextJson
        if (alive) setCtx(body)
      } catch {
        if (alive) setLoadError('โหลดข้อมูลการจัดส่งไม่สำเร็จ')
      }
    })()
    return () => {
      alive = false
    }
  }, [orderToken, reloadKey])

  /** ส่งเลขติดตามเข้าห้องแชทนี้ */
  const sendTracking = useCallback(
    async (shipment: ShipmentViewJson): Promise<boolean> => {
      if (!shipment.trackingNo) return false
      const res = await fetch(`/api/chat/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'TEXT',
          body: trackingMessage(shipment.trackingNo, shipment.courierName),
        }),
      })
      return res.ok
    },
    [conversationId],
  )

  async function handleCreated(shipment: ShipmentViewJson) {
    // สร้างไม่ผ่าน → ไม่มีเลขให้แจ้ง ปล่อยให้หน้าสถานะแสดงเหตุผลและปุ่มลองใหม่
    if (shipment.status !== 'CREATED' || !shipment.trackingNo) {
      setCtx((c) => (c ? { ...c, shipment } : c))
      setForceForm(false)
      return
    }

    if (notify) {
      const ok = await sendTracking(shipment)
      // พัสดุถูกเปิดไปแล้วจริง ๆ ต่อให้ส่งข้อความไม่ผ่าน — ห้ามบอกว่า "ล้มเหลว" ลอย ๆ
      // ไม่งั้นร้านจะกดซ้ำแล้วนึกว่าไม่มีอะไรเกิดขึ้น (กันซ้ำไว้แล้วแต่ก็สับสนอยู่ดี)
      if (!ok) {
        pacesToast.warning(
          `สร้างพัสดุแล้ว (${shipment.trackingNo}) แต่ส่งข้อความไม่สำเร็จ กรุณาแจ้งลูกค้าเอง`,
        )
        setCtx((c) => (c ? { ...c, shipment } : c))
        setForceForm(false)
        return
      }
      pacesToast.success('สร้างพัสดุและแจ้งเลขติดตามแล้ว')
      onDone()
      return
    }

    // ไม่ได้ติ๊กแจ้ง — ต้องอยู่ที่หน้าสถานะต่อ ไม่ใช่ปิดแผงทิ้ง
    // เพราะปุ่ม "แจ้งเลขในแชท" อยู่ในนั้น ปิดไปแล้วร้านจะไม่มีทางกดส่งเองได้จากตรงนี้
    pacesToast.success(`สร้างพัสดุแล้ว (${shipment.trackingNo})`)
    setCtx((c) => (c ? { ...c, shipment } : c))
    setForceForm(false)
  }

  async function handleNotifyNow() {
    if (!ctx?.shipment?.trackingNo || sending) return
    setSending(true)
    try {
      const ok = await sendTracking(ctx.shipment)
      if (ok) pacesToast.success('แจ้งเลขติดตามในแชทแล้ว')
      else pacesToast.error('ส่งข้อความไม่สำเร็จ กรุณาลองใหม่')
    } catch {
      pacesToast.error('ส่งข้อความไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setSending(false)
    }
  }

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

  if (!ctx) {
    return (
      <div className="flex flex-col gap-3 p-4" aria-busy="true">
        <span className="h-24 animate-pulse rounded-lg bg-default-100" />
        <span className="h-32 animate-pulse rounded-lg bg-default-100" />
        <span className="h-11 animate-pulse rounded-lg bg-default-100" />
      </div>
    )
  }

  if (ctx.blockedBy) {
    return (
      <div className="p-4">
        <SenderIncompleteNotice
          missing={ctx.blockedBy.missing}
          missingReceiver={ctx.missingReceiver}
        />
      </div>
    )
  }

  if (ctx.shipment && !forceForm) {
    return (
      <ShipmentStatusView
        shipment={ctx.shipment}
        onCancelled={() => {
          setCtx((c) => (c ? { ...c, shipment: null } : c))
          setForceForm(false)
        }}
        onRetried={(s) => setCtx((c) => (c ? { ...c, shipment: s } : c))}
        onEditRequest={() => setForceForm(true)}
        actions={
          <button
            type="button"
            onClick={handleNotifyNow}
            disabled={sending || !ctx.shipment.trackingNo}
            className="btn inline-flex items-center justify-center gap-1.5 bg-primary py-2.5 text-white hover:bg-primary-hover disabled:opacity-60"
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
    )
  }

  return (
    <ShipmentCreateForm
      orderToken={orderToken}
      missingReceiver={ctx.missingReceiver}
      receiver={ctx.receiver}
      sender={ctx.sender}
      items={ctx.items}
      codSuggested={ctx.codSuggested}
      defaults={ctx.defaults}
      couriers={couriers as Courier[]}
      couriersError={couriersError}
      onCreated={handleCreated}
      onExists={() => {
        setForceForm(false)
        setReloadKey((k) => k + 1)
      }}
      extraFields={({ courierName }) => (
        <>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              className="form-checkbox mt-0.5"
              checked={notify}
              onChange={(e) => setNotify(e.target.checked)}
            />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-default-900">
                แจ้งเลขติดตามในแชทหลังสร้าง
              </span>
              <span className="block text-xs text-default-500">
                ส่งเป็นข้อความให้ลูกค้าในห้องนี้ทันทีที่เปิดพัสดุสำเร็จ
              </span>
            </span>
          </label>

          {notify && (
            <div className="mt-2 rounded-lg border border-dashed border-default-300 bg-default-50 px-3 py-2.5">
              <p className="mb-1 text-xs font-semibold tracking-wide text-default-400">
                ข้อความที่ลูกค้าจะได้รับ
              </p>
              {/* ยังไม่มีเลขจริงจนกว่าจะสร้างสำเร็จ — ห้ามโชว์เลขตัวอย่างให้เข้าใจผิด */}
              <p className="mb-0 whitespace-pre-line text-xs text-default-700">
                {courierName ? `จัดส่งด้วย ${courierName}\n` : ''}
                เลขติดตามพัสดุ: (จะแสดงหลังสร้างพัสดุสำเร็จ)
              </p>
            </div>
          )}
        </>
      )}
    />
  )
}
