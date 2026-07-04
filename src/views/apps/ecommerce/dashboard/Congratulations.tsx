// MUI Imports
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import LinearProgress from '@mui/material/LinearProgress'

// Component Imports
import { LinkButton } from '@/app/(marketing)/_components/mui-link'

// Type Imports
import type { TrustLevel } from '@/services/trust-score.service'

/**
 * Base: theme/vuexy/typescript-version/full-version/src/views/apps/ecommerce/dashboard/Congratulations.tsx
 * Adapted (design.json "The Trusted Counter"): trust score = focal point, real signal.
 * tint นุ่มมุมขวาบน + progress bar + character. CTA → /settings/verification.
 */

type Props = {
  displayName: string
  trustScore: number
  trustLevel: TrustLevel
  nextLevelLabel: string
}

const Congratulations = ({ displayName, trustScore, trustLevel, nextLevelLabel }: Props) => {
  const progress = Math.min(100, Math.max(0, trustScore))
  const remaining = Math.max(0, 100 - trustScore)

  return (
    <Card className='bs-full relative overflow-hidden'>
      {/* tint ม่วงนุ่มมุมขวาบน — ความลึกแบบ restrained (One Voice) */}
      <div
        className='absolute inset-0 pointer-events-none'
        style={{
          background:
            'radial-gradient(120% 110% at 100% 0%, var(--mui-palette-primary-lightOpacity) 0%, transparent 42%)'
        }}
      />
      <CardContent className='relative flex flex-col bs-full'>
        <img
          alt='Trust score illustration'
          src='/images/illustrations/characters/8.png'
          className='hidden sm:block absolute block-end-0 inline-end-3 max-bs-[132px] pointer-events-none select-none'
        />

        <div className='relative z-[1] flex flex-col bs-full sm:max-is-[66%]'>
          <div className='mbe-3'>
            <Chip size='small' variant='tonal' color='primary' label={`Trust ระดับ ${trustLevel}`} />
          </div>
          <Typography variant='h5' className='mbe-5'>
            สวัสดี {displayName}
          </Typography>

          <div className='flex items-baseline gap-1.5'>
            <Typography variant='h2' color='primary.main' className='font-extrabold leading-none'>
              {trustScore}
            </Typography>
            <Typography variant='h6' color='text.disabled' className='font-medium'>
              / 100
            </Typography>
          </div>
          <LinearProgress
            variant='determinate'
            value={progress}
            className='mbs-3 mbe-2'
            sx={{
              blockSize: 8,
              borderRadius: 8,
              backgroundColor: 'var(--mui-palette-primary-lightOpacity)',
              '& .MuiLinearProgress-bar': { borderRadius: 8 }
            }}
          />
          <Typography variant='body2' color='text.secondary' className='mbe-6'>
            {remaining > 0 ? (
              <>
                อีก <span className='font-semibold text-textPrimary'>{remaining}</span> คะแนน สู่ระดับ {nextLevelLabel}
              </>
            ) : (
              'คุณอยู่ในระดับสูงสุดแล้ว'
            )}
          </Typography>

          <LinkButton
            href='/settings/verification'
            variant='contained'
            color='primary'
            className='mbs-auto self-start'
          >
            ยกระดับความน่าเชื่อถือ
          </LinkButton>
        </div>
      </CardContent>
    </Card>
  )
}

export default Congratulations
