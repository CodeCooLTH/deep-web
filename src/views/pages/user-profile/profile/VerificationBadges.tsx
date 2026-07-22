'use client'

// MUI Imports
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardHeader from '@mui/material/CardHeader'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'

// Icon Imports
import { Icon } from '@iconify/react'

// Base: theme/vuexy/typescript-version/full-version/src/views/pages/user-profile/profile/ConnectionsTeams.tsx
// (Card+CardHeader+CardContent pattern) — revive (Desktop layout redesign, IG-style + trust data)
// เดิมไฟล์นี้เป็น dead code รับ prop VerifyItem[] ที่ไม่ตรง data shape จริง (ProfileTabData มีแค่ verifiedLevels: number[])
// และใช้ Tailwind class + CSS var string (`border-[var(--mui-palette-...)]`) ซึ่งไม่ตรง convention sx ของไฟล์รอบข้าง
// เขียนใหม่: รับ verifiedLevels ตรง ๆ, ใช้ sx + Icon (@iconify/react) แทน <i className> ให้ตรงกับ
// TrustScoreCard.tsx ที่อยู่ใน TrustDetailSection เดียวกัน

const VERIFY_LEVELS: { level: number; label: string; icon: string }[] = [
  { level: 1, label: 'ยืนยันเบอร์โทร (OTP)', icon: 'tabler-phone-check' },
  { level: 2, label: 'ยืนยันเอกสาร', icon: 'tabler-file-certificate' },
  // icon ชุดนี้ user เคาะเอง (Hard Rule 12 — สเปกไม่ระบุ ห้าม dev เดา):
  // L3 ใช้ building-store ไม่ใช่ building-bank เพราะ bank สื่อ "การเงิน" ไม่ใช่ "จดทะเบียนธุรกิจ"
  { level: 3, label: 'จดทะเบียนธุรกิจ', icon: 'tabler-building-store' },
]

export type VerificationBadgesProps = {
  /** ระดับที่ approved แล้ว (1=OTP, 2=เอกสาร, 3=จดทะเบียนธุรกิจ) — ตรงกับ ProfileTabData.verifiedLevels */
  verifiedLevels: number[]
}

const VerificationBadges = ({ verifiedLevels }: VerificationBadgesProps) => {
  return (
    <Card sx={{ boxShadow: 'var(--mui-customShadows-sm)' }}>
      <CardHeader title='ยืนยันตัวตน' />
      <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {VERIFY_LEVELS.map((item) => {
          const active = verifiedLevels.includes(item.level)
          // P0-1 (Impeccable critique): L1 OTP ผ่านก็ไม่เขียว — ซิมเติมเงินซื้อได้ที่เซเว่น
          // เขียวสงวนให้ L2 เอกสาร/L3 ธุรกิจเท่านั้น (Verified-Means-Green)
          const isGreen = active && item.level >= 2
          return (
            <Box
              key={item.level}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                px: '14px',
                py: '10px',
                borderRadius: '8px',
                border: '1px solid',
                borderColor: isGreen ? 'success.main' : 'divider',
                bgcolor: isGreen ? 'success.lightOpacity' : active ? 'rgba(47,43,61,0.04)' : 'transparent',
                opacity: active ? 1 : 0.6,
              }}
            >
              <Icon
                icon={item.icon}
                fontSize={22}
                style={{
                  color: isGreen
                    ? 'var(--mui-palette-success-main)'
                    : active
                      ? '#2F2B3D'
                      : 'var(--mui-palette-text-disabled)',
                }}
              />
              <Typography component='p' sx={{ m: 0, fontSize: '13px', fontWeight: 600, color: 'text.primary', flex: 1 }}>
                {item.label}
              </Typography>
              {active && (
                <Icon
                  icon='tabler-check'
                  fontSize={18}
                  style={{ color: isGreen ? 'var(--mui-palette-success-main)' : '#2F2B3D' }}
                />
              )}
            </Box>
          )
        })}
      </CardContent>
    </Card>
  )
}

export default VerificationBadges
