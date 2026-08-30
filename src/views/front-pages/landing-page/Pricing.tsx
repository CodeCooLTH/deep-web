// React Imports
import { useState } from 'react'
import type { ChangeEvent } from 'react'

// MUI Imports
import Typography from '@mui/material/Typography'
import Grid from '@mui/material/Grid'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Switch from '@mui/material/Switch'
import Chip from '@mui/material/Chip'
import InputLabel from '@mui/material/InputLabel'
import Divider from '@mui/material/Divider'

// Third-party Imports
import classnames from 'classnames'

// Type Imports
import type { ThemeColor } from '@core/types'

// Components Imports
import CustomAvatar from '@core/components/mui/Avatar'
import { LinkButton } from '@/app/(marketing)/_components/mui-link'

// Styles Imports
import frontCommonStyles from '@views/front-pages/styles.module.css'
import styles from './styles.module.css'

type PricingPlan = {
  title: string
  icon: string
  color: ThemeColor
  monthlyPay: number
  annualPay: number
  perYearPay: number
  features: string[]
  cta: string
  current: boolean
}

const pricingPlans: PricingPlan[] = [
  {
    title: 'Free',
    icon: 'tabler-rocket',
    color: 'secondary',
    monthlyPay: 0,
    annualPay: 0,
    perYearPay: 0,
    features: [
      'หน้าธุรกิจ 1 หน้า',
      'ผู้ใช้งาน 1 คน',
      'ลิ้งค์โปรไฟล์ / พอร์ต',
      'Dashboard รายงาน (อัปเดตรายวัน)',
      'รายงานยอดขาย',
      'รายงานกำไร–ขาดทุนเบื้องต้น',
      'อัปเดต Marketplace แบบ Manual'
    ],
    cta: 'เริ่มฟรี',
    current: false
  },
  {
    title: 'Basic',
    icon: 'tabler-briefcase',
    color: 'info',
    monthlyPay: 199,
    annualPay: 166,
    perYearPay: 1990,
    features: [
      'รวมทุกสิทธิ์ของแพ็ก Free',
      'ลิ้งค์สรุปคำสั่งซื้อ',
      'ระบบจัดการคำสั่งซื้อ 3 ขั้นตอน'
    ],
    cta: 'เริ่มใช้งาน',
    current: false
  },
  {
    title: 'Pro',
    icon: 'tabler-crown',
    color: 'primary',
    monthlyPay: 299,
    annualPay: 249,
    perYearPay: 2990,
    features: [
      'รวมทุกสิทธิ์ของแพ็ก Basic',
      'หน้าธุรกิจ 3 หน้า',
      'ผู้ใช้งาน 3 คน',
      '10 จังหวัดคำสั่งซื้อมากที่สุด',
      'ระบบจัดการคำสั่งซื้อ (Full Loop)',
      'ระบบจัดการขนส่ง (Full Loop)'
    ],
    cta: 'เริ่มใช้งาน',
    current: true
  },
  {
    title: 'Business',
    icon: 'tabler-building-skyscraper',
    color: 'success',
    monthlyPay: 1259,
    annualPay: 1045,
    perYearPay: 12540,
    features: [
      'รวมทุกสิทธิ์ของแพ็ก Pro',
      'หน้าธุรกิจ 5 หน้า',
      'ผู้ใช้งานไม่จำกัด',
      'แชทระบบ พูดคุยกับลูกค้า',
      'รายงานตามช่องทางขาย (Real Time)',
      'สถิติระบบ',
      'อัปเดต Marketplace อัตโนมัติ (Auto)'
    ],
    cta: 'เริ่มใช้งาน',
    current: false
  }
]

