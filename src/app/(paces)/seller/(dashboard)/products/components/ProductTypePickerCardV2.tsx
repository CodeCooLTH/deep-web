'use client'

/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(products)/product-add/components/Organize.tsx
 *   (card shell + select field pattern สำหรับ category/status)
 * Base: theme/paces/Admin/TS/src/app/(admin)/form/elements/components/ChecksRadioSwitches.tsx
 *   line 355-381 (Radio Toggle — peer hidden + label.btn + peer-checked:bg-primary)
 *
 * Domain component — ไม่มี 1:1 Paces theme equivalent สำหรับ product type picker นี้
 *   theme ใช้ static select; V2 นี้ใช้ radio pill chips ที่ derive จาก product-types registry
 *   Layout: marketplace-style segmented control — inline pills, scroll-x
 *   เพิ่ม type ใหม่ใน registry → picker pickup auto (ไม่ต้องแก้ไฟล์นี้)
 *   Side effect: sync capability defaults (fulfillmentMode/billingMode) เมื่อ type เปลี่ยน
 */

import type { UseFormRegister, FieldErrors, UseFormSetValue, UseFormWatch } from 'react-hook-form'
import Icon from '@/components/wrappers/Icon'
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
      {/* 🛑 เดิมเป็น `-mx-3 overflow-x-auto` + `w-max` = แถวกว้างเกินจอโดยตั้งใจให้เลื่อน
          แต่ **ไม่มีสัญญาณบอกว่าเลื่อนได้เลย** ผู้ใช้จึงอ่านว่า "ชิปโดนตัดขอบ" (user ทัก
          2026-08-19: "หน้านี้มันเลยขอบอ่ะ") — และบนสกรีนช็อตที่ส่ง App Store มันดูเหมือน
          หน้าจอที่ทำไม่เสร็จ

          ประเภทสินค้ามีแค่ 4 ตัว ป้ายสั้น ⇒ `flex-wrap` ตกบรรทัดที่สองบนจอแคบก็จบ
          ไม่ต้องมีตัวเลื่อน ไม่มีอะไรถูกตัด และไม่ต้องเดาว่าผู้ใช้จะรู้ไหมว่าเลื่อนได้ */}
      <div>
        <div className="flex flex-wrap items-center gap-1.5">
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
                  className="btn btn-xs border-default-300 text-default-700 peer-checked:bg-primary peer-checked:border-primary cursor-pointer min-h-11 rounded-full px-3 text-xs peer-checked:text-white"
                >
                  {/* ไอคอนจริงจาก registry — ห้ามกลับไปเป็น emoji (Hard Rule 12) */}
                  <Icon icon={meta.icon} className="mr-1 text-base" />
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
