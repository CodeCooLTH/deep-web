'use client'

/**
 * AuctionResultCard — สรุปผลเมื่อ auction จบ/ขายไม่ออก/ยกเลิก (feature 00004)
 *
 * Base: composed จาก MUI primitive (Card/Typography/Button) — pattern เดียวกับ status/CTA card
 * ใน src/app/(marketing)/o/[token]/OrderDetailMobile.tsx (ink CTA button + status-color card)
 * ไม่มี theme file "auction result" ตรงตัว (เหมือนกรณี AuctionResultCard ฝั่ง seller ที่ไม่มี
 * theme demo ให้ copy — ประกอบจาก MUI primitive ตาม pattern เดิม)
 *
 * 🛑 ไม่ expose Order.publicToken — ปุ่มชนะลิงก์ไปหน้า /orders เฉย ๆ (Controller OQ sign-off)
 */
import Link from 'next/link'

import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'

import { Icon } from '@iconify/react'

type Props = {
  status: 'ended' | 'unsold' | 'cancelled'
  currentPrice: number
  hasReserve: boolean
  winnerDisplayName: string | null
  /** true เมื่อ session user ปัจจุบัน = ผู้ชนะ (เทียบ displayName — bidHistory ไม่มี bidderId ตาม PII guard) */
  isWinner: boolean
}

export default function AuctionResultCard({ status, currentPrice, hasReserve, winnerDisplayName, isWinner }: Props) {
  if (status === 'cancelled') {
    return (
      <Box sx={{ borderRadius: '12px', bgcolor: 'background.default', px: '16px', py: '16px', textAlign: 'center' }}>
        <Icon icon='tabler-ban' style={{ fontSize: 26, color: 'var(--mui-palette-text-disabled)' }} />
        <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: 'text.primary', mt: '6px' }}>
          การประมูลนี้ถูกยกเลิกโดยผู้ขาย
        </Typography>
      </Box>
    )
  }

  if (status === 'unsold') {
    return (
      <Box sx={{ borderRadius: '12px', bgcolor: 'background.default', px: '16px', py: '16px', textAlign: 'center' }}>
        <Icon icon='tabler-mood-empty' style={{ fontSize: 26, color: 'var(--mui-palette-text-disabled)' }} />
        <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: 'text.primary', mt: '6px' }}>
          ไม่มีผู้ชนะการประมูลนี้
        </Typography>
        <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: '2px' }}>
          {hasReserve ? 'ราคาสูงสุดยังไม่ถึงราคาขั้นต่ำที่ผู้ขายกำหนด' : 'ไม่มีผู้เสนอราคาก่อนหมดเวลา'}
        </Typography>
      </Box>
    )
  }

  // status === 'ended'
  if (isWinner) {
    return (
      <Box
        sx={{
          borderRadius: '12px',
          bgcolor: 'success.lighterOpacity',
          border: '1px solid',
          borderColor: 'success.main',
          px: '16px',
          py: '18px',
          textAlign: 'center',
        }}
      >
        <Icon icon='tabler-trophy' style={{ fontSize: 30, color: 'var(--mui-palette-success-main)' }} />
        <Typography sx={{ fontSize: 16, fontWeight: 800, color: 'text.primary', mt: '6px' }}>
          คุณชนะการประมูล!
        </Typography>
        <Typography sx={{ fontSize: 13, color: 'success.main', mt: '2px' }}>
          ราคาสุดท้าย ฿{currentPrice.toLocaleString()}
        </Typography>
        <Link href='/orders' style={{ textDecoration: 'none' }}>
          <Button
            fullWidth
            variant="contained"
            color="primary"
            sx={{
              mt: '14px',
              height: 44,
              borderRadius: '11px',
              fontSize: 13.5,
              fontWeight: 700,
              textTransform: 'none',
            }}
          >
            ดูคำสั่งซื้อของฉัน
          </Button>
        </Link>
      </Box>
    )
  }

  return (
    <Box sx={{ borderRadius: '12px', bgcolor: 'background.default', px: '16px', py: '16px', textAlign: 'center' }}>
      <Icon icon='tabler-flag-check' style={{ fontSize: 26, color: 'var(--mui-palette-text-disabled)' }} />
      <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: 'text.primary', mt: '6px' }}>
        จบการประมูลแล้ว
      </Typography>
      <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: '2px' }}>
        ผู้ชนะ {winnerDisplayName ?? 'ไม่ทราบ'} · ฿{currentPrice.toLocaleString()}
      </Typography>
    </Box>
  )
}
