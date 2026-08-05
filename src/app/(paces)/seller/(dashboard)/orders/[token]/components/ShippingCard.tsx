'use client'

/**
 * ShippingCard — การ์ด "การจัดส่ง" แบบอ่านอย่างเดียวบนหน้ารายละเอียด
 *
 * ทำไมต้องมี: ตอนรื้อหน้านี้เป็นโครงธีม Paces (2026-08-05) การ์ดที่เคยแสดงเลขพัสดุถูกลบไปพร้อม
 * OrderFactsCard — ผลคือ **ออเดอร์ที่ส่งของแล้วเปิดหน้ามาไม่เห็นเลขพัสดุเลย** ต้องกดเข้าโมดัลก่อน
 * ถึงจะเห็น (grep ยืนยัน: ไม่มีการ์ดไหนใน 5 ใบ render trackingNo)
 *
 * ขอบเขต = "สรุป" ไม่ใช่ "รายละเอียด":
 *   - ที่นี่: โลโก้ขนส่ง + เลขพัสดุ + คัดลอก + แถบ 4 ขั้น + การเดินทาง 3 รายการล่าสุด
 *   - รายละเอียดเต็ม (น้ำหนัก/ค่าส่ง/ที่อยู่ผู้ส่ง/ปุ่มยกเลิก) อยู่ในโมดัลเดิมที่ ShipmentStatusView
 *     ทำอยู่แล้ว — **ไม่ทำซ้ำ** ตรรกะขั้น/สถานะดึงจาก lib/iship/status.ts ตัวเดียวกันทั้งสองที่
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/components/
 *       ShippingActivity.tsx (card + card-header + card-body) — โครงการ์ดเดียวกับพี่น้องในหน้านี้
 */

import { useCallback, useEffect, useState } from 'react'
import Image from 'next/image'
import Icon from '@/components/wrappers/Icon'
import { cn } from '@/utils/helpers'
import { pacesToast } from '@/lib/paces-toast'
import { formatDateTimeTH } from '@/lib/format-date'
import { courierInitials, courierLogoUrl } from '@/lib/iship/courier'
import { SHIPMENT_STAGES, describeProgress } from '@/lib/iship/status'

/** เหตุการณ์ที่ /api/seller/iship/shipments/[id]/traces คืนมา */
type TraceEvent = {
  status: string | null
  statusText: string | null
  statusDesc: string | null
  location: string | null
  occurredAt: string | null
}

export type ShippingCardProps = {
  /** พัสดุ iShip — null = ร้านกรอกเลขพัสดุเอง หรือยังไม่มีพัสดุ */
  iship: {
    id: string
    status: string
    carrierStatus: string | null
    courierName: string | null
    courierCode: string | null
    trackingNo: string | null
    isDryRun: boolean
    /** เหตุการณ์ล่าสุดที่ server มีอยู่แล้ว — ไม่ต้องรอ fetch ถึงจะเห็นอะไร */
    lastTracedAtISO: string | null
  } | null
  /** เลขพัสดุที่ร้านพิมพ์เอง (ShipmentTracking) — คนละตารางกับ iShip โดยสิ้นเชิง */
  manual: { provider: string | null; trackingNo: string; shippedAtISO: string | null } | null
  /** เปิดโมดัลรายละเอียด/จัดการพัสดุใบเดิม */
  onOpenDetail?: () => void
}

