'use client'

// Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(products)/product-add/components/ProductInformation.tsx
//   (form-textarea pattern — เลียนแบบ ProductDescriptionCardV2 พี่น้องโดยตรง
//    เพื่อให้ visual rhythm ของ field stack สม่ำเสมอ: borderless + bg-default-50)
// Layout: compact single-card — ไม่มี collapse pattern (ของ description) เพราะ
//   short description คาดหวังว่าจะกรอกเสมอ (เป็น teaser หลักที่โผล่ใน card สินค้า)
import type { UseFormRegister, FieldErrors } from 'react-hook-form'
import type { ProductFormV2Values } from './ProductFormV2.types'

interface ProductShortDescCardV2Props {
  register: UseFormRegister<ProductFormV2Values>
  errors: FieldErrors<ProductFormV2Values>
}

const MAX_LEN = 200

export default function ProductShortDescCardV2({
  register,
  errors,
}: ProductShortDescCardV2Props) {
  return (
    <div className="px-3 py-2.5">
      <label htmlFor="v2-short-description" className="sr-only">
        คำอธิบายสั้น
      </label>
      <textarea
        id="v2-short-description"
        rows={2}
        maxLength={MAX_LEN}
        className="bg-default-50 placeholder:text-default-400 focus:border-primary block w-full rounded-lg border-0 px-3 py-2 text-sm outline-hidden focus:ring-0"
        placeholder="คำอธิบายสั้น (ทีเซอร์ที่จะโผล่ในการ์ดสินค้า)"
        aria-describedby={errors.shortDescription ? 'v2-short-description-error' : undefined}
        {...register('shortDescription')}
      />
      {errors.shortDescription && (
        <p id="v2-short-description-error" className="text-danger mt-1 text-sm">
          {errors.shortDescription.message}
        </p>
      )}
    </div>
  )
}
