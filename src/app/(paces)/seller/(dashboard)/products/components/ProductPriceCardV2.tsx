'use client'

// Base: theme/paces/Admin/TS/src/app/(admin)/form/elements/components/ChecksRadioSwitches.tsx
//   line 322-381 (peer hidden + label.btn + peer-checked:bg-primary toggle pattern — quick-pick chips)
// Base: theme/paces/Admin/TS/src/app/(admin)/form/elements/components/InputGroup.tsx
//   line 35-40 (input-group + input-group-text pattern — แต่ override เป็น inline borderless)
// Layout override: marketplace-style — ฿ inline, ไม่มี label, chips เล็ก scrollable
import type { UseFormRegister, FieldErrors, UseFormSetValue } from 'react-hook-form'
import { useState } from 'react'
import type { ProductFormV2Values } from './ProductFormV2.types'

const QUICK_PICK_PRICES = [49, 99, 199, 299, 499, 999] as const

interface ProductPriceCardV2Props {
  register: UseFormRegister<ProductFormV2Values>
  errors: FieldErrors<ProductFormV2Values>
  setValue: UseFormSetValue<ProductFormV2Values>
}

export default function ProductPriceCardV2({
  register,
  errors,
  setValue,
}: ProductPriceCardV2Props) {
  // chip state แยกจาก form (ไม่อยู่ใน schema) — แค่ visual selected
  const [selectedChip, setSelectedChip] = useState<number | null>(null)

  const handleChipClick = (price: number) => {
    setSelectedChip(price)
    setValue('price', price, { shouldValidate: true, shouldTouch: true })
  }

  const priceField = register('price', { valueAsNumber: true })

  return (
    <div className="px-3 py-2.5">
      <label htmlFor="v2-price" className="sr-only">
        ราคา
      </label>
      <div className="flex items-center gap-1">
        <span className="text-dark text-base font-bold">฿</span>
        <input
          id="v2-price"
          type="number"
          step="0.01"
          min="0.01"
          inputMode="decimal"
          className="text-dark placeholder:text-default-400 focus:border-primary block w-full min-h-11 border-0 border-b-2 border-transparent bg-transparent px-0 text-base font-medium outline-hidden focus:ring-0"
          placeholder="ราคา*"
          aria-describedby={errors.price ? 'v2-price-error' : undefined}
          {...priceField}
          onChange={(e) => {
            priceField.onChange(e)
            if (selectedChip !== null) setSelectedChip(null)
          }}
        />
      </div>
      {errors.price && (
        <p id="v2-price-error" className="text-danger mt-1 text-sm">
          {errors.price.message}
        </p>
      )}

      {/* Quick-pick chips — scroll horizontal, btn-xs compact (gap-1.5, min-h-8) */}
      <div className="-mx-3 mt-2 overflow-x-auto px-3 pb-1">
        <div className="flex w-max items-center gap-1.5">
          {QUICK_PICK_PRICES.map((price) => {
            const id = `v2-chip-${price}`
            const checked = selectedChip === price
            return (
              <div key={price}>
                <input
                  type="radio"
                  name="v2-price-chip"
                  id={id}
                  value={price}
                  checked={checked}
                  onChange={() => handleChipClick(price)}
                  className="peer hidden"
                />
                <label
                  htmlFor={id}
                  className="btn btn-xs border-default-300 text-default-700 peer-checked:bg-primary peer-checked:border-primary cursor-pointer min-h-8 rounded-full px-2.5 text-xs peer-checked:text-white"
                >
                  ฿{price}
                </label>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
