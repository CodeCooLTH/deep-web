'use client'

// MUI Imports
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Typography from '@mui/material/Typography'

// Icon Imports
import { Icon } from '@iconify/react'

// Lib Imports
import { badgeIconName } from '@/lib/badge-icons'

// Base: theme/vuexy/typescript-version/full-version/src/views/pages/user-profile/profile/ConnectionsTeams.tsx
// (Chip size='small' variant='tonal' pattern บรรทัด 81) — ส่วนขยาย Desktop layout redesign (S-B13, decision #3):
// ย่อ AchievementBadgeRow เดิม (medal-frame ทั้ง section) เป็น pill เล็ก 3 ใบใต้ปุ่มแอ็กชัน + "ดูทั้งหมด (N)"
// ข้อความเฉย ๆ ไม่ทำลิงก์ (Controller ตัดสิน — ยังไม่มี route/modal ปลายทางจริง ลิงก์ปลอม = หลอกผู้ใช้)
// AchievementBadgeRow.tsx (medal-frame) เลิก render ในหน้านี้ แต่ไม่ลบไฟล์ (เก็บไว้เผื่อ modal อนาคต — S-B13)

export type BadgePillItem = {
  id: string
  name: string
  nameEN: string
  icon: string
}

const BadgePillRow = ({ items, totalCount }: { items: BadgePillItem[]; totalCount: number }) => {
  if (items.length === 0) return null

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '8px',
        px: { xs: '20px', md: '24px' },
        pb: '16px',
      }}
    >
      {items.map((item) => (
        <Chip
          key={item.id}
          size='small'
          variant='tonal'
          color='default'
          icon={<Icon icon={badgeIconName(item.nameEN, item.icon)} fontSize={14} />}
          label={item.name}
          sx={{ fontSize: '11px', fontWeight: 600 }}
        />
      ))}

      {totalCount > 0 && (
        <Typography component='span' sx={{ fontSize: '12px', color: 'text.secondary', fontWeight: 600, cursor: 'default', userSelect: 'none' }}>
          ดูทั้งหมด ({totalCount})
        </Typography>
      )}
    </Box>
  )
}

export default BadgePillRow
