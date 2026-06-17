'use client'

/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/form/elements/components/ChecksRadioSwitches.tsx
 *   line 355-381 (Radio Toggle pattern — peer hidden + label.btn + peer-checked:bg-primary)
 *
 * Domain component — ไม่มี 1:1 Paces theme equivalent
 *   SafePay-specific billing period selector (MONTHLY/YEARLY/CUSTOM)
 *   Conditional render — แสดงเฉพาะเมื่อ billingMode === 'RECURRING'
 *   CUSTOM period เปิด input จำนวนวัน (billingPeriodDays)
 *   Schema enforcement อยู่ใน ProductFormV2.tsx (Yup when() condition)
 */

import type { UseFormRegister, FieldErrors, UseFormWatch } from 'react-hook-form'
import { BILLING_PERIODS } from '@/lib/product-types/registry'
import type { ProductFormV2Values } from './ProductFormV2.types'

interface ProductBillingPeriodCardV2Props {
  register: UseFormRegister<ProductFormV2Values>
  errors: FieldErrors<ProductFormV2Values>
  watch: UseFormWatch<ProductFormV2Values>
}

const PERIOD_LABEL: Record<string, string> = {
  MONTHLY: 'รายเดือน',
  YEARLY: 'รายปี',
  CUSTOM: 'กำหนดเอง',
}

export default function ProductBillingPeriodCardV2({
  register,
  errors,
  watch,
}: ProductBillingPeriodCardV2Props) {
  const billingMode = watch('billingMode')
  const billingPeriod = watch('billingPeriod')

  if (billingMode !== 'RECURRING') return null

  return (
    <div className="px-3 py-2.5">
      <fieldset>
        <legend className="text-default-700 mb-1.5 text-xs font-semibold">รอบเก็บเงิน</legend>
        <div className="flex flex-wrap items-center gap-1.5">
          {BILLING_PERIODS.map((period) => {
            const elemId = `v2-period-${period.toLowerCase()}`
            return (
              <div key={period}>
                <input
                  type="radio"
                  id={elemId}
                  value={period}
                  className="peer hidden"
                  {...register('billingPeriod')}
                />
                <label
                  htmlFor={elemId}
                  className="btn btn-xs border-default-300 text-default-700 peer-checked:bg-primary peer-checked:border-primary cursor-pointer min-h-11 rounded-full px-2.5 text-xs peer-checked:text-white"
                >
                  {PERIOD_LABEL[period]}
                </label>
              </div>
            )
          })}
        </div>
        {errors.billingPeriod && (
          <p className="text-danger mt-1 text-sm">{errors.billingPeriod.message}</p>
        )}
      </fieldset>

      {billingPeriod === 'CUSTOM' && (
        <div className="mt-3">
          <label htmlFor="v2-period-days" className="text-default-700 mb-1 block text-xs font-semibold">
            ทุกๆ กี่วัน
          </label>
          <input
            id="v2-period-days"
            type="number"
            min="1"
            max="365"
            inputMode="numeric"
            {...register('billingPeriodDays', { valueAsNumber: true })}
            className="border-default-300 focus:border-primary block w-32 rounded-md border bg-white px-3 py-2 text-base outline-hidden focus:ring-0"
            placeholder="เช่น 7"
          />
          {errors.billingPeriodDays && (
            <p className="text-danger mt-1 text-sm">{errors.billingPeriodDays.message}</p>
          )}
        </div>
      )}
    </div>
  )
}
