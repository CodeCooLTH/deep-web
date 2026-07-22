'use client'

// React Imports
import type { ReactNode } from 'react'

// MUI Imports
import Box from '@mui/material/Box'
import Divider from '@mui/material/Divider'
import Typography from '@mui/material/Typography'

// Icon Imports
import { Icon } from '@iconify/react'

// Lib Imports
import { getTierAccentColor } from '@/lib/trust-tier'

// Base: theme/vuexy/typescript-version/full-version/src/views/pages/widget-examples/statistics/SalesOverview.tsx
// (Divider flexItem orientation='vertical' คั่นสถิติ + Typography stack เลข/ป้ายกำกับ)
// ส่วนขยาย Desktop layout redesign (2026-07-22, IG-style + trust data, S-B11): แถบสถิติ inline 4 คอลัมน์
// ใต้ identity bar — แทนที่ metric row เดิมที่ยัดอยู่ในบรรทัดเดียวกับชื่อร้าน
// ลำดับ (ล็อกแล้วโดย user, decision #4): คะแนน+tier(เด่นสุด, anchor ไป #trust-detail-section) · ออเดอร์สำเร็จ ·
// อัตราสำเร็จ(S-B12) · ★รีวิว — ห้ามใส่ follower/following (ไม่มี follow system จริง)

export type ProfileStatsBarData = {
  trustScore: number
  tierLabel: string
  completedOrders: number
  /** S-B12: null = ยังไม่มี order จบเลย (ร้านใหม่) → แสดง "—" ห้ามแสดง 0% */
  completionRate: number | null
  avgRating: number
  /** false = รีวิวไม่ถึงเกณฑ์ความน่าเชื่อถือ (< 3 รีวิว) → แสดง "—" ห้ามยุบคอลัมน์ */
  showRating: boolean
}

// ── StatCell — คอลัมน์เดี่ยว (เลขใหญ่ + ป้ายกำกับเล็กใต้) ──
const StatCell = ({
  value,
  label,
  valueColor,
}: {
  value: ReactNode
  label: string
  valueColor?: string
}) => (
  <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
    <Typography
      component='p'
      sx={{
        m: 0,
        fontSize: '20px',
        fontWeight: 800,
        lineHeight: 1.15,
        fontVariantNumeric: 'tabular-nums',
        color: valueColor ?? 'text.primary',
      }}
    >
      {value}
    </Typography>
    <Typography component='p' sx={{ m: 0, mt: '2px', fontSize: '12px', color: 'text.secondary', fontWeight: 600 }}>
      {label}
    </Typography>
  </Box>
)

const VerticalDivider = () => (
  <Divider flexItem orientation='vertical' sx={{ mx: { xs: '6px', md: '16px' } }} />
)

const ProfileStatsBar = ({ data }: { data: ProfileStatsBarData }) => {
  const { trustScore, tierLabel, completedOrders, completionRate, avgRating, showRating } = data
  const accent = getTierAccentColor(trustScore)

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'stretch',
        justifyContent: 'center',
        px: { xs: '20px', md: '24px' },
        py: '16px',
        borderTop: '1px solid',
        borderBottom: '1px solid',
        borderColor: 'divider',
      }}
    >
      {/* คอลัมน์ 1: คะแนน+tier — เด่นสุด (decision #4), native anchor ไปยัง TrustDetailSection */}
      <Box
        component='a'
        href='#trust-detail-section'
        sx={{
          flex: 1,
          minWidth: 0,
          textDecoration: 'none',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          cursor: 'pointer',
        }}
      >
        <Typography
          component='p'
          sx={{ m: 0, fontSize: '22px', fontWeight: 800, lineHeight: 1.15, fontVariantNumeric: 'tabular-nums', color: accent }}
        >
          {trustScore}
        </Typography>
        <Typography component='p' sx={{ m: 0, mt: '2px', fontSize: '12px', color: 'text.secondary', fontWeight: 600 }}>
          {tierLabel}
        </Typography>
      </Box>

      <VerticalDivider />

      <StatCell value={completedOrders.toLocaleString('th-TH')} label='ออเดอร์' />

      <VerticalDivider />

      <StatCell value={completionRate != null ? `${completionRate}%` : '—'} label='สำเร็จ' />

      <VerticalDivider />

      <StatCell
        value={
          showRating ? (
            <Box component='span' sx={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
              {/* ทำไม: warning.main = #FF9F43 (canonical warning-amber ใน design.json) — เดิมทั้งหน้าใช้ #F59E0B
                  ซึ่งเป็น Tailwind amber-500 หลุด token; Impeccable audit 2026-07-22 (S-B16) แก้พร้อมกันทั้ง 3 จุด
                  ในหน้านี้ (ที่นี่ + UserProfileHeader + PlatformReputationList) ให้ดาวทุกจุดสีเดียวกัน */}
              <Icon icon='tabler-star-filled' fontSize={16} style={{ color: 'var(--mui-palette-warning-main)' }} />
              {avgRating.toFixed(1)}
            </Box>
          ) : (
            '—'
          )
        }
        label='รีวิว'
      />
    </Box>
  )
}

export default ProfileStatsBar
