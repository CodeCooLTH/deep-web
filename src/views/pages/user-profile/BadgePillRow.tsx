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
// (Chip size='small' variant='tonal' pattern บรรทัด 81) — Desktop layout redesign (IG-style + trust data):
// ย่อ AchievementBadgeRow เดิม (medal-frame ทั้ง section) เป็น pill เล็ก 3 ใบใต้ปุ่มแอ็กชัน + "ดูทั้งหมด (N)"
// ข้อความเฉย ๆ ไม่ทำลิงก์ (ยังไม่มี route/modal ปลายทางจริง ลิงก์ปลอม = หลอกผู้ใช้)
// AchievementBadgeRow.tsx (medal-frame) เลิก render ในหน้านี้ แต่ไม่ลบไฟล์ (เก็บไว้เผื่อ modal อนาคต)

export type BadgePillItem = {
  id: string
  name: string
  nameEN: string
  icon: string
}

/** จำนวน pill สูงสุดที่โชว์ — "3 ใบล่าสุดที่ได้รับ" */
const MAX_PILLS = 3

const BadgePillRow = ({ items, totalCount }: { items: BadgePillItem[]; totalCount: number }) => {
  if (items.length === 0) return null

  // ทำไม slice ที่นี่ไม่ใช่ที่ call site: กันพลาดจากทุกหน้าที่เรียกใช้ (มี 2 หน้า /u/ กับ /b/)
  // ถ้าปล่อยให้ caller รับผิดชอบ วันหนึ่งจะมีหน้าที่ลืม แล้ว chip ล้นแถวเงียบ ๆ
  // ลำดับ "ล่าสุดก่อน" มาจาก orderBy earnedAt desc ที่ user.service.ts/shop.service.ts (ไม่ sort ซ้ำที่นี่)
  const visible = items.slice(0, MAX_PILLS)

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
      {visible.map((item) => (
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

      {/* โชว์เฉพาะเมื่อมีมากกว่าที่เห็น — ไม่งั้นจะได้ "ดูทั้งหมด (2)" ทั้งที่โชว์ครบ 2 ใบแล้ว (ขัดแย้งในตัวเอง) */}
      {totalCount > visible.length && (
        <Typography component='span' sx={{ fontSize: '12px', color: 'text.secondary', fontWeight: 600, cursor: 'default', userSelect: 'none' }}>
          ดูทั้งหมด ({totalCount})
        </Typography>
      )}
    </Box>
  )
}

export default BadgePillRow
