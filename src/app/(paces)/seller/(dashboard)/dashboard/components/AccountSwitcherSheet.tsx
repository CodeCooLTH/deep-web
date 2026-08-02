'use client'

/**
 * AccountSwitcherSheet — bottom sheet (Preline hs-overlay, placement=bottom) สลับบัญชี
 * personal ⇄ business บนมือถือ (S-1) mount โดย AccountSwitcherLauncher (sibling ของปุ่ม trigger)
 * เมื่อ seller มี business membership เท่านั้น
 *
 * ต่าง desktop (UserDropdownDetailed): list แสดง personal+business "แถวเดียวกัน" รวมแถว
 * active (ติ๊ก circle-check) แทนที่จะซ่อนแถว active ออกจาก list
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/offcanvas/page.tsx (offcanvasBottom block — id/data-hs-overlay/translate-y/close btn)
 * Logic reused from: src/layouts/components/TopBar/components/UserDropdownDetailed.tsx
 *   (fetch /api/business/context guard by hasBusinessMembership) — สลับร้านจริงใช้ useShopSwitcher
 *   ร่วมกัน (POST switch-context → session.update({activeShopId}) → hard-navigate /dashboard,
 *   overlay z-[1070] ผ่าน ShopSwitchOverlay)
 */

import AccountAvatar from '@/components/AccountAvatar'
import ShopSwitchOverlay from '@/components/paces/ShopSwitchOverlay'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import { useShopSwitcher } from '@/hooks/useShopSwitcher'
import { useCreatePersonalShop } from '@/hooks/useCreatePersonalShop'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

interface BusinessContextItem {
  shopId: string
  shopName: string
  logo: string | null
  role: 'OWNER' | 'ADMIN'
  locked: boolean
  lockReason: string | null
  deletedAt: string | null
}

interface BusinessContextResponse {
  personal: { shopId: string; shopName: string } | null
  businesses: BusinessContextItem[]
}

type SessionUser = {
  displayName?: string
  username?: string
  avatar?: string | null
  hasBusinessMembership?: boolean
  activeShopId?: string | null
  activeShopRole?: 'OWNER' | 'ADMIN'
  activeShopKind?: 'PERSONAL' | 'BUSINESS'
  activeShopName?: string | null
  activeShopLogo?: string | null
}

