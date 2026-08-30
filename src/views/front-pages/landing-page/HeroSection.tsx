// MUI Imports
import Typography from '@mui/material/Typography'
import Card from '@mui/material/Card'
import Chip from '@mui/material/Chip'
import { useColorScheme } from '@mui/material/styles'

// Third-party Imports
import classnames from 'classnames'

// Type Imports
import type { SystemMode } from '@core/types'
import type { ThemeColor } from '@core/types'

// Component Imports
import { LinkButton } from '@/app/(marketing)/_components/mui-link'
import CustomAvatar from '@core/components/mui/Avatar'

// Hook Imports
import { useImageVariant } from '@core/hooks/useImageVariant'

// Styles Imports
import styles from './styles.module.css'
import frontCommonStyles from '@views/front-pages/styles.module.css'

// การ์ด "สัญญาณความน่าเชื่อถือ" ลอยประดับสองข้าง hero (โชว์เฉพาะจอ lg+)
type TrustCard = {
  icon: string
  label: string
  value: string
  color: ThemeColor
  position: string
  rotate: number
  delay: string
}

const trustCards: TrustCard[] = [
  {
    icon: 'tabler-rosette-discount-check',
    label: 'ยืนยันตัวตนแล้ว',
    value: 'ระดับ L3 ธุรกิจ',
    color: 'primary',
    position: 'inline-start-[2%] block-start-[24%]',
    rotate: -6,
    delay: '0s'
  },
  {
    icon: 'tabler-shield-check',
    label: 'Trust Score',
    value: '95 / 100',
    color: 'success',
    position: 'inline-start-[6%] block-start-[62%]',
    rotate: 5,
    delay: '0.9s'
  },
  {
    icon: 'tabler-award',
    label: 'Badge ทางการ',
    value: 'ร้านน่าเชื่อถือ',
    color: 'warning',
    position: 'inline-end-[2%] block-start-[22%]',
    rotate: 6,
    delay: '0.45s'
  },
  {
    icon: 'tabler-checks',
    label: 'ออร์เดอร์สำเร็จ',
    value: '1,200+ รายการ',
    color: 'info',
    position: 'inline-end-[6%] block-start-[60%]',
    rotate: -5,
    delay: '1.3s'
  }
]

