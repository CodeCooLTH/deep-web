'use client'

/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/form/elements/components/ChecksRadioSwitches.tsx
 *   line 355-381 (Radio Toggle pattern — peer hidden + label.btn)
 * Base: theme/paces/Admin/TS/src/app/(admin)/components/accordion/page.tsx
 *   (Preline data-hs-collapse pattern — control ด้วย React state แทนเพื่อกัน hydration race)
 *
 * Domain component — ไม่มี 1:1 Paces theme equivalent
 *   SafePay-specific capability flags (fulfillmentMode / billingMode) ที่ derive จาก product-types registry
 *   "ตั้งค่าขั้นสูง" collapsible section — user ส่วนใหญ่ใช้ default จาก type picker
 *   advanced user override ค่านี้ได้โดยตรง
 */

import type { UseFormRegister, FieldErrors } from 'react-hook-form'
import { useState } from 'react'
import { FULFILLMENT_MODES, BILLING_MODES } from '@/lib/product-types/registry'
import type { ProductFormV2Values } from './ProductFormV2.types'

interface ProductCapabilityCardV2Props {
  register: UseFormRegister<ProductFormV2Values>
  errors: FieldErrors<ProductFormV2Values>
}

const FULFILLMENT_LABEL: Record<string, string> = {
  SHIPPED: 'ต้องจัดส่ง',
  NO_SHIPPING: 'ไม่ต้องจัดส่ง',
}
const BILLING_LABEL: Record<string, string> = {
  ONE_TIME: 'จ่ายครั้งเดียว',
  RECURRING: 'เก็บเป็นรอบ',
}

export default function ProductCapabilityCardV2({
  register,
  errors,
}: ProductCapabilityCardV2Props) {
  const [open, setOpen] = useState(false)

  return (
    <div className="px-3 py-2.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-default-700 hover:text-dark inline-flex items-center gap-1.5 text-xs font-medium"
        aria-expanded={open}
        aria-controls="v2-capability-panel"
      >
        <span className="text-base leading-none">⚙️</span>
        ตั้งค่าขั้นสูง
        <span className="text-default-400">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div id="v2-capability-panel" className="mt-3 space-y-3">
          <fieldset>
            <legend className="text-default-700 mb-1.5 text-xs font-semibold">การจัดส่ง</legend>
            <div className="flex flex-wrap items-center gap-1.5">
              {FULFILLMENT_MODES.map((mode) => {
                const elemId = `v2-fulfillment-${mode.toLowerCase()}`
                return (
                  <div key={mode}>
                    <input
                      type="radio"
                      id={elemId}
                      value={mode}
                      className="peer hidden"
                      {...register('fulfillmentMode')}
                    />
                    <label
                      htmlFor={elemId}
                      className="btn btn-xs border-default-300 text-default-700 peer-checked:bg-primary peer-checked:border-primary cursor-pointer min-h-8 rounded-full px-2.5 text-xs peer-checked:text-white"
                    >
                      {FULFILLMENT_LABEL[mode]}
                    </label>
                  </div>
                )
              })}
            </div>
            {errors.fulfillmentMode && (
              <p className="text-danger mt-1 text-sm">{errors.fulfillmentMode.message}</p>
            )}
          </fieldset>

          <fieldset>
            <legend className="text-default-700 mb-1.5 text-xs font-semibold">การเก็บเงิน</legend>
            <div className="flex flex-wrap items-center gap-1.5">
              {BILLING_MODES.map((mode) => {
                const elemId = `v2-billing-${mode.toLowerCase()}`
                return (
                  <div key={mode}>
                    <input
                      type="radio"
                      id={elemId}
                      value={mode}
                      className="peer hidden"
                      {...register('billingMode')}
                    />
                    <label
                      htmlFor={elemId}
                      className="btn btn-xs border-default-300 text-default-700 peer-checked:bg-primary peer-checked:border-primary cursor-pointer min-h-8 rounded-full px-2.5 text-xs peer-checked:text-white"
                    >
                      {BILLING_LABEL[mode]}
                    </label>
                  </div>
                )
              })}
            </div>
            {errors.billingMode && (
              <p className="text-danger mt-1 text-sm">{errors.billingMode.message}</p>
            )}
          </fieldset>
        </div>
      )}
    </div>
  )
}
