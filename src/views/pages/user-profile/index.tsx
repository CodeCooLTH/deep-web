// MUI Imports
import Box from '@mui/material/Box'

// Component Imports
import { ProfileBanner, ProfileLeftPanel } from './UserProfileHeader'
import type { ProfileHeaderData } from './UserProfileHeader'
import { ProfileLeftContent, ProfileRightContent } from './profile'
import type { ProfileTabData } from './profile'

// Base: theme/vuexy/typescript-version/full-version/src/views/pages/user-profile/index.tsx
// Adapted: ตัด Tabs wrapper ออก (มีแท็บเดียว — ไม่ต้องการ TabContext + CustomTabList)
// Rework: เปลี่ยนจาก Grid 2-คอลัมน์ → การ์ดเดียว max-width 640px ตาม mockup_shop_profile.html (D7 approved)
// Responsive (2026-05-23): เพิ่ม Option A 2-column CSS Grid บน md+
//   - mobile (< md): Box card เดียว flex-column — flow เดิมทุกอย่าง
//   - desktop (md+): CSS grid 2-column (340px + 1fr) 3 grid-area: banner / left / right
//   3 บล็อก: Banner (span 2 col) / LeftPanel (x-header+identity+platforms+stats) / RightPanel (achievements+products+FAB)

const UserProfile = ({
  profileHeader,
  profileTab,
}: {
  profileHeader: ProfileHeaderData
  profileTab: ProfileTabData
}) => {
  // ทำไม: ตรวจว่า right panel มี content เพื่อป้องกัน layout พัง (buyer-only / ไม่มี badge + ไม่มีสินค้า)
  const hasRightContent =
    !profileTab.openShopEmptyState || profileTab.achievements.length > 0

  return (
    <Box
      sx={{
        maxWidth: { xs: 640, md: 1024 },
        mx: 'auto',
        bgcolor: 'background.paper',
        borderRadius: { xs: '24px', md: '16px' },
        overflow: 'hidden',
        position: 'relative',
        // เงาตาม mockup --shadow-xl
        boxShadow: '0 25px 70px rgba(15,23,42,.18), 0 8px 16px rgba(15,23,42,.08)',
        // base (mobile): flex column — เรียง Banner → Left → Right ตาม flow เดิม
        // md+: CSS grid-template-areas 2-column เมื่อมี right content; single-column เมื่อไม่มี
        display: { md: 'grid' },
        gridTemplateColumns: {
          md: hasRightContent ? '340px 1fr' : '1fr',
        },
        gridTemplateAreas: {
          md: hasRightContent ? '"banner banner" "left right"' : '"banner" "left"',
        },
        alignItems: 'start',
      }}
    >
      {/* ── Banner block: span 2 col บน desktop ── */}
      {/* ทำไม: gridArea ให้ banner span 2 col; height responsive ส่งเข้า ProfileBanner โดยตรง */}
      <Box sx={{ gridArea: { md: 'banner' } }}>
        <ProfileBanner data={profileHeader} bannerHeight={{ xs: 160, md: 200 }} />
      </Box>

      {/* ── Left panel: x-header + identity + platforms + stats ── */}
      {/* ทำไม: บน desktop left col 340px — content ไหลตาม natural height */}
      <Box sx={{ gridArea: { md: 'left' } }}>
        <ProfileLeftPanel data={profileHeader} />
        <ProfileLeftContent
          data={{
            completedOrders: profileTab.completedOrders,
            avgRating: profileTab.avgRating,
            showRating: profileTab.showRating,
            openShopEmptyState: profileTab.openShopEmptyState,
          }}
        />
      </Box>

      {/* ── Right panel: achievements + products + FAB ── */}
      {/* ทำไม: ซ่อนทั้งหมดเมื่อไม่มี content — ป้องกัน right col ว่างบน desktop */}
      {hasRightContent && (
        <Box
          sx={{
            gridArea: { md: 'right' },
            // ทำไม: min-height ป้องกัน right col แคบเกินไปเมื่อ products ว่าง
            minHeight: { md: 200 },
          }}
        >
          <ProfileRightContent
            data={{
              achievements: profileTab.achievements,
              products: profileTab.products,
              openShopEmptyState: profileTab.openShopEmptyState,
              totalBadgeCount: profileTab.totalBadgeCount,
            }}
          />
        </Box>
      )}
    </Box>
  )
}

export default UserProfile
