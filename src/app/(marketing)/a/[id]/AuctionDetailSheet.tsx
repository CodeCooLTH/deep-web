'use client'

/**
 * AuctionDetailSheet — bottom sheet "รายละเอียด" (feature 00004, Concept 1 redesign 2026-07-02)
 *
 * แสดงชื่อ + คำอธิบายสินค้าเท่านั้น (ไม่มีการ์ดผู้ขาย/กราฟ/ประวัติบิด — ตาม spec Screen 2)
 *
 * Base: theme/vuexy/typescript-version/full-version/src/views/apps/email/ComposeMail.tsx
 *   (Drawer anchor="bottom" pattern — spec §Theme mapping ระบุไฟล์นี้เป็น base ของ bottom sheet ทั้งหมด)
 *
 * Visual ref (asset เท่านั้น): docs/mockups/auction/buyer-auction-concept1-flow.html .sheet (h44%)
 */
import Drawer from '@mui/material/Drawer'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import type { Theme } from '@mui/material/styles'

import { Icon } from '@iconify/react'

type Props = {
  open: boolean
  onClose: () => void
  title: string
  description: string | null
}

export default function AuctionDetailSheet({ open, onClose, title, description }: Props) {
  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      slotProps={{
        paper: {
          sx: {
            borderRadius: '18px 18px 0 0',
            height: '44%',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: (theme: Theme) => theme.customShadows.xl,
          },
        },
      }}
    >
      <Box sx={{ width: 40, height: 4, borderRadius: 99, bgcolor: 'divider', mx: 'auto', mt: '9px', flexShrink: 0 }} />

      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: '16px',
          py: '10px',
          borderBottom: '1px solid',
          borderColor: 'divider',
          flexShrink: 0,
        }}
      >
        <Typography sx={{ fontWeight: 800, fontSize: 15, color: 'text.primary' }}>รายละเอียด</Typography>
        <IconButton
          onClick={onClose}
          aria-label="ปิด"
          size="small"
          sx={{ bgcolor: 'action.selected', color: 'text.secondary' }}
        >
          <Icon icon="tabler-x" fontSize={16} />
        </IconButton>
      </Box>

      <Box sx={{ flex: 1, overflowY: 'auto', px: '16px', py: '14px' }}>
        <Typography sx={{ fontWeight: 700, fontSize: 13.5, color: 'text.primary', mb: '6px' }}>{title}</Typography>
        <Typography sx={{ fontSize: 13, color: 'text.secondary', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
          {description || 'ผู้ขายยังไม่ได้เพิ่มรายละเอียดสินค้า'}
        </Typography>
      </Box>
    </Drawer>
  )
}
