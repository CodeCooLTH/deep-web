'use client'

/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(products)/product-add/components/ProductInformation.tsx
 *   (อ้างอิง form-input pattern ของ Paces — override ที่นี่เป็น borderless inline
 *    ตามทิศทาง marketplace-style: placeholder ทำหน้าที่ label, ใช้ underline-on-focus)
 *
 * Domain component — ไม่มี 1:1 Paces theme equivalent สำหรับ borderless-inline input style นี้
 *   นำ form-input primitive จาก theme แล้ว adapt เป็น marketplace-style ชื่อสินค้า input
 *   ไม่มี explicit card shell (no card > card-header > card-body wrapper)
 *   sr-only label เพื่อ accessibility เพราะ placeholder ทำหน้าที่ visual label
 */
import type { UseFormRegister, FieldErrors } from 'react-hook-form'
import type { ProductFormV2Values } from './ProductFormV2.types'

interface ProductBasicCardV2Props {
  register: UseFormRegister<ProductFormV2Values>
  errors: FieldErrors<ProductFormV2Values>
  /** PRODUCT_VOCAB.itemSingular — default = "สินค้า" (คำเดิม) */
  itemSingular?: string
  /** ร้านบริการ: ตัวอย่างใน placeholder เป็นของขายปลีก (กระเป๋าผ้า) ไม่เข้ากับงานบริการ จึงตัดตัวอย่างออก */
  hideRetailExample?: boolean
}

export default function ProductBasicCardV2({
  register,
  errors,
  itemSingular = 'สินค้า',
  hideRetailExample = false,
}: ProductBasicCardV2Props) {
  return (
    <div className="px-3 py-2.5">
      {/* visually-hidden label เพื่อ accessibility — placeholder ทำหน้าที่ label */}
      <label htmlFor="v2-name" className="sr-only">
        ชื่อ{itemSingular}
      </label>
      <input
        id="v2-name"
        type="text"
        className="text-dark placeholder:text-default-400 focus:border-primary block w-full min-h-11 border-0 border-b-2 border-transparent bg-transparent px-0 text-base font-medium outline-hidden focus:ring-0"
        placeholder={hideRetailExample ? `ชื่อ${itemSingular}*` : `ชื่อ${itemSingular}*  เช่น กระเป๋าผ้าสะพายข้าง สีเทา`}
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
