/**
 * OrdersList — mobile orders (Shopee-IA × Paces skin, v8.2)
 *
 * header: [← back] [search] [filter btn → full modal] [bell]  → sticky top
 * tabs: status filter (count badge, underline)  → primary nav
 * list: OrderCard standalone + lazy-load on scroll (IntersectionObserver, ไม่มี pagination)
 * filter modal: full-screen — order type (แทน select เดิม)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/orders/components/OrdersList.tsx
 *       (tabs underline + count); modal pattern: theme/paces/.../_modal.css
 * SellerMobileHeader คืน null สำหรับ /orders → หน้านี้เป็นเจ้าของ header เอง
 */

'use client'

import Icon from '@/components/wrappers/Icon'
import type { OrderVocab } from '@/lib/seller-menu'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { cn } from '@/utils/helpers'
import type { OrderRow } from './data'
import { formatOrderNo } from '@/lib/order-no'
import OrderCard from './OrderCard'
import IShipImportModal from './IShipImportModal'
import { pacesConfirm } from '@/lib/paces-swal'
import { pacesToast } from '@/lib/paces-toast'
import SellerEmptyState from '../../_shared/SellerEmptyState'
import OrdersTable from './OrdersTable'
import ListBusyOverlay, { useListBusy } from './ListBusyOverlay'
import { useLockBodyScroll } from '@/hooks/useLockBodyScroll'

// ─── status tabs ────────────────────────────────────────────────────────────
import { SHIPPING_STAGE_LABEL } from '@/lib/order-stage'
import {
  APPOINTMENT_STAGE_KEYS,
  APPOINTMENT_STAGE_META,
  countAppointmentStages,
  isAppointmentStatus,
} from '@/lib/appointment-stage'
import { ORDER_STATUS_META } from '@/lib/order-display'
import { ORDER_DATE_PRESETS, isSpecificDay, matchesOrderDateFilter } from '@/lib/order-date-filter'
import { formatDateTH } from '@/lib/format-date'

/** ลำดับชิปสถานะพัสดุ — เรียงตามเส้นทางจริงของพัสดุ ปิดท้ายด้วยกองที่ต้องแก้ */
const STAGE_CHIPS = ['AWAITING_PARCEL', 'AWAITING_PICKUP', 'SHIPPING', 'AWAITING_COD', 'PROBLEM'] as const

// คำของแต่ละสถานะมาจาก SSOT ตัวเดียวกับ badge บนแถว/การ์ด (lib/order-display.ts) — ชิปกับป้าย
// ที่อยู่ห่างกันไม่กี่สิบพิกเซลต้องพูดคำเดียวกันเสมอ ห้ามพิมพ์คำซ้ำไว้ที่นี่
const STATUS_TABS: { value: string; label: string }[] = [
  { value: 'all', label: 'ทั้งหมด' },
  ...Object.entries(ORDER_STATUS_META).map(([value, meta]) => ({ value, label: meta.label })),
]

// ─── order type options (ใช้ใน filter modal) ────────────────────────────────
const TYPE_OPTIONS = [
  { value: '',         label: 'ทุกประเภท' },
  { value: 'PHYSICAL', label: 'สินค้า' },
  { value: 'DIGITAL',  label: 'ดิจิทัล' },
  { value: 'SERVICE',  label: 'บริการ' },
]

const PAGE = 8 // จำนวนต่อรอบ lazy-load

type Props = {
  orders: OrderRow[]
  activeStatus: string
  /** ร้านเชื่อมต่อ iShip + เป็นร้านขายออนไลน์ (feature 00022; vertical=ONLINE_SALES ตั้งแต่ 00028) */
  ishipEnabled?: boolean
  /** คลังคำผันตามประเภทกิจการ (feature 00030) — มาจาก RSC ที่รู้จัก shop.vertical ของ request */
  vocab: OrderVocab
  /**
   * ร้านนี้มีโดเมนพัสดุไหม (feature 00036 FR-SOV-001) — false = ไม่มีคอลัมน์ที่อยู่จัดส่ง/ขนส่ง
   *
   * ตัดสินจาก vertical ที่ RSC ล้วน ไม่ derive จากข้อมูลของแถว: คอลัมน์ที่โผล่/หายตามว่า
   * "หน้านี้บังเอิญมีใบที่มีพัสดุไหม" จะขยับเองตอน lazy-load ซึ่งอ่านเป็นจอกระตุก (BR-SOV-09)
   */
  hasShippingAxis?: boolean
}

