'use client'

/**
 * ShipmentHoverCard — hover ที่บล็อก "จัดส่งโดย" แล้วขึ้นการ์ดสถานะพัสดุเต็ม ๆ
 * (user สั่ง 2026-08-06 พร้อมภาพตัวอย่าง)
 *
 * ในการ์ดมี: โลโก้+ชื่อขนส่ง · เลขพัสดุ+ปุ่มคัดลอก · stepper 4 ขั้นพร้อมคำกำกับ ·
 * "สถานะล่าสุด" ที่ **ยิงถาม iShip สด ๆ ตอน hover ครั้งแรก** พร้อม spinner
 *
 * ทำไมยิงตอน hover ไม่ใช่ตอนโหลดหน้า: หน้า /orders มี 10-50 แถว การ prefetch traces
 * ทุกแถวคือหลักสิบคำขอต่อการเปิดหน้าหนึ่งครั้ง ทั้งที่ร้านเปิดดูจริงไม่กี่ใบ
 *
 * ยิงครั้งเดียวต่อการเปิดหน้า (จำผลไว้ใน state) — เอาเมาส์เข้า-ออกซ้ำ ๆ ไม่ยิงซ้ำ
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/pages/timeline/page.tsx การ์ด "Timeline with
 *       Icons" (แถว flex → คอลัมน์จุดไอคอนกลม + เส้นประเชื่อม → คอลัมน์เนื้อหา) ย่อส่วนให้พอดี
 *       panel 340px และ MiniShipmentTimeline (จุด/สี) สำหรับ stepper ด้านบน
 */

import { useCallback, useMemo, useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import HoverPanel from './HoverPanel'
import CopyLinkButton from '@/app/(paces)/seller/(dashboard)/orders/[token]/components/CopyLinkButton'
import { TONE_DOT_SOLID, TONE_DOT_TINT } from '@/components/safepay/iship/tone'
import { cn } from '@/utils/helpers'
import { formatDateTimeTH } from '@/lib/format-date'
import { SHIPMENT_STAGES, describeCarrierStatus, describeProgress } from '@/lib/iship/status'
import { describeReturnLeg, railAriaLabel } from '@/lib/iship/return-timeline'
import ShipmentRail from '@/components/safepay/iship/ShipmentRail'
import { sortTracesNewestFirst } from '@/lib/iship/traces'
import type { ShippingStageKey } from '@/lib/order-stage'
import { NOTICE_BOX, shipmentCurrentDotCls } from '@/components/safepay/iship/tone'

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
  RETURNED: 2,
  AWAITING_COD: 4,
  DONE: 4,
}

