/**
 * OrderStatusBand — band คำสั่งซื้อ 4-status แบบ flat (RSC)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/components/StatisticCard.tsx
 *
 * ใช้ทั้งมือถือ (ใน CommandCenter) และเดสก์ท็อป (ในบล็อก hidden lg:block ของ dashboard ตั้งแต่
 * 2026-08-04) — จอเดียวกันไม่เคยเห็น 2 ตัวพร้อมกัน เพราะสองบล็อกนั้นสลับกันด้วย breakpoint
 *
 * ต่างจาก OrderStatusRow (component รุ่นก่อน ลบทิ้งแล้ว 2026-08-04 หลังไม่มีใคร import):
 *  - icon Solar Duotone (ไม่ใช่ Tabler) ผ่าน @iconify/react โดยตรง (ไม่ใช้ wrapper)
 *  - icon flat ไม่มี circle/bg/border ครอบ (spec §4.2 + mockup .ostat)
 *  - badge เฉพาะ PENDING/SHIPPED เมื่อ count > 0 (งานที่ต้องทำ)
 *  - CONFIRMED/CANCELLED ไม่มี badge
 *  - icon สี per-status ตาม mockup (.ic-warning / .ic-info / .ic-success / .ic-default)
 */

import Link from 'next/link'
import { Icon } from '@iconify/react'

export interface OrderStatusBandProps {
  counts: {
    PENDING: number
    SHIPPED: number
    CONFIRMED: number
    CANCELLED: number
  }
  /**
   * ตัวนับ "ของอยู่ไหน" สำหรับร้านขายออนไลน์ (user สั่ง 2026-08-04) — ส่งมา = ใช้ชุดนี้แทน counts
   *
   * ทำไมเปลี่ยนทั้งชุดแทนที่จะเพิ่มช่อง: 4 ช่องเดิมเป็นสถานะ "การขาย" (รอดำเนินการ/สำเร็จ/ยกเลิก)
   * ซึ่งร้านขายออนไลน์ไม่ได้ใช้ตัดสินใจอะไรในแต่ละวัน — งานจริงของเขาคือไล่พัสดุ: ใบไหนยังไม่มีเลข
   * ใบไหนขนส่งยังไม่มารับ ใบไหนติดปัญหา. เก็บของเดิมไว้ให้ vertical อื่น (บ้านพัก/คิวงาน) ที่ไม่มี
   * พัสดุให้ไล่
   */
  shipping?: {
    AWAITING_PARCEL: number
    AWAITING_PICKUP: number
    SHIPPING: number
    AWAITING_CLOSE: number
    PROBLEM: number
  }
}

const ICON_SIZE_CLS = 'size-[30px]' // HR7 carve-out: Paces size-* ไม่มี 30px (size-7=28 เล็กไป, size-8=32 ใหญ่ไป) — 30px ตรง mockup .os-ic
const BADGE_CLS = 'absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 bg-danger text-white rounded-full text-2xs font-bold flex items-center justify-center leading-none tabular-nums' // HR7 carve-out: negative offset + min-w ของ badge ที่ลอยทับมุมไอคอน ไม่มี token รองรับ

// clamp count ≥100 → "99+" เพื่อไม่ให้ badge กว้างเกิน
function fmtBadge(n: number): string {
  if (n >= 100) return '99+'
  return String(n)
}

const STATUSES: {
  key: keyof OrderStatusBandProps['counts']
  label: string
  icon: string
  // สี Paces token ตาม mockup — ห้าม hardcode hex
  iconClass: string
  // แสดง badge เฉพาะ PENDING / SHIPPED (งานที่ต้องทำ)
  showBadge: boolean
}[] = [
  {
    key: 'PENDING',
    label: 'รอดำเนินการ',
    icon: 'solar:clock-circle-bold-duotone',
    iconClass: 'text-warning',
    showBadge: true,
  },
  {
    key: 'SHIPPED',
    label: 'กำลังจัดส่ง',
    icon: 'solar:delivery-bold-duotone',
    iconClass: 'text-info',
    showBadge: true,
  },
  {
    key: 'CONFIRMED',
    label: 'สำเร็จ',
    icon: 'solar:check-circle-bold-duotone',
    iconClass: 'text-success',
    showBadge: false,
  },
  {
    key: 'CANCELLED',
    label: 'ยกเลิก',
    icon: 'solar:close-circle-bold-duotone',
    // text-default-500 — โทน muted สำหรับสถานะ inactive (ยกเลิก)
    iconClass: 'text-default-500',
    showBadge: false,
  },
]

