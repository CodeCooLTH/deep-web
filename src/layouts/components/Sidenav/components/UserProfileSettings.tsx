/**
 * Base: theme/paces/Admin/TS/src/layouts/components/Sidenav/components/UserProfileSettings.tsx
 *
 * การปรับจาก theme:
 * - เพิ่ม 'use client' เพื่อใช้ useSession() จาก next-auth/react
 * - แทนที่ hardcoded "Art Director" / user-1.jpg ด้วยข้อมูล session จริง
 * - copy session-access pattern เดียวกันกับ UserDropdownDetailed.tsx
 * - ตัด Profile / Account Settings / Lock Screen ออก (ยังไม่มี route จริงใน seller/admin — กัน 404)
 * - เหลือเฉพาะ header ต้อนรับ + Log Out จนกว่าจะมีหน้า profile/settings จริง
 * - wire Log Out ผ่าน signOut({ callbackUrl: '/auth/sign-in' }) เหมือน UserDropdownDetailed
 */
'use client'

import bgPattern from '@/assets/images/user-bg-pattern.svg'
import AccountAvatar from '@/components/AccountAvatar'
import Icon from '@/components/wrappers/Icon'
import Link from 'next/link'
import { signOut, useSession } from 'next-auth/react'
import { resolveBuyerBaseUrl } from '@/lib/buyer-url'

const UserProfileSettings = () => {
  // session shape เหมือน UserDropdownDetailed — cast เพื่อเข้าถึง custom fields
  const { data: session } = useSession()
  const user = (session as any)?.user as
    | { id: string; displayName: string; username: string; avatar: string | null; isShop?: boolean }
    | undefined

  // บล็อกบัญชีใน sidebar = ข้อมูลส่วนตัวเสมอ (ไม่สะท้อน business ที่ active — ตาม user 2026-07-04)
  const dispName = user?.displayName ?? user?.username ?? 'ผู้ขาย'

  const handleSignOut = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault()
    signOut({ callbackUrl: '/auth/sign-in' })
  }

  return (
    <div id="user-profile-settings" className={`sidenav-user p-5`} style={{ backgroundImage: `url("${bgPattern.src}")` }}>
      <div className="flex items-center justify-between">
        <div>
          <Link href="/dashboard" className="link-reset">
            <AccountAvatar src={user?.avatar} kind="personal" className="mb-3 size-9" />
            <span className="sidenav-user-name block font-bold text-nowrap">{dispName}</span>
            <span className="text-xs font-semibold" data-lang="user-role">
              ผู้ขาย
            </span>
          </Link>
        </div>
        <div>
          <div className="hs-dropdown relative inline-flex [--placement:bottom-right]">
            <button className="cursor-pointer" aria-haspopup="menu" aria-expanded="false" aria-label="Dropdown">
              <Icon icon="settings" className="ms-1 size-6 align-middle" />
            </button>
            <div className="hs-dropdown-menu" role="menu" aria-orientation="vertical" aria-labelledby="hs-dropdown-with-icons">
              <div className="py-2 px-3.5">
                <h6 className="text-xs">ยินดีต้อนรับ 👋</h6>
              </div>
              {/* เปิดหน้าร้าน — แสดงเมื่อมี username (ทุก user มีหน้าโปรไฟล์สาธารณะ /u/[username] ไม่ว่าจะเปิดร้านหรือยัง; ข้าม subdomain ใช้ <a> ธรรมดา) */}
              {user?.username && (
                <>
                  <a
                    href={`${resolveBuyerBaseUrl()}/u/${user.username}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="dropdown-item"
                  >
                    <Icon icon="building-store" className="me-1 align-middle text-lg" />
                    <span className="align-middle">เปิดหน้าร้าน</span>
                  </a>
                  <div className="dropdown-divider"></div>
                </>
              )}
              <Link href="#" className="dropdown-item text-danger" onClick={handleSignOut}>
                <Icon icon="logout" className="me-1 align-middle text-lg" />
                <span className="align-middle">ออกจากระบบ</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default UserProfileSettings
