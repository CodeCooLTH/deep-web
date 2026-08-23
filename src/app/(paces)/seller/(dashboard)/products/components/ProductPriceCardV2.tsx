'use client'

/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(products)/product-add/components/Pricing.tsx
 *   (card shell + base price field ด้วย input-icon-group currency pattern)
 * Base: theme/paces/Admin/TS/src/app/(admin)/form/elements/components/ChecksRadioSwitches.tsx
 *   line 322-381 (peer hidden + label.btn + peer-checked:bg-primary toggle pattern — quick-pick chips)
 * Base: theme/paces/Admin/TS/src/app/(admin)/form/elements/components/InputGroup.tsx
 *   line 35-40 (input-group + input-group-text pattern — override เป็น inline borderless)
 *
 * Domain component — ไม่มี 1:1 Paces theme equivalent สำหรับ quick-pick price chips
 *   Pricing.tsx ของ theme เป็น static select; V2 นี้เพิ่ม quick-pick chip row + billingMode-aware label
 *   Layout override: marketplace-style — ฿ inline borderless, chips เล็ก scrollable horizontal
 *   P2: placeholder + sr-only label เปลี่ยนตาม billingMode + billingPeriod (registry-aware)
 */

import type { UseFormRegister, FieldErrors, UseFormSetValue, UseFormWatch } from 'react-hook-form'
import { useState } from 'react'
import type { ProductFormV2Values } from './ProductFormV2.types'

/**
 * ราคาแนะนำ — `0` อยู่หัวแถวโดยตั้งใจ (user สั่ง 2026-08-23: "ต้องมีราคา 0 ให้ด้วย")
 *
 * 🛑 ฿0 ไม่ใช่ "ยังไม่ได้ตั้งราคา" แต่คือ **ราคาศูนย์จริง** — ของแถม/ตัวอย่างฟรี/บริการที่คิดเงิน
 * ปลายทาง · ค่า "ยังไม่ได้ตั้ง" ของช่องนี้คือช่องว่าง (`undefined`) ซึ่งยังบังคับให้กรอกเหมือนเดิม
 * สองอย่างนี้ต่างกัน และเป็นเหตุผลที่ Yup ใช้ `.min(0)` + `.required()` ไม่ใช่ปล่อยว่างได้
 */
const QUICK_PICK_PRICES = [0, 49, 99, 199, 299, 499, 999] as const

interface ProductPriceCardV2Props {
  register: UseFormRegister<ProductFormV2Values>
  errors: FieldErrors<ProductFormV2Values>
  setValue: UseFormSetValue<ProductFormV2Values>
  watch: UseFormWatch<ProductFormV2Values>
}

function derivePriceCopy(
  billingMode: ProductFormV2Values['billingMode'],
  billingPeriod: ProductFormV2Values['billingPeriod'],
): { srLabel: string; placeholder: string } {
  if (billingMode === 'RECURRING') {
    if (billingPeriod === 'MONTHLY') return { srLabel: 'ค่าบริการ บาทต่อเดือน', placeholder: 'ค่าบริการ/เดือน*' }
    if (billingPeriod === 'YEARLY') return { srLabel: 'ค่าบริการ บาทต่อปี', placeholder: 'ค่าบริการ/ปี*' }
    return { srLabel: 'ค่าบริการต่อรอบ บาท', placeholder: 'ค่าบริการ/รอบ*' }
  }
  return { srLabel: 'ราคา บาท', placeholder: 'ราคา*' }
}

export default function ProductPriceCardV2({
  register,
  errors,
  setValue,
  watch,
}: ProductPriceCardV2Props) {
  const [selectedChip, setSelectedChip] = useState<number | null>(null)

  const handleChipClick = (price: number) => {
    setSelectedChip(price)
    setValue('price', price, { shouldValidate: true, shouldTouch: true })
  }

  const priceField = register('price', { valueAsNumber: true })
  const { srLabel, placeholder } = derivePriceCopy(watch('billingMode'), watch('billingPeriod'))

  return (
    <div className="px-3 py-2.5">
      <label htmlFor="v2-price" className="sr-only">
        {srLabel}
      </label>
      <div className="flex items-center gap-1">
        <span className="text-dark text-base font-bold">฿</span>
        <input
          id="v2-price"
          type="number"
          step="0.01"
          /* 🛑 min="0" ไม่ใช่ "0.01" — ต้องตรงกับ Yup (.min(0)) และ Valibot (minValue(0)) ทั้งสามชั้น
             แก้ชั้นเดียวแล้วอีกสองชั้นค้าง = ผู้ใช้กรอก 0 ได้แต่กดบันทึกแล้วเด้ง error ที่อธิบายไม่ได้ */
          min="0"
          inputMode="decimal"
          className="text-dark placeholder:text-default-400 focus:border-primary block w-full min-h-11 border-0 border-b-2 border-transparent bg-transparent px-0 text-base font-medium outline-hidden focus:ring-0"
          placeholder={placeholder}
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

      {/* เหตุผลเดียวกับชิปประเภทสินค้า — ราคาแนะนำมี 6 ตัว สั้นทั้งหมด ตกบรรทัดได้ไม่ต้องเลื่อน */}
      <div className="mt-2">
        <div className="flex flex-wrap items-center gap-1.5">
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