/**
 * ชุด "ของอยู่ไหน" — ป้าย/สีต้องสื่อว่าใครต้องลงมือ ไม่ใช่ไล่ตามเวลา
 * ทุกช่องมี badge เพราะทุกช่องคือ "งานค้าง" (ต่างจากชุดเดิมที่ สำเร็จ/ยกเลิก เป็นแค่ยอดสะสม)
 */
const SHIPPING_STAGES: {
  key: keyof NonNullable<OrderStatusBandProps['shipping']>
  label: string
  icon: string
  iconClass: string
}[] = [
  {
    key: 'AWAITING_PARCEL',
    label: 'รอเลขพัสดุ',
    icon: 'solar:clipboard-list-bold-duotone',
    iconClass: 'text-warning',
  },
  {
    key: 'AWAITING_PICKUP',
    label: 'รอรับเข้า',
    icon: 'solar:box-bold-duotone',
    iconClass: 'text-primary',
  },
  {
    key: 'SHIPPING',
    label: 'กำลังจัดส่ง',
    icon: 'solar:delivery-bold-duotone',
    iconClass: 'text-info',
  },
  {
    // พัสดุจบเส้นทางแล้วแต่ออเดอร์ยังไม่ปิด — ธง = เส้นชัยที่ยังไม่มีใครไปแตะ
    // ห้ามใช้เครื่องหมายถูก/สีเขียว: ไทล์นี้คือ "ยังไม่ยืนยัน" ตรงตัว (Verified-Means-Green)
    // และเขียวจะชนกับ solar:check-circle ของ CONFIRMED ในชุดไทล์อีกชุดบนหน้าเดียวกัน
    key: 'AWAITING_CLOSE',
    label: 'รอปิดงาน',
    icon: 'solar:flag-2-bold-duotone',
    iconClass: 'text-warning',
  },
  {
    key: 'PROBLEM',
    label: 'พัสดุมีปัญหา',
    icon: 'solar:danger-triangle-bold-duotone',
    iconClass: 'text-danger',
  },
]

