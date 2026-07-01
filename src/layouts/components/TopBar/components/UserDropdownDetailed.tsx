'use client'

import User1 from '@/assets/images/users/user-1.jpg'
import Icon from '@/components/wrappers/Icon'
import Image from 'next/image'
import Link from 'next/link'
import { signOut, useSession } from 'next-auth/react'
import { Fragment } from 'react'
import { resolveBuyerBaseUrl } from '@/lib/buyer-url'
import { getTierLabel } from '@/lib/trust-tier'

type UserProfileMenuType = {
  label: string
  icon: string
  link: string
  divider?: boolean
  className?: string
  action?: 'sign-out'
}

// เหลือเฉพาะ sign-out — ตัด บัญชีของฉัน/การแจ้งเตือน/ตั้งค่าบัญชี/ช่วยเหลือ
// ที่ลิงก์ไป /my-account (404) หรือ '#' ออก จนกว่าจะมี route จริง (consistent กับ UserProfileSettings)
const userProfileMenuData: UserProfileMenuType[] = [
  { label: 'ออกจากระบบ', icon: 'logout', link: '#', action: 'sign-out', className: 'font-semibold' },
]

const UserDropdown = () => {
  const { data: session } = useSession()
  const user = (session as any)?.user as
    | {
        id: string
        displayName: string
        username: string
        email: string | null
        avatar: string | null
        isShop?: boolean
        trustScore?: number
      }
    | undefined

  const displayName = user?.displayName ?? user?.username ?? 'ผู้ใช้'
  // email ถ้ามี ไม่งั้น fallback @username (บัญชี OTP-only ไม่มี email)
  const subline = user?.email ?? (user?.username ? `@${user.username}` : '')
  const trustScore = user?.trustScore ?? 0
  const tierLabel = getTierLabel(trustScore) // ชื่อ tier ตาม Tier Lists SSOT (src/lib/trust-tier.ts)

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
