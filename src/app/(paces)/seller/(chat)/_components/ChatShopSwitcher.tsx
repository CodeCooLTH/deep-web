'use client'

/**
 * ChatShopSwitcher — ปุ่ม storefront ใน ChatHeader ที่คลิกแล้วเปิด dropdown สลับร้าน
 * (feat chat shop-switcher 2026-07-30) แทนที่ `<Link href="/dashboard">` เดิม (ปุ่มที่คลิกตรง
 * ไปหน้าหลักอย่างเดียว) — เพื่อให้ seller ที่ดูแลหลายร้านสลับ context ได้จากหน้าแชทเลย ไม่ต้อง
 * เด้งไป dashboard ก่อน สลับแล้วแชททั้งหมด (rail/unread/thread) โหลดใหม่ตามร้านที่เลือก
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/dropdowns/page.tsx (Menu Alignment block —
 *   hs-dropdown relative inline-flex [--placement:bottom-right] + hs-dropdown-toggle + hs-dropdown-menu)
 * Pattern (business-context logic + active box + list + badge role/lock): คัดจาก in-app
 *   src/layouts/components/TopBar/components/UserDropdownDetailed.tsx (feat 00008 — theme-sourced มาแล้ว)
 *   ตัดส่วนที่ไม่เกี่ยวกับ chat ออก (แพ็กเกจธุรกิจ/ตั้งค่าร้าน/เปิดหน้าร้าน/ออกจากระบบ) เหลือ
 *   active box + สลับบัญชี + กลับหน้าหลัก
 *
 * ต่างจาก UserDropdownDetailed:
 *   - trigger = AccountAvatar (วงกลม) + chevron-down badge มุมล่างขวา (ไม่กินความกว้าง header
 *     ที่แน่นบนมือถือ) แทนปุ่มยาว avatar+ชื่อ+chevron ของ topbar
 *   - useShopSwitcher({ landingPath: '/inbox' }) — กลับหน้าแชท ไม่ใช่ /dashboard
 *   - placement bottom-right (ชิดขวา) เพราะ trigger อยู่ค่อนไปทางขวาของ header
 */

import AccountAvatar from '@/components/AccountAvatar'
import ShopSwitchOverlay from '@/components/paces/ShopSwitchOverlay'
import Icon from '@/components/wrappers/Icon'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useEffect, useState } from 'react'
import { pacesToast } from '@/lib/paces-toast'
import { useShopSwitcher } from '@/hooks/useShopSwitcher'

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