export default function OrderStatusBand({ counts, shipping }: OrderStatusBandProps) {
  // ชุด "ของอยู่ไหน" (ร้านขายออนไลน์) หรือชุด "สถานะการขาย" เดิม — เลือกที่ระดับ props ไม่ใช่ในลูป
  const tiles = shipping
    ? SHIPPING_STAGES.map((st) => ({
        key: st.key,
        label: st.label,
        icon: st.icon,
        iconClass: st.iconClass,
        count: shipping[st.key],
        // ทุกช่องคือ "งานค้าง" จึงมี badge ได้หมด ต่างจากชุดเดิมที่ สำเร็จ/ยกเลิก เป็นยอดสะสม
        showBadge: true,
        /**
         * ?stage= = ตัวกรองตามสถานะพัสดุของหน้า /orders (user สั่ง 2026-08-04 "กดเข้าไปแล้ว query
         * ต้องตรงกันด้วย") — ไม่ใช่ ?status= ซึ่งเป็น Order.status คนละแกนกัน
         * ตัวเลขบนไทล์กับรายการที่กรองได้ ตรงกันเพราะทั้งคู่ผ่าน deriveShippingStage ตัวเดียวกัน
         */
        href: `/orders?stage=${st.key}`,
      }))
    : STATUSES.map((st) => ({
        key: st.key,
        label: st.label,
        icon: st.icon,
        iconClass: st.iconClass,
        count: counts[st.key],
        showBadge: st.showBadge,
        href: `/orders?status=${st.key}`,
      }))

  return (
    <div className="card">
      {/* header: ชื่อ band + ลิงก์ "ดูทั้งหมด ›" (RSC-safe: Link ธรรมดา ไม่ใช้ component={Link} — Hard Rule 2) */}
      {/* !py-3: ลดจาก py-3.75 ตาม feedback "section ห่างกันเกินไป" (2026-08-04) — per-instance
          override ตาม pattern เดิมของโปรเจกต์ (AuctionStatStrip/OrderCard) ไม่แตะ _card.css กลาง
          หมายเหตุ: component นี้ render ทั้งมือถือและเดสก์ท็อป การลดมีผลทั้งสอง breakpoint */}
      <div className="card-header !py-3 flex items-center justify-between">
        <h4 className="card-title flex items-center gap-1.5">
          <Icon icon="tabler:clipboard-list" className="size-4 text-primary" />
          {shipping ? 'สถานะคำสั่งซื้อ' : 'คำสั่งซื้อ'}
        </h4>
        <Link href="/orders" className="text-primary text-sm font-medium inline-flex items-center gap-0.5">
          ดูทั้งหมด
          <Icon icon="tabler:chevron-right" className="size-4" />
        </Link>
      </div>

      <div className="card-body !p-4">
        {/* grid flat — ไม่มี bg/border ครอบ icon (spec §4.2 + mockup .ostat)
            ชุดพัสดุมี 5 ไทล์: มือถือแตกเป็น 3+2 ไม่ใช่ 5 คอลัมน์เดียว เพราะพื้นที่กริดจริงบนจอ 360px
            เหลือ ~296px (หัก padding shell 16×2 + card-body 16×2) → 5 คอลัมน์ได้ช่องละ ~53px และ
            เหลือ ~45px บนจอ 320px ซึ่งเฉียด tap target 44px จนไม่เหลือระยะปลอดภัย · 3 คอลัมน์
            ได้ ~93px กว้างกว่าของเดิม (4 ช่อง = 85px) ด้วยซ้ำ
            ไม่ใช้ scroll แนวนอนเพราะไทล์พวกนี้คือ "งานค้างวันนี้" ที่ต้องกวาดตาเห็นครบพร้อมกัน
            ถ้าต้องปัดถึงจะเห็นช่องสุดท้าย ก็เสียเหตุผลของ Command Center ไปเลย
            ชุดเดิม 4 ไทล์ (vertical อื่นที่ไม่มีพัสดุ) ไม่กระทบ — ยังเป็น grid-cols-4 เหมือนเดิม */}
        <div className={`grid gap-2 ${tiles.length === 5 ? 'grid-cols-3 lg:grid-cols-5' : 'grid-cols-4'}`}>
          {tiles.map(({ key, label, icon, iconClass, showBadge, count, href }) => {
            // badge แสดงเฉพาะ showBadge=true และ count > 0
            const badgeText = showBadge && count > 0 ? fmtBadge(count) : null

            return (
              /* Link ครอบ tap target ทั้งก้อน — short path ไม่มี /seller prefix (convention) */
              /* lg:* มีผลเฉพาะตอนถูก render ในบล็อกเดสก์ท็อปของ dashboard (มือถืออยู่ใต้ lg:hidden
                 จึงไม่ได้รับผล) — เรียงไอคอนไว้ข้างป้ายเพราะช่องกว้าง ~300px ต่อไทล์ ถ้าวางซ้อนกัน
                 แนวตั้งแบบมือถือจะเหลือที่ว่างรอบไอคอน 30px จนอ่านเป็นการ์ดเปล่า */
              <Link
                key={key}
                href={href}
                className="flex flex-col items-center gap-2 py-1 active:scale-95 transition-transform lg:flex-row lg:justify-center lg:gap-3 lg:py-3"
              >
                {/* icon wrapper: relative เพื่อ position badge absolute */}
                {/* arbitrary: px-1 / py-0.5 เพิ่ม tap target รอบ icon (Paces ไม่มี token ขนาด hit-area ไม่มี circle) — HR7 */}
                <span className="relative inline-flex items-center justify-center px-1 py-0.5">
                  {/* icon Solar Duotone flat ขนาด 30px ตาม mockup .os-ic font-size:30px */}
                  <Icon icon={icon} className={`${ICON_SIZE_CLS} ${iconClass}`} />
                  {/* badge เล็กมุมบนขวา icon — แสดงเมื่อ count > 0 */}
                  {badgeText !== null && <span className={BADGE_CLS}>{badgeText}</span>}
                </span>
                {/* label ใต้ icon — text-default-700 ตาม mockup .os-lb */}
                <span className="text-xs text-default-700 text-center leading-tight font-medium">
                  {label}
                </span>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
