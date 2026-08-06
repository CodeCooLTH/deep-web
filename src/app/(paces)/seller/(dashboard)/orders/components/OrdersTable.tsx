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

  // ─── columns (adapt จาก theme; ปรับ field ให้ตรง OrderRow) ───────────────
  const columns = [
    // ─ checkbox select ─
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
      cell: ({ row }: { row: TableRow<OrderRow> }) => (
        <input
          type="checkbox"
          className="form-checkbox form-checkbox-light size-4.5"
          checked={row.getIsSelected()}
          onChange={row.getToggleSelectedHandler()}
        />
      ),
      enableSorting: false,
      enableColumnFilter: false,
    },

    // ─ ที่มา (โลโก้เพจ/แพลตฟอร์ม — user สั่ง 2026-08-06) ─
    {
      id: 'source',
      header: 'ที่มา',
      enableSorting: false,
      enableColumnFilter: false,
      cell: ({ row }: { row: TableRow<OrderRow> }) => (
        <OrderSourceLogo
          logoUrl={row.original.sourceLogoUrl ?? null}
          channel={row.original.salesChannel}
        />
      ),
    },

    // ─ เลขออเดอร์ ─
    columnHelper.accessor('id', {
      header: 'เลขออเดอร์',
      cell: ({ row }) => (
        <h5 className="flex items-center gap-1.5 text-sm font-medium">
          <Link href={`/orders/${row.original.publicToken}`} className="hover:text-primary">
            {formatOrderNo(row.original.publicToken, row.original.createdAtISO)}
          </Link>
          {row.original.isFromAuction && (
            <span className="badge bg-warning/15 text-warning inline-flex items-center gap-0.5" title="จากการประมูล">
              <Icon icon="gavel" className="size-3" />
              ประมูล
            </span>
          )}
        </h5>
      ),
    }),

    // ─ ลูกค้า ─
    columnHelper.accessor('buyerName', {
      header: 'ลูกค้า',
      cell: ({ row }) => {
        const { buyerName, buyer, buyerPhone, buyerUsername, buyerAvatar } = row.original
        const displayName = buyerName ?? 'ลูกค้า'
        return (
          <div className="flex items-center gap-3">
            {/* รูป buyer (User.avatar) + fallback ตัวอักษรแรก */}
            <BuyerAvatar src={buyerAvatar} name={displayName} />
            <div className="min-w-0">
              {/* verified check หน้าชื่อ + channel icon ท้ายชื่อ (inline flex กัน icon เด้งลงบรรทัด) */}
              {/* icon ช่องทางท้ายชื่อถูกถอด (user 2026-08-06) — ช่องทางมีคอลัมน์ "ที่มา" ของตัวเองแล้ว */}
              <p className="flex items-center gap-1 font-medium text-default-900">
                {buyerUsername && (
                  <Icon icon="rosette-discount-check-filled" className="shrink-0 text-sm text-primary" />
                )}
                <span className="truncate">{displayName}</span>
              </p>
              <p className="text-xs text-default-400">
                {/* แสดงเบอร์จริง (seller เห็นลูกค้าตัวเอง) หรือ masked contact */}
                {buyerPhone ?? buyer}
              </p>
            </div>
          </div>
        )
      },
    }),

    // ─ สินค้า (hover = panel รายการสินค้าเต็ม — user อนุมัติ mockup 2026-08-06) ─
    columnHelper.accessor('items', {
      header: 'สินค้า',
      enableSorting: false,
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
              width={36}
              height={36}
              className={`${size} rounded-lg object-cover`}
            />
          ) : (
            <span className={`bg-default-100 text-default-400 flex ${size} shrink-0 items-center justify-center rounded-lg`}>
              <Icon icon="package" className="text-sm" />
            </span>
          )
        return (
          <HoverPanel
            width={320}
            trigger={
              <div className="flex items-center gap-2.5">
                {thumb(first, 'size-9')}
                <div>
                  <p className="line-clamp-1 text-sm font-medium text-default-900">{first.name}</p>
                  {extra > 0 && <p className="text-xs text-default-400">+{extra} รายการ</p>}
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

    // ─ ยอดรวม ─
    columnHelper.accessor('total', {
      header: 'ยอดรวม',
      cell: ({ row }) => (
        <span className="tabular-nums text-sm font-semibold text-default-900">
          ฿{row.original.total.toLocaleString('th-TH')}
        </span>
      ),
    }),

    // ─ การชำระเงิน ─
    columnHelper.accessor('paymentMethod', {
      header: 'การชำระเงิน',
      cell: ({ row }) => {
        const pm = row.original.paymentMethod
        if (!pm) return <span className="text-sm text-default-400">—</span>
        return (
          <span className="inline-flex items-center gap-1.5 text-sm text-default-700">
            <Icon icon={PAYMENT_ICONS[pm] ?? 'wallet'} className="text-base text-default-500" />
            {PAYMENT_LABELS[pm] ?? pm}
          </span>
        )
      },
    }),

    // ─ ขนส่ง (โลโก้+ชื่อ — user สั่ง 2026-08-06; เลขพัสดุอ่านจาก 2 ตารางแล้วที่ page.tsx) ─
    {
      id: 'courier',
      header: 'ขนส่ง',
      enableSorting: false,
      enableColumnFilter: false,
      cell: ({ row }: { row: TableRow<OrderRow> }) => {
        const s = row.original.shipment
        if (!s || (!s.courierName && !s.courierCode)) {
          return <span className="text-sm text-default-400">—</span>
        }
        const logo = courierLogoUrl(s.courierCode, s.courierName)
        return (
          <span className="inline-flex items-center gap-2">
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
            <span className="max-w-32 truncate text-sm text-default-700">
              {s.courierName ?? s.courierCode}
            </span>
          </span>
        )
      },
    },

    // ─ เลขพัสดุ ─
    {
      id: 'trackingNo',
      header: 'เลขพัสดุ',
      enableSorting: false,
      enableColumnFilter: false,
      cell: ({ row }: { row: TableRow<OrderRow> }) => {
        const t = row.original.shipment?.trackingNo
        if (!t) return <span className="text-sm text-default-400">—</span>
        // ห้าม font-mono (Anuphan ไม่มี mono จะ fallback หลุดธีม) — tabular-nums พอ
        return <span className="text-sm font-medium tabular-nums text-default-900">{t}</span>
      },
    },

    // ─ สถานะพัสดุ (mini timeline icon ล้วน — user สั่ง 2026-08-06) ─
    {
      id: 'shippingTimeline',
      header: 'พัสดุ',
      enableSorting: false,
      enableColumnFilter: false,
      cell: ({ row }: { row: TableRow<OrderRow> }) => (
        <MiniShipmentTimeline
          stage={row.original.shippingStage}
          hasShipment={Boolean(row.original.shipment?.trackingNo)}
          cancelled={row.original.status === 'CANCELLED'}
        />
      ),
    },

    // ─ วันที่/เวลา ─
    columnHelper.accessor('createdAtISO', {
      header: 'วันที่/เวลา',
      filterFn: dateRangeFilterFn,
      enableColumnFilter: true,
      cell: ({ row }) => (
        <span className="text-sm text-default-700">
          {formatDateTime(row.original.createdAtISO)}
        </span>
      ),
    }),

    // ─ สถานะ ─
    columnHelper.accessor('status', {
      header: 'สถานะ',
      filterFn: 'equalsString',
      enableColumnFilter: true,
      // w-px + nowrap = คอลัมน์หดพอดีความยาวป้าย (pattern เดียวกับคอลัมน์ "จัดการ" ข้างล่าง)
      // ไม่งั้น TanStack บีบคอลัมน์จนป้ายตัดบรรทัด — วัดจากจอจริง 1440px: "รอดำเนินการ"
      // แตกเป็น 3 บรรทัด ("รอ/ดำเนิน/การ") ซึ่งอ่านไม่ออกว่าเป็นคำเดียว
      meta: { headerClassName: 'w-px whitespace-nowrap', cellClassName: 'w-px whitespace-nowrap' },
      cell: ({ row }) => {
        const cfg = resolveOrderStatusBadge(row.original.status, row.original.shippingStage)
        // text-sm: `.badge` เป็น text-[0.75em] อิงพ่อ → ในเซลล์ตารางเหลือ ~10.5px เล็กกว่า
        // ทุกคอลัมน์ข้างเคียง (ยอดรวม/การชำระเงิน/วันที่ ตั้ง text-sm ไว้เอง) — user บอกว่า
        // "ตัวเล็กไป ไม่เด่น" (2026-08-06). utility layer ชนะ component layer จึง override ได้
        // ตรง ๆ ไม่ต้องแก้ _badge.css (ซึ่งจะลาก badge ทุกใบทั้งระบบไปด้วย)
        // icon: มีอยู่ใน SSOT (resolveOrderStatusBadge) มาตลอดแต่ไม่เคยถูกวาด — ไม่ได้เดาเลือกใหม่
        return (
          <span className={cn('badge whitespace-nowrap text-sm', cfg.cls)}>
            <Icon icon={cfg.icon} className="text-sm" aria-hidden="true" />
            {cfg.label}
          </span>
        )
      },
    }),

    // ─ action ─
    // meta: w-px + whitespace-nowrap → column หดพอดีความกว้างปุ่ม (ไม่กินพื้นที่เกิน)
    {
      id: 'action',
      header: () => <div>จัดการ</div>,
      meta: { headerClassName: 'w-px whitespace-nowrap', cellClassName: 'w-px whitespace-nowrap' },
      cell: ({ row }: { row: TableRow<OrderRow> }) => (
        // centralized OrderActions (ชุดเดียวกับ mobile card) — variant table = icon only
        <OrderActions order={row.original} onCancelRequest={handleCancelRequest} variant="table" orderNoun={vocab.noun} />
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
      <DataTable<OrderRow> table={table} emptyMessage="ไม่พบออเดอร์" />

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
