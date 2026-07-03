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

const Header = ({ mode }: { mode: Mode }) => {
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
      <div className={classnames(frontLayoutClasses.navbar, styles.navbar, { [styles.headerScrolled]: trigger })}>
        <div className={classnames(frontLayoutClasses.navbarContent, styles.navbarContent)}>
          {isBelowLgScreen ? (
            <div className='flex items-center gap-2 sm:gap-4'>
              <IconButton onClick={() => setIsDrawerOpen(true)} className='-mis-2'>
                <i className='tabler-menu-2 text-textPrimary' />
              </IconButton>
              <Link href='/'>
                <Logo />
              </Link>
              <FrontMenu mode={mode} isDrawerOpen={isDrawerOpen} setIsDrawerOpen={setIsDrawerOpen} />
            </div>
          ) : (
            <div className='flex items-center gap-10'>
              <Link href='/'>
                <Logo />
              </Link>
              <FrontMenu mode={mode} isDrawerOpen={isDrawerOpen} setIsDrawerOpen={setIsDrawerOpen} />
            </div>
          )}
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