interface Props {
  children: React.ReactNode
  stage: ShippingStageKey | undefined
  /**
   * สถานะล่าสุดจากขนส่ง — มีค่า = ตัดสินขั้น/คำ/กล่องเตือนด้วย `describeProgress()`
   * **ตัวเดียวกับ `ShippingCard`** ⇒ hover กับจอข้างในพูดตรงกันเสมอ (HR16)
   */
  carrierStatus?: string | null
  /** OrderShipment.status — คู่กับ carrierStatus เป็น input ของ describeProgress */
  shipmentStatus?: string
  /**
   * เวลาของ "ขากลับ" — แถวที่ 2 ของแถบอ่านจากสองช่องนี้ (2026-08-25)
   *
   * `null` = ขนส่งไม่ได้แจ้งเวลา **ไม่ใช่ "ไม่เกิด"** — จุดสว่างตัดสินจาก `carrierStatus`
   * (6 จาก 12 ใบตีกลับบน prod ถึงร้านแล้วแต่ไม่มีเวลา เพราะสถานะมาจากรอบ poll)
   */
  returnStartedAt?: string | Date | null
  returnedAt?: string | Date | null
  returnDispatchedAt?: string | Date | null
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
  carrierStatus,
  shipmentStatus,
  returnStartedAt,
  returnedAt,
  returnDispatchedAt,
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
        // รูปร่าง `{ events, carrier }` — ดูคำอธิบายเต็มที่ ShippingCard.fetchTraces
        // (ตัวอ่านเดิมคาด array/`{data}` ⇒ ได้ `[]` ทุกครั้งโดยไม่มี error)
        const data = (await res.json()) as { events?: TraceEvent[] }
        setTraces(data.events ?? [])
        setState('done')
      } catch {
        // ล้มแล้วไม่ขึ้น toast — ร้านไม่ได้สั่งอะไร แค่เอาเมาส์ไปวาง การเด้ง error
        // ใส่หน้าเพราะเลื่อนเมาส์ผ่านคือการรบกวนที่ไม่มีใครขอ
        setState('error')
      }
    })()
  }, [shipmentId, state])

  /**
   * ล่าสุดอยู่บนสุด — เรียงเอง ไม่พึ่งลำดับที่ API ส่งมา
   *
   * [บั๊กที่แก้ 2026-08-07] `getTraces` คืน `orderBy: { occurredAt: "asc" }` = เก่าสุดก่อน
   * แล้วโค้ดเดิมทำ `.slice(0, 4)` ตรง ๆ → สิ่งที่ขึ้นใต้หัวข้อ "การเดินทางล่าสุด" มาตลอดคือ
   * เหตุการณ์ **เก่าสุด 4 อัน** (พัสดุที่เดินมา 10 ขั้นจะค้างอยู่ที่ "พัสดุเข้าระบบ" ตลอดกาล)
   *
   * เรียงด้วย occurredAt เอง ไม่ใช่ `.slice(-4).reverse()` เพราะแบบหลังผูกกับ orderBy ฝั่ง
   * service — วันที่มีใครไปแก้ตรงนั้น หน้านี้จะเงียบ ๆ กลับไปแสดงผิดอีกโดยไม่มีอะไรฟ้อง
   *
   * [2026-08-19] ตรรกะการเรียงย้ายไป `@/lib/iship/traces` แล้ว — บั๊กเดียวกันนี้ยังนอนอยู่ใน
   * `ShipmentStatusView` (โมดัลแชท) กับ `ShippingCard` (หน้าออเดอร์) อีก 12 วัน เพราะการแก้
   * รอบนั้นแก้เฉพาะไฟล์ที่ user ชี้ ทั้งที่ทั้งสามจออ่าน endpoint เดียวกัน
   */
  const visible = useMemo(
    // 4 รายการล่าสุดพอ — panel ที่ต้องเลื่อนอ่านคือ panel ที่หุบทันทีที่เมาส์หลุด
    () => sortTracesNewestFirst(traces ?? []).slice(0, 4),
    [traces],
  )

  /**
   * 🛑 ขนส่งบอกเองชนะกองงานที่เราจัดให้ — `describeProgress()` เป็น SSOT ตัวเดียวกับที่
   * `ShippingCard` ในหน้ารายละเอียดใช้ ส่วน `CURRENT_INDEX` derive จาก `ShippingStageKey`
   * ที่มีแค่ 6 ค่า จึงแยก `return` (จุดที่ 3) กับ `return_success` (จุดที่ 4 + คำว่า
   * "ส่งคืนสำเร็จ") ออกจากกันไม่ได้ ⇒ การ์ดนี้เคยขึ้น "กำลังจัดส่ง" ตัวหนาให้พัสดุที่กลับมา
   * ถึงร้านแล้ว ขณะที่จอข้างในของออเดอร์ใบเดียวกันขึ้นถูก (user เจอบน prod 2026-08-24)
   *
   * ไม่มี carrierStatus (ร้านแจ้งเลขเอง) → ถอยไปใช้ตารางหยาบเหมือนเดิม
   */
  const progress = carrierStatus != null ? describeProgress(shipmentStatus ?? 'CREATED', carrierStatus, 'seller') : null
  const rawCur = progress ? progress.stage : stage != null ? CURRENT_INDEX[stage] : null
  const cur = rawCur != null && rawCur >= 0 ? rawCur : null
  /** สีจุดปัจจุบัน + คำขั้นสุดท้าย — SSOT ร่วมกับ MiniShipmentTimeline และ ShippingCard */
  const currentDot = shipmentCurrentDotCls(progress?.notice)

  /**
   * แถวที่ 2 ("ขากลับ") — `null` = ออเดอร์ปกติ ไม่วาดแถว 2 เลย
   *
   * 🛑 ยังไม่ส่ง `orderReturn` มา ⇒ การ์ดนี้เห็นเฉพาะเคส **ตีกลับ** ยังไม่เห็นเคส
   * **คืนของ (00056)** เพราะหน้ารายการยังไม่ join `OrderReturn` เข้า query (บน prod มี
   * 0 แถว จึงยังไม่คุ้มค่า join บนเส้นทางที่ร้อนที่สุด) — วันที่จะเปิด แก้ที่ query ที่เดียว
   * ไม่ต้องแตะ UI เลย เพราะ `describeReturnLeg` รับทั้งสองกลไกด้วยรูปแบบเดียวกันอยู่แล้ว
   */
  const leg = describeReturnLeg({
    audience: 'seller',
    carrierStatus,
    returnStartedAt,
    returnedAt,
    returnDispatchedAt,
  })

  const lastIdx = SHIPMENT_STAGES.length - 1
  const stepLabel = (i: number) =>
    i === lastIdx ? (progress?.lastLabel ?? SHIPMENT_STAGES[i].label) : SHIPMENT_STAGES[i].label
  /** คำของขั้นที่ยืนอยู่บนแถว 1 — ใช้ประกอบประโยคให้ screen reader */
  const currentStepLabel = stepLabel(Math.min(cur ?? 0, lastIdx))

  return (
    <HoverPanel
      width={340}
      /* ~400px = หัว(โลโก้+เลขพัสดุ) + stepper 4 ขั้น + ไทม์ไลน์ 4 แถวสองบรรทัด
         ค่าเดิม 320 คิดจากไทม์ไลน์บรรทัดเดียว พอเปลี่ยนเป็นแถวมีไอคอน+สองบรรทัด
         panel สูงขึ้น ~70px แล้วท้ายการ์ดจะหลุดขอบจอเวลา hover แถวช่วงกลางหน้า */
      estimatedHeight={400}
      onOpen={load}
      /* w-fit: cell คอลัมน์ที่อยู่กว้างกว่าบล็อกนี้มาก ถ้าปล่อยเป็น block เต็ม cell
         ที่ว่างขวามือก็เปิด panel ด้วย = "hover ห่างมาก ๆ ก็ขึ้น" (user เจอ 2026-08-07) */
      className="w-fit"
      trigger={<div>{children}</div>}
    >
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

        {/* แถบ 2 แถว (ขาไป + ขากลับ) — markup อยู่ใน ShipmentRail ตัวเดียวที่ทุกจอ Paces ใช้ร่วม */}
        {cur != null && (
          <div className="mt-3.5">
            <ShipmentRail
              stage={cur}
              lastLabel={progress?.lastLabel}
              lastIcon={progress?.lastIcon}
              currentDotCls={currentDot}
              leg={leg}
              ariaLabel={railAriaLabel(currentStepLabel, leg)}
            />


            {/* กล่องเตือนเมื่อออกนอกเส้นทางปกติ — ข้อความชุดเดียวกับหน้ารายละเอียด
                เดิมการ์ดนี้ไม่มีเลย ⇒ ผู้ขายเห็นแต่จุดเปลี่ยนสี ไม่รู้ว่าต้องทำอะไรต่อ */}
            {progress?.notice && (
              <p
                className={cn(
                  'text-2xs mt-3 mb-0 flex items-start gap-1.5 rounded-lg px-2.5 py-1.5',
                  NOTICE_BOX[progress.notice.tone] ?? NOTICE_BOX.secondary,
                )}
              >
                <Icon icon="alert-circle" className="mt-0.5 shrink-0 text-sm" aria-hidden="true" />
                <span>{progress.notice.text}</span>
              </p>
            )}
          </div>
        )}

        {/* สถานะล่าสุด — ยิงถาม iShip ตอน hover ครั้งแรก */}
        {shipmentId && (
          <div className="border-default-200 mt-3.5 border-t border-dashed pt-3">
            <p className="text-default-800 mb-2 text-xs font-semibold">สถานะล่าสุด</p>
            {state === 'loading' || state === 'idle' ? (
              <p className="text-default-700 mb-0 flex items-center gap-2 text-xs">
                <Icon icon="loader-2" className="animate-spin text-sm" aria-hidden="true" />
                กำลังดึงสถานะจาก iShip…
              </p>
            ) : state === 'error' ? (
              <p className="text-default-700 mb-0 text-xs">
                ดึงสถานะไม่สำเร็จ — เปิดหน้าคำสั่งซื้อเพื่อลองใหม่
              </p>
            ) : visible.length === 0 ? (
              <p className="text-default-700 mb-0 text-xs">ขนส่งยังไม่บันทึกการเดินทางของพัสดุใบนี้</p>
            ) : (
              <div>
                {visible.map((t, i) => {
                  const meta = describeCarrierStatus(t.status)
                  const latest = i === 0
                  const isLast = i === visible.length - 1
                  return (
                    <div className="flex gap-x-2.5" key={`${t.occurredAt ?? ''}-${i}`}>
                      {/* เส้นประเป็น element จริง ไม่ใช่ ::after แบบธีม — ของธีมคำนวณ offset จาก
                          ขนาดจุดคงที่ พอจุดแถวล่าสุดใหญ่กว่าแถวประวัติ (28 vs 24) เส้นจะไม่ต่อกัน
                          บทเรียนเดียวกับ ShippingActivity.tsx ที่วัดจริงแล้วได้เส้นสูง 0px */}
                      <div className="flex shrink-0 flex-col items-center">
                        <span
                          className={cn(
                            'flex shrink-0 items-center justify-center rounded-full',
                            latest ? 'size-7' : 'size-6',
                            (latest ? TONE_DOT_SOLID : TONE_DOT_TINT)[meta.tone],
                          )}
                        >
                          <Icon
                            icon={meta.icon}
                            className={latest ? 'text-base' : 'text-sm'}
                            aria-hidden="true"
                          />
                        </span>
                        {!isLast && <span className="border-default-300 w-px flex-1 border-e border-dashed" />}
                      </div>

                      {/* px-2 เท่ากันทุกแถวเพื่อให้ข้อความเรียงตรงกัน — แถวล่าสุดต่างแค่มีพื้นทินท์
                          พื้นเป็น default (เทากลาง) ไม่ใช่สี semantic: กรอบนี้แปลว่า "อันนี้คือ
                          อันล่าสุด" ไม่ได้แปลว่าสถานะดี/ร้าย ความหมายนั้นอยู่ที่สีของจุดแล้ว */}
                      <div
                        className={cn(
                          'min-w-0 flex-1 rounded-lg px-2 py-1',
                          latest && 'bg-default-50',
                          !isLast && 'mb-2',
                        )}
                      >
                        <p
                          className={cn(
                            'mb-0 text-xs break-words',
                            latest ? 'text-default-900 font-semibold' : 'text-default-800 font-medium',
                          )}
                        >
                          {t.statusText ?? t.statusDesc ?? meta.text}
                        </p>
                        {/* เวลาอยู่บรรทัดที่ 2 ไม่ใช่คอลัมน์ซ้ายแบบธีม — วันที่ไทยเต็ม
                            "07 ส.ค. 2569 09:58" กินคอลัมน์ ~100px จาก 312px ที่ panel มี
                            เหลือให้ข้อความสถานะ+สถานที่ไม่พอจนตัดเป็น 3 บรรทัดทุกแถว */}
                        <p className="text-default-700 mb-0 text-2xs tabular-nums">
                          {t.occurredAt ? formatDateTimeTH(t.occurredAt) : '—'}
                          {t.location && <span> · {t.location}</span>}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </HoverPanel>
  )
}
