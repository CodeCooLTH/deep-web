'use client'

/**
 * Left sidebar สำหรับหน้า buyer account (Shopee-inspired)
 *
 * รูปแบบ:
 * - User card บนสุด: avatar + displayName + link "แก้ไขข้อมูลส่วนตัว"
 * - Menu items พร้อม icon + active highlight ตาม pathname
 *
 * Base: composed จาก Vuexy MUI Avatar/Typography + next/link (ไม่มี theme file
 * ตรงๆ สำหรับ Shopee-style pattern — compose จาก primitives ตามที่ user ขอ)
 */
import { useState } from 'react'
import type { ChangeEvent } from 'react'

import Avatar from '@mui/material/Avatar'
import Typography from '@mui/material/Typography'
import CircularProgress from '@mui/material/CircularProgress'
import classnames from 'classnames'
import { toast } from 'react-toastify'
import { uploadFileId } from '@/lib/upload-client'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

type SessionUser = {
  displayName?: string
  avatar?: string | null
  username?: string
  isShop?: boolean
}

type MenuItem = {
  href: string
  label: string
  icon: string
  external?: boolean
}

const MENU_ITEMS: MenuItem[] = [
  { href: '/dashboard', label: 'หน้าหลักของฉัน', icon: 'tabler-home' },
  { href: '/orders', label: 'คำสั่งซื้อของฉัน', icon: 'tabler-shopping-bag' },
  // B2 (feat 00011 Deep Chat, UX-Design-Spec.md resolved decision) — buyer inbox entry point
  { href: '/messages', label: 'ข้อความ', icon: 'tabler-message' },
  { href: '/reviews', label: 'รีวิวที่ให้', icon: 'tabler-star' },
  { href: '/badges', label: 'ความสำเร็จ', icon: 'tabler-award' },
  { href: '/settings/verification', label: 'ยืนยันตัวตน', icon: 'tabler-shield-check' },
  { href: '/settings/profile', label: 'ตั้งค่าบัญชี', icon: 'tabler-user-cog' },
]

