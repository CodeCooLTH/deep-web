/**
 * ProductsListing — orchestrator: seller product list (desktop table + mobile card view)
 *
 * v11 rewrite (2026-08-06): มือถือย้ายจาก mobileCard เดิม (แถวใน `.card` แม่ใบใหญ่ผ่าน DataTable)
 * → การ์ดแยกใบแบบเดียวกับ /orders (user ชี้เองว่า "ใช้งานง่าย") เพราะปุ่ม 3 ปุ่มเดิมกินความกว้าง
 * เกือบครึ่งจอจนชื่อสินค้าถูกตัด และปุ่มลบสีแดงเด่นกว่าปุ่มหลัก (ลำดับชั้นกลับด้าน)
 *
 * โครง:
 *   - desktop (≥lg): ProductsTable (แยกไฟล์ — ตาราง useReactTable เดิมทั้งชุด ไม่เปลี่ยน logic)
 *   - mobile/tablet (<lg): sticky header (back/search/filter/bell/+เพิ่มสินค้า) + แถวชิปสถานะนับจำนวน
 *     + ProductCard list พร้อม lazy-load (IntersectionObserver, PAGE=8, ไม่มี pagination)
 *   - filter modal: full-screen เลือกเฉพาะ "ประเภทสินค้า" (สถานะอยู่บนชิปแล้ว ไม่ซ้ำในโมดัล)
 *
 * state ที่นี่ (data/pinState) เป็น single source ให้ทั้ง ProductsTable + ProductCard ใช้ร่วมกัน —
 * handlePinChange / handleActiveToggle / handleDeleteRequest ทั้งหมดอยู่ที่นี่ที่เดียว ไม่ให้
 * มือถือ/เดสก์ท็อปมีทางแก้ข้อมูลคนละชุด
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(products)/products/components/ProductsListing.tsx
 * Mobile header/chips/filter-modal structural template:
 *   src/app/(paces)/seller/(dashboard)/orders/components/OrdersList.tsx
 *   (ก็อป header layout back/search/filter/bell + full-bleed wrapper + filter modal pattern)
 */

'use client'

import Icon from '@/components/wrappers/Icon'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLockBodyScroll } from '@/hooks/useLockBodyScroll'
import { useRouter, useSearchParams } from 'next/navigation'
import { cn } from '@/utils/helpers'
import { pacesToast } from '@/lib/paces-toast'
import { pacesConfirm } from '@/lib/paces-swal'
import { PRODUCT_TYPE_LABELS, isMissingCost, type ProductRow } from './data'
import { type PinChangeResult } from './PinToggleButton'
import ProductCard from './ProductCard'
import ProductsTable from './ProductsTable'
import SellerEmptyState from '../../_shared/SellerEmptyState'

const PAGE = 8 // จำนวนต่อรอบ lazy-load (มือถือ)

const STATUS_CHIPS: { key: 'all' | 'active' | 'inactive'; label: string }[] = [
  { key: 'all', label: 'ทั้งหมด' },
  { key: 'active', label: 'เปิดขาย' },
  { key: 'inactive', label: 'ปิดการขาย' },
]

// ตัวเลือกในโมดัลตัวกรอง — ใช้ PRODUCT_TYPE_LABELS SSOT เดียวกับตาราง/การ์ด (data.ts)
const TYPE_OPTIONS = [
  { value: '', label: 'ทุกประเภท' },
  { value: 'PHYSICAL', label: PRODUCT_TYPE_LABELS.PHYSICAL },
  { value: 'DIGITAL', label: PRODUCT_TYPE_LABELS.DIGITAL },
  { value: 'SERVICE', label: PRODUCT_TYPE_LABELS.SERVICE },
  { value: 'SUBSCRIPTION', label: PRODUCT_TYPE_LABELS.SUBSCRIPTION },
]

type Props = {
  products: ProductRow[]
  /** feature 00013 Pin Products — aggregate state ต่อร้าน (seed จาก server ครั้งเดียว) */
  pinSlots: number
  pinnedCount: number
}

