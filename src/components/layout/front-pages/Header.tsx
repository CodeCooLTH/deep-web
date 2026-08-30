'use client'

// React Imports
import { useState } from 'react'

// Next Imports
import Link from 'next/link'

// Third-party Imports
import { useSession } from 'next-auth/react'
import classnames from 'classnames'

// MUI Imports
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import useMediaQuery from '@mui/material/useMediaQuery'
import useScrollTrigger from '@mui/material/useScrollTrigger'
import type { Theme } from '@mui/material/styles'

// Type Imports
import type { Mode } from '@core/types'

// Component Imports
import Logo from '@components/layout/shared/Logo'
import ModeDropdown from '@components/layout/shared/ModeDropdown'
import NotificationsDropdown from '@components/layout/shared/NotificationsDropdown'
import UserDropdown from '@components/layout/shared/UserDropdown'
import FrontMenu from './FrontMenu'
import CustomIconButton from '@core/components/mui/IconButton'

// Util Imports
import { frontLayoutClasses } from '@layouts/utils/layoutClasses'

// Styles Imports
import styles from './styles.module.css'

// solidHeader = บังคับให้ header เป็นพื้นทึบ+เงาทันที (ไม่ต้อง scroll) — ใช้กับหน้า buyer-app
// ที่ไม่มี hero รองพื้น (dashboard/orders/...) ให้ header เด่นตั้งแต่โหลด; landing คงโปร่งที่ท็อป
const Header = ({ mode, solidHeader = false }: { mode: Mode; solidHeader?: boolean }) => {
  // States
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)

  // Hooks
  const isBelowLgScreen = useMediaQuery((theme: Theme) => theme.breakpoints.down('lg'))
  const { status } = useSession()
  const isAuthed = status === 'authenticated'

  // Detect window scroll
  const trigger = useScrollTrigger({
    threshold: 0,
    disableHysteresis: true
  })

  return (
    <header className={classnames(frontLayoutClasses.header, styles.header)}>
      <div className={classnames(frontLayoutClasses.navbar, styles.navbar, { [styles.headerScrolled]: trigger || solidHeader })}>
        <div className={classnames(frontLayoutClasses.navbarContent, styles.navbarContent)}>
          {isBelowLgScreen ? (
            <div className='flex items-center gap-2 sm:gap-4'>
              {/* 44×44 — `IconButton` sizeMedium ของธีมให้ 38px ซึ่งต่ำกว่า tap target
                  ที่ DESIGN.md §Do's บังคับ · นี่คือทางเข้าเมนูหลักบนมือถือ ปุ่มที่พลาดบ่อยที่สุด */}
              <IconButton
                onClick={() => setIsDrawerOpen(true)}
                className='-mis-2'
                sx={{ inlineSize: 44, blockSize: 44 }}
              >
                <i className='tabler-menu-2 text-textPrimary' />
              </IconButton>
              <Link href='/' className='inline-flex items-center min-bs-11'>
                <Logo />
              </Link>
              <FrontMenu mode={mode} isDrawerOpen={isDrawerOpen} setIsDrawerOpen={setIsDrawerOpen} />
            </div>
          ) : (
            <>
              {/* logo ซ้าย */}
              <Link href='/' className='inline-flex items-center min-bs-11'>
                <Logo />
              </Link>
              {/* เมนูกลาง — flex-1 เพื่อดันให้อยู่กึ่งกลางระหว่าง logo กับ actions */}
              <div className='flex-1 flex justify-center'>
                <FrontMenu mode={mode} isDrawerOpen={isDrawerOpen} setIsDrawerOpen={setIsDrawerOpen} />
              </div>
            </>
          )}
          {/* `pie-1` — จุดสถานะ (`MuiBadge`) ของอวตารถูกยึดมุมขวาล่างและยื่นออกนอกกรอบ
              ตัวอวตารเอง ⇒ ตอนอวตารชิดขอบในของการ์ด จุดเขียวล้นออกไป 2px (วัดได้บนจอ 390px
              2026-08-31: การ์ดจบที่ x=366 แต่จุดจบที่ 368) · เว้นให้จุดมีที่ยืนในกรอบ */}
          <div className='flex items-center gap-2 sm:gap-4'>
            <ModeDropdown />
            {isAuthed ? (
              // Authed buyer ที่กลับมาดู landing — แสดง bell notification (FLAG-3
              // feat 00011) + UserDropdown (avatar + เมนูไป profile / dashboard /
              // settings / ออกจากระบบ) แทนปุ่ม Login/Signup
              <>
                <NotificationsDropdown />
                <UserDropdown />
              </>
            ) : isBelowLgScreen ? (
              <CustomIconButton
                component={Link}
                variant='contained'
                href='/auth/sign-up'
                color='primary'
              >
                <i className='tabler-user-plus text-xl' />
              </CustomIconButton>
            ) : (
              <div className='flex gap-2'>
                <Button
                  component={Link}
                  variant='outlined'
                  href='/auth/sign-in'
                  className='whitespace-nowrap'
                >
                  เข้าสู่ระบบ
                </Button>
                <Button
                  component={Link}
                  variant='contained'
                  href='/auth/sign-up'
                  startIcon={<i className='tabler-user-plus text-xl' />}
                  className='whitespace-nowrap'
                >
                  สมัครใช้งาน
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}

export default Header
