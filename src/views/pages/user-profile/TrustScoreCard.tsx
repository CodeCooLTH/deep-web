'use client'

// MUI Imports
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardHeader from '@mui/material/CardHeader'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'

// Icon Imports
import { Icon } from '@iconify/react'

// Type Imports
import { getTierAccentColor } from '@/lib/trust-tier'
import type { TierChipColor } from '@/lib/trust-tier'

// Base: theme/vuexy/typescript-version/full-version/src/views/pages/widget-examples/advanced/AssignmentProgress.tsx
// (dual CircularProgress track+value gauge, label กลาง absolute-positioned, Card+CardHeader+CardContent wrap)
// Adapted: gauge เดี่ยว (ไม่ loop list) + label "{score}/100" กลาง + ข้อความ tier ใต้ gauge + chip row ระดับยืนยัน
// สี gauge ผูกกับ tier (Tier Lists SSOT ผ่าน tierColor) แทน progress-based ThemeColor ของ Base เดิม
// Desktop layout redesign (IG-style + trust data): ห่อด้วย Card+CardHeader (เดิมเป็น bare Box ไม่มี bg/shadow —
// ตอนย้ายมาอยู่บนพื้น Cool Mist ของ TrustDetailSection ต้องมี elevation จริงไม่งั้นกลืนกับพื้นหลัง)
// shadow บังคับ sm (default MuiCard override = md) — ตัด id='trust-score' เดิมทิ้ง (anchor ย้ายไปที่
// TrustDetailSection ทั้ง section: id='trust-detail-section')

export type TrustScoreCardData = {
  trustScore: number
  tierLabel: string
  tierColor: TierChipColor
  nextTierLabel: string | null
  pointsToNext: number | null
  /** verification level ที่ approved แล้ว เช่น [1,2] = ผ่าน OTP + เอกสาร (ดู VerificationClient.tsx: 1=OTP, 2=เอกสาร, 3=จดทะเบียนธุรกิจ) */
  verifiedLevels: number[]
}

const VERIFY_LEVELS: { level: number; label: string }[] = [
  { level: 1, label: 'OTP' },
  { level: 2, label: 'เอกสาร' },
  { level: 3, label: 'จดทะเบียนธุรกิจ' },
]

const TrustScoreCard = ({ data }: { data: TrustScoreCardData }) => {
  const { trustScore, tierLabel, tierColor, nextTierLabel, pointsToNext, verifiedLevels } = data

  // gauge accent — ใช้ getTierAccentColor(trustScore) แทน map เดิมที่ key ด้วย TierChipColor
  // ทำไม: TierChipColor มีแค่ 4 ค่า แต่ tier มี 5 → Classic กับ Gold ได้ 'warning' เหมือนกัน
  // ทำให้ gauge ของ 2 tier ที่ต่างกันเป็นสีเดียว (บั๊กที่ S-B7 ตั้งใจแก้)
  // และ map เดิมให้ Diamond = #0EA5E9 ขณะที่ตัวเลขใน ProfileStatsBar ใช้ #00BAD1
  // = tier เดียวกันแต่สองสีในหน้าเดียวกัน
  const accent = getTierAccentColor(trustScore)

  return (
    <Card sx={{ boxShadow: 'var(--mui-customShadows-sm)' }}>
      <CardHeader title='คะแนนความน่าเชื่อถือ' />
      <CardContent>
      <Box sx={{ position: 'relative', width: 128, height: 128, mx: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress variant='determinate' value={100} size={128} thickness={3.2} sx={{ position: 'absolute', color: '#2F2B3D1F' }} />
        <CircularProgress
          variant='determinate'
          value={trustScore}
          size={128}
          thickness={3.2}
          sx={{ position: 'absolute', color: accent, '& .MuiCircularProgress-circle': { strokeLinecap: 'round' } }}
        />
        <Box sx={{ textAlign: 'center' }}>
          <Typography component='p' sx={{ m: 0, fontSize: '30px', fontWeight: 800, color: '#2F2B3D', lineHeight: 1 }}>
            {trustScore}
          </Typography>
          <Typography component='p' sx={{ m: 0, fontSize: '12px', color: '#808390' }}>
            /100
          </Typography>
        </Box>
      </Box>

      <Typography component='p' sx={{ m: 0, mt: '12px', textAlign: 'center', fontSize: '13px', color: '#2F2B3D' }}>
        ระดับ <Box component='strong' sx={{ color: '#2F2B3D' }}>{tierLabel}</Box>
        {nextTierLabel ? (
          <>
            {' '}· อีก <Box component='strong' sx={{ color: '#2F2B3D' }}>{pointsToNext}</Box> แต้มถึง {nextTierLabel}
          </>
        ) : (
          ' · ระดับสูงสุดแล้ว'
        )}
      </Typography>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '6px', mt: '14px' }}>
        {VERIFY_LEVELS.map((v) => {
          const checked = verifiedLevels.includes(v.level)
          return (
            <Chip
              key={v.level}
              size='small'
              variant='tonal'
              color={checked ? 'primary' : 'default'}
              icon={checked ? <Icon icon='tabler-check' fontSize={14} /> : undefined}
              label={v.label}
              sx={{ fontSize: '11px', fontWeight: 600, opacity: checked ? 1 : 0.55 }}
            />
          )
        })}
      </Box>
      </CardContent>
    </Card>
  )
}

export default TrustScoreCard
