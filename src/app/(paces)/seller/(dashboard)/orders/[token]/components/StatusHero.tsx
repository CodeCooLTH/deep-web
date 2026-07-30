/**
 * StatusHeroV2 — สถานะ + action zone ใน card เดียว (Option D — Action-Prominent Lean)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/components/OrderSummary.tsx
 *   (card shell + card-body p-7.5 + md:flex-row layout)
 * Base: StatusHero.tsx เดิม (info zone — badges/h3/p คัดลอก 100%)
 *
 * Action zone: ปุ่มแสดง inline ตรง ๆ แทน ⋮ dropdown — ลบ hs-dropdown ทิ้งทั้งก้อน
 * (user request 2026-06-16: ต้องการเห็นปุ่มโดยตรง ไม่ต้องกด ⋮ ก่อน)
 */
'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Icon from '@/components/wrappers/Icon'
import { formatDateTime } from '@/lib/format-date'
import { formatOrderNo } from '@/lib/order-no'
import { ORDER_STATUS_META } from '@/lib/order-display'
import ShipForm from './ShipForm'
import SendSmsButton from './SendSmsButton'
import OrderCopyLink from './OrderCopyLink'
import CancelOrderButton from './CancelOrderButton'

// SSOT ย้ายไป src/lib/order-display.ts (ORDER_STATUS_META) — ชิปเลขออเดอร์ใน inbox ใช้ชุดเดียวกัน
// re-export ชื่อเดิมไว้ กัน import ที่อื่นพัง (ปัจจุบันใช้เฉพาะในไฟล์นี้)
export const STATUS_META = ORDER_STATUS_META

// TYPE_META ถูกลบ — type badge ถอดออกไปตั้งแต่ 2026-06-16 (user request) และไม่มีใคร import
// ต่อ (grep ยืนยัน 0 ผู้ใช้) การคง export ที่ไม่มีใครใช้ไว้ทำให้เข้าใจผิดว่ายังมี badge ประเภทสินค้า

export interface StatusHeroProps {
  publicToken: string
  shortCode?: string | null
  status: string
  type: string
  createdAtISO: string
  fulfillmentMode: string
  /** true = order เกิดจากการชนะประมูล (มี auctionId) → badge ค้อนประมูล */
  isFromAuction?: boolean
  /** เลขติดตาม/ขนส่งจากพัสดุ iShip ที่เปิดไว้แล้ว — เติมให้ ShipForm ล่วงหน้า (feature 00022) */
  ishipTrackingNo?: string | null
  ishipCourierName?: string | null
}

/**
 * ปุ่มแก้ไขออเดอร์ — เดิมหน้ารายละเอียดไม่มี entry point เลย (มีแต่ในหน้ารายการ)
 * style ตรงกับปุ่ม outline ของ SendSmsButton/CopyLinkButton (btn-sm + border-default-300)
 * min-h-11 = 44px touch target
 */
function EditOrderLink({ publicToken }: { publicToken: string }) {
  return (
    <Link
      href={`/orders/${publicToken}/edit`}
      className="btn btn-sm border border-default-300 bg-card hover:bg-default-50 text-default-700 inline-flex items-center gap-1.5 text-xs min-h-11"
    >
      <Icon icon="pencil" className="text-base" aria-hidden="true" />
      แก้ไข
    </Link>
  )
}

