'use client'

/**
 * ShopSwitchOverlay — full-screen loading overlay ระหว่างสลับร้าน (shared 3 จุด: desktop dropdown,
 * mobile sheet, subscriptions "สลับมาร้านนี้") — dumb presentational component รับ props ล้วน ไม่มี
 * logic สลับร้านเอง (ดู useShopSwitcher hook)
 *
 * Base: src/app/(paces)/seller/(dashboard)/dashboard/components/AccountSwitcherSheet.tsx
 *   (overlay เดิมบรรทัด ~239-250, z-[1070] + spinner markup) รวมกับ
 *   theme/paces/Admin/TS/src/app/(admin)/layouts/preloader/components/Preloader.tsx (full-screen loading pattern)
 */

import AccountAvatar from '@/components/AccountAvatar'

interface Props {
  show: boolean
  targetName?: string
  targetLogo?: string | null
  targetKind?: 'personal' | 'business'
}

export default function ShopSwitchOverlay({ show, targetName, targetLogo, targetKind }: Props) {
  if (!show) return null

  const primaryText = targetName ? `กำลังสลับไปที่ร้าน "${targetName}"` : 'กำลังสลับบัญชี…'

  return (
    // z-[1070] จำเป็น: สูงกว่า sheet/dropdown/backdrop z-80, ต่ำกว่า toast z-[1080] — HR7 exception
    // (precedent: overlay เดิมใน UserDropdownDetailed.tsx / AccountSwitcherSheet.tsx)
    <div
      className="fixed inset-0 z-[1070] flex flex-col items-center justify-center gap-3 bg-default-900/40 backdrop-blur-xs"
      role="status"
      aria-live="polite"
      aria-label="กำลังสลับร้าน"
    >
      {(targetLogo || targetName) && (
        <AccountAvatar src={targetLogo ?? null} kind={targetKind ?? 'business'} className="size-14" />
      )}
      <div className="border-primary size-12 animate-spin rounded-full border-4 border-t-transparent" />
      <p className="text-default-50 text-sm font-semibold">{primaryText}</p>
      <p className="text-default-300 text-xs">กรุณารอสักครู่ ระบบกำลังโหลดข้อมูลใหม่</p>
    </div>
  )
}
