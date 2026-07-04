'use client'

/**
 * SwitchShopButton — ปุ่ม "สลับมาร้านนี้" บนการ์ดร้านที่ไม่ใช่ active shop ปัจจุบัน (Task 2, S-4)
 *
 * Base (logic): src/layouts/components/TopBar/components/UserDropdownDetailed.tsx `handleSwitch`
 *   (POST /api/business/switch-context → session.update({activeShopId}) → router.refresh(),
 *   pacesToast error สำหรับ 403/non-ok/catch) — reuse endpoint เดิม 100% ไม่แก้ security (D-1 REVISED)
 * Base (ปุ่ม Paces): Paces ไม่มี `btn-soft`/`btn-primary` primitive จริง (ตรวจแล้ว) — ใช้ token
 *   ผสม `bg-primary/15 text-primary hover:bg-primary hover:text-white` (pattern เดียวกับ badge
 *   ที่เห็นทั่วโปรเจกต์ เช่น inventory/page.tsx:175 `bg-primary/15 text-primary`) + `btn-sm` (Paces size token)
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'

export interface SwitchShopButtonProps {
  shopId: string
  shopName: string
}

export default function SwitchShopButton({ shopId, shopName }: SwitchShopButtonProps) {
  const router = useRouter()
  const { update } = useSession()
  const [loading, setLoading] = useState(false)

  async function handleSwitch() {
    setLoading(true)
    try {
      const res = await fetch('/api/business/switch-context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopId }),
      })
      if (!res.ok) {
        // ครอบทั้ง 403 NOT_MEMBER และ error อื่น ๆ ด้วยข้อความเดียว (ตรง S-4 acceptance)
        pacesToast.error('สลับร้านไม่สำเร็จ')
        return
      }
      // jwt callback จะ re-verify membership อีกชั้นก่อนเชื่อค่านี้จริง (2-layer verify — เหมือน UserDropdownDetailed)
      await update({ activeShopId: shopId })
      pacesToast.success(`สลับมาที่ ${shopName} แล้ว`)
      router.refresh()
    } catch {
      pacesToast.error('เกิดข้อผิดพลาด')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleSwitch}
      disabled={loading}
      className="btn bg-primary/15 text-primary hover:bg-primary hover:text-white btn-sm inline-flex items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {loading ? (
        <Icon icon="loader-2" className="animate-spin size-3.5" aria-hidden="true" />
      ) : (
        <Icon icon="arrows-shuffle" className="size-3.5" aria-hidden="true" />
      )}
      สลับมาร้านนี้
    </button>
  )
}
