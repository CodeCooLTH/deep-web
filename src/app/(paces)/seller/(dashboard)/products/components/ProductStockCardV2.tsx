'use client'

/**
 * Base: src/app/(paces)/seller/(dashboard)/products/components/ProductPriceCardV2.tsx
 *   (card shell `px-3 py-2.5` + label pattern — in-project, ไม่มี 1:1 theme equivalent)
 * Base: src/assets/css/custom/_forms.css `.form-switch`
 *   (ใช้จริงที่ src/layouts/components/Customizer/components/SidenavUser.tsx)
 *
 * Domain component — ไม่มี 1:1 Paces theme equivalent สำหรับ stock toggle
 *   Toggle "ติดตามจำนวนสต็อก" คุม stockQty null (ไม่ติดตาม) ↔ 0 (เริ่มติดตาม)
 *   render เฉพาะ type===PHYSICAL && entitlementActive (ควบคุมจาก ProductFormV2)
 */

import type { UseFormRegister, FieldErrors, UseFormSetValue, UseFormWatch } from 'react-hook-form'
import type { ProductFormV2Values } from './ProductFormV2.types'

interface ProductStockCardV2Props {
  register: UseFormRegister<ProductFormV2Values>
  errors: FieldErrors<ProductFormV2Values>
  setValue: UseFormSetValue<ProductFormV2Values>
  watch: UseFormWatch<ProductFormV2Values>
}

export default function ProductStockCardV2({
  register,
  errors,
  setValue,
  watch,
}: ProductStockCardV2Props) {
  const stockQty = watch('stockQty')
  const tracked = stockQty !== null && stockQty !== undefined

  return (
    <div className="px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor="v2-stock-toggle" className="text-dark text-sm font-medium">
          ติดตามจำนวนสต็อก
        </label>
        <input
          id="v2-stock-toggle"
          type="checkbox"
          className="form-switch"
          checked={tracked}
          onChange={(e) =>
            setValue('stockQty', e.target.checked ? 0 : null, {
              shouldValidate: true,
              shouldTouch: true,
            })
          }
        />
      </div>
      {tracked && (
        <>
          <input
            type="number"
            step="1"
            min="0"
            inputMode="numeric"
            className="form-input mt-2"
            placeholder="จำนวนสต็อก*"
            {...register('stockQty', { valueAsNumber: true })}
          />
          {errors.stockQty && (
            <p className="text-danger mt-1 text-sm">{errors.stockQty.message}</p>
          )}
          <p className="text-default-400 mt-1 text-xs">
            ระบบจะตัดสต็อกอัตโนมัติทุกครั้งที่มี order ใหม่ และคืนอัตโนมัติเมื่อยกเลิก
          </p>
        </>
      )}
      {!tracked && (
        <p className="text-default-400 mt-1 text-xs">
          ยังไม่ติดตามสต็อกสินค้านี้ — order จะสร้างได้ไม่จำกัดจำนวน
        </p>
      )}
    </div>
  )
}
