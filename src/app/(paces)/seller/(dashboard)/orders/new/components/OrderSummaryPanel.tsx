/**
 * OrderSummaryPanel — sticky recap panel (ขวามือ) — ไม่มีปุ่มใด ๆ
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/components/OrderSummary.tsx
 * (+ theme/paces/Admin/TS/src/assets/css/custom/_card.css);
 * structure per docs/mockups/seller-orders/create.html RIGHT summary panel
 *
 * NOTES:
 * - อ่าน items, buyerName, discount, vatRate ผ่าน useWatch — ไม่เรียก useForm
 * - derivedType + needsShipping คำนวณจาก items + catalog (อัตโนมัติ)
 * - math ใช้ round2 helper ป้องกัน floating-point drift
 * - ไม่มีปุ่มใด ๆ ใน component นี้ (ปุ่มบันทึกอยู่แถบบนสุด — ความรับผิดชอบของ B7)
 */
'use client'

import { useMemo } from 'react'
import { useWatch } from 'react-hook-form'
import type { Control } from 'react-hook-form'
import type { CatalogProduct } from './OrderCreateForm'

// ─── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  control: Control<any>
  catalog: CatalogProduct[]
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const formatThb = (n: number) =>
  new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(n)

/** ป้องกัน floating-point drift ใน subtraction/multiplication */
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

// ─── Component ─────────────────────────────────────────────────────────────────