export default function ShippingCard({ iship, manual, onOpenDetail }: ShippingCardProps) {
  const [traces, setTraces] = useState<TraceEvent[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [checkedAt, setCheckedAt] = useState<string | null>(iship?.lastTracedAtISO ?? null)

  const courierName = iship?.courierName ?? manual?.provider ?? null
  const courierCode = iship?.courierCode ?? null
  const trackingNo = iship?.trackingNo ?? manual?.trackingNo ?? null
  const logo = courierLogoUrl(courierCode, courierName)
  const progress = iship ? describeProgress(iship.status, iship.carrierStatus) : null

  const handleCopy = async () => {
    if (!trackingNo) return
    try {
      await navigator.clipboard.writeText(trackingNo)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = trackingNo
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    pacesToast.success('คัดลอกเลขพัสดุแล้ว')
  }

  /**
   * ดึงสถานะจากฝั่ง iShip เดี๋ยวนั้น — มีเฉพาะพัสดุที่เปิดผ่าน iShip
   * ร้านที่พิมพ์เลขพัสดุเองไม่มีปุ่มนี้ เพราะเราไม่ได้เป็นคนคุยกับขนส่งให้ จะไปถามแทนไม่ได้
   */
  const shipmentId = iship?.id ?? null
  const fetchTraces = useCallback(
    async (announce: boolean) => {
      if (!shipmentId) return
      setLoading(true)
      try {
        const res = await fetch(`/api/seller/iship/shipments/${shipmentId}/traces`, { cache: 'no-store' })
        if (!res.ok) throw new Error('ดึงสถานะจาก iShip ไม่สำเร็จ')
        const data = (await res.json()) as { data?: TraceEvent[] } | TraceEvent[]
        const list = Array.isArray(data) ? data : (data.data ?? [])
        setTraces(list)
        setCheckedAt(new Date().toISOString())
        if (announce) {
          pacesToast.success(list.length > 0 ? `อัปเดตแล้ว ${list.length} เหตุการณ์` : 'ขนส่งยังไม่มีข้อมูลการเดินทาง')
        }
      } catch (err) {
        // ตอนเปิดหน้าไม่ต้องเด้ง toast — ผู้ใช้ไม่ได้สั่งอะไร เด้ง error ใส่เท่ากับรบกวนเปล่า ๆ
        // (กล่องด้านล่างขึ้นข้อความบอกเองว่าดึงไม่ได้ พร้อมปุ่มให้ลองใหม่)
        if (announce) pacesToast.error(err instanceof Error ? err.message : 'ดึงสถานะจาก iShip ไม่สำเร็จ')
        setTraces([])
      } finally {
        setLoading(false)
      }
    },
    [shipmentId],
  )

  /**
   * ยิงเองตอนเปิดหน้า — user 2026-08-05: "ทำไมต้องมากด refresh อีกที ทั้งที่เข้ามายิงให้เลยก็ได้"
   *
   * ไม่ขัด NFR เดิมของ feature 00022 ที่ห้าม prefetch: ข้อนั้นพูดถึง**หน้ารายการ**ที่มีออเดอร์
   * เป็นสิบ ๆ ใบ (ค่าใช้จ่ายโตตามจำนวนออเดอร์) — ที่นี่ผู้ใช้เปิดใบเดียวเจาะจงแล้ว การยิง 1 ครั้ง
   * ต่อการเปิดหน้าคือความหมายตรงตัวของ "โหลดเมื่อผู้ใช้เปิดดู"
   */
  useEffect(() => {
    if (!shipmentId) return
    void fetchTraces(false)
  }, [shipmentId, fetchTraces])

  // ไม่มีทั้งพัสดุ iShip และเลขที่กรอกเอง → ไม่ render การ์ดว่าง (ปุ่มแจ้งเลขพัสดุอยู่หัวหน้าแล้ว)
  //
  // [สำคัญ] ต้องอยู่ "หลัง" hook ทุกตัว — เดิมอยู่บนสุดก่อน useCallback/useEffect ทำให้ตอน
  // ผูกพัสดุสำเร็จ (iship เปลี่ยน null → มีค่า ผ่าน router.refresh) จำนวน hook เพิ่มระหว่าง
  // render → React error #310 พังทั้งหน้าเป็น "Application error: a client-side exception"
  // (เกิดจริงบน prod 2026-08-05 สองครั้ง: ออเดอร์ cacdbf13 11:53 และ 31e0f85e 12:15)
  if (!iship && !manual) return null

  const visibleTraces = traces?.slice(0, 3) ?? []

  return (
    <div className="card">
      <div className="card-header">
        <h4 className="card-title">การจัดส่ง</h4>
        <div className="flex items-center gap-2">
          {/* iShip = แพลตฟอร์มที่เปิดพัสดุให้ คนละชั้นกับบริษัทขนส่งที่วิ่งของจริง —
              ร้านต้องแยกออกว่าใบนี้เราเปิดให้ (ยกเลิก/ตามได้) หรือร้านไปเปิดเองที่เคาน์เตอร์ */}
          {iship ? (
            <span className="badge bg-default-100 text-default-800 flex items-center gap-1.5 ps-1">
              <Image alt="" className="size-4.5 shrink-0 rounded object-cover" height={18} src="/images/logos/iship.jpeg" width={18} />
              เปิดพัสดุผ่าน iShip
            </span>
          ) : (
            <span className="badge bg-default-100 text-default-800">ร้านแจ้งเลขเอง</span>
          )}
          {iship && (
            <button
              aria-label="ดึงสถานะจาก iShip เดี๋ยวนี้"
              className="btn btn-icon border-default-300 text-default-700 hover:text-primary size-8! rounded-full border disabled:opacity-60"
              disabled={loading}
              onClick={() => void fetchTraces(true)}
              title="ดึงสถานะจาก iShip เดี๋ยวนี้"
              type="button"
            >
              <Icon icon={loading ? 'loader-2' : 'refresh'} className={cn('text-base', loading && 'animate-spin')} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      <div className="card-body">
        {iship?.isDryRun && (
          <p className="bg-warning/15 text-warning-ink mb-4 flex items-center gap-2 rounded-lg px-3 py-2 text-xs">
            <Icon icon="flask" className="shrink-0 text-base" aria-hidden="true" />
            พัสดุจำลอง (โหมดทดสอบ) — ไม่ได้ส่งออกไปที่ขนส่งจริง
          </p>
        )}

        <div className="flex items-center gap-3.5">
          {/* เต็มกรอบ ไม่มีขอบ (user 2026-08-05) — ทำได้เพราะไฟล์โลโก้ขนส่งทุกตัวใน
              public/images/logos/ เป็นจัตุรัสหมด (ตรวจแล้ว 447x447 / 554 / 240) object-cover
              จึงไม่ครอปอะไรทิ้ง · โลโก้เจ้าใหม่ที่ไม่จัตุรัสต้องครอปเป็นจัตุรัสก่อนวางไฟล์ */}
          <span className="bg-default-100 flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl">
            {logo ? (
              <Image alt={courierName ?? 'ขนส่ง'} className="size-full object-cover" height={56} src={logo} width={56} />
            ) : (
              <span className="text-default-700 text-xs font-bold">{courierInitials(courierName, courierCode)}</span>
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-default-800 mb-0.5 truncate text-sm font-medium">{courierName ?? 'ไม่ระบุขนส่ง'}</p>
            <div className="flex items-center gap-2">
              {/* ห้าม font-mono — Anuphan ไม่มี mono จะ fallback Courier หลุดธีม; tabular-nums พอ */}
              <span className="text-default-900 truncate text-base font-bold tabular-nums">{trackingNo ?? '—'}</span>
              {trackingNo && (
                <button
                  aria-label="คัดลอกเลขพัสดุ"
                  className="btn btn-icon border-default-300 text-default-700 hover:text-primary size-8! shrink-0 rounded-full border"
                  onClick={handleCopy}
                  title="คัดลอกเลขพัสดุ"
                  type="button"
                >
                  <Icon icon="copy" className="text-base" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* แถบ 4 ขั้น — เฉพาะพัสดุ iShip เพราะมีแต่ใบนั้นที่เรารู้สถานะจากขนส่งจริง
            เลขที่ร้านพิมพ์เอง เรารู้แค่ว่า "ร้านบอกว่าส่งแล้ว" จะวาดแถบความคืบหน้าไม่ได้ */}
        {progress && (
          <>
            <ol className="mt-5 grid list-none grid-cols-4 ps-0">
              {SHIPMENT_STAGES.map((s, i) => {
                const reached = i <= progress.stage
                const isLast = i === SHIPMENT_STAGES.length - 1
                return (
                  <li className="flex flex-col items-center gap-1.5" key={s.label}>
                    <div className="flex w-full items-center">
                      {/* ครึ่งซ้ายของจุดแรกและครึ่งขวาของจุดสุดท้ายต้องโปร่ง ไม่งั้นแถบยื่นเลยปลายทั้งสองข้าง */}
                      <span className={cn('h-0.5 flex-1', i === 0 ? 'bg-transparent' : reached ? 'bg-success' : 'bg-default-200')} />
                      <span
                        className={cn(
                          'flex size-8 shrink-0 items-center justify-center rounded-full',
                          i === progress.stage
                            ? 'bg-primary text-white'
                            : reached
                              ? 'bg-success text-white'
                              : 'bg-default-100 text-default-500',
                        )}
                      >
                        <Icon icon={s.icon} className="text-base" aria-hidden="true" />
                      </span>
                      <span className={cn('h-0.5 flex-1', isLast ? 'bg-transparent' : i < progress.stage ? 'bg-success' : 'bg-default-200')} />
                    </div>
                    <span
                      className={cn(
                        'text-2xs text-center leading-tight',
                        i === progress.stage ? 'text-default-900 font-semibold' : 'text-default-700',
                      )}
                    >
                      {isLast ? (progress.lastLabel ?? s.label) : s.label}
                    </span>
                  </li>
                )
              })}
            </ol>

            {progress.notice && (
              <p className="bg-warning/15 text-default-800 mt-4 mb-0 flex items-start gap-2 rounded-lg px-3 py-2 text-xs">
                <Icon icon="alert-circle" className="text-warning-ink mt-0.5 shrink-0 text-base" aria-hidden="true" />
                <span>{progress.notice.text}</span>
              </p>
            )}
          </>
        )}

        {iship && (
          <div className="border-default-200 mt-5 border-t border-dashed pt-4">
            <p className="text-default-800 mb-2.5 text-xs font-semibold">การเดินทางล่าสุด</p>

            {traces === null || (loading && visibleTraces.length === 0) ? (
              <p className="text-default-700 mb-0 flex items-center gap-2 text-xs">
                <Icon icon="loader-2" className="animate-spin text-sm" aria-hidden="true" />
                กำลังดึงสถานะจาก iShip…
              </p>
            ) : visibleTraces.length === 0 ? (
              <p className="text-default-700 mb-0 text-xs">
                ขนส่งยังไม่บันทึกการเดินทางของพัสดุใบนี้ — กดปุ่มรีเฟรชที่หัวการ์ดเพื่อลองใหม่
              </p>
            ) : (
              <div className="space-y-2">
                {visibleTraces.map((t, i) => (
                  <div className="flex gap-3 text-xs" key={`${t.occurredAt ?? ''}-${i}`}>
                    <span className="text-default-700 w-20 shrink-0 md:w-25">
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

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              {onOpenDetail && (
                <button
                  className="text-primary hover:text-primary-hover inline-flex items-center gap-0.5 text-xs font-semibold"
                  onClick={onOpenDetail}
                  type="button"
                >
                  ดูรายละเอียดพัสดุ
                  <Icon icon="chevron-right" className="text-sm" aria-hidden="true" />
                </button>
              )}
              {/* บอกความสดของข้อมูล ไม่งั้นร้านไม่รู้ว่าที่เห็นคือของเมื่อไร */}
              {checkedAt && <span className="text-default-700 text-xs">ตรวจกับ iShip ล่าสุด {formatDateTimeTH(checkedAt)}</span>}
            </div>
          </div>
        )}

        {/* เลขที่ร้านพิมพ์เอง — บอกตรง ๆ ว่าทำไมไม่มีแถบสถานะ ไม่ปล่อยให้เดาว่าจอพัง */}
        {!iship && manual && (
          <p className="text-default-700 mt-4 mb-0 text-xs">
            เลขพัสดุนี้ร้านเป็นคนกรอกเอง ระบบจึงติดตามสถานะกับขนส่งให้ไม่ได้
            {manual.shippedAtISO && ` · แจ้งเมื่อ ${formatDateTimeTH(manual.shippedAtISO)}`}
          </p>
        )}
      </div>
    </div>
  )
}
