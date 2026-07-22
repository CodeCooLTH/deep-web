'use client'

// MUI Imports
import Box from '@mui/material/Box'
import Grid from '@mui/material/Grid'
import Typography from '@mui/material/Typography'

// Icon Imports
import { Icon } from '@iconify/react'

// Component Imports
import TrustScoreCard from './TrustScoreCard'
import type { TrustScoreCardData } from './TrustScoreCard'
import VerificationBadges from './profile/VerificationBadges'
import AboutOverview from './profile/AboutOverview'
import type { AboutData } from './profile/AboutOverview'

// Base: theme/vuexy/typescript-version/full-version/src/views/pages/user-profile/profile/ConnectionsTeams.tsx
// (Grid container spacing + Card grid pattern) — Desktop layout redesign (IG-style + trust data)
// full-bleed band พื้น Cool Mist — bgcolor: background.default resolve เป็น #F8F7FA จริงเมื่อ skin='default'
// (ดู src/@core/theme/colorSchemes.ts:86 + .impeccable/design.json surface-mist) เนื้อหาข้างในยัง cap ที่ container 960px
// 3 การ์ด: TrustScoreCard(gauge) · VerificationBadges(revive) · AboutOverview(revive)
// — การ์ดชื่อเสียงข้ามแพลตฟอร์มเดิมไม่กลับมา (ถูกลบทิ้งโดยตั้งใจ 2026-07-22 impeccable critique P0: ตัวเลข hardcode)
// Grid size={{xs:12, md:4}}: 3 คอลัมน์เท่ากันพอดี 3 การ์ด (md:6 จะเหลือช่องว่างเพราะ 3 ใบไม่ลงตัวคู่ — 2+1)

export type TrustDetailSectionData = {
  trustScore: TrustScoreCardData
  verifiedLevels: number[]
  about: AboutData
}

const TrustDetailSection = ({ data }: { data: TrustDetailSectionData }) => {
  const { trustScore, verifiedLevels, about } = data

  return (
    <Box
      id='trust-detail-section'
      sx={{
        width: '100%',
        bgcolor: 'background.default',
        py: { xs: '32px', md: '48px' },
      }}
    >
      <Box sx={{ maxWidth: 960, mx: 'auto', px: { xs: '20px', md: '24px' } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px', mb: '20px' }}>
          <Icon icon='tabler-shield-check' fontSize={26} style={{ color: 'var(--mui-palette-primary-main)' }} />
          <Typography component='h2' sx={{ m: 0, fontSize: '20px', fontWeight: 800, color: 'text.primary' }}>
            ความน่าเชื่อถือโดยละเอียด
          </Typography>
        </Box>

        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 4 }}>
            <TrustScoreCard data={trustScore} />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <VerificationBadges verifiedLevels={verifiedLevels} />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <AboutOverview data={about} />
          </Grid>
        </Grid>
      </Box>
    </Box>
  )
}

export default TrustDetailSection
