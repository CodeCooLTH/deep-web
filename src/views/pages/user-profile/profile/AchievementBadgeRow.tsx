'use client'

// React Imports
import { useState } from 'react'

// MUI Imports
import Box from '@mui/material/Box'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'

// Base: adapted from theme/vuexy/typescript-version/full-version/src/views/pages/user-profile/profile/ConnectionsTeams.tsx
// Asset/content source: mockup_shop_profile.html
// (badge chip pattern) — stripped to inline row only (ไม่มี Card/header — profile/index.tsx จัดการ layout แล้ว)
// ทำไม: แยก component นี้เพราะ image error handling ต้องการ useState ต่อ badge instance

type AchievementItem = {
  id: string
  name: string
  nameEN: string
  icon: string
  imageUrl?: string | null
}

// ── BadgeCell — column 78px center ตาม mockup .achv ──
function BadgeCell({ item }: { item: AchievementItem }) {
  const [imgFailed, setImgFailed] = useState(false)
  const showImg = !!item.imageUrl && !imgFailed

  return (
    <Tooltip title={item.nameEN} placement='top'>
      {/* width 78px column center ตาม mockup .achv */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          width: 78,
          padding: '6px 4px',
          borderRadius: '10px',
          cursor: 'default',
        }}
      >
        {/* badge art 60px ตาม mockup .achv-art */}
        <Box
          sx={{
            width: 60,
            height: 60,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            filter: 'drop-shadow(0 3px 6px rgba(15,23,42,.18))',
          }}
        >
          {showImg ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.imageUrl!}
              alt={item.name}
              width={60}
              height={60}
              loading='lazy'
              onError={() => setImgFailed(true)}
              style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: '50%' }}
            />
          ) : (
            /* fallback emoji icon — item.icon เก็บ emoji ไม่ใช่ CSS class */
            <Box
              component='span'
              role='img'
              aria-label={item.name}
              sx={{ fontSize: '2.5rem', lineHeight: 1 }}
            >
              {item.icon || '🏅'}
            </Box>
          )}
        </Box>

        {/* badge name 11px/600 center ตาม mockup .achv-name */}
        <Typography
          component='p'
          sx={{
            m: 0,
            mt: '4px',
            fontSize: '11px',
            fontWeight: 600,
            color: '#334155',
            textAlign: 'center',
            lineHeight: 1.2,
            letterSpacing: '-0.01em',
          }}
        >
          {item.name}
        </Typography>
      </Box>
    </Tooltip>
  )
}

type AchievementBadgeRowProps = {
  items: AchievementItem[]
}

const AchievementBadgeRow = ({ items }: AchievementBadgeRowProps) => {
  if (items.length === 0) return null

  return (
    <>
      {items.map((item) => (
        <BadgeCell key={item.id} item={item} />
      ))}
    </>
  )
}

export default AchievementBadgeRow
