'use client'

/**
 * PriceVisibilityToggleClient — สวิตช์ "แสดงราคาบนหน้าร้าน" (feature 00053 FR-PPD-01)
 *
 * Base: src/app/(paces)/seller/(dashboard)/public-profile/components/PublishToggleClient.tsx
 *   — ยกทั้งโครง: การ์ด Paces + form-switch controlled + optimistic + revert เมื่อ PATCH ล้ม
 *   + แถบเตือนใต้สวิตช์เมื่ออยู่ในสถานะที่ลูกค้าเห็นน้อยลง
 *   Adapt: **ไม่มี confirm dialog** ต่างจากไฟล์ต้นแบบ — การปิดราคาไม่ได้ทำให้หน้าร้านหายไปทั้งหน้า
 *   (ต้นแบบ confirm เพราะปิดแล้วคนนอกเข้าไม่ได้เลย) และค่าตั้งต้นของสวิตช์นี้คือ "ปิด" อยู่แล้ว
 *   การถามยืนยันทุกครั้งที่กดกลับไปสถานะตั้งต้นคือการขวางทางที่ไม่ได้กันอะไร
 * Base: src/lib/paces-toast.ts (pacesToast) — Hard Rule 9 ห้าม react-toastify ใน (paces)
 */

import { useState } from 'react'

import { useT } from '@/i18n/LocaleProvider'
import { pacesToast } from '@/lib/paces-toast'
import Icon from '@/components/wrappers/Icon'

interface PriceVisibilityToggleClientProps {
  /** ค่า showPrices ปัจจุบันจาก getShopPageLayout() (SSR) */
  initial: boolean
}

export default function PriceVisibilityToggleClient({ initial }: PriceVisibilityToggleClientProps) {
  const t = useT()
  const [checked, setChecked] = useState(initial)
  const [pending, setPending] = useState(false)

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.checked
    setChecked(next) // optimistic — สวิตช์ขยับทันที
    setPending(true)

    try {
      const res = await fetch('/api/shops/current/page-builder/prices', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ showPrices: next }),
      })
      if (!res.ok) {
        setChecked(!next) // revert
        pacesToast.error(t.publicProfile.prices.saveError)
        return
      }
      pacesToast.success(
        next ? t.publicProfile.prices.shownToast : t.publicProfile.prices.hiddenToast,
      )
    } catch {
      setChecked(!next) // revert — network error
      pacesToast.error(t.publicProfile.prices.saveError)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="card mb-base">
      <div className="card-header">
        <h4 className="card-title">{t.publicProfile.prices.cardTitle}</h4>
      </div>
      <div className="card-body">
        <div className="flex items-start gap-3">
          <Icon icon="tag" className="text-default-500 mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <label htmlFor="show-prices-toggle" className="text-default-900 text-sm font-medium">
              {t.publicProfile.prices.switchLabel}
            </label>
            <p className="text-default-400 mt-0.5 text-xs">
              {checked
                ? t.publicProfile.prices.descriptionOn
                : t.publicProfile.prices.descriptionOff}
            </p>
          </div>
          <input
            id="show-prices-toggle"
            type="checkbox"
            className="form-switch mt-0.5 shrink-0"
            checked={checked}
            disabled={pending}
            onChange={handleChange}
          />
        </div>

        {/* 🛑 แถบนี้คือสิ่งเดียวที่บอกร้านว่าราคาถูกซ่อนอยู่ — ค่าตั้งต้นของทั้งระบบคือ "ซ่อน"
            (มติผู้ใช้ 2026-08-23) ร้านที่ไม่เคยเข้ามาหน้านี้จะไม่มีทางรู้เลยว่าลูกค้าไม่เห็นราคา
            ถ้าไม่มีแถบนี้ (PRD §6.1 R-B1) */}
        {!checked && (
          <div className="bg-warning/15 text-warning-ink mt-3 rounded-lg p-3 text-xs">
            {t.publicProfile.prices.hiddenBanner}
          </div>
        )}
      </div>
    </div>
  )
}
