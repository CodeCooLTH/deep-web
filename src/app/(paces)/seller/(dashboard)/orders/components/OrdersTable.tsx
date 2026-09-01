/**
 * OrdersTable — desktop table view (≥lg) สำหรับ seller /orders
 *
 * ใช้ DataTable + TanStack react-table ตามแบบ Paces theme
 * mobile/tablet (<lg) ใช้ OrdersList card layout เดิม (ไฟล์นี้ไม่แตะ)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/orders/components/OrdersList.tsx
 */

'use client'

import DataTable from '@/components/table/DataTable'
import { isSearchActive, searchOrders } from '@/lib/order-search'
import HighlightText from './HighlightText'
import SellerEmptyState from '../../_shared/SellerEmptyState'
import TablePagination from '@/components/table/TablePagination'
import Icon from '@/components/wrappers/Icon'
import { CustomerBehaviorIcons } from '@/components/safepay/CustomerBehaviorBadges'
import type { OrderVocab } from '@/lib/seller-menu'
import {
  formatDateTH,
  formatDateTime,
  formatDayMonthTimeRangeTH,
  formatDayMonthTimeTH,
} from '@/lib/format-date'
import { cn } from '@/utils/helpers'
import {
  ColumnFiltersState,
  createColumnHelper,
  FilterFn,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  Row as TableRow,
  Table as TableType,
  useReactTable,
  SortingState,
  RowSelectionState,
} from '@tanstack/react-table'
import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { resolveBuyerBaseUrl } from '@/lib/buyer-url'
import {
  PAYMENT_LABELS,
  PAYMENT_ICONS,
  FULFILLMENT_FILTER_KEYS,
  FULFILLMENT_FILTER_LABEL,
  FULFILLMENT_BADGE_CLS,
  type OrderItemRow,
  type OrderRow,
} from './data'
import { formatOrderNo } from '@/lib/order-no'
import CopyLinkButton from '@/app/(paces)/seller/(dashboard)/orders/[token]/components/CopyLinkButton'
import MiniShipmentTimeline from './MiniShipmentTimeline'
import ShipmentHoverCard from './ShipmentHoverCard'
import OrderSourceLogo from './OrderSourceLogo'
import { courierInitials, courierLogoUrl } from '@/lib/iship/courier'
import { SHIPPING_STAGE_LABEL } from '@/lib/order-stage'
import { APPOINTMENT_STAGE_KEYS, APPOINTMENT_STAGE_META } from '@/lib/appointment-stage'
import OrderActions from './OrderActions'
import BulkActionBar from './BulkActionBar'
import FilterDropdown from '@/components/safepay/FilterDropdown'
import OrderDateFilterDropdown from './OrderDateFilterDropdown'
import { isSpecificDay, matchesOrderDateFilter } from '@/lib/order-date-filter'
import { useRouter } from 'next/navigation'
import { pacesConfirm, pacesConfirmWithReason } from '@/lib/paces-swal'
import { CANCEL_REASONS_BY_VERTICAL } from '@/lib/cancel-reasons'
import type { ShopVertical } from '@/lib/lodging'
import { pacesToast } from '@/lib/paces-toast'
import { ORDER_STATUS_META, isCODPayment } from '@/lib/order-display'
import ListBusyOverlay, { type ListBusy } from '../../_shared/ListBusyOverlay'
// ป้ายพฤติกรรมลูกค้า — นิยามเดียวกับหัวแผงลูกค้าในกล่องแชท (HR16)
import { customerBadges } from '@/lib/customer-behavior'
import { useT } from '@/i18n/LocaleProvider'

// ─── status badge config ──────────────────────────────────────────────────────
// อ่านจาก SSOT ตัวเดียวกับหน้ารายละเอียดออเดอร์และการ์ดมือถือ (src/lib/order-display.ts) —
// เดิมไฟล์นี้ประกาศ map ของตัวเองแล้วเพี้ยนจากที่อื่นทั้งคำและสี: SHIPPED เป็น "จัดส่งแล้ว" +
// primary(น้ำเงิน) ขณะที่ OrderCard เป็น "กำลังจัดส่ง" + info และ SSOT เป็น info เหมือน OrderCard
// ผลคือจอเดียวกัน (ตารางเดสก์ท็อป vs การ์ดมือถือ) พูดคนละคำคนละสีสำหรับสถานะเดียวกัน
// เลิกประกาศซ้ำแล้วนำเข้าแทน — ได้ text-{semantic}-ink ที่ผ่านคอนทราสต์ AA มาด้วย (DESIGN.md §Status chip)
//
// 2026-08-06: ป้ายบนแถวเลิกอ่าน ORDER_STATUS_META ตรง ๆ แล้ว ใช้ resolveOrderStatusBadge()
// ที่รวมสถานะพัสดุเข้ามาด้วย (ดูเหตุผลในคอมเมนต์ของฟังก์ชันนั้น) — ตัวนี้ยังเหลือไว้ให้
// ดรอปดาวน์ "สถานะ" ข้างล่างซึ่งกรองด้วย Order.status ดิบ จึงต้องใช้คำของ status ไม่ใช่ของพัสดุ

// ตัวเลือกในดรอปดาวน์ "สถานะ" — สร้างจาก SSOT ตัวเดียวกับ badge ห้ามพิมพ์คำซ้ำมือ
// (เดิมพิมพ์เอง จึงค้างคำว่า "จัดส่งแล้ว" อยู่ในตัวกรองทั้งที่ป้ายบนแถวเปลี่ยนคำไปแล้ว)
const STATUS_FILTER_OPTIONS = [
  { value: 'All', label: 'ทั้งหมด' },
  ...Object.entries(ORDER_STATUS_META).map(([value, meta]) => ({ value, label: meta.label })),
]

// ─── ตัวกรองพัสดุ (?stage=) — ลำดับ/ค่าเดียวกับ STAGE_CHIPS ใน OrdersList ────────
const STAGE_FILTER_KEYS = [
  'AWAITING_PARCEL',
  'AWAITING_PICKUP',
  'SHIPPING',
  'AWAITING_COD',
  'PROBLEM',
  'RETURNED',
] as const satisfies readonly (keyof typeof SHIPPING_STAGE_LABEL)[]

/** สี badge จำนวนต่อกองงาน — token ตามความหมายของกอง (mockup 2026-08-06) */
const STAGE_BADGE_CLS: Record<(typeof STAGE_FILTER_KEYS)[number], string> = {
  AWAITING_PARCEL: 'bg-warning/15 text-warning-ink',
  AWAITING_PICKUP: 'bg-default-100 text-default-700',
  SHIPPING: 'bg-default-100 text-default-700',
  // warning ไม่ใช่ info — ตรงกับป้าย "รอเงิน COD" บนแถว (STAGE_BADGE_OVERRIDE) และไทล์
  // Command Center ที่เป็น warning มาตั้งแต่แรก; เดิมไฟล์นี้ตั้ง info ไว้ที่เดียวจึงเพี้ยนกับที่อื่น
  AWAITING_COD: 'bg-warning/15 text-warning-ink',
  PROBLEM: 'bg-danger/15 text-danger-ink',
  // ตีกลับ = warning (ไม่ใช่ danger) — โทนเดียวกับไทล์หน้าแรกและป้ายบนแถว
  RETURNED: 'bg-warning/15 text-warning-ink',
}

// ─── ตัวกรองวิธีส่งมอบ (?fulfillment=) — feature 00062 U18 ─────────────────────
// คนละแกนกับ STAGE_FILTER_KEYS ข้างบน (UX-Design-Spec A5) — แสดงเฉพาะร้าน ONLINE_SALES
// SSOT (คำ+สี) อยู่ที่ data.ts แล้ว (ใช้ร่วมกับโมดัลตัวกรองมือถือใน OrdersList.tsx — HR16)

// ─── date range filter — ตรรกะอยู่ที่ src/lib/order-date-filter.ts (SSOT ร่วมกับโมดัลมือถือ) ───
// เดิมเขียนไว้ที่ไฟล์นี้ที่เดียว แปลว่ามือถือไม่มีตัวกรองช่วงเวลาเลย · และตัดวันด้วย
// new Date() ของเครื่องแทน thaiDayKey (บังเอิญตรงเพราะเครื่องในไทยตั้ง tz ไทย)
const dateRangeFilterFn: FilterFn<OrderRow> = (row, _columnId, selectedRange) =>
  matchesOrderDateFilter(row.original.createdAtISO, (selectedRange as string) ?? 'All')

/** ชื่อขนส่งที่ใช้เป็นคีย์ตัวกรอง — null = ใบที่ยังไม่ได้เปิดพัสดุ */
function courierKeyOf(o: OrderRow): string | null {
  const s = o.shipment
  if (!s) return null
  return s.courierName ?? s.courierCode ?? null
}

const columnHelper = createColumnHelper<OrderRow>()

