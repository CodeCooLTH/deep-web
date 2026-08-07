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
import TablePagination from '@/components/table/TablePagination'
import Icon from '@/components/wrappers/Icon'
import type { OrderVocab } from '@/lib/seller-menu'
import { formatDateTime } from '@/lib/format-date'
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
import { PAYMENT_LABELS, PAYMENT_ICONS, type OrderItemRow, type OrderRow } from './data'
import { formatOrderNo } from '@/lib/order-no'
import CopyLinkButton from '@/app/(paces)/seller/(dashboard)/orders/[token]/components/CopyLinkButton'
import MiniShipmentTimeline from './MiniShipmentTimeline'
import ShipmentHoverCard from './ShipmentHoverCard'
import OrderSourceLogo from './OrderSourceLogo'
import { courierInitials, courierLogoUrl } from '@/lib/iship/courier'
import { SHIPPING_STAGE_LABEL } from '@/lib/order-stage'
import OrderActions from './OrderActions'
import BulkActionBar from './BulkActionBar'
import FilterDropdown from '@/components/safepay/FilterDropdown'
import { useRouter } from 'next/navigation'
import { pacesConfirm } from '@/lib/paces-swal'
import { pacesToast } from '@/lib/paces-toast'
import { ORDER_STATUS_META, isCODPayment } from '@/lib/order-display'

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
}

// ─── date range filter (adapt จาก theme dateRangeFilterFn) ───────────────────
const dateRangeFilterFn: FilterFn<OrderRow> = (row, _columnId, selectedRange) => {
  if (!selectedRange || selectedRange === 'All') return true
  const iso = row.original.createdAtISO
  if (!iso) return false
  const cellDate = new Date(iso)
  if (isNaN(cellDate.getTime())) return false
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const endOfToday   = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  switch (selectedRange) {
    case 'Today':
      return cellDate >= startOfToday && cellDate < endOfToday
    case 'Last 7 Days': {
      const s = new Date(now); s.setDate(now.getDate() - 7)
      return cellDate >= s && cellDate < endOfToday
    }
    case 'Last 30 Days': {
      const s = new Date(now); s.setDate(now.getDate() - 30)
      return cellDate >= s && cellDate < endOfToday
    }
    case 'This Year': {
      const s = new Date(now.getFullYear(), 0, 1)
      const e = new Date(now.getFullYear() + 1, 0, 1)
      return cellDate >= s && cellDate < e
    }
    default:
      return true
  }
}



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
}

