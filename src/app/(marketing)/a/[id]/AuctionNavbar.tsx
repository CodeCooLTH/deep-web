'use client'

/**
 * AuctionNavbar — top navbar เฉพาะหน้า public auction detail `/a/[id]` (feature 00004, scope S-A4)
 *
 * ทำไม: หน้า /a/[id] เดิมอยู่ใน MobileFrame เต็ม ๆ ไม่มี navbar เลย — บน viewport ≥600px (sm+)
 * ต้องมี top bar แบบ "flat sticky" (คนละ mood กับ Header.tsx marketing ทั่วไปที่เป็น
 * floating-pill + backdrop-blur + scroll-elevation) ให้ผู้ซื้อกลับหน้าแรกได้ + เห็นตำแหน่งตัวเอง
 * ว่าอยู่หน้า "ประมูล". มือถือ (<600px) ยังคง full-bleed ไม่มี navbar — MobileFrame.tsx เดิม
 * ไม่ถูกแตะ (OOS-7)
 *
 * ลิงก์/ไอคอนที่ยังไม่มีปลายทางจริง (หมวดหมู่ / รายการที่ติดตาม global / แจ้งเตือน) render เป็น
 * disabled + Tooltip "เร็ว ๆ นี้" ตาม user decision — ห้าม wire fake route
 * (♡ ในนี้คนละอันกับปุ่ม watch ต่อ-auction ใน AuctionBidPanel — อันนี้คือ placeholder
 * "รายการที่ติดตามทั้งหมด" ระดับแอป)
 *
 * Base: theme/vuexy/typescript-version/full-version/src/components/layout/front-pages/Header.tsx
 *   (AppBar/sticky-bar structure — ปรับเป็น flat bar ไม่มี shadow/blur/scroll-elevation ต่างจาก
 *   Header.tsx เดิม) + FrontMenu.tsx (Typography component={Link} nav-link pattern)
 *   — reuse Logo.tsx + UserDropdown.tsx (src/components/layout/shared) ตรง ๆ ไม่แก้
 * Ref-mockup: docs/mockups/auction/seller-auction-v1.html#D6 #T4
 */
import Link from 'next/link'

import { useSession } from 'next-auth/react'

import AppBar from '@mui/material/AppBar'
import Toolbar from '@mui/material/Toolbar'
import Container from '@mui/material/Container'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Skeleton from '@mui/material/Skeleton'

import { Icon } from '@iconify/react'

import Logo from '@components/layout/shared/Logo'
import UserDropdown from '@components/layout/shared/UserDropdown'

type Props = {
  auctionId: string
}

export default function AuctionNavbar({ auctionId }: Props) {
  const { status } = useSession()

  return (
    <AppBar
      position="sticky"
      component="nav"
      elevation={0}
      sx={{
        top: 0,
        zIndex: (theme) => theme.zIndex.appBar,
        bgcolor: 'background.paper',
        borderBottom: '1px solid',
        borderColor: 'divider',
        borderRadius: 0,
        boxShadow: 'none',
        backgroundImage: 'none',
        // มือถือ (<600px): ไม่มี navbar เลย — MobileFrame เดิม full-bleed ตามปกติ
        display: { xs: 'none', sm: 'block' },
      }}
    >
      <Container maxWidth={false} sx={{ maxWidth: 840, px: { xs: 2, sm: 3 } }}>
        <Toolbar disableGutters sx={{ minHeight: { xs: 56, md: 58 }, gap: { xs: 2, md: 3 } }}>
          {/* Logo → กลับหน้าแรก */}
          <Box component={Link} href="/" sx={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            <Logo />
          </Box>

          {/* หน้าแรก — ซ่อนบน sm ตาม T4 (sm โชว์แค่ Logo/ประมูล/หัวใจ/avatar), โชว์จาก md ขึ้นไป */}
          <Typography
            component={Link}
            href="/"
            sx={{
              display: { xs: 'none', md: 'inline-flex' },
              color: 'text.primary',
              fontWeight: 500,
              textDecoration: 'none',
              '&:hover': { color: 'primary.main' },
            }}
          >
            หน้าแรก
          </Typography>

          {/* ประมูล — active label ของหน้านี้เอง ไม่ใช่ลิงก์ */}
          <Typography component="span" sx={{ color: 'primary.main', fontWeight: 700, cursor: 'default' }}>
            ประมูล
          </Typography>

          {/* หมวดหมู่ — ยังไม่มีปลายทางจริง → disabled + tooltip (ห้าม wire fake route) */}
          <Tooltip title="เร็ว ๆ นี้">
            <Typography
              component="span"
              sx={{
                display: { xs: 'none', md: 'inline-flex' },
                color: 'text.disabled',
                fontWeight: 500,
                cursor: 'not-allowed',
              }}
            >
              หมวดหมู่
            </Typography>
          </Tooltip>

          <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1 }}>
            {/* watchlist ระดับแอป (global) — placeholder ยังไม่มีปลายทาง */}
            <Tooltip title="เร็ว ๆ นี้">
              <span>
                <IconButton disabled aria-label="รายการที่ติดตาม">
                  <Icon icon="tabler-heart" />
                </IconButton>
              </span>
            </Tooltip>

            {/* แจ้งเตือน — desktop only (md+), placeholder ยังไม่มีปลายทาง */}
            <Tooltip title="เร็ว ๆ นี้">
              <span style={{ display: 'inline-flex' }}>
                <IconButton
                  disabled
                  aria-label="การแจ้งเตือน"
                  sx={{ display: { xs: 'none', md: 'inline-flex' } }}
                >
                  <Icon icon="tabler-bell" />
                </IconButton>
              </span>
            </Tooltip>

            {/* avatar / เข้าสู่ระบบ — status==='loading' โชว์ skeleton กัน flash */}
            {status === 'loading' ? (
              <Skeleton variant="circular" width={38} height={38} />
            ) : status === 'authenticated' ? (
              <UserDropdown />
            ) : (
              <Button
                component={Link}
                href={`/auth/sign-in?callbackUrl=${encodeURIComponent(`/a/${auctionId}`)}`}
                variant="text"
                sx={{ whiteSpace: 'nowrap' }}
              >
                เข้าสู่ระบบ
              </Button>
            )}
          </Box>
        </Toolbar>
      </Container>
    </AppBar>
  )
}