export default function AccountSidebar() {
  const { data: session, update } = useSession()
  const pathname = usePathname()
  const router = useRouter()
  const user = (session?.user ?? {}) as SessionUser

  const displayName = user.displayName ?? ''
  const avatarUrl = user.avatar ?? undefined

  const [uploading, setUploading] = useState(false)

  // อัปโหลดรูปโปรไฟล์จากการคลิก avatar (ย้ายมาจากการ์ดใน /settings/profile)
  // อัปโหลด → บันทึก → useSession().update() ให้ avatar (sidebar+navbar) อัปเดตทันที
  const handleAvatarChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      toast.error('ไฟล์ต้องไม่เกิน 5MB')
      e.target.value = ''
      return
    }
    setUploading(true)
    try {
      // direct upload (2026-08-10) — ไม่ผ่าน body ของ function ที่ Vercel จำกัด 4.5MB
      const fileId = await uploadFileId(file, 'IMAGE')
      const save = await fetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatar: `/api/files/${fileId}` }),
      })
      if (!save.ok) {
        toast.error('บันทึกรูปไม่สำเร็จ')
        return
      }
      toast.success('อัพเดตรูปโปรไฟล์แล้ว')
      await update()
      router.refresh()
    } catch {
      toast.error('อัพโหลดรูปไม่สำเร็จ')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  // style เมนูแต่ละอัน — active = พื้นม่วงจาง + ตัวอักษร/ไอคอนม่วง; inactive = ไอคอนสีรอง + hover
  const itemCls = (active: boolean) =>
    classnames('flex items-center gap-3 pli-3 plb-3 rounded-lg transition-colors', {
      'bg-[var(--mui-palette-primary-lightOpacity)] text-[var(--mui-palette-primary-main)] font-medium': active,
      'text-[var(--mui-palette-text-primary)] hover:bg-[var(--mui-palette-action-hover)]': !active
    })
  const iconCls = (active: boolean) =>
    classnames('text-xl shrink-0', { 'text-[var(--mui-palette-text-secondary)]': !active })

  return (
    <nav className='flex flex-col gap-4 min-[768px]:sticky min-[768px]:top-24'>
      {/* User card */}
      <div className='flex items-center gap-3 pb-4 border-b border-[var(--mui-palette-divider)]'>
        {/* คลิก avatar เพื่อเปลี่ยนรูปโปรไฟล์ — overlay กล้อง (hover) / spinner (uploading), tint หมึกพลัมไม่ใช่ดำ */}
        <label htmlFor='sidebar-avatar-upload' className='relative shrink-0 cursor-pointer group' title='เปลี่ยนรูปโปรไฟล์'>
          <Avatar src={avatarUrl} sx={{ width: 56, height: 56 }}>
            {displayName.slice(0, 1)}
          </Avatar>
          <span
            className={classnames(
              'absolute inset-0 rounded-full flex items-center justify-center transition-opacity duration-150',
              uploading
                ? 'opacity-100 bg-[rgb(47_43_61_/_0.55)]'
                : 'opacity-0 group-hover:opacity-100 bg-[rgb(47_43_61_/_0.45)]'
            )}
          >
            {uploading ? (
              <CircularProgress size={18} sx={{ color: '#fff' }} />
            ) : (
              <i className='tabler-camera text-white text-lg' />
            )}
          </span>
          <input
            id='sidebar-avatar-upload'
            type='file'
            hidden
            accept='image/png, image/jpeg, image/webp'
            onChange={handleAvatarChange}
            disabled={uploading}
          />
        </label>
        <div className='min-w-0 flex-1'>
          <Typography className='font-medium truncate'>{displayName || 'ผู้ใช้'}</Typography>
          <Link
            href='/settings/profile'
            /* `min-bs-11` (44px) — เดิมสูง 16px ตามตัวหนังสือ ซึ่งต่ำกว่า tap target ที่บังคับไว้
               ตัวหนังสือยังเท่าเดิม พื้นที่แตะโปร่งรอบ ๆ โตขึ้นอย่างเดียว */
            className='text-[13px] text-[var(--mui-palette-text-secondary)] hover:text-[var(--mui-palette-primary-main)] inline-flex items-center gap-1 min-bs-11'
          >
            <i className='tabler-pencil text-[13px]' />
            แก้ไขข้อมูลส่วนตัว
          </Link>
        </div>
      </div>

      {/* Menu */}
      <ul className='list-none p-0 m-0 flex flex-col gap-1'>
        {MENU_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
          return (
            <li key={item.href}>
              <Link href={item.href} className={itemCls(active)}>
                <i className={classnames(item.icon, iconCls(active))} />
                <span className='text-[13px]'>{item.label}</span>
              </Link>
            </li>
          )
        })}

        {/* Public profile (conditional — only when username known) */}
        {user.username && (
          <li>
            <Link href={`/u/${user.username}`} className={itemCls(false)}>
              <i className={classnames('tabler-external-link', iconCls(false))} />
              <span className='text-[13px]'>โปรไฟล์สาธารณะ</span>
            </Link>
          </li>
        )}

        {/* Seller shortcut (conditional) */}
        {user.isShop && (
          <li>
            <a
              href={process.env.NEXT_PUBLIC_SELLER_URL ?? 'https://seller.deepthailand.app/dashboard'}
              target='_blank'
              rel='noopener noreferrer'
              className={itemCls(false)}
            >
              <i className={classnames('tabler-building-store', iconCls(false))} />
              <span className='text-[13px] flex-1'>ไปหน้าร้านค้า</span>
              <i className='tabler-external-link text-[13px] text-[var(--mui-palette-text-disabled)]' />
            </a>
          </li>
        )}
      </ul>
    </nav>
  )
}