const ProductsListing = ({ products, pinSlots, pinnedCount }: Props) => {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [data, setData] = useState<ProductRow[]>(() => [...products])
  const [pinState, setPinState] = useState({ pinSlots, pinnedCount })

  // ─── mobile toolbar state ──────────────────────────────────────────────────
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [activeChip, setActiveChip] = useState<'all' | 'active' | 'inactive'>('all')
  // ตัวกรอง "ยังไม่ตั้งต้นทุน" เป็น **คนละแกน** กับชิปสถานะขาย (all/active/inactive) จึงเป็น
  // state แยก ไม่ใช่สมาชิกตัวที่ 4 ของ STATUS_CHIPS — ถ้ายัดรวมกัน การกดอันนี้จะล้างตัวกรอง
  // สถานะขายทิ้งโดยที่ผู้ใช้ไม่ได้สั่ง
  //
  // ค่าเริ่มต้นอ่านจาก ?cost=missing เพื่อรับ deep-link จาก badge "ต้นทุนไม่ครบ" บนการ์ดกำไร
  // ในหน้ารายละเอียดออเดอร์ — ทำให้คำเตือนที่นั่นมีปลายทางจริง ไม่ใช่ป้ายที่กดอะไรไม่ได้
  const [costMissingOnly, setCostMissingOnly] = useState(
    () => searchParams.get('cost') === 'missing',
  )
  const [filterOpen, setFilterOpen] = useState(false)
  const [visibleCount, setVisibleCount] = useState(PAGE)

  /**
   * โมดัลตัวกรองข้างล่างเป็น overlay เต็มจอที่ประกอบเองด้วย React state จึงต้องตรึง scroll เอง
   * (docs/conventions/overlay-scroll-lock.md) — ส่ง filterOpen ไม่ใช่ true ตายตัว เพราะ
   * component นี้ถูก render ค้างไว้ตลอด ไม่ได้ mount เฉพาะตอนเปิด
   */
  useLockBodyScroll(filterOpen)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  // ─── pin toggle (feature 00013 — เดิมอยู่ที่นี่แล้ว) ────────────────────────
  const handlePinChange = (result: PinChangeResult) => {
    setData((prev) =>
      prev.map((p) => (p.id === result.productId ? { ...p, pinnedAt: result.pinnedAt } : p)),
    )
    setPinState({ pinSlots: result.pinSlots, pinnedCount: result.pinnedCount })
  }

  /**
   * เปิด/ปิดการขาย — optimistic update
   *
   * หมายเหตุสำคัญ: product.service.ts:351 มี business rule เดิมอยู่แล้ว (BR-PIN-11 auto-unpin):
   * `if (data.isActive === false) scalarUpdate.pinnedAt = null` แต่ PATCH /api/products/[id]
   * ตอบด้วย serializeProduct() ซึ่งไม่มี field pinnedAt เลย — client ไม่มีทางรู้จาก response
   * ว่า pin หลุดไปแล้ว ต้องคำนวณ pinnedAt/pinnedCount เองในจังหวะเดียวกับ isActive
   * ไม่งั้นการ์ดจะค้างไอคอนปักหมุด + badge "ปักหมุด n/m" ผิดจนกว่าจะรีโหลดหน้า
   */
  const handleActiveToggle = async (productId: string, nextIsActive: boolean) => {
    const target = data.find((p) => p.id === productId)
    if (!target) return
    const prevIsActive = target.isActive
    const prevPinnedAt = target.pinnedAt
    const willAutoUnpin = !nextIsActive && prevPinnedAt !== null

    setData((prev) =>
      prev.map((p) =>
        p.id === productId
          ? { ...p, isActive: nextIsActive, pinnedAt: willAutoUnpin ? null : p.pinnedAt }
          : p,
      ),
    )
    if (willAutoUnpin) setPinState((s) => ({ ...s, pinnedCount: Math.max(0, s.pinnedCount - 1) }))

    try {
      const res = await fetch(`/api/products/${productId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: nextIsActive }),
      })
      if (!res.ok) throw new Error('toggle failed')
      pacesToast.success(nextIsActive ? 'เปิดขายแล้ว' : 'ปิดการขายแล้ว')
      router.refresh()
    } catch {
      // rollback ทั้ง isActive + pinnedAt (+ pinnedCount ถ้า optimistic auto-unpin ไปแล้ว)
      setData((prev) =>
        prev.map((p) => (p.id === productId ? { ...p, isActive: prevIsActive, pinnedAt: prevPinnedAt } : p)),
      )
      if (willAutoUnpin) setPinState((s) => ({ ...s, pinnedCount: s.pinnedCount + 1 }))
      pacesToast.error(nextIsActive ? 'เปิดขายไม่สำเร็จ กรุณาลองใหม่' : 'ปิดการขายไม่สำเร็จ กรุณาลองใหม่')
    }
  }

  // ─── delete (Swal confirm) — ใช้ร่วมกันทั้ง ⋮ มือถือ (ProductCardMenu) และปุ่มลบตารางเดสก์ท็อป ───
  const handleDeleteRequest = async (productId: string) => {
    const ok = await pacesConfirm.danger('ลบสินค้านี้?', 'สินค้าจะถูกลบถาวร · ย้อนกลับไม่ได้', {
      confirmButtonText: 'ลบสินค้า',
    })
    if (!ok) return
    try {
      const res = await fetch(`/api/products/${productId}`, { method: 'DELETE' })
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        pacesToast.error(errBody?.error ?? 'ลบสินค้าไม่สำเร็จ')
        return
      }
      setData((prev) => prev.filter((p) => p.id !== productId))
      pacesToast.success('ลบสินค้าแล้ว')
      router.refresh()
    } catch {
      pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
    }
  }

  // ─── ตัวนับชิป — มาจาก data ทั้งชุดเสมอ ไม่ผูกกับคำค้น (เหมือน StageChips ของ /orders) ───────
  const allCount = data.length
  const activeCount = useMemo(() => data.filter((p) => p.isActive).length, [data])
  const inactiveCount = allCount - activeCount
  const chipCount: Record<'all' | 'active' | 'inactive', number> = {
    all: allCount,
    active: activeCount,
    inactive: inactiveCount,
  }
  // นับจากก้อนดิบทั้งร้านเหมือนตัวนับอื่นในไฟล์นี้ — ไม่ผูกกับคำค้น/ชิปสถานะ เพราะคำถามคือ
  // "ทั้งร้านยังเหลือกี่ตัวที่ยังไม่ตั้งต้นทุน" ไม่ใช่ "ในผลลัพธ์ที่กรองอยู่ตอนนี้เหลือกี่ตัว"
  const missingCostCount = useMemo(() => data.filter(isMissingCost).length, [data])

  // ─── filter pipeline (มือถือ) ────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = data
    if (activeChip === 'active') list = list.filter((p) => p.isActive)
    else if (activeChip === 'inactive') list = list.filter((p) => !p.isActive)
    if (typeFilter) list = list.filter((p) => p.type === typeFilter)
    if (costMissingOnly) list = list.filter(isMissingCost)
    if (search.trim()) {
      const q = search.toLowerCase().trim()
      list = list.filter((p) => p.name.toLowerCase().includes(q))
    }
    return list
  }, [data, activeChip, typeFilter, costMissingOnly, search])

  // reset lazy-load เมื่อ filter/search/chip เปลี่ยน
  useEffect(() => {
    setVisibleCount(PAGE)
  }, [activeChip, typeFilter, costMissingOnly, search])

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

  // จุดแดงบนปุ่มตัวกรอง — เฉพาะแกนที่ไม่ได้อยู่บนแถวชิป (สถานะอยู่บนชิปแล้ว ไม่นับซ้ำ)
  const activeFilterCount = typeFilter ? 1 : 0

  // empty state — แยก 3 สาเหตุ (ไม่มีสินค้าเลย / กรองชิปแล้วไม่เจอ / ค้นหาไม่เจอ)
  const emptyState =
    data.length === 0
      ? { title: 'ยังไม่มีสินค้าในร้าน', showCta: true }
      : search.trim() !== '' && filtered.length === 0
        ? { title: 'ไม่พบสินค้าที่ค้นหา', showCta: false }
        : // กรอง "ยังไม่ตั้งต้นทุน" แล้วไม่เหลืออะไร = ข่าวดี ไม่ใช่ทางตัน — ต้องพูดให้ตรง
          // ไม่ใช่ "ไม่มีสินค้าในสถานะนี้" ซึ่งอ่านเหมือนกรองพลาด (คำค้นชนะเสมอ เพราะผู้ใช้
          // เพิ่งพิมพ์ ควรตอบเรื่องที่เพิ่งทำล่าสุดก่อน จึงอยู่หลังเงื่อนไข search ด้านบน)
          costMissingOnly && filtered.length === 0
          ? { title: 'ตั้งต้นทุนครบทุกสินค้าแล้ว', showCta: false }
          : filtered.length === 0
            ? { title: 'ไม่มีสินค้าในสถานะนี้', showCta: false }
          : null

  return (
    <>
      {/* ─── Desktop (≥lg): ตารางแบบ Paces theme ─────────────────────────────── */}
      <div className="hidden lg:block">
        <ProductsTable
          initialCostMissing={costMissingOnly}
          products={data}
          pinSlots={pinState.pinSlots}
          pinnedCount={pinState.pinnedCount}
          onPinChange={handlePinChange}
          onDeleteRequest={handleDeleteRequest}
        />
      </div>

      {/* ─── Mobile/Tablet (<lg): การ์ดแยกใบ ─────────────────────────────────── */}
      <div className="lg:hidden">
        {/* phone: full-bleed (-mx-4 หักล้าง shell padding); tablet+ (md): center + max-width

            🛑 เพดานเดิมคือ `md:max-w-2xl` (672px) ⇒ บน iPad แนวตั้งเหลือขอบว่างข้างละ 20–65px
            ผู้ใช้อ่านว่า "หน้าจอไม่เต็ม" (user ทัก 2026-08-19 พร้อมสกรีนช็อต iPad)

            ทำไมเป็น 4xl (896px) ไม่ใช่ถอดเพดานทิ้ง:
              · การ์ดรายการนี้แสดงเฉพาะ `<lg` (≥1024 สลับเป็นตารางเดสก์ท็อป) ⇒ ความกว้าง
                ที่ใช้ได้สูงสุด = 1023 − 32 (padding ของ shell) = 991px
              · iPad ที่เข้าช่วงนี้จริงคือแนวตั้ง 744–834pt ⇒ เนื้อที่ 712–802px **ต่ำกว่า 896
                ทุกเครื่อง** ⇒ เต็มจอจริงทุกรุ่น ไม่มีขอบว่าง
              · เพดานยังอยู่เพื่อกันช่วง 928–1023px ที่การ์ดแถวเดียวจะยืดจนปุ่มท้ายแถว
                ห่างจากเนื้อหาผิดสัดส่วน — ถอดทิ้งเลยได้หน้าจอที่ "เต็ม" แต่ "โหว่ตรงกลาง"
            marker .products-fullbleed = CSS :has() scope (safepay-overrides.css) */}
        <div className="products-fullbleed -mx-4 md:mx-auto md:max-w-4xl">
          {/* pt = 1.5rem + safe-area: หน้านี้ full-bleed ไม่มี header ของ layout (SellerMobileHeader
              คืน null สำหรับ /products) และ sticky top-0 → ต้องเว้น status bar เอง (pattern เดียวกับ
              /orders — viewportFit:'cover' ตั้งแต่ 2026-08-06) */}
          <div
            data-products-header
            className="sticky top-0 z-30 bg-card px-2 pt-[calc(1.5rem+env(safe-area-inset-top))]" /* carve-out: safe-area ไม่มี token */
          >
            <div className="flex items-center gap-2">
              {/* back → /dashboard */}
              <Link
                href="/dashboard"
                aria-label="ย้อนกลับ"
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-default-700"
              >
                <Icon icon="arrow-left" className="text-xl" />
              </Link>

              {/* search — pill สีขาว */}
              <div className="relative flex-1">
                <Icon
                  icon="solar:magnifer-linear"
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-base text-default-400"
                />
                <input
                  type="text"
                  className="form-input w-full rounded-full bg-white !pl-9"
                  placeholder="ค้นหาสินค้า..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
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

              {/* เพิ่มสินค้า — ปุ่ม filled สีน้ำเงินตัวเดียวในหัวหน้า (One Voice); full-screen mode
                  ซ่อน SellerBottomNav ทั้งก้อน → FAB หายไปด้วย ถ้าไม่มีปุ่มนี้จะสร้างสินค้าไม่ได้เลยบนมือถือ */}
              <Link
                href="/products/new"
                aria-label="เพิ่มสินค้า"
                className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary text-white"
              >
                <Icon icon="plus" className="text-xl" />
              </Link>
            </div>

            {/* แถวชิป — badge ปักหมุด (non-interactive) + ชิปสถานะ 3 อัน มีตัวเลขนับทุกอัน */}
            <div className="mt-2 flex items-center gap-2 overflow-x-auto pb-2 [&::-webkit-scrollbar]:hidden"> {/* HR7: ซ่อน scrollbar ไม่มี Paces token */}
              <span className="badge bg-primary/15 text-primary inline-flex shrink-0 items-center gap-1">
                <Icon icon="tabler:pin-filled" className="size-3.5" />
                ปักหมุด {pinState.pinnedCount}/{pinState.pinSlots}
              </span>
              {/* แกนที่สอง: ไอคอนนำหน้าเหมือนชิป "ปักหมุด" ด้านบน เพื่อบอกด้วยสายตาว่านี่ไม่ใช่
                  สมาชิกของกลุ่ม tab สถานะขาย — ไฟล์นี้สร้าง precedent นั้นไว้แล้ว
                  idle ใช้ warning เมื่อยังมีของค้าง เพื่อให้เห็นว่ามีงานรอโดยไม่ต้องกดก่อน */}
              <button
                type="button"
                onClick={() => setCostMissingOnly((v) => !v)}
                aria-pressed={costMissingOnly}
                className={cn(
                  // focus-visible:ring เหมือนชิปสถานะด้านล่าง — ธีมไม่มี `.badge:focus` มาชดเชย
                  // (แก้เข้ามาที่ชิปชุดนั้นแล้วใน 052981b3 audit รอบ 2) ชิปนี้เขียนขึ้นคู่ขนาน
                  // จากแพตเทิร์นก่อนแก้ ถ้าไม่ตามจะเป็นการเอาบั๊กเดิมกลับเข้ามาในปุ่มที่นั่งติดกัน
                  'badge shrink-0 cursor-pointer whitespace-nowrap transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  'inline-flex items-center gap-1 rounded-full px-3.5 py-1.5 text-xs font-medium',
                  costMissingOnly
                    ? 'bg-primary text-white'
                    : missingCostCount > 0
                      ? 'bg-warning/15 text-warning-ink'
                      : 'bg-default-100 text-default-500',
                )}
              >
                <Icon icon="calculator" className="size-3.5" aria-hidden="true" />
                ยังไม่ตั้งต้นทุน
                {missingCostCount > 0 && (
                  <span className="ms-1 font-bold tabular-nums">{missingCostCount}</span>
                )}
              </button>
              {STATUS_CHIPS.map((chip) => {
                const active = activeChip === chip.key
                const count = chipCount[chip.key]
                return (
                  <button
                    key={chip.key}
                    type="button"
                    onClick={() => setActiveChip(active ? 'all' : chip.key)}
                    aria-pressed={active}
                    className={cn(
                      // focus-visible:ring แทน focus:outline-none ลอย ๆ — ธีมไม่มี `.badge:focus`
                      // มาชดเชย (grep `.badge` ใน src/assets/css แล้วไม่มี :focus เลย)
                      // ชิปชุดนี้ยกโครงมาจาก OrdersList.tsx ตอนทำหน้าสินค้ามือถือ 2026-08-06
                      // แล้วพาบั๊กมาด้วย — fix เข้า orders ก่อน ที่นี่ตามทีหลัง (audit รอบ 2)
                      'badge shrink-0 cursor-pointer whitespace-nowrap transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                      'rounded-full px-3.5 py-1.5 text-xs font-medium',
                      active ? 'bg-primary text-white' : 'bg-default-100 text-default-500',
                    )}
                  >
                    {chip.label}
                    {count > 0 && <span className="ms-1 font-bold tabular-nums">{count}</span>}
                  </button>
                )
              })}
            </div>
          </div>

          {/* ─── Product cards + lazy-load ──────────────────────────────────── */}
          {emptyState ? (
            <div className="card mt-3">
              <div className="card-body">
                <SellerEmptyState
                  compact
                  icon="tabler:package-off"
                  title={emptyState.title}
                  action={emptyState.showCta ? { label: '+ เพิ่มสินค้าแรก', href: '/products/new' } : undefined}
                />
              </div>
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              {visible.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  pinSlots={pinState.pinSlots}
                  pinnedCount={pinState.pinnedCount}
                  onPinChange={handlePinChange}
                  onActiveToggle={handleActiveToggle}
                  onDeleteRequest={handleDeleteRequest}
                />
              ))}

              {hasMore && (
                <div ref={sentinelRef} className="flex items-center justify-center gap-2 py-4 text-xs text-default-500">
                  <span className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  กำลังโหลด...
                </div>
              )}
              {!hasMore && filtered.length > PAGE && (
                <p className="py-3 text-center text-xs text-default-400">ครบทุกสินค้าแล้ว ({filtered.length})</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ─── Filter modal (full screen) — ประเภทสินค้าเท่านั้น (สถานะอยู่บนชิปแล้ว) ────────── */}
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
            <p className="mb-2 text-sm font-medium text-default-900">ประเภทสินค้า</p>
            <div className="space-y-1">
              {TYPE_OPTIONS.map((opt) => {
                const active = typeFilter === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setTypeFilter(opt.value)}
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
          </div>

          <div className="flex gap-2 border-t border-default-200 p-4">
            <button
              type="button"
              onClick={() => setTypeFilter('')}
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
    </>
  )
}

export default ProductsListing