export default function AccountSwitcherSheet() {
  const { data: session } = useSession()
  const user = session?.user as SessionUser | undefined

  const hasBusinessMembership = user?.hasBusinessMembership === true
  const activeShopId = user?.activeShopId
  const displayName = user?.displayName ?? user?.username ?? 'ผู้ใช้'

  // identity ปัจจุบัน (ใช้เป็น fallback row เมื่อ fetch context ล้ม)
  const isBusiness = user?.activeShopKind === 'BUSINESS'
  const activeName = isBusiness ? (user?.activeShopName ?? 'ร้านค้า') : displayName
  const activeLogo = isBusiness ? (user?.activeShopLogo ?? null) : (user?.avatar ?? null)
  const activeRoleLabel = isBusiness ? (user?.activeShopRole === 'ADMIN' ? 'ผู้ดูแล' : 'เจ้าของ') : 'ส่วนตัว'

  const [context, setContext] = useState<BusinessContextResponse | null>(null)
  const [fetchFailed, setFetchFailed] = useState(false)
  const { switching, target, switchShop } = useShopSwitcher()
  // feature 00026 — ผู้ถูกเชิญที่ยังไม่มีร้านส่วนตัว (context.personal === null) กดสร้างได้จากที่นี่
  const { creating, createPersonalShop } = useCreatePersonalShop()
  // mounted guard — portal ต้องมี document (client); Preline (MutationObserver บน body) re-init sheet ให้เอง
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  useEffect(() => {
    // guard: fetch เฉพาะเมื่อมี business membership จริง (เหมือน UserDropdownDetailed)
    if (!hasBusinessMembership) return
    let cancelled = false
    // no-store + cache-buster query: กัน cache ทุกชั้น (browser/CDN/carrier 5G ที่ ignore no-store)
    // serve response เก่า businesses=[] — URL unique ทุกครั้ง = cache miss เสมอ
    fetch(`/api/business/context?_t=${Date.now()}`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return
        if (data) setContext({ personal: data.personal, businesses: data.businesses ?? [] })
        else setFetchFailed(true)
      })
      .catch(() => {
        // เงียบ — fallback แสดงแค่ identity ปัจจุบัน ไม่ crash sheet
        if (!cancelled) setFetchFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [hasBusinessMembership])

  // แถวแต่ละแถวมี 3 พฤติกรรม: active=ไม่ clickable, locked=toast อย่างเดียว (ไม่ยิง API,
  // ไม่ปิด sheet), อื่น ๆ = สลับ (useShopSwitcher) + ปิด sheet ทันที — overlay เต็มจอจะคลุม sheet
  // ที่กำลังปิดอยู่แล้ว ไม่มี race ให้เห็น
  function handleRowClick(
    shopId: string,
    locked: boolean,
    isActive: boolean,
    targetInfo: { name: string; kind: 'personal' | 'business'; logo: string | null },
  ) {
    if (isActive) return
    if (locked) {
      pacesToast.error('บัญชีนี้ถูกล็อกชั่วคราว — ไม่สามารถสลับเข้าใช้งานได้')
      return
    }
    switchShop(shopId, targetInfo)
    window.HSOverlay?.close('#account-switcher-sheet')
  }

  const loading = hasBusinessMembership && context === null && !fetchFailed

  return (
    <>
      {/* Full-screen panel (mobile + tablet) — สลับบัญชี ทับ bottom nav (z-30) + เนื้อหาทั้งหมด, อยู่บนสุด
          - text-default-800: sheet render ใต้ CompactHero (text-white) → ต้องกำหนดสีเอง ไม่งั้นทั้ง modal ขาวมองไม่เห็น
          - inset-0 + h-full/w-full: เต็มจอ (ไม่ใช่ bottom sheet); slide-up ด้วย translate-y-full → open:translate-y-0
          - [--overlay-backdrop:false]: panel ทึบเต็มจอไม่ต้องมี backdrop (แก้ถาวรปัญหา Preline backdrop z ทับ ShopSwitchOverlay)
          - pt-[env(safe-area-inset-top)]: กัน header ชนรอยบาก (HR7 arbitrary — safe-area จำเป็น)
          - portal → document.body: หลุด stacking context ของ shell content → sheet (z-80) ทับ bottom nav (z-30) ได้ */}
      {mounted &&
        createPortal(
          <div
            id="account-switcher-sheet"
        className="hs-overlay hs-overlay-open:translate-y-0 bg-card text-default-800 fixed inset-0 z-80 hidden h-full w-full translate-y-full transform flex-col pt-[env(safe-area-inset-top)] transition-all duration-300 [--overlay-backdrop:false]"
        role="dialog"
        tabIndex={-1}
        aria-labelledby="account-switcher-sheet-label"
      >
        {/* header */}
        <div className="border-default-200 flex shrink-0 items-center justify-between border-b px-5 py-3">
          <h3 id="account-switcher-sheet-label" className="text-base font-semibold">
            สลับบัญชี
          </h3>
          <button
            type="button"
            aria-label="ปิด"
            data-hs-overlay="#account-switcher-sheet"
            className="flex size-11 items-center justify-center"
          >
            <Icon icon="x" className="size-5" />
          </button>
        </div>

        {/* body — flex-1 เติมพื้นที่ที่เหลือของ full-screen + scroll เมื่อรายการยาว */}
        <div className="flex-1 overflow-y-auto px-3 pt-2 pb-[env(safe-area-inset-bottom)]">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="border-primary size-8 animate-spin rounded-full border-4 border-t-transparent" />
            </div>
          )}

          {!loading && fetchFailed && (
            // fallback — fetch context ล้ม: แสดงแค่ identity ปัจจุบัน (ไม่ clickable, ไม่มี list ให้สลับ)
            <div className="flex w-full items-center gap-3 rounded-lg px-2 py-3">
              <AccountAvatar src={activeLogo} kind={isBusiness ? 'business' : 'personal'} className="size-9" />
              <span className="min-w-0 flex-1 truncate font-medium">{activeName}</span>
              <span className="badge bg-default-100 text-default-500 shrink-0">{activeRoleLabel}</span>
              <Icon icon="circle-check" className="text-primary shrink-0" aria-hidden="true" />
            </div>
          )}

          {!loading && !fetchFailed && (
            <div className="pb-3">
              {/* Personal row — แสดงเสมอ (ไม่ซ่อนแม้ active ต่างจาก desktop) */}
              {context?.personal && (
                <button
                  type="button"
                  onClick={() =>
                    handleRowClick(context.personal!.shopId, false, context.personal!.shopId === activeShopId, {
                      name: displayName,
                      kind: 'personal',
                      logo: user?.avatar ?? null,
                    })
                  }
                  disabled={switching || context.personal.shopId === activeShopId}
                  className="hover:bg-default-100 flex w-full items-center gap-3 rounded-lg px-2 py-3 text-start disabled:opacity-50"
                >
                  <AccountAvatar src={user?.avatar ?? null} kind="personal" className="size-9" />
                  <span className="min-w-0 flex-1 truncate font-medium">{displayName}</span>
                  <span className="badge bg-default-100 text-default-500 shrink-0">ส่วนตัว</span>
                  {context.personal.shopId === activeShopId && (
                    <Icon icon="circle-check" className="text-primary shrink-0" aria-hidden="true" />
                  )}
                </button>
              )}

              {/* ยังไม่มีร้านส่วนตัว (ผู้ถูกเชิญ feature 00012) → เสนอให้สร้าง แทนตำแหน่งแถว personal
                  เส้นประ + primary = grammar เดียวกับ "เปิดร้านของฉันเอง" ที่ ChooseShopClient ใช้อยู่ */}
              {context && context.personal === null && (
                <button
                  type="button"
                  onClick={createPersonalShop}
                  disabled={creating}
                  className="border-primary/40 bg-primary/5 text-primary active:bg-primary/10 mb-2 flex w-full items-center gap-3 rounded-lg border border-dashed px-3 py-3 text-start disabled:opacity-50"
                >
                  <Icon
                    icon={creating ? 'loader-2' : 'plus'}
                    className={`size-5 shrink-0${creating ? ' animate-spin' : ''}`}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">สร้างร้านส่วนตัวของฉัน</span>
                    <span className="text-default-500 block text-xs">ขายของในนามตัวเอง — สร้างได้ครั้งเดียว</span>
                  </span>
                  <Icon icon="chevron-right" className="text-default-400 shrink-0" aria-hidden="true" />
                </button>
              )}

              {/* Business rows — แสดงทุกร้าน รวมแถว active (ติ๊ก) และแถว locked (lock icon) */}
              {context?.businesses.map((b) => {
                const isActive = b.shopId === activeShopId
                return (
                  <button
                    key={b.shopId}
                    type="button"
                    onClick={() =>
                      handleRowClick(b.shopId, b.locked, isActive, { name: b.shopName, kind: 'business', logo: b.logo })
                    }
                    disabled={switching || isActive}
                    className="hover:bg-default-100 flex w-full items-center gap-3 rounded-lg px-2 py-3 text-start disabled:opacity-50"
                  >
                    <AccountAvatar src={b.logo} kind="business" className="size-9" />
                    <span className="min-w-0 flex-1 truncate font-medium">{b.shopName}</span>
                    <span
                      className={`badge shrink-0 ${
                        b.role === 'OWNER' ? 'bg-primary/15 text-primary' : 'bg-info/15 text-info'
                      }`}
                    >
                      {b.role === 'OWNER' ? 'เจ้าของ' : 'ผู้ดูแล'}
                    </span>
                    {b.locked && (
                      <span className="badge bg-danger/15 text-danger inline-flex shrink-0 items-center">
                        <Icon icon="lock" className="size-3" aria-hidden="true" />
                      </span>
                    )}
                    {isActive && <Icon icon="circle-check" className="text-primary shrink-0" aria-hidden="true" />}
                  </button>
                )
              })}
            </div>
          )}

          {/* footer — ทางเข้า "ข้อมูลส่วนตัว" บนมือถือ. sheet นี้เป็นที่เดียวที่มือถือเข้าถึง UI
              ระดับ identity ได้จากทุกหน้า (bottom nav ไม่มีช่อง, dropdown เป็นของ desktop)
              ปิด sheet ก่อนด้วย data-hs-overlay ไม่งั้น panel ค้างทับหน้าปลายทาง */}
          <div className="border-default-200 mt-1 border-t pt-2">
            <Link
              href="/account"
              data-hs-overlay="#account-switcher-sheet"
              className="hover:bg-default-100 flex w-full items-center gap-3 rounded-lg px-3 py-3 text-start"
            >
              <Icon icon="user-circle" className="text-default-500 size-5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1 font-medium">ข้อมูลส่วนตัว</span>
              <Icon icon="chevron-right" className="text-default-400 shrink-0" aria-hidden="true" />
            </Link>
          </div>
        </div>
          </div>,
          document.body,
        )}

      <ShopSwitchOverlay show={switching} targetName={target?.name} targetKind={target?.kind} targetLogo={target?.logo} />
      {/* ยังไม่มีร้านให้เอ่ยชื่อตอนสร้าง — override ข้อความ ไม่งั้นขึ้น "กำลังสลับบัญชี" ซึ่งผิดเหตุการณ์ */}
      <ShopSwitchOverlay
        show={creating}
        label="กำลังเปิดร้านส่วนตัวให้คุณ…"
        subLabel="อีกสักครู่จะพาไปตั้งค่าร้านต่อ"
      />
    </>
  )
}
