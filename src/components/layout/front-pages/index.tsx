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
    // sticky footer: root สูงเต็มจอ + flex column, content ยืด (flex-1) → footer ติดล่างสุดเสมอ
    // (ไม่มีช่องว่างขาวใต้ footer แม้เนื้อหาสั้น); หน้าเนื้อหายาวก็ไหลตามปกติ
    <div className={`${frontLayoutClasses.root} flex flex-col min-bs-[100dvh]`}>
      <Header mode={mode} solidHeader={solidHeader} />
      <div className='flex-1'>{children}</div>
      <Footer mode={mode} />
    </div>
  )
}

export default FrontLayout
