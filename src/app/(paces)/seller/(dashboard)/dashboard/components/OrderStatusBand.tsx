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
import { getT } from '@/i18n/server'
import { fmt } from '@/i18n/fmt'
import { thaiDayKey } from '@/lib/format-date'
import type { Dictionary } from '@/i18n/dictionaries/th'
import type { ShippingStageKey } from '@/lib/order-stage'

/**
 * ป้ายของไทล์เก็บเป็น "คีย์" ไม่ใช่ "ข้อความ"
 *
 * ค่าคงที่ระดับ module ถูกประเมินตอน import ครั้งเดียว ⇒ ถ้าเก็บข้อความไว้ตรงนั้นจะเป็นภาษาเดียว
 * ตลอดอายุ bundle ไม่ว่าผู้ใช้เลือกภาษาอะไร (กับดักเดิมที่ feature 00047 เจอมาแล้ว 4 ครั้ง)
 * เก็บเป็นคีย์แล้วให้ `tsc` บังคับว่าคีย์นั้นมีอยู่จริงใน dictionary ทั้งสองภาษา
 */
type DashboardLabelKey = keyof Dictionary['dashboard']

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
  /**
   * 🛑 พิมพ์จาก `ShippingStageKey` ไม่ใช่ไล่ชื่อช่องเอง — วันที่เพิ่มกองใหม่ (เช่น 'RETURNED'
   * 2026-08-24) ถ้าที่นี่ถือรายชื่อของตัวเอง ไทล์จะขาดไปหนึ่งช่องเงียบ ๆ โดย `tsc` ไม่ฟ้อง
   * เพราะ object ที่ "มีช่องเกิน" ยัง assign ได้ปกติ
   */
  shipping?: Record<Exclude<ShippingStageKey, 'DONE' | 'NOT_SHIPPING'>, number>
  /**
   * จำนวนนัดของวันนี้ — ส่งมา = แทนไทล์ที่ 2 ("กำลังจัดส่ง") ด้วย "นัดวันนี้" (user เคาะ 2026-08-07)
   *
   * ทำไมแทนที่แทนที่จะเพิ่มช่องที่ 5: ร้าน SERVICE_QUEUE มี fulfillmentMode = NO_SHIPPING จึงไม่มีวัน
   * เข้าสถานะ SHIPPED เลย (order-display.ts:6) ไทล์นั้นขึ้น 0 ตลอดกาล — ไม่ใช่ไทล์ที่ "ยังไม่มีข้อมูล"
   * แต่เป็นไทล์ที่ไม่มีความหมายกับร้านประเภทนี้ตั้งแต่แรก
   *
   * แกนของมันต่างจากอีก 3 ช่องโดยตั้งใจ (วันที่ ไม่ใช่ Order.status) — เหมือนที่ชุด shipping ใช้แกน
   * stage: การ์ดนี้ตอบคำถาม "วันนี้ต้องทำอะไร" ไม่ใช่ "ออเดอร์กระจายตามสถานะยังไง"
   */
  appointmentToday?: number
  /** ชื่อของสิ่งที่นับ ผันตาม vertical (ORDER_VOCAB.noun) — default = ชุด ONLINE_SALES */
  orderNoun?: string
  /**
   * คำเดียวกันแต่ใช้ยืนเดี่ยวเป็น "หัวการ์ด"
   *
   * ไทยใช้คำเดิม แต่อังกฤษต้องเป็นพหูพจน์ขึ้นต้นตัวใหญ่ ("Orders" ไม่ใช่ "order") ⇒ แยก prop
   * ไม่ใช่ capitalize ในโค้ด เพราะภาษาที่ไม่มีตัวพิมพ์ใหญ่/เล็กจะถูกทำลายด้วยการแปลงแบบเหมารวม
   */
  orderNounTitle?: string
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
  labelKey: DashboardLabelKey
  icon: string
  // สี Paces token ตาม mockup — ห้าม hardcode hex
  iconClass: string
  // แสดง badge เฉพาะ PENDING / SHIPPED (งานที่ต้องทำ)
  showBadge: boolean
}[] = [
  {
    key: 'PENDING',
    labelKey: 'statusPending',
    icon: 'solar:clock-circle-bold-duotone',
    iconClass: 'text-warning',
    showBadge: true,
  },
  {
    key: 'SHIPPED',
    labelKey: 'statusShipped',
    icon: 'solar:delivery-bold-duotone',
    iconClass: 'text-info',
    showBadge: true,
  },
  {
    key: 'CONFIRMED',
    labelKey: 'statusConfirmed',
    icon: 'solar:check-circle-bold-duotone',
    iconClass: 'text-success',
    showBadge: false,
  },
  {
    key: 'CANCELLED',
    labelKey: 'statusCancelled',
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
  labelKey: DashboardLabelKey
  icon: string
  iconClass: string
}[] = [
  {
    key: 'AWAITING_PARCEL',
    labelKey: 'stageAwaitingParcel',
    icon: 'solar:clipboard-list-bold-duotone',
    iconClass: 'text-warning',
  },
  {
    key: 'AWAITING_PICKUP',
    labelKey: 'stageAwaitingPickup',
    icon: 'solar:box-bold-duotone',
    iconClass: 'text-primary',
  },
  {
    key: 'SHIPPING',
    labelKey: 'stageInTransit',
    icon: 'solar:delivery-bold-duotone',
    iconClass: 'text-info',
  },
  {
    // ของถึงแล้วแต่เงินปลายทางยังไม่เข้าร้าน — มือรับเงิน สื่อว่า "ยังต้องไปตามเก็บ"
    // ไม่ใช้เขียว/เครื่องหมายถูก: ยังไม่ได้รับเงินจริง (Verified-Means-Green)
    // warning ซ้ำกับ "รอเลขพัสดุ" โดยตั้งใจ — ทั้งคู่คือ "รอให้ไปทำอะไรสักอย่าง" ไม่ใช่เหตุด่วน
    // แบบ PROBLEM (danger) และ Paces เหลือ semantic ที่ไม่ใช่เขียวแค่ 4 ตัวซึ่งถูกใช้ครบแล้ว
    key: 'AWAITING_COD',
    labelKey: 'stageCodPending',
    icon: 'solar:hand-money-bold-duotone',
    iconClass: 'text-warning',
  },
  {
    key: 'PROBLEM',
    labelKey: 'stageProblem',
    icon: 'solar:danger-triangle-bold-duotone',
    iconClass: 'text-danger',
  },
  {
    // ตีกลับ = ของกลับมาถึงมือร้านแล้ว เรื่องกับขนส่งจบ เหลือแต่ร้านตัดสินใจ (คืนเงิน/ส่งใหม่/ปิดงาน)
    // warning ไม่ใช่ danger — ถ้าแดงเท่ากับ PROBLEM ร้านจะกวาดตาแล้วแยกไม่ออกว่าใบไหนต้องโทร
    // ตามขนส่งเดี๋ยวนี้ ซึ่งเป็นเหตุผลทั้งหมดที่แยกกองออกมา (ตรงกับ STAGE_BADGE_OVERRIDE.RETURNED)
    key: 'RETURNED',
    labelKey: 'stageReturned',
    icon: 'solar:undo-left-round-bold-duotone',
    iconClass: 'text-warning',
  },
]

export default async function OrderStatusBand({
  counts,
  shipping,
  appointmentToday,
  orderNoun,
  orderNounTitle,
}: OrderStatusBandProps) {
  const t = await getT()
  // คำนามของ "หนึ่งใบ" — ผู้เรียกส่งคำที่แปลแล้วมา; ไม่ส่ง = ถอยไปคำของร้านขายออนไลน์
  const noun = orderNoun || t.vocab.orderNoun.ONLINE_SALES
  const nounTitle = orderNounTitle || t.vocab.orderNounTitle.ONLINE_SALES
  // ชุด "ของอยู่ไหน" (ร้านขายออนไลน์) หรือชุด "สถานะการขาย" เดิม — เลือกที่ระดับ props ไม่ใช่ในลูป
  const tiles = shipping
    ? SHIPPING_STAGES.map((st) => ({
        key: st.key,
        label: t.dashboard[st.labelKey],
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
    : STATUSES.map((st) =>
        // ไทล์ที่ 2 ของร้านที่ใช้ระบบนัด = "นัดวันนี้" แทน SHIPPED ที่เข้าไม่ถึงตลอดกาล
        st.key === 'SHIPPED' && appointmentToday !== undefined
          ? {
              key: st.key,
              label: t.dashboard.appointmentToday,
              // icon/สี ยกจาก shortcut-icons.ts ('seller:bookings') ไม่ได้เลือกใหม่ — ไอคอนของ
              // "การนัด" ในโปรเจกต์นี้ถูกตัดสินไว้แล้วที่นั่น (sibling-surface-parity)
              icon: 'solar:calendar-mark-bold-duotone',
              iconClass: 'text-info',
              count: appointmentToday,
              // เป็นงานของวันนี้ = มี badge เหมือน PENDING (ต่างจาก SHIPPED เดิมที่เป็นยอดสะสม)
              showBadge: true,
              /**
               * ปลายทาง = **ตารางงาน** (AC-SQ-05 · หัวหน้าสั่ง 2026-08-15)
               *
               * 🛑 นี่คือการ **ย้อนมติเดิม** ไม่ใช่ของที่ยังไม่เคยตัดสิน — บันทึกไว้ให้ครบเพราะ
               * ถ้าไม่รู้ประวัติ คนถัดไปจะ "แก้กลับ" ด้วยเหตุผลเดิมที่เคยถูกในตอนนั้น:
               *
               *   2026-08-10 · user: *"กดตรง รอดำเนินการ นัดวันนี้ สำเร็จ ยกเลิก → ไปที่รายการ
               *     Order Lists"* ⇒ เปลี่ยนจาก `/queues` มาเป็น `/orders?apptDay=today`
               *     เหตุผลตอนนั้น: ไทล์ทั้ง 4 ในแถบเดียวกันควรพาไปที่เดียวกัน
               *   2026-08-15 · หัวหน้า (AC-SQ-05) + user ยืนยันซ้ำ ⇒ กลับไป `/queues`
               *     เหตุผล: ร้านบริการอ่าน "ใครมากี่โมง" จากตารางเวลา ไม่ใช่จากตารางบิล —
               *     ความสม่ำเสมอของแถบแพ้ความถูกต้องของงานที่ผู้ใช้กำลังจะทำ
               *
               * ตัวกรอง `?apptDay=today` ของหน้า /orders **ยังอยู่ครบและยังใช้ได้** (เข้าถึงจาก
               * ชีตตารางงานรายวัน) — รอบนี้เปลี่ยนแค่ *ปลายทางของไทล์* ไม่ได้ถอดฟีเจอร์ไหนทิ้ง
               *
               * เลขบนไทล์กับสิ่งที่เห็นใน /queues ตรงกัน: ตัวนับใช้ `serviceStart != null` ส่วน
               * ตารางงานใช้ `serviceResourceId != null` ซึ่ง **ถูกเขียนคู่กันเสมอ** โดย
               * `allocateSeat()` (ไม่มีเส้นทางไหนในระบบตั้งตัวใดตัวหนึ่งเดี่ยว ๆ — ตรวจแล้ว)
               */
              /**
               * 🛑 ส่ง `?date=` ไปด้วย ไม่ใช่ `/queues` เปล่า ๆ
               *
               * `/queues` เปิดมาเป็น **ปฏิทินทั้งเดือน** ⇒ ไทล์ที่เขียนว่า "นัดวันนี้ N"
               * พาไปที่ที่ยังต้องจิ้มหาวันเอง — ป้ายสัญญาอย่าง ปลายทางให้อีกอย่าง
               * (หัวหน้า 2026-08-19: *"กดนัดวันนี้ มันไม่เข้าไปที่ตารางงานของวันนี้ด้วย
               * มันไปโผล่หน้า calendar รวม"*)
               *
               * ใช้ `thaiDayKey` ตัวเดียวกับที่ตัวนับบนไทล์ใช้ตัดสิน "วันนี้" — ถ้าคำนวณวันเอง
               * ที่นี่ ช่วงเที่ยงคืนตามเวลาไทยจะเลื่อนกันได้ แล้วไทล์บอก N แต่เปิดไปเจอวันว่าง
               */
              href: `/queues?date=${thaiDayKey(new Date())}`,
            }
          : {
              key: st.key,
              label: t.dashboard[st.labelKey],
              icon: st.icon,
              iconClass: st.iconClass,
              count: counts[st.key],
              showBadge: st.showBadge,
              href: `/orders?status=${st.key}`,
            },
      )

  return (
    <div className="card min-h-11 lg:min-h-0">
      {/* header: ชื่อ band + ลิงก์ "ดูทั้งหมด ›" (RSC-safe: Link ธรรมดา ไม่ใช้ component={Link} — Hard Rule 2) */}
      {/* !py-3: ลดจาก py-3.75 ตาม feedback "section ห่างกันเกินไป" (2026-08-04) — per-instance
          override ตาม pattern เดิมของโปรเจกต์ (AuctionStatStrip/OrderCard) ไม่แตะ _card.css กลาง
          หมายเหตุ: component นี้ render ทั้งมือถือและเดสก์ท็อป การลดมีผลทั้งสอง breakpoint */}
      <div className="card-header !py-3 flex items-center justify-between">
        <h4 className="card-title flex items-center gap-1.5">
          <Icon icon="tabler:clipboard-list" className="size-4 text-primary" />
          {shipping ? fmt(t.dashboard.statusBandTitle, { noun }) : nounTitle}
        </h4>
        <Link href="/orders" className="text-primary text-sm font-medium inline-flex items-c min-h-11 lg:min-h-0enter gap-0.5">
          {t.dashboard.viewAll}
          <Icon icon="tabler:chevron-right" className="size-4" />
        </Link>
      </div>

      <div className="card-body !p-4">
        {/* grid 4 คอลัมน์ flat — ไม่มี bg/border ครอบ icon (spec §4.2 + mockup .ostat)
            ชุดพัสดุมี 6 ไทล์ (เพิ่ม "ตีกลับ" 2026-08-24) แต่ยังใช้ 4 คอลัมน์เหมือนเดิม: user
            สั่งลำดับมาเองว่า [รอเลขพัสดุ · รอรับเข้า · กำลังจัดส่ง · รอเงิน COD] แล้ว
            "พัสดุมีปัญหา" + "ตีกลับ" ตกลงแถวสอง (พอดี 4+2 ไม่มีช่องโหว่กลางแถว)
            — ได้กริดที่ไทล์ยังกว้างเท่าเดิม (~85px บนจอ 360px, ผ่าน tap target 44px)
            โดยไม่ต้องบีบเป็น 5 คอลัมน์ซึ่งจะเหลือช่องละ ~53px */}
        <div className="grid grid-cols-4 gap-2">
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
