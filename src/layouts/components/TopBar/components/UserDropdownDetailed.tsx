'use client'

import AccountAvatar from '@/components/AccountAvatar'
import Icon from '@/components/wrappers/Icon'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import { Fragment, useEffect, useState } from 'react'
import { resolveBuyerBaseUrl } from '@/lib/buyer-url'
import { pacesToast } from '@/lib/paces-toast'

type UserProfileMenuType = {
  label: string
  icon: string
  link: string
  divider?: boolean
  className?: string
  action?: 'sign-out'
}

// สลับ context Personal ⇄ Business — feat 00008 P4-6 (ย้ายจาก sidebar AccountSwitcher เข้ามาที่นี่)
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

// เหลือเฉพาะ sign-out — ตัด บัญชีของฉัน/การแจ้งเตือน/ตั้งค่าบัญชี/ช่วยเหลือ
// ที่ลิงก์ไป /my-account (404) หรือ '#' ออก จนกว่าจะมี route จริง (consistent กับ UserProfileSettings)
const userProfileMenuData: UserProfileMenuType[] = [
  { label: 'ออกจากระบบ', icon: 'logout', link: '#', action: 'sign-out', className: 'font-semibold' },
]

const UserDropdown = () => {
  const { data: session, update } = useSession()
  const router = useRouter()
  const user = (session as any)?.user as
    | {
        id: string
        displayName: string
        username: string
        email: string | null
        avatar: string | null
        isShop?: boolean
        // feat 00008 — คำนวณแล้วใน lib/auth.ts session callback
        hasBusinessMembership?: boolean
        activeShopId?: string | null
        activeShopRole?: 'OWNER' | 'ADMIN'
        activeShopKind?: 'PERSONAL' | 'BUSINESS'
        activeShopName?: string | null
        activeShopLogo?: string | null
      }
    | undefined

  const displayName = user?.displayName ?? user?.username ?? 'ผู้ใช้'

  const hasBusinessMembership = user?.hasBusinessMembership === true
  const activeShopId = user?.activeShopId

  // identity ที่โชว์ (topbar button + active box) — business active → ร้าน, ไม่งั้น personal
  const isBusiness = user?.activeShopKind === 'BUSINESS'
  const activeName = isBusiness ? (user?.activeShopName ?? 'ร้านค้า') : displayName
  const activeLogo = isBusiness ? (user?.activeShopLogo ?? null) : (user?.avatar ?? null)
  const activeRoleLabel = isBusiness ? (user?.activeShopRole === 'ADMIN' ? 'ผู้ดูแล' : 'เจ้าของ') : 'ส่วนตัว'

  const [context, setContext] = useState<BusinessContextResponse | null>(null)
  const [switching, setSwitching] = useState(false)

  useEffect(() => {
    // guard: fetch เฉพาะเมื่อมี business membership จริง (กันยิง request เปล่าให้ทุก seller)
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

  const handleSwitch = async (shopId: string, locked: boolean) => {
    if (switching || shopId === activeShopId) return
    if (locked) {
      pacesToast.error('บัญชีนี้ถูกล็อกชั่วคราว — ไม่สามารถสลับเข้าใช้งานได้')
      return
    }
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

  const handleItemClick = (e: React.MouseEvent<HTMLAnchorElement>, item: UserProfileMenuType) => {
    if (item.action === 'sign-out') {
      e.preventDefault()
      signOut({ callbackUrl: '/auth/sign-in' })
    }
  }

  return (
    <>
    <div className="topbar-item hs-dropdown before:bg-default-700/35 relative inline-flex before:h-4.5 before:w-px before:content-['']">
      <button className="hs-dropdown-toggle topbar-link ms-2.5 cursor-pointer items-center px-3! flex" aria-haspopup="menu" aria-expanded="false" aria-label="Dropdown">
        <AccountAvatar src={activeLogo} kind={isBusiness ? 'business' : 'personal'} className="size-8 lg:me-3" />
        <div className="hidden lg:flex items-center gap-1.5">
          <span className="flex flex-col items-start">
            <h5 className="pro-username">{activeName}</h5>
            <span className="text-xs/none mb-0.5">{activeRoleLabel}</span>
          </span>
          <Icon icon="chevron-down" className="align-middle" />
        </div>
      </button>
      <div className="hs-dropdown-menu min-w-72 p-2" role="menu" aria-orientation="vertical" aria-labelledby="hs-dropdown-with-icons">
        {/* active account — กล่องไฮไลต์บนสุด (แทนกล่องน้ำเงิน FB ด้วย border-primary; ตัด tier/trust ออก) */}
        <div className="border border-primary bg-primary/5 rounded-lg flex items-center gap-3 px-3 py-2.5">
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
                onClick={() => handleSwitch(context.personal!.shopId, false)}
                disabled={switching}
                className="dropdown-item w-full flex items-center gap-3 text-start disabled:opacity-50"
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
                  onClick={() => handleSwitch(b.shopId, b.locked)}
                  disabled={switching}
                  className="dropdown-item w-full flex items-center gap-3 text-start disabled:opacity-50"
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

        <Link href="/business" className="dropdown-item">
          <Icon icon="rocket" className="me-1 fs-lg align-middle" />
          <span className="align-middle">แพ็กเกจธุรกิจ</span>
        </Link>

        <Link href="/shop" className="dropdown-item">
          <Icon icon="settings" className="me-1 fs-lg align-middle" />
          <span className="align-middle">โปรไฟล์ / ตั้งค่าร้าน</span>
        </Link>

        {/* เปิดหน้าร้าน — แสดงเมื่อมี username (ทุก user มีหน้าโปรไฟล์สาธารณะ /u/[username] ไม่ว่าจะเปิดร้านหรือยัง; ข้าม subdomain ใช้ <a> ธรรมดา) */}
        {user?.username && (
          <a
            href={`${resolveBuyerBaseUrl()}/u/${user.username}`}
            target="_blank"
            rel="noopener noreferrer"
            className="dropdown-item"
          >
            <Icon icon="building-store" className="me-1 fs-lg align-middle" />
            <span className="align-middle">เปิดหน้าร้าน</span>
            <Icon icon="external-link" className="ms-auto size-3.5 align-middle" />
          </a>
        )}

        <div className="dropdown-divider"></div>

        {userProfileMenuData.map((item, idx) => (
          <Fragment key={idx}>
            <Link
              href={item.link}
              onClick={(e) => handleItemClick(e, item)}
              className={`dropdown-item${item.className ? ' ' + item.className : ''}`}
            >
              <Icon icon={item.icon} className="me-1 fs-lg align-middle" />
              <span className="align-middle">{item.label}</span>
            </Link>
            {item.divider && <div className="dropdown-divider"></div>}
          </Fragment>
        ))}
      </div>
    </div>

    {/* overlay สลับบัญชี — spinner กลางจอบอก user ว่ากำลังเปลี่ยนบัญชี (ระหว่าง await update() session)
        z-[1070] จำเป็น: สูงกว่า dropdown/backdrop, ต่ำกว่า toast 1080 — HR7 exception (precedent PacesToastContainer z-[1080]) */}
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

export default UserDropdown
