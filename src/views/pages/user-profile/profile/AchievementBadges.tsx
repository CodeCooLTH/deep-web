'use client'

// MUI Imports
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { useState } from 'react'

// Base: adapted from theme/vuexy/typescript-version/full-version/src/views/pages/user-profile/profile/ConnectionsTeams.tsx
// (Card + chip-row layout; ไม่มี theme widget "badge chips" ตรง ๆ — ดัดแปลง chip row ของ ConnectionsTeams ให้เป็น badge row)

type AchievementItem = {
  id: string
  name: string
  nameEN: string
  icon: string
  /** URL รูป badge — prefer แสดงก่อน emoji; null = ใช้ emoji fallback */
  imageUrl?: string | null
}

/**
 * BadgeChip — client sub-component สำหรับ onError fallback ต่อ badge หนึ่งใบ
 * ทำไม: onError ต้องการ useState ที่แยกต่อ instance เพื่อ fallback ต่อรูป
 */
function BadgeChip({ item }: { item: AchievementItem }) {
  const [imgFailed, setImgFailed] = useState(false)
  const showImg = !!item.imageUrl && !imgFailed

  return (
    <Tooltip key={item.id} title={item.nameEN}>
      <div className='flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--mui-palette-divider)] bg-[var(--mui-palette-action-hover)]'>
        {showImg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageUrl!}
            alt={item.name}
            width={24}
            height={24}
            loading='lazy'
            onError={() => setImgFailed(true)}
            style={{ width: 24, height: 24, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }}
          />
        ) : (
          /* fallback: emoji badge.icon — render เป็น text content ไม่ใช่ className
             ทำไม: item.icon เก็บ emoji ("🌱","📈") ไม่ใช่ CSS class — <i className="🌱"> มองไม่เห็น
             pattern เดียวกับ BadgeIcon.tsx:62 */
          <span
            role='img'
            aria-label={item.name}
            style={{ fontSize: 20, lineHeight: 1, flexShrink: 0 }}
          >
            {item.icon || '🏅'}
          </span>
        )}
        <Typography className='text-sm font-medium'>{item.name}</Typography>
      </div>
    </Tooltip>
  )
}

const AchievementBadges = ({ items }: { items: AchievementItem[] }) => {
  if (items.length === 0) return null

  return (
    <Card>
      <CardContent className='flex flex-col gap-4'>
        <Typography className='uppercase' variant='body2' color='text.disabled'>
          Badge ที่ได้รับ
        </Typography>
        <div className='flex flex-wrap gap-3'>
          {items.map((item) => (
            <BadgeChip key={item.id} item={item} />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export default AchievementBadges
