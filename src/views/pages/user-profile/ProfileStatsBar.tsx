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
// Desktop layout redesign (IG-style + trust data): แถบสถิติ inline 4 คอลัมน์ ใต้ identity bar
// แทนที่ metric row เดิมที่ยัดอยู่ในบรรทัดเดียวกับชื่อร้าน (ตัดออกจาก UserProfileHeader.tsx แล้ว)
// ลำดับ (ล็อกแล้วโดย user): คะแนน+tier(เด่นสุด, anchor ไป #trust-detail-section) · ออเดอร์สำเร็จ ·
// อัตราสำเร็จ · ★รีวิว — ห้ามใส่ follower/following (ไม่มี follow system จริง)

export type ProfileStatsBarData = {
  trustScore: number
  tierLabel: string
  completedOrders: number
  /** null = ยังไม่มี order จบเลย (ร้านใหม่) → แสดง "ข้อมูลยังน้อย" ห้ามแสดง 0% (P0-2: "—" หน้าตาเหมือนบั๊ก) */
  completionRate: number | null
  avgRating: number
  /** false = รีวิวไม่ถึงเกณฑ์ความน่าเชื่อถือ (< 3 รีวิว) → แสดง "ข้อมูลยังน้อย" (P0-2) */
  showRating: boolean
}

// ── StatCell — คอลัมน์เดี่ยว (เลขใหญ่ + ป้ายกำกับเล็กใต้) ──
const StatCell = ({
  value,
  label,
  valueColor,
  small,
}: {
  value: ReactNode
  label: string
  valueColor?: string
  /** P0-2: true = value เป็น placeholder ข้อความ (เช่น "ข้อมูลยังน้อย") ไม่ใช่ตัวเลข — ใช้ font เล็กลง (13px/700) แทน 20px/800 */
  small?: boolean
}) => (
  <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
    <Typography
      component='p'
      sx={{
        m: 0,
        fontSize: small ? '13px' : '20px',
        fontWeight: small ? 700 : 800,
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
  // P0-2 #4: ร้านใหม่ = completionRate null และไม่มีรีวิวพร้อมกัน → ยุบ "สำเร็จ"+"รีวิว"+divider ระหว่างกัน
  // เป็นช่องเดียว (โชว์ "ข้อมูลยังน้อย" ซ้ำ 2 ช่องติดกันดูเหมือน bug มากกว่าน่าเชื่อ)
  const isNewShop = completionRate == null && !showRating

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
      {/* คอลัมน์ 1: คะแนน+tier — เด่นสุด, native anchor ไปยัง TrustDetailSection */}
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

      {isNewShop ? (
        // P0-2 #4: ยุบ "สำเร็จ" + "รีวิว" เป็นช่องเดียว flex:2 — บอกตรง ๆ ว่าร้านใหม่ แทนโชว์ placeholder ซ้ำ 2 ช่อง
        <Box sx={{ flex: 2, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
          <Typography component='p' sx={{ m: 0, fontSize: '13px', fontWeight: 700, color: 'text.secondary' }}>
            ร้านใหม่ · ยังไม่มีประวัติเพียงพอ
          </Typography>
        </Box>
      ) : (
        <>
          <StatCell
            value={completionRate != null ? `${completionRate}%` : 'ข้อมูลยังน้อย'}
            label='สำเร็จ'
            small={completionRate == null}
          />

          <VerticalDivider />

          <StatCell
            value={
              showRating ? (
                <Box component='span' sx={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                  {/* warning.main = #FF9F43 canonical (design.json) — ห้าม hardcode hex ดาว (ทั้งหน้าใช้สีเดียวกัน) */}
                  <Icon icon='tabler-star-filled' fontSize={16} style={{ color: 'var(--mui-palette-warning-main)' }} />
                  {avgRating.toFixed(1)}
                </Box>
              ) : (
                'ข้อมูลยังน้อย'
              )
            }
            label='รีวิว'
            small={!showRating}
          />
        </>
      )}
    </Box>
  )
}

export default ProfileStatsBar
