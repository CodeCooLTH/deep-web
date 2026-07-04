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
 *   (fetch /api/business/context guard by hasBusinessMembership, handleSwitch → POST switch-context →
 *    session.update({activeShopId}) → router.refresh(), switching spinner overlay z-[1070])
 */

import AccountAvatar from '@/components/AccountAvatar'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useEffect, useState } from 'react'

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
  const { data: session, update } = useSession()
  const router = useRouter()
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
  const [switching, setSwitching] = useState(false)

  useEffect(() => {
    // guard: fetch เฉพาะเมื่อมี business membership จริง (เหมือน UserDropdownDetailed)
    if (!hasBusinessMembership) return
    let cancelled = false
    fetch('/api/business/context')
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

  // handleSwitch — copy ตรงจาก UserDropdownDetailed (ตัด param locked ออก เพราะ caller
  // กรอง locked ก่อนเรียกแล้ว — ดู handleRowClick ด้านล่าง)
  const handleSwitch = async (shopId: string) => {
    if (switching || shopId === activeShopId) return
    setSwitching(true)
    try {
      const res = await fetch('/api/business/switch-context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopId }),
      })
      if (res.status === 403) {
        pacesToast.error('ไม่มีสิทธิ์เข้าถึงบัญชีนี้แล้ว')
        return
      }
      if (!res.ok) {
        pacesToast.error('สลับบัญชีไม่สำเร็จ กรุณาลองใหม่')
        return
      }
      // jwt callback จะ re-verify membership อีกชั้นก่อนเชื่อค่านี้จริง (API.md §4.15, 2-layer verify)
      await update({ activeShopId: shopId })
      router.refresh()
    } catch {
      pacesToast.error('สลับบัญชีไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setSwitching(false)
    }
  }

  // แถวแต่ละแถวมี 3 พฤติกรรม: active=ไม่ clickable, locked=toast อย่างเดียว (ไม่ยิง API,
  // ไม่ปิด sheet), อื่น ๆ = สลับ + ปิด sheet ทันที (ไม่รอ fetch — flag ให้ QA ดู race กับ router.refresh)
  function handleRowClick(shopId: string, locked: boolean, isActive: boolean) {
    if (isActive) return
    if (locked) {
      pacesToast.error('บัญชีนี้ถูกล็อกชั่วคราว — ไม่สามารถสลับเข้าใช้งานได้')
      return
    }
    handleSwitch(shopId)
    window.HSOverlay?.close('#account-switcher-sheet')
  }

  const loading = hasBusinessMembership && context === null && !fetchFailed

  return (
    <>
      {/*
        HR7 arbitrary: max-h-[80vh] — Paces ไม่มี viewport-relative max-height token
        สำหรับ bottom sheet body scroll (จำเป็นจริง กันเนื้อหายาวล้นจอมือถือ)
      */}
      <div
        id="account-switcher-sheet"
        className="hs-overlay hs-overlay-open:translate-y-0 bg-card border-default-300 fixed inset-x-0 bottom-0 z-80 hidden max-h-[80vh] w-full translate-y-full transform flex-col rounded-t-2xl border-t transition-all duration-300"
        role="dialog"
        tabIndex={-1}
        aria-labelledby="account-switcher-sheet-label"
      >
        {/* drag handle */}
        <div className="flex shrink-0 justify-center pt-3 pb-1">
          <span className="h-1 w-10 rounded-full bg-default-300" aria-hidden="true" />
        </div>

        {/* header */}
        <div className="flex shrink-0 items-center justify-between px-5 py-3">
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

        {/* body — scroll เมื่อรายการยาวเกิน max-h */}
        <div className="overflow-y-auto px-3 pb-[env(safe-area-inset-bottom)]">
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
                  onClick={() => handleRowClick(context.personal!.shopId, false, context.personal!.shopId === activeShopId)}
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

              {/* Business rows — แสดงทุกร้าน รวมแถว active (ติ๊ก) และแถว locked (lock icon) */}
              {context?.businesses.map((b) => {
                const isActive = b.shopId === activeShopId
                return (
                  <button
                    key={b.shopId}
                    type="button"
                    onClick={() => handleRowClick(b.shopId, b.locked, isActive)}
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
        </div>
      </div>

      {/* overlay สลับบัญชี — spinner กลางจอ (copy ตรงจาก UserDropdownDetailed)
          z-[1070] จำเป็น: สูงกว่า sheet/backdrop, ต่ำกว่า toast 1080 — HR7 exception (precedent PacesToastContainer z-[1080]) */}
      {switching && (
        <div
          className="fixed inset-0 z-[1070] flex items-center justify-center bg-default-900/40 backdrop-blur-xs"
          role="status"
          aria-live="polite"
          aria-label="กำลังสลับบัญชี"
        >
          <div className="border-primary size-12 animate-spin rounded-full border-4 border-t-transparent" />
        </div>
      )}
    </>
  )
}
