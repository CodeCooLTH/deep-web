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
        // ทำไม: mobile full-bleed (user feedback 2026-05-23) — การ์ดเต็มจอ ไม่มีมุมโค้ง/เงา/max-width
        // desktop (md+) คง contained card 1024px ลอยมี padding+เงา+gradient เหมือนเดิม
        maxWidth: { xs: '100%', md: 1024 },
        mx: { md: 'auto' },
        bgcolor: 'background.paper',
        borderRadius: { xs: 0, md: '16px' },
        // R9: overflow hidden ทำให้ sticky ใน left panel ไม่ทำงาน — เปลี่ยนเป็น visible บน md+
        // banner radius ยังคงจากตัว Banner box เอง (overflow:hidden ภายใน Banner) — ไม่เสีย
        overflow: { xs: 'hidden', md: 'visible' },
        position: 'relative',
        // mobile: ไม่มีเงา (เต็มจอ เงาไม่มีความหมาย); desktop: คงเงา mockup --shadow-xl
        boxShadow: { xs: 'none', md: '0 25px 70px rgba(15,23,42,.18), 0 8px 16px rgba(15,23,42,.08)' },
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
      {/* R9: sticky left panel บน desktop — identity ติดบนขณะ scroll (alignSelf:start ป้องกัน stretch) */}
      <Box sx={{ gridArea: { md: 'left' }, position: { md: 'sticky' }, top: { md: 16 }, alignSelf: { md: 'start' } }}>
        <ProfileLeftPanel data={profileHeader} />
        <ProfileLeftContent
          data={{
            completedOrders: profileTab.completedOrders,
            avgRating: profileTab.avgRating,
            showRating: profileTab.showRating,
            openShopEmptyState: profileTab.openShopEmptyState,
            // S-25 (extension #2 Response-rate metric)
            chatResponseRate: profileTab.chatResponseRate,
            chatMedianResponseSec: profileTab.chatMedianResponseSec,
            chatResponseSampleSize: profileTab.chatResponseSampleSize,
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
            // R2: เส้นคั่น left-right เฉพาะ desktop — ไม่มี mobile
            borderLeft: { md: '1px solid #E2E8F0' },
          }}
        >
          <ProfileRightContent
            data={{
              achievements: profileTab.achievements,
              products: profileTab.products,
              openShopEmptyState: profileTab.openShopEmptyState,
              totalBadgeCount: profileTab.totalBadgeCount,
            }}
            // S-19 (extension #1 Chat Product Context Card): prop-drill shopId/isOwnShop จาก profileHeader (S-8)
            shopId={profileHeader.shopId}
            isOwnShop={profileHeader.isOwnShop}
          />
        </Box>
      )}
    </Box>
  )
}

export default UserProfile
