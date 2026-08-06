'use client'

/**
 * ShipmentHoverCard — hover ที่บล็อก "จัดส่งโดย" แล้วขึ้นการ์ดสถานะพัสดุเต็ม ๆ
 * (user สั่ง 2026-08-06 พร้อมภาพตัวอย่าง)
 *
 * ในการ์ดมี: โลโก้+ชื่อขนส่ง · เลขพัสดุ+ปุ่มคัดลอก · stepper 4 ขั้นพร้อมคำกำกับ ·
 * "การเดินทางล่าสุด" ที่ **ยิงถาม iShip สด ๆ ตอน hover ครั้งแรก** พร้อม spinner
 *
 * ทำไมยิงตอน hover ไม่ใช่ตอนโหลดหน้า: หน้า /orders มี 10-50 แถว การ prefetch traces
 * ทุกแถวคือหลักสิบคำขอต่อการเปิดหน้าหนึ่งครั้ง ทั้งที่ร้านเปิดดูจริงไม่กี่ใบ
 *
 * ยิงครั้งเดียวต่อการเปิดหน้า (จำผลไว้ใน state) — เอาเมาส์เข้า-ออกซ้ำ ๆ ไม่ยิงซ้ำ
 *
 * Base: การ์ดการจัดส่งใน orders/[token]/components/ShippingCard.tsx (บล็อก stepper +
 *       "การเดินทางล่าสุด" ย่อส่วนลงมาให้พอดี panel) และ MiniShipmentTimeline (จุด/สี)
 */

