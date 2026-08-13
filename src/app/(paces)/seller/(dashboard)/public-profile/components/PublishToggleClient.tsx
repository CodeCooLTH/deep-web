'use client'

/**
 * PublishToggleClient — สวิตช์เผยแพร่หน้าร้านสาธารณะ (feature 00035 §3 SDS, SRS TFR-009)
 *
 * ใช้ endpoint เดียวกันทั้งการ์ด "การมองเห็นหน้าร้าน" บนมือถือ (/public-profile — component นี้)
 * และ toolbar ของ builder บนเดสก์ท็อป (API.md §4.4: PATCH /api/shops/current/page-builder/publish)
 *
 * Base: src/app/(paces)/seller/(dashboard)/business/[shopId]/invites/components/FinanceVisibilityToggle.tsx
 *   — ยกทั้งโครง: form-switch controlled + optimistic + revert เมื่อ PATCH ล้ม + confirm เฉพาะ
 *   ทิศทางเสี่ยง (pacesConfirm.warning ก่อนยิง PATCH)
 *   Adapt: ทิศทางเสี่ยง "กลับด้าน" กับไฟล์ต้นแบบ — ไฟล์ต้นแบบเสี่ยงตอน "เปิด" (admin เห็นข้อมูลการเงิน)
 *   ของเราเสี่ยงตอน "ปิด" (ลูกค้าทั่วไปเข้าหน้าร้านไม่ได้) จึง confirm ก่อน**ปิด** ไม่ confirm ก่อนเปิด
 * Base: src/lib/paces-swal.ts (pacesConfirm.warning) — confirm modal ก่อนทำสิ่งเสี่ยง
 * Base: src/lib/paces-toast.ts (pacesToast) — toast แจ้งผลสำเร็จ/ล้ม (Hard Rule 9 — ห้าม react-toastify)
 *
 * card header/body markup: Base: src/app/(paces)/seller/(dashboard)/public-profile/page.tsx
 *   (การ์ด "หน้าร้านที่คนนอกเห็น" ในไฟล์เดียวกัน — โครง card/card-header เดิม)
 */

import { useState } from 'react'
import { pacesConfirm } from '@/lib/paces-swal'
import { useT } from '@/i18n/LocaleProvider'
import { pacesToast } from '@/lib/paces-toast'
import Icon from '@/components/wrappers/Icon'

interface PublishToggleClientProps {
  /** ค่า isPublished ปัจจุบันจาก getShopPageLayout() (SSR) */
  initial: boolean
}

export default function PublishToggleClient({ initial }: PublishToggleClientProps) {
  const t = useT()
  const [checked, setChecked] = useState(initial)
  const [pending, setPending] = useState(false)

  const patchPublish = async (next: boolean) => {
    setPending(true)
    try {
      const res = await fetch('/api/shops/current/page-builder/publish', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublished: next }),
      })
      if (!res.ok) {
        setChecked(!next) // revert
        pacesToast.error(t.publicProfile.visibility.saveError)
        return
      }
      pacesToast.success(
        next ? t.publicProfile.visibility.publishedToast : t.publicProfile.visibility.unpublishedToast,
      )
    } catch {
      setChecked(!next) // revert — network error
      pacesToast.error(t.publicProfile.visibility.saveError)
    } finally {
      setPending(false)
    }
  }

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.checked
    setChecked(next) // optimistic — สวิตช์ขยับทันที

    if (!next) {
      // ปิด (true→false) = risk — ผู้เยี่ยมชมทั่วไปมองไม่เห็นหน้าร้าน ต้อง confirm ก่อนเสมอ
      const confirmed = await pacesConfirm.warning(
        t.publicProfile.visibility.confirmTitle,
        t.publicProfile.visibility.confirmBody,
        // cancelButtonText ต้องส่งเสมอ — ค่า default ใน paces-swal.ts เป็น 'ยกเลิก' ตายตัว
        // ไม่ส่ง = โมดัลเป็นอังกฤษทั้งใบแต่ปุ่มยกเลิกค้างเป็นไทยกลางจอ
        { confirmButtonText: t.publicProfile.visibility.confirmButton, cancelButtonText: t.common.cancel },
      )
      if (!confirmed) {
        setChecked(true) // ยกเลิก → กลับค่าเดิม (เปิด), ไม่ยิง API
        return
      }
    }

    // เปิด (ไม่ต้อง confirm) หรือ ปิด (ยืนยันแล้ว) → ยิง PATCH
    await patchPublish(next)
  }

  return (
    <div className="card mb-base">
      <div className="card-header">
        <h4 className="card-title">{t.publicProfile.visibility.cardTitle}</h4>
      </div>
      <div className="card-body">
        <div className="flex items-start gap-3">
          <Icon icon="world" className="text-default-500 mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <label htmlFor="publish-toggle" className="text-default-900 text-sm font-medium">
              {t.publicProfile.visibility.switchLabel}
            </label>
            <p className="text-default-400 mt-0.5 text-xs">
              {checked
                ? t.publicProfile.visibility.descriptionOn
                : t.publicProfile.visibility.descriptionOff}
            </p>
          </div>
          <input
            id="publish-toggle"
            type="checkbox"
            className="form-switch mt-0.5 shrink-0"
            checked={checked}
            disabled={pending}
            onChange={handleChange}
          />
        </div>

        {!checked && (
          <div className="bg-warning/15 text-warning-ink mt-3 rounded-lg p-3 text-xs">
            {t.publicProfile.visibility.hiddenBanner}
          </div>
        )}
      </div>
    </div>
  )
}
