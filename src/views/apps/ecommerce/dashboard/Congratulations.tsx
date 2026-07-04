// MUI Imports
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import LinearProgress from '@mui/material/LinearProgress'
import Divider from '@mui/material/Divider'

// Component Imports
import { LinkButton } from '@/app/(marketing)/_components/mui-link'

// Type Imports
import type { TrustLevel } from '@/services/trust-score.service'

/**
 * Base: theme/vuexy/typescript-version/full-version/src/views/apps/ecommerce/dashboard/Congratulations.tsx
 * Adapted (design.json "The Trusted Counter"): welcome banner — ซ้าย = ทักทาย + trust score + progress,
 * ขวา = "สัญญาณความน่าเชื่อถือ" จริง (สถานะยืนยันตัวตน L1/L2/L3) แทนภาพตกแต่ง.
 */

type Props = {
  displayName: string
  trustScore: number
  trustLevel: TrustLevel
  nextLevelLabel: string
  verifiedPhone: boolean
  verifiedDoc: boolean
  verifiedBiz: boolean
}

const Congratulations = ({
  displayName,
  trustScore,
  trustLevel,
  nextLevelLabel,
  verifiedPhone,
  verifiedDoc,
  verifiedBiz
}: Props) => {
  const progress = Math.min(100, Math.max(0, trustScore))
  const remaining = Math.max(0, 100 - trustScore)

  const signals = [
    { done: verifiedPhone, label: 'ยืนยันเบอร์โทรศัพท์', level: 'L1' },
    { done: verifiedDoc, label: 'ยืนยันเอกสาร (บัตรประชาชน)', level: 'L2' },
    { done: verifiedBiz, label: 'จดทะเบียนธุรกิจ', level: 'L3' }
  ]

  return (
    <Card className='relative overflow-hidden'>
      {/* tint ม่วงนุ่มมุมขวาบน — restrained (One Voice) */}
      <div
        className='absolute inset-0 pointer-events-none'
        style={{
          background:
            'radial-gradient(70% 130% at 100% 0%, var(--mui-palette-primary-lightOpacity) 0%, transparent 48%)'
        }}
      />
      <CardContent className='relative flex flex-col md:flex-row md:items-stretch gap-6 md:gap-8'>
        {/* ฝั่งซ้าย — ทักทาย + trust score + progress */}
        <div className='flex flex-col items-start gap-3 flex-1 min-w-0 justify-center'>
          <Chip size='small' variant='tonal' color='primary' label={`Trust ระดับ ${trustLevel}`} />
          <div>
            <Typography variant='h4' className='font-extrabold'>
              สวัสดี {displayName}
            </Typography>
            <Typography variant='body2' color='text.secondary' className='mbs-1'>
              ยินดีต้อนรับกลับมา — สร้างความน่าเชื่อถือเพิ่มขึ้นทุกดีล
            </Typography>
          </div>

          <div className='is-full max-is-[440px]'>
            <div className='flex items-baseline justify-between gap-2'>
              <div className='flex items-baseline gap-1.5'>
                <Typography variant='h3' color='primary.main' className='font-extrabold leading-none'>
                  {trustScore}
                </Typography>
                <Typography variant='body2' color='text.disabled' className='font-medium'>
                  / 100 คะแนน
                </Typography>
              </div>
              <Typography variant='body2' color='text.disabled'>
                {remaining > 0 ? `เหลืออีก ${remaining} สู่ระดับ ${nextLevelLabel}` : 'ระดับสูงสุด'}
              </Typography>
            </div>
            <LinearProgress
              variant='determinate'
              value={progress}
              className='mbs-2'
              sx={{
                blockSize: 8,
                borderRadius: 8,
                backgroundColor: 'var(--mui-palette-primary-lightOpacity)',
                '& .MuiLinearProgress-bar': { borderRadius: 8 }
              }}
            />
          </div>

          <LinkButton href='/settings/verification' variant='contained' color='primary' className='mbs-1 self-center'>
            ยกระดับความน่าเชื่อถือ
          </LinkButton>
        </div>

        {/* ขีดคั่น (กลาง) */}
        <Divider flexItem orientation='vertical' className='hidden md:block' />

        {/* ฝั่งขวา — สัญญาณความน่าเชื่อถือ (สถานะยืนยันตัวตนจริง) */}
        <div className='flex-1 min-w-0 flex flex-col justify-center gap-3'>
          <Typography variant='subtitle2' color='text.primary' className='font-semibold'>
            สถานะการยืนยันตัวตน
          </Typography>
          <div className='flex flex-col gap-3'>
            {signals.map((s) => (
              <div key={s.level} className='flex items-center gap-3'>
                <i
                  className={s.done ? 'tabler-circle-check-filled' : 'tabler-circle-dashed'}
                  style={{
                    color: s.done ? 'var(--mui-palette-success-main)' : 'var(--mui-palette-text-disabled)',
                    fontSize: 24
                  }}
                />
                <Typography
                  variant='body2'
                  color={s.done ? 'text.primary' : 'text.secondary'}
                  className={s.done ? 'font-medium' : ''}
                >
                  {s.label}
                </Typography>
                {s.done ? (
                  <Chip size='small' variant='tonal' color='success' label='ยืนยันแล้ว' className='mis-auto' />
                ) : (
                  <Chip size='small' variant='tonal' color='default' label='ยังไม่ยืนยัน' className='mis-auto' />
                )}
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default Congratulations
