'use client'

/**
 * BackToBusinessButton — ทางออกจาก wizard /onboarding กลับไปร้าน BUSINESS ที่ทำงานค้างอยู่
 * (feature 00026 A3)
 *
 * ทำไมต้องมี: /onboarding เป็นหน้าบังคับ (proxy เด้งเข้ามาทุก route จนกว่าจะตั้ง slug เสร็จ) ซึ่ง
 * ถูกต้องสำหรับคนที่เพิ่งสมัครมาเปิดร้าน แต่ผิดสำหรับผู้ถูกเชิญที่เพิ่งกด "สร้างร้านส่วนตัว" จาก
 * account switcher ระหว่างทำงานในร้านคนอื่นอยู่ — เขาต้องกลับไปทำงานต่อได้โดยไม่ต้องตั้งค่าร้าน
 * ตัวเองให้จบก่อน (lib/onboarding-gate.ts scope flag ให้บังคับเฉพาะตอน active = ร้านส่วนตัว
 * ดังนั้นแค่สลับ context กลับ proxy ก็ปล่อยออกเอง)
 *
 * ปลายทาง: ร้านที่ผู้ใช้ "มาจาก" จริง ๆ (sessionStorage PREV_SHOP_ID_KEY ที่ useCreatePersonalShop
 * เขียนไว้ตอนกดสร้าง) — ไม่ใช่ "ร้านแรกที่เจอ" ซึ่งจะพาไปผิดร้านทันทีที่ user เป็นสมาชิกหลายร้าน
 * fallback เมื่ออ่านค่าไม่ได้ (เข้า /onboarding ตรง ๆ / คนละแท็บ / private mode) = ร้านแรกที่ไม่ล็อก
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/buttons/page.tsx (ปุ่ม ghost/link แบบไม่มีพื้น)
 *   ใช้คู่กับ ShopSwitchOverlay + useShopSwitcher ตัวเดียวกับ account switcher (ไม่เขียน flow ใหม่)
 */

import ShopSwitchOverlay from '@/components/paces/ShopSwitchOverlay'
import Icon from '@/components/wrappers/Icon'
import { useShopSwitcher } from '@/hooks/useShopSwitcher'
import { PREV_SHOP_ID_KEY } from '@/hooks/useCreatePersonalShop'
import { pacesToast } from '@/lib/paces-toast'
import { useSession } from 'next-auth/react'
import { useEffect, useState } from 'react'

interface BusinessItem {
  shopId: string
  shopName: string
  logo: string | null
  locked: boolean
}

export default function BackToBusinessButton() {
  const { data: session } = useSession()
  const hasBusinessMembership =
    (session?.user as { hasBusinessMembership?: boolean } | undefined)?.hasBusinessMembership === true

  const [businesses, setBusinesses] = useState<BusinessItem[] | null>(null)
  const { switching, target, switchShop } = useShopSwitcher()

  useEffect(() => {
    if (!hasBusinessMembership) return
    let cancelled = false
    // no-store + cache-buster — เหมือน account switcher (กัน intermediary cache serve รายการเก่า)
    fetch(`/api/business/context?_t=${Date.now()}`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return
        setBusinesses(
          (data.businesses ?? []).map((b: { shopId: string; shopName: string; logo: string | null; locked: boolean }) => ({
            shopId: b.shopId,
            shopName: b.shopName,
            logo: b.logo,
            locked: b.locked,
          })),
        )
      })
      .catch(() => {
        /* เงียบ — ปุ่มจะไม่โผล่ ผู้ใช้ยังทำ onboarding ต่อได้ตามปกติ ไม่ใช่ทางหลักของหน้านี้ */
      })
    return () => {
      cancelled = true
    }
  }, [hasBusinessMembership])

  if (!hasBusinessMembership || !businesses || businesses.length === 0) return null

  // ร้านที่มาจาก ถ้ายังเข้าถึงได้อยู่ (ยัง member + ไม่ถูกล็อก) ไม่งั้นร้านแรกที่ไม่ล็อก
  let previousShopId: string | null = null
  try {
    previousShopId = sessionStorage.getItem(PREV_SHOP_ID_KEY)
  } catch {
    previousShopId = null
  }
  const selectable = businesses.filter((b) => !b.locked)
  const destination = selectable.find((b) => b.shopId === previousShopId) ?? selectable[0]
  if (!destination) return null

  return (
    <>
      <div className="mt-5 text-center">
        <button
          type="button"
          onClick={() => {
            if (destination.locked) {
              pacesToast.error('บัญชีนี้ถูกล็อกชั่วคราว — ไม่สามารถสลับเข้าใช้งานได้')
              return
            }
            switchShop(destination.shopId, {
              name: destination.shopName,
              kind: 'business',
              logo: destination.logo,
            })
          }}
          disabled={switching}
          className="text-default-500 hover:text-default-800 inline-flex items-center gap-1.5 py-1 text-sm disabled:opacity-50"
        >
          <Icon icon="arrow-left" className="size-4" aria-hidden="true" />
          กลับไปที่ร้าน {destination.shopName}
        </button>
        {/* พูดเฉพาะสิ่งที่จริง: wizard บันทึกทีละขั้นตอนที่กดผ่านแล้ว (category/slug/address ยิง API
            ทันทีที่กดถัดไป) — ค่าที่ยังพิมพ์ค้างในช่องของขั้นปัจจุบันไม่ได้ถูกบันทึก */}
        <p className="text-default-400 mt-1 text-xs">ขั้นที่ทำผ่านแล้วถูกบันทึกไว้ กลับมาตั้งต่อเมื่อไหร่ก็ได้</p>
      </div>

      <ShopSwitchOverlay
        show={switching}
        targetName={target?.name}
        targetKind={target?.kind}
        targetLogo={target?.logo}
      />
    </>
  )
}
