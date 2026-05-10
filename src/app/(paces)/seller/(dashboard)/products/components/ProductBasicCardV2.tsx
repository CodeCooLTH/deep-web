'use client'

// Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(products)/product-add/components/ProductInformation.tsx
//   (อ้างอิง form-input pattern ของ Paces — แต่ override ที่นี่เป็น borderless inline
//   ตามทิศทาง marketplace-style: placeholder ทำหน้าที่ label, ใช้ underline-on-focus)
import type { UseFormRegister, FieldErrors } from 'react-hook-form'
import type { ProductFormV2Values } from './ProductFormV2.types'

interface ProductBasicCardV2Props {
  register: UseFormRegister<ProductFormV2Values>
  errors: FieldErrors<ProductFormV2Values>
}

export default function ProductBasicCardV2({ register, errors }: ProductBasicCardV2Props) {
  return (
    <div className="px-3 py-2.5">
      {/* visually-hidden label เพื่อ accessibility — placeholder ทำหน้าที่ label */}
      <label htmlFor="v2-name" className="sr-only">
        ชื่อสินค้า
      </label>
      <input
        id="v2-name"
        type="text"
        className="text-dark placeholder:text-default-400 focus:border-primary block w-full min-h-11 border-0 border-b-2 border-transparent bg-transparent px-0 text-base font-medium outline-hidden focus:ring-0"
        placeholder="ชื่อสินค้า*  เช่น กระเป๋าผ้าสะพายข้าง สีเทา"
        aria-describedby={errors.name ? 'v2-name-error' : undefined}
        {...register('name')}
      />
      {errors.name && (
        <p id="v2-name-error" className="text-danger mt-1 text-sm">
          {errors.name.message}
        </p>
      )}
    </div>
  )
}
