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
import { useEffect, useState } from 'react'
import { resolveBuyerBaseUrl } from '@/lib/buyer-url'
import { PAYMENT_LABELS, PAYMENT_ICONS, type OrderItemRow, type OrderRow } from './data'
import { formatOrderNo } from '@/lib/order-no'
import BuyerAvatar from './BuyerAvatar'
import CopyLinkButton from '@/app/(paces)/seller/(dashboard)/orders/[token]/components/CopyLinkButton'
import HoverPanel from './HoverPanel'
import MiniShipmentTimeline from './MiniShipmentTimeline'
import OrderSourceLogo from './OrderSourceLogo'
import { courierInitials, courierLogoUrl } from '@/lib/iship/courier'
import { SHIPPING_STAGE_LABEL, resolveOrderStatusBadge } from '@/lib/order-stage'
import OrderActions from './OrderActions'
import BulkActionBar from './BulkActionBar'
import FilterDropdown from '@/components/safepay/FilterDropdown'
import { useRouter } from 'next/navigation'
import { pacesConfirm } from '@/lib/paces-swal'
import { pacesToast } from '@/lib/paces-toast'
import { ORDER_STATUS_META } from '@/lib/order-display'

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
   * ─── คอลัมน์ (ตารางแบบแถวจัดกลุ่ม — user อนุมัติ mockup 2026-08-06) ─────────
   *
   * เดิมเป็น 12 คอลัมน์ผอม ๆ ซึ่งวัดจริงบน prod แล้วต้องการความกว้าง 1691px แต่จอที่ร้าน
   * ใช้จริงให้พื้นที่แค่ ~1250px (แถบข้างกิน 285px คงที่) ผลคือเบราว์เซอร์บีบคอลัมน์จน
   * ตัดกลางคำ — ภาษาไทยไม่มีช่องว่างระหว่างคำ "เก็บเงินปลายทาง" จึงกลายเป็น "เก็บ/ปลาย/ทาง"
   * และแถวสูง 88px แทนที่จะเป็น 66px (วัดทุกความกว้างตั้งแต่ 1024 ถึง 1800 = พังหมด)
   *
   * ทางที่ไม่เอา (ลองแล้ววัดแล้ว):
   *   - ใส่ whitespace-nowrap เฉย ๆ → ตารางกว้าง 1691px แล้ว scroll แนวนอนทุกความกว้าง
   *     (= แบบที่ iShip ทำ ซึ่ง user บอกเองว่าใช้ยาก และของเขาก็ยังตัดบรรทัดอยู่ดี)
   *   - ซ่อนคอลัมน์เป็นชั้นตามความกว้าง → ต้องซ่อน "ที่มา" ด้วย ซึ่ง user ไม่ยอม
   *     (อยากเห็นตลอดว่าออเดอร์มาจากเพจไหน แพลตฟอร์มไหน)
   *
   * ที่เลือก: ย้ายข้อมูล "ระดับใบ" (เลขออเดอร์ / ที่มา / วันที่) ขึ้นไปอยู่แถบหัวกลุ่ม
   * ที่กินเต็มความกว้างแถว แล้วเหลือคอลัมน์อ้วน 6 ช่องที่ใช้แนวตั้งได้อย่างตั้งใจ
   * ผลที่วัดจาก mockup ที่คอมไพล์ด้วย CSS จริง: ต้องการ 1013px (จาก 1691px)
   */
  const columns = [
    // ─ checkbox select ─
    // เซลล์ในแถวเนื้อหาว่างโดยเจตนา: ตัวติ๊กจริงย้ายไปอยู่แถบหัวกลุ่ม (groupRow ข้างล่าง)
    // ที่นี่เหลือไว้เพื่อกันคอลัมน์ให้ตรงกับ checkbox เลือกทั้งหน้าบนหัวตาราง
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

    // ─ รายการสินค้า (hover = panel รายการเต็ม) ─
    columnHelper.accessor('items', {
      header: 'รายการสินค้า',
      enableSorting: false,
      meta: { cellClassName: 'min-w-56 align-top' },
      cell: ({ row }) => {
        const items = row.original.items
        if (!items || items.length === 0) {
          return <span className="text-default-400 text-sm">—</span>
        }
        const first = items[0]
        const extra = items.length - 1
        // ป้ายใน hover panel ต้องเป็นตัวเดียวกับคอลัมน์ "สถานะ" — เดิมอ่าน status ดิบทั้งคู่
        // แต่คนละบรรทัด พอแก้จุดเดียวจะเหลือใบที่พูดสองอย่างในแถวเดียวกัน
        const cfg = resolveOrderStatusBadge(row.original.status, row.original.shippingStage)
        // เกิน 5 ชิ้นตัดเหลือ 5 + บรรทัดสรุป — จงใจไม่ scroll ใน panel (hover แล้วต้องเลื่อน
        // scroll = เมาส์หลุดนิดเดียว panel หุบ) · ยอดสุทธิเป็นยอดจริงทั้งใบเสมอ
        const visible = items.slice(0, 5)
        const hiddenCount = items.length - visible.length
        const thumb = (it: OrderItemRow, size: string) =>
          it.imageUrl ? (
            <Image
              src={it.imageUrl}
              alt={it.name}
              width={44}
              height={44}
              className={`${size} rounded-lg object-cover`}
            />
          ) : (
            <span className={`bg-default-100 text-default-400 flex ${size} shrink-0 items-center justify-center rounded-lg`}>
              <Icon icon="package" className="text-lg" />
            </span>
          )
        return (
          <HoverPanel
            width={320}
            trigger={
              <div className="flex gap-2.5">
                {thumb(first, 'size-11')}
                <div className="min-w-0">
                  <p className="mb-0 line-clamp-2 text-sm font-semibold text-default-900">{first.name}</p>
                  <p className="mb-0 text-xs text-default-500">
                    x{first.qty} · ฿{first.price.toLocaleString('th-TH')} ต่อชิ้น
                  </p>
                  {extra > 0 && <p className="mb-0 mt-0.5 text-xs text-primary">+{extra} รายการ</p>}
                </div>
              </div>
            }
          >
            <div className="border-default-200 flex items-center gap-2 border-b p-3">
              <span className="text-default-900 min-w-0 truncate text-sm font-semibold">
                {formatOrderNo(row.original.publicToken, row.original.createdAtISO)}
              </span>
              <span className={`badge ms-auto shrink-0 ${cfg.cls}`}>
                <Icon icon={cfg.icon} aria-hidden="true" />
                {cfg.label}
              </span>
            </div>
            <div className="px-3 pt-2">
              <p className="text-default-700 mb-0 flex items-center gap-1.5 text-xs">
                <Icon icon="calendar" className="text-sm" aria-hidden="true" />
                {formatDateTime(row.original.createdAtISO)}
              </p>
              <p className="text-default-900 mb-0 mt-2 text-xs font-semibold">
                รายการ ({items.length})
              </p>
            </div>
            <ul className="divide-default-100 mb-0 list-none divide-y p-0">
              {visible.map((it) => (
                <li key={it.id} className="flex items-center gap-2.5 px-3 py-2">
                  {thumb(it, 'size-9')}
                  <span className="text-default-800 min-w-0 flex-1 truncate text-sm">{it.name}</span>
                  <span className="text-default-700 text-2xs shrink-0">x{it.qty}</span>
                  <span className="text-default-900 shrink-0 text-sm font-medium tabular-nums">
                    ฿{(it.price * it.qty).toLocaleString('th-TH')}
                  </span>
                </li>
              ))}
            </ul>
            {hiddenCount > 0 && (
              <p className="border-default-100 text-default-700 mb-0 border-t px-3 py-2 text-xs">
                +อีก {hiddenCount} รายการ — เปิดดูทั้งหมดที่หน้าออเดอร์
              </p>
            )}
            <div className="border-default-200 flex items-center justify-between border-t px-3 py-2.5">
              <span className="text-default-700 text-sm">ยอดรวมสุทธิ</span>
              <span className="text-primary text-sm font-bold tabular-nums">
                ฿{row.original.total.toLocaleString('th-TH')}
              </span>
            </div>
          </HoverPanel>
        )
      },
    }),

    // ─ ที่อยู่จัดส่ง ─
    // ชื่อลูกค้าย้ายขึ้นแถบหัวกลุ่มแล้ว (user 2026-08-06) ที่นี่จึงเหลือเบอร์ + ปลายทาง
    // ไม่ซ้ำกับหัวกลุ่ม — ข้อมูลเดียวกันโผล่สองที่ในแถวเดียวคือการกินพื้นที่เปล่า
    // ที่อยู่เพิ่งโผล่ในตารางรอบนี้ (เดิมต้องเปิดเข้าไปดูทีละใบ) ระดับตำบลเท่านั้น —
    // ดูเหตุผลเรื่อง PII ที่ OrderRow.shipTo
    columnHelper.accessor('buyerName', {
      header: 'ที่อยู่จัดส่ง',
      meta: { cellClassName: 'min-w-44 align-top' },
      cell: ({ row }) => (
        <>
          <p className="mb-0 inline-flex items-center gap-1.5 text-sm tabular-nums text-default-800">
            <Icon icon="phone" className="text-sm text-default-500" aria-hidden="true" />
            {row.original.buyerPhone ?? row.original.buyer}
          </p>
          {row.original.shipTo ? (
            <p className="mb-0 mt-1 text-xs leading-relaxed text-default-700">{row.original.shipTo}</p>
          ) : (
            <p className="mb-0 mt-1 text-xs text-default-400">ยังไม่มีที่อยู่</p>
          )}
        </>
      ),
    }),

    // ─ การจัดส่ง (ขนส่ง + เลขพัสดุ + ไทม์ไลน์ เรียงลงมาในช่องเดียว) ─
    //   สามอย่างนี้เดิมเป็น 3 คอลัมน์กิน 427px ทั้งที่ถูกอ่านพร้อมกันเสมอในงาน "ตามเลขพัสดุ"
    //   เลขพัสดุอ่านจาก 2 ตารางแล้วที่ page.tsx (ส่งเอง vs iShip — one-value-many-entry-points)
    {
      id: 'shipping',
      header: 'การจัดส่ง',
      enableSorting: false,
      enableColumnFilter: false,
      meta: { cellClassName: 'min-w-44 align-top' },
      cell: ({ row }: { row: TableRow<OrderRow> }) => {
        const s = row.original.shipment
        const stage = row.original.shippingStage
        if (!s || (!s.courierName && !s.courierCode)) {
          return (
            <>
              <span className="text-sm text-default-400">ยังไม่มีพัสดุ</span>
              <div className="mt-2">
                <MiniShipmentTimeline
                  stage={stage}
                  hasShipment={false}
                  cancelled={row.original.status === 'CANCELLED'}
                />
              </div>
            </>
          )
        }
        const logo = courierLogoUrl(s.courierCode, s.courierName)
        return (
          <>
            <div className="flex items-center gap-2">
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logo}
                  alt=""
                  /* object-contain + ring: โลโก้ 2:1 (Fuze) ห้ามครอป, พื้นขาวต้องมีขอบ (pattern OrderCard) */
                  className="ring-default-200 size-7 shrink-0 rounded-lg bg-white object-contain ring-1"
                />
              ) : (
                <span className="bg-default-100 text-default-700 flex size-7 shrink-0 items-center justify-center rounded-lg text-2xs font-bold">
                  {courierInitials(s.courierName, s.courierCode)}
                </span>
              )}
              <div className="min-w-0">
                <p className="mb-0 truncate text-sm font-medium text-default-800">
                  {s.courierName ?? s.courierCode}
                </p>
                {/* ห้าม font-mono (Anuphan ไม่มี mono จะ fallback หลุดธีม) — tabular-nums พอ
                    ไม่ truncate: เลขพัสดุต้องอ่านครบทุกตัวถึงจะเอาไปพิมพ์ตามต่อได้ */}
                {s.trackingNo && (
                  <p className="mb-0 text-xs font-semibold tabular-nums text-default-700">
                    {s.trackingNo}
                  </p>
                )}
              </div>
            </div>
            <div className="mt-2">
              <MiniShipmentTimeline
                stage={stage}
                hasShipment={Boolean(s.trackingNo)}
                cancelled={row.original.status === 'CANCELLED'}
              />
            </div>
          </>
        )
      },
    },

    // ─ การชำระเงิน (วิธีจ่าย + ยอด + เงินเข้าหรือยัง อยู่ด้วยกันเพราะเป็นเรื่องเดียวกัน) ─
    columnHelper.accessor('paymentMethod', {
      header: 'การชำระเงิน',
      meta: { cellClassName: 'min-w-36 align-top' },
      cell: ({ row }) => {
        const pm = row.original.paymentMethod
        // "รอเงิน COD" มาจาก SSOT เดียวกับป้ายสถานะและไทล์ Command Center — ไม่คิดเงื่อนไขเอง
        const awaitingCod = row.original.shippingStage === 'AWAITING_COD'
        return (
          <>
            {pm ? (
              <p className="mb-0 inline-flex items-center gap-1.5 whitespace-nowrap text-sm text-default-800">
                <Icon icon={PAYMENT_ICONS[pm] ?? 'wallet'} className="text-base text-default-500" />
                {PAYMENT_LABELS[pm] ?? pm}
              </p>
            ) : (
              <p className="mb-0 text-sm text-default-400">—</p>
            )}
            <p className="mb-0 mt-1 text-base font-bold tabular-nums text-default-900">
              ฿{row.original.total.toLocaleString('th-TH')}
            </p>
            {awaitingCod && (
              <p className="mb-0 text-xs font-semibold text-warning-ink">ยังไม่ได้รับเงิน</p>
            )}
          </>
        )
      },
    }),

    // ─ สถานะ ─
    columnHelper.accessor('status', {
      header: 'สถานะ',
      filterFn: 'equalsString',
      enableColumnFilter: true,
      meta: { cellClassName: 'min-w-40 align-top' },
      cell: ({ row }) => {
        const cfg = resolveOrderStatusBadge(row.original.status, row.original.shippingStage)
        const stage = row.original.shippingStage
        // บรรทัดรองบอกสถานะพัสดุ **เฉพาะเมื่อมันพูดคนละเรื่องกับป้าย** — ไม่งั้นได้ป้าย
        // "กำลังจัดส่ง" ทับด้วยคำว่า "กำลังจัดส่ง" อีกบรรทัด ซึ่งไม่ได้ข้อมูลอะไรเพิ่ม
        const sub =
          stage && stage !== 'DONE' && SHIPPING_STAGE_LABEL[stage] !== cfg.label
            ? SHIPPING_STAGE_LABEL[stage]
            : null
        return (
          <>
            <span className={cn('badge whitespace-nowrap text-sm', cfg.cls)}>
              <Icon icon={cfg.icon} className="text-sm" aria-hidden="true" />
              {cfg.label}
            </span>
            {sub && <p className="mb-0 mt-1.5 text-xs text-default-500">{sub}</p>}
          </>
        )
      },
    }),

    // ─ จัดการ ─
    // variant table-grid: ปุ่มชุดเดิมครบทุกตัว แต่จัดเป็นกริด 3 คอลัมน์ — เรียงแถวเดียว
    // กิน 209px (คอลัมน์ที่กว้างที่สุดในตาราง วัดจริง) กริดเหลือ ~106px โดยไม่ต้องมีเมนู ⋮
    {
      id: 'action',
      header: () => <div>จัดการ</div>,
      meta: { headerClassName: 'w-px whitespace-nowrap', cellClassName: 'w-px whitespace-nowrap align-top' },
      cell: ({ row }: { row: TableRow<OrderRow> }) => (
        <OrderActions order={row.original} onCancelRequest={handleCancelRequest} variant="table-grid" orderNoun={vocab.noun} />
      ),
    },
  ]

  const table = useReactTable({
    data: orders,
    columns,
    state: { sorting, globalFilter, columnFilters, pagination, rowSelection },
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
            value={(table.getColumn('status')?.getFilterValue() as string) ?? 'All'}
            options={STATUS_FILTER_OPTIONS}
            onChange={(v) => {
              table.getColumn('status')?.setFilterValue(v === 'All' ? undefined : v)
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

          {/* ช่วงเวลา */}
          <FilterDropdown
            icon="calendar"
            defaultLabel="ช่วงเวลา"
            resetValue="All"
            value={(table.getColumn('createdAtISO')?.getFilterValue() as string) ?? 'All'}
            options={[
              { value: 'All', label: 'ทั้งหมด' },
              { value: 'Today', label: 'วันนี้' },
              { value: 'Last 7 Days', label: '7 วันที่ผ่านมา' },
              { value: 'Last 30 Days', label: '30 วันที่ผ่านมา' },
              { value: 'This Year', label: 'ปีนี้' },
            ]}
            onChange={(v) => {
              table.getColumn('createdAtISO')?.setFilterValue(v === 'All' ? undefined : v)
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
        groupRow={(row) => {
          const displayName =
            row.original.buyerName ?? row.original.buyerUsername ?? 'ลูกค้าทั่วไป'
          return (
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
              <input
                type="checkbox"
                className="form-checkbox form-checkbox-light size-4.5"
                checked={row.getIsSelected()}
                onChange={row.getToggleSelectedHandler()}
                aria-label="เลือกออเดอร์นี้"
              />
              {/* ลำดับตามที่ user สั่ง 2026-08-06:
                  [รูปเพจ+badge แพลตฟอร์ม] [เลขออเดอร์] [คัดลอก] [รูปลูกค้า] [ชื่อลูกค้า]
                  "ที่มา" ต้องมาก่อนเลขออเดอร์ — user ยืนยันว่าต้องเห็นตลอดว่ามาจากเพจไหน */}
              <OrderSourceLogo
                logoUrl={row.original.sourceLogoUrl ?? null}
                channel={row.original.salesChannel}
              />
              <Link
                href={`/orders/${row.original.publicToken}`}
                className="text-sm font-semibold tabular-nums text-primary hover:underline"
              >
                {formatOrderNo(row.original.publicToken, row.original.createdAtISO)}
              </Link>
              {/* คัดลอก "เลขออเดอร์" ไม่ใช่ลิงก์ — ปุ่มคัดลอกลิงก์ของผู้ซื้ออยู่ในชุดจัดการแล้ว */}
              <CopyLinkButton
                value={formatOrderNo(row.original.publicToken, row.original.createdAtISO)}
                label="คัดลอกเลขออเดอร์"
                iconOnly
                className="btn-sm border-none bg-transparent text-default-400 hover:bg-default-200 hover:text-default-800"
              />
              {row.original.isFromAuction && (
                <span className="badge bg-warning/15 text-warning-ink inline-flex items-center gap-0.5" title="จากการประมูล">
                  <Icon icon="gavel" className="size-3" />
                  ประมูล
                </span>
              )}
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <BuyerAvatar
                  src={row.original.buyerAvatar}
                  name={displayName}
                  className="size-6 shrink-0"
                />
                <span className="flex min-w-0 items-center gap-1 text-sm font-medium text-default-800">
                  {row.original.buyerUsername && (
                    <Icon icon="rosette-discount-check-filled" className="shrink-0 text-sm text-primary" />
                  )}
                  <span className="truncate">{displayName}</span>
                </span>
              </span>
              <span className="ms-auto inline-flex items-center gap-1.5 text-xs text-default-500">
                <Icon icon="calendar" className="text-sm" aria-hidden="true" />
                {formatDateTime(row.original.createdAtISO)}
              </span>
            </div>
          )
        }}
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
