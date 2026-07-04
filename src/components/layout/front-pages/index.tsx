// Type Imports
import type { ChildrenType } from '@core/types'

// Component Imports
import Footer from '@components/layout/front-pages/Footer'
import Header from '@components/layout/front-pages/Header'

// Server Action Imports
import { getServerMode } from '@core/utils/serverHelpers'

// Util Imports
import { frontLayoutClasses } from '@layouts/utils/layoutClasses'

const FrontLayout = async ({ children, solidHeader = false }: ChildrenType & { solidHeader?: boolean }) => {
  // Vars
  const mode = await getServerMode()

  return (
    <div className={frontLayoutClasses.root}>
      <Header mode={mode} solidHeader={solidHeader} />
      {children}
      <Footer mode={mode} />
    </div>
  )
}

export default FrontLayout
