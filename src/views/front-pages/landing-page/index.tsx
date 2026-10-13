'use client'

// React Imports
import { useEffect } from 'react'

// Type Imports
import type { SystemMode } from '@core/types'

// Component Imports
import TrustSearchHero, { type LandingShop } from './TrustSearchHero'
import ShopLightGrid from './ShopLightGrid'
import UsefulFeature from './UsefulFeature'
import CustomerReviews from './CustomerReviews'
import HowItWorks from './HowItWorks'
import Pricing from './Pricing'
import ProductStat from './ProductStat'
import Faqs from './Faqs'
import { useSettings } from '@core/hooks/useSettings'

const LandingPageWrapper = ({
  shopCount,
  shops
}: {
  mode: SystemMode
  shopCount: number
  shops: LandingShop[]
}) => {
  // Hooks
  const { updatePageSettings } = useSettings()

  // For Page specific settings
  useEffect(() => {
    return updatePageSettings({
      skin: 'default'
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className='bg-backgroundPaper'>
      {/* เปิดมาเจอช่องค้นหา (เช็กก่อนโอน) + ร้านจริงพร้อม Trust Score ทันที — แทน HeroSection เดิม
          ซึ่งมีตัวเลขสมมติ ("1,200+ รายการ", "95 / 100") และย้าย ScamCheck ขึ้นมารวมไว้ที่นี่ */}
      <TrustSearchHero shops={shops} />
      <ShopLightGrid shops={shops} shopCount={shopCount} />
      <ProductStat shopCount={shopCount} />
      <UsefulFeature />
      <CustomerReviews />
      <HowItWorks />
      <Pricing />
      <Faqs />
    </div>
  )
}

export default LandingPageWrapper
