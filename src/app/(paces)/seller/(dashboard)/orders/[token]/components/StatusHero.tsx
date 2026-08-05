/**
 * StatusHero — "การ์ดหัวหน้า" ของหน้ารายละเอียดคำสั่งซื้อ (seller), v5 (T7)
 *
 * เปลี่ยนจาก Option D (Action-Prominent Lean, ปุ่ม inline เขียนเองในไฟล์นี้) มาเป็นการ์ดหัวหน้า
 * ตาม design v5: badge สถานะ + วันที่ + เลขคำสั่งซื้อ (ซ้าย) / ยอดรวม+badge ชำระเงิน (ขวา)
 * + แถบ "งานถัดไป" 1 ประโยคเต็มความกว้าง — ปุ่มทั้งหมดย้ายไปมาจาก OrderActionBar (T8) ผ่าน
 * actionSet เดียว (getOrderActionSet, T5) ไม่มี markup ปุ่มเขียนเองในไฟล์นี้อีกต่อไป
 *
 * Base: docs/superpowers/specs/2026-07-30-seller-order-detail-v5-mockup.html
 *   header() + .hd/.hd-top/.hd-id/.hd-money/.hd-next/.hd-right/.stuckbar + wireStuck()
 * Base (การ์ด shell): theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/components/OrderSummary.tsx
 *
 * แถบตรึง (S-6) — เบี่ยงจากตัวหนังสือ task เล็กน้อยโดยเจตนา ต้องอ่าน:
 *   มockup .stuckbar (บรรทัด 567-579 ของไฟล์ mockup) ประกอบจาก `.who` (badge+เลข+ยอด) แล้วต่อด้วย
 *   `headerActions(S)` ตัวเดียวกับปุ่มใน `.hd-acts` (inline) ตรง ๆ — ไม่ใช่ปุ่มชุดอื่น
 *   ในโค้ดจริง OrderActionBar variant="stuck" ประกอบเป็น bar เต็มตัวของมันเอง (sticky/w-full/
 *   justify-end/bg-card/shadow/border-b) ไม่มีช่องให้แทรก "who" (badge+เลข+ยอด) เข้าไปข้างใน
 *   (ไม่รับ children) — ถ้าใช้ variant="stuck" ตรง ๆ แล้ววาง "who" เป็น sibling จะชนกัน
 *   (ทั้งคู่ width:100% + sticky offset เดียวกัน) จึงเลือกวิธีเดียวกับที่ mockup ทำจริง:
 *   ห่อ "who" + <OrderActionBar variant="inline"> (แถวปุ่มเปล่า ไม่มี wrapper/sticky ของตัวเอง)
 *   ไว้ใน sticky wrapper ที่ไฟล์นี้สร้างเอง (คัดลอกโครง sticky เดิมจาก StatusHero.tsx ก่อนแก้)
 *   → ปุ่มยังมาจาก OrderActionBar ตัวเดียว ไม่มี markup ปุ่มซ้ำ แค่เลือก variant ที่ไม่มี
 *   chrome ชนกับ wrapper ของเราเอง — ถ้า Controller ต้องการให้ตรงตัวอักษร "variant=stuck"
 *   จริง ๆ ต้องแก้ OrderActionBar.tsx ให้รับ children/แถบซ้ายได้ (รายงานไว้ ไม่ได้แก้เอง)
 */
'use client'

