'use client'

/**
 * AuctionHero — carousel รูป + scrim + ชื่อ + status/viewer badge + HUD ราคา/countdown (feat 00004 + 00006 + 00007)
 *
 * Base: theme/vuexy/.../user-profile/UserProfileHeader.tsx (banner) + keen-slider pattern
 *   (theme/vuexy/.../widget-examples/advanced/WebsiteAnalyticsSlider.tsx dots + CustomerReviews.tsx arrows)
 * feat 00007 item 3: carousel ของ images[] (≤1 รูป = รูปเดี่ยว ไม่มี control)
 * feat 00007 item 4: price flash animation เมื่อ currentPrice เปลี่ยน
 */
import { useEffect, useRef, useState } from 'react'

import Link from 'next/link'

import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'

import { Icon } from '@iconify/react'
import { useKeenSlider } from 'keen-slider/react'
import 'keen-slider/keen-slider.min.css'

import type { PublicAuctionDTO } from '@/services/auction.service'

type Props = {
  title: string
  imageUrl: string
  status: PublicAuctionDTO['status']
  /** รูปทั้งหมด (carousel) — ว่าง → fallback imageUrl เดี่ยว */
  images?: string[]
  hud?: {
    currentPrice: number
    bidCount: number
    endTimeMs: number
  }
  viewerCount?: number
}

