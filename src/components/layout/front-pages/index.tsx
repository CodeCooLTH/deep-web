// Type Imports
import type { ChildrenType } from '@core/types'

// Component Imports
import Footer from '@components/layout/front-pages/Footer'
import Header from '@components/layout/front-pages/Header'

// Server Action Imports
import { getServerMode } from '@core/utils/serverHelpers'

// Util Imports
import { frontLayoutClasses } from '@layouts/utils/layoutClasses'

// hideChromeMobile = ซ่อน marketing header + footer บน mobile (<768) — ใช้กับ buyer-app
// ที่ต้องการ "แอปมือถือ" เต็มจอ (top bar + bottom nav ของตัวเอง); desktop/tablet เหมือนเดิม
const FrontLayout = async ({
  children,
  solidHeader = false,
  hideChromeMobile = false
}: ChildrenType & { solidHeader?: boolean; hideChromeMobile?: boolean }) => {
  // Vars
  const mode = await getServerMode()

  // display:contents = wrapper โปร่ง (Header/Footer เป็น flex item ตรง ๆ เหมือนเดิม);
  // mobile hidden = หายทั้ง header/footer
  const chromeCls = hideChromeMobile ? 'hidden min-[768px]:contents' : 'contents'

  return (
    // sticky footer: root สูงเต็มจอ + flex column, content ยืด (flex-1) → footer ติดล่างสุดเสมอ
    <div className={`${frontLayoutClasses.root} flex flex-col min-bs-[100dvh]`}>
      <div className={chromeCls}>
        <Header mode={mode} solidHeader={solidHeader} />
      </div>
      <div className='flex-1'>{children}</div>
      <div className={chromeCls}>
        <Footer mode={mode} />
      </div>
    </div>
  )
}

export default FrontLayout
