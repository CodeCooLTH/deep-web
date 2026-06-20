// React Imports
import { Fragment } from 'react'

// MUI Imports
import Typography from '@mui/material/Typography'
import Divider from '@mui/material/Divider'

// Third-party Imports
import classnames from 'classnames'

// Styles Imports
import frontCommonStyles from '@views/front-pages/styles.module.css'

// Type
type StatData = {
  label: string
  value: string
  unit: string
  icon: string
  color: string
}

const ProductStat = ({ shopCount }: { shopCount: number }) => {
  // Data — ตัวแรกดึงของจริงจาก DB (จำนวนร้านค้า), อีกสองตัวเป็น mock
  const statData: StatData[] = [
    {
      label: 'ธุรกิจที่ใช้งานเราอยู่',
      value: `${shopCount.toLocaleString('th-TH')}+`,
      unit: 'บริษัท',
      icon: 'tabler-building-store',
      color: 'var(--mui-palette-primary-main)'
    },
    {
      label: 'คำสั่งซื้อที่ยืนยันแล้ว',
      value: '453,120+',
      unit: 'รายการ',
      icon: 'tabler-receipt',
      color: 'var(--mui-palette-warning-main)'
    },
    {
      // mock ที่เกี่ยวข้องกับ Deep — ป้องกันมิจฉาชีพ (ผูกกับ value prop ของแพลตฟอร์ม)
      label: 'ป้องกันเคสมิจฉาชีพไปแล้ว',
      value: '12,480+',
      unit: 'เคส',
      icon: 'tabler-shield-check',
      color: 'var(--mui-palette-success-main)'
    }
  ]

  return (
    <section className='relative plb-8 md:plb-[84px] bg-backgroundPaper overflow-hidden'>
      <div className={classnames('relative', frontCommonStyles.layoutSpacing)}>
        <div className='flex flex-col sm:flex-row items-stretch justify-center'>
          {statData.map((stat, index) => (
            <Fragment key={index}>
              {index > 0 && <Divider flexItem orientation='vertical' className='hidden sm:block' />}
              <div className='flex flex-1 flex-col items-center justify-start gap-y-2 text-center plb-6 sm:pli-6'>
                <i className={classnames(stat.icon, 'text-[2.5rem]')} style={{ color: stat.color }} />
                <Typography color='text.secondary' className='font-medium'>
                  {stat.label}
                </Typography>
                <Typography variant='h2' className='font-extrabold' style={{ color: stat.color }}>
                  {stat.value}
                </Typography>
                <Typography color='text.secondary' className='font-medium'>
                  {stat.unit}
                </Typography>
              </div>
            </Fragment>
          ))}
        </div>
      </div>
    </section>
  )
}

export default ProductStat