type Props = {
  orders: OrderRow[]
  /** ร้านเชื่อมต่อ iShip + เป็นร้านขายออนไลน์ (feature 00022; vertical=ONLINE_SALES ตั้งแต่ 00028) */
  ishipEnabled?: boolean
  /** คลังคำผันตามประเภทกิจการ (feature 00030) — ส่งต่อมาจาก OrdersList ที่รับมาจาก RSC */
  vocab: OrderVocab
  /** ประเภทกิจการของร้าน (feature 00039) — ใช้เลือกชุดเหตุผลตอนยกเลิก */
  vertical: ShopVertical
  /**
   * ตัวกรองกองงานพัสดุ (?stage= — user 2026-08-06 ย้ายจากแถบชิปมาเป็น dropdown ใน toolbar)
   * state/ตัวนับอยู่ที่ OrdersList (symbol เดียวกับชิปมือถือ — sibling-surface-parity)
   * undefined = ร้านไม่มีแกนพัสดุ (ไม่ใช่ ONLINE_SALES) ไม่แสดง dropdown
   */
  stageFilter?: {
    value: string | null
    counts: Record<string, number>
    onChange: (value: string | null) => void
  }
  /**
   * ตัวกรองวิธีส่งมอบ (`?fulfillment=` — feature 00062 U18) — โครงเดียวกับ stageFilter
   * แต่เกทด้วย `hasShippingAxis` ตรง ๆ ไม่ใช่ `hasStageAxis`: UX-Design-Spec A5 สั่งไม่ให้
   * ซ่อนตามข้อมูล — ร้าน ONLINE_SALES ที่ยังไม่มีออเดอร์นัดรับสักใบก็ต้องเห็น dropdown นี้อยู่
   */
  fulfillmentFilter?: {
    value: string | null
    counts: Record<string, number>
    onChange: (value: string | null) => void
  }
  /**
   * ตัวคุมแผงโหลด — เป็นของ OrdersList เพราะ `?stage=` (ที่ toolbar นี้กด) เป็น server
   * navigation ที่เกิดขึ้นที่นั่น ตารางจึงต้องใช้ตัวเดียวกัน ไม่ใช่สร้างของตัวเอง
   */
  busy: ListBusy
  /**
   * ร้านนี้มีโดเมนพัสดุไหม (feature 00036 FR-SOV-001) — false = ไม่ประกอบคอลัมน์ "ที่อยู่จัดส่ง"
   * และไม่แสดงดรอปดาวน์ "ขนส่ง" ที่เกาะคอลัมน์นั้นอยู่
   *
   * [สำคัญ] ต้องซ่อนดรอปดาวน์คู่กับคอลัมน์เสมอ ห้ามซ่อนอย่างเดียว — ตัวกรองนั้นเรียก
   * `filterColumn('shipTo')?.setFilterValue()` ซึ่งเป็น optional chain พอคอลัมน์หายไป
   * มันจะกลายเป็นปุ่มที่กดได้แต่ไม่เกิดอะไรเลย ไม่มี error ให้เห็น
   * (บทเรียนเดียวกับตัวกรองช่วงเวลาที่ตายเงียบมาแล้ว — ดูคอมเมนต์ที่คอลัมน์ createdAtISO)
   */
  hasShippingAxis?: boolean
  /**
   * ตัวกรองสถานะนัดหมาย (?appt= — feature 00036 FR-SOV-008) — แกนที่สองของร้านคิวงาน
   * โครงเดียวกับ stageFilter ทุกประการ state/ตัวนับอยู่ที่ OrdersList (symbol เดียวกับชิปมือถือ)
   * undefined = ร้านไม่มีนัดสักใบ ไม่แสดง dropdown
   */
  appointmentFilter?: {
    value: string | null
    counts: Record<string, number>
    onChange: (value: string | null) => void
  }
  /**
   * `?apptDay=today` เปิดอยู่ไหม (feature 00024 ส่วนขยาย 2026-08-10) — undefined = ไม่ได้กรอง
   *
   * เป็น pill ล้างได้ ไม่ใช่ FilterDropdown อีกตัว เพราะแกนนี้มีค่าเดียวและมีทางเข้าเดียว
   * (ไทล์บนหน้าแรก) ดรอปดาวน์ที่มีตัวเลือกเดียวคือปุ่มที่ปลอมตัวเป็นตัวเลือก
   */
  apptDayFilter?: {
    label: string
    count: number
    onClear: () => void
  }
  /**
   * คำค้น — **state อยู่ที่ OrdersList ตัวเดียว ไม่ใช่ของตาราง** (feature 00058)
   *
   * 🛑 เดิมตารางถือ `globalFilter` ของตัวเองแยกจากช่องค้นหาของมือถือ ⇒ สองจอในหน้าเดียวกัน
   * ค้นคนละฟิลด์และให้ผลไม่เท่ากันจากคำเดียวกัน (มือถือค้น publicToken ได้/ตารางไม่ได้ ·
   * ตารางค้นวิธีชำระกับยอดเงินได้/มือถือไม่ได้) — ยกขึ้นไปที่เดียวเพื่อให้ผูกกับ `?q=` เดียวกันด้วย
   */
  search: string
  /**
   * คำค้นที่ถูกหน่วงแล้ว — ใช้ "กรอง/ไฮไลต์" เท่านั้น ส่วน `search` ใช้เป็นค่าในช่องพิมพ์
   * 🛑 สลับสองตัวนี้เมื่อไร ช่องพิมพ์จะพิมพ์ตามนิ้วไม่ทันทันที (ค่าใน input จะรอ debounce)
   */
  appliedSearch: string
  onSearchChange: (value: string) => void
  /** จำนวนใบที่ตรงคำค้นในทั้งร้าน — ใช้เขียน empty state ที่บอกทางออก */
  wholeShopMatches: number
  /** ล้างตัวกรองทุกแกนแต่คงคำค้น — ฝั่งนี้ต้องล้าง columnFilters ของ TanStack เพิ่มเอง */
  onClearFilters: () => void
}

