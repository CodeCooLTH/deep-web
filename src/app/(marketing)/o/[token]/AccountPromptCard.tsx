'use client'

/**
 * AccountPromptCard — opt-in card สำหรับ SMS-path buyer ที่ยังไม่มี session
 *
 * Base: theme/vuexy/typescript-version/full-version/src/views/pages/user-profile/UserProfileHeader.tsx
 *   V1 card token ที่ copy ใน OrderDetailMobile.tsx:
 *   Card elevation={0}, borderRadius 12, boxShadow 0 1px 2px rgba(15,23,42,.06), white bg
 *
 * ทำไม: buyer ที่ unlock ผ่าน SMS link ไม่มี account → เสนอสร้างบัญชีแบบ opt-in
 * ไม่บังคับ — dismiss แล้วยังดู/confirm order ได้ตามปกติ (guest mode)
 *
 * T6 (S-8) — SMS-path account opt-in prompt
 */

import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import Typography from '@mui/material/Typography'

import { Icon } from '@iconify/react'

type Props = {
  onConfirm: () => void
  onDismiss: () => void
}

export default function AccountPromptCard({ onConfirm, onDismiss }: Props) {
  return (
    <Card
      elevation={0}
      sx={{
        borderRadius: '12px',
        boxShadow: '0 1px 2px rgba(15,23,42,.06)',
        overflow: 'hidden',
        bgcolor: '#fff',
      }}
    >
      <Box
        sx={{
          px: '16px',
          py: '16px',
          display: 'flex',
          gap: '13px',
          alignItems: 'flex-start',
        }}
      >
        {/* icon box — indigo shield เหมือน trust strip ของ V1 */}
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: '11px',
            bgcolor: '#EEF2FF',
            display: 'grid',
            placeItems: 'center',
            color: '#4F46E5',
            flexShrink: 0,
            mt: '1px',
          }}
        >
          <Icon icon='tabler-user-check' fontSize={20} />
        </Box>

        {/* text + CTA */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            sx={{
              fontSize: 13.5,
              fontWeight: 800,
              color: '#0F172A',
              lineHeight: 1.3,
              mb: '3px',
            }}
          >
            บันทึกประวัติการซื้อของคุณ
          </Typography>
          <Typography
            sx={{
              fontSize: 12,
              color: '#64748B',
              lineHeight: 1.5,
              mb: '13px',
            }}
          >
            ยืนยันบัญชีด้วย OTP เพื่อดูคำสั่งซื้อย้อนหลังได้ทุกที่
          </Typography>

          {/* CTA row */}
          <Box sx={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {/* primary — ink */}
            <Button
              size='small'
              onClick={onConfirm}
              sx={{
                bgcolor: '#0F172A',
                color: '#fff',
                borderRadius: '9px',
                px: '14px',
                py: '7px',
                fontSize: 12.5,
                fontWeight: 700,
                textTransform: 'none',
                '&:hover': { bgcolor: '#1E293B' },
              }}
            >
              ยืนยันบัญชี
            </Button>

            {/* dismiss — subtle text button */}
            <Button
              size='small'
              onClick={onDismiss}
              sx={{
                color: '#94A3B8',
                fontSize: 12,
                fontWeight: 500,
                textTransform: 'none',
                background: 'none',
                border: 'none',
                px: '6px',
                py: '7px',
                '&:hover': { color: '#64748B', background: 'none' },
              }}
            >
              ไว้ภายหลัง
            </Button>
          </Box>
        </Box>
      </Box>
    </Card>
  )
}
