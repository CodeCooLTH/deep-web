'use client'

/**
 * useCreatePersonalShop — logic กลางของ "สร้างร้านส่วนตัวของฉัน" (feature 00026 A1)
 * ใช้ร่วม 2 จุดที่มี account switcher: UserDropdownDetailed (desktop) และ AccountSwitcherSheet (มือถือ)
 *
 * ทำไมต้องมีปุ่มนี้: ผู้ที่เข้าระบบมาทาง invite link เป็น ADMIN ของร้าน BUSINESS คนอื่น จะไม่มีร้าน
 * PERSONAL ของตัวเอง (feature 00012 Lazy Personal shop) และ UI เดิมมีทางไปกดสร้างที่ /choose-shop
 * ที่เดียว ซึ่งเขาไม่ถูกพาไปอีกเลยหลังมี business membership แล้ว — อยากขายของเองจึงทำไม่ได้
 *
 * "สร้างได้ครั้งเดียว" ไม่ต้องกันที่นี่: partial unique index Shop_userId_personal_key และ
 * ensurePersonalShop() (resolve-before-create) กันให้แล้ว 2 ชั้น และเมื่อสร้างสำเร็จ
 * /api/business/context จะคืน personal ไม่เป็น null อีก แถวปุ่มจึงหายไปเอง
 *
 * Base logic: src/hooks/useShopSwitcher.ts (โครง state/ref/overlay/hard-navigate เดียวกัน)
 *   + src/app/(paces)/seller/choose-shop/components/ChooseShopClient.tsx:96-113 (handleOpenPersonal เดิม)
 */

import { pacesConfirm } from '@/lib/paces-swal'
import { pacesToast } from '@/lib/paces-toast'
import { useSession } from 'next-auth/react'
import { useCallback, useRef, useState } from 'react'

// ปลายทางหลังสร้างเสร็จ — wizard ตั้งค่าร้าน (หมวดหมู่ → slug → ที่อยู่ → สินค้าแรก)
const ONBOARDING_PATH = '/onboarding'

/** key ที่จำร้านที่ผู้ใช้ "มาจาก" ก่อนกดสร้างร้านส่วนตัว — ปุ่ม "กลับไปร้านเดิม" บนหน้า onboarding
 *  อ่านค่านี้เพื่อพากลับร้านที่เขาทำงานค้างอยู่จริง ไม่ใช่เดาเอาร้านแรกที่เจอ (ซึ่งจะผิดทันทีที่
 *  user เป็นสมาชิกหลายร้าน). sessionStorage เพราะผูกกับแท็บนี้และหายเองเมื่อปิด — ไม่ต้องมี cleanup */
export const PREV_SHOP_ID_KEY = 'deep:prev-shop-id'

export function useCreatePersonalShop() {
  const { data: session, update } = useSession()
  const [creating, setCreating] = useState(false)
  // ref กันดับเบิลคลิกยิงซ้ำระหว่างที่ setCreating(true) ยังไม่ re-render (pattern เดียวกับ useShopSwitcher)
  const creatingRef = useRef(false)

  const createPersonalShop = useCallback(async () => {
    if (creatingRef.current) return

    const confirmed = await pacesConfirm.question(
      'สร้างร้านส่วนตัวของคุณ?',
      'ร้านนี้ผูกกับตัวคุณโดยตรงและสร้างได้ครั้งเดียว — พอยืนยันแล้วเราจะพาไปตั้งค่าร้านต่อทันที',
      { confirmButtonText: 'สร้างร้านเลย', cancelButtonText: 'ยังไม่สร้างตอนนี้' },
    )
    if (!confirmed) return

    creatingRef.current = true
    setCreating(true)

    // จำร้านที่มาจาก "ก่อน" จะสลับไปร้านส่วนตัว — หลังจากนี้ activeShopId จะถูกทับแล้ว
    const previousShopId = (session?.user as { activeShopId?: string | null } | undefined)?.activeShopId
    if (previousShopId) {
      try {
        sessionStorage.setItem(PREV_SHOP_ID_KEY, previousShopId)
      } catch {
        // sessionStorage ใช้ไม่ได้ (private mode บางเบราว์เซอร์) — ปุ่มกลับจะ fallback ไปร้านแรกแทน
        // ไม่ควรทำให้การสร้างร้านล้มเพราะเรื่องนี้
      }
    }

    try {
      const res = await fetch('/api/shops/open-personal', { method: 'POST' })
      if (!res.ok) {
        // ข้อความเดียวกับ ChooseShopClient — เหตุการณ์เดียวกันต้องใช้คำเดียวกันทั้งแอป
        pacesToast.error('เปิดร้านไม่สำเร็จ กรุณาลองใหม่')
        creatingRef.current = false
        setCreating(false)
        return
      }
      const data = (await res.json()) as { shopId: string }
      // jwt callback re-verify ว่า shopId นี้เป็นของ user จริงก่อนเชื่อ (2-layer verify)
      await update({ activeShopId: data.shopId })

      // hard-navigate ไม่ใช่ router.push — ต้องให้ proxy อ่าน JWT ใบใหม่ (activeShopId = ร้านส่วนตัว
      // → needsOnboarding = true ตาม lib/onboarding-gate.ts) ไม่งั้น client-side nav จะพกสถานะเก่าไป
      // ไม่ setCreating(false) — ปล่อย overlay ค้างจน browser unload หน้านี้จริง
      window.location.href = ONBOARDING_PATH
    } catch {
      pacesToast.error('เปิดร้านไม่สำเร็จ กรุณาลองใหม่')
      creatingRef.current = false
      setCreating(false)
    }
  }, [session, update])

  return { creating, createPersonalShop }
}
