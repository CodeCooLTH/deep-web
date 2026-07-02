'use client'

/**
 * AuctionLiveState — countdown (live→endTime / scheduled→startTime) + snipe-bar (feature 00004)
 *
 * Base (logic เท่านั้น — restyle MUI, ไม่ copy JSX/Tailwind ดิบ):
 *   src/app/(paces)/seller/(dashboard)/_shared/AuctionCountdown.tsx
 *   (setInterval 1s + tabular-nums + text-danger <1hr + router.refresh() ตอนนับถึง 0)
 *
 * Visual ref (asset เท่านั้น): docs/mockups/auction/seller-auction-v1.html
 *   .snipe-bar (mobile L832 / desktop L1348) "ช่วงเวลาเข้มข้น · ต่อเวลาอัตโนมัติแล้ว N/5 ครั้ง"
 */
import { useEffect, useState } from 'react'

import { useRouter } from 'next/navigation'

import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

import { Icon } from '@iconify/react'

import { formatDateTime } from '@/lib/format-date'
import type { PublicAuctionDTO } from '@/services/auction.service'

type Props = {
  status: PublicAuctionDTO['status']
  endTimeMs: number
  startTimeMs: number | null
  antiSnipeCount: number
  /** true = hero มี HUD countdown แล้ว (mockup immersive) → ไม่ต้องโชว์การ์ด "เหลือเวลา" ซ้ำตอน live */
  heroHasCountdown?: boolean
}

function formatRemain(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

export default function AuctionLiveState({ status, endTimeMs, startTimeMs, antiSnipeCount, heroHasCountdown }: Props) {
  const router = useRouter()
  const [now, setNow] = useState<number>(() => Date.now())

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(tick)
  }, [])

  // เวลาเป้าหมาย: live → นับถอยหลังไป endTime, scheduled → นับถอยหลังไป startTime (ถ้ามี)
  const targetMs = status === 'scheduled' ? (startTimeMs ?? endTimeMs) : endTimeMs
  const remainMs = targetMs - now
  const isDone = remainMs <= 0
  const isUnderHour = status === 'live' && remainMs > 0 && remainMs < 60 * 60 * 1000

  // นับถึง 0 → refresh ให้ RSC re-eval status (settle/flip cron อาจมี lag เล็กน้อย — ตาม pattern AuctionCountdown เดิม)
  useEffect(() => {
    if (!isDone) return
    router.refresh()
    const poll = setInterval(() => router.refresh(), 5000)
    return () => clearInterval(poll)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ต้องการรันแค่ตอน isDone เปลี่ยนเป็น true
  }, [isDone])

  if (status === 'scheduled') {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
          px: '16px',
          py: '13px',
          bgcolor: '#EFF4FF',
          borderRadius: '12px',
          flexWrap: 'wrap',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Icon icon='tabler-clock-hour-4' style={{ color: '#2563EB', fontSize: 18 }} />
          <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#1E3A8A' }}>
            {startTimeMs ? `เริ่มประมูล ${formatDateTime(startTimeMs)}` : 'รอเปิดประมูล'}
          </Typography>
        </Box>
        {startTimeMs && (
          <Typography sx={{ fontSize: 13, fontWeight: 800, color: '#2563EB', fontVariantNumeric: 'tabular-nums' }}>
            {formatRemain(remainMs)}
          </Typography>
        )}
      </Box>
    )
  }

  // hero มี HUD countdown แล้ว + ยังไม่เคยต่อเวลา → ไม่มีอะไรต้องโชว์ (กัน gap เปล่า)
  if (heroHasCountdown && antiSnipeCount === 0) return null

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {/* การ์ด "เหลือเวลา" — ซ่อนตอน hero มี HUD countdown (mockup immersive ไม่ซ้ำ) */}
      {!heroHasCountdown && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: '16px',
            py: '11px',
            bgcolor: '#F8FAFC',
            borderRadius: '12px',
          }}
        >
          <Typography sx={{ fontSize: 11.5, color: '#94A3B8', fontWeight: 700 }}>เหลือเวลา</Typography>
          <Typography
            sx={{
              fontSize: 20,
              fontWeight: 800,
              fontVariantNumeric: 'tabular-nums',
              color: isUnderHour ? '#DC2626' : '#0F172A',
            }}
          >
            {formatRemain(remainMs)}
          </Typography>
        </Box>
      )}

      {/* snipe-bar — โชว์เฉพาะเมื่อเคยต่อเวลาแล้วอย่างน้อย 1 ครั้ง */}
      {antiSnipeCount > 0 && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: '7px',
            px: '14px',
            py: '9px',
            borderRadius: '10px',
            bgcolor: '#FEF3E2',
            color: '#B45309',
          }}
        >
          <Icon icon='tabler-flame' fontSize={16} />
          <Typography sx={{ fontSize: 12, fontWeight: 700 }}>
            ช่วงเวลาเข้มข้น · ต่อเวลาอัตโนมัติแล้ว {antiSnipeCount}/5 ครั้ง
          </Typography>
        </Box>
      )}
    </Box>
  )
}
