'use client'

// MUI Imports
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { Icon as IconifyIcon } from '@iconify/react'
import { badgeIconName } from '@/lib/badge-icons'

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
          /* fallback: lucide icon ตามชื่อ badge (no-emoji — Hard Rule 12); parity กับ seller BadgeImage
             ทำไม nameEN: badge.icon ใน DB เก็บ emoji — เลิก render, map ชื่อ → lucide แทน */
          <IconifyIcon
            icon={badgeIconName(item.nameEN, item.icon)}
            width={20}
            height={20}
            aria-label={item.name}
            style={{ flexShrink: 0 }}
          />
        )}
        <Typography className='text-sm font-medium'>{item.name}</Typography>
      </div>
    </Tooltip>
  )
}

type AchievementBadgesProps = {
  items: AchievementItem[]
  /** จำนวน badge ทั้งหมด — ถ้ามีค่า > 0 จะแสดง "ดูทั้งหมด N" ชิดขวาหัว section
   * ทำไม: section header มี totalCount เพื่อให้ buyer รู้ว่ามี badge เพิ่มเติม
   * ใช้ Typography ธรรมดา (ไม่ใช่ Link) เพราะหน้า badge list ยังไม่มี (pattern D3 disabled) */
  totalCount?: number
}

const AchievementBadges = ({ items, totalCount }: AchievementBadgesProps) => {
  if (items.length === 0) return null

  return (
    <Card>
      <CardContent className='flex flex-col gap-4'>
        {/* header row: title ซ้าย + "ดูทั้งหมด N" ขวา (ถ้ามี totalCount > 0) */}
        <div className='flex items-center justify-between'>
          <Typography className='uppercase' variant='body2' color='text.disabled'>
            Badge ที่ได้รับ
          </Typography>
          {totalCount != null && totalCount > 0 && (
            /* cursor: 'default' เพราะยังไม่มีหน้า badge list (pattern D3); ใช้ primary color เป็น visual hint เท่านั้น — ไม่ navigate */
            <Typography
              variant='body2'
              color='primary.main'
              sx={{ cursor: 'default', userSelect: 'none' }}
            >
              ดูทั้งหมด {totalCount}
            </Typography>
          )}
        </div>
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
