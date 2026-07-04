'use client'

// Search island เล็ก ๆ — อัปเดต ?q= ใน URL แล้ว list ยัง server-render เหมือนเดิม
// (ไม่ดึง list มา client, ไม่มี TanStack) — วางใน PageHeader action ของ orders/reviews
import { useState } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'

import InputAdornment from '@mui/material/InputAdornment'
import IconButton from '@mui/material/IconButton'

import CustomTextField from '@core/components/mui/TextField'

type Props = {
  placeholder?: string
  paramName?: string
}

export default function SearchBox({ placeholder = 'ค้นหา', paramName = 'q' }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [value, setValue] = useState(searchParams.get(paramName) ?? '')

  // merge q เข้ากับ params เดิม (status/rating) — submit บน Enter หรือกดล้าง; รีเซ็ต page state ไม่มี
  const submit = (next: string) => {
    const params = new URLSearchParams(Array.from(searchParams.entries()))
    const trimmed = next.trim()
    if (trimmed) params.set(paramName, trimmed)
    else params.delete(paramName)
    const qs = params.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit(value)
      }}
      className='is-full min-[600px]:is-auto'
    >
      <CustomTextField
        size='small'
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className='is-full min-[600px]:min-is-[280px]'
        sx={{
          '& .MuiInputBase-root': {
            borderRadius: '9999px',
            backgroundColor: 'var(--mui-palette-background-paper) !important',
            transition: 'border-color 150ms'
          },
          '& .MuiInputBase-input': {
            paddingBlock: '8px'
          }
        }}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position='start'>
                <i className='tabler-search text-[1.25rem] text-[var(--mui-palette-text-disabled)]' />
              </InputAdornment>
            ),
            endAdornment: value ? (
              <InputAdornment position='end'>
                <IconButton
                  size='small'
                  edge='end'
                  aria-label='ล้างการค้นหา'
                  onClick={() => {
                    setValue('')
                    submit('')
                  }}
                >
                  <i className='tabler-x text-[1.125rem] text-[var(--mui-palette-text-secondary)]' />
                </IconButton>
              </InputAdornment>
            ) : null
          }
        }}
      />
    </form>
  )
}
