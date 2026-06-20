'use client'

// React Imports
import { useEffect } from 'react'

// Type Imports
import type { SystemMode } from '@core/types'

// Component Imports
import HeroSection from './HeroSection'
import UsefulFeature from './UsefulFeature'
import CustomerReviews from './CustomerReviews'
import HowItWorks from './HowItWorks'
import Pricing from './Pricing'
import ProductStat from './ProductStat'
import Faqs from './Faqs'
import { useSettings } from '@core/hooks/useSettings'

const LandingPageWrapper = ({ mode, shopCount }: { mode: SystemMode; shopCount: number }) => {
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
      <HeroSection mode={mode} />
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
