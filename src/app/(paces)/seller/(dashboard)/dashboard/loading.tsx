/**
 * loading.tsx — skeleton สำหรับ /seller/dashboard
 * mirror layout: UserCard-skel + 3× stat card (grid) + chart
 *
 * Base: src/app/(paces)/seller/(dashboard)/_shared/SellerCardSkeleton.tsx
 */
'use client'

import PageBreadcrumb from '@/components/PageBreadcrumb'
import { useT } from '@/i18n/LocaleProvider'
import {
  SellerCardSkeleton,
  SellerChartSkeleton,
} from '../_shared/SellerCardSkeleton'

/**
 * 'use client' เพราะ skeleton นี้คือ **จอแรกที่เห็นตอนเปลี่ยนหน้า** — ถ้าหัวข้อยังเป็นไทย
 * ผู้ใช้ (และ Meta App Reviewer) จะเห็นไทยแวบหนึ่งทุกครั้งก่อนเนื้อหาจริงจะมาเป็นอังกฤษ
 * ห้ามทำเป็น async server component: fallback ที่ suspend เองจะไม่มีอะไรให้แสดงระหว่างรอ
 */
const DashboardLoading = () => {
  const t = useT()

  return (
  <>
    <PageBreadcrumb title={t.dashboard.pageTitle} trail={[{ label: t.dashboard.breadcrumbOverview }]} />
    <div className="space-y-base">
      <span className="sr-only">{t.common.loading}</span>

      {/* UserCard skeleton */}
      <SellerCardSkeleton />

      {/* 3 stat cards (grid) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-base">
        <SellerCardSkeleton />
        <SellerCardSkeleton />
        <SellerCardSkeleton />
      </div>

      {/* chart area */}
      <SellerChartSkeleton />
    </div>
  </>
  )
}

export default DashboardLoading