export default function ChatShopSwitcher() {
  const { data: session } = useSession()
  const user = session?.user as SessionUser | undefined

  const displayName = user?.displayName ?? user?.username ?? 'ผู้ใช้'
  const hasBusinessMembership = user?.hasBusinessMembership === true
  const activeShopId = user?.activeShopId

  // identity ที่ active ตอนนี้ (business → ร้าน, ไม่งั้น personal)
  const isBusiness = user?.activeShopKind === 'BUSINESS'
  const activeName = isBusiness ? (user?.activeShopName ?? 'ร้านค้า') : displayName
  const activeLogo = isBusiness ? (user?.activeShopLogo ?? null) : (user?.avatar ?? null)
  const activeRoleLabel = isBusiness ? (user?.activeShopRole === 'ADMIN' ? 'ผู้ดูแล' : 'เจ้าของ') : 'ส่วนตัว'

  const [context, setContext] = useState<BusinessContextResponse | null>(null)
  // สลับแล้วกลับมาที่แชท (ไม่ใช่ /dashboard) — แชทของร้านใหม่โหลดตามทันทีหลัง hard-navigate
  const { switching, target, switchShop } = useShopSwitcher({ landingPath: '/inbox' })

  useEffect(() => {
    // guard: fetch เฉพาะเมื่อมี business membership จริง (กันยิง request เปล่าให้ seller ร้านเดียว)
    if (!hasBusinessMembership) return
    let cancelled = false
    // no-store + cache-buster query: กัน cache ทุกชั้น serve response เก่า (ร้านใหม่ไม่โผล่)
    fetch(`/api/business/context?_t=${Date.now()}`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setContext({ personal: data.personal, businesses: data.businesses ?? [] })
      })
      .catch(() => {
        /* เงียบ — progressive enhancement ไม่บล็อก UI หลักของ dropdown */
      })
    return () => {
      cancelled = true
    }
  }, [hasBusinessMembership])

  const handleSwitch = (
    shopId: string,
    locked: boolean,
    targetInfo: { name: string; kind: 'personal' | 'business'; logo: string | null },
  ) => {
    if (switching || shopId === activeShopId) return
    if (locked) {
      pacesToast.error('บัญชีนี้ถูกล็อกชั่วคราว — ไม่สามารถสลับเข้าใช้งานได้')
      return
    }
    switchShop(shopId, targetInfo)
  }

  return (
    <>
      <div className="hs-dropdown relative inline-flex [--placement:bottom-right]">
        {/* trigger — avatar วงกลม + chevron badge มุมล่างขวา (สื่อว่าเป็นเมนู ไม่เพิ่มความกว้าง header) */}
        <button
          type="button"
          className="hs-dropdown-toggle relative inline-flex size-11 shrink-0 cursor-pointer items-center justify-center"
          aria-haspopup="menu"
          aria-expanded="false"
          aria-label="สลับร้าน"
        >
          <AccountAvatar src={activeLogo} kind={isBusiness ? 'business' : 'personal'} className="size-9" />
          <span className="border-default-300 bg-card absolute end-0.5 bottom-0.5 inline-flex size-4 items-center justify-center rounded-full border">
            <Icon icon="chevron-down" className="text-default-600 size-3" />
          </span>
        </button>

        <div className="hs-dropdown-menu min-w-72 p-2" role="menu" aria-orientation="vertical">
          {/* active account — กล่องไฮไลต์บนสุด (จาก session, ไม่รอ fetch) */}
          <div className="border-primary bg-primary/5 flex items-center gap-3 rounded-lg border px-3 py-2.5">
            <AccountAvatar src={activeLogo} kind={isBusiness ? 'business' : 'personal'} className="size-9" />
            <div className="min-w-0">
              <p className="text-body-color truncate text-sm font-semibold">{activeName}</p>
              <p className="text-default-400 truncate text-xs">{activeRoleLabel}</p>
            </div>
          </div>

          {/* สลับบัญชี — เฉพาะ seller ที่มี business membership; list ไม่รวมบัญชีที่ active */}
          {hasBusinessMembership && (
            <>
              <div className="px-2 pt-3 pb-1">
                <span className="text-default-400 text-xs">สลับบัญชี</span>
              </div>

              {/* Personal (ซ่อนถ้า personal = active) */}
              {context?.personal && activeShopId !== context.personal.shopId && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() =>
                    handleSwitch(context.personal!.shopId, false, {
                      name: displayName,
                      kind: 'personal',
                      logo: user?.avatar ?? null,
                    })
                  }
                  disabled={switching}
                  className="dropdown-item flex w-full items-center gap-3 text-start disabled:opacity-50"
                >
                  <AccountAvatar src={user?.avatar} kind="personal" className="size-7" />
                  <span className="flex-1 truncate">{displayName}</span>
                  <span className="badge bg-default-100 text-default-500 shrink-0">ส่วนตัว</span>
                </button>
              )}

              {/* Business list (ซ่อนตัวที่ = active) */}
              {context?.businesses
                .filter((b) => b.shopId !== activeShopId)
                .map((b) => (
                  <button
                    key={b.shopId}
                    type="button"
                    role="menuitem"
                    onClick={() => handleSwitch(b.shopId, b.locked, { name: b.shopName, kind: 'business', logo: b.logo })}
                    disabled={switching}
                    className="dropdown-item flex w-full items-center gap-3 text-start disabled:opacity-50"
                  >
                    <AccountAvatar src={b.logo} kind="business" className="size-7" />
                    <span className="flex-1 truncate">{b.shopName}</span>
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
                  </button>
                ))}
            </>
          )}

          <div className="dropdown-divider"></div>

          <Link href="/dashboard" className="dropdown-item" aria-label="กลับหน้าหลัก">
            <Icon icon="home-2" className="fs-lg me-1 align-middle" />
            <span className="align-middle">กลับหน้าหลัก</span>
          </Link>
        </div>
      </div>

      <ShopSwitchOverlay show={switching} targetName={target?.name} targetKind={target?.kind} targetLogo={target?.logo} />
    </>
  )
}
