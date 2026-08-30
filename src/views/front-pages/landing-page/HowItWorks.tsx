'use client'

// React Imports
import { useEffect, useRef } from 'react'

// MUI Imports
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'

// Third-party Imports
import classnames from 'classnames'

// Type Imports
import type { ThemeColor } from '@core/types'

// Component Imports
import CustomAvatar from '@core/components/mui/Avatar'

// Hook Imports
import { useIntersection } from '@/hooks/useIntersection'

// Styles Imports
import frontCommonStyles from '@views/front-pages/styles.module.css'

type Step = {
  no: number
  title: string
  desc: string
  icon: string
  color: ThemeColor
}

const steps: Step[] = [
  {
    no: 1,
    title: 'สมัครใช้งาน',
    desc: 'สมัครและยืนยันตัวตน เริ่มต้นใช้งานได้ฟรี',
    icon: 'tabler-user-plus',
    color: 'primary'
  },
  {
    no: 2,
    title: 'สร้างคำสั่งซื้อ',
    desc: 'สร้างออร์เดอร์พร้อมรายละเอียดสินค้าหรือบริการ',
    icon: 'tabler-file-invoice',
    color: 'info'
  },
  {
    no: 3,
    title: 'ส่งลิงก์ไปยังผู้ซื้อ',
    desc: 'ส่งลิงก์คำสั่งซื้อให้ลูกค้าผ่านแชตหรือ SMS',
    icon: 'tabler-send',
    color: 'warning'
  },
  {
    no: 4,
    title: 'ผู้ซื้อยืนยัน',
    desc: 'ลูกค้ายืนยันรับสินค้าผ่าน OTP โดยไม่ต้องสมัคร',
    icon: 'tabler-shield-check',
    color: 'success'
  },
  {
    no: 5,
    title: 'ได้รับ Verify Score',
    desc: 'รับคะแนนความน่าเชื่อถือจากทุกดีลที่สำเร็จ',
    icon: 'tabler-rosette-discount-check',
    color: 'error'
  },
  {
    no: 6,
    title: 'อัปเดตโปรไฟล์ทันที',
    desc: 'Trust Score และ Badge แสดงบนโปรไฟล์ทันที',
    icon: 'tabler-trending-up',
    color: 'primary'
  }
]

const StepCard = ({ step, className }: { step: Step; className?: string }) => (
  <div
    className={classnames(
      'flex flex-col items-center text-center gap-2.5 p-5 rounded-2xl border bg-white shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-1 justify-center',
      className
    )}
  >
    <div className='relative'>
      <CustomAvatar variant='rounded' skin='light' color={step.color} size={48}>
        <i className={classnames(step.icon, 'text-[24px]')} />
      </CustomAvatar>
      <span
        className='absolute -block-start-[6px] -inline-end-[6px] flex items-center justify-center is-[20px] bs-[20px] rounded-full text-[11px] font-bold text-white shadow'
        style={{ backgroundColor: `var(--mui-palette-${step.color}-main)` }}
      >
        {step.no}
      </span>
    </div>
    <Typography className='font-semibold' color='text.primary'>
      {step.title}
    </Typography>
    <Typography variant='body2' color='text.secondary' className='max-is-[230px]'>
      {step.desc}
    </Typography>
  </div>
)

const Arrow = () => (
  <div className='flex items-center justify-center shrink-0 self-center'>
    <i className='tabler-chevron-right text-3xl text-textDisabled' />
  </div>
)

const HowItWorks = () => {
  // Refs
  const skipIntersection = useRef(true)
  const ref = useRef<null | HTMLDivElement>(null)

  // Hooks
  const { updateIntersections } = useIntersection()

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (skipIntersection.current) {
          skipIntersection.current = false

          return
        }

        updateIntersections({ [entry.target.id]: entry.isIntersecting })
      },
      { threshold: 0.2 }
    )

    ref.current && observer.observe(ref.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <section id='how-it-works' ref={ref} className='plb-8 md:plb-[100px] bg-backgroundDefault'>
      <div className={frontCommonStyles.layoutSpacing}>
        <div className='flex flex-col gap-y-4 items-center justify-center'>
          <Chip size='small' variant='tonal' color='primary' label='ขั้นตอนการใช้งาน' />
          <div className='flex flex-col items-center gap-y-1 justify-center flex-wrap text-center'>
            <Typography color='text.primary' variant='h4' className='font-extrabold'>
              จากคำสั่งซื้อใบแรก สู่{' '}
              <span className='relative z-[1]'>
                <span className='relative z-[1] text-primary'>ร้านที่ลูกค้าไว้ใจ</span>
                <img
                  src='/images/front-pages/landing-page/bg-shape.png'
                  alt='bg-shape'
                  className='absolute block-end-0 z-[1] bs-[40%] is-[105%] -inline-start-[2%] block-start-[20px]'
                />
              </span>
            </Typography>
            <Typography className='mbs-1'>เพียง 6 ขั้นตอน เปลี่ยนทุกดีลให้กลายเป็นความน่าเชื่อถือ</Typography>
          </div>
        </div>

        {/* Desktop: 2 แถว ๆ ละ 3 ขั้น เชื่อมด้วยลูกศร */}
        <div className='hidden lg:flex flex-col gap-y-10 mbs-16'>
          <div className='flex items-stretch gap-x-4'>
            <StepCard step={steps[0]} className='flex-1' />
            <Arrow />
            <StepCard step={steps[1]} className='flex-1' />
            <Arrow />
            <StepCard step={steps[2]} className='flex-1' />
          </div>
          <div className='flex items-stretch gap-x-4'>
            <StepCard step={steps[3]} className='flex-1' />
            <Arrow />
            <StepCard step={steps[4]} className='flex-1' />
            <Arrow />
            <StepCard step={steps[5]} className='flex-1' />
          </div>
        </div>

        {/* Mobile / tablet: เรียงตามลำดับเลข */}
        <div className='lg:hidden grid grid-cols-1 sm:grid-cols-2 gap-6 mbs-10'>
          {steps.map(step => (
            <StepCard key={step.no} step={step} />
          ))}
        </div>
      </div>
    </section>
  )
}

export default HowItWorks
