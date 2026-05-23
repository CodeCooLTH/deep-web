'use client'

// MUI Imports
import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'

// Base: theme/vuexy/typescript-version/full-version/src/views/pages/user-profile/UserProfileHeader.tsx
// Adapted: แทน CardMedia cover image ด้วย trust banner gradient (Instagram-style) ตาม spec
// D7 approved exception: trust banner + progress dots compose จาก MUI Box primitive
// Tooltip บน disabled Button ต้องการ 'use client'

export type ProfileHeaderData = {
  coverImg: string             // คง field เดิมไว้กัน T5 พัง (ไม่ใช้ render แล้ว)
  profileImg?: string | null
  fullName: string
  username: string
  memberSince: string
  shopName?: string | null
  trustScore: number
  trustLevel: string           // "A+"|"A"|"B+"|"B"|"C"|"D"
  trustColor: 'success' | 'info' | 'warning' | 'error'
  maxVerifyLevel: number
  stats: { completedOrders: number; reviews: number; badges: number }
  // ── ใหม่ (T3) ──
  bio?: string | null
  location?: string | null
}

// --- Helper: map trustLevel → tier name + gradient ---

type TierInfo = { name: string; gradient: string; filledDots: number }

function getTierInfo(trustLevel: string): TierInfo {
  // Frozen mapping ตาม spec 2026-05-23
  switch (trustLevel) {
    case 'A+':
      return {
        name: 'Deep Diamond',
        gradient: 'linear-gradient(135deg, #DDD6FE, #7C3AED, #EC4899)',
        filledDots: 5,
      }
    case 'A':
      return {
        name: 'Deep Platinum',
        gradient: 'linear-gradient(135deg, #BAE6FD, #0284C7)',
        filledDots: 4,
      }
    case 'B+':
      return {
        name: 'Deep Gold',
        gradient: 'linear-gradient(135deg, #FEF9C3, #CA8A04)',
        filledDots: 3,
      }
    case 'B':
      return {
        name: 'Deep Silver',
        gradient: 'linear-gradient(135deg, #E2E8F0, #9CA3AF)',
        filledDots: 2,
      }
    case 'C':
      return {
        name: 'Deep Bronze',
        gradient: 'linear-gradient(135deg, #FDE68A, #D97706)',
        filledDots: 1,
      }
    case 'D':
    default:
      return {
        name: 'Deep Starter',
        gradient: 'linear-gradient(135deg, #E2E8F0, #94A3B8)',
        filledDots: 0,
      }
  }
}

// --- Helper: chip color + label ตาม maxVerifyLevel (D9) ---

function getVerifyChip(level: number): { color: 'info' | 'success' | 'primary'; label: string } | null {
  if (level === 0) return null  // D9: ซ่อนถ้าไม่ผ่านการยืนยัน
  if (level === 1) return { color: 'info', label: 'ยืนยันแล้ว' }
  if (level === 2) return { color: 'success', label: 'ยืนยันตัวตน' }
  return { color: 'primary', label: 'ธุรกิจจดทะเบียน' }
}

// --- Component ---