function formatRemain(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

const resolveImg = (u: string) => (u.startsWith('http') ? u : `/api/files/${u}`)

const STATUS_BADGE: Record<PublicAuctionDTO['status'], { label: string; bg: string; dot?: string }> = {
  draft: { label: 'ร่าง', bg: 'rgba(100,116,139,.85)' },
  scheduled: { label: 'เร็ว ๆ นี้', bg: 'rgba(37,99,235,.88)' },
  live: { label: 'LIVE', bg: 'rgba(220,38,38,.9)', dot: '#fff' },
  ended: { label: 'จบแล้ว', bg: 'rgba(15,23,42,.82)' },
  unsold: { label: 'ไม่มีผู้ชนะ', bg: 'rgba(100,116,139,.85)' },
  cancelled: { label: 'ยกเลิกแล้ว', bg: 'rgba(100,116,139,.85)' },
}

export default function AuctionHero({ title, imageUrl, status, images, hud, viewerCount = 0 }: Props) {
  const badge = STATUS_BADGE[status]

  // รูปทั้งหมด (carousel) — images[] ก่อน, fallback imageUrl เดี่ยว
  const slides = (images && images.length > 0 ? images : imageUrl ? [imageUrl] : []).map(resolveImg)
  const multi = slides.length > 1

  const [currentSlide, setCurrentSlide] = useState(0)
  const [sliderRef, instanceRef] = useKeenSlider<HTMLDivElement>({
    loop: true,
    slideChanged: (s) => setCurrentSlide(s.track.details.rel),
  })

  // countdown สำหรับ HUD (tick 1s)
  const [now, setNow] = useState<number>(() => Date.now())
  useEffect(() => {
    if (!hud) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [hud])
  const remainMs = hud ? hud.endTimeMs - now : 0
  const isUnderHour = remainMs > 0 && remainMs < 60 * 60 * 1000

  // feat 00007 item 4: flash ราคาเมื่อเปลี่ยน (skip mount แรก)
  const [priceFlash, setPriceFlash] = useState(false)
  const prevPriceRef = useRef(hud?.currentPrice)
  useEffect(() => {
    if (!hud) return
    if (prevPriceRef.current !== undefined && hud.currentPrice !== prevPriceRef.current) {
      setPriceFlash(true)
      const t = setTimeout(() => setPriceFlash(false), 550)
      prevPriceRef.current = hud.currentPrice
      return () => clearTimeout(t)
    }
    prevPriceRef.current = hud.currentPrice
  }, [hud])

  return (
    <Box sx={{ position: 'relative', height: { xs: 300, md: 380 }, overflow: 'hidden', bgcolor: '#0F172A' }}>
      {/* image/carousel layer (ล่างสุด) */}
      {multi ? (
        <Box
          ref={sliderRef}
          className="keen-slider"
          sx={{ position: 'absolute', inset: 0, height: '100%' }}
        >
          {slides.map((src, i) => (
            <Box
              key={i}
              className="keen-slider__slide"
              sx={{
                height: '100%',
                backgroundImage: `url("${src}")`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
              }}
            />
          ))}
        </Box>
      ) : (
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            backgroundImage: slides[0] ? `url("${slides[0]}")` : undefined,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
          }}
        />
      )}

      {/* scrim gradient */}
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          zIndex: 1,
          background: 'linear-gradient(180deg, rgba(0,0,0,.35) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,.75) 100%)',
        }}
      />

      {/* carousel controls (เฉพาะหลายรูป) */}
      {multi && (
        <>
          <IconButton
            aria-label="รูปก่อนหน้า"
            onClick={() => instanceRef.current?.prev()}
            sx={{
              position: 'absolute',
              top: '50%',
              left: 8,
              transform: 'translateY(-50%)',
              zIndex: 3,
              width: 34,
              height: 34,
              bgcolor: 'rgba(0,0,0,0.4)',
              color: '#fff',
              '&:hover': { bgcolor: 'rgba(0,0,0,0.6)' },
            }}
          >
            <Icon icon="tabler-chevron-left" fontSize={20} />
          </IconButton>
          <IconButton
            aria-label="รูปถัดไป"
            onClick={() => instanceRef.current?.next()}
            sx={{
              position: 'absolute',
              top: '50%',
              right: 8,
              transform: 'translateY(-50%)',
              zIndex: 3,
              width: 34,
              height: 34,
              bgcolor: 'rgba(0,0,0,0.4)',
              color: '#fff',
              '&:hover': { bgcolor: 'rgba(0,0,0,0.6)' },
            }}
          >
            <Icon icon="tabler-chevron-right" fontSize={20} />
          </IconButton>
          {/* dots — top-center (กัน overlap HUD ล่าง) */}
          <Box
            sx={{
              position: 'absolute',
              top: 12,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 3,
              display: 'flex',
              gap: '6px',
            }}
          >
            {slides.map((_, i) => (
              <Box
                key={i}
                onClick={() => instanceRef.current?.moveToIdx(i)}
                sx={{
                  width: currentSlide === i ? 18 : 6,
                  height: 6,
                  borderRadius: 999,
                  bgcolor: currentSlide === i ? '#fff' : 'rgba(255,255,255,0.5)',
                  cursor: 'pointer',
                  transition: 'width .2s',
                }}
              />
            ))}
          </Box>
        </>
      )}

      {/* frosted back button */}
      <Link href="/" style={{ textDecoration: 'none' }}>
        <IconButton
          aria-label="กลับหน้าหลัก"
          title="กลับหน้าหลัก"
          sx={{
            position: 'absolute',
            top: 13,
            left: 13,
            zIndex: 3,
            width: 36,
            height: 36,
            borderRadius: '50%',
            bgcolor: 'rgba(255,255,255,0.92)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255,255,255,0.6)',
            boxShadow: '0 2px 6px rgba(0,0,0,.12)',
            color: '#0F172A',
            '&:hover': { bgcolor: 'rgba(255,255,255,1)' },
          }}
        >
          <Icon icon="tabler-arrow-left" fontSize={18} />
        </IconButton>
      </Link>

      {/* status badge มุมขวาบน */}
      <Box
        sx={{
          position: 'absolute',
          top: 14,
          right: 14,
          zIndex: 3,
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          px: '11px',
          py: '5px',
          borderRadius: 999,
          bgcolor: badge.bg,
          color: '#fff',
          fontSize: 12,
          fontWeight: 800,
          letterSpacing: '0.03em',
        }}
      >
        {badge.dot && (
          <Box
            component="span"
            sx={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              bgcolor: badge.dot,
              animation: 'auctionLivePulse 1.4s ease-in-out infinite',
              '@keyframes auctionLivePulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.35 } },
            }}
          />
        )}
        {badge.label}
      </Box>

      {/* viewer count "กำลังดู" (feat 00006) */}
      {viewerCount > 0 && (
        <Box
          sx={{
            position: 'absolute',
            top: 50,
            right: 14,
            zIndex: 3,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            px: '10px',
            py: '4px',
            borderRadius: 999,
            bgcolor: 'rgba(0,0,0,0.45)',
            backdropFilter: 'blur(4px)',
            color: '#fff',
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          <Icon icon="tabler-eye" fontSize={13} />
          {viewerCount.toLocaleString()} กำลังดู
        </Box>
      )}

      {/* ชื่อ + HUD (ราคา/countdown) */}
      <Box sx={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 2, px: '18px', pb: '16px' }}>
        <Typography
          sx={{
            color: '#fff',
            fontSize: { xs: 15, md: 18 },
            fontWeight: 600,
            letterSpacing: '-0.01em',
            lineHeight: 1.3,
            textShadow: '0 1px 3px rgba(0,0,0,.35)',
          }}
        >
          {title}
        </Typography>

        {hud && (
          <Box sx={{ mt: '9px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '10px' }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontSize: 10.5, color: 'rgba(255,255,255,.82)', fontWeight: 500, mb: '2px' }}>
                ราคาปัจจุบัน · {hud.bidCount} บิด
              </Typography>
              <Typography
                sx={{
                  color: '#fff',
                  fontSize: { xs: 34, md: 40 },
                  fontWeight: 800,
                  lineHeight: 0.95,
                  letterSpacing: '-0.5px',
                  fontVariantNumeric: 'tabular-nums',
                  textShadow: '0 2px 12px rgba(0,0,0,.45)',
                  transformOrigin: 'left center',
                  // feat 00007 item 4: flash เมื่อราคาเปลี่ยน
                  animation: priceFlash ? 'auctionPriceFlash .55s ease-out' : 'none',
                  '@keyframes auctionPriceFlash': {
                    '0%': { transform: 'scale(1)', color: '#fff' },
                    '30%': { transform: 'scale(1.14)', color: '#3EE87F' },
                    '100%': { transform: 'scale(1)', color: '#fff' },
                  },
                }}
              >
                ฿{hud.currentPrice.toLocaleString()}
              </Typography>
            </Box>
            <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
              <Typography sx={{ fontSize: 10.5, color: 'rgba(255,255,255,.82)', fontWeight: 500, mb: '2px' }}>
                เหลือเวลา
              </Typography>
              <Typography
                sx={{
                  fontSize: 23,
                  fontWeight: 800,
                  lineHeight: 1,
                  fontVariantNumeric: 'tabular-nums',
                  color: isUnderHour ? '#FF5B66' : '#fff',
                  textShadow: '0 2px 12px rgba(0,0,0,.45)',
                }}
              >
                {formatRemain(remainMs)}
              </Typography>
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  )
}
