'use client'

// React Imports
import { useState } from 'react'

// Next Imports
import { useRouter } from 'next/navigation'

// MUI Imports
import Typography from '@mui/material/Typography'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import MenuItem from '@mui/material/MenuItem'
import Button from '@mui/material/Button'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'

// Constants
import { IDENTIFIER_TYPES, IDENTIFIER_LABELS, IDENTIFIER_PLACEHOLDERS } from '@/lib/scam-constants'
import type { IdentifierType } from '@/lib/scam-constants'

// บังคับ padding บน-ล่างเท่ากัน (filled input medium เผื่อที่ floating label) → ข้อความอยู่กลาง
const fieldSx = { '& .MuiInputBase-input': { paddingBlock: '10.8px !important' } }

const ScamSearchBar = ({
  defaultType = 'PHONE',
  defaultQ = ''
}: {
  defaultType?: IdentifierType
  defaultQ?: string
}) => {
  // Hooks
  const router = useRouter()

  // States
  const [type, setType] = useState<IdentifierType>(defaultType)
  const [q, setQ] = useState(defaultQ)

  const handleSearch = () => {
    const query = q.trim()

    if (query.length < 2) return
    router.push(`/check?type=${type}&q=${encodeURIComponent(query)}`)
  }

  return (
    <Card className='mli-auto max-is-[720px] shadow-md'>
      <CardContent className='p-6 md:p-8'>
        <div className='flex flex-col sm:flex-row gap-4 items-stretch sm:items-end'>
          <CustomTextField
            select
            fullWidth
            label='ค้นด้วย'
            value={type}
            onChange={e => setType(e.target.value as IdentifierType)}
            className='sm:max-is-[200px]'
            sx={fieldSx}
          >
            {IDENTIFIER_TYPES.map(t => (
              <MenuItem key={t} value={t}>
                {IDENTIFIER_LABELS[t]}
              </MenuItem>
            ))}
          </CustomTextField>
          <CustomTextField
            fullWidth
            label='ข้อมูลที่ต้องการตรวจ'
            placeholder={IDENTIFIER_PLACEHOLDERS[type]}
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            sx={fieldSx}
          />
          <Button variant='contained' size='large' onClick={handleSearch} className='shrink-0'>
            ตรวจสอบ
          </Button>
        </div>
        <Typography variant='body2' color='text.disabled' className='mbs-4 text-center sm:text-start'>
          เจอมิจฉาชีพ? ช่วยกัน{' '}
          <Typography component='a' href='/report' color='primary.main' className='font-medium'>
            แจ้งรายงาน
          </Typography>{' '}
          (ต้องเข้าสู่ระบบ + แนบหลักฐาน)
        </Typography>
      </CardContent>
    </Card>
  )
}

export default ScamSearchBar
