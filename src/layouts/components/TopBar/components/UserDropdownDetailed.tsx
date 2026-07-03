'use client'

import User1 from '@/assets/images/users/user-1.jpg'
import Icon from '@/components/wrappers/Icon'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import { Fragment, useEffect, useState } from 'react'
import { resolveBuyerBaseUrl } from '@/lib/buyer-url'
import { getTierLabel } from '@/lib/trust-tier'
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
        trustScore?: number
        // feat 00008 — คำนวณแล้วใน lib/auth.ts session callback
        hasBusinessMembership?: boolean
        activeShopId?: string | null
      }
    | undefined

  const displayName = user?.displayName ?? user?.username ?? 'ผู้ใช้'
  // email ถ้ามี ไม่งั้น fallback @username (บัญชี OTP-only ไม่มี email)
  const subline = user?.email ?? (user?.username ? `@${user.username}` : '')
  const trustScore = user?.trustScore ?? 0
  const tierLabel = getTierLabel(trustScore) // ชื่อ tier ตาม Tier Lists SSOT (src/lib/trust-tier.ts)

  const hasBusinessMembership = user?.hasBusinessMembership === true
  const activeShopId = user?.activeShopId

  const [context, setContext] = useState<BusinessContextResponse | null>(null)
  const [switching, setSwitching] = useState(false)

  useEffect(() => {
    // guard: fetch เฉพาะเมื่อมี business membership จริง (กันยิง request เปล่าให้ทุก seller)
    if (!hasBusinessMembership) return
    let cancelled = false
    fetch('/api/business/context')
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
    <div className="topbar-item hs-dropdown before:bg-default-700/35 relative inline-flex before:h-4.5 before:w-px before:content-['']">
      <button className="hs-dropdown-toggle topbar-link ms-2.5 cursor-pointer items-center px-3! flex" aria-haspopup="menu" aria-expanded="false" aria-label="Dropdown">
        {user?.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.avatar} alt={user.displayName} className="size-8 rounded-full lg:me-3 object-cover" />
        ) : (
          <Image src={User1} alt="user-image" className="size-8 rounded-full lg:me-3" />
        )}
        <div className="hidden lg:flex items-center gap-1.5">
          <span className="flex flex-col items-start">
            <h5 className="pro-username">{user?.displayName ?? user?.username ?? 'ผู้ใช้'}</h5>
            <span className="text-xs/none mb-0.5">{user?.username ? `@${user.username}` : ''}</span>
          </span>
          <Icon icon="chevron-down" className="align-middle" />
        </div>
      </button>
      <div className="hs-dropdown-menu min-w-60" role="menu" aria-orientation="vertical" aria-labelledby="hs-dropdown-with-icons">
        {/* header: avatar + ชื่อ + email/@username */}
        <div className="bg-primary/10 flex items-center gap-3 rounded-t px-3.5 py-3">
          {user?.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.avatar} alt={displayName} className="size-9 shrink-0 rounded-full object-cover" />
          ) : (
            <Image src={User1} alt="user-image" className="size-9 shrink-0 rounded-full" />
          )}
          <div className="min-w-0">
            <p className="text-body-color truncate text-sm font-semibold">{displayName}</p>
            {subline && <p className="text-default-400 truncate text-xs">{subline}</p>}
          </div>
        </div>
        {/* tier + trust score */}
        <div className="flex items-center justify-between gap-2 px-3.5 py-2">
          <span className="badge bg-primary/15 text-primary">{tierLabel}</span>
          <span className="text-default-500 text-xs">Trust Score {trustScore}/100</span>
        </div>
        <div className="dropdown-divider"></div>

        {/* สลับ context Personal ⇄ Business — แสดงเฉพาะ seller ที่เป็นสมาชิก business จริง
            (feat 00008 P4-6 ย้ายมาจาก sidebar AccountSwitcher ตามที่ user ต้องการ) */}
        {hasBusinessMembership && (
          <>
            <div className="px-3.5 pt-2 pb-1">
              <span className="text-default-400 text-xs">กำลังทำงานในบัญชี</span>
            </div>

            {/* Personal */}
            {context?.personal && (
              <button
                type="button"
                role="menuitem"
                onClick={() => handleSwitch(context.personal!.shopId, false)}
                disabled={switching}
                className="dropdown-item w-full text-start disabled:opacity-50"
              >
                <span className="me-1 align-middle" aria-hidden="true">
                  {activeShopId === context.personal.shopId ? '●' : '○'}
                </span>
                <span className="align-middle truncate">{context.personal.shopName}</span>
                <span className="badge bg-default-100 text-default-500 ms-auto shrink-0">ส่วนตัว</span>
              </button>
            )}

            {/* Business list */}
            {context?.businesses.map((b) => (
              <button
                key={b.shopId}
                type="button"
                role="menuitem"
                onClick={() => handleSwitch(b.shopId, b.locked)}
                disabled={switching}
                className="dropdown-item w-full text-start disabled:opacity-50"
              >
                <span className="me-1 align-middle" aria-hidden="true">
                  {activeShopId === b.shopId ? '●' : '○'}
                </span>
                <span className="align-middle truncate">{b.shopName}</span>
                <span
                  className={`badge ms-auto shrink-0 ${
                    b.role === 'OWNER' ? 'bg-primary/15 text-primary' : 'bg-info/15 text-info'
                  }`}
                >
                  {b.role === 'OWNER' ? 'เจ้าของ' : 'ผู้ดูแล'}
                </span>
                {b.locked && (
                  <span className="badge bg-danger/15 text-danger ms-1 inline-flex shrink-0 items-center gap-0.5">
                    <Icon icon="lock" className="size-3" aria-hidden="true" />
                  </span>
                )}
              </button>
            ))}
          </>
        )}

        {/* divider นี้แสดงคู่บล็อกสลับ context เท่านั้น กันดับเบิลกับ divider ด้านบนตอนไม่มี business */}
        {hasBusinessMembership && <div className="dropdown-divider"></div>}

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
  )
}

export default UserDropdown
