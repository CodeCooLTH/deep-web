'use client'

// Third-party Imports
import classnames from 'classnames'

// Hook Imports
import useVerticalNav from '@menu/hooks/useVerticalNav'

// Util Imports
import { verticalLayoutClasses } from '@layouts/utils/layoutClasses'

// Config
import { META_DATA } from '@/config/constants'
import { formatYearTH } from '@/lib/format-date'

const FooterContent = () => {
  // Hooks
  const { isBreakpointReached } = useVerticalNav()

  return (
    <div
      className={classnames(verticalLayoutClasses.footerContent, 'flex items-center justify-between flex-wrap gap-4')}
    >
      <p>
        <span className='text-textSecondary'>{`© ${formatYearTH(new Date())} ${META_DATA.name} — by `}</span>
        <span className='text-primary font-medium'>{META_DATA.author}</span>
      </p>
      {!isBreakpointReached && (
        <div className='text-textSecondary text-[13px]'>
          <span>ทุกการยืนยันตัวตน คือก้าวแรกของการค้าที่น่าเชื่อถือ</span>
        </div>
      )}
    </div>
  )
}

export default FooterContent