export default function OrdersTable({ orders, ishipEnabled = false, vocab, stageFilter }: Props) {
  const router = useRouter()
  const [globalFilter,   setGlobalFilter]   = useState('')
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
    const label = o ? `ออเดอร์ ${formatOrderNo(o.publicToken, o.createdAtISO)}` : 'ออเดอร์นี้'
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
        router.refresh()
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
              <p className="mb-0 line-clamp-1 text-sm font-semibold text-default-900">{it.name}</p>
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
        return (
          <>
            <div className="space-y-2.5">{shown.map(line)}</div>
            {rest.length > 0 && (
              <details className="group mt-2">
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
        return (
          <>
            <p className="mb-0 flex items-center gap-1 text-sm font-semibold text-default-900">
              {row.original.buyerUsername && (
                <Icon icon="rosette-discount-check-filled" className="shrink-0 text-sm text-primary" />
              )}
              <span className="truncate">{displayName}</span>
              {/* ประวัติกับร้านเป็น icon ท้ายชื่อ ไม่ใช่ป้ายข้อความ (user สั่ง 2026-08-06)
                  ชื่อ icon + เกณฑ์เสี่ยง user เคาะเอง ไม่ได้เดา (HR12)
                  title = คำอธิบายตอนชี้ค้าง — icon ล้วนที่ไม่มีคำอธิบายคือปริศนา */}
              {/* icon ล้วนสีเทาจมหายไปกับชื่อ (user บอก 2026-08-06 ว่า "ไม่เด่นเลย") →
                  ใส่พื้นอ่อน bg-{semantic}/15 + หมึกคู่ -ink ตาม idiom badge ของ Paces
                  ทั้งคู่ทรงเดียวกัน เพราะเป็นชุดเดียวกัน = "ประวัติลูกค้ากับร้าน" */}
              {stats && stats.orders <= 1 && (
                <span
                  className="bg-info/15 text-info-ink inline-flex size-5 shrink-0 items-center justify-center rounded-full"
                  title="ลูกค้าใหม่ — สั่งครั้งแรกกับร้าน"
                >
                  <Icon icon="sparkles" className="text-sm" />
                </span>
              )}
              {stats && stats.cancelled >= 2 && (
                <span
                  className="bg-warning/15 text-warning-ink inline-flex size-5 shrink-0 items-center justify-center rounded-full"
                  title={`เคยยกเลิก ${stats.cancelled} ครั้ง`}
                >
                  <Icon icon="flag" className="text-sm" />
                </span>
              )}
            </p>
            {/* select-all: คลิกเดียวเลือกทั้งเบอร์ ไม่ต้องลาก */}
            <p className="mb-0 select-all text-xs tabular-nums text-default-500">
              {row.original.buyerPhone ?? row.original.buyer}
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
    {
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
            ) : (
              <p className="mb-0 text-xs text-default-400">ยังไม่มีที่อยู่</p>
            )}
            <div className="border-default-200 mt-2 border-t border-dashed pt-2">
              {hasCourier ? (
                /* hover ที่บล็อกนี้ = การ์ดสถานะพัสดุเต็ม + ยิงถาม iShip สด (user สั่ง 2026-08-06) */
                <ShipmentHoverCard
                  stage={row.original.shippingStage}
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
                    <p className="mb-0 flex items-center gap-1 text-xs font-semibold tabular-nums text-default-700">
                      <span className="select-all">{s!.trackingNo}</span>
                      <CopyLinkButton
                        value={s!.trackingNo}
                        label="คัดลอกเลขพัสดุ"
                        successMessage="คัดลอกเลขพัสดุแล้ว"
                        iconOnly
                        className="btn-sm border-none bg-transparent p-0 text-default-400 hover:bg-transparent hover:text-default-800"
                      />
                    </p>
                  )}
                  {/* ไทม์ไลน์อยู่ในการ์ดเดียวกับชื่อขนส่ง — user ทักว่า "order เดียวกัน hover
                      ได้ 2 ที่" เพราะเดิมมันอยู่นอกการ์ดแล้วเปิด panel เล็กของตัวเอง
                      plain = วาดแค่จุด ปล่อยให้การ์ดเต็มเป็นคนอธิบาย */}
                  <div className="mt-1.5">
                    <MiniShipmentTimeline
                      stage={row.original.shippingStage}
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
    },

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
      header: 'ยอดคำสั่งซื้อ',
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
          ...(cancelled ? [{ label: 'ยกเลิกคำสั่งซื้อ', done: true, danger: true }] : []),
          { label: 'ยืนยันการจัดส่ง', done: o.status === 'SHIPPED' || o.status === 'CONFIRMED' },
          ...(isCODPayment(o.paymentMethod)
            ? [{ label: 'รับเงินปลายทาง', done: Boolean(o.codReceivedAtISO) }]
            : []),
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
    data: orders,
    columns,
    state: { sorting, globalFilter, columnFilters, pagination, rowSelection },
    // createdAtISO = คอลัมน์กรองอย่างเดียว ไม่ต้องโผล่เป็นคอลัมน์จริง (วันที่อยู่บนแถบหัวกลุ่ม)
    initialState: { columnVisibility: { createdAtISO: false } },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    onPaginationChange: setPagination,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: 'includesString',
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
        {/* ซ้าย: search */}
        <div className="flex gap-2.5">
          <div className="input-icon-group">
            <Icon icon="search" className="input-icon" />
            <input
              type="text"
              className="form-input"
              placeholder="ค้นหาออเดอร์..."
              value={globalFilter}
              onChange={(e) => {
                setGlobalFilter(e.target.value)
                setPagination((p) => ({ ...p, pageIndex: 0 }))
              }}
            />
          </div>
        </div>

        {/* กลาง: กรอง: + Single Button Dropdown (สถานะ/ประเภท/ช่วงเวลา) + page size
            Base: theme/paces/Admin/TS/src/app/(admin)/ui/dropdowns/page.tsx (SingleButtonDropdowns)
            ใช้ FilterDropdown (custom React + theme .dropdown-item) — ไม่ใช่ native select */}
        {/* toolbar ใหม่ (user อนุมัติ mockup 2026-08-06): ตัดป้าย "กรอง:" ทิ้ง — ปุ่มมี icon+ชื่อ
            ในตัว ไม่ต้องมีป้ายบอกอีกชั้น · ตัวกรองพัสดุย้ายจากแถบชิปมาอยู่แถวเดียวกัน */}
        <div className="flex flex-wrap items-center gap-2.5 lg:flex-nowrap">
          {/* สถานะ */}
          <FilterDropdown
            icon="truck"
            defaultLabel="สถานะ"
            resetValue="All"
            value={(filterColumn('status')?.getFilterValue() as string) ?? 'All'}
            options={STATUS_FILTER_OPTIONS}
            onChange={(v) => {
              filterColumn('status')?.setFilterValue(v === 'All' ? undefined : v)
              setPagination((p) => ({ ...p, pageIndex: 0 }))
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

          {/* ขนส่ง — ตัวเลือกมาจากออเดอร์จริงของร้าน (user สั่ง 2026-08-06) */}
          {courierOptions.length > 1 && (
            <FilterDropdown
              icon="truck-delivery"
              defaultLabel="ขนส่ง"
              resetValue="All"
              value={(filterColumn('shipTo')?.getFilterValue() as string) ?? 'All'}
              options={courierOptions}
              onChange={(v) => {
                filterColumn('shipTo')?.setFilterValue(v === 'All' ? undefined : v)
                setPagination((p) => ({ ...p, pageIndex: 0 }))
              }}
            />
          )}

          {/* ช่วงเวลา */}
          <FilterDropdown
            icon="calendar"
            defaultLabel="ช่วงเวลา"
            resetValue="All"
            value={(filterColumn('createdAtISO')?.getFilterValue() as string) ?? 'All'}
            options={[
              { value: 'All', label: 'ทั้งหมด' },
              { value: 'Today', label: 'วันนี้' },
              { value: 'Last 7 Days', label: '7 วันที่ผ่านมา' },
              { value: 'Last 30 Days', label: '30 วันที่ผ่านมา' },
              { value: 'This Year', label: 'ปีนี้' },
            ]}
            onChange={(v) => {
              filterColumn('createdAtISO')?.setFilterValue(v === 'All' ? undefined : v)
              setPagination((p) => ({ ...p, pageIndex: 0 }))
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

      {/* ─── DataTable ───────────────────────────────────────────────────────── */}
      {/* แถบหัวกลุ่มต่อ 1 ใบ — เก็บของที่เป็น "ระดับใบ" ไว้ที่นี่แทนที่จะเบียดเป็นคอลัมน์ผอม
          (เลขออเดอร์ / ที่มา / วันที่) ดูเหตุผลเต็มที่คอมเมนต์เหนือ columns */}
      <DataTable<OrderRow>
        table={table}
        emptyMessage="ไม่พบออเดอร์"
        groupRow={(row) => (
          /* w-9 (36px) ไม่ใช่ w-11: คอลัมน์ checkbox กว้าง 44px ก็จริง แต่ td ของแถบหัว
             มี padding-left 18px ขณะที่ช่องสินค้ามี 10px — ต่างกัน 8px พอดี (วัดจริงบน
             prod: โลโก้ 327 / รูปสินค้า 319) เอา 44-8 = 36 จึงตรงแนวทั้งรูปสินค้าและ
             หัวคอลัมน์ "รายการสินค้า" (user สั่ง 2026-08-06)
             ต้องเป็นกล่องแยกที่ไม่มี gap ตามหลัง ไม่ใช่ item ธรรมดาใน flex gap-x เพราะ
             gap จะบวกเพิ่มแล้วเลยแนวไปอีก */
          <div className="flex items-center">
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
              <OrderSourceLogo
                logoUrl={row.original.sourceLogoUrl ?? null}
                channel={row.original.salesChannel}
                size="xs"
              />
              <Link
                href={`/orders/${row.original.publicToken}`}
                className="text-sm font-bold tabular-nums text-primary hover:underline"
              >
                {formatOrderNo(row.original.publicToken, row.original.createdAtISO)}
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
