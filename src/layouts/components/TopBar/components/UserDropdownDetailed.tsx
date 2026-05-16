'use client'

import User1 from '@/assets/images/users/user-1.jpg'
import Icon from '@/components/wrappers/Icon'
import Image from 'next/image'
import Link from 'next/link'
import { signOut, useSession } from 'next-auth/react'
import { Fragment } from 'react'

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
    | { id: string; displayName: string; username: string; avatar: string | null }
    | undefined

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
      <div className="hs-dropdown-menu min-w-48" role="menu" aria-orientation="vertical" aria-labelledby="hs-dropdown-with-icons">
        <div className="py-2 px-3.5">
          <h6 className="text-xs">ยินดีต้อนรับ 👋</h6>
        </div>
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
