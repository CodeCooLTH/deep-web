'use client'

// React Imports
import { useState } from 'react'

// MUI Imports
import Box from '@mui/material/Box'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { Icon as IconifyIcon } from '@iconify/react'
import { badgeIconName } from '@/lib/badge-icons'

// Base: adapted from theme/vuexy/typescript-version/full-version/src/views/pages/user-profile/profile/ConnectionsTeams.tsx
// Asset/content source: mockup_shop_profile.html
// (badge chip pattern) — stripped to inline row only (ไม่มี Card/header — profile/index.tsx จัดการ layout แล้ว)
// ทำไม: แยก component นี้เพราะ image error handling ต้องการ useState ต่อ badge instance
// Redesign (2026-07-04): ครอบ badge art ด้วย circular-medal frame (radial-gradient+border+boxShadow) ให้ดูเป็นเหรียญกลม
// ตาม spec hybrid FB Page × Threads — D7 exception เดิม (compose จาก MUI Box primitive) ยังใช้ได้

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
          // R5: hover lift + tint — transition รองรับทั้ง bg และ transform
          // ทำไม (S-B3): สี hover เดิมเป็น indigo-tint แต่งเองบน element ที่ไม่ใช่ action → ผิด One Voice, ใช้ action.hover token แทน
          transition: 'background .15s, transform .15s',
          '&:hover': { bgcolor: 'action.hover', transform: 'translateY(-2px)' },
        }}
      >
        {/* medal frame 52px วงกลม (radial-gradient+border+boxShadow) ให้ badge ดูเป็นเหรียญ — แทน drop-shadow เดิม */}
        <Box
          sx={{
            width: 52,
            height: 52,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            // S-B3: ramp จาก design.json surface-mist tonalRamp (ขาว→หมอกเย็น→เทาเงิน) แทน Tailwind slate hex เดิม
            background: 'radial-gradient(circle at 32% 28%, #FFFFFF 0%, #F8F7FA 55%, #e4e3e9 100%)',
            border: '1px solid',
            borderColor: 'divider',
            // S-B4: เงาหมึก ink-tinted (customShadows-sm) + คง inset ขาว (highlight ไม่ใช่เงา)
            boxShadow: 'var(--mui-customShadows-sm), inset 0 1px 2px rgba(255,255,255,.8)',
          }}
        >
          {showImg ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.imageUrl!}
              alt={item.name}
              width={40}
              height={40}
              loading='lazy'
              onError={() => setImgFailed(true)}
              style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: '50%' }}
            />
          ) : (
            /* fallback: lucide icon ตามชื่อ badge (no-emoji — Hard Rule 12); parity กับ seller BadgeImage */
            <IconifyIcon
              icon={badgeIconName(item.nameEN, item.icon)}
              width={30}
              height={30}
              aria-label={item.name}
              style={{ color: 'var(--mui-palette-text-secondary)' }}
            />
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
            color: 'text.primary',
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
