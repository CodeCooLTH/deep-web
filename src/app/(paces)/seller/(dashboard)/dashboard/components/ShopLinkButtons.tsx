'use client'
/**
 * ShopLinkButtons — ปุ่มคัดลอก/แชร์ลิงก์ร้านสำหรับ CompactHero
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/buttons/page.tsx (icon button pattern)
 *
 * แยกเป็น client component เพราะใช้ navigator.clipboard / navigator.share
 * (Web API — ทำงานได้เฉพาะ client-side)
 * ส่วนอื่นของ hero คง RSC (data fetch ที่ server)
 */

import { Icon } from '@iconify/react'
import { resolveBuyerBaseUrl } from '@/lib/buyer-url'
import { pacesToast } from '@/lib/paces-toast'

interface ShopLinkButtonsProps {
  /** path เต็มของหน้าร้าน active shop (เช่น "/b/tanapat001" หรือ "/u/username") — คำนวณจาก dashboard/page.tsx */
  shopSlug: string | null
}

export default function ShopLinkButtons({ shopSlug }: ShopLinkButtonsProps) {
  // ไม่มี path (onboarding ยังไม่ครบ / ไม่มี slug|username) ซ่อนปุ่มทั้งคู่
  if (!shopSlug) return null

  // shopSlug = path เต็ม (ขึ้นต้นด้วย /) แล้ว — ต่อกับ base ตรง ๆ (ไม่ใส่ / ซ้ำ)
  const getUrl = () => `${resolveBuyerBaseUrl()}${shopSlug}`

  const handleCopy = async () => {
    const url = getUrl()
    try {
      await navigator.clipboard.writeText(url)
      pacesToast.success('คัดลอกลิงก์ร้านแล้ว')
    } catch {
      // fallback กรณี clipboard API ถูก block (iOS WebView บางตัว)
      pacesToast.error('ไม่สามารถคัดลอกได้ กรุณาลองใหม่')
    }
  }

  const handleShare = async () => {
    const url = getUrl()
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ url })
      } catch {
        // ผู้ใช้ยกเลิก share dialog หรือ browser ไม่รองรับ — fallback คัดลอก
        await navigator.clipboard.writeText(url).catch(() => null)
        pacesToast.success('คัดลอกลิงก์ร้านแล้ว')
      }
    } else {
      // browser ไม่มี navigator.share (desktop Chrome) → fallback คัดลอก
      await navigator.clipboard.writeText(url).catch(() => null)
      pacesToast.success('คัดลอกลิงก์ร้านแล้ว')
    }
  }

  return (
    <>
      {/*
       * ปุ่ม icon ล้วนสีขาว — ไม่มีกล่อง bg/border ตาม mockup spec "icon ขาวล้วนไม่มีกล่อง"
       * tap target ≥44px ตาม NF-4 (padding p-2.5 = 10px per side → total 44px รวม icon 24px)
       * pattern อิง Paces icon button: text-white flex items-center justify-center
       */}
      <button
        type="button"
        onClick={handleCopy}
        aria-label="คัดลอกลิงก์ร้าน"
        className="flex-shrink-0 flex items-center justify-center text-white active:scale-90 transition-transform p-2.5"
      >
        <Icon icon="solar:link-bold-duotone" className="text-2xl" />
      </button>

      <button
        type="button"
        onClick={handleShare}
        aria-label="แชร์ลิงก์ร้าน"
        className="flex-shrink-0 flex items-center justify-center text-white active:scale-90 transition-transform p-2.5"
      >
        <Icon icon="solar:share-bold-duotone" className="text-2xl" />
      </button>
    </>
  )
}