const UserProfileHeader = ({ data }: { data: ProfileHeaderData }) => {
  const tier = getTierInfo(data.trustLevel)
  const verifyChip = getVerifyChip(data.maxVerifyLevel)
  const displayName = data.shopName ?? data.fullName

  // Progress dots: 5 จุด, fill ตาม tier.filledDots
  const TOTAL_DOTS = 5

  return (
    <Card sx={{ overflow: 'visible' }}>
      {/* ── Trust Banner (แทน CardMedia) ── */}
      <Box
        sx={{
          height: 160,
          background: tier.gradient,
          position: 'relative',
          overflow: 'hidden',
          borderRadius: '12px 12px 0 0',
        }}
      >
        {/* มุมซ้ายบน: ปุ่ม "ติดตาม" disabled (D3) */}
        <Box sx={{ position: 'absolute', top: 20, left: 20, zIndex: 2 }}>
          {/* ห่อ span เพราะ MUI disabled button ไม่รับ Tooltip โดยตรง (Hard Rule 2 note) */}
          <Tooltip title='เร็ว ๆ นี้' placement='bottom'>
            <span>
              <Button
                variant='outlined'
                disabled
                size='small'
                sx={{
                  bgcolor: 'rgba(255,255,255,0.85)',
                  backdropFilter: 'blur(8px)',
                  borderColor: 'rgba(255,255,255,0.6)',
                  color: 'text.primary',
                  borderRadius: 999,
                  fontWeight: 700,
                  '&.Mui-disabled': {
                    bgcolor: 'rgba(255,255,255,0.7)',
                    color: 'text.secondary',
                  },
                }}
              >
                + ติดตาม
              </Button>
            </span>
          </Tooltip>
        </Box>

        {/* มุมขวาบน: tier name + caption + progress dots */}
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            justifyContent: 'center',
            px: 3,
            zIndex: 2,
          }}
        >
          <Typography
            component='p'
            sx={{
              fontSize: '10px',
              fontWeight: 700,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: 'rgba(15,23,42,0.75)',
              mb: 0.25,
            }}
          >
            ระดับความน่าเชื่อถือ
          </Typography>
          <Typography
            component='p'
            sx={{
              fontSize: { xs: '20px', sm: '26px' },
              fontWeight: 900,
              letterSpacing: '-0.02em',
              lineHeight: 1.05,
              color: '#1E293B',
              textShadow: '0 1px 0 rgba(0,0,0,0.06)',
            }}
          >
            {tier.name}
          </Typography>
          {/* Progress dots */}
          <Box sx={{ display: 'flex', gap: '5px', mt: 1, justifyContent: 'flex-end' }}>
            {Array.from({ length: TOTAL_DOTS }).map((_, i) => {
              const filled = i < tier.filledDots
              return (
                <Box
                  key={i}
                  sx={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: filled ? '#1E293B' : 'rgba(30,41,59,0.2)',
                    border: '1.5px solid',
                    borderColor: filled ? '#1E293B' : 'rgba(30,41,59,0.4)',
                    boxShadow: filled ? '0 0 0 2px rgba(248,250,252,0.6), 0 0 8px rgba(30,41,59,0.27)' : 'none',
                  }}
                />
              )
            })}
          </Box>
        </Box>
      </Box>

      <CardContent className='!pt-0'>
        {/* ── X-style header: Avatar LEFT (overlap banner) ── */}
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            mt: '-52px',    // ดึง avatar ขึ้นทับ banner (negative margin)
            mb: 1.5,
            position: 'relative',
            zIndex: 3,
          }}
        >
          {/* Avatar วงกลม overlap banner */}
          <Avatar
            src={data.profileImg ?? undefined}
            alt={displayName}
            sx={{
              width: { xs: 96, sm: 112 },
              height: { xs: 96, sm: 112 },
              borderRadius: '50%',
              border: '4px solid',
              borderColor: 'background.paper',
              boxShadow: '0 6px 14px rgba(15,23,42,0.18)',
              fontSize: { xs: '2rem', sm: '2.5rem' },
              bgcolor: 'action.selected',
            }}
          >
            {displayName.slice(0, 1)}
          </Avatar>
        </Box>

        {/* ── Identity block (left-aligned) ── */}
        <Box sx={{ px: { xs: 0, sm: 0 } }}>
          {/* ชื่อร้าน + verified chip */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 0.5 }}>
            <Typography variant='h4' sx={{ fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.15 }}>
              {displayName}
            </Typography>
            {verifyChip && (
              <Chip
                color={verifyChip.color}
                size='small'
                label={verifyChip.label}
                sx={{ fontWeight: 700 }}
              />
            )}
          </Box>

          {/* @username */}
          <Typography color='text.secondary' sx={{ fontSize: '0.875rem', mb: 0.5 }}>
            @{data.username}
          </Typography>

          {/* Bio (ซ่อนถ้า null) */}
          {data.bio && (
            <Typography sx={{ fontSize: '0.875rem', color: 'text.primary', mb: 0.75, lineHeight: 1.5 }}>
              {data.bio}
            </Typography>
          )}

          {/* Meta row: location + memberSince */}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mb: 2 }}>
            {/* location ซ่อนถ้า null */}
            {data.location && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <i className='tabler-map-pin' style={{ color: 'var(--mui-palette-text-secondary)', fontSize: '0.875rem' }} />
                <Typography color='text.secondary' sx={{ fontSize: '0.8125rem' }}>
                  {data.location}
                </Typography>
              </Box>
            )}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <i className='tabler-calendar' style={{ color: 'var(--mui-palette-text-secondary)', fontSize: '0.875rem' }} />
              <Typography color='text.secondary' sx={{ fontSize: '0.8125rem' }}>
                สมาชิกตั้งแต่ {data.memberSince}
              </Typography>
            </Box>
          </Box>
        </Box>
      </CardContent>
    </Card>
  )
}

export default UserProfileHeader
