'use client'

/**
 * WinnerDialog — ประกาศผู้ชนะกลางจอเมื่อ auction จบ (feat 00007 item 5, buyer)
 *
 * Base: theme/vuexy/typescript-version/full-version/src/components/dialogs/confirmation-dialog/index.tsx
 *   (result-state dialog: centered icon → title → text → ปุ่มเดียว) — แทน icon ด้วย avatar+level ผู้ชนะ
 * ค้างจนกดปิด: disableEscapeKeyDown + onClose ทำงานเฉพาะปุ่ม "ปิด" (backdrop/ESC ไม่ปิด)
 */
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'

import { Icon } from '@iconify/react'

import CustomAvatar from '@core/components/mui/Avatar'
import { getInitials } from '@/utils/getInitials'
import { LEVEL_STYLE } from './AuctionBidHistory'
import type { AuctionLevel } from '@/lib/auction-level'

type Props = {
  open: boolean
  onClose: () => void
  isWinner: boolean
  winnerName: string
  winnerLevel: AuctionLevel
  winnerAvatar: string | null
  finalPrice: number
}

export default function WinnerDialog({
  open,
  onClose,
  isWinner,
  winnerName,
  winnerLevel,
  winnerAvatar,
  finalPrice,
}: Props) {
  const avatarSrc = winnerAvatar
    ? winnerAvatar.startsWith('http')
      ? winnerAvatar
      : `/api/files/${winnerAvatar}`
    : undefined
  const lv = LEVEL_STYLE[winnerLevel.level] ?? LEVEL_STYLE[1]

  return (
    <Dialog
      open={open}
      // ค้างจนกดปิด — onClose no-op (backdrop/ESC เรียกแล้วไม่ปิด); ปิดได้เฉพาะปุ่ม (pattern theme confirmation-dialog)
      onClose={() => {}}
      closeAfterTransition={false}
      fullWidth
      maxWidth="xs"
    >
      <DialogContent className="flex flex-col items-center text-center" sx={{ pt: 5, px: 4 }}>
        {/* no-emoji: ถ้วยรางวัลผู้ชนะ = tabler-trophy (สีทอง warning) — ห้าม emoji (docs/conventions/no-emoji-use-icons.md) */}
        <Box sx={{ mb: 1, lineHeight: 1 }}>
          <Icon icon="tabler-trophy" style={{ fontSize: 44, color: 'var(--mui-palette-warning-main)' }} />
        </Box>
        <Typography sx={{ fontSize: 17, fontWeight: 800, color: 'text.primary', mb: 2.5 }}>
          {isWinner ? 'ยินดีด้วย! คุณชนะการประมูล' : 'การประมูลสิ้นสุดแล้ว'}
        </Typography>

        <CustomAvatar size={72} skin="light" color="primary" src={avatarSrc}>
          {getInitials(winnerName)}
        </CustomAvatar>

        <Box
          sx={{
            mt: 1.5,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            bgcolor: lv.bg,
            color: lv.color,
            fontSize: 11,
            fontWeight: 800,
            px: '9px',
            py: '2px',
            borderRadius: 999,
          }}
        >
          <Icon icon={winnerLevel.icon} fontSize={13} />
          {winnerLevel.label}
        </Box>

        <Typography sx={{ mt: 1.5, fontSize: 16, fontWeight: 700, color: 'text.primary' }}>{winnerName}</Typography>
        <Typography sx={{ fontSize: 11, color: 'text.secondary', mt: 1.5 }}>ราคาปิด</Typography>
        <Typography sx={{ fontSize: 30, fontWeight: 800, color: 'primary.main', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
          ฿{finalPrice.toLocaleString()}
        </Typography>
      </DialogContent>
      <DialogActions className="justify-center" sx={{ pb: 4 }}>
        <Button variant="contained" onClick={onClose} sx={{ minWidth: 120 }}>
          ปิด
        </Button>
      </DialogActions>
    </Dialog>
  )
}