export default function OrderSummaryPanel({ control, catalog }: Props) {
  // อ่านทุก field ที่ต้องใช้จาก RHF control (B7 เป็น owner ของ useForm)
  const items: Array<{
    productId?: string
    name: string
    qty: number
    price: number
  }> = useWatch({ control, name: 'items' }) ?? []

  const buyerName: string = useWatch({ control, name: 'buyerName' }) ?? ''
  const discount: number | undefined = useWatch({ control, name: 'discount' })
  const vatRate: number | undefined = useWatch({ control, name: 'vatRate' })

  // ── derivedType: PHYSICAL → SERVICE → DIGITAL (priority order) ─────────────
  // logic: ถ้ามีสินค้าใดที่ไม่มี productId หรือ catalog.type === 'PHYSICAL' → PHYSICAL
  //        else ถ้ามี SERVICE → SERVICE; else DIGITAL
  const derivedType = useMemo<'PHYSICAL' | 'SERVICE' | 'DIGITAL'>(() => {
    const hasPhysical = items.some((item) => {
      if (!item.productId) return true // custom item → PHYSICAL
      return catalog.find((p) => p.id === item.productId)?.type === 'PHYSICAL'
    })
    if (hasPhysical) return 'PHYSICAL'
    const hasService = items.some(
      (item) => item.productId && catalog.find((p) => p.id === item.productId)?.type === 'SERVICE',
    )
    if (hasService) return 'SERVICE'
    return 'DIGITAL'
  }, [items, catalog])

  // ── needsShipping: SHIPPED catalog item หรือ custom item ───────────────────
  const needsShipping = useMemo(() => {
    return items.some((item) => {
      if (!item.productId) return true
      return catalog.find((p) => p.id === item.productId)?.fulfillmentMode === 'SHIPPED'
    })
  }, [items, catalog])

  // ── Summary math (LOCKED) ──────────────────────────────────────────────────
  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + (Number(item?.qty) || 0) * (Number(item?.price) || 0), 0),
    [items],
  )
  const discountVal = discount ?? 0
  const vatBase = subtotal - discountVal
  const vatAmount = round2(vatBase * ((vatRate ?? 0) / 100))
  const total = round2(vatBase + vatAmount)

  // จำนวนรายการรวม (Σ qty)
  const totalQty = items.reduce((sum, item) => sum + (Number(item?.qty) || 0), 0)

  // ── Thai labels ────────────────────────────────────────────────────────────
  const typeLabel: Record<string, string> = {
    PHYSICAL: 'สินค้าจริง',
    DIGITAL: 'ดิจิทัล',
    SERVICE: 'บริการ',
  }
  const typeBadgeClass: Record<string, string> = {
    PHYSICAL: 'bg-warning/15 text-warning',
    DIGITAL: 'bg-info/15 text-info',
    SERVICE: 'bg-success/15 text-success',
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  // card sticky — parked ใต้ FullscreenPageHeader (sticky top-0, สูง ~70px + mb-6)
  // ต้อง lg:top-24 (96px) ไม่ใช่ top-2: scroll container คือ <main overflow-y-auto>
  // ที่ทั้ง header + panel stick ด้วยกัน → top-2 (8px) ทำให้หัวการ์ดมุดหลัง header
  return (
    <div className="card lg:sticky lg:top-24">
      {/* header */}
      <div className="card-header">
        <h4 className="card-title font-semibold text-dark">สรุปออเดอร์</h4>
      </div>

      {/* body */}
      <div className="card-body space-y-3 text-sm">

        {/* ลูกค้า (mockup line 165-168) */}
        <div className="flex items-center justify-between">
          <span className="text-default-500">ลูกค้า</span>
          <span className="font-medium text-default-700">
            {buyerName.trim() || 'ยังไม่เลือก'}
          </span>
        </div>

        {/* ประเภทออเดอร์ (อัตโนมัติ) (mockup line 169-172) */}
        <div className="flex items-center justify-between">
          <span className="text-default-500">
            ประเภทออเดอร์{' '}
            <span className="text-2xs text-default-400">(อัตโนมัติ)</span>
          </span>
          {items.length > 0 ? (
            <span className={`badge ${typeBadgeClass[derivedType] ?? 'bg-default-200 text-default-600'}`}>
              {typeLabel[derivedType] ?? derivedType}
            </span>
          ) : (
            <span className="badge bg-default-200 text-default-600">—</span>
          )}
        </div>

        {/* การจัดส่ง (mockup line 173-176) */}
        <div className="flex items-center justify-between">
          <span className="text-default-500">การจัดส่ง</span>
          <span className="font-medium text-default-700">
            {items.length === 0 ? '—' : needsShipping ? 'ต้องจัดส่ง' : 'ไม่ต้องจัดส่ง'}
          </span>
        </div>

        {/* จำนวนรายการ Σ qty (mockup line 177-180) */}
        <div className="flex items-center justify-between">
          <span className="text-default-500">จำนวนรายการ</span>
          <span className="font-medium text-default-700">{totalQty}</span>
        </div>

        {/* divider + breakdown (mockup line 181-186) */}
        <div className="border-t border-default-300 pt-3 space-y-2">

          {/* ยอดสินค้า */}
          <div className="flex items-center justify-between">
            <span className="text-default-600">ยอดสินค้า</span>
            <span className="font-medium text-default-700">{formatThb(subtotal)}</span>
          </div>

          {/* ส่วนลด — แสดงเฉพาะเมื่อ discountVal > 0 */}
          {discountVal > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-default-600">ส่วนลด</span>
              <span className="font-medium text-danger">− {formatThb(discountVal)}</span>
            </div>
          )}

          {/* VAT — แสดงเฉพาะเมื่อ vatRate > 0 */}
          {(vatRate ?? 0) > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-default-600">VAT {vatRate}%</span>
              <span className="font-medium text-default-700">+ {formatThb(vatAmount)}</span>
            </div>
          )}

          {/* ยอดรวมทั้งหมด (bold) */}
          <div className="flex items-center justify-between pt-1 border-t border-default-200">
            <span className="font-bold text-dark">ยอดรวมทั้งหมด</span>
            <span className="text-lg font-bold text-dark">{formatThb(total)}</span>
          </div>
        </div>

        {/* hint (mockup line 187) */}
        <p className="hint text-center text-default-400 text-xs">
          ระบบสรุปประเภทออเดอร์จากสินค้าที่เลือกอัตโนมัติ — ปุ่มบันทึกอยู่แถบบนสุด
        </p>

      </div>
    </div>
  )
}
