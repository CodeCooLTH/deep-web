'use client'

// MUI Imports
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

// Icon Imports
import { Icon } from '@iconify/react'

// Component Imports — CustomAvatar (ported จาก Vuexy @core) สี่เหลี่ยมมุมโค้งสี ตาม getAvatar() pattern
import CustomAvatar from '@core/components/mui/Avatar'

// Base: theme/vuexy/typescript-version/full-version/src/components/layout/shared/NotificationsDropdown.tsx
// (getAvatar() + row ".flex plb-3 pli-4 gap-3" pattern) — ตัด dropdown/popper/read-state/close-icon ออกทั้งหมด
// เหลือแค่ list แสดงผลอย่างเดียว (ไม่มี interactivity จริง)
// D2/D4/D5 (มาจาก scope เดิมของ /u/[username]): platform data เป็น placeholder ตัวอย่าง ไม่ใช่ยอดจริง — ยังไม่เชื่อมต่อ API จริง

type PlatformItem = {
  key: string
  label: string
  icon: string | null
  bgHex: string
  orders: string
  rating: string
}

// R8 เดิม: simple-icons:lazada ไม่มีใน bundle — icon:null ให้ fallback ตัวอักษร "L"
const PLATFORMS_PLACEHOLDER: PlatformItem[] = [
  { key: 'shopee', label: 'Shopee', icon: 'simple-icons:shopee', bgHex: '#EE4D2D', orders: '8.5K ออเดอร์', rating: '4.8' },
  { key: 'lazada', label: 'Lazada', icon: null, bgHex: '#0F146D', orders: '1.2K ออเดอร์', rating: '4.9' },
  { key: 'tiktok', label: 'TikTok', icon: 'simple-icons:tiktok', bgHex: '#010101', orders: '240 ออเดอร์', rating: '4.7' },
]

const PlatformReputationList = () => {
  return (
    <Box sx={{ px: { xs: '20px', md: '24px' }, pb: '20px' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', mb: '12px' }}>
        <Typography
          component='h3'
          sx={{ m: 0, fontSize: '15px', fontWeight: 600, color: 'text.primary', letterSpacing: '0.1px' }}
        >
          ชื่อเสียงแพลตฟอร์มอื่น
        </Typography>
        <Box
          component='span'
          sx={{ fontSize: '10px', fontWeight: 700, color: 'text.disabled', border: '1px solid', borderColor: 'divider', borderRadius: '999px', px: '6px', py: '1px' }}
        >
          ตัวอย่าง
        </Box>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {PLATFORMS_PLACEHOLDER.map((p) => (
          <Box key={p.key} sx={{ display: 'flex', alignItems: 'center', gap: '12px', py: '8px' }}>
            <CustomAvatar variant='rounded' sx={{ bgcolor: p.bgHex, color: 'white', width: 38, height: 38, fontSize: '14px', fontWeight: 800 }}>
              {p.icon ? <Icon icon={p.icon} fontSize={18} /> : 'L'}
            </CustomAvatar>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography component='p' sx={{ m: 0, fontSize: '13px', fontWeight: 700, color: 'text.primary' }}>
                {p.label}
              </Typography>
              <Typography component='p' sx={{ m: 0, fontSize: '12px', color: 'text.secondary' }}>
                {p.orders}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: '3px', color: '#F59E0B', fontSize: '13px', fontWeight: 700, flexShrink: 0 }}>
              <Icon icon='tabler-star-filled' fontSize={13} />
              {p.rating}
            </Box>
          </Box>
        ))}
      </Box>

      <Typography component='p' sx={{ m: 0, mt: '8px', fontSize: '11px', color: 'text.secondary' }}>
        * ข้อมูลตัวอย่าง ไม่ใช่ยอดจริง — รอเชื่อมต่อในเฟสถัดไป
      </Typography>
    </Box>
  )
}

export default PlatformReputationList
