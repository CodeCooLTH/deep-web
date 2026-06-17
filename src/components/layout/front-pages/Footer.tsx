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
import CustomTextField from '@core/components/mui/TextField'

// Hooks Imports
import { useImageVariant } from '@core/hooks/useImageVariant'

// Util Imports
import { frontLayoutClasses } from '@layouts/utils/layoutClasses'

// Styles Imports
import styles from './styles.module.css'
import frontCommonStyles from '@views/front-pages/styles.module.css'

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
            <Grid size={{ xs: 12, lg: 5 }}>
              <div className='flex flex-col items-start gap-6'>
                <Link href='/'>
                  <Logo color='var(--mui-palette-common-white)' />
                </Link>
                <Typography color='white' className='md:max-is-[390px] opacity-[0.78]'>
                  Deep คือระบบสร้างความน่าเชื่อถือสำหรับการซื้อขายออนไลน์ ด้วย Trust Score, Badge และการยืนยันตัวตนหลายระดับ
                </Typography>
                <div className='flex items-end is-full md:max-is-[390px]'>
                  <CustomTextField
                    size='small'
                    className={classnames('flex-1 min-w-0', styles.inputBorder)}
                    label='ติดตามข่าวสาร'
                    placeholder='อีเมลของคุณ'
                    sx={{
                      '& .MuiInputBase-root': {
                        borderStartEndRadius: '0 !important',
                        borderEndEndRadius: '0 !important',
                        '&:not(.Mui-focused)': {
                          borderColor: 'rgb(var(--mui-mainColorChannels-dark) / 0.22)'
                        },
                        '&.MuiFilledInput-root:not(.Mui-focused):not(.Mui-disabled):hover': {
                          borderColor: 'rgba(255 255 255 / 0.6) !important'
                        }
                      }
                    }}
                  />
                  <Button
                    variant='contained'
                    color='primary'
                    sx={{
                      borderStartStartRadius: 0,
                      borderEndStartRadius: 0
                    }}
                  >
                    สมัคร
                  </Button>
                </div>
              </div>
            </Grid>
            <Grid size={{ xs: 12, sm: 3, lg: 2 }}>
              <Typography color='white' className='font-medium mbe-6 opacity-[0.92]'>
                แพลตฟอร์ม
              </Typography>
              <div className='flex flex-col gap-4'>
                <Typography component={Link} href='#pricing-plans' color='white' className='opacity-[0.78]'>
                  ราคา
                </Typography>
                <Link href='#features' className='flex items-center gap-[10px]'>
                  <Typography color='white' className='opacity-[0.78]'>
                    ฟีเจอร์
                  </Typography>
                  <Chip label='ใหม่' color='primary' size='small' />
                </Link>
                <Typography component={Link} href='#faq' color='white' className='opacity-[0.78]'>
                  คำถามที่พบบ่อย
                </Typography>
                <Typography component={Link} href='#contact-us' color='white' className='opacity-[0.78]'>
                  ติดต่อเรา
                </Typography>
                <Typography component={Link} href='/privacy' color='white' className='opacity-[0.78]'>
                  นโยบายความเป็นส่วนตัว
                </Typography>
                <Typography component={Link} href='/terms' color='white' className='opacity-[0.78]'>
                  ข้อกำหนดการใช้บริการ
                </Typography>
              </div>
            </Grid>
            <Grid size={{ xs: 12, sm: 3, lg: 2 }}>
              <Typography color='white' className='font-medium mbe-6 opacity-[0.92]'>
                บริการ
              </Typography>
              <div className='flex flex-col gap-4'>
                <Typography component={Link} href='#features' color='white' className='opacity-[0.78]'>
                  Trust Score
                </Typography>
                <Typography component={Link} href='#features' color='white' className='opacity-[0.78]'>
                  ยืนยันตัวตน
                </Typography>
                <Typography component={Link} href='#features' color='white' className='opacity-[0.78]'>
                  Badge
                </Typography>
                <Typography component={Link} href='#features' color='white' className='opacity-[0.78]'>
                  Order History
                </Typography>
              </div>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
              <Typography color='white' className='font-medium mbe-6 opacity-[0.92]'>
                ดาวน์โหลดแอป
              </Typography>
              <div className='flex flex-col gap-4'>
                <Link className='bg-[#282C3E] bs-[56px] w-full max-w-[211px] rounded'>
                  <div className='flex items-center pli-5 plb-[7px] gap-6'>
                    <img src='/images/front-pages/apple-icon.png' alt='apple store' className='bs-[34px]' />
                    <div className='flex flex-col items-start'>
                      <Typography variant='body2' color='white' className='opacity-75'>
                        ดาวน์โหลดบน
                      </Typography>
                      <Typography color='white' className='font-medium opacity-[0.92]'>
                        App Store
                      </Typography>
                    </div>
                  </div>
                </Link>
                <Link className='bg-[#282C3E] bs-[56px] w-full max-w-[211px] rounded'>
                  <div className='flex items-center pli-5 plb-[7px] gap-6'>
                    <img src='/images/front-pages/google-play-icon.png' alt='Google play' className='bs-[34px]' />
                    <div className='flex flex-col items-start'>
                      <Typography variant='body2' color='white' className='opacity-75'>
                        ดาวน์โหลดบน
                      </Typography>
                      <Typography color='white' className='font-medium opacity-[0.92]'>
                        Google Play
                      </Typography>
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
          <div className='flex flex-wrap items-center gap-3'>
            <Typography className='text-white' variant='body2'>
              <span>{`© ${new Date().getFullYear()} Deep — ซื้อขายออนไลน์อย่างมั่นใจ`}</span>
            </Typography>
            {/* ลิงก์กฎหมาย standard legal footer position ที่ Meta/Facebook ต้องการ */}
            <Typography component={Link} href='/privacy' variant='body2' color='white' className='opacity-[0.78]'>
              นโยบายความเป็นส่วนตัว
            </Typography>
            <Typography component={Link} href='/terms' variant='body2' color='white' className='opacity-[0.78]'>
              ข้อกำหนดการใช้บริการ
            </Typography>
          </div>
          <div className='flex gap-1.5 items-center'>
            <IconButton component={Link} size='small' href='#' target='_blank'>
              <i className='tabler-brand-facebook-filled text-white text-lg' />
            </IconButton>
            <IconButton component={Link} size='small' href='#' target='_blank'>
              <i className='tabler-brand-line text-white text-lg' />
            </IconButton>
            <IconButton component={Link} size='small' href='#' target='_blank'>
              <i className='tabler-brand-twitter-filled text-white text-lg' />
            </IconButton>
            <IconButton component={Link} size='small' href='#' target='_blank'>
              <i className='tabler-brand-youtube-filled text-white text-lg' />
            </IconButton>
          </div>
        </div>
      </div>
    </footer>
  )
}

export default Footer
