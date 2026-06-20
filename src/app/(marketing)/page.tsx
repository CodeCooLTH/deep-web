// Util Imports
import { getServerMode } from '@core/utils/serverHelpers'

// Component Imports
import FrontLayout from '@components/layout/front-pages'
import LandingPageWrapper from '@views/front-pages/landing-page'

// Service Imports
import { getShopCount } from '@/services/shop.service'

export default async function MarketingHomePage() {
  const mode = await getServerMode()
  const shopCount = await getShopCount()

  return (
    <FrontLayout>
      <LandingPageWrapper mode={mode} shopCount={shopCount} />
    </FrontLayout>
  )
}
