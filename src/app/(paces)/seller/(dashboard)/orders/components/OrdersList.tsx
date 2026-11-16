/**
 * OrdersList — mobile orders (Shopee-IA × Paces skin, v8.2)
 *
 * header: [← back] [search] [filter btn → full modal] [bell]  → sticky top
 * tabs: status filter (count badge, underline)  → primary nav
 * list: OrderCard standalone + lazy-load on scroll (IntersectionObserver, ไม่มี pagination)
 * filter modal: OrdersFilterModal ตัวเดียวทุกจอ (2026-11-15) — เลือกร่างแล้วกด "ใช้ตัวกรอง" · ทุกแกนอยู่ใน URL
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/orders/components/OrdersList.tsx
 *       (tabs underline + count); modal: OrdersFilterModal.tsx (Base: theme/paces/.../ui/modals/page.tsx)
 * SellerMobileHeader คืน null สำหรับ /orders → หน้านี้เป็นเจ้าของ header เอง
 */

'use client'

import Icon from '@/components/wrappers/Icon'
import type { OrderVocab } from '@/lib/seller-menu'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { cn } from '@/utils/helpers'
import { FULFILLMENT_FILTER_KEYS, FULFILLMENT_FILTER_LABEL, courierKeyOf, type OrderRow } from './data'
import { formatOrderNo } from '@/lib/order-no'
import {
  ORDER_SEARCH_MIN_CHARS,
  countMatchingOrders,
  isSearchActive,
  searchOrders,
  type OrderSearchHit,
} from '@/lib/order-search'
import OrderCard from './OrderCard'
import { useViewerCan } from './OrderViewerRoles'
import OrdersExport from './OrdersExport'
import IShipImportModal from './IShipImportModal'
import { pacesConfirm, pacesConfirmWithReason } from '@/lib/paces-swal'
import { CANCEL_REASONS_BY_VERTICAL } from '@/lib/cancel-reasons'
import type { ShopVertical } from '@/lib/lodging'
import { pacesToast } from '@/lib/paces-toast'
import SellerEmptyState from '../../_shared/SellerEmptyState'
import OrdersTable from './OrdersTable'
import ListBusyOverlay, { useListBusy } from '../../_shared/ListBusyOverlay'
import OrdersFilterModal, { type FilterChoice } from './OrdersFilterModal'
import OrdersFilterChips, { type FilterChip } from './OrdersFilterChips'
import {
  ORDERS_FILTER_PARAMS,
  AD_NONE,
  buildAdOptions,
  countActiveFilters,
  matchesOrdersFilters,
  parseOrdersFilters,
  serializeOrdersFilters,
  type OrdersFilters,
} from '@/lib/orders-filter'
import { adDisplayName } from '@/lib/ad-attribution'
import { fmt } from '@/i18n/fmt'

// ─── status tabs ────────────────────────────────────────────────────────────
import { SHIPPING_STAGE_LABEL } from '@/lib/order-stage'
import { isServiceWorkStage } from '@/lib/service-work-stage'
import { useT } from '@/i18n/LocaleProvider'
import {
  APPOINTMENT_STAGE_KEYS,
  APPOINTMENT_STAGE_META,
  countAppointmentStages,
} from '@/lib/appointment-stage'
import { appointmentOverlapsDay, isAppointmentDayKey } from '@/lib/appointment-day'
import { orderItemVocab, orderStatusMetaFor, orderWord } from '@/lib/order-display'
import { ORDER_DATE_PRESETS, isSpecificDay } from '@/lib/order-date-filter'
import { formatDateTH } from '@/lib/format-date'

/** ลำดับชิปสถานะพัสดุ — เรียงตามเส้นทางจริงของพัสดุ ปิดท้ายด้วยกองที่ต้องแก้ */
const STAGE_CHIPS = [
  // 🛑 feature 00061 — "ร่าง" อยู่ **หัวแถว** ไม่ใช่ท้ายแถว: มันคืองานที่มีเส้นตายจริง
  // (หายไปเองใน 7 วัน) ต่างจากกองพัสดุที่รออยู่ได้เรื่อย ๆ — ของที่หายได้ต้องอยู่ในสายตาก่อน
  'DRAFT',
  'AWAITING_PARCEL',
  'AWAITING_DISPATCH', // feature 00080 — ส่งเอง: มีเลขแล้ว รอร้านกด "จัดส่งแล้ว"
  'AWAITING_PICKUP',
  'SHIPPING',
  'AWAITING_COD',
  'PROBLEM',
  'RETURNED',
] as const

// คำของแต่ละสถานะมาจาก SSOT ตัวเดียวกับ badge บนแถว/การ์ด (lib/order-display.ts) — ชิปกับป้าย
// ที่อยู่ห่างกันไม่กี่สิบพิกเซลต้องพูดคำเดียวกันเสมอ ห้ามพิมพ์คำซ้ำไว้ที่นี่
// ป้าย SHIPPED ผันตาม vocab (ร้านบริการไม่มีการจัดส่ง) จึงสร้างในคอมโพเนนต์ ไม่ใช่ค่าคงที่ระดับ module
// feature 00073 — ร้านบริการไม่มีขั้น SHIPPED แล้ว (vocab.hasShippedStatus = false) ⇒ ไม่มีแท็บนี้
const buildStatusTabs = (vocab: OrderVocab): { value: string; label: string }[] => [
  { value: 'all', label: 'ทั้งหมด' },
  ...Object.entries(orderStatusMetaFor(vocab))
    .filter(([value]) => vocab.hasShippedStatus || value !== 'SHIPPED')
    .map(([value, meta]) => ({ value, label: meta.label })),
]

const PAGE = 8 // จำนวนต่อรอบ lazy-load

/**
 * หน่วงก่อนนำคำค้นไปใช้ (กรองรายการ + เขียน `?q=` + แผงโหลด) — user ขอให้นานขึ้น 2026-08-25
 *
 * ตัวหน่วง **ตัวเดียว** คุมทั้งสามอย่าง ไม่ใช่ต่างคนต่างจับเวลา: ของเดิม URL หน่วง 400ms
 * แต่การกรองกับแผงโหลดทำงานทุกตัวอักษร ⇒ จอกะพริบขณะพิมพ์โดยที่ค่าใน URL ยังตามไม่ทัน
 *
 * 🛑 ห้ามเอาไปหน่วง `<input>` เอง — ช่องพิมพ์ต้องตอบทุกตัวอักษรทันที
 * (บทเรียนที่เขียนกำกับไว้ที่ onChange ทั้งสองจอ)
 */
const SEARCH_DEBOUNCE_MS = 550

