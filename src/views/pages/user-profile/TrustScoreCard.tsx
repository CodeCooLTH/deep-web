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

// Lib Imports — S-B3: ใช้ getTierAccentColor() ตรง ๆ แทน GAUGE_ACCENT map เดิม (ลดจุด hardcode ซ้ำ)
import { getTierAccentColor } from '@/lib/trust-tier'
import type { TierChipColor } from '@/lib/trust-tier'

// Base: theme/vuexy/typescript-version/full-version/src/views/pages/widget-examples/advanced/AssignmentProgress.tsx
// (dual CircularProgress track+value gauge, label กลาง absolute-positioned)
// Adapted: gauge เดี่ยว (ไม่ loop list) + label "{score}/100" กลาง + ข้อความ tier ใต้ gauge + chip row ระดับยืนยัน
// สี gauge ผูกกับ tier (Tier Lists SSOT ผ่าน tierColor) แทน progress-based ThemeColor ของ Base เดิม
// ส่วนขยาย Desktop layout redesign (2026-07-22, S-B14): ห่อด้วย Card+CardHeader (เดิมเป็น bare Box ไม่มี bg/shadow —
// ตอนย้ายมาอยู่บนพื้น Cool Mist ของ TrustDetailSection ต้องมี elevation จริงไม่งั้นกลืนกับพื้นหลัง)
// shadow บังคับ sm (default MuiCard override = md — ดู @core/theme/overrides/card.ts) ตาม acceptance ของ S-B14
// ตัด id='trust-score' เดิมทิ้ง — anchor เป้าหมายย้ายไปที่ TrustDetailSection ทั้ง section (id='trust-detail-section')

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
  // S-B3: gauge accent มาจาก getTierAccentColor() (5 ค่าจริงต่าง tier) แทน GAUGE_ACCENT map เดิม (4 ค่า ผูกกับ TierChipColor)
  const accent = getTierAccentColor(trustScore)

  return (
    <Card sx={{ boxShadow: 'var(--mui-customShadows-sm)' }}>
      <CardHeader title='คะแนนความน่าเชื่อถือ' />
      <CardContent>
      <Box sx={{ position: 'relative', width: 128, height: 128, mx: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress variant='determinate' value={100} size={128} thickness={3.2} sx={{ position: 'absolute', color: 'action.disabledBackground' }} />
        <CircularProgress
          variant='determinate'
          value={trustScore}
          size={128}
          thickness={3.2}
          sx={{ position: 'absolute', color: accent, '& .MuiCircularProgress-circle': { strokeLinecap: 'round' } }}
        />
        <Box sx={{ textAlign: 'center' }}>
          <Typography component='p' sx={{ m: 0, fontSize: '30px', fontWeight: 800, color: 'text.primary', lineHeight: 1 }}>
            {trustScore}
          </Typography>
          <Typography component='p' sx={{ m: 0, fontSize: '12px', color: 'text.disabled' }}>
            /100
          </Typography>
        </Box>
      </Box>

      <Typography component='p' sx={{ m: 0, mt: '12px', textAlign: 'center', fontSize: '13px', color: 'text.secondary' }}>
        ระดับ <Box component='strong' sx={{ color: 'text.primary' }}>{tierLabel}</Box>
        {nextTierLabel ? (
          <>
            {' '}· อีก <Box component='strong' sx={{ color: 'text.primary' }}>{pointsToNext}</Box> แต้มถึง {nextTierLabel}
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
