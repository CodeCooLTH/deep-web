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
import PlatformReputationList from './PlatformReputationList'
import VerificationBadges from './profile/VerificationBadges'
import AboutOverview from './profile/AboutOverview'
import type { AboutData } from './profile/AboutOverview'

// Base: theme/vuexy/typescript-version/full-version/src/views/pages/user-profile/profile/ConnectionsTeams.tsx
// (Grid size={{xs:12, md:6}} 2-column card grid pattern) — ส่วนขยาย Desktop layout redesign (S-B14, IG-style + trust data)
// full-bleed band พื้น Cool Mist — bgcolor: background.default resolve เป็น #F8F7FA จริงเมื่อ skin='default'
// (ดู src/@core/theme/colorSchemes.ts:86 + src/configs/themeConfig.ts:61) เนื้อหาข้างในยัง cap ที่ container 960px
// 4 การ์ด: TrustScoreCard(gauge) · VerificationBadges(revive) · PlatformReputationList(placeholder ปิดป้าย) ·
// AboutOverview(revive) — การ์ดทุกใบ shadow sm ผ่านตัวเอง (แก้ที่ไฟล์คอมโพเนนต์แต่ละใบแล้ว)

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
          <Grid size={{ xs: 12, md: 6 }}>
            <TrustScoreCard data={trustScore} />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <VerificationBadges verifiedLevels={verifiedLevels} />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <PlatformReputationList />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <AboutOverview data={about} />
          </Grid>
        </Grid>
      </Box>
    </Box>
  )
}

export default TrustDetailSection
