'use client'

/**
 * SwitchAndManageButton — ปุ่ม "จัดการ" ในรายชื่อธุรกิจ: สลับ context ไปที่ธุรกิจนั้นแล้วไป /shop
 *
 * ทำไมไม่ลิงก์ตรงไปหน้าตั้งค่าของธุรกิจนั้น: ระบบมีหน้าตั้งค่าร้านอยู่แล้วที่ /shop ซึ่งแก้ "ร้านที่
 * กำลังใช้งานอยู่" — การสร้างหน้าตั้งค่าที่สองต่อธุรกิจ (เคยทำแล้วลบทิ้ง 2026-08-05) แปลว่ามีที่แก้
 * ชื่อ/โลโก้/คำอธิบาย/ที่อยู่ สองที่ ซึ่งพร้อมจะขัดกันเองทันทีที่ฝั่งใดฝั่งหนึ่งเพิ่มฟิลด์
 *
 * flow เดียวกับตัวสลับบัญชีมุมขวา (UserDropdownDetailed.handleSwitch):
 *   POST /api/business/switch-context → session.update({activeShopId}) → navigate
 * ต้อง update() ก่อน navigate ไม่งั้น /shop จะ render ด้วย activeShopId เก่า = ตั้งค่าผิดร้าน
 * (บทเรียน feedback_context_switch_before_write — พลาดแล้วข้อมูลไปผิดร้านถาวรแต่ backend คืน 200)
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'

import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'

export default function SwitchAndManageButton({ shopId, shopName }: { shopId: string; shopName: string }) {
  const router = useRouter()
  const { update } = useSession()
  const [busy, setBusy] = useState(false)

  const go = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/business/switch-context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopId }),
      })
      if (!res.ok) {
        pacesToast.error('สลับไปธุรกิจนี้ไม่สำเร็จ')
        setBusy(false)
        return
      }
      await update({ activeShopId: shopId })
      router.push('/shop')
      router.refresh()
    } catch {
      pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={go}
      disabled={busy}
      aria-label={`จัดการ ${shopName}`}
      className="text-primary inline-flex min-h-11 items-center gap-1 text-sm font-medium hover:underline disabled:opacity-50 lg:min-h-0"
    >
      {busy && <Icon icon="loader-2" className="size-3.5 animate-spin" aria-hidden="true" />}
      จัดการ
    </button>
  )
}
