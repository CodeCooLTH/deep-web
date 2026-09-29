'use client'

/**
 * FollowUpShopAutoSwitch — สลับร้านให้อัตโนมัติเมื่อเปิด /follow-ups?shopId=X ของ "อีกร้าน" (E7, จาก push)
 *
 * Base: src/app/(paces)/seller/(chat)/inbox/[conversationId]/components/ChatShopAutoSwitch.tsx
 *   (ก็อป flow เดียวกัน: useShopSwitcher + กันยิงซ้ำ + ตรวจ "เคยสลับแล้วกลับเป็น false = ล้มเหลว")
 *   ← Base ของมัน: theme/paces/Admin/TS/src/app/(admin)/layouts/preloader/components/Preloader.tsx (ผ่าน ShopSwitchOverlay)
 *
 * ต่างจากต้นแบบ: ต้นแบบล้มเหลว → ส่งไปหน้า error ที่ retry ไม่ได้ · ที่นี่ UX spec ระบุ error state
 * ต้องมีปุ่ม "ลองใหม่" + "ใช้ร้านที่เปิดอยู่" (useShopSwitcher ไม่มี error state — อนุมานจาก switching true→false)
 * server (page.tsx) ตัดสินสิทธิ์แล้วก่อน render ตัวนี้ และ POST switch-context ตรวจซ้ำอีกชั้น
 */
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import ShopSwitchOverlay from '@/components/paces/ShopSwitchOverlay'
import Icon from '@/components/wrappers/Icon'
import { useShopSwitcher } from '@/hooks/useShopSwitcher'
import { useT } from '@/i18n/LocaleProvider'

type Props = { landingPath: string; shopId: string; shopName: string; logo: string | null; kind: string }

export default function FollowUpShopAutoSwitch({ landingPath, shopId, shopName, logo, kind }: Props) {
  const t = useT().followUps
  // 800ms: ผู้ใช้กด push เพื่ออ่านรายการ ไม่ได้ตั้งใจสลับร้าน — ถ่วง 3 วิ = รู้สึกช้า (เหตุผลเดียวกับ ChatShopAutoSwitch)
  const { switching, target, switchShop } = useShopSwitcher({ landingPath, minOverlayMs: 800 })
  const shopKind = kind === 'BUSINESS' ? 'business' : 'personal'

  const [failed, setFailed] = useState(false)
  const sawSwitching = useRef(false)
  const started = useRef(false)

  const start = () => switchShop(shopId, { name: shopName, kind: shopKind, logo })

  useEffect(() => {
    if (started.current) return
    started.current = true
    switchShop(shopId, { name: shopName, kind: shopKind, logo })
  }, [switchShop, shopId, shopName, shopKind, logo])

  // สำเร็จ = switching ค้าง true จน unload · ล้มเหลว = กลับเป็น false → ต้องมีทางออก ไม่ให้ติดสปินเนอร์
  useEffect(() => {
    if (switching) {
      sawSwitching.current = true
      return
    }
    if (sawSwitching.current) setFailed(true)
  }, [switching])

  if (failed) {
    return (
      <div className="card mx-auto max-w-md" role="alert">
        <div className="card-body flex flex-col items-center gap-3 py-14 text-center">
          <Icon icon="alert-triangle" className="text-danger-ink size-12" aria-hidden="true" />
          <p className="text-default-800 text-base font-semibold">{t.switchFailed}</p>
          <p className="text-default-600 text-sm">{shopName}</p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => {
                sawSwitching.current = false
                setFailed(false)
                start()
              }}
              className="btn bg-primary hover:bg-primary-hover min-h-11 text-white"
            >
              {t.retry}
            </button>
            <Link href="/follow-ups?switched=1" className="btn border-default-300 text-default-800 hover:bg-light min-h-11 border">
              {t.switchStay}
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <ShopSwitchOverlay
      show
      targetName={target?.name ?? shopName}
      targetLogo={target?.logo ?? logo}
      targetKind={shopKind}
      label={t.switchingShop}
    />
  )
}