import { useEffect, useRef, useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import { formatDateTime } from '@/lib/format-date'
import { formatOrderNo } from '@/lib/order-no'
import { ORDER_STATUS_META, getPaymentBadge } from '@/lib/order-display'
import type { OrderStatus } from '@/lib/order-display'
import OrderActionBar from '@/components/safepay/OrderActionBar'
import { SalesChannelLogo, getSalesChannelDisplay } from '@/components/safepay/SalesChannelBadge'
import { getOrderActionSet } from './order-action-set'
import type { ShipmentSource } from './order-action-set'

// SSOT ย้ายไป src/lib/order-display.ts (ORDER_STATUS_META) — ชิปเลขออเดอร์ใน inbox ใช้ชุดเดียวกัน
// re-export ชื่อเดิมไว้ กัน import ที่อื่นพัง (ปัจจุบันไม่มีใคร import ผ่านทางนี้แล้ว — grep ยืนยัน)
export const STATUS_META = ORDER_STATUS_META

// TYPE_META ถูกลบ — type badge ถอดออกไปตั้งแต่ 2026-06-16 (user request) และไม่มีใคร import ต่อ

export interface StatusHeroProps {
  /** ชื่อของสิ่งนั้นตามประเภทกิจการ (feature 00030) — ใช้ผันป้าย action แก้ไข/ยกเลิก */
  orderNoun?: string
  publicToken: string
  shortCode?: string | null
  status: string
  type: string
  createdAtISO: string
  fulfillmentMode: string
  /** true = order เกิดจากการชนะประมูล (มี auctionId) → badge ค้อนประมูล */
  isFromAuction?: boolean
  /**
   * ช่องทางที่ขายออเดอร์นี้ (STOREFRONT|FACEBOOK|INSTAGRAM|LINE|TIKTOK|OTHER) — null = ไม่ระบุ
   * โชว์เป็นโลโก้แบรนด์จริงในแถวเดียวกับสถานะ/วันที่ (user request 2026-08-04): ร้านที่ขาย
   * หลายช่องทางต้องรู้ตั้งแต่แวบแรกว่าใบนี้มาจากไหน โดยไม่ต้องเลื่อนลงไปหาที่การ์ดชำระเงิน
   */
  salesChannel?: string | null
  /**
   * ชื่อผู้ซื้อที่ resolve มาแล้วจาก resolveBuyerDisplayName() (lib/order-display.ts)
   * รับเป็นสตริงพร้อมแสดง ไม่ใช่ raw field — หน้า (paces) อยู่ใต้ client layout ทำให้ Next
   * serialize ทุก prop ลง flight payload จึงไม่ควรส่งข้อมูลผู้ซื้อดิบเข้ามาเกินจำเป็น
   */
  buyerLabel?: string
  /** @deprecated ย้ายไป ShippingCard แล้ว — คง prop ไว้กัน caller เดิมพัง (ไม่ถูกใช้) */
  ishipTrackingNo?: string | null
  /** @deprecated ย้ายไป ShippingCard แล้ว */
  ishipCourierName?: string | null

  // ── เพิ่มใหม่ v5 (T7) — optional ทั้งก้อน กัน page.tsx เดิม (ยังไม่ได้ต่อ prop พวกนี้) compile พัง
  //    T11 เป็นคนต่อสายค่าจริง (order.totalAmount/paymentMethod/slipFileId/shipmentSource + onAction)
  /** ยอดรวมทั้งหมด (Number จาก Prisma Decimal) — default 0 เมื่อยังไม่ถูกส่งมา (รอ T11) */
  totalAmount?: number
  paymentMethod?: string | null
  slipFileId?: string | null
  /** แหล่งที่มาพัสดุ — คุมว่ามีปุ่ม "แก้ไขเลขพัสดุ" ไหม (ผ่าน getOrderActionSet, ไม่ตัดสินเองในนี้) */
  shipmentSource?: ShipmentSource
  /** callback เมื่อกดปุ่ม action ใด ๆ — bubble ขึ้น page (T11 ต่อ logic จริง: ยิง API/เปิด modal/Swal) */
  onAction?: (key: string) => void
}

// ยอดเงิน — pattern เดียวกับ OrderSummary.tsx (formatAmount local, ยังไม่รวมเป็น helper กลาง — debt #4 ใน design spec)
function formatAmount(amount: unknown) {
  return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(Number(amount ?? 0))
}

function noop() {
  // ไม่มี business logic ในไฟล์นี้ — ถ้า page.tsx ยังไม่ได้ส่ง onAction มา (ก่อน T11 ต่อสาย) กดแล้วไม่ทำอะไร
}

export default function StatusHero({
  orderNoun,
  publicToken,
  status,
  createdAtISO,
  fulfillmentMode,
  isFromAuction,
  salesChannel,
  buyerLabel = 'ยังไม่มีผู้ซื้อยืนยัน',
  totalAmount,
  paymentMethod = null,
  slipFileId = null,
  shipmentSource = null,
  onAction,
}: StatusHeroProps) {
  // fallback (status ไม่รู้จัก, ไม่ควรเกิดในทางปฏิบัติ) — default-800 บน default-100 (~10.7:1)
  // ไม่ใช่ default-700 (~4.4:1 ตกคอนทราสต์บนพื้นนี้ — ต่างจากพื้นขาวล้วน) (T14 P1)
  const s = ORDER_STATUS_META[status] ?? { label: status, cls: 'bg-default-100 text-default-800', icon: 'help-circle' }

  // วันที่+เวลาแสดงคู่กันบรรทัดเดียว → ยุบเป็น formatDateTime ครั้งเดียว
  const createdDisplay = formatDateTime(createdAtISO)

  const paymentBadge = getPaymentBadge(status, paymentMethod, slipFileId)
  const channelLabel = getSalesChannelDisplay(salesChannel || 'OTHER').label

  // ชุด action เดียว (T5 contract) — inline (การ์ด) กับ stuck (แถบตรึง) ใช้ actionSet ตัวเดียวกันนี้
  // ไม่มี markup ปุ่มเขียนเองในไฟล์นี้อีกต่อไป (ย้ายทั้งหมดไป OrderActionBar)
  const actionSet = getOrderActionSet({
    status: status as OrderStatus,
    fulfillmentMode,
    shipmentSource,
    orderNoun,
  })
  const handleAction = onAction ?? noop
  // CANCELLED คืนชุดว่างทั้งหมด → ไม่มีทั้งเส้นประและแถวปุ่มในการ์ด
  const hasActions =
    Boolean(actionSet.primary) || actionSet.ghosts.length > 0 || actionSet.menu.length > 0

  // แถบตรึงโผล่เมื่อการ์ด hero เลื่อนพ้นจอ — IntersectionObserver ถูกกว่า scroll listener
  // reuse ของเดิมทั้งก้อน (ไม่สร้างกลไก sticky ตัวที่ 2 ตามข้อบังคับ T7)
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

  return (
    <>
      {/*
        แถบตรึง (S-6, ≥1024 เท่านั้น) — โผล่เมื่อการ์ดหัวหน้าเลื่อนพ้นจอ
        เนื้อใน: badge สถานะ + เลขคำสั่งซื้อ + ยอดรวม ("who" — เขียนเองในไฟล์นี้ ไม่ใช่ปุ่ม จึงไม่ผิดกฎ
        "ห้ามเขียน markup ปุ่มเองซ้ำ") + ชุดปุ่มเดิมผ่าน OrderActionBar variant="inline" (ดู comment
        หัวไฟล์ — เหตุผลที่ไม่ใช้ variant="stuck" ตรงตัว)

        <1024 ไม่มีแถบนี้ (ใช้ variant="bottom" ของ OrderActionBar ที่จุดอื่นแทน SellerBottomNav)
        top-(--topbar-height) = เกาะใต้ topbar ของ Paces (sticky top-0 z-40 ใน _topbar.css)
        ใช้ CSS var ของธีมตรง ๆ ไม่ใช่ arbitrary value (Hard Rule 7)
        h-0 + invisible ตอนยังไม่ stuck → ไม่จองพื้นที่ ไม่ดันการ์ดลง
      */}
      <div
        className={`hidden lg:flex sticky top-(--topbar-height) z-30 items-center justify-between gap-4 border-b border-default-300 bg-card px-5 py-2.5 shadow transition-opacity ${
          stuck ? 'opacity-100' : 'pointer-events-none invisible h-0 opacity-0'
        }`}
        aria-hidden={!stuck}
      >
        <div className="flex min-w-0 items-center gap-3">
          {/* ลำดับ เลขออเดอร์ → สถานะ ให้ตรงกับการ์ดหัวหน้า ไม่งั้นพอเลื่อนพ้นจอแล้วสองอย่างสลับที่กัน */}
          <span className="text-default-900 truncate text-sm font-bold">
            {formatOrderNo(publicToken, createdAtISO)}
          </span>
          <span className={`badge badge-label text-2xs shrink-0 font-semibold ${s.cls}`}>
            <Icon icon={s.icon} className="text-sm" />
            {s.label}
          </span>
          <span className="text-default-900 shrink-0 text-sm font-bold">{formatAmount(totalAmount)}</span>
        </div>
        <OrderActionBar variant="inline" actionSet={actionSet} onAction={handleAction} />
      </div>

      <div className="card" ref={heroRef}>
        <div className="flex flex-col px-4.5 py-4.5 sm:px-5 sm:py-5 md:px-6.5 md:py-6">
          {/* แถวบน — คอลัมน์เดียวจนถึง <1024, สองคอลัมน์ซ้าย-ขวาที่ ≥1024
              เส้น lg คือ breakpoint เดียวที่หน้า seller ใช้จริง (sidebar หายที่ต่ำกว่า 1024 —
              .seller-mobile-shell) เดิมแถวนี้สลับที่ md (768) ซึ่งไม่ตรงกับเส้นของ shell */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">

            {/* ซ้าย: ไทล์ช่องทาง + (เลขออเดอร์+สถานะ / ชื่อผู้ซื้อ / วันที่สร้าง) */}
            <div className="flex min-w-0 items-start gap-3.5">
              {/* ไทล์ช่องทางการขาย — reuse SalesChannelLogo ที่การ์ดชำระเงินใช้อยู่แล้ว
                  ช่องทางเป็น null (ออเดอร์เก่าก่อนมี field นี้) → ส่ง OTHER เพื่อให้ได้ไอคอนกลาง
                  ไม่ใช่ไทล์หาย ซึ่งจะทำให้เลย์เอาต์กระโดดระหว่างออเดอร์เก่ากับใหม่
                  ขนาดคงที่ 48px ทุกจอ — Paces ไม่มี step ที่ 42px และ Hard Rule 7 ห้าม arbitrary

                  user 2026-08-05: ให้โลโก้เต็มสี่เหลี่ยม — เดิมโลโก้ 26px ลอยกลางกรอบ 48px
                  ที่มีขอบ+เงา ทำให้เห็นเป็น "ไอคอนเล็กในกล่อง" ไม่ใช่โลโก้แบรนด์
                  ตัดขอบ/เงา/พื้นออกแล้วให้รูปกินเต็มไทล์ (overflow-hidden กันมุมรูปล้นออกนอกโค้ง)
                  fallback ที่เป็น Icon (ช่องทางที่ไม่มีไฟล์โลโก้) ยังได้กรอบเดิมไว้ไม่ให้ลอยเปล่า */}
              <span
                className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl"
                title={`ขายผ่าน ${channelLabel}`}
                aria-label={`ขายผ่าน ${channelLabel}`}
              >
                <SalesChannelLogo channel={salesChannel || 'OTHER'} className="size-full rounded-xl" size={48} />
              </span>

              <div className="flex min-w-0 flex-col gap-0.75">
                <div className="flex flex-wrap items-center gap-2.5">
                  {/* เลขคำสั่งซื้อ DP… — ห้าม font-mono (Anuphan ไม่มี mono → fallback Courier หลุดธีม) */}
                  <h3 className="text-lg text-default-900 mb-0 font-bold">
                    {formatOrderNo(publicToken, createdAtISO)}
                  </h3>
                  <span className={`badge badge-label text-2xs font-semibold ${s.cls}`}>
                    <Icon icon={s.icon} className="text-sm" />
                    {s.label}
                  </span>
                  {isFromAuction && (
                    // P1 (T14): text-warning บน bg-warning/15 = 1.54:1 ไม่ผ่าน AA → text-warning-ink (~6.57:1)
                    <span className="badge badge-label bg-warning/15 text-warning-ink text-2xs font-semibold">
                      <Icon icon="gavel" className="text-sm" />
                      จากการประมูล
                    </span>
                  )}
                </div>

                {/* ชื่อผู้ซื้อ — สิ่งที่ต่างกันจริงในแต่ละใบ (เดิมแถวนี้ไม่มีอะไรเลย)
                    truncate เฉพาะบรรทัดนี้ ชื่อที่ร้านพิมพ์เองยาวได้ไม่จำกัด */}
                <p className="text-default-800 mb-0 truncate text-sm font-medium">{buyerLabel}</p>

                {/* P5 (T14): text-default-400 บนพื้นขาว = 2.46:1 ไม่ผ่าน AA → default-700 (~4.69:1) */}
                <p className="text-default-700 mb-0 flex items-center gap-1.25 text-xs">
                  <Icon icon="calendar" className="text-sm shrink-0" />
                  <span className="hidden sm:inline">วันที่สร้าง&nbsp;</span>
                  {createdDisplay}
                </p>
              </div>
            </div>

            {/* ขวา: ยอดรวม + badge ชำระเงิน — ที่ <1024 ลงมาอยู่ใต้บล็อกซ้าย
                แต่ยังชิดขวาพร้อมเส้นประคั่น เพื่อให้อ่านเป็น "ยอดสรุป" เหมือนกันทุกจอ */}
            <div className="flex flex-col items-end gap-0.75 border-t border-dashed border-default-300 pt-3 lg:border-0 lg:pt-0">
              {/* P5 (T14): text-default-600 = 3.03:1 ไม่ผ่าน AA → default-800 (label tier, ~10.7:1) */}
              <span className="text-2xs text-default-800">ยอดรวมทั้งหมด</span>
              <span className="text-2xl text-default-900 font-bold">{formatAmount(totalAmount)}</span>
              {paymentBadge && (
                <span className={`badge-label text-2xs font-semibold ${paymentBadge.cls}`}>
                  {paymentBadge.label}
                </span>
              )}
            </div>
          </div>

          {/* แถวปุ่ม — ≥1024 เท่านั้น (ต่ำกว่านั้นปุ่มชุดเดียวกันอยู่แถบ fixed ล่างจอผ่าน
              OrderActionBar variant="bottom" แล้ว ถ้าใส่ที่นี่ด้วยจะได้ปุ่มซ้ำสองที่พร้อมกัน)
              CANCELLED ไม่มี action เลย → ไม่มีทั้งเส้นประและแถว (design §3) */}
          {hasActions && (
            <div className="mt-4 hidden border-t border-dashed border-default-300 pt-3.5 lg:block">
              <OrderActionBar variant="inline" actionSet={actionSet} onAction={handleAction} />
            </div>
          )}
        </div>
      </div>

      {/* หมายเหตุ: variant="bottom" (<1024, แทน SellerBottomNav) ไม่ mount ในไฟล์นี้ — task T7
          ระบุให้ StatusHero เป็นเจ้าของ action เฉพาะ "2 ตำแหน่งของ desktop" (inline + stuck) เท่านั้น
          จุด mount ของ variant="bottom" เป็นความรับผิดชอบนอกขอบเขตงานนี้ (คาดว่า T11/page.tsx) */}
    </>
  )
}
