'use client'

/**
 * SwitchShopButton — ปุ่ม "สลับมาร้านนี้" บนการ์ดร้านที่ไม่ใช่ active shop ปัจจุบัน (Task 2, S-4)
 *
 * Base (logic): src/hooks/useShopSwitcher.ts (shared กับ UserDropdownDetailed/AccountSwitcherSheet)
 *   POST /api/business/switch-context → session.update({activeShopId}) → overlay ≥3000ms →
 *   hard-navigate /dashboard, pacesToast error สำหรับ 403/non-ok/catch — reuse endpoint เดิม 100%
 *   ไม่แก้ security (D-1 REVISED)
 * Base (ปุ่ม Paces): Paces ไม่มี `btn-soft`/`btn-primary` primitive จริง (ตรวจแล้ว) — ใช้ token
 *   ผสม `bg-primary/15 text-primary hover:bg-primary hover:text-white` (pattern เดียวกับ badge
 *   ที่เห็นทั่วโปรเจกต์ เช่น inventory/page.tsx:175 `bg-primary/15 text-primary`) + `btn-sm` (Paces size token)
 */

import Icon from '@/components/wrappers/Icon'
import ShopSwitchOverlay from '@/components/paces/ShopSwitchOverlay'
import { useShopSwitcher } from '@/hooks/useShopSwitcher'

export interface SwitchShopButtonProps {
  shopId: string
  shopName: string
}

export default function SwitchShopButton({ shopId, shopName }: SwitchShopButtonProps) {
  const { switching, target, switchShop } = useShopSwitcher()

  function handleSwitch() {
    switchShop(shopId, { name: shopName, kind: 'business', logo: null })
  }

  return (
    <>
      <button
        type="button"
        onClick={handleSwitch}
        disabled={switching}
        className="btn bg-primary/15 text-primary hover:bg-primary hover:text-white btn-sm inline-flex items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {switching ? (
          <Icon icon="loader-2" className="animate-spin size-3.5" aria-hidden="true" />
        ) : (
          <Icon icon="arrows-shuffle" className="size-3.5" aria-hidden="true" />
        )}
        สลับมาร้านนี้
      </button>
      <ShopSwitchOverlay show={switching} targetName={target?.name} targetKind={target?.kind} targetLogo={target?.logo} />
    </>
  )
}
