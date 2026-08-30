// MUI Imports
import Typography from '@mui/material/Typography'

// React Imports
import type { ReactNode } from 'react'

/**
 * Header กลางของทุกหน้าใน buyer-app (บัญชีของฉัน) — ให้ทุกหน้า title/subtitle/action ตรงกัน.
 * layout ห่อ content ด้วย `main flex-col gap-6` แล้ว → header กับ content เว้นระยะเท่ากันทุกหน้า.
 */
type Props = {
  title: string
  subtitle?: string
  action?: ReactNode
}

const PageHeader = ({ title, subtitle, action }: Props) => (
  <div className='flex items-start justify-between gap-4 flex-wrap'>
    <div className='min-w-0'>
      <Typography variant='h5' className='font-medium'>
        {title}
      </Typography>
      {subtitle && (
        <Typography variant='body2' color='text.secondary' className='mbs-0.5'>
          {subtitle}
        </Typography>
      )}
    </div>
    {action && <div className='shrink-0'>{action}</div>}
  </div>
)

export default PageHeader