const HeroSection = ({ mode }: { mode: SystemMode }) => {
  // Vars
  const heroSectionBgLight = '/images/front-pages/landing-page/hero-bg-light.png'
  const heroSectionBgDark = '/images/front-pages/landing-page/hero-bg-dark.png'

  // Hooks
  const { mode: muiMode } = useColorScheme()
  const heroSectionBg = useImageVariant(mode, heroSectionBgLight, heroSectionBgDark)

  const _mode = (muiMode === 'system' ? mode : muiMode) || mode

  return (
    <section id='home' className='overflow-hidden pbs-[75px] -mbs-[75px] relative'>
      <img
        src={heroSectionBg}
        alt='hero-bg'
/* มือถือ 100% — 118% ทำให้ไล่สีล้นลงไปใต้เนื้อหาเป็นแถบเปล่า เพราะ hero บนมือถือ
           เตี้ยกว่าเดสก์ท็อปมาก (ไม่มีการ์ดลอย) ⇒ ส่วนเกินไม่ได้ห่ออะไรเลย */
        className={classnames('bs-full md:bs-[118%]', styles.heroSectionBg, {
          [styles.bgLight]: _mode === 'light',
          [styles.bgDark]: _mode === 'dark'
        })}
      />

      {/* การ์ดลอยประดับสองข้าง — desktop only */}
      {trustCards.map((card, index) => (
        <div key={index} className={classnames('absolute z-[1] hidden lg:block', card.position)}>
          <div className={styles.heroFloatCard} style={{ animationDelay: card.delay }}>
            <Card elevation={8} className='' style={{ transform: `rotate(${card.rotate}deg)` }}>
              <div className='flex items-center gap-3 plb-3 pli-4'>
                <CustomAvatar variant='rounded' skin='light' color={card.color} size={42}>
                  <i className={classnames(card.icon, 'text-[22px]')} />
                </CustomAvatar>
                <div>
                  <Typography variant='body2' color='text.disabled' className='leading-none mbe-1'>
                    {card.label}
                  </Typography>
                  <Typography className='font-medium leading-none' color='text.primary'>
                    {card.value}
                  </Typography>
                </div>
              </div>
            </Card>
          </div>
        </div>
      ))}

      <div
/* มือถือ 40/40 ไม่ใช่ 72/60 — การ์ดลอยประกอบเป็น `hidden lg:block` ⇒ บนมือถือ hero
             มีแค่ตัวหนังสือ แต่ยังแบกระยะของผังเดสก์ท็อป (132px รวมบน-ล่าง บนจอ 390px)
             ผลคือปุ่มจบแล้วยังมีพื้นว่างอีกเกือบครึ่งจอก่อนถึงบล็อกถัดไป (หัวหน้าส่งภาพมา 2026-08-31) */
        className={classnames('pbs-10 pbe-10 md:pbs-[100px] md:pbe-[120px] relative', frontCommonStyles.layoutSpacing)}
      >
        <div className='md:max-is-[600px] mbs-0 mli-auto text-center flex flex-col items-center relative z-[1]'>
          <Chip
            variant='tonal'
            color='primary'
            size='small'
            label='แพลตฟอร์มสร้างความน่าเชื่อถือ'
            className='mbe-5 font-medium'
          />
          {/* หัวเรื่องเป็นหมึกหลัก ไม่ใช่ตัวอักษรไล่สี (เอาออก 2026-07-31 จาก Impeccable audit)
              DESIGN.md เขียน "gradient text" ไว้ใน anti-references ตรง ๆ ว่าเป็นเทมเพลต AI-SaaS
              ที่ระบบนี้ปฏิเสธ และไล่สีเดิมยังเอา verified-green (สีของ "เชื่อได้") กับ error-coral
              (สีของ "ผิดพลาด") มาใช้เป็นของตกแต่ง ซึ่งขัด Verified-Means-Green Rule ที่เขียนไว้เอง —
              สีที่มีความหมายเชิงความเชื่อใจจะเฟ้อถ้าเอามาแต่งหัวเรื่อง

              ไม่ใส่ม่วงเน้นวรรคใดวรรคหนึ่งด้วย เพราะรอบ ๆ หัวเรื่องมีม่วงอยู่แล้วสองจุด (chip ด้านบน
              + ปุ่ม CTA ด้านล่าง) และ One Voice Rule ระบุว่าม่วงคือ accent ของ action ไม่ใช่ของตกแต่ง
              ลำดับชั้นมาจากขนาดกับน้ำหนักพอแล้ว ตรงกับ north star "The Trusted Counter" ที่สะอาด
              และไม่ตะโกน */}
          <Typography
            className='font-extrabold text-[1.75rem] sm:text-[2.875rem] mbe-4 leading-tight sm:leading-[56px]'
            color='text.primary'
          >
            ตัวตนชัดเจน ลูกค้ามั่นใจ ยอดขายเติบโต
          </Typography>
          <Typography className='font-medium max-is-[480px]' color='text.primary'>
            Deep คือระบบสร้างความน่าเชื่อถือผ่านการยืนยันตัวตน Trust Score และ Badge เพื่อให้ทุกดีลเชื่อถือได้
          </Typography>
          <div className='flex mbs-8 items-center justify-center is-full sm:is-auto'>
            <LinkButton size='large' href='/auth/sign-up' variant='contained' color='primary' className='w-full sm:w-auto'>
              ใช้งานเลย
            </LinkButton>
          </div>
        </div>
      </div>
    </section>
  )
}

export default HeroSection
