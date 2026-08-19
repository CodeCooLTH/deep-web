'use client'

/**
 * Base: src/app/(paces)/seller/(dashboard)/products/components/ProductPriceCardV2.tsx
 *   (card shell `px-3 py-2.5` + label pattern — in-project, ไม่มี 1:1 theme equivalent)
 * Base: src/assets/css/custom/_forms.css `.form-switch`
 *   (ใช้จริงที่ src/layouts/components/Customizer/components/SidenavUser.tsx)
 * Base: src/app/(paces)/seller/(dashboard)/products/components/ProductStockCardV2.tsx:54-62
 *   (lowStockThreshold input — copy pattern เดียวกับ stockQty number input, feature 00009 S-20)
 * Base: src/app/(paces)/seller/(dashboard)/inventory/components/AdvanceWarningBanner.tsx:40-42
 *   (upsell Link — `font-bold underline` pattern, feature 00009 S-20)
 *
 * Domain component — ไม่มี 1:1 Paces theme equivalent สำหรับ stock toggle
 *   Toggle "ติดตามจำนวนสต็อก" คุม stockQty null (ไม่ติดตาม) ↔ 0 (เริ่มติดตาม)
 *   render เฉพาะ type===PHYSICAL && entitlementActive (ควบคุมจาก ProductFormV2)
 *
 * lowStockThreshold (Deep Stock Pro, feature 00009 S-20) — PRO-gate ต่อท้าย tracked block:
 *   tracked && isProActive  → number input จริง (ว่าง = submit null = ปิด alert)
 *   tracked && !isProActive → upsell hint ลิงก์ /inventory
 *   !tracked                → ไม่แสดง (ไม่มี stockQty ให้เทียบ threshold)
 */

import type { UseFormRegister, FieldErrors, UseFormSetValue, UseFormWatch } from 'react-hook-form'
import Icon from '@/components/wrappers/Icon'
import Link from 'next/link'
import type { ProductFormV2Values } from './ProductFormV2.types'

interface ProductStockCardV2Props {
  register: UseFormRegister<ProductFormV2Values>
  errors: FieldErrors<ProductFormV2Values>
  setValue: UseFormSetValue<ProductFormV2Values>
  watch: UseFormWatch<ProductFormV2Values>
  // isProActive — Deep Stock Pro (feature 00009): คุม PRO-gate ของ field lowStockThreshold
  isProActive: boolean
  /**
   * 🛑 เปิดจากในแอป iOS → ต้องไม่มีคำเชิญให้ซื้อ (App Store Guideline 3.1.1)
   *
   * บรรทัด "ตั้งเกณฑ์แจ้งเตือนสต็อกต่ำเป็นฟีเจอร์ Pro — **อัพเกรดเลย →**" คือคำเชิญตรงตัว
   * และปลายทาง `/inventory` ก็เด้งกลับหน้าแรกอยู่แล้วสำหรับคนที่ยังไม่สมัคร ⇒ ปล่อยไว้ =
   * ทั้งผิดกฎ **และ** เป็นลิงก์ที่กดแล้วไม่เกิดอะไร
   *
   * ช่องกรอกยังถูกล็อกเหมือนเดิมทุกอย่าง — ตัดแค่ "คำชวนซื้อ" ไม่ได้ตัดพฤติกรรมของฟอร์ม
   */
  hidePayments?: boolean
}

export default function ProductStockCardV2({
  register,
  errors,
  setValue,
  watch,
  isProActive,
  hidePayments = false,
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

          {/* lowStockThreshold — Deep Stock Pro (feature 00009 S-20): PRO-gate
              tracked && isProActive → input จริง; tracked && !isProActive → upsell hint */}
          {isProActive && (
            <div className="border-default-100 mt-3 border-t pt-2.5">
              <label htmlFor="v2-low-stock-threshold" className="text-default-700 mb-1 block text-xs font-semibold">
                แจ้งเตือนเมื่อสต็อกเหลือน้อยกว่า (ชิ้น)
              </label>
              <input
                id="v2-low-stock-threshold"
                type="number"
                step="1"
                min="0"
                inputMode="numeric"
                className="form-input"
                placeholder="เช่น 5"
                {...register('lowStockThreshold', {
                  // ว่าง → submit null (ปิดการแจ้งเตือน); มีค่า → number
                  setValueAs: (v) => (v === '' || v === null || v === undefined ? null : Number(v)),
                })}
              />
              {errors.lowStockThreshold && (
                <p className="text-danger mt-1 text-sm">{errors.lowStockThreshold.message}</p>
              )}
              <p className="text-default-400 mt-1 text-xs">เว้นว่างไว้ = ปิดการแจ้งเตือน</p>
            </div>
          )}
          {!isProActive && !hidePayments && (
            <p className="text-default-400 mt-3 flex items-center gap-1.5 text-xs">
              <Icon icon="lock" className="size-3.5 shrink-0" aria-hidden="true" />
              <span>
                ตั้งเกณฑ์แจ้งเตือนสต็อกต่ำเป็นฟีเจอร์ Pro —{' '}
                <Link href="/inventory" className="text-primary font-bold underline hover:no-underline">
                  อัพเกรดเลย →
                </Link>
              </span>
            </p>
          )}
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
