'use client'

/**
 * Base: src/app/(paces)/seller/(dashboard)/products/components/ProductStockCardV2.tsx
 *   (card shell `px-3 py-2.5` — in-project, ไม่มี 1:1 theme equivalent)
 * Base: src/app/(paces)/seller/(dashboard)/business/[shopId]/onboarding/components/BusinessOnboardingWizard.tsx:364-378
 *   (input-group ฿ pattern — `<div className="input-group"><span className="input-group-text">฿</span><input className="form-input"></div>`)
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/badges/page.tsx
 *   (soft badge `bg-{semantic}/15 text-{semantic}-ink` — แทนที่ badge lock เดิมที่ถูกถอด)
 *
 * Domain component — ไม่มี 1:1 Paces theme equivalent
 *
 * [D-EXT-1 · 2026-08-07] ถอด Business Package gate: prop `costEditAllowed` ถูกลบทั้งสาย
 * พร้อมของที่ผูกกับมันทั้งหมด (field disabled, badge "อัปเกรดเป็น Business", hint + ลิงก์ /business)
 *
 * ช่องว่างที่หัวการ์ดซึ่งเคยเป็น badge upsell **ไม่ปล่อยว่าง** — ใส่ badge มาร์จิ้นสดแทน
 * (ux Design Spec S2): เดิมสถานะ "ไม่มี badge" เจอเฉพาะร้านที่จ่ายเงินซึ่งเป็นส่วนน้อย
 * พอเปิดฟรีมันกลายเป็นสถานะที่ทุกร้านเจอ 100% พื้นที่ตรงนั้นจึงควรมีความหมายจริง
 *
 * ย้าย "สัญญาณสี" ไปอยู่ที่ badge ที่เดียว — บรรทัดกำไรต่อชิ้นด้านล่างเปลี่ยนเป็น neutral
 * (เดิมเป็น text-success/text-danger) เพื่อไม่ให้การ์ดเล็กใบเดียวมีของสีแข่งกัน 2 จุด
 * และแก้คอนทราสต์ไปด้วย: `text-success`/`text-danger` ดิบบนพื้นขาวตกเกณฑ์ AA อยู่แล้ว
 */

import type { UseFormRegister, FieldErrors, UseFormWatch } from 'react-hook-form'
import { productMargin } from '@/lib/order-profit'
import type { ProductFormV2Values } from './ProductFormV2.types'

interface ProductCostCardV2Props {
  register: UseFormRegister<ProductFormV2Values>
  errors: FieldErrors<ProductFormV2Values>
  watch: UseFormWatch<ProductFormV2Values>
}

export default function ProductCostCardV2({ register, errors, watch }: ProductCostCardV2Props) {
  const price = watch('price')
  const cost = watch('cost')

  // คำนวณ client-side ล้วน ไม่ยิง API — ใช้ฟังก์ชันเดียวกับที่หน้ารายการสินค้าใช้ (src/lib/order-profit.ts)
  // เพื่อให้ตัวเลขในฟอร์มกับในตารางมาจากสูตรเดียวกันเสมอ
  const marginPercent = productMargin({ price, cost })
  const marginAmount =
    marginPercent === null ? null : Number(price) - Number(cost)
  const isLoss = marginPercent !== null && marginPercent < 0

  return (
    <div className="px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor="v2-cost" className="text-dark text-sm font-medium">
          ราคาทุน
        </label>
        {marginPercent !== null && (
          <span
            className={`badge text-2xs font-semibold ${isLoss ? 'bg-danger/15 text-danger-ink' : 'bg-success/15 text-success-ink'}`}
          >
            มาร์จิ้น {marginPercent.toLocaleString('th-TH', { maximumFractionDigits: 1 })}%
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

      {marginAmount !== null ? (
        <p className="text-default-700 mt-1 text-xs">
          กำไรต่อชิ้น {marginAmount < 0 ? '-' : ''}฿
          {Math.abs(marginAmount).toLocaleString('th-TH', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </p>
      ) : (
        // empty state ต้องสอนว่ากรอกแล้วได้อะไร ไม่ใช่ปล่อยว่าง (operate.md)
        <p className="text-default-400 mt-1 text-xs">กรอกราคาทุนเพื่อดูกำไรต่อชิ้นอัตโนมัติ</p>
      )}
    </div>
  )
}