const PricingPlan = () => {
  // States
  const [pricingPlan, setPricingPlan] = useState<'monthly' | 'annually'>('annually')

  const handleChange = (e: ChangeEvent<{ checked: boolean }>) => {
    if (e.target.checked) {
      setPricingPlan('annually')
    } else {
      setPricingPlan('monthly')
    }
  }

  return (
    <section
      id='pricing-plans'
      className={classnames(
        'flex flex-col gap-6 md:gap-8 lg:gap-12 plb-8 md:plb-[100px] bg-backgroundDefault rounded-3xl md:rounded-[60px]', /* carve-out รัศมี: รูปทรงของ section ไม่ใช่การ์ด — บันได 6/8/12 ใช้กับของที่อยู่ *ใน* หน้า ไม่ใช่ตัวหน้าเอง */
        styles.sectionStartRadius
      )}
    >
      <div className={classnames('is-full', frontCommonStyles.layoutSpacing)}>
        <div className='flex flex-col gap-y-4 items-center justify-center'>
          <Chip size='small' variant='tonal' color='primary' label='แพ็กเกจราคา' />
          <div className='flex flex-col items-center gap-y-1 justify-center flex-wrap'>
            <div className='flex items-center gap-x-2'>
              <Typography color='text.primary' variant='h4' className='text-center'>
                <span className='relative z-[1] font-extrabold'>
                  เลือกแพ็กเกจ
                  <img
                    src='/images/front-pages/landing-page/bg-shape.png'
                    alt='bg-shape'
                    className='absolute block-end-0 z-[1] bs-[40%] is-[125%] sm:is-[132%] -inline-start-[10%] sm:inline-start-[-19%] block-start-[17px]'
                  />
                </span>{' '}
                ที่เหมาะกับคุณ
              </Typography>
            </div>
            <Typography className='text-center'>
              ทุกแพ็กเกจมาพร้อมฟีเจอร์สร้างความน่าเชื่อถือครบครัน
              <br />
              เริ่มต้นฟรี ยกระดับเมื่อธุรกิจเติบโต
            </Typography>
          </div>
        </div>
        <div className='flex justify-center items-center mb-3 md:mb-6'>
          <InputLabel htmlFor='pricing-switch' className='cursor-pointer'>
            รายเดือน
          </InputLabel>
          <Switch id='pricing-switch' onChange={handleChange} checked={pricingPlan === 'annually'} />
          <InputLabel htmlFor='pricing-switch' className='cursor-pointer'>
            รายปี
          </InputLabel>
          <div className='hidden sm:flex gap-x-1 items-start mis-2 mbe-5'>
            <img src='/images/front-pages/landing-page/pricing-arrow.png' width='50' />
            <Typography className='font-medium'>ประหยัด 17%</Typography>
          </div>
        </div>
        <Grid container spacing={6}>
          {pricingPlans.map((plan, index) => (
            <Grid key={index} size={{ xs: 12, md: 6, lg: 3 }}>
              <Card className='bs-full flex flex-col border shadow-sm transition-all duration-200 hover:shadow-lg hover:-translate-y-1'>
                <CardContent className='flex flex-col gap-6 bs-full'>
                  <div className='is-full flex flex-col items-center gap-3'>
                    <CustomAvatar variant='rounded' skin='light' color={plan.color} size={64}>
                      <i className={classnames(plan.icon, 'text-[32px]')} />
                    </CustomAvatar>
                  </div>
                  <div className='flex flex-col items-center gap-y-1'>
                    <Typography className='text-center' variant='h5'>
                      {plan.title}
                    </Typography>
                    <div className='flex items-baseline gap-x-1'>
                      <Typography variant='h3' color='text.primary' className='font-extrabold'>
                        ฿{(pricingPlan === 'monthly' ? plan.monthlyPay : plan.annualPay).toLocaleString('th-TH')}
                      </Typography>
                      <Typography color='text.disabled' className='font-medium'>
                        /เดือน
                      </Typography>
                    </div>
                    <Typography variant='body2' color='text.disabled' className='bs-[20px]'>
                      {pricingPlan === 'annually' && plan.perYearPay > 0 ? `฿${plan.perYearPay.toLocaleString('th-TH')} / ปี` : ''}
                    </Typography>
                  </div>
                  <Divider />
                  <div className='flex flex-col gap-3'>
                    {plan.features.map((feature, index) => (
                      <div key={index} className='flex items-center gap-[12px]'>
                        <CustomAvatar color={plan.color} skin='light' size={22}>
                          <i className='tabler-check text-[13px]' />
                        </CustomAvatar>
                        <Typography>{feature}</Typography>
                      </div>
                    ))}
                  </div>
                  <LinkButton href='/auth/sign-up' variant='contained' className='mbs-auto'>
                    {plan.cta}
                  </LinkButton>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </div>
    </section>
  )
}

export default PricingPlan
