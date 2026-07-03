// RSC shell — /messages/[shopId] (feature 00011 Deep Chat, S-10)
//
// Base (header structure): theme/vuexy/typescript-version/full-version/src/views/apps/chat/ChatContent.tsx
//   (UserAvatar header block L37-64, L116-140) — ตัด OptionMenu/phone/video/search ทั้งหมด, avatar+ชื่อร้าน
//   + back button (tabler-arrow-left) เท่านั้น
// Base (back-button-in-RSC pattern): src/views/pages/user-profile/UserProfileHeader.tsx ProfileBanner —
//   wrap IconButton ด้วย next/link แทน component={Link} (Hard Rule 2 / docs/conventions/rsc-mui-navigation.md #2)
//
// RSC ทำหน้าที่ fetch shop identity (แสดง header ทันทีไม่ต้องรอ client mount) แล้ว mount
// ChatThread (client) ที่ดึงข้อความ/ส่งข้อความ/realtime เอง
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import NextLink from 'next/link'

import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'

import { Icon } from '@iconify/react'

import { prisma } from '@/lib/prisma'
import CustomAvatar from '@core/components/mui/Avatar'
import { getInitials } from '@/utils/getInitials'

import ChatThread from './ChatThread'

type Props = { params: Promise<{ shopId: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { shopId } = await params
  const shop = await prisma.shop.findUnique({ where: { id: shopId }, select: { shopName: true } })
  return { title: shop ? `แชทกับ ${shop.shopName}` : 'ไม่พบร้านค้า' }
}

export default async function MessageThreadPage({ params }: Props) {
  const { shopId } = await params
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: { id: true, shopName: true, logo: true },
  })
  if (!shop) notFound()

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: { xs: 'calc(100dvh - 220px)', lg: 'calc(100dvh - 260px)' },
        minHeight: 420,
        bgcolor: 'background.paper',
        borderRadius: 1,
        border: '1px solid',
        borderColor: 'divider',
        overflow: 'hidden',
      }}
    >
      {/* Header — avatar+ชื่อร้าน+back เท่านั้น (ตัด OptionMenu/phone/video/search ตาม UX spec) */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          py: '14px',
          px: '16px',
          borderBottom: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
          flexShrink: 0,
        }}
      >
        <NextLink href='/messages' aria-label='กลับไปหน้าข้อความ'>
          <IconButton size='small' color='secondary'>
            <Icon icon='tabler-arrow-left' fontSize={20} />
          </IconButton>
        </NextLink>
        <CustomAvatar src={shop.logo ? `/api/files/${shop.logo}` : undefined} skin='light' size={40}>
          {getInitials(shop.shopName)}
        </CustomAvatar>
        <Typography sx={{ fontWeight: 700 }} className='truncate'>
          {shop.shopName}
        </Typography>
      </Box>

      <ChatThread shopId={shop.id} shopName={shop.shopName} shopLogo={shop.logo} />
    </Box>
  )
}