type Props = {
  orders: OrderRow[]
  /** ร้านเชื่อมต่อ iShip + เป็นร้านขายออนไลน์ (feature 00022; vertical=ONLINE_SALES ตั้งแต่ 00028) */
  ishipEnabled?: boolean
  /** iShip หรือ Flash เชื่อมอยู่ (00084) — คุมปุ่มพิมพ์ใบปะหน้าหลายใบ */
  shippingEnabled?: boolean
  /** คลังคำผันตามประเภทกิจการ (feature 00030) — มาจาก RSC ที่รู้จัก shop.vertical ของ request */
  vocab: OrderVocab
  /** ประเภทกิจการของร้าน (feature 00039) — ใช้เลือกชุดเหตุผลตอนยกเลิก */
  vertical: ShopVertical
  /**
   * ร้านนี้มีโดเมนพัสดุไหม (feature 00036 FR-SOV-001) — false = ไม่มีคอลัมน์ที่อยู่จัดส่ง/ขนส่ง
   *
   * ตัดสินจาก vertical ที่ RSC ล้วน ไม่ derive จากข้อมูลของแถว: คอลัมน์ที่โผล่/หายตามว่า
   * "หน้านี้บังเอิญมีใบที่มีพัสดุไหม" จะขยับเองตอน lazy-load ซึ่งอ่านเป็นจอกระตุก (BR-SOV-09)
   */
  hasShippingAxis?: boolean
  /**
   * false (ค่าตั้งต้น) = ผู้ดูระดับเงิน NONE (ช่าง) — ส่งต่อให้ตาราง/การ์ดซ่อนเงินทั้งหมด (00071 P3 · S-15)
   * ตัดสินที่ page.tsx จาก `moneyLevel` ที่เดียว · ข้อมูลฝั่ง server ก็ไม่มีคีย์เงินอยู่แล้ว prop นี้คือด่านชั้นที่สอง
   */
  showMoney?: boolean
}

