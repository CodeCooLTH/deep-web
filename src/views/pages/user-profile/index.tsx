'use client'

// MUI Imports
import Box from '@mui/material/Box'

// Component Imports
import { ProfileBanner, ProfileIdentityBar } from './UserProfileHeader'
import type { ProfileHeaderData } from './UserProfileHeader'
import { ProfileLeftContent, ProfileRightContent, splitPinnedProducts } from './profile'
import type { ProfileTabData } from './profile'
import ProfileTabsNav from './ProfileTabsNav'
import type { ProfileTabItem } from './ProfileTabsNav'

// Base: theme/vuexy/typescript-version/full-version/src/views/pages/user-profile/index.tsx
// Redesign (2026-07-04, hybrid FB Page × Threads spec): grid-template-areas ใหม่
//   cover(span2) / identity(span2) / tabs(span2) / left(340px sticky) + right(1fr)
// mobile/tablet (< md): display ปกติ (ไม่ใช่ grid) → children เรียงตาม DOM order เป็น single-column stack
//   (เทคนิคเดิมจาก R9: display:{md:'grid'} ทำให้ gridArea sx ถูกมองข้ามที่ mobile โดยอัตโนมัติ)

const UserProfile = ({
  profileHeader,
  profileTab,
}: {
  profileHeader: ProfileHeaderData
  profileTab: ProfileTabData
}) => {
  const { pinned, remaining } = splitPinnedProducts(profileTab.products)
  const hasProducts = pinned.length > 0
  // ทำไม: right column ทั้งชุด (products+platforms) ซ่อนเมื่อ buyer-only (ไม่มีร้าน) — achievements ย้ายไป left แล้ว
  const hasRightContent = !profileTab.openShopEmptyState

  // tabs: ซ่อนแท็บที่ section ของมันไม่ render จริง (กันคลิกแล้วไม่มีอะไรให้ scroll ไปหา)
  const tabs: ProfileTabItem[] = [
    ...(hasRightContent && hasProducts ? [{ id: 'pinned-products', label: 'สินค้าปักหมุด' }] : []),
    ...(hasRightContent && remaining.length > 0 ? [{ id: 'all-products', label: 'สินค้าทั้งหมด' }] : []),
    ...(profileTab.achievements.length > 0 ? [{ id: 'achievements', label: 'การรับรอง' }] : []),
    { id: 'about', label: 'เกี่ยวกับ' },
  ]

  return (
    <Box
      sx={{
        // ทำไม: full-bleed edge-to-edge ทุก breakpoint ตาม mockup ที่ user อนุมัติ (2026-07-04 fix)
        // เดิม md+ เคยเป็นการ์ด 1024px ลอย + borderRadius + boxShadow — ผิด requirement เต็มจอไม่มี frame
        width: '100%',
        bgcolor: 'background.paper',
        position: 'relative',
        display: { md: 'grid' },
        gridTemplateColumns: {
          md: hasRightContent ? '340px 1fr' : '1fr',
        },
        gridTemplateAreas: {
          md: hasRightContent ? '"cover cover" "identity identity" "tabs tabs" "left right"' : '"cover" "identity" "tabs" "left"',
        },
        alignItems: 'start',
      }}
    >
      {/* ── Cover: gradient ต่อ tier, span 2 col บน desktop ── */}
      <Box sx={{ gridArea: { md: 'cover' } }}>
        <ProfileBanner data={profileHeader} />
      </Box>

      {/* ── Identity bar: avatar + name/handle/metric-row + actions, span 2 col บน desktop ── */}
      <Box sx={{ gridArea: { md: 'identity' } }}>
        <ProfileIdentityBar data={profileHeader} />
      </Box>

      {/* ── Tabs nav: anchor-scroll ไม่เปลี่ยน route, span 2 col บน desktop ── */}
      <Box sx={{ gridArea: { md: 'tabs' }, borderBottom: '1px solid #E2E8F0', px: { xs: '8px', md: '16px' } }}>
        <ProfileTabsNav items={tabs} />
      </Box>

      {/* ── Left panel: About + TrustScoreCard + Achievements ── */}
      {/* R9: sticky left panel บน desktop — identity ติดบนขณะ scroll (alignSelf:start ป้องกัน stretch) */}
      <Box sx={{ gridArea: { md: 'left' }, position: { md: 'sticky' }, top: { md: 16 }, alignSelf: { md: 'start' } }}>
        <ProfileLeftContent
          data={{
            bio: profileTab.bio,
            location: profileTab.location,
            memberSince: profileTab.memberSince,
            chatResponseRate: profileTab.chatResponseRate,
            chatMedianResponseSec: profileTab.chatMedianResponseSec,
            chatResponseSampleSize: profileTab.chatResponseSampleSize,
            trustScore: profileTab.trustScore,
            tierLabel: profileTab.tierLabel,
            tierColor: profileTab.tierColor,
            nextTierLabel: profileTab.nextTierLabel,
            pointsToNext: profileTab.pointsToNext,
            verifiedLevels: profileTab.verifiedLevels,
            achievements: profileTab.achievements,
            totalBadgeCount: profileTab.totalBadgeCount,
          }}
        />
      </Box>

      {/* ── Right panel: Pinned/All products + Platform reputation ── */}
      {hasRightContent && (
        <Box
          sx={{
            gridArea: { md: 'right' },
            minHeight: { md: 200 },
            borderLeft: { md: '1px solid #E2E8F0' },
          }}
        >
          <ProfileRightContent
            data={{
              products: profileTab.products,
              openShopEmptyState: profileTab.openShopEmptyState,
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