export default function OrdersList({
  orders,
  activeStatus,
  ishipEnabled = false,
  vocab,
  hasShippingAxis = true,
}: Props) {
  const router   = useRouter()
  const pathname = usePathname()

  /**
   * แผงโหลดของหน้านี้ — ตัวเดียวคุมทั้ง 2 breakpoint (มือถือ = การ์ด, เดสก์ท็อป = ตาราง)
   * เพราะเห็นได้ทีละจอ และตัวกรอง `?stage=` เกิดที่นี่แต่ถูกกดจาก toolbar ของตาราง
   * ถ้าแยก state สองชุด ฝั่งตารางจะไม่รู้ว่ากำลังรอ RSC payload ใหม่อยู่
   */
  const busy = useListBusy()

  const [localStatus, setLocalStatus] = useState<string>(activeStatus ?? 'all')
  /**
   * ?stage= — ตัวกรองกองงานตามสถานะพัสดุ มี 2 ทางเข้า: ไทล์ "สถานะคำสั่งซื้อ" บนหน้าแรก
   * และชิปในหน้านี้ (เพิ่ม 2026-08-04 รอบสอง — เดิมมีแต่ไทล์ซึ่งเป็น lg:hidden = เดสก์ท็อปเข้าไม่ถึงเลย)
   *
   * ยังคงอ่านจาก URL เป็นแหล่งเดียว ไม่ mirror เป็น state — ชิปกดแล้ว push URL แล้วค่าไหลกลับมาทางเดิม
   * ทำให้ปุ่ม back ของเบราว์เซอร์และลิงก์จากไทล์ให้ผลตรงกันเสมอ
   * ค่าที่ไม่รู้จักถือว่าไม่กรอง (fail-open) — ลิงก์เก่า/พิมพ์มั่วต้องไม่ทำให้หน้าว่างเปล่าโดยไม่มีคำอธิบาย
   */
  const searchParams = useSearchParams()
  const stageParam = searchParams.get('stage')
  const stage =
    stageParam && stageParam in SHIPPING_STAGE_LABEL
      ? (stageParam as keyof typeof SHIPPING_STAGE_LABEL)
      : null
  /**
   * ?appt= — แกนที่สองของร้านคิวงาน (feature 00036 FR-SOV-008, มติ D-1)
   *
   * อ่านจาก URL แบบเดียวกับ ?stage= ทุกประการ (ไม่ mirror เป็น state) เพื่อให้ปุ่ม back และ
   * ลิงก์จากที่อื่นให้ผลตรงกัน · ค่าที่ไม่รู้จัก = ไม่กรอง (fail-open) ไม่ใช่หน้าว่างเปล่า
   * ร้านหนึ่งมีแกนเสริมได้แกนเดียว (พัสดุ หรือ นัดหมาย) จึงไม่ต้องกันสองพารามิเตอร์ชนกัน
   */
  const apptParam = searchParams.get('appt')
  /**
   * 'NONE' = ใบที่ไม่มีนัด (walk-in) — sentinel ที่ไม่ใช่ AppointmentStatus จริง จึง parse ที่นี่
   * ไม่ใช่ยัดเข้า isAppointmentStatus ซึ่งเป็น SSOT ของ 5 สถานะจริงในโดเมนนัดหมาย
   *
   * มีอยู่เพราะชิป "ทั้งหมด" นับทุกใบ แต่ชิปที่เหลือนับเฉพาะใบที่มีนัด — จอเดียวจึงเคยโชว์
   * "ทั้งหมด 120 · นัดแล้ว 1" แล้วไม่มีทางกดหา 119 ใบที่เหลือ ทั้งที่ตารางเขียนคำว่า
   * "ไม่มีนัด" ให้เห็นอยู่ (ผู้ใช้เห็นคำแต่กรองไม่ได้ = เลขที่บวกไม่ลงตัวโดยไม่มีทางออก)
   */
  const appt = apptParam === 'NONE' || isAppointmentStatus(apptParam) ? apptParam : null
  /**
   * ตัวกรองช่วงเวลาของมือถือ (2026-08-08) — โมดัลนี้ไม่เคยมีตัวกรองวันที่เลย มีแต่ฝั่ง
   * เดสก์ท็อป แปลว่าผู้ใช้มือถือเข้าไม่ถึงแกนนี้มาตลอด · ค่าเดียวกับที่เดสก์ท็อปใช้
   * ('All' | preset | 'YYYY-MM-DD') และกรองด้วยฟังก์ชันตัวเดียวกัน (SSOT)
   */
  const [dateFilter, setDateFilter] = useState('All')
  const [search,      setSearch]      = useState('')
  const [typeFilter,  setTypeFilter]  = useState('')
  const [visibleCount, setVisibleCount] = useState(PAGE)
  // ดึงพัสดุจาก iShip มาสร้างออเดอร์ (ส่วนขยาย feature 00022)
  const [importOpen, setImportOpen] = useState(false)
  const [filterOpen,  setFilterOpen]  = useState(false)

  /**
   * โมดัลตัวกรองข้างล่างเป็น overlay เต็มจอที่ประกอบเองด้วย React state จึงต้องตรึง scroll เอง
   * (docs/conventions/overlay-scroll-lock.md) — ตกสำรวจในรอบที่ไล่ใส่ให้ 21 ใบ (01132960)
   * ส่ง filterOpen ไม่ใช่ true ตายตัว เพราะ component นี้ถูก render ค้างไว้ตลอด ไม่ได้ mount
   * เฉพาะตอนเปิด · แผงโหลด (ListBusyOverlay) ไม่เข้าข่ายกฎนี้: มันไม่ใช่โมดัล ไม่กินทั้งจอ และ
   * จงใจให้เลื่อนไปกับหน้า (สปินเนอร์เป็น sticky) การตรึงหน้าไว้ 350ms ตอนกดกรองจะขวางคนที่
   * กำลังเลื่อนอยู่มากกว่าช่วย
   */
  useLockBodyScroll(filterOpen)

  const sentinelRef = useRef<HTMLDivElement | null>(null)

  // ─── tabs: swipe ซ้าย/ขวาทั้งจอเพื่อสลับ tab (แบบ Shopee) + auto-scroll tab active เข้าจอ ───
  const tabsRef = useRef<HTMLDivElement | null>(null)
  const touchStart = useRef<{ x: number; y: number; inHeader: boolean }>({ x: 0, y: 0, inHeader: false })

  /** ปัดสลับ "ชิปที่เห็นอยู่บนจอ" ไม่ผูกกับ STATUS_TABS ตายตัว — ร้านขายออนไลน์แถวนี้เป็นสถานะพัสดุ */
  const switchTabByDir = (dir: number) => {
    const idx = chipRow.findIndex((c) => c.active)
    const next = idx + dir
    if (next >= 0 && next < chipRow.length) chipRow[next].select()
  }
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0]
    touchStart.current = {
      x: t.clientX,
      y: t.clientY,
      // ปัดที่ header (search/tab strip) → ไม่สลับ (ปล่อยให้ strip เลื่อน / search ทำงาน)
      inHeader: !!(e.target as HTMLElement).closest('[data-orders-header]'),
    }
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStart.current.inHeader) return
    const t = e.changedTouches[0]
    const dx = t.clientX - touchStart.current.x
    const dy = t.clientY - touchStart.current.y
    // ต้องเป็น swipe แนวนอนชัดเจน (กันชนกับ scroll แนวตั้ง)
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return
    switchTabByDir(dx < 0 ? 1 : -1) // ปัดซ้าย = tab ถัดไป, ปัดขวา = ก่อนหน้า
  }

  // เลื่อน tab ที่ active เข้ามากลางจอเมื่อสลับ (โดยเฉพาะจาก swipe)
  useEffect(() => {
    tabsRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [localStatus, stage, appt])

  /**
   * เขียน query ใหม่โดยคงพารามิเตอร์อีกตัวไว้เสมอ — `?status=` (สถานะการขาย) กับ `?stage=`
   * (สถานะพัสดุ) เป็นคนละแกน ใช้พร้อมกันได้ ถ้าเขียนทับกันผู้ใช้จะรู้สึกว่ากดอันหนึ่งแล้วอีกอันหลุด
   */
  const pushQuery = (patch: { status?: string | null; stage?: string | null; appt?: string | null }) => {
    const next = new URLSearchParams(searchParams.toString())
    for (const [k, v] of Object.entries(patch)) {
      if (v == null) next.delete(k)
      else next.set(k, v)
    }
    const qs = next.toString()
    // ห่อด้วย run() — ทุกทางที่เปลี่ยน query ของหน้านี้ผ่านฟังก์ชันเดียวนี้ (ชิปมือถือ, ดรอปดาวน์
    // "พัสดุ" บนเดสก์ท็อป, สถานะการขายในโมดัลตัวกรอง) แผงจึงอยู่ครบทุกทางโดยไม่ต้องไปห่อทีละจุด
    busy.run(() => router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false }))
  }

  // ─── status tab click (sync URL) ───────────────────────────────────────────
  const handleStatusTab = (value: string) => {
    setLocalStatus(value)
    pushQuery({ status: value === 'all' ? null : value })
  }

  /** กดชิปที่เลือกอยู่ซ้ำ = ล้างตัวกรอง (ทางออกเดียวกับกากบาทบนชิป) */
  const handleStageChip = (value: string) => {
    pushQuery({ stage: stage === value ? null : value })
  }

  // ─── count per status ───────────────────────────────────────────────────────
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: orders.length }
    for (const o of orders) counts[o.status] = (counts[o.status] ?? 0) + 1
    return counts
  }, [orders])

  /**
   * ตัวนับบนชิปสถานะพัสดุ — นับจาก `orders` ก้อนเดียวกับที่กรอง ห้ามยิง endpoint นับแยก
   * ไม่งั้นเลขบนชิปกับจำนวนแถวที่กรองได้จะเพี้ยนจากกันโดยไม่มีอะไรเตือน
   * นับก่อนกรองด้วย stage แต่หลังกรอง status/ประเภท/คำค้น ไม่ได้ — จงใจนับจากก้อนดิบ เพราะชิป
   * ต้องบอก "ทั้งร้านมีกี่ใบในกองนี้" ให้ตรงกับตัวเลขบนไทล์หน้าแรกซึ่งก็นับจากทั้งร้านเช่นกัน
   */
  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const o of orders) {
      if (o.shippingStage) counts[o.shippingStage] = (counts[o.shippingStage] ?? 0) + 1
    }
    return counts
  }, [orders])

  /** ร้านที่ไม่ใช่ ONLINE_SALES ไม่มีพัสดุให้ไล่ → shippingStage undefined ทุกแถว → ไม่มีแกนนี้ */
  const hasStageAxis =
    hasShippingAxis && (STAGE_CHIPS.some((k) => (stageCounts[k] ?? 0) > 0) || stage !== null)

  /**
   * ตัวนับบนชิป/ดรอปดาวน์สถานะนัด — นับจาก `orders` ก้อนเดียวกับที่กรอง ผ่านฟังก์ชันเดียวกัน
   * (countAppointmentStages รับ stage ที่ derive แล้ว จึงไม่มีทางนับคนละเกณฑ์กับตัวกรอง — BR-SOV-06)
   */
  const apptCounts = useMemo(
    () => countAppointmentStages(orders.map((o) => o.appointment?.stage ?? null)),
    [orders],
  )

  /**
   * ใบที่ไม่มีนัด — นับจากเงื่อนไขเดียวกับที่ตัวกรองใช้ (`!o.appointment`) เพื่อให้เลขบนชิป
   * กับจำนวนแถวตรงกันเสมอ · `appointment` เป็น undefined เมื่อร้านไม่มีแกนนี้ ซึ่งกรณีนั้น
   * ทั้งชิปและตัวกรองจะไม่ถูก render อยู่แล้ว ตัวเลขนี้จึงไม่มีใครอ่าน
   */
  const noAppointmentCount = useMemo(() => orders.filter((o) => !o.appointment).length, [orders])

  /**
   * ร้าน walk-in ล้วนไม่มีนัดสักใบ → ไม่มีแกนนี้เลย (AC-8.2) — ไม่ใช่แกนที่มีอยู่แต่ทุกกองเป็น 0
   * เงื่อนไข `|| appt !== null` มีไว้กันหน้าค้างเปล่า: ถ้าเข้ามาด้วยลิงก์ที่กรองอยู่แล้วจนไม่เหลือ
   * แถวไหนมีนัด แกนต้องยังอยู่ให้กดออกได้ (ตรรกะเดียวกับ hasStageAxis)
   */
  const hasAppointmentAxis =
    APPOINTMENT_STAGE_KEYS.some((k) => apptCounts[k] > 0) || appt !== null

  /**
   * ชิปแถวเดียวบนมือถือ — ร้านขายออนไลน์ได้ "สถานะพัสดุ" ร้านอื่นได้ "สถานะการขาย" แบบเดิม
   * (user เคาะ 2026-08-04 หลังลองของจริง 2 รอบ)
   *
   * เหตุผลที่เป็นการ *แทนที่* ไม่ใช่ *เพิ่มแถว*: สองแกนนี้ทับกันเกือบสนิทสำหรับร้านขายออนไลน์
   * (บนจอจริงของ user: รอดำเนินการ 5 กับ รอเลขพัสดุ 4 คือออเดอร์กองเดียวกัน) การมี 2 แถว
   * จึงได้ความสามารถเพิ่มน้อยมากแลกกับหัวสติกกี้ที่สูงขึ้นและชิปโดนตัดขอบทั้งคู่
   * เป็นเหตุผลชุดเดียวกับที่ไทล์บนหน้าแรกเลือกเปลี่ยนทั้งชุดแทนที่จะเพิ่มช่อง (OrderStatusBand)
   *
   * แกนที่ถูกแทน (สำเร็จ/ยกเลิก ฯลฯ) ไม่ได้หายไป — ย้ายเข้าโมดัลตัวกรอง ซึ่งเป็นที่ของ
   * "ตัวกรองที่นาน ๆ ใช้ที" ส่วนแถวชิปเป็นที่ของ "กองงานที่สลับดูทุกวัน"
   *
   * feature 00036 ขยายเป็น 3 ทาง: ร้านคิวงานที่มีนัดได้ "สถานะนัด" ด้วยเหตุผลชุดเดียวกัน —
   * มันคือกองงานที่ร้านสลับดูทุกวัน ส่วนสถานะการขายเป็นของที่นาน ๆ ใช้ที
   * ลำดับ if ไม่สำคัญเชิงตรรกะ (ร้านหนึ่งเข้าเงื่อนไขได้อันเดียว) แต่เขียนเรียงไว้ให้อ่านชัด
   */
  const chipRow: { key: string; label: string; count: number; active: boolean; select: () => void }[] =
    hasAppointmentAxis
      ? [
          {
            key: 'all',
            label: 'ทั้งหมด',
            count: orders.length,
            active: appt === null,
            select: () => pushQuery({ appt: null }),
          },
          /* วางถัดจาก "ทั้งหมด" ไม่ใช่ท้ายสุด — "ไม่มีนัด" ไม่ใช่จุดบนเส้นทางของนัด
             (นัดแล้ว→ยืนยัน→จบ) ถ้าอยู่ท้ายจะอ่านเป็นขั้นถัดจาก "ไม่มาตามนัด"
             และในร้านจริงมันคือกองที่ใหญ่ที่สุด ควรอยู่ใกล้ "ทั้งหมด" ที่สุด */
          {
            key: 'NONE',
            label: 'ไม่มีนัด',
            count: noAppointmentCount,
            active: appt === 'NONE',
            select: () => pushQuery({ appt: 'NONE' }),
          },
          ...APPOINTMENT_STAGE_KEYS.map((k) => ({
            key: k,
            label: APPOINTMENT_STAGE_META[k].label,
            count: apptCounts[k],
            active: appt === k,
            select: () => pushQuery({ appt: k }),
          })),
        ]
      : hasStageAxis
      ? [
          {
            key: 'all',
            label: 'ทั้งหมด',
            count: orders.length,
            active: stage === null,
            select: () => pushQuery({ stage: null }),
          },
          ...STAGE_CHIPS.map((k) => ({
            key: k,
            label: SHIPPING_STAGE_LABEL[k],
            count: stageCounts[k] ?? 0,
            active: stage === k,
            select: () => pushQuery({ stage: k }),
          })),
        ]
      : STATUS_TABS.map((t) => ({
          key: t.value,
          label: t.label,
          count: statusCounts[t.value] ?? 0,
          active: localStatus === t.value,
          select: () => handleStatusTab(t.value),
        }))

  // ─── filter pipeline ─────────────────────────────────────────────────────────
  /**
   * กรองด้วยแกนเสริมอย่างเดียว (พัสดุ หรือ นัดหมาย) — ตารางเดสก์ท็อปมีตัวกรอง status/ประเภท/
   * ค้นหาของตัวเองอยู่แล้ว · ทั้งสองแกนกรองจาก field เดียวกับที่ตัวนับข้างบนนับ (BR-SOV-06)
   */
  const stageFiltered = useMemo(() => {
    let list = orders
    if (stage) list = list.filter((o) => o.shippingStage === stage)
    // 'NONE' กรองด้วยเงื่อนไขเดียวกับที่ noAppointmentCount นับ — ห้ามเขียนคนละแบบ
    if (appt === 'NONE') list = list.filter((o) => !o.appointment)
    else if (appt) list = list.filter((o) => o.appointment?.stage === appt)
    return list
  }, [orders, stage, appt])

  const filtered = useMemo(() => {
    let list = stageFiltered
    if (localStatus !== 'all') list = list.filter((o) => o.status === localStatus)
    if (typeFilter) list = list.filter((o) => o.orderType === typeFilter)
    if (dateFilter !== 'All')
      list = list.filter((o) => matchesOrderDateFilter(o.createdAtISO, dateFilter))
    if (search.trim()) {
      const q = search.toLowerCase().trim()
      list = list.filter(
        (o) =>
          o.id.toLowerCase().includes(q) ||
          o.publicToken.toLowerCase().includes(q) ||
          (o.buyerName ?? '').toLowerCase().includes(q) ||
          o.buyer.toLowerCase().includes(q),
      )
    }
    return list
  }, [stageFiltered, localStatus, typeFilter, search, dateFilter])

  // reset lazy-load เมื่อ filter/search/status เปลี่ยน
  useEffect(() => {
    setVisibleCount(PAGE)
  }, [localStatus, typeFilter, search, stage, appt, dateFilter])

  // ─── lazy-load: เพิ่ม visibleCount เมื่อ sentinel เข้า viewport ───────────────
  const visible = filtered.slice(0, visibleCount)
  const hasMore = visibleCount < filtered.length

  useEffect(() => {
    if (!hasMore) return
    const el = sentinelRef.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setVisibleCount((c) => c + PAGE)
      },
      { rootMargin: '200px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [hasMore, filtered.length])

  // ─── cancel callbacks (Sweet Alerts confirm — Hard Rule safepay-ux #8) ──────────
  const handleCancelRequest = async (token: string) => {
    const order = orders.find((o) => o.publicToken === token)
    const label = order
      ? `${vocab.noun} ${formatOrderNo(order.publicToken, order.createdAtISO)}`
      : `${vocab.noun}นี้`
    const ok = await pacesConfirm.danger(`ยกเลิก${vocab.noun}นี้?`, `${label} จะถูกปิด · ย้อนกลับไม่ได้`, {
      confirmButtonText: 'ยืนยันยกเลิก',
      cancelButtonText: 'ไม่ใช่ตอนนี้',
    })
    if (!ok) return
    try {
      const res = await fetch(`/api/orders/${token}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (res.ok) {
        pacesToast.success(`ยกเลิก${vocab.noun}แล้ว`)
        busy.run(() => router.refresh())
      } else {
        const data = await res.json().catch(() => ({}))
        pacesToast.error(typeof data?.error === 'string' ? data.error : `ยกเลิก${vocab.noun}ไม่สำเร็จ กรุณาลองใหม่`)
      }
    } catch {
      pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
    }
  }

  /**
   * จุดแดงบนปุ่มตัวกรอง = "มีตัวกรองที่มองไม่เห็นบนจอเปิดอยู่" จึงนับเฉพาะแกนที่ไม่ได้อยู่บนแถวชิป
   * แกนที่อยู่บนชิปไม่ต้องนับ เพราะชิปที่ถูกเลือกบอกตัวเองอยู่แล้ว — ถ้านับด้วยจุดแดงจะติดตลอดเวลา
   * จนกลายเป็นสัญญาณที่ไม่มีความหมาย
   */
  const activeFilterCount =
    (typeFilter ? 1 : 0) +
    // ช่วงเวลาอยู่ในโมดัลอย่างเดียว (ไม่มีบนแถวชิป) จึงต้องนับ ไม่งั้นกรองวันแล้วรายการหด
    // โดยไม่มีสัญญาณอะไรบนจอเลย
    (dateFilter !== 'All' ? 1 : 0) +
    // เงื่อนไขต้องตรงกับเงื่อนไขที่ render ส่วน "สถานะการขาย" ในโมดัลเป๊ะ (ดูข้างล่าง) —
    // feature 00036 เปิดให้ร้านคิวงานเห็นส่วนนั้นด้วย แต่ถ้าลืมแก้บรรทัดนี้คู่กัน จะกรองแล้ว
    // รายการหดจาก 120 เหลือ 3 โดยไม่มีสัญญาณอะไรบนจอเลยว่าเกิดจากตัวกรอง
    ((hasStageAxis || hasAppointmentAxis) && localStatus !== 'all' ? 1 : 0)

  return (
    <>
      {/* ─── Desktop (≥lg): DataTable แบบ Paces theme ──────────────────────── */}
      <div className="hidden lg:block">
        {/* แถบชิปพัสดุ desktop ถูกย้ายเป็น dropdown "พัสดุ" ใน toolbar ของตาราง
            (user 2026-08-06) — state/ตัวนับยังอยู่ที่นี่ symbol เดียวกับชิปมือถือ */}
        <OrdersTable
          orders={stageFiltered}
          ishipEnabled={ishipEnabled}
          vocab={vocab}
          busy={busy}
          stageFilter={
            hasStageAxis
              ? {
                  value: stage,
                  counts: stageCounts,
                  onChange: (v) => pushQuery({ stage: v }),
                }
              : undefined
          }
          hasShippingAxis={hasShippingAxis}
          appointmentFilter={
            hasAppointmentAxis
              ? {
                  value: appt,
                  // ยัด NONE เข้า counts ก้อนเดียวกับ 5 สถานะจริง เพื่อให้ดรอปดาวน์เดสก์ท็อป
                  // อ่านตัวเลขจากที่เดียวกับชิปมือถือ (symbol เดียว — sibling-surface-parity)
                  counts: { ...apptCounts, NONE: noAppointmentCount },
                  onChange: (v) => pushQuery({ appt: v }),
                }
              : undefined
          }
        />
      </div>

      {/* ─── Mobile/Tablet (<lg): card layout เดิม (ห้ามแตะ logic ข้างใน) ─── */}
      <div className="lg:hidden">
      {/* phone: full-bleed (-mx-4 หักล้าง shell padding); tablet+ (md): center + max-width
          กันการ์ดยืดเต็มกว้างบน tablet (responsive). marker .orders-fullbleed = CSS :has() scope
          onTouch*: swipe ซ้าย/ขวาเพื่อสลับ status tab */}
      <div
        className="orders-fullbleed -mx-4 md:mx-auto md:max-w-2xl"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
      {/* ─── Sticky header (พื้นขาว bg-card): back + search + filter + bell + tabs ──
          z-30: Paces .btn มี position:relative z-index:10 → ปุ่มในการ์ดจะทะลุทับ header
          ตอน scroll ถ้า header z ≤ 10. ดัน z-30 ให้ชนะ (modal = z-50 ยังเหนือกว่า) */}
      {/* pt = 1.5rem + safe-area: หน้านี้ full-bleed ไม่มี header ของ layout (SellerMobileHeader
          คืน null) และ sticky top-0 → ตั้งแต่เปิด viewportFit:'cover' (2026-08-06) ต้องเว้น
          status bar เอง ไม่งั้นแถวค้นหาไปนอนใต้นาฬิกาทั้งตอนพักและตอนเลื่อน */}
      <div data-orders-header className="sticky top-0 z-30 bg-card px-2 pt-[calc(1.5rem+env(safe-area-inset-top))]"> {/* carve-out: safe-area ไม่มี token */}
        <div className="flex items-center gap-2">
          {/* back → /dashboard (แท็บหลัก: กลับหน้าหลัก) */}
          <Link
            href="/dashboard"
            aria-label="ย้อนกลับ"
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-default-700"
          >
            <Icon icon="arrow-left" className="text-xl" />
          </Link>

          {/* search — pill สีขาว (ตาม mockup Frame 3 ".search" style) */}
          <div className="relative flex-1">
            {/* HR7: rounded-full + bg-white = arbitrary แต่ตาม mockup v10 spec §6 "white pill input" */}
            <Icon
              icon="solar:magnifer-linear"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-base text-default-400"
            />
            <input
              type="text"
              className="form-input w-full rounded-full bg-white !pl-9"
              placeholder={`ค้นหาเลข${vocab.noun} / ชื่อลูกค้า / เบอร์`}
              value={search}
              /* setSearch อยู่นอก transition โดยตั้งใจ — controlled input ที่ถูก defer จะพิมพ์
                 ตามนิ้วไม่ทัน; แผงเปิดด้วย begin() แทน แล้วหุบเองหลังหยุดพิมพ์ */
              onChange={(e) => {
                setSearch(e.target.value)
                busy.begin()
              }}
            />
          </div>

          {/* filter → full modal */}
          <button
            type="button"
            onClick={() => setFilterOpen(true)}
            aria-label="ตัวกรอง"
            className="relative inline-flex size-10 shrink-0 items-center justify-center rounded-lg border border-default-300 text-default-700"
          >
            <Icon icon="adjustments-horizontal" className="text-lg" />
            {activeFilterCount > 0 && (
              <span className="absolute -right-1 -top-1 size-2.5 rounded-full bg-primary ring-2 ring-body-bg" />
            )}
          </button>

          {/* bell → /notifications */}
          <Link
            href="/notifications"
            aria-label="การแจ้งเตือน"
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-default-700"
          >
            <Icon icon="bell" className="text-xl" />
          </Link>

          {/* ดึงจาก iShip — สำหรับร้านที่เปิดพัสดุบน iShip ก่อนแล้วค่อยมาบันทึกออเดอร์
              รองเป็นปุ่ม tonal เพราะ "สร้างออเดอร์" ยังเป็น action หลักของหน้านี้

              ishipEnabled: เพิ่ม 2026-08-07 (feature 00036 FR-SOV-002) — ปุ่มนี้ไม่เคยผูกกับ
              อะไรเลยตั้งแต่วันแรก ร้านคิวงาน/บ้านพักและร้านขายออนไลน์ที่ยังไม่เชื่อม iShip
              จึงเห็นปุ่มที่เปิดโมดัลนำเข้าพัสดุซึ่งไม่มีทางใช้ได้ (ปุ่มพิมพ์ใบปะหน้าใน
              BulkActionBar ผูกไว้ถูกอยู่แล้ว — ตัวนี้หลุดไปตัวเดียว) */}
          {ishipEnabled && (
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="btn hidden shrink-0 bg-primary/15 text-primary-ink hover:bg-primary/25 lg:inline-flex"
            >
              <Icon icon="package-import" className="text-sm" />
              ดึงจาก iShip
            </button>
          )}

          {/* สร้างออเดอร์ (มือถือ) — ปุ่ม filled สีน้ำเงินตัวเดียวในหัวหน้า
              หน้านี้ full-screen จึงซ่อน SellerBottomNav ทั้งก้อน → FAB หายไปด้วย
              คอมเมนต์เดิมเขียนว่า "มือถือใช้ FAB ใน bottom nav" ซึ่งไม่จริงมาตลอด:
              สร้างออเดอร์จากหน้านี้บนมือถือทำไม่ได้เลย (พบ 2026-08-06 ตอนทำหน้า /products) */}
          <Link
            href="/orders/new"
            aria-label={vocab.createLabel}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary text-white lg:hidden"
          >
            <Icon icon="plus" className="text-xl" />
          </Link>

          {/* สร้างออเดอร์ — เดสก์ท็อป (มีข้อความกำกับ) */}
          <Link
            href="/orders/new"
            className="btn hidden shrink-0 bg-primary text-white hover:bg-primary-hover lg:inline-flex"
          >
            <Icon icon="plus" className="text-sm" />
            {vocab.createLabel}
          </Link>
        </div>

        {/* filter chips — แถวเดียว เลื่อนแนวนอน (ซ่อน scrollbar); สลับด้วย swipe ทั้งจอ
            รายการชิปมาจาก chipRow: ร้านขายออนไลน์ = สถานะพัสดุ · ร้านอื่น = สถานะการขายแบบเดิม
            เปลี่ยนจาก underline-tab → chip row ตาม mockup v10 Frame 3 ".chips" style
            HR7: [&::-webkit-scrollbar]:hidden = arbitrary selector (Tailwind utility ไม่มี token) — ซ่อน scrollbar Safari/Chrome */}
        <div
          ref={tabsRef}
          className="mt-2 flex gap-2 overflow-x-auto pb-2 [&::-webkit-scrollbar]:hidden"
        >
          {chipRow.map((chip) => (
            <button
              key={chip.key}
              type="button"
              data-active={chip.active}
              onClick={chip.select}
              className={cn(
                // focus-visible:ring แทน focus:outline-none ลอย ๆ — ธีมไม่มี `.badge:focus` มาชดเชย
                // (grep `.badge` ใน src/assets/css แล้วไม่มี :focus เลย) ปิด outline เฉย ๆ
                // = คนใช้คีย์บอร์ด Tab ผ่านทั้งแถวโดยไม่รู้ว่าอยู่ชิปไหน (WCAG 2.4.7)
                // ท่าเดียวกับ OrderDateRow.tsx:173 / ProductGrid.tsx:107 / QuickPriceSheet.tsx:28
                // ไม่ใส่ ring-offset โดยตั้งใจ — offset color ค่าเริ่มต้นเป็นขาว จะกลายเป็นวงขาว
                // คาดรอบชิปบนการ์ดโหมดมืด (Paces มี dark toggle จริงที่ topbar)
                'badge shrink-0 cursor-pointer whitespace-nowrap transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                // HR7: rounded-full ไม่ใช่ Paces .badge default radius แต่ตาม mockup v10 chip style
                'rounded-full px-3.5 py-1.5 text-xs font-medium',
                chip.active
                  ? 'bg-primary text-white'
                  : 'bg-default-100 text-default-500',
              )}
            >
              {chip.label}
              {chip.count > 0 && (
                <span className="ms-1 font-bold tabular-nums">{chip.count}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Order cards + lazy-load ──────────────────────────────────────────── */}
      {/* relative = กล่องอ้างอิงของแผงโหลด — ครอบเฉพาะพื้นที่ผลลัพธ์ ไม่รวมหัวสติกกี้ข้างบน
          (ชิป/ช่องค้นหาต้องกดต่อได้ระหว่างโหลด ดูเหตุผลเต็มใน ListBusyOverlay.tsx) */}
      <div className="relative">
      {visible.length === 0 ? (
        <div className="card mt-3">
          <div className="card-body">
            <SellerEmptyState
              compact
              icon="shopping-cart-off"
              title={
                isSpecificDay(dateFilter)
                  ? `ไม่มี${vocab.noun}วันที่ ${formatDateTH(`${dateFilter}T00:00:00+07:00`)}`
                  : `ไม่มี${vocab.noun}ในสถานะนี้`
              }
              action={{ label: `+ ${vocab.createLabel}แรก`, href: '/orders/new' }}
            />
          </div>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {visible.map((order) => (
            <OrderCard key={order.publicToken} order={order} onCancelRequest={handleCancelRequest} vocab={vocab} />
          ))}

          {/* sentinel — IntersectionObserver โหลดเพิ่มเมื่อเลื่อนถึง */}
          {hasMore && (
            <div ref={sentinelRef} className="flex items-center justify-center gap-2 py-4 text-xs text-default-500">
              <span className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              กำลังโหลด...
            </div>
          )}
          {!hasMore && filtered.length > PAGE && (
            <p className="py-3 text-center text-xs text-default-400">ครบทุกออเดอร์แล้ว ({filtered.length})</p>
          )}
        </div>
      )}
      {/* bg-body-bg ทับ bg-card ที่เป็นค่าตั้งต้น (twMerge — ตัวหลังชนะ): ฝั่งมือถือรายการเป็น
          การ์ดแยกใบวางบนพื้นเพจ ไม่ได้อยู่ในการ์ดใบใหญ่แบบตารางเดสก์ท็อป ถ้าใช้พื้นขาวของการ์ด
          จะกลายเป็นแผ่นขาวแปะทับพื้นเพจ เห็นเป็นกล่องประหลาดแทนที่จะเป็น "ที่ว่างที่รอของ" */}
      <ListBusyOverlay busy={busy.busy} className="bg-body-bg" />
      </div>{/* /relative — พื้นที่ผลลัพธ์ + แผงโหลด */}
      </div>{/* /full-bleed wrapper */}
      </div>{/* /lg:hidden mobile wrapper */}

      {/* ─── Filter modal (full screen) — อยู่นอก lg:hidden เพราะเป็น overlay ใช้ทุก breakpoint ───────────────────────────────────────── */}
      {filterOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-card" role="dialog" aria-modal="true" aria-label="ตัวกรอง">
          <div className="flex items-center gap-3 border-b border-default-200 px-4 py-3">
            <button
              type="button"
              onClick={() => setFilterOpen(false)}
              aria-label="ปิด"
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-default-700"
            >
              <Icon icon="x" className="text-xl" />
            </button>
            <span className="text-lg font-semibold text-default-900">ตัวกรอง</span>
          </div>

          {/* overscroll-contain: กล่อง scroll ในโมดัลที่เนื้อหายังไม่ล้นก็ chain ออกไปเลื่อนหน้า
              ข้างหลังได้ (บั๊กชัดที่สุดตอนเนื้อหาสั้น ซึ่งเป็นกรณีปกติของโมดัลนี้) */}
          <div className="flex-1 overflow-auto overscroll-contain p-4">
            {/* สถานะการขาย — เฉพาะร้านที่แถวชิปถูกแกนเสริมยึดไปแล้ว (พัสดุ หรือ นัดหมาย)
                ร้านที่ไม่มีแกนเสริมเลย แกนนี้ยังอยู่บนแถวชิป จึงไม่ต้องมีซ้ำในนี้
                แถวหน้าตาเดียวกับประเภทออเดอร์ทุกประการ */}
            {(hasStageAxis || hasAppointmentAxis) && (
              <>
                <p className="mb-2 text-sm font-medium text-default-900">สถานะการขาย</p>
                <div className="mb-5 space-y-1">
                  {STATUS_TABS.map((tab) => {
                    const active = localStatus === tab.value
                    const count = statusCounts[tab.value] ?? 0
                    return (
                      <button
                        key={tab.value}
                        type="button"
                        onClick={() => handleStatusTab(tab.value)}
                        className={cn(
                          'flex w-full items-center justify-between rounded-lg border px-4 py-3 text-sm transition-colors',
                          active ? 'border-primary bg-primary/5 text-primary' : 'border-default-200 text-default-700',
                        )}
                      >
                        <span>
                          {tab.label}
                          <span className="ms-1.5 tabular-nums text-default-400">{count}</span>
                        </span>
                        {active && <Icon icon="check" className="text-base" />}
                      </button>
                    )
                  })}
                </div>
              </>
            )}

            <p className="mb-2 text-sm font-medium text-default-900">ประเภทออเดอร์</p>
            <div className="space-y-1">
              {TYPE_OPTIONS.map((opt) => {
                const active = typeFilter === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => busy.run(() => setTypeFilter(opt.value))}
                    className={cn(
                      'flex w-full items-center justify-between rounded-lg border px-4 py-3 text-sm transition-colors',
                      active ? 'border-primary bg-primary/5 text-primary' : 'border-default-200 text-default-700',
                    )}
                  >
                    {opt.label}
                    {active && <Icon icon="check" className="text-base" />}
                  </button>
                )
              })}
            </div>

            {/* ช่วงเวลา — section ใหม่ 2026-08-08 (user สั่ง "เพิ่ม filter ให้ระบุวันที่ได้")
                มือถือไม่เคยมีตัวกรองนี้เลย มีแต่ฝั่งเดสก์ท็อป · โครงปุ่มยกจาก "ประเภทออเดอร์"
                ข้างบนทุกคลาส เพื่อให้ 3 section ในโมดัลเดียวกันอ่านเป็นชุดเดียว */}
            <p className="mt-5 mb-2 text-sm font-medium text-default-900">ช่วงเวลา</p>
            <div className="space-y-1">
              {Object.entries(ORDER_DATE_PRESETS).map(([key, label]) => {
                const active = dateFilter === key
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => busy.run(() => setDateFilter(key))}
                    className={cn(
                      'flex w-full items-center justify-between rounded-lg border px-4 py-3 text-sm transition-colors',
                      active ? 'border-primary bg-primary/5 text-primary' : 'border-default-200 text-default-700',
                    )}
                  >
                    {label}
                    {active && <Icon icon="check" className="text-base" />}
                  </button>
                )
              })}

              {/* เลือกวันเจาะจง — ช่องขยายอยู่ในหน้าเดิม ไม่เปิดชีตซ้อนชีต (โมดัลนี้เป็น
                  fixed inset-0 อยู่แล้ว ซ้อนอีกชั้นทำให้ scroll-lock ยุ่งและไม่มี precedent)
                  native picker เปิดที่ระดับ OS จึงไม่มีทางโดนกล่อง scroll ของโมดัลตัด */}
              <div
                className={cn(
                  'rounded-lg border px-4 py-3 transition-colors',
                  isSpecificDay(dateFilter)
                    ? 'border-primary bg-primary/5'
                    : 'border-default-200',
                )}
              >
                <label
                  htmlFor="orders-date-filter"
                  className={cn(
                    'mb-2 block text-sm',
                    isSpecificDay(dateFilter) ? 'text-primary' : 'text-default-700',
                  )}
                >
                  เลือกวันที่
                </label>
                <div className="input-icon-group">
                  <Icon icon="calendar-search" className="input-icon" />
                  <input
                    id="orders-date-filter"
                    type="date"
                    className="form-input"
                    value={isSpecificDay(dateFilter) ? dateFilter : ''}
                    onChange={(e) => {
                      // ว่าง = ผู้ใช้กดล้างค่าในตัว picker → กลับไป "ทั้งหมด" ไม่ใช่ค้างสถานะกำกวม
                      busy.run(() => setDateFilter(e.target.value || 'All'))
                    }}
                  />
                </div>
                {isSpecificDay(dateFilter) && (
                  <p className="text-default-500 mb-0 mt-2 text-xs">
                    กรองเฉพาะวันที่ {formatDateTH(`${dateFilter}T00:00:00+07:00`)}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="flex gap-2 border-t border-default-200 p-4">
            <button
              type="button"
              onClick={() => {
                busy.run(() => {
                  setTypeFilter('')
                  setDateFilter('All')
                })
                // ล้างเฉพาะสิ่งที่โมดัลนี้คุม — แถวชิปด้านนอกเป็นการเลือกของผู้ใช้ที่ยังเห็นอยู่
                // ถ้าล้างไปด้วยจะเหมือนปุ่มนี้แอบไปกดชิปแทนเขา
                if (hasStageAxis && localStatus !== 'all') handleStatusTab('all')
              }}
              className="btn flex-1 border-default-300 text-default-700"
            >
              ล้างตัวกรอง
            </button>
            <button
              type="button"
              onClick={() => setFilterOpen(false)}
              className="btn flex-1 bg-primary text-white hover:bg-primary-hover"
            >
              ดูผลลัพธ์
            </button>
          </div>
        </div>
      )}

      <IShipImportModal open={importOpen} onClose={() => setImportOpen(false)} />

    </>
  )
}
