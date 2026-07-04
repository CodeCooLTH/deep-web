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
 * Adapted: greet buyer with trust score + progress toward next level (real signal, north star
 *          "The Trusted Counter"). Illustration kept (character/8.png). CTA → /settings/verification.
 */

type Props = {
  displayName: string
  trustScore: number
  trustLevel: TrustLevel
  nextLevelLabel: string
}

const Congratulations = ({ displayName, trustScore, trustLevel, nextLevelLabel }: Props) => {
  const progress = Math.min(100, Math.max(0, trustScore))

  return (
    <Card className='bs-full'>
      <CardContent className='relative flex flex-col bs-full'>
        {/* ตัวการ์ตูนมุมขวาล่าง — ซ่อน < sm; content จำกัดความกว้างไม่ให้ทับกัน */}
        <img
          alt='Trust score illustration'
          src='/images/illustrations/characters/8.png'
          className='hidden sm:block absolute block-end-0 inline-end-4 max-bs-[125px] pointer-events-none select-none'
        />

        <div className='relative z-[1] flex flex-col bs-full sm:max-is-[68%]'>
          <Typography variant='h5' className='mbe-1'>
            สวัสดี {displayName}
          </Typography>
          <div className='mbe-4'>
            <Chip size='small' variant='tonal' color='primary' label={`Trust ระดับ ${trustLevel}`} />
          </div>

          <div className='flex items-baseline gap-1'>
            <Typography variant='h3' color='primary.main' className='font-extrabold'>
              {trustScore}
            </Typography>
            <Typography variant='body2' color='text.disabled'>
              / 100
            </Typography>
          </div>
          <LinearProgress
            variant='determinate'
            value={progress}
            className='mbs-2 mbe-2'
            sx={{ blockSize: 6, borderRadius: 3 }}
          />
          <Typography variant='body2' color='text.secondary' className='mbe-5'>
            อีก {Math.max(0, 100 - trustScore)} คะแนน สู่ระดับ {nextLevelLabel}
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
