'use client'

// MUI Imports
import Grid from '@mui/material/Grid'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'

// Third-party Imports
import classnames from 'classnames'

// Type Imports
import type { Mode } from '@core/types'

// Component Imports
import Link from '@components/Link'
import Logo from '@components/layout/shared/Logo'

// Hooks Imports
import { useImageVariant } from '@core/hooks/useImageVariant'

// Util Imports
import { frontLayoutClasses } from '@layouts/utils/layoutClasses'

// Styles Imports
import frontCommonStyles from '@views/front-pages/styles.module.css'

// คลาสลิงก์ footer — ขาวจางแล้วสว่างเต็มเมื่อ hover (text-white ชัวร์กว่า color='white' ที่ palette ไม่มี)
/**
 * 🛑 `min-bs-11` (44px) + `flex items-center` — ลิงก์ท้ายหน้าเดิมสูงแค่ 20–22px
 * ซึ่งต่ำกว่า tap target 44px ที่ DESIGN.md §Do's บังคับ (วัดได้ 12 ลิงก์บน `/dashboard`
 * มือถือ 2026-08-31) · ตัวหนังสือขนาดเดิม แค่พื้นที่แตะโปร่งรอบ ๆ โตขึ้น
 * ⇒ หน้าตาไม่เปลี่ยน แต่กดติดจริง (ท่าเดียวกับที่ใช้บนหน้า `/o/[token]`)
 */
const footerLink =
  'text-white/70 hover:text-white transition-colors duration-200 inline-flex items-center min-bs-11'

const platformLinks = [
  { label: 'ราคา', href: '#pricing-plans', isNew: false },
  { label: 'ฟีเจอร์', href: '#features', isNew: true },
  { label: 'วิธีใช้งาน', href: '#how-it-works', isNew: false },
  { label: 'คำถามที่พบบ่อย', href: '#faq', isNew: false },
  { label: 'นโยบายความเป็นส่วนตัว', href: '/privacy', isNew: false },
  { label: 'ข้อกำหนดการใช้บริการ', href: '/terms', isNew: false }
]

const serviceLinks = [
  { label: 'Trust Score', href: '#features' },
  { label: 'ยืนยันตัวตน', href: '#features' },
  { label: 'Badge', href: '#features' },
  { label: 'Order History', href: '#features' }
]