export default function StatusHero({ publicToken, shortCode, status, createdAtISO, fulfillmentMode, isFromAuction, ishipTrackingNo, ishipCourierName }: StatusHeroProps) {
  const s = STATUS_META[status] ?? { label: status, cls: 'bg-default-100 text-default-700', icon: 'help-circle' }

  // วันที่+เวลาแสดงคู่กันบรรทัดเดียว → ยุบเป็น formatDateTime ครั้งเดียว
  const createdDisplay = formatDateTime(createdAtISO)

  const isPending   = status === 'PENDING'
  const isShipped   = status === 'SHIPPED'
  const isConfirmed = status === 'CONFIRMED'
  const isCancelled = status === 'CANCELLED'
  // needsShipping: ตัดสิน primary CTA ว่าต้องแสดงปุ่ม ShipForm หรือ SendSmsButton
  const needsShipping = fulfillmentMode === 'SHIPPED'

  // ขั้นต่อไปที่ seller ต้องทำ — ภาษาบอกงาน ไม่ใช่บอกสถานะ (สถานะอยู่ที่ badge แล้ว)
  // แถบตรึงโผล่เมื่อการ์ด hero เลื่อนพ้นจอ — IntersectionObserver ถูกกว่า scroll listener
  const heroRef = useRef<HTMLDivElement | null>(null)
  const [stuck, setStuck] = useState(false)
  useEffect(() => {
    const el = heroRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([entry]) => setStuck(!entry.isIntersecting), {
      // -1px กันขอบ: ให้ถือว่า "พ้นจอ" ก็ต่อเมื่อการ์ดเลื่อนขึ้นไปจนหมดจริง ๆ
      rootMargin: '-1px 0px 0px 0px',
      threshold: 0,
    })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const nextStep: string | null = isPending
    ? needsShipping
      ? 'ส่งลิงก์ให้ผู้ซื้อยืนยัน แล้วจึงกรอกเลขพัสดุเมื่อส่งของ'
      : 'ส่งลิงก์ให้ผู้ซื้อยืนยันรับสินค้า'
    : isShipped
      ? 'รอผู้ซื้อกดยืนยันรับของ — ยังไม่ต้องทำอะไรเพิ่ม'
      : null

  return (
    <>
      {/*
        แถบสรุปแบบตรึง (user request 2026-07-30: "เลื่อนลงล่างก็ยังต้องเห็น header")
        โผล่เฉพาะตอนการ์ด hero เลื่อนพ้นจอ — ไม่ตรึงทั้งการ์ดเพราะบนมือถือมี app header
        ด้านบน + SellerBottomNav (fixed 64px) ด้านล่างอยู่แล้ว ตรึงเพิ่มอีก ~150px
        จะเหลือพื้นที่อ่านจริงไม่ถึงครึ่งจอ

        top-(--topbar-height) = เกาะใต้ topbar ของ Paces (sticky top-0 z-40 ใน _topbar.css)
        ใช้ CSS var ของธีมตรง ๆ ไม่ใช่ arbitrary value (Hard Rule 7)
        h-0 + invisible ตอนยังไม่ stuck → ไม่จองพื้นที่ ไม่ดันการ์ดลง
      */}
      <div
        className={`sticky top-(--topbar-height) z-30 transition-opacity ${
          stuck ? 'opacity-100' : 'pointer-events-none invisible h-0 opacity-0'
        }`}
        aria-hidden={!stuck}
      >
        <div className="card mb-base flex-row items-center justify-between gap-3 px-4 py-2.5 shadow">
          <div className="flex min-w-0 items-center gap-2">
            <span className={`badge badge-label text-2xs shrink-0 font-semibold ${s.cls}`}>
              <Icon icon={s.icon} className="text-sm" />
              {s.label}
            </span>
            <span className="text-default-800 truncate text-sm font-medium">
              {formatOrderNo(publicToken, createdAtISO)}
            </span>
          </div>
          {/* ปุ่มหลักตัวเดียวเท่านั้นในแถบนี้ — ที่เหลืออยู่ในการ์ดด้านบน */}
          <div className="flex shrink-0 items-center gap-2">
            {isPending ? (
              <SendSmsButton publicToken={publicToken} compact />
            ) : (
              <OrderCopyLink publicToken={publicToken} shortCode={shortCode} showPreview={false} />
            )}
          </div>
        </div>
      </div>

    <div className="card" ref={heroRef}>
      <div className="card-body p-5 sm:p-7.5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">

          {/* ซ้าย: info zone — คัดลอกจาก StatusHero.tsx เดิม */}
          <div className="flex flex-col gap-1.25">
            {/* status badge — type badge ถูกเอาออก (user request 2026-06-16) */}
            <div className="flex items-center gap-1 flex-wrap">
              <span className={`badge badge-label text-2xs font-semibold ${s.cls}`}>
                <Icon icon={s.icon} className="text-sm" />
                {s.label}
              </span>
              {isFromAuction && (
                <span className="badge badge-label bg-warning/15 text-warning text-2xs font-semibold">
                  <Icon icon="gavel" className="text-sm" />
                  จากการประมูล
                </span>
              )}
            </div>
            {/* เลขคำสั่งซื้อ DP… (user 2026-07-25) — ห้าม font-mono (Anuphan ไม่มี mono → fallback Courier หลุดธีม) */}
            <h3 className="text-lg mb-0 text-default-800">
              {formatOrderNo(publicToken, createdAtISO)}
            </h3>
            {/* วันที่/เวลา — formatDateTime รวมทั้งคู่ในฟอร์แมตเดียว */}
            <p className="text-default-400 text-sm flex items-center gap-1 mb-0">
              <Icon icon="calendar" className="align-middle" />
              {createdDisplay}
            </p>
            {/* บอกตรง ๆ ว่าต้องทำอะไรต่อ — เดิมหน้านี้ไม่มี contextual help เลยสักจุด
                ทั้งที่ PRODUCT.md ตั้งเป้าผู้ใช้ digital-literacy ต่ำ. timeline บอกลำดับ
                แต่ไม่เคยบอกว่า "ตาใคร" */}
            {nextStep && (
              <p className="text-default-600 text-sm flex items-start gap-1.5 mb-0 mt-1">
                <Icon icon="arrow-right-circle" className="text-primary mt-0.5 shrink-0" aria-hidden="true" />
                <span><span className="font-medium">ขั้นต่อไป:</span> {nextStep}</span>
              </p>
            )}
          </div>

          {/* ขวา: action zone — inline buttons (ลบ hs-dropdown แล้ว, user ต้องการเห็นปุ่มตรง ๆ) */}
          <div className="flex shrink-0 flex-col gap-2 md:items-end">

            {/* PENDING + needsShipping (PHYSICAL/SHIPPED) → [คัดลอกลิงก์] [ส่ง SMS] */}
            {isPending && needsShipping && (
              <div className="flex items-center gap-2 flex-wrap">
                <OrderCopyLink publicToken={publicToken} shortCode={shortCode} showPreview={false} />
                <SendSmsButton publicToken={publicToken} compact />
                <EditOrderLink publicToken={publicToken} />
              </div>
            )}

            {/* PENDING + อื่น (NO_SHIPPING/DIGITAL/SERVICE) → [ส่ง SMS (primary)] [คัดลอกลิงก์] */}
            {isPending && !needsShipping && (
              <div className="flex items-center gap-2 flex-wrap">
                <SendSmsButton publicToken={publicToken} compact />
                <OrderCopyLink publicToken={publicToken} shortCode={shortCode} showPreview={false} />
                <EditOrderLink publicToken={publicToken} />
              </div>
            )}

            {/* SHIPPED → [คัดลอกลิงก์] [ส่ง SMS]
                callout "รอผู้ซื้อยืนยันรับสินค้า" ถูกตัดออก — ซ้ำกับบรรทัด "ขั้นต่อไป:" ฝั่งซ้ายแล้ว */}
            {isShipped && (
              <div className="flex items-center gap-2 flex-wrap">
                <OrderCopyLink publicToken={publicToken} shortCode={shortCode} showPreview={false} />
                <SendSmsButton publicToken={publicToken} compact />
              </div>
            )}

            {/* CONFIRMED → [คัดลอกลิงก์] (status badge มุมซ้ายแสดงสถานะแล้ว ไม่ซ้ำ label) */}
            {isConfirmed && (
              <div className="flex items-center gap-2 flex-wrap">
                <OrderCopyLink publicToken={publicToken} shortCode={shortCode} showPreview={false} />
              </div>
            )}

            {/* CANCELLED → [คัดลอกลิงก์] (status badge มุมซ้ายแสดงสถานะแล้ว ไม่ซ้ำ label) */}
            {isCancelled && (
              <div className="flex items-center gap-2 flex-wrap">
                <OrderCopyLink publicToken={publicToken} shortCode={shortCode} showPreview={false} />
              </div>
            )}

            {/* ยกเลิกคำสั่งซื้อ — text button เล็ก (ไม่ใช่ปุ่มขอบแดงเต็มความกว้างแล้ว)
                คืน null อัตโนมัติสำหรับ CONFIRMED/CANCELLED */}
            <CancelOrderButton publicToken={publicToken} status={status} />

          </div>
        </div>

        {/* ShipForm full-width — นอก flex row กัน layout jump; ShipForm จัดการ toggle/collapse เอง ไม่ต้องมี wrapper toggle */}
        {isPending && needsShipping && (
          <div className="mt-3 border-t border-default-300 pt-3">
            <ShipForm publicToken={publicToken} initialTrackingNo={ishipTrackingNo} initialProvider={ishipCourierName} />
          </div>
        )}
      </div>
    </div>
    </>
  )
}
