'use client'

// Base: theme/paces/Admin/TS/src/app/(admin)/form/elements/components/ChecksRadioSwitches.tsx
//   line 355-381 (Radio Toggle — peer hidden + <label className="btn ...peer-checked:bg-primary">)
// Layout: marketplace-style segmented control — inline pills, scroll-x
// Options derive จาก registry — เพิ่ม type ใหม่ใน registry → picker pickup auto

import type { UseFormRegister, FieldErrors, UseFormSetValue, UseFormWatch } from 'react-hook-form'
import { useEffect, useRef } from 'react'
import {
  PRODUCT_TYPES,
  PRODUCT_TYPE_IDS,
  deriveCapabilityDefaults,
} from '@/lib/product-types/registry'
import type { ProductFormV2Values } from './ProductFormV2.types'

interface ProductTypePickerCardV2Props {
  register: UseFormRegister<ProductFormV2Values>
  errors: FieldErrors<ProductFormV2Values>
  setValue: UseFormSetValue<ProductFormV2Values>
  watch: UseFormWatch<ProductFormV2Values>
}

export default function ProductTypePickerCardV2({
  register,
  errors,
  setValue,
  watch,
}: ProductTypePickerCardV2Props) {
  // Sync capability flags เมื่อ user เปลี่ยน type — set defaults จาก registry.
  // Use case: user เลือก SUBSCRIPTION → fulfillmentMode auto NO_SHIPPING + billingMode RECURRING.
  // user เปลี่ยน manual ใน CapabilityCardV2 ภายหลังได้ — code นี้ trigger เฉพาะตอน type change.
  const type = watch('type')
  const lastSyncedType = useRef(type)
  useEffect(() => {
    if (type !== lastSyncedType.current) {
      const caps = deriveCapabilityDefaults(type)
      setValue('fulfillmentMode', caps.fulfillmentMode, { shouldDirty: true })
      setValue('billingMode', caps.billingMode, { shouldDirty: true })
      setValue('billingPeriod', caps.billingPeriod, { shouldDirty: true })
      lastSyncedType.current = type
    }
  }, [type, setValue])

  return (
    <div className="px-3 py-2.5">
      <div className="-mx-3 overflow-x-auto px-3">
        <div className="flex w-max items-center gap-1.5">
          {PRODUCT_TYPE_IDS.map((id) => {
            const meta = PRODUCT_TYPES[id]
            const elemId = `v2-type-${id.toLowerCase()}`
            return (
              <div key={id}>
                <input
                  type="radio"
                  id={elemId}
                  value={id}
                  className="peer hidden"
                  {...register('type')}
                />
                <label
                  htmlFor={elemId}
                  aria-label={meta.ariaLabel}
                  title={meta.ariaLabel}
                  className="btn btn-xs border-default-300 text-default-700 peer-checked:bg-primary peer-checked:border-primary cursor-pointer min-h-9 rounded-full px-3 text-xs peer-checked:text-white"
                >
                  <span className="mr-1">{meta.emoji}</span>
                  {meta.label}
                </label>
              </div>
            )
          })}
        </div>
      </div>
      {errors.type && <p className="text-danger mt-1 text-sm">{errors.type.message}</p>}
    </div>
  )
}
