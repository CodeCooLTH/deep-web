'use client'

/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(products)/product-add/components/ProductInformation.tsx
 *   (card > card-header > card-body, grid gap-base, form-label + form-input pattern)
 * Base: theme/paces/Admin/TS/src/app/(admin)/form/elements/components/InputTextfieldType.tsx
 *   line 244-256 ("Default Select" — `<select className="form-select">`) — Hard Rule 6:
 *   หมวดหมู่ต้องเป็น native form-select (ห้าม hs-dropdown)
 *
 * Domain component — ไม่มี 1:1 Paces theme equivalent สำหรับชุด field นี้
 *   (ชื่อ/หมวดหมู่/สินค้าในร้าน/คำอธิบาย ของ "ประมูล" ไม่ใช่ "สินค้า")
 *   description ใช้ form-textarea ธรรมดา (ไม่ใช้ Quill ตาม ProductInformation.tsx theme — task ระบุชัด)
 */
import type { UseFormRegister, FieldErrors } from 'react-hook-form'
import { SHOP_CATEGORY_KEYS, SHOP_CATEGORY_LABELS } from '@/lib/shop-categories'
import type { AuctionFormValues, AuctionFormProductOption } from './AuctionForm.types'

interface AuctionBasicCardProps {
  register: UseFormRegister<AuctionFormValues>
  errors: FieldErrors<AuctionFormValues>
  products: AuctionFormProductOption[]
  disabled?: boolean
}

export default function AuctionBasicCard({
  register,
  errors,
  products,
  disabled,
}: AuctionBasicCardProps) {
  return (
    <div className="card">
      <div className="card-header">
        <h4 className="card-title">ข้อมูลพื้นฐาน</h4>
      </div>

      <div className="card-body grid grid-cols-1 gap-base">
        <div>
          <label htmlFor="auc-title" className="form-label">
            ชื่อประมูล <span className="text-danger">*</span>
          </label>
          <input
            id="auc-title"
            type="text"
            className="form-input"
            placeholder="เช่น พระสมเด็จวัดระฆัง"
            aria-describedby={errors.title ? 'auc-title-error' : undefined}
            disabled={disabled}
            {...register('title')}
          />
          {errors.title && (
            <p id="auc-title-error" className="text-danger mt-1 text-sm">
              {errors.title.message}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="auc-category" className="form-label">
            หมวดหมู่ <span className="text-danger">*</span>
          </label>
          {/* native form-select (Hard Rule 6) — ห้าม hs-dropdown สำหรับ field ที่ bind RHF ตรง ๆ */}
          <select
            id="auc-category"
            className="form-select"
            aria-describedby={errors.category ? 'auc-category-error' : undefined}
            disabled={disabled}
            {...register('category')}
          >
            <option value="">— เลือกหมวดหมู่ —</option>
            {SHOP_CATEGORY_KEYS.map((key) => (
              <option key={key} value={key}>
                {SHOP_CATEGORY_LABELS[key]}
              </option>
            ))}
          </select>
          {errors.category && (
            <p id="auc-category-error" className="text-danger mt-1 text-sm">
              {errors.category.message}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="auc-product" className="form-label">
            สินค้าในร้าน <span className="text-default-400">(ไม่บังคับ)</span>
          </label>
          <select
            id="auc-product"
            className="form-select"
            disabled={disabled}
            {...register('productId')}
          >
            <option value="">— เลือกเพื่อเชื่อมโยง —</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="auc-description" className="form-label">
            คำอธิบาย <span className="text-default-400">(ไม่บังคับ)</span>
          </label>
          <textarea
            id="auc-description"
            rows={4}
            className="form-textarea"
            placeholder="รายละเอียดสินค้าที่นำมาประมูล"
            aria-describedby={errors.description ? 'auc-description-error' : undefined}
            disabled={disabled}
            {...register('description')}
          />
          {errors.description && (
            <p id="auc-description-error" className="text-danger mt-1 text-sm">
              {errors.description.message}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