export default function OrdersTable({
  orders,
  ishipEnabled = false,
  vocab,
  vertical,
  stageFilter,
  fulfillmentFilter,
  busy,
  hasShippingAxis = true,
  appointmentFilter,
  apptDayFilter,
  search,
  appliedSearch,
  onSearchChange,
  wholeShopMatches,
  onClearFilters,
}: Props) {
  const t = useT()
  const router = useRouter()
  const [sorting,        setSorting]        = useState<SortingState>([])
  const [columnFilters,  setColumnFilters]  = useState<ColumnFiltersState>([])
  const [pagination,     setPagination]     = useState({ pageIndex: 0, pageSize: 10 })
  const [rowSelection,   setRowSelection]   = useState<RowSelectionState>({})

  // ตัวเลือกขนส่งมาจากออเดอร์จริงของร้านเท่านั้น (user สั่ง 2026-08-06) — ไม่ใช่รายชื่อ
  // ขนส่งทั้งหมดของ iShip ซึ่งมี 17 รายการ ส่วนใหญ่ร้านไม่เคยใช้ · เรียงตามจำนวนที่ใช้
  // มากไปน้อย ของที่ใช้บ่อยจะอยู่บนสุดโดยไม่ต้องเลื่อนหา
  const courierOptions = useMemo(() => {
    const count = new Map<string, number>()
    let none = 0
    for (const o of orders) {
      const k = courierKeyOf(o)
      if (k) count.set(k, (count.get(k) ?? 0) + 1)
      else none += 1
    }
    const sorted = [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'th'))
    return [
      { value: 'All', label: 'ทั้งหมด' },
      ...sorted.map(([name, n]) => ({
        value: name,
        label: name,
        badge: { label: n, className: 'bg-default-100 text-default-700' },
      })),
      ...(none > 0
        ? [
            {
              value: 'NONE',
              label: 'ไม่มีหมายเลขพัสดุ',
              badge: { label: none, className: 'bg-warning/15 text-warning-ink' },
            },
          ]
        : []),
    ]
  }, [orders])

  // buyer base URL — resolve client-side ครั้งเดียว (กัน hydration mismatch) สำหรับ copy ลิงก์กลุ่ม
  const [buyerBaseUrl, setBuyerBaseUrl] = useState('')
  useEffect(() => {
    setBuyerBaseUrl(resolveBuyerBaseUrl())
  }, [])

  // cancel — OrderActions (centralized) ส่ง token มาขอ; confirm ผ่าน Sweet Alerts (Hard Rule safepay-ux #8)
  const handleCancelRequest = async (token: string) => {
    const o = orders.find((x) => x.publicToken === token)
    const label = o
      ? `${vocab.noun} ${formatOrderNo(o.publicToken, o.createdAtISO)}`
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

  /**
   * ─── คอลัมน์ (โครง 2 แถว — user ให้สเปกเองและอนุมัติ mockup 2026-08-06) ────────
   *
   * แถวหัวกลุ่ม: [รูปเพจ+badge] เลขออเดอร์ [คัดลอก] … วันที่สร้างชิดขวา
   * แถวเนื้อหา: สินค้า · ลูกค้า · ที่อยู่จัดส่ง+จัดส่งโดย · วิธีชำระ · ยอด · เช็กลิสต์ · ปุ่ม
   *
   * ที่มาของโครงนี้: ตาราง 12 คอลัมน์เดิมต้องการ 1691px แต่จอจริงให้ ~1250px จึงบีบจน
   * ตัดกลางคำ · ใส่ nowrap เฉย ๆ ก็กลายเป็น scroll แนวนอนซึ่ง user ปฏิเสธ (ชี้ไปที่ iShip
   * ว่าใช้ยาก) · ซ่อนคอลัมน์เป็นชั้นก็ต้องซ่อน "ที่มา" ซึ่ง user ไม่ยอม
   * → ย้ายข้อมูลระดับใบขึ้นแถบหัว แล้วทำคอลัมน์ที่เหลือให้ "อ้วน" พอใช้แนวตั้งได้
   */
  /**
   * ผลค้นหา — `searchOrders` ตัวเดียวกับที่การ์ดมือถือเรียก (feature 00058)
   *
   * ป้อนเข้า `data` ของตารางแทนที่จะเป็น `globalFilterFn` ของ TanStack เพราะตัวนั้นไล่เฉพาะ
   * คอลัมน์ที่มี accessor และแปลงค่าเป็นสตริงตรง ๆ ⇒ คอลัมน์ `items` (array ของ object)
   * กลายเป็น `[object Object]` = ค้นชื่อสินค้าไม่ได้ แต่พิมพ์คำว่า `object` แล้วตรงทุกใบ
   *
   * ตัวกรองคอลัมน์ของ TanStack ยังทำงานทับผลนี้อีกชั้น — AND ทั้งคู่ ลำดับจึงไม่มีผล
   *
   * 🛑 ต้องประกาศ **เหนือ** `columns` เพราะ cell renderer อ่าน `searchQuery` ไปทำไฮไลต์
   */
  const hits = useMemo(() => searchOrders(orders, appliedSearch), [orders, appliedSearch])
  const tableData = useMemo(() => hits.map((h) => h.order), [hits])
  const hitMeta = useMemo(() => new Map(hits.map((h) => [h.order.publicToken, h])), [hits])
  const searchQuery = isSearchActive(appliedSearch) ? appliedSearch : undefined
  /** คำค้นยังไม่ถูกนำไปใช้ = แผงโหลดยังต้องค้าง (ผูกกับสถานะจริง ไม่ใช่ยิงทุกตัวอักษร) */
  const searchPending = search !== appliedSearch

  const columns = [
    // ─ checkbox select ─
    // เซลล์ในแถวเนื้อหาว่างโดยเจตนา: ตัวติ๊กจริงอยู่แถบหัวกลุ่ม (groupRow ข้างล่าง)
    {
      id: 'select',
      header: ({ table }: { table: TableType<OrderRow> }) => (
        <input
          type="checkbox"
          className="form-checkbox form-checkbox-light size-4.5"
          checked={table.getIsAllRowsSelected()}
          onChange={table.getToggleAllRowsSelectedHandler()}
        />
      ),
      cell: () => null,
      enableSorting: false,
      enableColumnFilter: false,
      meta: { headerClassName: 'w-px', cellClassName: 'w-px' },
    },

    // ─ รายการสินค้า — โชว์ 2 รายการแรก เกินกว่านั้นกางด้วย <details> ─
    //   user สั่ง 2026-08-06: เลิกใช้ hover panel ให้กด "ดูเพิ่มเติม" แล้วกางในแถวเดิม
    //   ใช้ <details> ของ HTML ตรง ๆ = ไม่ต้องมี state ฝั่ง client เลย (ไม่ต้องจำว่าแถวไหน
    //   กางอยู่ตอน re-render) และ Ctrl+F ยังหาข้อความที่ยังไม่กางเจอ ต่างจาก panel ที่
    //   เนื้อหาไม่มีตัวตนจนกว่าจะเอาเมาส์ไปวาง
    columnHelper.accessor('items', {
      header: 'รายการสินค้า',
      enableSorting: false,
      meta: { cellClassName: 'min-w-56 align-top' },
      cell: ({ row }) => {
        const items = row.original.items
        if (!items || items.length === 0) {
          return <span className="text-default-400 text-sm">—</span>
        }
        const line = (it: OrderItemRow) => (
          <div key={it.id} className="flex gap-3">
            {/* ring บนรูปจริง: สินค้าที่ถ่ายพื้นขาวจะไม่มีขอบเลยบนการ์ดขาว รูปกับพื้นกลืนกัน
                (docs/conventions/user-supplied-image-assets.md) · /40 = 1.72:1 เส้นบางที่เห็นแต่ไม่แย่งสายตา
                — ramp ไม่มีขั้นระหว่าง 300 (1.22 จางเกิน) กับ 400 (4.95 แรงเกินสำหรับขอบรูป)
                จึงใช้ opacity modifier บน token ตาม pattern เดิมของโปรเจกต์ (bg-primary/15) */}
            {it.imageUrl ? (
              <Image
                src={it.imageUrl}
                alt={it.name}
                width={56}
                height={56}
                className="ring-default-400/40 size-14 shrink-0 rounded-lg object-cover ring-1"
              />
            ) : (
              /* เดิม bg-default-100 (#f6f7fb) = สีเดียวกับพื้นเพจเป๊ะ และแถวนี้อยู่บนการ์ดขาว
                 → กล่องได้ 1.07:1 มองไม่เห็นว่ามีกล่อง เห็นแต่ไอคอนลอย (user รายงาน 2026-08-06) */
              <span className="bg-default-200 text-default-400 ring-default-400/40 flex size-14 shrink-0 items-center justify-center rounded-lg ring-1">
                <Icon icon="package" className="text-xl" />
              </span>
            )}
            <div className="min-w-0">
              {/* ห้าม line-clamp/truncate ที่ชื่อสินค้า (user สั่ง 2026-08-08: "ห้าม ... เด็ดขาด
                      ต้องแสดงเต็มเสมอ ถ้ายาวก็ขึ้นบรรทัดใหม่") — ชื่อที่ถูกตัดทำให้แยกสินค้า
                      ที่ชื่อคล้ายกันไม่ออก ("โช๊คหน้า" vs "โช๊คหลัง" ตัดที่ตัวเดียวกัน) ซึ่งเป็น
                      จอที่ผู้ขายใช้ยืนยันก่อนแพ็กของ · break-words กันชื่อยาวที่ไม่มีวรรคเลย
                      ล้นกรอบ — OrderItem.name ที่พิมพ์เองตอนสร้างออเดอร์ไม่มีเพดานความยาว */}
              <p className="mb-0 break-words text-sm font-semibold text-default-900">
                <HighlightText text={it.name} query={searchQuery} />
              </p>
              {/* ไม่มี SKU ใน OrderItem — บอกราคาต่อชิ้นแทน ซึ่งเป็นข้อมูลที่มีจริง */}
              <p className="mb-0 text-xs text-default-500">
                ฿{it.price.toLocaleString('th-TH')} ต่อชิ้น
              </p>
              <p className="mb-0 text-xs text-default-500">x{it.qty}</p>
            </div>
          </div>
        )
        const shown = items.slice(0, 2)
        const rest = items.slice(2)
        /**
         * ตรงกับสินค้าที่ถูกยุบซ่อนไว้ → กางให้ตั้งแต่แรก (feature 00058)
         *
         * ใช้ `defaultOpen` ผ่าน key ไม่ใช่ prop `open` ที่ควบคุมทุก render — `open` ที่ React
         * เขียนทับทุกรอบจะแย่งการกดปิดของผู้ใช้ (กดย่อแล้วเด้งกางกลับทันที) ส่วนการเปลี่ยน key
         * คือการ mount ใหม่ ⇒ เบราว์เซอร์คุม toggle ต่อเองได้อิสระหลังจากนั้น
         */
        const hiddenMatch = (hitMeta.get(row.original.publicToken)?.matchedItemIndexes ?? []).some(
          (i) => i >= 2,
        )
        return (
          <>
            <div className="space-y-2.5">{shown.map(line)}</div>
            {rest.length > 0 && (
              <details
                key={hiddenMatch ? 'open' : 'closed'}
                open={hiddenMatch || undefined}
                className="group mt-2"
              >
                {/* marker:content-[''] = ซ่อนสามเหลี่ยมของเบราว์เซอร์ (Tailwind ไม่มี token ให้)
                    group-open: สลับข้อความตอนกาง — คำว่า "ดูเพิ่มเติม" ต้องหายไป (user สั่ง)
                    แต่ยังต้องย่อกลับได้ ถ้าซ่อน summary ทั้งอันจะกางแล้วปิดไม่ได้เลย */}
                <summary className="text-primary hover:text-primary/80 cursor-pointer text-xs font-medium marker:content-['']">
                  <span className="inline-flex items-center gap-1 group-open:hidden">
                    <Icon icon="chevron-down" className="text-sm" aria-hidden="true" />
                    ดูเพิ่มเติม (+{rest.length} รายการ)
                  </span>
                  <span className="hidden items-center gap-1 group-open:inline-flex">
                    <Icon icon="chevron-up" className="text-sm" aria-hidden="true" />
                    ย่อรายการ
                  </span>
                </summary>
                <div className="border-default-200 mt-2 space-y-2.5 border-t border-dashed pt-2.5">
                  {rest.map(line)}
                </div>
              </details>
            )}
          </>
        )
      },
    }),

    // ─ ลูกค้า ─
    columnHelper.accessor('buyerName', {
      header: 'ลูกค้า',
      meta: { cellClassName: 'min-w-32 align-top' },
      cell: ({ row }) => {
        const displayName = row.original.buyerName ?? row.original.buyerUsername ?? 'ลูกค้าทั่วไป'
        const stats = row.original.customerStats
        // ป้ายจาก SSOT เดียวกับกล่องแชท — คำนามผันตาม vertical ผ่าน vocab ที่หน้านี้ใช้อยู่แล้ว
        const behaviorBadges = stats
          ? customerBadges(
              {
                orders: stats.orders,
                // ใบที่ "สำเร็จ" = ทั้งหมด − ยกเลิกทั้งหมด (ตรงกับนิยาม completed ใน customer-behavior)
                completed: stats.orders - stats.cancelled,
                cancelledByBuyer: stats.cancelledByBuyer,
                cancelledTotal: stats.cancelled,
                returnedParcels: stats.returned,
                problemOrders: stats.cancelledByBuyer + stats.returned,
              },
              // ป้ายชุดนี้เป็นตัวเดียวกับที่โผล่ในกล่องข้อความ (SSOT `customerBadges`) จึงต้องส่งคำ
              // จาก dictionary เข้าไปด้วย ไม่งั้นลูกค้าคนเดียวกันจะได้ป้ายคนละภาษาสองหน้าจอ (HR16)
              { hasHistory: true, orderNoun: vocab.noun, copy: t.inbox.customerPanel },
            )
          : []
        return (
          <>
            <p className="mb-0 flex items-center gap-1 text-sm font-semibold text-default-900">
              {row.original.buyerUsername && (
                <Icon icon="rosette-discount-check-filled" className="shrink-0 text-sm text-primary" />
              )}
              <span className="truncate">
                <HighlightText text={displayName} query={searchQuery} />
              </span>
              {/* ประวัติกับร้านเป็น icon ท้ายชื่อ ไม่ใช่ป้ายข้อความ (user สั่ง 2026-08-06)
                  ชื่อ icon + เกณฑ์เสี่ยง user เคาะเอง ไม่ได้เดา (HR12)
                  title = คำอธิบายตอนชี้ค้าง — icon ล้วนที่ไม่มีคำอธิบายคือปริศนา */}
              {/* icon ล้วนสีเทาจมหายไปกับชื่อ (user บอก 2026-08-06 ว่า "ไม่เด่นเลย") →
                  ใส่พื้นอ่อน bg-{semantic}/15 + หมึกคู่ -ink ตาม idiom badge ของ Paces
                  ทั้งคู่ทรงเดียวกัน เพราะเป็นชุดเดียวกัน = "ประวัติลูกค้ากับร้าน" */}
              {/* 🛑 แก้ 2026-08-11 สองอย่าง:
                  1. เดิม `stats.cancelled >= 2` นับ **ทุกใบที่ยกเลิกไม่สนว่าใครยกเลิก** — บน prod
                     วันนั้นยกเลิก 8 ใบเป็นร้านเองทั้งหมด ป้ายจึงติดตราลูกค้าด้วยการกระทำของร้าน
                  2. เดิมมีแต่ `title=` — screen reader ไม่อ่าน (`<span>` เปล่าไม่รองรับชื่อจากผู้เขียน)
                     และมือถือไม่มี hover ⇒ ป้ายนี้ไม่มีอยู่จริงสำหรับคนกลุ่มหนึ่ง
                     (`docs/conventions/aria-name-requires-supporting-role.md`)
                  เกณฑ์/คำ/ไอคอน มาจาก `lib/customer-behavior.ts` ตัวเดียวกับป้ายในกล่องแชท */}
              {/* markup ย้ายไป `@/components/safepay/CustomerBehaviorBadges` แล้ว (00057) —
                  ป้ายชุดนี้ต้องเหมือนกัน 4 จอ (ที่นี่ / แผงลูกค้าในแชท / ลิสต์ลูกค้า / โปรไฟล์ลูกค้า)
                  DOM ที่ render ออกมาเหมือนเดิมทุกคลาส */}
              <CustomerBehaviorIcons badges={behaviorBadges} />
            </p>
            {/* select-all: คลิกเดียวเลือกทั้งเบอร์ ไม่ต้องลาก */}
            <p className="mb-0 select-all text-xs tabular-nums text-default-500">
              <HighlightText text={row.original.buyerPhone ?? row.original.buyer} query={searchQuery} />
            </p>
          </>
        )
      },
    }),

    // ─ ที่อยู่จัดส่ง + จัดส่งโดย ─
    //   user สั่ง 2026-08-06: แตกที่อยู่เป็นบรรทัด **รหัสไปรษณีย์อยู่ล่างสุดเสมอ**
    //   "จะได้ก้อบง่าย ๆ" → select-all ให้คลิกเดียวได้ทั้งก้อนพร้อมวาง
    //   ใต้เส้นประคือบล็อกขนส่ง (ชื่อ/เลขพัสดุ/ไทม์ไลน์) เพราะตอบคำถามชุดเดียวกันว่า
    //   "ของไปไหน ไปยังไง ถึงไหนแล้ว"
    ...(!hasShippingAxis ? [] : [{
      id: 'shipTo',
      header: 'ที่อยู่จัดส่ง',
      enableSorting: false,
      // ตัวกรอง "ขนส่ง" เกาะคอลัมน์นี้เพราะข้อมูลขนส่งอยู่ในเซลล์นี้ (บล็อก "จัดส่งโดย")
      // เทียบด้วยชื่อที่แสดงจริง ไม่ใช่ courierCode — dropdown จริงของ iShip มี 17 รายการ
      // ที่เป็นแพ็กเกจของ 9 แบรนด์ (lib/iship/courier.ts) ร้านคิดเป็น "แบรนด์" ไม่ใช่รหัส
      enableColumnFilter: true,
      filterFn: ((row, _id, value) => {
        if (!value || value === 'All') return true
        if (value === 'NONE') return !courierKeyOf(row.original)
        return courierKeyOf(row.original) === value
      }) as FilterFn<OrderRow>,
      meta: { cellClassName: 'min-w-56 align-top' },
      cell: ({ row }: { row: TableRow<OrderRow> }) => {
        const a = row.original.shipTo
        const s = row.original.shipment
        const hasCourier = Boolean(s && (s.courierName || s.courierCode))
        const logo = s ? courierLogoUrl(s.courierCode, s.courierName) : null
        return (
          <>
            {a ? (
              <p className="mb-0 select-all text-xs leading-relaxed text-default-800">
                {[a.line1, a.locality, a.province, a.postcode].filter(Boolean).map((part, i) => (
                  <span key={i} className="block">
                    {part}
                  </span>
                ))}
              </p>
            ) : row.original.pickupStage ? (
              /* ออเดอร์นัดรับ (feature 00062) — ไม่มีที่อยู่จัดส่งเพราะ *ไม่ต้องมี* ไม่ใช่เพราะ
                 ยังกรอกไม่ครบ · "ยังไม่มีที่อยู่" อ่านเป็นข้อมูลขาดที่ต้องไปตามเก็บ ทั้งที่ชิป
                 "นัดรับ" ใต้เส้นประอธิบายครบอยู่แล้ว (partial-data-must-be-labeled-or-filled.md
                 ทิศกลับ: อย่าติดป้าย "ยังไม่มี" ให้ของที่ไม่ควรมี) */
              null
            ) : (
              <p className="mb-0 text-xs text-default-400">ยังไม่มีที่อยู่</p>
            )}
            <div className="border-default-200 mt-2 border-t border-dashed pt-2">
              {row.original.pickupStage ? (
                /* ออเดอร์นัดรับ (feature 00062 U18) — ไม่มีพัสดุให้ถามเลย ต้องเช็คก่อน
                   hasCourier เสมอ (ใบพวกนี้ไม่มี shipment จึงตกไป "ไม่มีหมายเลขพัสดุ" ที่เดิม
                   ทั้งที่ความจริงคือ "ไม่มีการจัดส่งเลย" คนละความหมาย) */
                <MiniShipmentTimeline
                  pickupStage={row.original.pickupStage}
                  cancelled={row.original.status === 'CANCELLED'}
                  plain
                />
              ) : hasCourier ? (
                /* hover ที่บล็อกนี้ = การ์ดสถานะพัสดุเต็ม + ยิงถาม iShip สด (user สั่ง 2026-08-06) */
                <ShipmentHoverCard
                  stage={row.original.shippingStage}
                  carrierStatus={s!.carrierStatus}
                  shipmentStatus={s!.status}
                  returnStartedAt={s!.returnStartedAt}
                  returnedAt={s!.returnedAt}
                  returnDispatchedAt={s!.returnDispatchedAt}
                  shipmentId={s!.provider === 'ISHIP' ? (s!.id ?? null) : null}
                  trackingNo={s!.trackingNo}
                  courierName={s!.courierName ?? s!.courierCode}
                  logoUrl={logo}
                  courierInitials={courierInitials(s!.courierName, s!.courierCode)}
                >
                  <p className="mb-0 flex items-center gap-1.5 text-xs text-default-500">
                    จัดส่งโดย
                    {logo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={logo}
                        alt=""
                        /* object-contain + ring: โลโก้ 2:1 (Fuze) ห้ามครอป, พื้นขาวต้องมีขอบ */
                        className="ring-default-200 size-5 shrink-0 rounded bg-white object-contain ring-1"
                      />
                    ) : (
                      <span className="bg-default-100 text-default-700 flex size-5 shrink-0 items-center justify-center rounded text-2xs font-bold">
                        {courierInitials(s!.courierName, s!.courierCode)}
                      </span>
                    )}
                    <span className="font-medium text-default-800">
                      {s!.courierName ?? s!.courierCode}
                    </span>
                  </p>
                  {/* ห้าม font-mono (Anuphan ไม่มี mono จะ fallback หลุดธีม) — tabular-nums พอ */}
                  {s!.trackingNo && (
                    /* 🛑 <div> ไม่ใช่ <p> — `CopyLinkButton` เรนเดอร์ `<div>` ข้างใน (ดูเหตุผลเต็ม
                       ที่ ShipmentHoverCard.tsx จุดเดียวกัน) นี่คือจุดที่ 2 ของบั๊กเดียวกัน */
                    <div className="mb-0 flex items-center gap-1 text-xs font-semibold tabular-nums text-default-700">
                      <span className="select-all">
                        <HighlightText text={s!.trackingNo} query={searchQuery} />
                      </span>
                      <CopyLinkButton
                        value={s!.trackingNo}
                        label="คัดลอกเลขพัสดุ"
                        successMessage="คัดลอกเลขพัสดุแล้ว"
                        iconOnly
                        className="btn-sm border-none bg-transparent p-0 text-default-400 hover:bg-transparent hover:text-default-800"
                      />
                    </div>
                  )}
                  {/* ไทม์ไลน์อยู่ในการ์ดเดียวกับชื่อขนส่ง — user ทักว่า "order เดียวกัน hover
                      ได้ 2 ที่" เพราะเดิมมันอยู่นอกการ์ดแล้วเปิด panel เล็กของตัวเอง
                      plain = วาดแค่จุด ปล่อยให้การ์ดเต็มเป็นคนอธิบาย */}
                  <div className="mt-1.5">
                    <MiniShipmentTimeline
                      stage={row.original.shippingStage}
                      carrierStatus={s!.carrierStatus}
                      shipmentStatus={s!.status}
                      returnStartedAt={s!.returnStartedAt}
                      returnedAt={s!.returnedAt}
                      returnDispatchedAt={s!.returnDispatchedAt}
                      hasShipment={Boolean(s!.trackingNo)}
                      cancelled={row.original.status === 'CANCELLED'}
                      plain
                    />
                  </div>
                </ShipmentHoverCard>
              ) : (
                <p className="mb-0 text-xs text-default-400">ไม่มีหมายเลขพัสดุ</p>
              )}
            </div>
          </>
        )
      },
    }]),

    // ─ นัดหมาย (feature 00036) ─
    //   แทนที่คอลัมน์ที่อยู่จัดส่งสำหรับร้านคิวงาน: ตอบคำถามชุดเดียวกันของโดเมนนี้ว่า
    //   "งานนี้นัดเมื่อไหร่ ใครรับ ถึงขั้นไหนแล้ว" · โครงเซลล์ยกจากคอลัมน์ที่อยู่จัดส่ง
    //   (ข้อความหลายบรรทัด + เส้นประคั่น + บล็อกท้าย) สลับแค่เนื้อหา
    //   แสดงเมื่อร้านมีนัดจริงเท่านั้น — ตัวชี้วัดตัวเดียวกับที่ชิปมือถือใช้ (appointmentFilter
    //   จะเป็น undefined เมื่อ hasAppointmentAxis=false ที่ OrdersList)
    ...(!appointmentFilter ? [] : [{
      id: 'appointment',
      header: 'นัดหมาย',
      enableSorting: false,
      enableColumnFilter: false,
      meta: { cellClassName: 'min-w-48 align-top' },
      cell: ({ row }: { row: TableRow<OrderRow> }) => {
        const a = row.original.appointment
        // ไม่มีนัด = ขีดคั่นที่อ่านออกว่าตั้งใจ ไม่ใช่ช่องว่างที่ดูเหมือนข้อมูลหาย (AC-5.2)
        if (!a) return <span className="text-xs text-default-400">ไม่มีนัด</span>
        const meta = APPOINTMENT_STAGE_META[a.stage]
        return (
          <>
            <p className="mb-0 text-xs font-medium text-default-800">
              {/* นัดทั้งวันไม่มีเวลาให้แสดง — การโชว์ 00:00 คือการกุข้อมูลที่ผู้ใช้ไม่ได้กรอก
                  ที่เหลือแสดงช่วงเต็ม (feature 00036 งาน D): ร้านคิวงานวางแผนเป็น "09:00–10:30"
                  ไม่ใช่ "09:00" · ใบเก่าที่ไม่มี serviceEnd ตกกลับไปแสดงเวลาเริ่มอย่างเดียว */}
              {a.allDay
                ? `${formatDateTH(a.startISO)} · ทั้งวัน`
                : a.endISO
                  ? formatDayMonthTimeRangeTH(a.startISO, a.endISO)
                  : formatDayMonthTimeTH(a.startISO)}
            </p>
            {a.resourceName && (
              <p className="mb-0 mt-0.5 flex items-center gap-1 text-xs text-default-500">
                <Icon icon="user-cog" className="shrink-0 text-sm" aria-hidden="true" />
                <span className="truncate">{a.resourceName}</span>
              </p>
            )}
            <div className="border-default-200 mt-2 border-t border-dashed pt-2">
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium',
                  meta.cls,
                )}
              >
                <Icon icon={meta.icon} className="shrink-0 text-sm" aria-hidden="true" />
                {meta.label}
              </span>
            </div>
          </>
        )
      },
    }]),

    // ─ การชำระเงิน ─
    columnHelper.accessor('paymentMethod', {
      header: 'การชำระเงิน',
      meta: { cellClassName: 'min-w-36 align-top' },
      cell: ({ row }) => {
        const pm = row.original.paymentMethod
        if (!pm) return <span className="text-sm text-default-400">—</span>
        // วงกลมสีบอกว่าเงินถึงมือหรือยัง: เขียว = ได้รับแล้ว (Verified-Means-Green —
        // เขียวเมื่อเป็นข้อเท็จจริงที่ตรวจสอบได้เท่านั้น) ที่เหลือเป็นกลาง
        const settled = Boolean(row.original.codReceivedAtISO)
        return (
          <p className="mb-0 inline-flex items-center gap-1.5 whitespace-nowrap text-sm text-default-800">
            <span
              className={cn(
                'flex size-6 shrink-0 items-center justify-center rounded-full',
                settled ? 'bg-success/15 text-success-ink' : 'bg-default-100 text-default-700',
              )}
            >
              <Icon icon={PAYMENT_ICONS[pm] ?? 'wallet'} className="text-sm" />
            </span>
            {PAYMENT_LABELS[pm] ?? pm}
          </p>
        )
      },
    }),

    // ─ ยอดคำสั่งซื้อ ─
    columnHelper.accessor('total', {
      header: `ยอด${vocab.noun}`,
      // whitespace-nowrap อยู่ที่ <td> ตามแพตเทิร์นของคอลัมน์อื่นในตารางนี้ (wrap behavior
      // กำหนดที่ meta ไม่ใช่ที่ content element) — เคยถูกย้ายลงไปที่ <span> ชั่วคราวตอนมี
      // บรรทัดกำไรซ้อนอยู่ใต้ยอด ซึ่งถอดออกไปแล้ว 2026-08-09
      meta: { headerClassName: 'text-end', cellClassName: 'text-end align-top whitespace-nowrap' },
      cell: ({ row }) => (
        <span className="text-lg font-bold tabular-nums text-default-900">
          ฿{row.original.total.toLocaleString('th-TH')}
        </span>
      ),
    }),

    // ─ สถานะ = เช็กลิสต์ "ใบนี้ค้างตรงไหน" ─
    //   user สั่ง 2026-08-06 (ยกมาจาก UI ที่เคยทำเอง): เห็นทันทีว่าเหลืออะไร แทนป้ายคำเดียว
    //   ที่ต้องแปลเอง · ทุกข้อผูกกับข้อมูลที่มีอยู่แล้ว ไม่ต้องเก็บอะไรเพิ่ม
    //   บรรทัด "รับเงินปลายทาง" โผล่เฉพาะใบ COD — ใบโอนล่วงหน้าไม่มีเงินให้ตาม การขึ้น
    //   ให้ครบทุกใบเท่ากับสร้างงานค้างปลอม
    columnHelper.accessor('status', {
      header: 'สถานะ',
      filterFn: 'equalsString',
      enableColumnFilter: true,
      meta: { cellClassName: 'min-w-40 align-top' },
      cell: ({ row }) => {
        const o = row.original
        const cancelled = o.status === 'CANCELLED'
        // ใบที่ยกเลิกใช้เช็กลิสต์ชุดเดียวกับใบอื่น (user สั่ง 2026-08-06: "มันต้องเหมือน
        // สถานะอื่น ๆ") — เดิมเป็นป้ายเดี่ยวซึ่งอ่านเป็นคนละภาษากับทั้งคอลัมน์
        // เพิ่มบรรทัดแรกว่ายกเลิกแล้ว ส่วนที่เหลือค้างเป็น "ไม่เกิดขึ้น" ซึ่งตรงความจริง:
        // ใบที่ยกเลิกไม่มีทางได้คำยืนยันจากผู้ซื้ออีก
        const steps: { label: string; done: boolean; danger?: boolean }[] = [
          ...(cancelled ? [{ label: `ยกเลิก${vocab.noun}`, done: true, danger: true }] : []),
          // ผันคำตามประเภทกิจการ (feature 00036 FR-SOV-003) — ร้านบริการ/บ้านพักไม่มีการจัดส่ง
          // ให้พูดถึง คำมาจาก ORDER_VOCAB ที่เดียว ห้ามต่อสตริงที่นี่ (ต่างจากบรรทัดยกเลิกข้างบน
          // ที่ต่อได้ เพราะ "ยกเลิก"+noun อ่านเป็นภาษาคนทั้ง 3 ชุด ส่วนช่องนี้ไม่ใช่)
          /**
           * ออเดอร์นัดรับ (feature 00062) ไม่มี "การจัดส่ง" ให้ยืนยัน และ **ไม่มีวันเป็น
           * `SHIPPED`** (ร้านกด "มอบสินค้าแล้ว" → เขียน `handedOverAt` โดย `status` ยังเป็น
           * PENDING ตาม D-1) ⇒ ใช้คำ/เกณฑ์ของกองจัดส่งกับใบพวกนี้ = ขั้นนี้ค้าง ✕ ตลอดกาล
           * ทั้งที่ร้านมอบของไปแล้ว — เช็กลิสต์เล่าเรื่องผิดบนจอที่ผู้ขายกวาดตาทั้งวัน
           *
           * `vocab.fulfillLabel` ผันตาม *ประเภทร้าน* ส่วนวิธีส่งมอบเป็นของ *รายใบ* จึงต้อง
           * แยกที่นี่ ไม่ใช่ไปเพิ่มคีย์ใน ORDER_VOCAB (คนละแกนกัน)
           */
          o.pickupStage
            ? { label: 'มอบสินค้า', done: o.pickupStage !== 'AWAITING_HANDOVER' }
            : { label: vocab.fulfillLabel, done: o.status === 'SHIPPED' || o.status === 'CONFIRMED' },
          ...(isCODPayment(o.paymentMethod)
            ? [{ label: 'รับเงินปลายทาง', done: Boolean(o.codReceivedAtISO) }]
            : []),
          /**
           * ขั้น "เก็บเงินครบ" ของร้านบริการ (feature 00050) — ทรงเดียวกับแถว COD ข้างบน
           * ซึ่งก็เป็นขั้นที่มีเฉพาะบางใบเหมือนกัน
           *
           * 🛑 ต้องมี ไม่งั้นเดสก์ท็อปเล่าเรื่องไม่ครบ: การ์ดมือถือกับหน้ารายละเอียดพูดถึงเงิน
           * (จอง/รอชำระ/ชำระเงินแล้ว) แต่เช็กลิสต์นี้ข้ามไปเลย ⇒ ใบที่ยังค้างเงินอยู่ดูเหมือน
           * เดินครบทุกขั้นแล้วบนจอเดียวที่ผู้ขายใช้กวาดตาทั้งวัน
           * `o.money` มีค่าเฉพาะร้าน SERVICE_QUEUE ที่ผ่าน `hasMoneyStory` ที่ server (AC-SQ-07)
           */
          ...(o.money ? [{ label: 'เก็บเงินครบ', done: o.money.outstanding <= 0 }] : []),
          { label: 'ผู้ซื้อยืนยันรับของ', done: o.status === 'CONFIRMED' },
        ]
        return (
          <ul className="mb-0 list-none space-y-1 p-0">
            {steps.map((s) => (
              <li
                key={s.label}
                className={cn(
                  'flex items-center gap-1.5 text-xs',
                  s.danger
                    ? 'font-medium text-danger-ink'
                    : s.done
                      ? 'font-medium text-success-ink'
                      : 'text-default-400',
                )}
              >
                <Icon
                  icon={s.danger ? 'circle-x' : s.done ? 'circle-check-filled' : 'x'}
                  className="shrink-0 text-sm"
                  aria-hidden="true"
                />
                {s.label}
              </li>
            ))}
          </ul>
        )
      },
    }),

    // ─ วันที่/เวลา — คอลัมน์ซ่อน มีไว้ให้ตัวกรอง "ช่วงเวลา" เกาะเท่านั้น ─
    //   วันที่ย้ายไปแสดงบนแถบหัวกลุ่ม (groupRow) ตอนทำตารางแบบจัดกลุ่ม 2026-08-06 แล้ว
    //   คอลัมน์นี้ถูกลบไปด้วย — แต่ dropdown ยังยิง table.getColumn('createdAtISO')
    //   ซึ่งคืน undefined ทำให้ `?.setFilterValue()` เป็น no-op เงียบ ๆ (ตัวกรองวันที่
    //   จึงไม่ทำงานเลยตั้งแต่วันนั้น) · ตัวกรองของ TanStack ไม่สนใจ visibility
    //   คอลัมน์ที่ซ่อนอยู่ยังกรองได้ปกติ จึงเอาคอลัมน์กลับมาแบบไม่แสดงผล
    columnHelper.accessor('createdAtISO', {
      header: 'วันที่/เวลา',
      filterFn: dateRangeFilterFn,
      enableColumnFilter: true,
      enableSorting: false,
      cell: () => null,
    }),

    // ─ ดำเนินการ ─
    // w-36 ไม่ใช่ w-px: `w-px` = "หดพอดีเนื้อหา" ซึ่ง grid คำนวณ min-content คนละแบบกับ
    // inline-flex คอลัมน์เลยยุบจนปุ่มล้น (เจอจริงบน prod 2026-08-06)
    {
      id: 'action',
      header: () => <div>ดำเนินการ</div>,
      meta: { headerClassName: 'w-36 whitespace-nowrap', cellClassName: 'w-36 whitespace-nowrap align-top' },
      cell: ({ row }: { row: TableRow<OrderRow> }) => (
        <OrderActions order={row.original} onCancelRequest={handleCancelRequest} variant="table-grid" orderNoun={vocab.noun} />
      ),
    },
  ]

  const table = useReactTable({
    data: tableData,
    columns,
    state: { sorting, columnFilters, pagination, rowSelection },
    // createdAtISO = คอลัมน์กรองอย่างเดียว ไม่ต้องโผล่เป็นคอลัมน์จริง (วันที่อยู่บนแถบหัวกลุ่ม)
    initialState: { columnVisibility: { createdAtISO: false } },
    /**
     * เรียงลำดับ / ตัวกรองคอลัมน์ / เปลี่ยนหน้า+จำนวนแถว ผ่าน callback ของ table ทุกทาง
     * (หัวคอลัมน์ที่กดเรียง, ทุก FilterDropdown ใน toolbar, ปุ่ม pagination, "แถวละ N")
     * ห่อที่นี่ที่เดียวจึงครอบได้ครบโดยไม่ต้องไล่ห่อทีละ handler — และจะไม่หลุดเมื่อมีคน
     * เพิ่มตัวกรองใหม่ทีหลัง
     *
     * คำค้นไม่ห่อ: ช่องค้นหาเป็น controlled input ที่ต้องพิมพ์ลื่น (ดู onChange ข้างล่าง)
     */
    onSortingChange: (updater) => busy.run(() => setSorting(updater)),
    onColumnFiltersChange: (updater) => busy.run(() => setColumnFilters(updater)),
    onPaginationChange: (updater) => busy.run(() => setPagination(updater)),
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    enableColumnFilters: true,
    enableRowSelection: true,
    filterFns: {
      dateRange: dateRangeFilterFn,
    },
  })

  /**
   * ตัวกรองใน toolbar ผูกกับคอลัมน์ด้วย "ชื่อ" — พอคอลัมน์ถูกลบหรือเปลี่ยนชื่อ
   * `table.getColumn(id)?.setFilterValue()` จะกลายเป็น no-op เงียบ ๆ ตัวกรองตายทั้งตัว
   * โดยไม่มี error ให้เห็นเลย (เกิดจริงกับ 'createdAtISO' — ตัวกรองช่วงเวลาไม่ทำงาน
   * ตั้งแต่ 2026-08-06 จนผู้ใช้มาเจอเอง) จึงให้มันดังตอน dev แทนที่จะเงียบ
   */
  /** ค่าตัวกรองช่วงเวลาที่ใช้อยู่ — อ่านผ่าน filterColumn เพื่อให้เตือนดังถ้าคอลัมน์หาย */
  const dateFilterValue = (table.getColumn('createdAtISO')?.getFilterValue() as string) ?? 'All'

  const filterColumn = (id: string) => {
    const column = table.getColumn(id)
    if (!column && process.env.NODE_ENV !== 'production') {
      console.error(`[OrdersTable] ตัวกรองอ้างคอลัมน์ "${id}" ที่ไม่มีในตาราง — ตัวกรองนี้จะไม่ทำงาน`)
    }
    return column
  }

  const pageIndex  = table.getState().pagination.pageIndex
  const pageSize   = table.getState().pagination.pageSize
  const totalItems = table.getFilteredRowModel().rows.length
  const start      = pageIndex * pageSize + 1
  const end        = Math.min(start + pageSize - 1, totalItems)

  return (
    <>
    <div className="card">
      {/* ─── toolbar — เรียงตาม theme orders OrdersList.tsx: [search ซ้าย] [กรอง:+filter กลาง] [Add ขวา] ───
          Base/source: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/orders/components/OrdersList.tsx
          (ดู docs/system/ui-guideline/seller/page-sourcing.md → orders). คง w-* บน select กัน flex บีบ label หาย */}
      <div className="card-header">
        {/* ซ้าย: search
            🛑 `flex-1` จำเป็น ไม่ใช่ของแต่ง — `.card-header` เป็น `justify-between` และ
            `.input-icon-group` ไม่มี flex-grow ⇒ ที่ว่างที่เหลือทั้งแถวถูกแปลงเป็น "ช่องไฟ
            ระหว่างกลุ่ม" แทนที่จะป้อนให้ช่องค้นหา ⇒ กล่องกว้างเท่า intrinsic width ของ
            <input> เปล่า ๆ (~200px) แล้ว placeholder ถูกตัดกลางคำ (user เจอบน prod 2026-08-25)
            ธีมต้นทางไม่เคยเจอเพราะ placeholder ของเขาสั้น 14 ตัวอักษร — ของเรายาวขึ้นใน 00058
            แต่ไม่ได้ยืดกล่องคู่กัน
            `max-w-sm` = ไม่ปล่อยให้ช่องค้นหาเด่นกว่าโซนตัวกรอง/ปุ่มสร้างบนจอกว้างมาก
            (Impeccable operate.md — Product defaults to Restrained) */}
        <div className="flex min-w-0 max-w-xl flex-1 gap-2.5">
          {/* relative = กล่องอ้างอิงของปุ่มล้างคำค้น — ไม่แตะโครง .input-icon-group เอง */}
          <div className="input-icon-group relative">
            <Icon icon="search" className="input-icon" />
            <input
              type="text"
              /* ข้อความเดียวกับมือถือ — จอเดียวกันต้องสัญญาเรื่องเดียวกัน (HR16) */
              className="form-input"
              placeholder={`ค้นหาเลข${vocab.noun} / ชื่อลูกค้า / เบอร์ / เลขพัสดุ / สินค้า`}
              /* กันเคสที่ยืดกล่องแล้วยังไม่พอ (ร้านคิวงานมี vocab.noun ยาวกว่า) — tooltip
                 ของเบราว์เซอร์เอง ไม่ต้องสร้าง element ใหม่ให้แถบนี้สูงขึ้น */
              title={`ค้นหาเลข${vocab.noun} / ชื่อลูกค้า / เบอร์ / เลขพัสดุ / สินค้า`}
              value={search}
              /* onSearchChange อยู่นอก transition โดยตั้งใจ — controlled input ที่ถูก defer
                 จะพิมพ์ตามนิ้วไม่ทัน; แผงเปิดด้วย begin() แล้วหุบเองหลังหยุดพิมพ์
                 (setPagination ผ่าน table.setPageIndex เพื่อให้เข้า onPaginationChange ตัวเดียวกัน) */
              /* ไม่เรียก busy.begin() แล้ว — แผงโหลดผูกกับ `searchPending`
                 (ยิงทุกตัวอักษรทำให้แผงกะพริบทับผลลัพธ์ตลอดเวลาที่พิมพ์) */
              onChange={(e) => {
                onSearchChange(e.target.value)
                table.setPageIndex(0)
              }}
            />
            {search && (
              <button
                type="button"
                aria-label="ล้างคำค้นหา"
                onClick={() => {
                  onSearchChange('')
                  table.setPageIndex(0)
                }}
                /* วางทับขอบขวาของ .input-icon-group โดยไม่แทรก element คั่นระหว่าง
                   .input-icon กับ .form-input (โครงของ group ห้ามถูกแทรก — _forms.css §4) */
                className="absolute right-0 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center text-default-400"
              >
                <Icon icon="circle-x" className="text-base" />
              </button>
            )}
          </div>
        </div>

        {/* กลาง: กรอง: + Single Button Dropdown (สถานะ/ประเภท/ช่วงเวลา) + page size
            Base: theme/paces/Admin/TS/src/app/(admin)/ui/dropdowns/page.tsx (SingleButtonDropdowns)
            ใช้ FilterDropdown (custom React + theme .dropdown-item) — ไม่ใช่ native select */}
        {/* toolbar ใหม่ (user อนุมัติ mockup 2026-08-06): ตัดป้าย "กรอง:" ทิ้ง — ปุ่มมี icon+ชื่อ
            ในตัว ไม่ต้องมีป้ายบอกอีกชั้น · ตัวกรองพัสดุย้ายจากแถบชิปมาอยู่แถวเดียวกัน */}
        <div className="flex flex-wrap items-center gap-2.5 lg:flex-nowrap">
          {/* นัดวันนี้ — pill ที่มาจากไทล์หน้าแรก (user สั่ง 2026-08-10)
              วางหัวแถวก่อนดรอปดาวน์ทุกตัว เพราะเป็นบริบทที่ผู้ใช้ "พามาเอง" ไม่ใช่สิ่งที่เพิ่ง
              เลือกในหน้านี้ — ถ้าไปอยู่ท้ายแถวจะถูกกวาดตาข้ามแล้วอ่านตัวเลขทั้งตารางผิด */}
          {apptDayFilter && (
            <span className="badge bg-primary inline-flex items-center gap-1 rounded-full py-1 ps-3 pe-1 text-xs font-semibold text-white">
              <Icon icon="calendar-event" className="text-sm" aria-hidden="true" />
              {apptDayFilter.label}
              <span className="tabular-nums">{apptDayFilter.count}</span>
              {/* ปุ่มจริง ไม่ใช่ span — <span> ไม่มี role ที่รองรับชื่อจากผู้เขียน AT จะทิ้ง label
                  (docs/conventions/aria-name-requires-supporting-role.md) */}
              <button
                type="button"
                onClick={apptDayFilter.onClear}
                aria-label={`ล้างตัวกรอง${apptDayFilter.label}`}
                className="ms-0.5 inline-flex size-11 lg:size-5 items-center justify-center rounded-full bg-white/20 hover:bg-white/30"
              >
                <Icon icon="x" className="text-xs" />
              </button>
            </span>
          )}

          {/* สถานะ */}
          <FilterDropdown
            icon="truck"
            defaultLabel="สถานะ"
            resetValue="All"
            value={(filterColumn('status')?.getFilterValue() as string) ?? 'All'}
            options={STATUS_FILTER_OPTIONS}
            onChange={(v) => {
              filterColumn('status')?.setFilterValue(v === 'All' ? undefined : v)
              table.setPageIndex(0)
            }}
          />

          {/* พัสดุ (?stage= URL — state อยู่ที่ OrdersList ตัวเดียวกับชิปมือถือ) */}
          {stageFilter && (
            <FilterDropdown
              icon="package"
              defaultLabel="พัสดุ"
              resetValue="All"
              value={stageFilter.value ?? 'All'}
              options={[
                { value: 'All', label: 'ทั้งหมด' },
                ...STAGE_FILTER_KEYS.map((key) => ({
                  value: key,
                  label: SHIPPING_STAGE_LABEL[key],
                  badge: {
                    label: stageFilter.counts[key] ?? 0,
                    className: STAGE_BADGE_CLS[key],
                  },
                })),
              ]}
              onChange={(v) => stageFilter.onChange(v === 'All' ? null : v)}
            />
          )}

          {/* วิธีส่งมอบ (?fulfillment= URL — state อยู่ที่ OrdersList ตัวเดียวกับชิปมือถือ,
              feature 00062 U18) — คนละแกนกับ "พัสดุ" ข้างบน (UX-Design-Spec A5) เกทด้วย
              hasShippingAxis ตรง ๆ ไม่ตามข้อมูล: ร้านที่ยังไม่มีออเดอร์นัดรับเลยก็ต้องเห็น */}
          {fulfillmentFilter && (
            <FilterDropdown
              icon="building-store"
              defaultLabel="วิธีส่งมอบ"
              resetValue="All"
              value={fulfillmentFilter.value ?? 'All'}
              options={[
                { value: 'All', label: 'ทั้งหมด' },
                ...FULFILLMENT_FILTER_KEYS.map((key) => ({
                  value: key,
                  label: FULFILLMENT_FILTER_LABEL[key],
                  badge: {
                    label: fulfillmentFilter.counts[key] ?? 0,
                    className: FULFILLMENT_BADGE_CLS[key],
                  },
                })),
              ]}
              onChange={(v) => fulfillmentFilter.onChange(v === 'All' ? null : v)}
            />
          )}

          {/* สถานะนัด (?appt= URL — state อยู่ที่ OrdersList ตัวเดียวกับชิปมือถือ, feature 00036)
              โครงยกจากดรอปดาวน์ "พัสดุ" ข้างบนทั้งดุ้น เปลี่ยนแค่แหล่งข้อมูล */}
          {appointmentFilter && (
            <FilterDropdown
              icon="calendar-event"
              defaultLabel="สถานะนัด"
              resetValue="All"
              value={appointmentFilter.value ?? 'All'}
              options={[
                { value: 'All', label: 'ทั้งหมด' },
                /* ลำดับ + คำ + ตัวเลข ต้องตรงกับชิปมือถือใน OrdersList เป๊ะ (symbol เดียว)
                   badge เทากลาง ไม่ใช่สี semantic — "ไม่มีนัด" เป็นคนละหมวดกับ 5 สถานะ
                   ที่เป็นจุดบนเส้นทางของนัด ไม่ใช่ขั้นหนึ่งในนั้น */
                {
                  value: 'NONE',
                  label: 'ไม่มีนัด',
                  badge: {
                    label: appointmentFilter.counts.NONE ?? 0,
                    className: 'bg-default-100 text-default-700',
                  },
                },
                ...APPOINTMENT_STAGE_KEYS.map((key) => ({
                  value: key,
                  label: APPOINTMENT_STAGE_META[key].label,
                  badge: {
                    label: appointmentFilter.counts[key] ?? 0,
                    className: APPOINTMENT_STAGE_META[key].cls,
                  },
                })),
              ]}
              onChange={(v) => appointmentFilter.onChange(v === 'All' ? null : v)}
            />
          )}

          {/* ขนส่ง — ตัวเลือกมาจากออเดอร์จริงของร้าน (user สั่ง 2026-08-06)
              hasShippingAxis: ต้องซ่อนคู่กับคอลัมน์ shipTo เสมอ ไม่งั้นกลายเป็นปุ่มที่กดแล้ว
              ไม่เกิดอะไร (getColumn คืน undefined + optional chain = no-op เงียบ) */}
          {hasShippingAxis && courierOptions.length > 1 && (
            <FilterDropdown
              icon="truck-delivery"
              defaultLabel="ขนส่ง"
              resetValue="All"
              value={(filterColumn('shipTo')?.getFilterValue() as string) ?? 'All'}
              options={courierOptions}
              onChange={(v) => {
                filterColumn('shipTo')?.setFilterValue(v === 'All' ? undefined : v)
                table.setPageIndex(0)
              }}
            />
          )}

          {/* ช่วงเวลา — ตัวเดียวในแถบนี้ที่ไม่ใช่ FilterDropdown เพราะมีโหมดเลือกวันเจาะจง
              (ดูเหตุผลที่หัวไฟล์ OrderDateFilterDropdown ว่าทำไมไม่ยัดเข้า FilterDropdown) */}
          <OrderDateFilterDropdown
            value={(filterColumn('createdAtISO')?.getFilterValue() as string) ?? 'All'}
            onChange={(v) => {
              filterColumn('createdAtISO')?.setFilterValue(v === 'All' ? undefined : v)
              table.setPageIndex(0)
            }}
          />

          {/* page size — "แถวละ N" ไม่ใช่เลขเปล่า ๆ (mockup 2026-08-06: "10" เดาไม่ออกว่าคืออะไร) */}
          <FilterDropdown
            align="right"
            value={String(pageSize)}
            options={[5, 10, 15, 20].map((n) => ({ value: String(n), label: `แถวละ ${n}` }))}
            onChange={(v) => table.setPageSize(Number(v))}
          />
        </div>

        {/* ขวา: เส้นคั่นบางแยกโซนตัวกรองออกจาก action + สร้างออเดอร์ */}
        <div className="flex items-center gap-2.5">
          <span className="bg-default-200 h-6 w-px" aria-hidden="true" />
          <Link href="/orders/new" className="btn bg-primary text-white hover:bg-primary-hover">
            <Icon icon="plus" className="size-4.5" />
            {vocab.createLabel}
          </Link>
        </div>
      </div>

      {/* ─── DataTable + pagination (= พื้นที่ผลลัพธ์) ───────────────────────────
          relative = กล่องอ้างอิงของแผงโหลด · ครอบถึง footer ด้วยเพราะปุ่มเปลี่ยนหน้าก็เป็น
          "โหลดข้อมูลใหม่" เหมือนกัน กดซ้อนระหว่างรอไม่ควรทำได้
          ไม่ครอบ card-header: แถบเครื่องมือต้องกดต่อได้ (ดูเหตุผลเต็มใน ListBusyOverlay.tsx) */}
      <div className="relative">
      {/* แถบหัวกลุ่มต่อ 1 ใบ — เก็บของที่เป็น "ระดับใบ" ไว้ที่นี่แทนที่จะเบียดเป็นคอลัมน์ผอม
          (เลขออเดอร์ / ที่มา / วันที่) ดูเหตุผลเต็มที่คอมเมนต์เหนือ columns */}
      <DataTable<OrderRow>
        table={table}
        /* บอกด้วยว่ากรองวันไหนอยู่ — "ไม่พบออเดอร์" เฉย ๆ ทำให้แยกไม่ออกว่า "วันนั้นไม่มีจริง"
           หรือ "ตัวกรองค้างอยู่" ซึ่งเป็นสองสถานการณ์ที่ต้องทำคนละอย่าง */
        emptyMessage={
          searchQuery ? (
            /* จอว่างที่มีคำค้นต้องบอกทางออกเสมอ — component เดียวกับมือถือ (feature 00058)
               ถ้าปล่อยเป็นข้อความบรรทัดเดียว ผู้ขายจะสรุปว่าออเดอร์หายจากระบบ ทั้งที่มันอยู่
               แค่คนละกอง (ตัวกรองสถานะ/พัสดุ/ช่วงเวลาที่ค้างอยู่) */
            <SellerEmptyState
              compact
              icon="shopping-cart-off"
              title={`ไม่พบ${vocab.noun}ที่ตรงกับ "${appliedSearch.trim()}"`}
              description={
                wholeShopMatches > 0
                  ? `ไม่พบในตัวกรองที่เลือกไว้ · พบ ${wholeShopMatches.toLocaleString('th-TH')} รายการในทั้งร้าน`
                  : undefined
              }
              actionButton={
                wholeShopMatches > 0
                  ? {
                      label: `ดูผลทั้งร้าน (${wholeShopMatches.toLocaleString('th-TH')})`,
                      onClick: () => {
                        // ตัวกรองของตารางอยู่ใน TanStack ไม่ใช่ที่ OrdersList — ต้องล้างทั้งสองที่
                        setColumnFilters([])
                        table.setPageIndex(0)
                        onClearFilters()
                      },
                    }
                  : undefined
              }
            />
          ) : isSpecificDay(dateFilterValue) ? (
            `ไม่พบออเดอร์วันที่ ${formatDateTH(`${dateFilterValue}T00:00:00+07:00`)}`
          ) : (
            'ไม่พบออเดอร์'
          )
        }
        groupRow={(row) => (
          /* w-9 (36px) ไม่ใช่ w-11: คอลัมน์ checkbox กว้าง 44px ก็จริง แต่ td ของแถบหัว
             มี padding-left 18px ขณะที่ช่องสินค้ามี 10px — ต่างกัน 8px พอดี (วัดจริงบน
             prod: โลโก้ 327 / รูปสินค้า 319) เอา 44-8 = 36 จึงตรงแนวทั้งรูปสินค้าและ
             หัวคอลัมน์ "รายการสินค้า" (user สั่ง 2026-08-06)
             ต้องเป็นกล่องแยกที่ไม่มี gap ตามหลัง ไม่ใช่ item ธรรมดาใน flex gap-x เพราะ
             gap จะบวกเพิ่มแล้วเลยแนวไปอีก */
          <div
            className={cn(
              'flex items-center',
              /* ตรงเต็มค่า → แถบหัวกลุ่มได้พื้นจาง ๆ (feature 00058) เป็นสัญญาณเดียวที่บอกว่า
                 "ใบนี้ถูกยกขึ้นบนสุดเพราะตรงเป๊ะ" — ปล่อยให้ลำดับเปลี่ยนเงียบ ๆ ผู้ใช้จะอ่านว่าแอปพัง
                 ใช้พื้นแทน ring เพราะ ring บน <tr> ถูก border-collapse ของตารางกลืน */
              hitMeta.get(row.original.publicToken)?.isExactMatch && '-mx-2 rounded bg-primary/5 px-2',
            )}
          >
            <span className="flex w-9 shrink-0 items-center">
              <input
                type="checkbox"
                className="form-checkbox form-checkbox-light size-4.5"
                checked={row.getIsSelected()}
                onChange={row.getToggleSelectedHandler()}
                aria-label="เลือกออเดอร์นี้"
              />
            </span>
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-1">
              {/* ลำดับตามที่ user สั่ง: [รูปเพจ+badge แพลตฟอร์ม] [เลขออเดอร์] [คัดลอก] … */}
              {/* channel มาจาก sourceChannel (ผูกกับ sourceLogoUrl แหล่งเดียวกัน) ไม่ใช่ salesChannel
                  ดิบ — ผสมกันจะได้รูปช่องทางหนึ่งคู่กับ badge อีกช่องทางหนึ่ง (2026-08-10) */}
              <OrderSourceLogo
                logoUrl={row.original.sourceLogoUrl ?? null}
                channel={row.original.sourceChannel ?? row.original.salesChannel}
                size="xs"
              />
              <Link
                href={`/orders/${row.original.publicToken}`}
                className="text-sm font-bold tabular-nums text-primary hover:underline"
              >
                <HighlightText
                  text={formatOrderNo(row.original.publicToken, row.original.createdAtISO)}
                  query={searchQuery}
                  /* ลิงก์นี้เป็น text-primary อยู่แล้ว — ถ้าไฮไลต์ทับสีตัวอักษรจะได้น้ำเงิน 2 เฉดซ้อนกัน */
                  inheritColor
                />
              </Link>
              {/* คัดลอก "เลขออเดอร์" ไม่ใช่ลิงก์ — ลิงก์ผู้ซื้อมีปุ่มของตัวเองในชุดดำเนินการแล้ว */}
              <CopyLinkButton
                value={formatOrderNo(row.original.publicToken, row.original.createdAtISO)}
                label="คัดลอกเลขออเดอร์"
                successMessage="คัดลอกเลขออเดอร์แล้ว"
                iconOnly
                className="btn-sm border-none bg-transparent text-default-400 hover:bg-default-200 hover:text-default-800"
              />
              {row.original.isFromAuction && (
                <span className="badge bg-warning/15 text-warning-ink inline-flex items-center gap-0.5" title="จากการประมูล">
                  <Icon icon="gavel" className="size-3" />
                  ประมูล
                </span>
              )}
              <span className="ms-auto inline-flex items-center gap-3">
                {/* เปิดแชท — เฉพาะออเดอร์ที่หาห้องแชทของลูกค้าเจอ (ดู OrderRow.conversationId) */}
                {row.original.conversationId && (
                  <Link
                    href={`/inbox/${row.original.conversationId}`}
                    className="text-primary hover:text-primary/80 inline-flex items-center gap-1 text-xs font-medium hover:underline"
                  >
                    <Icon icon="message-circle" className="text-sm" aria-hidden="true" />
                    เปิดข้อความสนทนา
                  </Link>
                )}
                <span className="inline-flex items-center gap-1.5 text-xs text-default-500">
                  <Icon icon="calendar" className="text-sm" aria-hidden="true" />
                  {formatDateTime(row.original.createdAtISO)}
                </span>
              </span>
            </div>
          </div>
        )}
      />

      {/* ─── pagination ──────────────────────────────────────────────────────── */}
      {table.getRowModel().rows.length > 0 && (
        <div className="card-footer">
          <TablePagination
            totalItems={totalItems}
            start={start}
            end={end}
            itemsName="ออเดอร์"
            showInfo
            previousPage={table.previousPage}
            canPreviousPage={table.getCanPreviousPage()}
            pageCount={table.getPageCount()}
            pageIndex={table.getState().pagination.pageIndex}
            setPageIndex={table.setPageIndex}
            nextPage={table.nextPage}
            canNextPage={table.getCanNextPage()}
          />
        </div>
      )}

      {/* rounded-b-lg: ตอนไม่มีแถว footer ถูกซ่อน ขอบล่างของกล่องนี้จึงเป็นขอบล่างของ .card พอดี */}
      <ListBusyOverlay busy={busy.busy || searchPending} className="rounded-b-lg" />
      </div>{/* /relative — พื้นที่ผลลัพธ์ + แผงโหลด */}
    </div>

    {/* bulk action bubble — โผล่เมื่อเลือก checkbox ≥1 (desktop) */}
    <BulkActionBar
      ishipEnabled={ishipEnabled}
      selectedRows={table.getSelectedRowModel().rows}
      onClear={() => table.resetRowSelection()}
      buyerBaseUrl={buyerBaseUrl}
    />
    </>
  )
}
