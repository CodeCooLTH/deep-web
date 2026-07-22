'use client'

// MUI Imports
import Box from '@mui/material/Box'

// Component Imports
import { ProfileBanner, ProfileIdentityBar } from './UserProfileHeader'
import type { ProfileHeaderData } from './UserProfileHeader'
import ProfileStatsBar from './ProfileStatsBar'
import BadgePillRow from './BadgePillRow'
import { ProfileRightContent } from './profile'
import type { ProfileTabData } from './profile'
import ProfileTabsNav from './ProfileTabsNav'
import type { ProfileTabItem } from './ProfileTabsNav'
import TrustDetailSection from './TrustDetailSection'

// Base: theme/vuexy/typescript-version/full-version/src/views/pages/user-profile/index.tsx
// ส่วนขยาย Desktop layout redesign (2026-07-22, IG-style + trust data — S-B10):
//   ตัด grid-template-areas / sidebar กว้างคงที่แบบ sticky เดิม (hybrid FB Page × Threads spec, 2026-07-04) ทิ้งทั้งหมด
//   → คอลัมน์เดียวจัดกลาง container maxWidth 960px, mx:auto (Hard Rule 6: เอา IA/layout ตาม IG แต่สี/component = Vuexy+Deep token)
//   breakpoint = md(900) ตาม convention เดิมของไฟล์นี้เอง (Controller ตัดสิน — ไม่ใช่ 1200)
// wireframe เป้าหมาย: banner(เต็มจอ, คงเดิม) → identity → stats bar(4 คอลัมน์) → badge pill row → tabs →
//   product grid(pinned/all) → TrustDetailSection(full-bleed band Cool Mist, 4 การ์ด 2x2)

const UserProfile = ({
  profileHeader,
  profileTab,
}: {
  profileHeader: ProfileHeaderData
  profileTab: ProfileTabData
}) => {
  const { pinnedProducts, otherProducts } = profileTab
  // ทำไม: product grid ทั้งชุดซ่อนเมื่อ buyer-only (ไม่มีร้าน) — TrustDetailSection ยังแสดงเสมอ (มีข้อมูลให้ดูแม้ไม่มีร้าน)
  const hasRightContent = !profileTab.openShopEmptyState

  // tabs: ซ่อนแท็บสินค้าที่ section ของมันไม่ render จริง (กันคลิกแล้วไม่มีอะไรให้ scroll ไปหา)
  // ความน่าเชื่อถือโดยละเอียด render เสมอ (TrustDetailSection ไม่มีเงื่อนไขว่าง) — คงแท็บนี้ไว้ตลอด (S-B15)
  const tabs: ProfileTabItem[] = [
    ...(hasRightContent && pinnedProducts.length > 0 ? [{ id: 'pinned-products', label: 'สินค้าปักหมุด' }] : []),
    ...(hasRightContent && otherProducts.length > 0 ? [{ id: 'all-products', label: 'สินค้าทั้งหมด' }] : []),
    { id: 'trust-detail-section', label: 'ความน่าเชื่อถือโดยละเอียด' },
  ]

  return (
    <Box sx={{ width: '100%', bgcolor: 'background.paper' }}>
      {/* ── Cover: gradient ต่อ tier (คงเดิม ไม่แตะ) ── */}
      <ProfileBanner data={profileHeader} />

      <Box sx={{ maxWidth: 960, mx: 'auto' }}>
        {/* ── Identity bar: avatar + name/handle/chip + actions ── */}
        <ProfileIdentityBar data={profileHeader} />

        {/* ── Stats bar: คะแนน+tier(เด่นสุด) · ออเดอร์ · อัตราสำเร็จ(S-B12) · รีวิว ── */}
        <ProfileStatsBar
          data={{
            trustScore: profileHeader.trustScore,
            tierLabel: profileHeader.tierLabel,
            completedOrders: profileHeader.completedOrders,
            completionRate: profileHeader.completionRate,
            avgRating: profileHeader.avgRating,
            showRating: profileHeader.showRating,
          }}
        />

        {/* ── Badge pill row: แทน medal-frame เดิม (S-B13) ── */}
        <BadgePillRow items={profileTab.achievements} totalCount={profileTab.totalBadgeCount} />

        {/* ── Tabs nav: anchor-scroll ไม่เปลี่ยน route ── */}
        <Box sx={{ borderBottom: '1px solid', borderColor: 'divider', px: { xs: '8px', md: '16px' } }}>
          <ProfileTabsNav items={tabs} />
        </Box>

        {/* ── Product grid: pinned + all (คงเหลือแค่นี้ — platform reputation ย้ายไป TrustDetailSection แล้ว) ── */}
        {hasRightContent && (
          <ProfileRightContent
            data={{
              pinnedProducts: profileTab.pinnedProducts,
              otherProducts: profileTab.otherProducts,
              openShopEmptyState: profileTab.openShopEmptyState,
            }}
            // S-19 (extension #1 Chat Product Context Card): prop-drill shopId/isOwnShop จาก profileHeader (S-8)
            shopId={profileHeader.shopId}
            isOwnShop={profileHeader.isOwnShop}
          />
        )}
      </Box>

      {/* ── Trust detail section: full-bleed band Cool Mist, 4 การ์ด 2x2 (S-B14) ── */}
      <TrustDetailSection
        data={{
          trustScore: {
            trustScore: profileTab.trustScore,
            tierLabel: profileTab.tierLabel,
            tierColor: profileTab.tierColor,
            nextTierLabel: profileTab.nextTierLabel,
            pointsToNext: profileTab.pointsToNext,
            verifiedLevels: profileTab.verifiedLevels,
          },
          verifiedLevels: profileTab.verifiedLevels,
          about: {
            bio: profileTab.bio,
            location: profileTab.location,
            memberSince: profileTab.memberSince,
            chatResponseRate: profileTab.chatResponseRate,
            chatMedianResponseSec: profileTab.chatMedianResponseSec,
            chatResponseSampleSize: profileTab.chatResponseSampleSize,
          },
        }}
      />
    </Box>
  )
}

export default UserProfile
