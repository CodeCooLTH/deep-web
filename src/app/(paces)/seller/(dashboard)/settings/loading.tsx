/**
 * loading.tsx — skeleton สำหรับ /settings
 * mirror layout: single card (settings card)
 *
 * Base: src/app/(paces)/seller/(dashboard)/badges/loading.tsx
 *   — pattern PageBreadcrumb + SellerCardSkeleton
 */
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { SellerCardSkeleton } from '../_shared/SellerCardSkeleton'

const SettingsLoading = () => (
  <>
    <PageBreadcrumb title="บัญชีที่เชื่อมต่อ" trail={[{ label: 'ภาพรวม' }]} />
    <SellerCardSkeleton />
  </>
)

export default SettingsLoading
