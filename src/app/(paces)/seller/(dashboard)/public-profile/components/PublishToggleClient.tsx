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
import { pacesToast } from '@/lib/paces-toast'
import Icon from '@/components/wrappers/Icon'

interface PublishToggleClientProps {
  /** ค่า isPublished ปัจจุบันจาก getShopPageLayout() (SSR) */
  initial: boolean
}

export default function PublishToggleClient({ initial }: PublishToggleClientProps) {
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
        pacesToast.error('ไม่สามารถเปลี่ยนสถานะการเผยแพร่ได้')
        return
      }
      pacesToast.success(next ? 'เผยแพร่หน้าร้านแล้ว' : 'ปิดการแสดงผลหน้าร้านแล้ว')
    } catch {
      setChecked(!next) // revert — network error
      pacesToast.error('ไม่สามารถเปลี่ยนสถานะการเผยแพร่ได้')
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
        'ปิดการแสดงผลหน้าร้าน?',
        'ผู้เยี่ยมชมทั่วไปจะมองไม่เห็นหน้าร้านของคุณ จนกว่าคุณจะเปิดอีกครั้ง — เปิดกลับมาได้ทุกเมื่อในหน้านี้',
        { confirmButtonText: 'ปิดการแสดงผล' },
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
        <h4 className="card-title">การมองเห็นหน้าร้าน</h4>
      </div>
      <div className="card-body">
        <div className="flex items-start gap-3">
          <Icon icon="world" className="text-default-500 mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <label htmlFor="publish-toggle" className="text-default-900 text-sm font-medium">
              เผยแพร่หน้าร้านสาธารณะ
            </label>
            <p className="text-default-400 mt-0.5 text-xs">
              {checked
                ? 'ลูกค้าทั่วไปเปิดดูหน้าร้านของคุณได้ตามปกติ'
                : 'ผู้เยี่ยมชมทั่วไปจะเห็นข้อความว่าหน้านี้ปิดการแสดงผลชั่วคราว — คุณยังเปิดดูหน้าร้านของตัวเองได้เสมอ'}
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
            หน้าร้านนี้ปิดการแสดงผลอยู่ ผู้เยี่ยมชมทั่วไปจะมองไม่เห็น
          </div>
        )}
      </div>
    </div>
  )
}
