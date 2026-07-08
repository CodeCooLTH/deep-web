'use client'

/**
 * FinanceVisibilityToggle — toggle ให้พนักงานเห็นข้อมูลการเงิน (Shop.staffCanViewFinance)
 * feature 00016 Unit 5C (FR-EXP-10)
 *
 * Base: src/app/(paces)/seller/(dashboard)/business/[shopId]/invites/page.tsx:100-109
 *   (card shell "เชิญพนักงาน" เดิมในไฟล์เดียวกัน — วางเหนือ card นี้)
 * Base: src/app/(paces)/seller/(dashboard)/products/components/ProductStockCardV2.tsx:53-64
 *   (form-switch checkbox controlled — label+switch flex row, description ด้านล่าง; domain pattern
 *   เดิม ไม่มี 1:1 theme equivalent สำหรับ toggle รูปแบบนี้ — ระบุไว้แล้วในไฟล์ต้นทาง)
 * Base: src/lib/paces-swal.ts (pacesConfirm.warning) — confirm เฉพาะตอนเปิด (false→true)
 * Base: src/app/(paces)/seller/(dashboard)/inventory/components/PackageSelector.tsx (handleConfirm)
 *   — confirm+fetch+toast+router.refresh flow; ต่างจาก PackageSelector ตรงที่ fetch แยกออกจาก dialog
 *   (ไม่ใช้ preConfirm) ตาม UX-Design-Spec §C Theme Source Mapping ("adapt: ไม่มี preConfirm ใน dialog")
 *
 * User flow (UX-Design-Spec §C):
 *   ปิด→เปิด: pacesConfirm.warning ก่อนเสมอ (เปิด = risk — admin เห็นข้อมูลการเงิน)
 *   เปิด→ปิด: ยิง PATCH ตรง ไม่ confirm (ปิด = ปลอดภัยกว่าเดิม)
 *   PATCH ล้มเหลว → pacesToast.error + revert switch state (defense-in-depth — ปกติไม่ควรเกิดเพราะ
 *   component นี้ถูกซ่อนด้วย isOwner ที่ RSC parent อยู่แล้ว, backend เองก็ 403 NOT_OWNER)
 *   locked (shop.packageLockedAt !== null) → switch disabled (locked shop = read-only, Resolved Decision #3)
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Icon from '@/components/wrappers/Icon'
import { pacesConfirm } from '@/lib/paces-swal'
import { pacesToast } from '@/lib/paces-toast'

interface FinanceVisibilityToggleProps {
  shopId: string
  initial: boolean
  locked: boolean
}

export default function FinanceVisibilityToggle({ shopId, initial, locked }: FinanceVisibilityToggleProps) {
  const router = useRouter()
  const [checked, setChecked] = useState(initial)
  const [pending, setPending] = useState(false)

  const patchFinanceVisibility = async (next: boolean) => {
    setPending(true)
    try {
      const res = await fetch(`/api/business/shops/${shopId}/finance-visibility`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffCanViewFinance: next }),
      })
      if (!res.ok) {
        setChecked(!next) // revert
        pacesToast.error('ไม่สามารถเปลี่ยนสิทธิ์ได้')
        return
      }
      pacesToast.success(next ? 'เปิดสิทธิ์ดูข้อมูลการเงินแล้ว' : 'ปิดสิทธิ์ดูข้อมูลการเงินแล้ว')
      router.refresh()
    } catch {
      setChecked(!next) // revert — network error
      pacesToast.error('ไม่สามารถเปลี่ยนสิทธิ์ได้')
    } finally {
      setPending(false)
    }
  }

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.checked
    setChecked(next) // optimistic — switch ขยับทันที

    if (next) {
      // เปิด (false→true) = risk — ต้อง confirm ก่อนเสมอ
      const confirmed = await pacesConfirm.warning(
        'เปิดให้พนักงานเห็นข้อมูลการเงิน?',
        'ผู้ดูแล (admin) ของร้านนี้จะเห็นรายงานกำไร-ขาดทุนและรายการค่าใช้จ่ายทั้งหมด',
        { confirmButtonText: 'เปิดใช้งาน' },
      )
      if (!confirmed) {
        setChecked(false) // ยกเลิก → กลับ false, ไม่ยิง API
        return
      }
    }

    // เปิด(ยืนยันแล้ว) หรือ ปิด(ไม่ต้อง confirm) → ยิง PATCH
    await patchFinanceVisibility(next)
  }

  return (
    <div className="card">
      <div className="card-body">
        <div className="flex items-center justify-between gap-3">
          <label
            htmlFor="finance-visibility-toggle"
            className="text-dark flex items-center gap-1.5 text-sm font-medium"
          >
            <Icon icon="eye" className="text-default-500 size-4 shrink-0" aria-hidden="true" />
            ให้พนักงานเห็นข้อมูลการเงิน
          </label>
          <input
            id="finance-visibility-toggle"
            type="checkbox"
            className="form-switch"
            checked={checked}
            disabled={locked || pending}
            onChange={handleChange}
          />
        </div>
        <p className="text-default-400 mt-1 text-xs">
          รายงานกำไร-ขาดทุนและรายการค่าใช้จ่ายของร้าน — เริ่มต้นปิด
        </p>
      </div>
    </div>
  )
}
