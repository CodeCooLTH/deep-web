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
import { getOrderActionSet } from './order-action-set'
import type { ShipmentSource } from './order-action-set'

// SSOT ย้ายไป src/lib/order-display.ts (ORDER_STATUS_META) — ชิปเลขออเดอร์ใน inbox ใช้ชุดเดียวกัน
// re-export ชื่อเดิมไว้ กัน import ที่อื่นพัง (ปัจจุบันไม่มีใคร import ผ่านทางนี้แล้ว — grep ยืนยัน)
export const STATUS_META = ORDER_STATUS_META

// TYPE_META ถูกลบ — type badge ถอดออกไปตั้งแต่ 2026-06-16 (user request) และไม่มีใคร import ต่อ

export interface StatusHeroProps {
  publicToken: string
  shortCode?: string | null
  status: string
  type: string
  createdAtISO: string
  fulfillmentMode: string
  /** true = order เกิดจากการชนะประมูล (มี auctionId) → badge ค้อนประมูล */
  isFromAuction?: boolean
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

// งานถัดไป — ยกข้อความจาก design spec §5 ตรง ๆ ต่อสถานะ (ไม่แยกตาม fulfillmentMode ต่างจาก Option D เดิม)
const NEXT_STEP: Record<string, { text: string; tone: 'default' | 'done' | 'dead' }> = {
  PENDING: {
    text: 'ขั้นต่อไป: ส่งลิงก์ให้ผู้ซื้อยืนยันตัวตนและชำระเงิน — เลขพัสดุแจ้งทีหลังได้',
    tone: 'default',
  },
  SHIPPED: {
    text: 'รอผู้ซื้อกดยืนยันรับของ — ตอนนี้ยังไม่ต้องทำอะไรเพิ่ม',
    tone: 'default',
  },
  CONFIRMED: {
    text: 'คำสั่งซื้อนี้จบสมบูรณ์แล้ว — ผู้ซื้อยืนยันรับของและรีวิวแล้ว',
    tone: 'done',
  },
  CANCELLED: {
    text: 'คำสั่งซื้อนี้ถูกยกเลิกแล้ว — สินค้าคืนเข้าสต็อก และลิงก์ที่เคยส่งให้ผู้ซื้อใช้ไม่ได้อีก',
    tone: 'dead',
  },
}

const NEXT_STEP_BOX_CLS: Record<'default' | 'done' | 'dead', string> = {
  default: 'bg-default-100 text-default-800',
  done: 'bg-success/15 text-default-800',
  dead: 'bg-danger/15 text-default-800',
}
const NEXT_STEP_ICON_CLS: Record<'default' | 'done' | 'dead', string> = {
  default: 'text-primary',
  done: 'text-success',
  dead: 'text-danger',
}

function noop() {
  // ไม่มี business logic ในไฟล์นี้ — ถ้า page.tsx ยังไม่ได้ส่ง onAction มา (ก่อน T11 ต่อสาย) กดแล้วไม่ทำอะไร
}

export default function StatusHero({
  publicToken,
  status,
  createdAtISO,
  fulfillmentMode,
  isFromAuction,
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
  const nextStep = NEXT_STEP[status] ?? null

  // ชุด action เดียว (T5 contract) — inline (การ์ด) กับ stuck (แถบตรึง) ใช้ actionSet ตัวเดียวกันนี้
  // ไม่มี markup ปุ่มเขียนเองในไฟล์นี้อีกต่อไป (ย้ายทั้งหมดไป OrderActionBar)
  const actionSet = getOrderActionSet({
    status: status as OrderStatus,
    fulfillmentMode,
    shipmentSource,
  })
  const handleAction = onAction ?? noop

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
          <span className={`badge badge-label text-2xs shrink-0 font-semibold ${s.cls}`}>
            <Icon icon={s.icon} className="text-sm" />
            {s.label}
          </span>
          <span className="text-default-900 truncate text-sm font-bold">
            {formatOrderNo(publicToken, createdAtISO)}
          </span>
          <span className="text-default-900 shrink-0 text-sm font-bold">{formatAmount(totalAmount)}</span>
        </div>
        <OrderActionBar variant="inline" actionSet={actionSet} onAction={handleAction} />
      </div>

      <div className="card" ref={heroRef}>
        <div className="flex flex-col gap-3.5 px-4.5 py-4.5 sm:px-5 sm:py-5 md:px-6.5 md:py-6">
          {/* แถวบน — มือถือคอลัมน์เดียว, ≥768 สองคอลัมน์ซ้าย-ขวา */}
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">

            {/* ซ้าย: badge สถานะ + วันที่สร้าง + เลขคำสั่งซื้อ */}
            <div className="flex flex-col gap-1.25">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className={`badge badge-label text-2xs font-semibold ${s.cls}`}>
                  <Icon icon={s.icon} className="text-sm" />
                  {s.label}
                </span>
                {/* P5 (T14): text-default-400 บนพื้นขาว = 2.46:1 ไม่ผ่าน AA → default-700 (~4.69:1) */}
                <span className="text-default-700 flex items-center gap-1.25 text-xs">
                  <Icon icon="calendar" className="text-sm" />
                  {createdDisplay}
                </span>
                {isFromAuction && (
                  // P1 (T14): text-warning บน bg-warning/15 = 1.54:1 ไม่ผ่าน AA → text-warning-ink (~6.57:1)
                  <span className="badge badge-label bg-warning/15 text-warning-ink text-2xs font-semibold">
                    <Icon icon="gavel" className="text-sm" />
                    จากการประมูล
                  </span>
                )}
              </div>
              {/* เลขคำสั่งซื้อ DP… — ห้าม font-mono (Anuphan ไม่มี mono → fallback Courier หลุดธีม) */}
              <h3 className="text-lg text-default-900 mb-0 font-bold">
                {formatOrderNo(publicToken, createdAtISO)}
              </h3>
            </div>

            {/* ขวา: ยอดรวม + badge ชำระเงิน + action inline (≥1024 เท่านั้น — ชิดขวาเฉพาะ ≥768)
                หมายเหตุ: มือถือคอลัมน์เดียวต้องชิดซ้ายให้ตรงแนวกับซ้าย จึงไม่ใส่ items-end นอก md: */}
            <div className="flex flex-col gap-3 md:items-end">
              <div className="flex flex-col gap-0.75 md:items-end">
                {/* P5 (T14): text-default-600 = 3.03:1 ไม่ผ่าน AA → default-800 (label tier, ~10.7:1) */}
                <span className="text-2xs text-default-800">ยอดรวมทั้งหมด</span>
                <span className="text-2xl text-default-900 font-bold">{formatAmount(totalAmount)}</span>
                {paymentBadge && (
                  <span className={`badge-label text-2xs font-semibold ${paymentBadge.cls}`}>
                    {paymentBadge.label}
                  </span>
                )}
              </div>
              {/* OrderActionBar variant="inline" ซ่อนตัวเองอัตโนมัติ <1024 (className ภายในมี lg:flex) */}
              <OrderActionBar variant="inline" actionSet={actionSet} onAction={handleAction} />
            </div>
          </div>

          {/* แถบ "งานถัดไป" 1 ประโยค — พื้น default-100 ปกติ / success tint เมื่อจบ / danger tint เมื่อยกเลิก */}
          {nextStep && (
            <p className={`mb-0 flex items-start gap-2 rounded px-3.25 py-2.75 text-sm ${NEXT_STEP_BOX_CLS[nextStep.tone]}`}>
              <Icon icon="arrow-right-circle" className={`mt-0.5 shrink-0 ${NEXT_STEP_ICON_CLS[nextStep.tone]}`} aria-hidden="true" />
              <span>{nextStep.text}</span>
            </p>
          )}
        </div>
      </div>

      {/* หมายเหตุ: variant="bottom" (<1024, แทน SellerBottomNav) ไม่ mount ในไฟล์นี้ — task T7
          ระบุให้ StatusHero เป็นเจ้าของ action เฉพาะ "2 ตำแหน่งของ desktop" (inline + stuck) เท่านั้น
          จุด mount ของ variant="bottom" เป็นความรับผิดชอบนอกขอบเขตงานนี้ (คาดว่า T11/page.tsx) */}
    </>
  )
}
