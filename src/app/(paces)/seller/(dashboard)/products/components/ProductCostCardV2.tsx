'use client'

/**
 * Base: src/app/(paces)/seller/(dashboard)/products/components/ProductStockCardV2.tsx
 *   (card shell `px-3 py-2.5` — in-project, ไม่มี 1:1 theme equivalent)
 * Base: src/app/(paces)/seller/(dashboard)/business/[shopId]/onboarding/components/BusinessOnboardingWizard.tsx:364-378
 *   (input-group ฿ pattern — `<div className="input-group"><span className="input-group-text">฿</span><input className="form-input"></div>`)
 * Base: src/app/(paces)/seller/(dashboard)/inventory/page.tsx:170-181
 *   (badge `bg-primary/15 text-primary inline-flex items-center gap-1` + icon lock pattern)
 * Base: src/app/(paces)/seller/(dashboard)/products/components/ProductStockCardV2.tsx:110-119
 *   (upsell hint — icon lock + text-default-400 + ลิงก์ font-bold underline — ตรงเป๊ะ)
 *
 * Domain component — ไม่มี 1:1 Paces theme equivalent (ระบุไว้แล้วใน
 * UX-Design-Spec.md §B Theme Source Mapping)
 *
 * costEditAllowed (feature 00016 Expense & Cost Tracking, D-9):
 *   false → field disabled + badge upsell "อัปเกรดเป็น Business" + hint ลิงก์ /business
 *   true  → field ปกติ + margin display คำนวณ client-side จาก watch('price')/watch('cost')
 *   field แสดงเสมอ ไม่ซ่อนแบบ lowStockThreshold (ต่าง PRO-gate pattern — user ยืนยันแล้ว)
 */

import type { UseFormRegister, FieldErrors, UseFormWatch } from 'react-hook-form'
import Icon from '@/components/wrappers/Icon'
import Link from 'next/link'
import type { ProductFormV2Values } from './ProductFormV2.types'

interface ProductCostCardV2Props {
  register: UseFormRegister<ProductFormV2Values>
  errors: FieldErrors<ProductFormV2Values>
  watch: UseFormWatch<ProductFormV2Values>
  // costEditAllowed — Expense & Cost Tracking (feature 00016): gate จาก isCostEditAllowed(shop)
  // resolve ที่ RSC parent (new-v2/page.tsx / [id]/edit/page.tsx) mirror isProActive
  costEditAllowed: boolean
}

export default function ProductCostCardV2({
  register,
  errors,
  watch,
  costEditAllowed,
}: ProductCostCardV2Props) {
  const price = watch('price')
  const cost = watch('cost')

  // margin คำนวณ client-side only (ไม่ยิง API) — แสดงเมื่อกรอกครบทั้ง price+cost
  const hasMargin =
    costEditAllowed &&
    typeof price === 'number' &&
    !Number.isNaN(price) &&
    price > 0 &&
    typeof cost === 'number' &&
    !Number.isNaN(cost)
  const marginAmount = hasMargin ? price - cost : 0
  const marginPercent = hasMargin ? (marginAmount / price) * 100 : 0

  return (
    <div className="px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor="v2-cost" className="text-dark text-sm font-medium">
          ราคาทุน
        </label>
        {!costEditAllowed && (
          <span className="badge bg-primary/15 text-primary inline-flex items-center gap-1">
            <Icon icon="lock" className="size-3.5" aria-hidden="true" />
            อัปเกรดเป็น Business
          </span>
        )}
      </div>

      <div className="input-group mt-2">
        <span className="input-group-text">฿</span>
        <input
          id="v2-cost"
          type="number"
          step="0.01"
          min="0"
          inputMode="decimal"
          className="form-input"
          placeholder="0.00"
          disabled={!costEditAllowed}
          aria-describedby={errors.cost ? 'v2-cost-error' : undefined}
          {...register('cost', {
            // ว่าง → submit null (ไม่ตั้งราคาทุน); มีค่า → number
            setValueAs: (v) => (v === '' || v === null || v === undefined ? null : Number(v)),
          })}
        />
      </div>
      {errors.cost && (
        <p id="v2-cost-error" className="text-danger mt-1 text-sm">
          {errors.cost.message}
        </p>
      )}

      {costEditAllowed && hasMargin && (
        <p className={`mt-1 text-xs font-medium ${marginAmount > 0 ? 'text-success' : 'text-danger'}`}>
          กำไรต่อชิ้น: ฿{marginAmount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (
          {marginPercent.toLocaleString('th-TH', { maximumFractionDigits: 0 })}%)
        </p>
      )}

      {!costEditAllowed && (
        <p className="text-default-400 mt-1 flex items-center gap-1.5 text-xs">
          <Icon icon="lock" className="size-3.5 shrink-0" aria-hidden="true" />
          <span>
            ราคาทุนเป็นฟีเจอร์ Business Package —{' '}
            <Link href="/business" className="text-primary font-bold underline hover:no-underline">
              อัปเกรดเพื่อดูกำไรต่อสินค้า →
            </Link>
          </span>
        </p>
      )}
    </div>
  )
}
