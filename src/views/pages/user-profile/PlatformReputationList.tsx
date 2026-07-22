'use client'

// MUI Imports
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardHeader from '@mui/material/CardHeader'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Typography from '@mui/material/Typography'

// Icon Imports
import { Icon } from '@iconify/react'

// Component Imports — CustomAvatar (ported จาก Vuexy @core) สี่เหลี่ยมมุมโค้งสี ตาม getAvatar() pattern
import CustomAvatar from '@core/components/mui/Avatar'

// Base: theme/vuexy/typescript-version/full-version/src/components/layout/shared/NotificationsDropdown.tsx
// (getAvatar() + row ".flex plb-3 pli-4 gap-3" pattern) — ตัด dropdown/popper/read-state/close-icon ออกทั้งหมด
// เหลือแค่ list แสดงผลอย่างเดียว (ไม่มี interactivity จริง)
// D2/D4/D5 (มาจาก scope เดิมของ /u/[username]): platform data เป็น placeholder ตัวอย่าง ไม่ใช่ยอดจริง — ยังไม่เชื่อมต่อ API จริง
// ส่วนขยาย Desktop layout redesign (2026-07-22, S-B14): ห่อด้วย Card+CardHeader (ย้ายมาอยู่ในการ์ด 2x2 ของ
// TrustDetailSection) — คง chip "ตัวอย่าง" ไว้ (ย้ายมาเป็น CardHeader action แทน inline span เดิม)

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
    <Card sx={{ boxShadow: 'var(--mui-customShadows-sm)' }}>
      <CardHeader
        title='ชื่อเสียงแพลตฟอร์มอื่น'
        action={
          <Chip
            label='ตัวอย่าง'
            size='small'
            variant='outlined'
            sx={{ fontSize: '10px', fontWeight: 700, height: 20 }}
          />
        }
      />
      <CardContent>
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
              <Box sx={{ display: 'flex', alignItems: 'center', gap: '3px', color: 'warning.main', fontSize: '13px', fontWeight: 700, flexShrink: 0 }}>
                <Icon icon='tabler-star-filled' fontSize={13} />
                {p.rating}
              </Box>
            </Box>
          ))}
        </Box>

        <Typography component='p' sx={{ m: 0, mt: '8px', fontSize: '11px', color: 'text.secondary' }}>
          * ข้อมูลตัวอย่าง ไม่ใช่ยอดจริง — รอเชื่อมต่อในเฟสถัดไป
        </Typography>
      </CardContent>
    </Card>
  )
}

export default PlatformReputationList
