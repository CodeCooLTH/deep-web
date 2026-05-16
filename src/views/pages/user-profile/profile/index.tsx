// MUI Imports
import Grid from '@mui/material/Grid'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'

// Icon Imports
import { Icon } from '@iconify/react'

// Component Imports
import AboutOverview from './AboutOverview'
import type { AboutOverviewData } from './AboutOverview'
import VerificationBadges from './VerificationBadges'
import AchievementBadges from './AchievementBadges'
import RecentReviews from './RecentReviews'

export type ProfileTabData = {
  about: AboutOverviewData
  verification: {
    level: number
    label: string
    icon: string
    active: boolean
  }[]
  achievements: {
    id: string
    name: string
    nameEN: string
    icon: string
  }[]
  reviews: {
    id: string
    rating: number
    comment: string | null
    createdAt: string
    itemName: string | null
  }[]
  avgRating: number
  /** FR-9.5: true เมื่อบัญชี buyer-only (ไม่มีร้าน) — แสดง empty-state ชวนเปิดร้านแทน achievement badge */
  openShopEmptyState?: boolean
}

// Base: theme/vuexy/typescript-version/full-version/src/views/pages/user-profile/profile/index.tsx
// Adapted: dropped ActivityTimeline, ConnectionsTeams, ProjectsTable (not applicable).
// Kept 5/7 (left) + 7/8 (right) grid split — left holds AboutOverview, right holds verification/badges/reviews.
const ProfileTab = ({ data }: { data: ProfileTabData }) => {
  return (
    <Grid container spacing={6}>
      <Grid size={{ xs: 12, md: 5, lg: 4 }} className='order-last md:order-first'>
        <AboutOverview data={data.about} />
      </Grid>
      <Grid size={{ xs: 12, md: 7, lg: 8 }} className='order-first md:order-last'>
        <Grid container spacing={6}>
          <Grid size={{ xs: 12 }}>
            <VerificationBadges items={data.verification} />
          </Grid>
          {data.achievements.length > 0 && (
            <Grid size={{ xs: 12 }}>
              <AchievementBadges items={data.achievements} />
            </Grid>
          )}
          {/* FR-9.5: บัญชี buyer-only — แสดง empty-state ชวนเปิดร้าน แทนการแสดง achievement badge */}
          {data.openShopEmptyState && data.achievements.length === 0 && (
            <Grid size={{ xs: 12 }}>
              <Card variant='outlined'>
                <CardContent className='flex flex-col items-center gap-3 py-8 text-center'>
                  <Icon icon='tabler-building-store' className='text-5xl text-[var(--mui-palette-primary-main)]' />
                  <Typography variant='h6'>เปิดร้านเพื่อสะสม Achievement Badge</Typography>
                  <Typography variant='body2' color='text.secondary'>
                    บัญชีนี้ยังไม่มีร้านค้า Achievement Badge จะแสดงเมื่อเปิดร้านและเริ่มขายสินค้า
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          )}
          <Grid size={{ xs: 12 }}>
            <RecentReviews reviews={data.reviews} avgRating={data.avgRating} />
          </Grid>
        </Grid>
      </Grid>
    </Grid>
  )
}

export default ProfileTab
