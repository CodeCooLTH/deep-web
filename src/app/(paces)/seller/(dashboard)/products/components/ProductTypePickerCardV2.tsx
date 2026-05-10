'use client'

// Base: theme/paces/Admin/TS/src/app/(admin)/form/elements/components/ChecksRadioSwitches.tsx
//   line 355-381 (Radio Toggle — peer hidden + <label className="btn ...peer-checked:bg-primary">)
// Layout: marketplace-style segmented control — inline pills, ไม่มี header / helper text
//   ปล่อยให้ emoji + label สื่อความหมายเอง
import type { UseFormRegister, FieldErrors } from 'react-hook-form'
import type { ProductFormV2Values, ProductTypeV2 } from './ProductFormV2.types'

interface ProductTypePickerCardV2Props {
  register: UseFormRegister<ProductFormV2Values>
  errors: FieldErrors<ProductFormV2Values>
}

// Visible labels ตัดให้สั้นเพื่อ compact — full label ไปอยู่ที่ aria-label/title
// ตาม request user: "1 สินค้าต้องจัดส่ง  2 สินค้าดิจิทัล  3 การให้บริการ"
const OPTIONS: {
  value: ProductTypeV2
  emoji: string
  label: string
  aria: string
}[] = [
  { value: 'PHYSICAL', emoji: '📦', label: 'ต้องจัดส่ง', aria: 'สินค้าต้องจัดส่ง' },
  { value: 'DIGITAL', emoji: '💻', label: 'ดิจิทัล', aria: 'สินค้าดิจิทัล' },
  { value: 'SERVICE', emoji: '🛠️', label: 'ให้บริการ', aria: 'การให้บริการ' },
]

export default function ProductTypePickerCardV2({
  register,
  errors,
}: ProductTypePickerCardV2Props) {
  return (
    <div className="px-3 py-2.5">
      {/* Drop "เป็น" prefix — context พอแล้ว, 3 pills inline */}
      <div className="-mx-3 overflow-x-auto px-3">
        <div className="flex w-max items-center gap-1.5">
          {OPTIONS.map((opt) => {
            const id = `v2-type-${opt.value.toLowerCase()}`
            return (
              <div key={opt.value}>
                <input
                  type="radio"
                  id={id}
                  value={opt.value}
                  className="peer hidden"
                  {...register('type')}
                />
                <label
                  htmlFor={id}
                  aria-label={opt.aria}
                  title={opt.aria}
                  className="btn btn-xs border-default-300 text-default-700 peer-checked:bg-primary peer-checked:border-primary cursor-pointer min-h-9 rounded-full px-3 text-xs peer-checked:text-white"
                >
                  <span className="mr-1">{opt.emoji}</span>
                  {opt.label}
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