const Footer = ({ mode }: { mode: Mode }) => {
  // Vars
  const footerImageLight = '/images/front-pages/footer-bg-light.png'
  const footerImageDark = '/images/front-pages/footer-bg-dark.png'

  // Hooks
  const dashboardImage = useImageVariant(mode, footerImageLight, footerImageDark)

  return (
    <footer className={frontLayoutClasses.footer}>
      <div className='relative'>
        <img src={dashboardImage} alt='footer bg' className='absolute inset-0 is-full bs-full object-cover -z-[1]' />
        <div className={classnames('plb-12 text-white', frontCommonStyles.layoutSpacing)}>
          <Grid container rowSpacing={10} columnSpacing={12}>
            <Grid size={{ xs: 12, md: 5 }}>
              <div className='flex flex-col items-start gap-6'>
                {/* พื้นที่แตะ 44px — โลโก้เดิมสูงตามรูป 24px ซึ่งต่ำกว่าเกณฑ์
                    ตัวโลโก้ขนาดเท่าเดิม แค่กล่องที่กดได้โตขึ้น */}
                <Link href='/' className='inline-flex items-center min-bs-11'>
                  <Logo color='var(--mui-palette-common-white)' />
                </Link>
                <Typography className='sm:max-is-[390px] text-white/70'>
                  Deep คือระบบสร้างความน่าเชื่อถือสำหรับการซื้อขายออนไลน์ ด้วย Trust Score, Badge และการยืนยันตัวตนหลายระดับ
                </Typography>
                <div className='flex flex-col gap-2 is-full sm:max-is-[390px]'>
                  <Typography className='text-white font-medium'>ติดตามข่าวสาร</Typography>
                  <div className='flex items-center gap-2 pis-4 pie-1 plb-1 rounded-lg bg-white/[0.06] border border-white/30 hover:border-white/50 focus-within:border-[var(--mui-palette-primary-main)] transition-colors duration-200'>
                    <input
                      type='email'
                      placeholder='อีเมลของคุณ'
                      /* `min-bs-11` — ตัว `<input>` เองสูง 15px แม้กรอบรอบนอกจะสูงกว่า
                         ⇒ พื้นที่ที่แตะแล้วโฟกัสจริงเล็กกว่าที่ตาเห็น */
                      className='flex-1 min-w-0 min-bs-11 bg-transparent border-0 outline-none text-white placeholder:text-white/50'
                    />
                    {/* เลิก `size='small'` — ธีมให้ small = รัศมี 4px + สูง 30px
                        ⇒ ทั้งทรงและ tap target ไม่ตรงกับปุ่มอื่นบนหน้าเดียวกัน */}
                    <Button variant='contained' color='primary' className='shrink-0' sx={{ minHeight: 44 }}>
                      สมัคร
                    </Button>
                  </div>
                </div>
              </div>
            </Grid>
            <Grid size={{ xs: 12, sm: 4, md: 2 }}>
              <Typography className='font-medium mbe-6 text-white'>แพลตฟอร์ม</Typography>
              <div className='flex flex-col gap-4'>
                {platformLinks.map((item, index) =>
                  item.isNew ? (
                    <Link key={index} href={item.href} className='flex items-center gap-[10px] w-fit'>
                      <Typography className={footerLink}>{item.label}</Typography>
                      <Chip label='ใหม่' color='primary' size='small' />
                    </Link>
                  ) : (
                    <Typography key={index} component={Link} href={item.href} className={classnames('w-fit', footerLink)}>
                      {item.label}
                    </Typography>
                  )
                )}
              </div>
            </Grid>
            <Grid size={{ xs: 12, sm: 4, md: 2 }}>
              <Typography className='font-medium mbe-6 text-white'>บริการ</Typography>
              <div className='flex flex-col gap-4'>
                {serviceLinks.map((item, index) => (
                  <Typography key={index} component={Link} href={item.href} className={classnames('w-fit', footerLink)}>
                    {item.label}
                  </Typography>
                ))}
              </div>
            </Grid>
            <Grid size={{ xs: 12, sm: 4, md: 3 }}>
              <Typography className='font-medium mbe-6 text-white'>ดาวน์โหลดแอป</Typography>
              <div className='flex flex-col gap-4'>
                <Link className='bg-[#282C3E] hover:bg-[#33384e] transition-colors duration-200 bs-[56px] w-full max-w-[211px] rounded-lg'>
                  <div className='flex items-center pli-5 plb-[7px] gap-6'>
                    <img src='/images/front-pages/apple-icon.png' alt='apple store' className='bs-[34px]' />
                    <div className='flex flex-col items-start'>
                      <Typography variant='body2' className='text-white/70'>
                        ดาวน์โหลดบน
                      </Typography>
                      <Typography className='font-medium text-white'>App Store</Typography>
                    </div>
                  </div>
                </Link>
                <Link className='bg-[#282C3E] hover:bg-[#33384e] transition-colors duration-200 bs-[56px] w-full max-w-[211px] rounded-lg'>
                  <div className='flex items-center pli-5 plb-[7px] gap-6'>
                    <img src='/images/front-pages/google-play-icon.png' alt='Google play' className='bs-[34px]' />
                    <div className='flex flex-col items-start'>
                      <Typography variant='body2' className='text-white/70'>
                        ดาวน์โหลดบน
                      </Typography>
                      <Typography className='font-medium text-white'>Google Play</Typography>
                    </div>
                  </div>
                </Link>
              </div>
            </Grid>
          </Grid>
        </div>
      </div>
      <div className='bg-[#211B2C]'>
        <div
          className={classnames(
            'flex flex-wrap items-center justify-center sm:justify-between gap-4 plb-[15px]',
            frontCommonStyles.layoutSpacing
          )}
        >
          <div className='flex flex-wrap items-center gap-x-4 gap-y-2'>
            <Typography variant='body2' className='text-white/90'>
              {`© ${new Date().getFullYear()} Deep — ซื้อขายออนไลน์อย่างมั่นใจ`}
            </Typography>
            {/* ลิงก์กฎหมาย standard legal footer position ที่ Meta/Facebook ต้องการ */}
            <Typography component={Link} href='/privacy' variant='body2' className={footerLink}>
              นโยบายความเป็นส่วนตัว
            </Typography>
            <Typography component={Link} href='/terms' variant='body2' className={footerLink}>
              ข้อกำหนดการใช้บริการ
            </Typography>
          </div>
          <div className='flex gap-1.5 items-center'>
            <IconButton component={Link} href='#' target='_blank' sx={{ inlineSize: 44, blockSize: 44 }}>
              <i className='tabler-brand-facebook-filled text-white/80 hover:text-white transition-colors text-lg' />
            </IconButton>
            <IconButton component={Link} href='#' target='_blank' sx={{ inlineSize: 44, blockSize: 44 }}>
              <i className='tabler-brand-line text-white/80 hover:text-white transition-colors text-lg' />
            </IconButton>
            <IconButton component={Link} href='#' target='_blank' sx={{ inlineSize: 44, blockSize: 44 }}>
              <i className='tabler-brand-twitter-filled text-white/80 hover:text-white transition-colors text-lg' />
            </IconButton>
            <IconButton component={Link} href='#' target='_blank' sx={{ inlineSize: 44, blockSize: 44 }}>
              <i className='tabler-brand-youtube-filled text-white/80 hover:text-white transition-colors text-lg' />
            </IconButton>
          </div>
        </div>
      </div>
    </footer>
  )
}

export default Footer