import { Fragment, useCallback, useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import HoverPanel from './HoverPanel'
import CopyLinkButton from '@/app/(paces)/seller/(dashboard)/orders/[token]/components/CopyLinkButton'
import { cn } from '@/utils/helpers'
import { formatDateTimeTH } from '@/lib/format-date'
import { SHIPMENT_STAGES } from '@/lib/iship/status'
import type { ShippingStageKey } from '@/lib/order-stage'

/** เหตุการณ์ที่ /api/seller/iship/shipments/[id]/traces คืนมา (รูปเดียวกับ ShippingCard) */
type TraceEvent = {
  status: string | null
  statusText: string | null
  statusDesc: string | null
  location: string | null
  occurredAt: string | null
}

/** จุดปัจจุบันต่อ stage — ต้องตรงกับ MiniShipmentTimeline เป๊ะ (จอเดียวกันห้ามพูดคนละขั้น) */
const CURRENT_INDEX: Record<ShippingStageKey, number | null> = {
  AWAITING_PARCEL: null,
  AWAITING_PICKUP: 0,
  SHIPPING: 2,
  PROBLEM: 2,
  AWAITING_COD: 4,
  DONE: 4,
}

interface Props {
  children: React.ReactNode
  stage: ShippingStageKey | undefined
  /** id ของ OrderShipment — null = พัสดุที่ร้านแจ้งเลขเอง (ไม่มี traces ให้ถาม) */
  shipmentId: string | null
  trackingNo: string | null
  courierName: string | null
  logoUrl: string | null
  courierInitials: string
}

export default function ShipmentHoverCard({
  children,
  stage,
  shipmentId,
  trackingNo,
  courierName,
  logoUrl,
  courierInitials: initials,
}: Props) {
  const [traces, setTraces] = useState<TraceEvent[] | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')

  const load = useCallback(() => {
    if (state !== 'idle' || !shipmentId) return
    setState('loading')
    void (async () => {
      try {
        const res = await fetch(`/api/seller/iship/shipments/${shipmentId}/traces`, {
          cache: 'no-store',
        })
        if (!res.ok) throw new Error('failed')
        const data = (await res.json()) as { data?: TraceEvent[] } | TraceEvent[]
        setTraces(Array.isArray(data) ? data : (data.data ?? []))
        setState('done')
      } catch {
        // ล้มแล้วไม่ขึ้น toast — ร้านไม่ได้สั่งอะไร แค่เอาเมาส์ไปวาง การเด้ง error
        // ใส่หน้าเพราะเลื่อนเมาส์ผ่านคือการรบกวนที่ไม่มีใครขอ
        setState('error')
      }
    })()
  }, [shipmentId, state])

  const cur = stage != null ? CURRENT_INDEX[stage] : null
  const problem = stage === 'PROBLEM'

  const dot = (i: number) => {
    const reached = cur != null && i <= cur
    const isCurrent = cur != null && i === cur
    return (
      <span
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-full',
          problem && isCurrent
            ? 'bg-danger text-white'
            : isCurrent
              ? 'bg-primary text-white'
              : reached
                ? 'bg-success text-white'
                : 'bg-default-100 text-default-500',
        )}
      >
        <Icon icon={SHIPMENT_STAGES[i].icon} className="text-base" aria-hidden="true" />
      </span>
    )
  }

  return (
    <HoverPanel width={340} onOpen={load} trigger={<div>{children}</div>}>
      <div className="p-3.5">
        {/* หัว: โลโก้ + ชื่อขนส่ง + เลขพัสดุ + คัดลอก */}
        <div className="flex items-start gap-2.5">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt=""
              /* object-contain + ring: โลโก้ 2:1 (Fuze) ห้ามครอป, พื้นขาวต้องมีขอบ */
              className="ring-default-200 size-11 shrink-0 rounded-lg bg-white object-contain ring-1"
            />
          ) : (
            <span className="bg-default-100 text-default-700 flex size-11 shrink-0 items-center justify-center rounded-lg text-xs font-bold">
              {initials}
            </span>
          )}
          <div className="min-w-0">
            <p className="text-default-700 mb-0 truncate text-xs">{courierName ?? '—'}</p>
            <p className="mb-0 flex items-center gap-1">
              {/* ห้าม font-mono (Anuphan ไม่มี mono จะ fallback หลุดธีม) — tabular-nums พอ */}
              <span className="text-default-900 select-all text-sm font-bold tabular-nums">
                {trackingNo ?? '—'}
              </span>
              {trackingNo && (
                <CopyLinkButton
                  value={trackingNo}
                  label="คัดลอกเลขพัสดุ"
                  successMessage="คัดลอกเลขพัสดุแล้ว"
                  iconOnly
                  className="btn-sm border-none bg-transparent p-0 text-default-400 hover:bg-transparent hover:text-default-800"
                />
              )}
            </p>
          </div>
        </div>

        {/* stepper 4 ขั้น พร้อมคำกำกับใต้จุด */}
        {cur != null && (
          <div className="mt-3.5">
            <div className="flex items-center">
              {SHIPMENT_STAGES.map((s, i) => (
                <Fragment key={s.label}>
                  {i > 0 && (
                    <span className={cn('h-0.5 flex-1', i <= cur ? 'bg-success' : 'bg-default-200')} />
                  )}
                  {dot(i)}
                </Fragment>
              ))}
            </div>
            <div className="mt-1.5 flex items-start">
              {SHIPMENT_STAGES.map((s, i) => {
                const isLast = i === SHIPMENT_STAGES.length - 1
                return (
                  <Fragment key={s.label}>
                    {i > 0 && <span className="flex-1" />}
                    <span
                      className={cn(
                        'flex w-8 shrink-0',
                        i === 0 ? 'justify-start' : isLast ? 'justify-end' : 'justify-center',
                      )}
                    >
                      <span
                        className={cn(
                          'text-2xs leading-tight whitespace-nowrap',
                          i === cur ? 'text-default-900 font-semibold' : 'text-default-700',
                        )}
                      >
                        {s.label}
                      </span>
                    </span>
                  </Fragment>
                )
              })}
            </div>
          </div>
        )}

        {/* การเดินทางล่าสุด — ยิงถาม iShip ตอน hover ครั้งแรก */}
        {shipmentId && (
          <div className="border-default-200 mt-3.5 border-t border-dashed pt-3">
            <p className="text-default-800 mb-2 text-xs font-semibold">การเดินทางล่าสุด</p>
            {state === 'loading' || state === 'idle' ? (
              <p className="text-default-700 mb-0 flex items-center gap-2 text-xs">
                <Icon icon="loader-2" className="animate-spin text-sm" aria-hidden="true" />
                กำลังดึงสถานะจาก iShip…
              </p>
            ) : state === 'error' ? (
              <p className="text-default-700 mb-0 text-xs">
                ดึงสถานะไม่สำเร็จ — เปิดหน้าคำสั่งซื้อเพื่อลองใหม่
              </p>
            ) : (traces?.length ?? 0) === 0 ? (
              <p className="text-default-700 mb-0 text-xs">ขนส่งยังไม่บันทึกการเดินทางของพัสดุใบนี้</p>
            ) : (
              <div className="space-y-2">
                {/* 4 รายการล่าสุดพอ — panel ที่ต้องเลื่อนอ่านคือ panel ที่หุบทันทีที่เมาส์หลุด */}
                {traces!.slice(0, 4).map((t, i) => (
                  <div className="flex gap-2.5 text-xs" key={`${t.occurredAt ?? ''}-${i}`}>
                    <span className="text-default-700 w-24 shrink-0">
                      {t.occurredAt ? formatDateTimeTH(t.occurredAt) : '—'}
                    </span>
                    <span className="text-default-800">
                      {t.statusText ?? t.statusDesc ?? t.status ?? 'อัปเดตสถานะ'}
                      {t.location && <span className="text-default-700"> · {t.location}</span>}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </HoverPanel>
  )
}