export default function OrdersList({
  orders,
  ishipEnabled = false,
  shippingEnabled = false,
  vocab,
  vertical,
  hasShippingAxis = true,
  showMoney = false,
}: Props) {
  // ปุ่มสร้าง/ลิงก์สร้างในหน้านี้ = O2s (ผู้ไม่มี O2s ไม่เห็น — ช่างเปิดบิลไม่ได้)
  const canCreate = useViewerCan('O2s')
  // 00086 แถว "แสดง N ใบ + ส่งออก" บนมือถือ — เจ้าของร้านเท่านั้น (ปุ่มเช็ค P3 เองอีกชั้น)
  const canExport = useViewerCan('P3')
  const STATUS_TABS = useMemo(() => buildStatusTabs(vocab), [vocab])
  // คำเรียกของที่ขาย/คำว่าออเดอร์ — เฉพาะร้านบริการที่เปลี่ยน (SSOT: PRODUCT_VOCAB/ORDER_VOCAB)
  const itemVocab = orderItemVocab(vertical)
  const isService = vertical === 'SERVICE_QUEUE'
  const orderNoun = orderWord(vertical, vocab)
  const router   = useRouter()
  const pathname = usePathname()

  /**
   * แผงโหลดของหน้านี้ — ตัวเดียวคุมทั้ง 2 breakpoint (มือถือ = การ์ด, เดสก์ท็อป = ตาราง)
   * เพราะเห็นได้ทีละจอ และตัวกรอง `?stage=` เกิดที่นี่แต่ถูกกดจาก toolbar ของตาราง
   * ถ้าแยก state สองชุด ฝั่งตารางจะไม่รู้ว่ากำลังรอ RSC payload ใหม่อยู่
   */
  const busy = useListBusy()

  const searchParams = useSearchParams()
  /**
   * ตัวกรองทุกแกนอ่านจาก URL ล้วน (2026-11-15: status/courier/date/type/ad ก็ย้ายเข้า URL แล้ว — รีเฟรชไม่หาย)
   * parse ด้วย `parseOrdersFilters` ตัวเดียว — ค่าที่ไม่รู้จักถูกทิ้ง (fail-open) ไม่ throw
   * memo ด้วยสตริง query ไม่ใช่อ็อบเจ็กต์ที่ hook คืน (docs/conventions/hook-return-identity-in-deps.md)
   */
  const qs = searchParams.toString()
  const knownStatus = useMemo(
    () => new Set(Object.keys(orderStatusMetaFor(vocab)).filter((v) => vocab.hasShippedStatus || v !== 'SHIPPED')),
    [vocab],
  )
  const parsed = useMemo(() => parseOrdersFilters(new URLSearchParams(qs), { status: knownStatus }), [qs, knownStatus])
  const stage = parsed.stage as keyof typeof SHIPPING_STAGE_LABEL | null
  const localStatus = parsed.status ?? 'all'
  /**
   * ?appt= — แกนที่สองของร้านคิวงาน (feature 00036 FR-SOV-008, มติ D-1)
   *
   * อ่านจาก URL แบบเดียวกับ ?stage= ทุกประการ (ไม่ mirror เป็น state) เพื่อให้ปุ่ม back และ
   * ลิงก์จากที่อื่นให้ผลตรงกัน · ค่าที่ไม่รู้จัก = ไม่กรอง (fail-open) ไม่ใช่หน้าว่างเปล่า
   * ร้านหนึ่งมีแกนเสริมได้แกนเดียว (พัสดุ หรือ นัดหมาย) จึงไม่ต้องกันสองพารามิเตอร์ชนกัน
   */
  /** 'NONE' = ใบที่ไม่มีนัด (walk-in) · ค่าอื่น = สถานะนัดจริง — parse/validate ใน orders-filter.ts */
  const appt = parsed.appt
  /**
   * `?apptDay=` — แกน "วันของนัด" (ทางเข้าเดียวตอนนี้คือไทล์ "นัดวันนี้" บนหน้าแรก 2026-08-10)
   *
   * แยกจาก `?appt=` โดยตั้งใจ: อันนั้นเป็นแกน *สถานะ* ส่วนอันนี้เป็นแกน *วันที่* ใช้พร้อมกันได้
   * (นัดวันนี้ + ที่ยังไม่ยืนยัน) — เอาค่าวันที่ไปปนในแกนสถานะคือคลาสบั๊กเดียวกับ 00028
   *
   * แยกจาก `dateFilter` ด้วย เพราะตัวนั้นกรอง `createdAtISO` = **วันที่สั่งซื้อ** คนละวันกับวันนัด
   * และเป็น client state ที่ deep-link ไม่ได้ · ค่าที่ไม่รู้จัก = ไม่กรอง (fail-open)
   */
  /**
   * `?work=` — ขั้นงานร้านบริการ (ทางเข้า: ไทล์ "งานบริการ" บนหน้าแรก 2026-10-10)
   * อ่านจาก URL ล้วนเหมือนแกนอื่น (ไม่ mirror เป็น state) · ค่าที่ไม่รู้จัก = ไม่กรอง (fail-open)
   */
  const workParam = searchParams.get('work')
  const work = isServiceWorkStage(workParam) ? workParam : null
  const tr = useT()
  const workLabel = work
    ? tr.dashboard[
        ({
          AWAITING_SERVICE: 'workAwaitingService',
          APPT_CONFIRMED: 'workApptConfirmed',
          AWAITING_CLOSE: 'workAwaitingClose',
          AWAITING_BUYER: 'workAwaitingBuyer',
        } as const)[work]
      ]
    : null
  const apptDayParam = searchParams.get('apptDay')
  const apptDay = isAppointmentDayKey(apptDayParam) ? apptDayParam : null
  /**
   * คำค้น — เริ่มจาก `?q=` เพื่อให้ลิงก์ที่แชร์กันเปิดมาเจอผลเดิม และปุ่ม back ทำงาน
   *
   * 🛑 ตัว state ยังเป็นแหล่งความจริงของช่องพิมพ์ (ไม่ได้อ่าน URL ทุก render) — controlled
   * input ที่รอค่าเดินทางผ่าน router จะพิมพ์ตามนิ้วไม่ทัน เป็นบทเรียนที่เขียนกำกับไว้แล้ว
   * ที่ onChange ข้างล่าง · การเขียนกลับลง URL อยู่ใน effect ถัดไป (หน่วง + replaceState)
   */
  const [search,      setSearch]      = useState(() => searchParams.get('q') ?? '')
  /**
   * คำค้นที่ "ถูกนำไปใช้จริง" — หน่วงจาก `search` (feature 00058, ปรับ 2026-08-25 ตามที่ user ขอ)
   *
   * 🛑 แยกจาก `search` เพราะสองค่านี้ตอบคนละคำถาม: `search` = สิ่งที่นิ้วพิมพ์อยู่ (ต้องตอบ
   * ทันทีทุกตัวอักษร ไม่งั้นพิมพ์ตามไม่ทัน) · `appliedSearch` = สิ่งที่รายการถูกกรองด้วย
   * (หน่วงได้ และควรหน่วง)
   *
   * ของเดิมใช้ `search` ตัวเดียวทำทั้งสองหน้าที่ ⇒ ทุกตัวอักษรที่พิมพ์ทำให้รายการคำนวณใหม่
   * และ `busy.begin()` ยิงแผงโหลดทับผลลัพธ์ ⇒ จอกะพริบตลอดเวลาที่พิมพ์
   */
  const [appliedSearch, setAppliedSearch] = useState(search)
  const [visibleCount, setVisibleCount] = useState(PAGE)
  // ดึงพัสดุจาก iShip มาสร้างออเดอร์ (ส่วนขยาย feature 00022)
  const [importOpen, setImportOpen] = useState(false)
  const [filterOpen,  setFilterOpen]  = useState(false)

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
  const pushQuery = (patch: Record<string, string | string[] | null | undefined>) => {
    const next = new URLSearchParams(searchParams.toString())
    for (const [k, v] of Object.entries(patch)) {
      next.delete(k)
      if (Array.isArray(v)) v.forEach((x) => next.append(k, x))
      else if (v != null) next.set(k, v)
    }
    const qs = next.toString()
    // ห่อด้วย run() — ทุกทางที่เปลี่ยน query ของหน้านี้ผ่านฟังก์ชันเดียวนี้ (ชิปมือถือ, ดรอปดาวน์
    // "พัสดุ" บนเดสก์ท็อป, สถานะการขายในโมดัลตัวกรอง) แผงจึงอยู่ครบทุกทางโดยไม่ต้องไปห่อทีละจุด
    busy.run(() => router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false }))
  }

  // ─── status tab click (sync URL) ───────────────────────────────────────────
  const handleStatusTab = (value: string) => {
    pushQuery({ status: value === 'all' ? null : value })
  }

  /** ล้างตัวกรองทุกแกน (รวม work/apptDay จากไทล์หน้าแรก) แต่คงคำค้นไว้ (feature 00058) — ทุกแกนอยู่ใน URL ที่เดียว จึงเขียน URL ครั้งเดียวพอ */
  const clearFiltersKeepSearch = () => {
    pushQuery({ ...Object.fromEntries(ORDERS_FILTER_PARAMS.map((k) => [k, null])), work: null, apptDay: null })
  }

  /** ใช้ตัวกรองทั้งชุดจากโมดัล/ชิป — เขียน URL ครั้งเดียว (เปลี่ยนตัวกรองแล้วกลับหน้า 1 โดยตารางรีเซ็ตเอง) */
  const applyFilters = (next: OrdersFilters) => {
    const patch: Record<string, string | string[] | null> = Object.fromEntries(ORDERS_FILTER_PARAMS.map((k) => [k, null]))
    for (const [k, v] of serializeOrdersFilters(next)) {
      if (k === 'ad') ((patch.ad ??= []) as string[]).push(v)
      else patch[k] = v
    }
    pushQuery(patch)
    setFilterOpen(false)
  }

  /**
   * ก้อนที่ทุกตัวนับและทุกตัวกรองด้านล่างยืนอยู่บน — เท่ากับ `orders` เป๊ะเมื่อไม่มี `?apptDay=`
   *
   * 🛑 ต้องเป็นชั้นนอกสุด ไม่ใช่ชั้นหนึ่งใน `filtered`: ถ้ากรองทีหลัง ชิปจะบอก "นัดแล้ว 12"
   * (ทั้งร้าน) แต่กดแล้วเหลือ 3 (เฉพาะวันนี้) — จอเดียวขึ้นสองเลขที่ขัดกันเองโดยไม่มีอะไรอธิบาย
   * ซึ่งเป็นอาการเดียวกับที่ BR-SOV-06 มีไว้กัน
   *
   * เกณฑ์คาบเกี่ยววันมาจาก lib/appointment-day.ts ตัวเดียวกับที่ getTodayAppointmentCount
   * ประกอบ where — เลขบนไทล์หน้าแรกกับจำนวนแถวที่นี่จึงตรงกันเสมอ
   */
  const dayScoped = useMemo(() => {
    if (!apptDay) return orders
    return orders.filter((o) =>
      appointmentOverlapsDay(
        {
          startISO: o.appointment?.startISO,
          endISO: o.appointment?.endISO,
          status: o.status,
        },
        apptDay,
      ),
    )
  }, [orders, apptDay])

  // ─── count per status ───────────────────────────────────────────────────────
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: dayScoped.length }
    for (const o of dayScoped) counts[o.status] = (counts[o.status] ?? 0) + 1
    return counts
  }, [dayScoped])

  /**
   * ตัวนับบนชิปสถานะพัสดุ — นับจาก `orders` ก้อนเดียวกับที่กรอง ห้ามยิง endpoint นับแยก
   * ไม่งั้นเลขบนชิปกับจำนวนแถวที่กรองได้จะเพี้ยนจากกันโดยไม่มีอะไรเตือน
   * นับก่อนกรองด้วย stage แต่หลังกรอง status/ประเภท/คำค้น ไม่ได้ — จงใจนับจากก้อนดิบ เพราะชิป
   * ต้องบอก "ทั้งร้านมีกี่ใบในกองนี้" ให้ตรงกับตัวเลขบนไทล์หน้าแรกซึ่งก็นับจากทั้งร้านเช่นกัน
   * (ยกเว้นเมื่อ `?apptDay=` เปิดอยู่ — ตอนนั้น "ทั้งร้าน" หมายถึงทั้งร้านของวันนั้น ดู dayScoped)
   */
  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const o of dayScoped) {
      if (o.shippingStage) counts[o.shippingStage] = (counts[o.shippingStage] ?? 0) + 1
    }
    return counts
  }, [dayScoped])

  /** ร้านที่ไม่ใช่ ONLINE_SALES ไม่มีพัสดุให้ไล่ → shippingStage undefined ทุกแถว → ไม่มีแกนนี้ */
  const hasStageAxis =
    hasShippingAxis && (STAGE_CHIPS.some((k) => (stageCounts[k] ?? 0) > 0) || stage !== null)

  /**
   * ตัวนับดรอปดาวน์/แถว "วิธีส่งมอบ" (feature 00062 U18) — นับจาก `dayScoped` ก้อนเดียวกับ
   * ตัวนับแกนอื่นทุกตัว ผ่าน field เดียวกับที่ `fulfillmentFiltered` ข้างล่างใช้กรองจริง
   * (symbol เดียว — กันบั๊ก "กดเลข 5 เข้าไปเจอ 4 ใบ" ตามกติกาที่หัวไฟล์ order-list.service.ts เขียนไว้)
   */
  const fulfillmentCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const o of dayScoped) {
      if (o.fulfillmentMode) counts[o.fulfillmentMode] = (counts[o.fulfillmentMode] ?? 0) + 1
    }
    return counts
  }, [dayScoped])

  /**
   * ตัวนับบนชิป/ดรอปดาวน์สถานะนัด — นับจาก `orders` ก้อนเดียวกับที่กรอง ผ่านฟังก์ชันเดียวกัน
   * (countAppointmentStages รับ stage ที่ derive แล้ว จึงไม่มีทางนับคนละเกณฑ์กับตัวกรอง — BR-SOV-06)
   */
  const apptCounts = useMemo(
    () => countAppointmentStages(dayScoped.map((o) => o.appointment?.stage ?? null)),
    [dayScoped],
  )

  /**
   * ใบที่ไม่มีนัด — นับจากเงื่อนไขเดียวกับที่ตัวกรองใช้ (`!o.appointment`) เพื่อให้เลขบนชิป
   * กับจำนวนแถวตรงกันเสมอ · `appointment` เป็น undefined เมื่อร้านไม่มีแกนนี้ ซึ่งกรณีนั้น
   * ทั้งชิปและตัวกรองจะไม่ถูก render อยู่แล้ว ตัวเลขนี้จึงไม่มีใครอ่าน
   */
  const noAppointmentCount = useMemo(
    () => dayScoped.filter((o) => !o.appointment).length,
    [dayScoped],
  )

  /**
   * ร้าน walk-in ล้วนไม่มีนัดสักใบ → ไม่มีแกนนี้เลย (AC-8.2) — ไม่ใช่แกนที่มีอยู่แต่ทุกกองเป็น 0
   * เงื่อนไข `|| appt !== null` มีไว้กันหน้าค้างเปล่า: ถ้าเข้ามาด้วยลิงก์ที่กรองอยู่แล้วจนไม่เหลือ
   * แถวไหนมีนัด แกนต้องยังอยู่ให้กดออกได้ (ตรรกะเดียวกับ hasStageAxis)
   */
  /**
   * 🛑 นับจาก `orders` ก้อนดิบ ไม่ใช่ `dayScoped` — การมี/ไม่มีแกนนี้เป็นคุณสมบัติของ **ร้าน**
   * (ร้าน walk-in ล้วนไม่มีแกนนัดเลย) ไม่ใช่ของชุดที่กรองแล้ว. ถ้าอิง dayScoped วันที่ไม่มีนัด
   * สักใบ แถวชิปจะ **เปลี่ยนตัวตน** จาก "สถานะนัด" ไปเป็น "สถานะการขาย" กลางคัน ซึ่งอ่านเป็น
   * จอคนละหน้า ทั้งที่ผู้ใช้แค่กดกรองวัน
   */
  const hasAppointmentAxis =
    orders.some((o) => o.appointment) || appt !== null || apptDay !== null

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
            count: dayScoped.length,
            active: appt === null,
            select: () => pushQuery({ appt: null }),
          },
          /* วางถัดจาก "ทั้งหมด" ไม่ใช่ท้ายสุด — "ไม่มีนัด" ไม่ใช่จุดบนเส้นทางของนัด
             (นัดแล้ว→ยืนยัน→จบ) ถ้าอยู่ท้ายจะอ่านเป็นขั้นถัดจาก "ไม่มาตามนัด"
             และในร้านจริงมันคือกองที่ใหญ่ที่สุด ควรอยู่ใกล้ "ทั้งหมด" ที่สุด

             🛑 หายไปเมื่อกรอง `?apptDay=` อยู่ — ชุดนั้นคัดด้วย "มีวันนัดคาบเกี่ยววันนี้"
             ทุกแถวจึงมีนัดเสมอ ชิปนี้จะเป็น 0 ตลอดและกดแล้วได้จอว่างทุกครั้ง
             ปุ่มที่กดได้แต่ไม่มีวันให้ผลคือปุ่มที่หลอกให้กด */
          ...(apptDay
            ? []
            : [
                {
                  key: 'NONE',
                  label: 'ไม่มีนัด',
                  count: noAppointmentCount,
                  active: appt === 'NONE',
                  select: () => pushQuery({ appt: 'NONE' }),
                },
              ]),
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
            count: dayScoped.length,
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
  /** ขั้นงานบริการ (?work=) — บริบทจากไทล์หน้าแรก ไม่อยู่ในโมดัล · field เดียวกับที่ตัวนับหน้าแรกนับ (deriveServiceWorkStage) */
  const workScoped = useMemo(
    () => (work ? dayScoped.filter((o) => o.workStage === work) : dayScoped),
    [dayScoped, work],
  )

  /**
   * ตัวเลือกขนส่งมาจากออเดอร์จริงของร้านเท่านั้น (user สั่ง 2026-08-06) — เรียงตามจำนวนที่ใช้มากไปน้อย
   * ตัวเลขนับจากก้อนทั้งหมด ไม่ใช่ faceted ตามแกนอื่น (ตัวเลขที่ตรงกับผลอยู่ที่ปุ่ม "ใช้ตัวกรอง")
   */
  const courierChoices = useMemo<FilterChoice[]>(() => {
    const count = new Map<string, number>()
    let none = 0
    for (const o of dayScoped) {
      const k = courierKeyOf(o)
      if (k) count.set(k, (count.get(k) ?? 0) + 1)
      else none += 1
    }
    const sorted = [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'th'))
    return [
      ...sorted.map(([name, n]) => ({ value: name, label: name, count: n })),
      ...(none > 0 ? [{ value: 'NONE', label: 'ไม่มีหมายเลขพัสดุ', count: none }] : []),
    ]
  }, [dayScoped])

  const adOptions = useMemo(() => buildAdOptions(dayScoped), [dayScoped])

  /** ขนส่ง/แอดใน URL ที่ร้านไม่มี = ทิ้ง (ลิงก์เก่า/พิมพ์เอง) — ไม่ทำให้หน้าว่างด้วยชิปที่เลือกในโมดัลไม่ได้ */
  const filters = useMemo<OrdersFilters>(() => {
    const courier = parsed.courier && !courierChoices.some((c) => c.value === parsed.courier) ? null : parsed.courier
    const ads = parsed.ads.filter((id) => (id === AD_NONE ? adOptions.noneCount > 0 : adOptions.ads.some((a) => a.adId === id)))
    return courier === parsed.courier && ads.length === parsed.ads.length ? parsed : { ...parsed, courier, ads }
  }, [parsed, courierChoices, adOptions])
  const dateFilter = filters.date

  /** ทุกตัวกรองยกเว้นคำค้น — predicate ตัวเดียวกับที่เทสใน orders-filter.test.ts · คำค้นเป็นชั้นสุดท้ายเสมอ */
  const preSearch = useMemo(
    () => workScoped.filter((o) => matchesOrdersFilters(o, filters, courierKeyOf)),
    [workScoped, filters],
  )

  /**
   * ผลค้นหา — `searchOrders` เป็นตัวเดียวกับที่ตารางเดสก์ท็อปเรียก (feature 00058)
   *
   * 🛑 ของเดิมตรงนี้เทียบกับ `o.buyer` ซึ่งเป็น contact ที่ **ถูกปิดบังไว้แล้ว** (`••••••5678`)
   * ⇒ พิมพ์เบอร์เต็มไม่มีวันเจอ ทั้งที่ placeholder เขียนเองว่าค้นเบอร์ได้ · ตอนนี้ค้นจาก
   * `buyerPhone` (ค่าจริง) ผ่านฟังก์ชันกลางที่ตัดสัญลักษณ์ให้ทั้งสองฝั่ง
   */
  const hits = useMemo<OrderSearchHit<OrderRow>[]>(
    () => searchOrders(preSearch, appliedSearch),
    [preSearch, appliedSearch],
  )
  const filtered = useMemo(() => hits.map((h) => h.order), [hits])
  /** เมตาต่อใบ (ตรงเต็มค่าไหม · ตรงที่สินค้าชิ้นไหน) — การ์ดใช้ตัดสินการไฮไลต์/กางรายการ */
  const hitMeta = useMemo(
    () => new Map(hits.map((h) => [h.order.publicToken, h])),
    [hits],
  )

  /**
   * จำนวนใบที่ตรงคำค้นใน "ทั้งร้าน" — นับจาก `orders` ดิบ ไม่ใช่ `dayScoped`
   *
   * เบี่ยงจากกติกาของไฟล์นี้ (ตัวนับอื่นทุกตัวคิดจาก `dayScoped`) โดยตั้งใจ: ตัวนับอื่นตอบว่า
   * "กองนี้มีกี่ใบ" แต่ตัวนี้ตอบว่า "ใบที่หาอยู่มีอยู่จริงไหม" ซึ่งถ้าจำกัดตามวันที่กรองอยู่
   * มันจะตอบ 0 ให้กับใบที่มีอยู่จริงแค่คนละวัน = คำตอบที่ทำให้ผู้ขายเลิกหา
   */
  const wholeShopMatches = useMemo(
    () => countMatchingOrders(orders, appliedSearch),
    [orders, appliedSearch],
  )

  // reset lazy-load เมื่อ filter/search/status เปลี่ยน
  useEffect(() => {
    setVisibleCount(PAGE)
  }, [filters, appliedSearch, apptDay, work])

  /**
   * เขียนคำค้นกลับลง URL — หน่วงหลังหยุดพิมพ์ แล้วใช้ `history.replaceState` ไม่ใช่ router
   *
   * ทำไมไม่ใช้ `router.replace`: ข้อมูลออเดอร์ถูกโหลดมาครบทั้งร้านตั้งแต่ RSC แล้ว การให้
   * router ทำงานทุกตัวอักษรคือการดึง flight payload ทั้งก้อน (~500–800KB ที่ร้านใหญ่)
   * กลับมาใหม่เพื่อผลลัพธ์ที่คำนวณอยู่บนเครื่องอยู่แล้ว
   *
   * ทำไมต้อง `replaceState` ไม่ใช่ `pushState`: ทุกตัวอักษรจะกลายเป็นหนึ่งขั้นของปุ่ม back
   * ⇒ ผู้ใช้ต้องกดย้อนสิบกว่าครั้งกว่าจะออกจากหน้านี้
   */
  useEffect(() => {
    const id = setTimeout(() => {
      setAppliedSearch(search)
      const next = new URLSearchParams(window.location.search)
      if (search.trim()) next.set('q', search.trim())
      else next.delete('q')
      const qs = next.toString()
      const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname
      if (url !== window.location.pathname + window.location.search) {
        window.history.replaceState(null, '', url)
      }
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(id)
  }, [search])

  /**
   * แผงโหลดโชว์ระหว่างที่คำค้นยังไม่ถูกนำไปใช้ — ผูกกับ "มีอะไรค้างอยู่จริงไหม"
   * ไม่ใช่ยิง `begin()` ทุกตัวอักษรแล้วให้พื้นเวลาขั้นต่ำ 350ms ไล่ตาม (ซึ่งกะพริบ)
   */
  const searchPending = search !== appliedSearch

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
    // feature 00039 — บังคับเลือกเหตุผล (API คืน 400 ถ้าไม่ส่ง)
    const reason = await pacesConfirmWithReason({
      title: `ยกเลิก${vocab.noun}นี้?`,
      html: `${label} จะถูกปิด · ย้อนกลับไม่ได้<div class="text-xs text-default-500 mt-2">เหตุผลที่เลือกเก็บไว้เป็นบันทึกประวัติ ไม่มีผลต่ออัตราความสำเร็จของร้าน</div>`,
      options: CANCEL_REASONS_BY_VERTICAL[vertical],
      validationMessage: `เลือกเหตุผลก่อนยกเลิก${vocab.noun}`,
      confirmButtonText: 'ยืนยันยกเลิก',
      cancelButtonText: 'ไม่ใช่ตอนนี้',
    })
    if (!reason) return
    try {
      const res = await fetch(`/api/orders/${token}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
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

  // ─── โมดัลตัวกรอง: ตัวเลือก + จำนวนผลลัพธ์ + ชิป ──────────────────────────────────
  /** badge บนปุ่ม = จำนวนแกนที่เปิดอยู่ทุกแกน (โฆษณาหลายตัวนับ 1 · ไม่นับคำค้น/แถวละ N) */
  const activeFilterCount = countActiveFilters(filters)
  const fl = tr.ordersFilter

  const statusChoices = useMemo<FilterChoice[]>(
    () => STATUS_TABS.filter((x) => x.value !== 'all').map((x) => ({ value: x.value, label: x.label, count: statusCounts[x.value] ?? 0 })),
    [STATUS_TABS, statusCounts],
  )
  const stageChoices = useMemo<FilterChoice[]>(
    () => STAGE_CHIPS.map((k) => ({ value: k, label: SHIPPING_STAGE_LABEL[k], count: stageCounts[k] ?? 0 })),
    [stageCounts],
  )
  const apptChoices = useMemo<FilterChoice[]>(
    () => [
      { value: 'NONE', label: 'ไม่มีนัด', count: noAppointmentCount },
      ...APPOINTMENT_STAGE_KEYS.map((k) => ({ value: k as string, label: APPOINTMENT_STAGE_META[k].label, count: apptCounts[k] })),
    ],
    [noAppointmentCount, apptCounts],
  )
  const fulfillmentChoices = useMemo<FilterChoice[]>(
    () => FULFILLMENT_FILTER_KEYS.map((k) => ({ value: k, label: FULFILLMENT_FILTER_LABEL[k], count: fulfillmentCounts[k] ?? 0 })),
    [fulfillmentCounts],
  )
  const typeChoices = useMemo<FilterChoice[]>(() => {
    const labels = { PHYSICAL: fl.typePhysical, DIGITAL: fl.typeDigital, SERVICE: fl.typeService } as const
    return (Object.keys(labels) as (keyof typeof labels)[]).map((k) => ({
      value: k,
      label: labels[k],
      count: dayScoped.filter((o) => o.orderType === k).length,
    }))
  }, [dayScoped, fl])

  /** จำนวนผลลัพธ์ถ้าใช้ร่างนี้ — ข้อมูลอยู่ฝั่ง client ครบแล้ว คิดสดได้ (รวมคำค้นที่ใช้อยู่) */
  const countFor = useCallback(
    (f: OrdersFilters) =>
      searchOrders(
        workScoped.filter((o) => matchesOrdersFilters(o, f, courierKeyOf)),
        appliedSearch,
      ).length,
    [workScoped, appliedSearch],
  )

  const filterChips = useMemo<FilterChip[]>(() => {
    const out: FilterChip[] = []
    const labelOf = (list: FilterChoice[], v: string) => list.find((c) => c.value === v)?.label ?? v
    const add = (key: string, axis: string, value: string, clear: Partial<OrdersFilters>, extra?: Partial<FilterChip>) =>
      out.push({ key, axis, label: `${axis}: ${value}`, onRemove: () => applyFilters({ ...filters, ...clear }), ...extra })
    if (filters.date !== 'All')
      add('date', fl.secDate, isSpecificDay(filters.date) ? formatDateTH(`${filters.date}T00:00:00+07:00`) : (ORDER_DATE_PRESETS as Record<string, string>)[filters.date], { date: 'All' })
    if (filters.status) add('status', fl.secStatus, labelOf(statusChoices, filters.status), { status: null })
    if (filters.stage) add('stage', fl.secStage, labelOf(stageChoices, filters.stage), { stage: null })
    if (filters.appt) add('appt', fl.secAppt, labelOf(apptChoices, filters.appt), { appt: null })
    if (filters.fulfillment) add('fulfillment', fl.secFulfillment, labelOf(fulfillmentChoices, filters.fulfillment), { fulfillment: null })
    if (filters.courier) add('courier', fl.secCourier, labelOf(courierChoices, filters.courier), { courier: null })
    if (filters.type) add('type', fl.secType, labelOf(typeChoices, filters.type), { type: null })
    if (filters.ads.length === 1) {
      const id = filters.ads[0]
      const ad = adOptions.ads.find((a) => a.adId === id)
      const name = id === AD_NONE ? tr.adReport.legendNotFromAd : adDisplayName(ad?.adTitle, id, tr.inbox.contextBar.adIdFallback) ?? id
      add('ad', fl.secAds, name, { ads: [] }, ad ? { adThumb: { photoFileId: ad.adPhotoFileId } } : undefined)
    } else if (filters.ads.length > 1) {
      add('ad', fl.secAds, fmt(fl.adsN, { n: filters.ads.length }), { ads: [] })
    }
    return out
    // applyFilters ผูกกับ pushQuery/searchParams ที่เปลี่ยนพร้อม filters อยู่แล้ว — ใส่เฉพาะที่เปลี่ยนจริง
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, fl, tr, statusChoices, stageChoices, apptChoices, fulfillmentChoices, courierChoices, typeChoices, adOptions])
  /** มือถือมีแถวชิปแกนหลักด้านบนอยู่แล้ว (พัสดุ/นัด/สถานะการขาย) — ไม่แสดงซ้ำ */
  const chipRowAxis = hasAppointmentAxis ? 'appt' : hasStageAxis ? 'stage' : 'status'

  return (
    <>
      {/* ─── Desktop (≥lg): DataTable แบบ Paces theme ──────────────────────── */}
      <div className="hidden lg:block">
        {/* แถบชิปพัสดุ desktop ถูกย้ายเป็น dropdown "พัสดุ" ใน toolbar ของตาราง
            (user 2026-08-06) — state/ตัวนับยังอยู่ที่นี่ symbol เดียวกับชิปมือถือ */}
        <OrdersTable
          showMoney={showMoney}
          totalCount={orders.length}
          orders={preSearch}
          dateFilter={dateFilter}
          filterBar={{
            activeCount: activeFilterCount,
            onOpen: () => setFilterOpen(true),
            chips: filterChips,
            onClearAll: clearFiltersKeepSearch,
          }}
          /* คำค้นเดียวกับมือถือ — state เดียว ผูก `?q=` เดียว ให้ผลเดียวกัน (feature 00058) */
          search={search}
          appliedSearch={appliedSearch}
          onSearchChange={setSearch}
          wholeShopMatches={wholeShopMatches}
          onClearFilters={clearFiltersKeepSearch}
          shippingEnabled={shippingEnabled}
          vocab={vocab}
          vertical={vertical}
          busy={busy}
          hasShippingAxis={hasShippingAxis}
          hasAppointmentAxis={hasAppointmentAxis}
          workFilter={
            work && workLabel
              ? {
                  label: workLabel,
                  count: workScoped.length,
                  onClear: () => pushQuery({ work: null }),
                }
              : undefined
          }
          apptDayFilter={
            apptDay
              ? {
                  label: 'นัดวันนี้',
                  // นับจาก dayScoped ก้อนเดียวกับที่ชิปมือถือใช้ — symbol เดียว ไม่ใช่นับซ้ำ
                  count: dayScoped.length,
                  onClear: () => pushQuery({ apptDay: null }),
                }
              : undefined
          }
        />
      </div>

      {/* ─── Mobile/Tablet (<lg): card layout เดิม (ห้ามแตะ logic ข้างใน) ─── */}
      <div className="lg:hidden">
      {/* phone: full-bleed (-mx-4 หักล้าง shell padding); tablet+ (md): center + max-width

          เพดาน 4xl (896px) — เหตุผลเต็มอยู่ที่ `ProductsListing.tsx` (แพตเทิร์นเดียวกันเป๊ะ
          ต้องขยับพร้อมกันเสมอ ไม่งั้นสองหน้ารายการที่หน้าตาเหมือนกันจะกว้างไม่เท่ากันบน iPad)

          marker .orders-fullbleed = CSS :has() scope · onTouch*: swipe ซ้าย/ขวาสลับแท็บสถานะ */}
      <div
        className="orders-fullbleed -mx-4 md:mx-auto md:max-w-4xl"
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
            className="inline-flex size-11 shrink-0 lg:size-10 items-center justify-center rounded-lg text-default-700"
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
              className="form-input w-full rounded-full bg-white !pl-9 !pr-9"
              /* ข้อความเดียวกับเดสก์ท็อป — จอเดียวกันต้องสัญญาเรื่องเดียวกัน (HR16).
                 ของเดิมเขียนว่าค้นเบอร์ได้ทั้งที่โค้ดเทียบกับค่าที่ปิดบังไว้ = จอโกหกมาตลอด */
              placeholder={`ค้นหาเลข${vocab.noun} / ชื่อลูกค้า / เบอร์${isService ? '' : ' / เลขพัสดุ'} / ${itemVocab.itemColLabel}`}
              value={search}
              /* setSearch อยู่นอก transition โดยตั้งใจ — controlled input ที่ถูก defer จะพิมพ์
                 ตามนิ้วไม่ทัน; แผงเปิดด้วย begin() แทน แล้วหุบเองหลังหยุดพิมพ์ */
              /* ไม่เรียก busy.begin() ที่นี่แล้ว — แผงโหลดผูกกับ `searchPending` แทน
                 (ยิงทุกตัวอักษรทำให้แผงกะพริบทับผลลัพธ์ตลอดเวลาที่พิมพ์) */
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              /* พื้นที่นิ้ว 44px แต่ก้อนไอคอนเล็ก — แยกสองอย่างออกจากกันตาม
                 feedback_tap_target_vs_visual_pill (ย่อของที่เห็นได้โดยไม่ลดที่ให้แตะ) */
              <button
                type="button"
                aria-label="ล้างคำค้นหา"
                onClick={() => setSearch('')}
                className="absolute right-0 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center text-default-400"
              >
                <Icon icon="circle-x" className="text-base" />
              </button>
            )}
          </div>

          {/* filter → full modal */}
          <button
            type="button"
            onClick={() => setFilterOpen(true)}
            aria-label={activeFilterCount > 0 ? fmt(fl.titleWithCount, { n: activeFilterCount }) : fl.title}
            className={cn(
              'relative inline-flex size-11 shrink-0 items-center justify-center rounded-lg border lg:size-10',
              activeFilterCount > 0 ? 'border-primary bg-primary/10 text-primary-ink' : 'border-default-300 text-default-700',
            )}
          >
            <Icon icon="adjustments-horizontal" className="text-lg" />
            {activeFilterCount > 0 && (
              <span className="bg-primary ring-body-bg absolute -end-1 -top-1 inline-flex min-w-4.5 items-center justify-center rounded-full px-1 text-2xs font-semibold text-white tabular-nums ring-2">
                {activeFilterCount}
              </span>
            )}
          </button>

          {/* bell → /notifications */}
          <Link
            href="/notifications"
            aria-label="การแจ้งเตือน"
            className="inline-flex size-11 shrink-0 lg:size-10 items-center justify-center rounded-lg text-default-700"
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
          {canCreate && (
            <Link
              href="/orders/new"
              aria-label={vocab.createLabel}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary text-white lg:hidden"
            >
              <Icon icon="plus" className="text-xl" />
            </Link>
          )}

          {/* สร้างออเดอร์ — เดสก์ท็อป (มีข้อความกำกับ) */}
          {canCreate && (
            <Link
              href="/orders/new"
              className="btn hidden shrink-0 bg-primary text-white hover:bg-primary-hover lg:inline-flex"
            >
              <Icon icon="plus" className="text-sm" />
              {vocab.createLabel}
            </Link>
          )}
        </div>

        {/* แถบ "นัดวันนี้" — ตัวกรองแกนวันที่ต้องมองเห็นและล้างได้ (user สั่ง 2026-08-10)

            ทำไมไม่ยัดเป็นชิปตัวหนึ่งในแถวข้างล่าง: แถวนั้นเป็นชุด radio ของ "แกนเดียว" (กดตัวหนึ่ง
            ตัวอื่นหลุด) ถ้าเอา apptDay ไปอยู่ในนั้น ผู้ใช้กด "ทั้งหมด" แล้วจะเข้าใจว่าล้างครบ
            ทั้งที่วันยังถูกกรองค้างอยู่ — สองแกนที่ AND กันต้องแสดงเป็นสองสัญญาณ ไม่ใช่แถวเดียว

            ปุ่มล้างเป็น <button> มี aria-label จริง ไม่ใช่ <span> ที่ใส่ label แล้วถูก AT ทิ้ง
            (docs/conventions/aria-name-requires-supporting-role.md) + py-2 ดัน hit-area ให้ถึงนิ้ว */}
        {/* ขั้นงานบริการ (?work=) — แถบเดียวกับ "นัดวันนี้" ด้านล่าง: บริบทที่ผู้ใช้ถูกพามาจากไทล์
            ต้องเห็นและล้างได้ ไม่งั้นกรองค้างแล้วรายการหดโดยไม่รู้สาเหตุ · ปุ่มล้างเป็น <button> จริง */}
        {/* 00086 ส่งออก (มือถือ) — แถวใต้หัว ไม่ยัดในหัว: ที่ 320px หัวเหลือที่ให้ช่องค้นหา ~80px แล้ว
            `filtered` = ชุดเดียวกับที่การ์ดด้านล่าง render (ทุกใบ ไม่ใช่แค่ที่เลื่อนโหลดมาแล้ว) */}
        {canExport && (
          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="text-default-600 mb-0 text-xs">
              แสดง <span className="tabular-nums">{filtered.length.toLocaleString('th-TH')}</span> ใบ
            </p>
            <OrdersExport
              getTokens={() => filtered.map((o) => o.publicToken)}
              filteredCount={filtered.length}
              totalCount={orders.length}
              noun={vocab.noun}
              className="inline-flex min-h-11 items-center sm:min-h-0"
            />
          </div>
        )}
        {work && workLabel && (
          <div className="bg-primary/10 mt-2 flex items-center gap-2 rounded-lg px-3 py-1.5">
            <Icon icon="clipboard-check" className="text-primary shrink-0 text-base" aria-hidden="true" />
            <p className="text-primary-ink mb-0 min-w-0 flex-1 text-xs font-semibold">
              {workLabel} {workScoped.length}
            </p>
            <button
              type="button"
              onClick={() => pushQuery({ work: null })}
              aria-label={`ล้างตัวกรอง${workLabel}`}
              className="text-primary-ink hover:bg-primary/10 inline-flex min-h-11 shrink-0 items-center rounded-md px-3 text-xs font-semibold"
            >
              ล้าง
            </button>
          </div>
        )}
        {apptDay && (
          <div className="bg-primary/10 mt-2 flex items-center gap-2 rounded-lg px-3 py-1.5">
            <Icon icon="calendar-event" className="text-primary shrink-0 text-base" aria-hidden="true" />
            {/* 🛑 คำต้องไม่โกหกว่านี่คือ "จำนวนแถวที่เห็น" — dayScoped เป็นชั้นก่อนตัวกรองอื่น
                ทั้งหมด (ชิปสถานะนัด/สถานะการขาย/ประเภท/ช่วงเวลา/คำค้น) ผู้ขายที่กดชิปต่อจะเห็น
                3 การ์ดใต้ประโยคที่บอก 12 และบนมือถือ **ไม่มีตัวนับแถวจริงอยู่ที่ไหนเลย**
                เลขนี้จึงเป็นเลขเดียวบนจอ ถ้าเขียนกำกวมมันคือเลขเดียวที่ผิด
                (คลาสเดียวกับ partial-data-must-be-labeled-or-filled.md) */}
            {/* คำต้องตรงกับ pill ฝั่งเดสก์ท็อป (OrdersTable "นัดวันนี้ N") — ตัวกรองเดียวกัน
                สองจอต้องพูดคำเดียวกัน · "แสดงอยู่ N" ไม่ใช่ "แสดง N จากตัวกรองอื่น" ซึ่งอ่าน
                ได้สองทาง (N = จำนวนที่เหลือ หรือจำนวนตัวกรอง?) · ที่ 320px บรรทัดนี้เหลือ
                ~186px หลังหักไอคอน/ปุ่มล้าง — ของเดิมยาวพอที่จะตกเป็น 2 บรรทัด */}
            <p className="text-primary-ink mb-0 min-w-0 flex-1 text-xs font-semibold">
              นัดวันนี้ {dayScoped.length} นัด
              {filtered.length !== dayScoped.length && (
                <span className="text-default-600 ms-1 font-normal">
                  · แสดงอยู่ {filtered.length}
                </span>
              )}
            </p>
            {/* text-primary-ink ไม่ใช่ text-primary — วัดแล้ว text-primary บนพื้น bg-primary/10
                ได้ 4.46:1 ตกเกณฑ์ข้อความ 4.5:1 (และ 2.92:1 ในโหมดมืด) ส่วน -ink ได้ 9.03:1
                บทเรียนเดียวกันเขียนไว้แล้วที่ AppointmentDateSheet.tsx แต่ปุ่มนี้ตกสำรวจ
                min-h-11: ปุ่มนี้อยู่ใน lg:hidden = มือถือล้วน `px-2 py-2 text-xs` ได้ ~35px
                ต่ำกว่าเกณฑ์ 44px ที่ PRODUCT.md ประกาศไว้สำหรับกลุ่มผู้สูงวัย (WCAG 2.5.5) */}
            <button
              type="button"
              onClick={() => pushQuery({ apptDay: null })}
              aria-label="ล้างตัวกรองนัดวันนี้"
              className="text-primary-ink hover:bg-primary/10 inline-flex min-h-11 shrink-0 items-center rounded-md px-3 text-xs font-semibold"
            >
              ล้าง
            </button>
          </div>
        )}

        {/* พิมพ์ 1 ตัวอักษร = ยังไม่กรอง — ต้องบอก ไม่งั้นอ่านเหมือนช่องค้นหาพัง (feature 00058)
            ไม่ใช่ error: ใช้สีเทาปกติ ไม่ใช่ danger */}
        {search.trim().length > 0 && search.trim().length < ORDER_SEARCH_MIN_CHARS && (
          <p className="mt-1.5 px-1 text-2xs text-default-500">
            พิมพ์อีก {ORDER_SEARCH_MIN_CHARS - search.trim().length} ตัวเพื่อค้นหา
          </p>
        )}

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

        {/* ตัวกรองที่ใช้อยู่ (นอกเหนือแกนที่อยู่บนแถวชิปด้านบนแล้ว) — เลื่อนแนวนอนบรรทัดเดียว */}
        <OrdersFilterChips
          scroll
          chips={filterChips.filter((c) => c.key !== chipRowAxis)}
          onClearAll={clearFiltersKeepSearch}
        />
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
                /* apptDay มาก่อน dateFilter: ผู้ใช้เพิ่งกดไทล์ "นัดวันนี้" มา ถ้าขึ้นข้อความ
                   กลาง ๆ ("ไม่มีคำสั่งซื้อในสถานะนี้") เขาจะอ่านว่าระบบพัง ไม่ใช่ว่าวันนี้ว่าง
                   และถ้ามีชิปสถานะนัดกรองซ้อนอยู่ด้วย ต้องบอกทั้งสองเงื่อนไข ไม่งั้นผู้ใช้จะกด
                   "ล้างนัดวันนี้" แล้วยังว่างอยู่ โดยไม่รู้ว่าตัวที่กรองจริงคืออีกตัว */
                /* คำค้นมาก่อนทุกเงื่อนไข — ผู้ใช้ที่เพิ่งพิมพ์ลงไปรู้อยู่แล้วว่าตัวเองทำอะไร
                   ถ้าขึ้น "วันนี้ยังไม่มีนัดเข้ามา" ทับ เขาจะอ่านว่าข้อมูลหาย ไม่ใช่ว่าหาไม่เจอ */
                appliedSearch.trim()
                  ? /* ตอนกรองนัดวันนี้อยู่ การค้นหาถูกจำกัดอยู่แค่ชุดนั้น — ถ้าบอกกว้างว่า
                       "ไม่พบการเข้ารับบริการที่ตรงกับ สมชาย" ผู้ขายจะสรุปว่าออเดอร์หายจากระบบ
                       ทั้งที่มันอยู่แค่คนละวัน (empty state ต้องยืนได้ด้วยตัวเอง) */
                    apptDay
                    ? `ไม่พบ "${appliedSearch.trim()}" ในนัดวันนี้`
                    : `ไม่พบ${vocab.noun}ที่ตรงกับ "${appliedSearch.trim()}"`
                  : apptDay
                  ? appt
                    ? 'วันนี้ไม่มีนัดในสถานะที่เลือก'
                    : 'วันนี้ยังไม่มีนัดเข้ามา'
                  : isSpecificDay(dateFilter)
                  ? `ไม่มี${vocab.noun}วันที่ ${formatDateTH(`${dateFilter}T00:00:00+07:00`)}`
                  : `ไม่มี${vocab.noun}ในสถานะนี้`
              }
              /**
               * บอกว่าใบที่หาอยู่ "มีอยู่จริงแต่คนละกอง" — ไม่งั้นจอว่างจะอ่านว่าออเดอร์หายจากระบบ
               * แสดงเฉพาะตอนที่มันเพิ่มข้อมูลจริง: มีคำค้น + ในร้านมีใบที่ตรง (feature 00058)
               */
              description={
                isSearchActive(appliedSearch) && wholeShopMatches > 0
                  ? `ไม่พบในตัวกรองที่เลือกไว้ · พบ ${wholeShopMatches.toLocaleString('th-TH')} รายการในทั้งร้าน`
                  : undefined
              }
              action={
                /* ปุ่มลิงก์ใช้ได้เฉพาะตอนไม่มีคำค้น — ตอนมีคำค้นต้องล้าง state ในหน้าด้วย
                   (ดู actionButton ข้างล่าง) ไม่งั้นกดแล้วเจอจอว่างใบเดิมซ้ำ */
                appliedSearch.trim()
                  ? undefined
                  : apptDay
                  ? { label: `ดู${vocab.noun}ทั้งหมด`, href: '/orders' }
                  : canCreate
                    ? { label: `+ ${vocab.createLabel}แรก`, href: '/orders/new' }
                    : undefined
              }
              actionButton={
                isSearchActive(appliedSearch) && wholeShopMatches > 0
                  ? {
                      label: `ดูผลทั้งร้าน (${wholeShopMatches.toLocaleString('th-TH')})`,
                      onClick: clearFiltersKeepSearch,
                    }
                  : undefined
              }
            />
          </div>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {visible.map((order) => (
            <OrderCard
              key={order.publicToken}
              showMoney={showMoney}
              order={order}
              onCancelRequest={handleCancelRequest}
              vocab={vocab}
              searchQuery={isSearchActive(appliedSearch) ? appliedSearch : undefined}
              isExactSearchMatch={hitMeta.get(order.publicToken)?.isExactMatch ?? false}
              matchedItemIndexes={hitMeta.get(order.publicToken)?.matchedItemIndexes}
              serviceVocab={isService ? { noun: vocab.noun, buyerNoun: vocab.buyerNoun } : undefined}
            />
          ))}

          {/* sentinel — IntersectionObserver โหลดเพิ่มเมื่อเลื่อนถึง */}
          {hasMore && (
            <div ref={sentinelRef} className="flex items-center justify-center gap-2 py-4 text-xs text-default-500">
              <span className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              กำลังโหลด...
            </div>
          )}
          {!hasMore && filtered.length > PAGE && (
            <p className="py-3 text-center text-xs text-default-400">ครบทุก{orderNoun}แล้ว ({filtered.length})</p>
          )}
        </div>
      )}
      {/* bg-body-bg ทับ bg-card ที่เป็นค่าตั้งต้น (twMerge — ตัวหลังชนะ): ฝั่งมือถือรายการเป็น
          การ์ดแยกใบวางบนพื้นเพจ ไม่ได้อยู่ในการ์ดใบใหญ่แบบตารางเดสก์ท็อป ถ้าใช้พื้นขาวของการ์ด
          จะกลายเป็นแผ่นขาวแปะทับพื้นเพจ เห็นเป็นกล่องประหลาดแทนที่จะเป็น "ที่ว่างที่รอของ" */}
      <ListBusyOverlay busy={busy.busy || searchPending} className="bg-body-bg" />
      </div>{/* /relative — พื้นที่ผลลัพธ์ + แผงโหลด */}
      </div>{/* /full-bleed wrapper */}
      </div>{/* /lg:hidden mobile wrapper */}

      {/* ─── โมดัลตัวกรอง — ตัวเดียวทุกจอ · mount เฉพาะตอนเปิด (ร่างเริ่มจากค่าที่ใช้อยู่) ─── */}
      {filterOpen && (
        <OrdersFilterModal
          applied={filters}
          onApply={applyFilters}
          onClose={() => setFilterOpen(false)}
          orderNoun={orderNoun}
          countFor={countFor}
          status={statusChoices}
          stage={hasStageAxis ? stageChoices : undefined}
          appt={hasAppointmentAxis ? apptChoices : undefined}
          // เกทด้วย hasShippingAxis ตรง ๆ ไม่ตามข้อมูล (UX-Design-Spec A5) — ร้านที่ยังไม่มีนัดรับเลยก็ต้องเห็น
          fulfillment={hasShippingAxis ? fulfillmentChoices : undefined}
          // ซ่อนคู่กับคอลัมน์ shipTo เสมอ — ห้ามเป็นปุ่มที่กดแล้วไม่เกิดอะไร
          courier={hasShippingAxis && courierChoices.length > 0 ? courierChoices : undefined}
          type={typeChoices}
          ads={adOptions}
        />
      )}

      <IShipImportModal open={importOpen} onClose={() => setImportOpen(false)} />

    </>
  )
}
