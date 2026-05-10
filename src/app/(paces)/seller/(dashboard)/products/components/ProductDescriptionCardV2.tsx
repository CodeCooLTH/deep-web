'use client'

// Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(products)/product-add/components/ProductInformation.tsx
//   (form-textarea pattern — ห้ามใช้ Quill ตาม design doc)
// Layout override: marketplace-style — default state คือ link เล็ก "+ คำอธิบายเพิ่มเติม"
//   กดแล้ว expand เป็น textarea borderless (bg-default-50). ไม่ใช้ Preline data-hs-collapse
//   เพื่อกัน hydration race + เพื่อให้ flow control อยู่ที่ React state ตรงๆ
import type { UseFormRegister, FieldErrors } from 'react-hook-form'
import { useState } from 'react'
import type { ProductFormV2Values } from './ProductFormV2.types'

interface ProductDescriptionCardV2Props {
  register: UseFormRegister<ProductFormV2Values>
  errors: FieldErrors<ProductFormV2Values>
}

export default function ProductDescriptionCardV2({
  register,
  errors,
}: ProductDescriptionCardV2Props) {
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <div className="px-3 py-2.5">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-primary hover:bg-primary/5 inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-sm font-semibold"
        >
          + คำอธิบายเพิ่มเติม
        </button>
      </div>
    )
  }

  return (
    <div className="px-3 py-2.5">
      <label htmlFor="v2-description" className="sr-only">
        รายละเอียด
      </label>
      <textarea
        id="v2-description"
        rows={3}
        className="bg-default-50 placeholder:text-default-400 focus:border-primary block w-full rounded-lg border-0 px-3 py-2 text-sm outline-hidden focus:ring-0"
        placeholder="เล่ารายละเอียด เช่น ขนาด สี วัสดุ"
        {...register('description')}
      />
      {errors.description && (
        <p className="text-danger mt-1 text-sm">{errors.description.message}</p>
      )}
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-default-500 hover:text-dark mt-1 inline-flex items-center gap-1 text-sm"
      >
        − ซ่อน
      </button>
    </div>
  )
}
