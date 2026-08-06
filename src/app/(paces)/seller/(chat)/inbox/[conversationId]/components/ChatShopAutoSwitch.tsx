'use client'

/**
 * ChatShopAutoSwitch — สลับร้านให้อัตโนมัติเมื่อเปิดเธรดของ "อีกร้าน" ที่ผู้ใช้มีสิทธิ์
 *
 * ทำไมต้องมี (bug จริง หัวหน้ารายงาน 2026-08-06): ผู้ขายที่ถือ 2 ร้าน ผูก Facebook Page คนละเพจ
 * ไว้คนละร้าน จะได้ push ของทั้งสองร้านลงเครื่องเดียวกัน พอกด noti ของร้าน B ขณะที่ active
 * อยู่ร้าน A ระบบขึ้น "ไม่พบบทสนทนานี้" ทั้งที่เธรดมีจริงและมีสิทธิ์เต็ม (ownership guard ของ
 * หน้าเธรด scope ที่ activeShopId) — ผู้ใช้ต้องเดาเองว่าต้องไปสลับร้านก่อน ซึ่งไม่มีอะไรบอก
 *
 * component นี้ไม่ตัดสินสิทธิ์เอง — server (page.tsx) หา shopId ผ่าน
 * findConversationShopForUser() ซึ่ง scope สิทธิ์ใน WHERE แล้วเท่านั้นถึงจะ render ตัวนี้
 * ตัวมันเองแค่ "ลงมือสลับ" ตามที่ server บอก และ POST /api/business/switch-context ยัง
 * re-verify membership ซ้ำอีกชั้นอยู่ดี (2-layer verify เดิมของระบบ)
 *
 * ทำไมต้องเป็น client component: การสลับร้านต้องอัปเดต activeShopId ใน JWT ซึ่งทำได้ทางเดียว
 * คือ NextAuth `session.update()` ที่รันฝั่ง client — server component ทำเองไม่ได้
 *
 * Reuse: useShopSwitcher ตัวเดียวกับที่ ChatShopSwitcher / AccountSwitcherSheet /
 *   UserDropdownDetailed ใช้ (POST switch-context → session.update → hard-navigate
 *   + overlay ขั้นต่ำ 3 วินาที) — ไม่เขียน flow สลับร้านขึ้นมาใหม่ให้แตกเป็นสองชุด
 *   landingPath = เธรดเดิม เพื่อให้ผู้ใช้ไปถึงที่ที่กด noti มาจริง ๆ ไม่ใช่ /inbox เปล่า
 */

import { useEffect, useRef } from 'react'

import ShopSwitchOverlay from '@/components/paces/ShopSwitchOverlay'
import { useShopSwitcher } from '@/hooks/useShopSwitcher'

type Props = {
  conversationId: string
  shopId: string
  shopName: string
  logo: string | null
  kind: string
}

export default function ChatShopAutoSwitch({ conversationId, shopId, shopName, logo, kind }: Props) {
  /**
   * landingPath = เธรดเดิม + `?switched=1`
   *
   * กลับมาที่เธรดเดิมเพื่อให้ผู้ใช้ไปถึงที่ที่กด noti มาจริง ๆ (ไม่ใช่ /inbox เปล่า) — รอบนี้
   * activeShopId ตรงแล้ว guard ของ page.tsx จึงเจอเธรดและ render ตามปกติ
   *
   * 🛑 `?switched=1` คือตัวกันวน: ถ้าสลับไม่สำเร็จจริง (session ไม่โปรพาเกต) page.tsx เห็น
   * ค่านี้แล้วจะไม่ render ตัวสลับซ้ำ แต่ตกไปหน้า error ให้ผู้ใช้กดกลับได้ — ห้ามเอาออก
   */
  const { switching, target, switchShop } = useShopSwitcher({
    landingPath: `/inbox/${conversationId}?switched=1`,
  })

  // กันยิงซ้ำ: useShopSwitcher มี ref กันดับเบิลคลิกอยู่แล้ว แต่ effect อาจรันสองรอบใน
  // React Strict Mode ระหว่าง dev — กันที่นี่ด้วยให้เจตนาชัดว่า "ตั้งใจให้ทำครั้งเดียว"
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    switchShop(shopId, {
      name: shopName,
      kind: kind === 'BUSINESS' ? 'business' : 'personal',
      logo,
    })
  }, [switchShop, shopId, shopName, kind, logo])

  /**
   * overlay ค้างไว้เสมอ ไม่ผูกกับ `switching` — ไม่มีสถานะ "ว่าง" ให้เห็น
   *
   * switching เป็น false อยู่เสี้ยววินาทีแรกก่อน effect จะรัน ถ้าผูกกับมันตรง ๆ ผู้ใช้จะเห็น
   * จอเปล่าแวบหนึ่งแล้วค่อยมี overlay ซึ่งดูเหมือนแอปกระตุก — component นี้ render ก็ต่อเมื่อ
   * "กำลังจะสลับแน่นอน" อยู่แล้ว จึง show ค้างจนหน้าถูก unload ด้วย hard-navigate
   *
   * label เขียนเองแทน default ("กำลังสลับบัญชี…") — ผู้ใช้ไม่ได้ตั้งใจสลับร้าน เขาแค่กด
   * แจ้งเตือน ต้องบอกว่าทำไมจู่ ๆ ถึงสลับให้ ไม่งั้นจะงงว่าระบบทำอะไรอยู่
   */
  return (
    <ShopSwitchOverlay
      show
      targetName={target?.name ?? shopName}
      targetLogo={target?.logo ?? logo}
      targetKind={kind === 'BUSINESS' ? 'business' : 'personal'}
      label={`กำลังเปิดแชทของร้าน "${shopName}"`}
      subLabel="ข้อความนี้อยู่คนละร้านกับที่เปิดอยู่ ระบบกำลังสลับให้"
    />
  )
}
