'use client'

/**
 * ShopSwitchOverlay — full-screen loading overlay ระหว่างสลับร้าน (shared 3 จุด: desktop dropdown,
 * mobile sheet, subscriptions "สลับมาร้านนี้") — dumb presentational component รับ props ล้วน ไม่มี
 * logic สลับร้านเอง (ดู useShopSwitcher hook)
 *
 * ⚠️ ต้อง render ผ่าน Portal ไป document.body: mobile sheet (AccountSwitcherSheet) และ dropdown
 * มี parent ที่ใช้ `transform` (translate-y เปิด/ปิด sheet) ซึ่งสร้าง containing block ให้
 * position:fixed → ถ้า render overlay ไว้ข้างในจะไม่เต็ม viewport + โดน backdrop ของ sheet บัง.
 * Portal ไป body ทำให้ fixed inset-0 z-[1070] เต็มจอจริง อยู่บนสุดทับทั้ง sheet + backdrop เสมอ.
 *
 * Base: src/app/(paces)/seller/(dashboard)/dashboard/components/AccountSwitcherSheet.tsx
 *   (overlay เดิมบรรทัด ~239-250, z-[1070] + spinner markup) รวมกับ
 *   theme/paces/Admin/TS/src/app/(admin)/layouts/preloader/components/Preloader.tsx (full-screen loading pattern)
 */

import AccountAvatar from '@/components/AccountAvatar'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  show: boolean
  targetName?: string
  targetLogo?: string | null
  targetKind?: 'personal' | 'business'
}

export default function ShopSwitchOverlay({ show, targetName, targetLogo, targetKind }: Props) {
  // mounted guard — createPortal ต้องมี document (client เท่านั้น) กัน SSR/hydration mismatch
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  if (!show || !mounted) return null

  const primaryText = targetName ? `กำลังสลับไปที่ร้าน "${targetName}"` : 'กำลังสลับบัญชี…'

  // z-[1070] จำเป็น: สูงกว่า sheet/dropdown/backdrop z-80, ต่ำกว่า toast z-[1080] — HR7 exception
  // (precedent: overlay เดิมใน UserDropdownDetailed.tsx / AccountSwitcherSheet.tsx)
  const overlay = (
    <div
      className="fixed inset-0 z-[1070] flex flex-col items-center justify-center gap-3 bg-white"
      role="status"
      aria-live="polite"
      aria-label="กำลังสลับร้าน"
    >
      {targetLogo || targetName ? (
        <div className="relative flex items-center justify-center">
          <AccountAvatar src={targetLogo ?? null} kind={targetKind ?? 'business'} className="size-14" />
          {/* วงแหวน spinner บางวิ่งติดขอบรูป avatar (arc หมุนรอบขอบ) */}
          <span
            className="border-primary absolute -inset-0.5 animate-spin rounded-full border-2 border-t-transparent"
            aria-hidden="true"
          />
        </div>
      ) : (
        <div className="border-primary size-8 animate-spin rounded-full border-2 border-t-transparent" />
      )}
      <p className="text-default-800 text-sm font-semibold">{primaryText}</p>
      <p className="text-default-500 text-xs">กรุณารอสักครู่ ระบบกำลังโหลดข้อมูลใหม่</p>
    </div>
  )

  // Portal ไป body — หลุด stacking context ของ sheet/dropdown ที่มี transform
  return createPortal(overlay, document.body)
}
