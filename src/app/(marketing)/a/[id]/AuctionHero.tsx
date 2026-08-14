'use client'

/**
 * AuctionHero — Concept 1 "Live Commerce" full-bleed image canvas + carousel
 * (feature 00004 redesign 2026-07-02 + feat 00007 item 3 carousel)
 *
 * Base: theme/vuexy/typescript-version/full-version/src/views/pages/user-profile/UserProfileHeader.tsx (banner)
 *   + keen-slider (feat 00007: theme/vuexy/.../widget-examples/advanced/WebsiteAnalyticsSlider.tsx dots + CustomerReviews.tsx arrows)
 *
 * เป็น "ผ้าใบ" รูป (carousel ถ้า images.length>1) + gradient บน/ล่าง ที่รับ overlay children จาก AuctionDetailClient
 * (AuctionSellerHeader/AuctionActionRail/AuctionLiveComment). HUD ราคา/countdown/status/viewer ย้ายออกไปเป็น
 * overlay components + แถบล่างแล้ว (spec docs/superpowers/specs/2026-07-02-buyer-auction-concept1-redesign.md)
 * — ไม่อยู่ในไฟล์นี้ (ต่างจากเวอร์ชันก่อน redesign). price flash (00007 item 4) ย้ายไปที่ AuctionBidPanel (ราคาอยู่แถบล่าง)
 *
 * Visual ref (asset เท่านั้น — gradient/สี rgba คงดิบตาม doc exception "on-image scrim"):
 *   docs/mockups/auction/buyer-auction-concept1-flow.html .imgfull/.grad-t/.grad-b
 */
import type { ReactNode } from 'react'
import { useState } from 'react'

import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'

import { Icon } from '@iconify/react'
import { useKeenSlider } from 'keen-slider/react'
import { toFileUrl } from '@/lib/file-url'
import 'keen-slider/keen-slider.min.css'

type Props = {
  imageUrl: string
  /** รูปทั้งหมด (carousel) — ว่าง/≤1 → รูปเดี่ยว ไม่มี control (feat 00007 item 3) */
  images?: string[]
  /** mobile = เต็ม viewport (flex:1 ของ parent flex column, ไม่ scroll หน้า) / desktop = สูงคงที่ 380 (bounded layout) */
  variant: 'mobile' | 'desktop'
  children?: ReactNode
}

// imageUrl/images จาก DTO เป็น storage key ดิบ (เช่น "xxx.jpeg") — prefix /api/files/ (http = external ปล่อยตรง)
const resolveImg = (u: string) => (toFileUrl(u))

export default function AuctionHero({ imageUrl, images, variant, children }: Props) {
  const slides = (images && images.length > 0 ? images : imageUrl ? [imageUrl] : []).map(resolveImg)
  const multi = slides.length > 1

  const [currentSlide, setCurrentSlide] = useState(0)
  const [sliderRef, instanceRef] = useKeenSlider<HTMLDivElement>({
    loop: true,
    slideChanged: (s) => setCurrentSlide(s.track.details.rel),
  })

  return (
    <Box
      sx={{
        position: 'relative',
        overflow: 'hidden',
        // fallback ไม่มีรูป — พื้นเข้มคงที่เสมอ (Vuexy always-dark #2F2B3D, mainColorChannels-light)
        bgcolor: '#2F2B3D',
        ...(variant === 'mobile' ? { flex: '1 1 auto', minHeight: 0 } : { height: 380 }),
      }}
    >
      {/* image / carousel layer (ล่างสุด) */}
      {multi ? (
        <Box ref={sliderRef} className="keen-slider" sx={{ position: 'absolute', inset: 0, height: '100%' }}>
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

      {/* scrim บน — ให้ header overlay (avatar/ชื่อผู้ขาย/LIVE) อ่านออก (mockup .grad-t h130) */}
      <Box
        sx={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          height: 130,
          background: 'linear-gradient(rgba(0,0,0,.62), transparent)',
          zIndex: 1,
        }}
      />
      {/* scrim ล่าง — ให้ rail/คอมเมนต์ล่าสุดอ่านออก (mockup .grad-b h52%) */}
      <Box
        sx={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: '52%',
          background: 'linear-gradient(transparent, rgba(0,0,0,.86))',
          zIndex: 1,
        }}
      />

      {/* carousel controls (เฉพาะหลายรูป — feat 00007 item 3). arrows อยู่กลางแนวตั้ง (คนละระดับกับ action rail ล่าง) */}
      {multi && (
        <>
          <IconButton
            aria-label="รูปก่อนหน้า"
            onClick={() => instanceRef.current?.prev()}
            sx={{
              position: 'absolute',
              top: '42%',
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
              top: '42%',
              left: 50,
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
          {/* dots — top-center (กัน overlap seller header ซ้าย / LIVE ขวา / HUD ล่าง) */}
          <Box
            sx={{
              position: 'absolute',
              top: 64,
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

      {children}
    </Box>
  )
}
