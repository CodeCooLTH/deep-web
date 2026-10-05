'use client'

/**
 * ShopHeaderBar — หัวร้านบนสุดของหน้าออเดอร์ผู้ซื้อ `/o/[token]` (feature 00068 · TFR-001)
 *
 * [รูปปก D-10] → โลโก้ (ซ้อนขอบปก) | ชื่อร้าน h1 + บรรทัดย่อ | ปุ่มแชท
 *
 * 🛑 ปก = รูปที่ร้านอัปโหลดเองเท่านั้น ไม่มีรูป = **ไม่ render อะไรเลย** (ไม่มีกล่องเทา ไม่มีไล่สี tier
 * ไม่มี "โลโก้ขยายเบลอ" — UX Addendum A2) ทุกอย่างบนหัวอยู่ใต้รูป ไม่มีอะไรวางทับรูป จึงไม่ต้องมี scrim
 *
 * 🛑 รูปโหลดล้ม 2 ชั้น: variant `lg` → ต้นฉบับ → ซ่อนทั้งแถบ · เมื่อแถบถูกถอด sibling selector
 * `.order-cover + &` ไม่ match ⇒ โลโก้เลิกซ้อนเองด้วย CSS ไม่ต้องมี state ที่ระดับ header
 *
 * 🛑 บรรทัดย่อมาจาก `buildShopSummaryLine` ที่เดียว (D-11: 0/null ไม่เขียน) — ห้ามประกอบสตริงเองที่นี่
 * ชื่อร้าน clamp 2 บรรทัด · 3 บรรทัดที่ <360px (R-1) · บรรทัดย่อตกบรรทัดทีละหน่วย ไม่ตัดด้วย ellipsis (R-2)
 *
 * presentational ล้วน — ข้อมูลทั้งหมดมาจาก shell ผ่าน props
 *
 * Base: theme/vuexy/typescript-version/full-version/src/views/pages/user-profile/UserProfileHeader.tsx (CardMedia cover + avatar ซ้อนขอบ + ริง backgroundPaper)
 */
import { useEffect, useRef, useState } from 'react'

import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import NextLink from 'next/link'
import { Icon } from '@iconify/react'

import { buildShopSummaryLine, SHOP_RATING_UNIT } from '@/lib/buyer-order-summary'
import { resolveVerifyLevelImage } from '@/lib/verify-badge'

import { ORDER_TWO_COL_MQ, orderDetailWidthSx } from './content-width'

/** จอมือถือแคบสุดคือ <360 (ฐานของ sx) — จุดขึ้นไปหาขนาดกลางที่ UX Addendum A1 กำหนด */
const MQ_360 = '@media (min-width:360px)'
const MQ_600 = '@media (min-width:600px)'

/** ขนาดโลโก้ตามจอ (UX A1: 44 / 52 / 64) — ค่าเดียวใช้ทั้งขนาดวงกลมและระยะซ้อนครึ่งหนึ่ง */
const LOGO = { base: 44, sm: 52, wide: 64 } as const

/** ระยะจากขอบล่างปกถึงบนบล็อกชื่อ (UX A1: 12px) */
const BELOW_COVER_GAP = 12

type Props = {
  /** Shop.id — ปลายทางปุ่มแชท `/messages/{shopId}` */
  shopId: string
  shopName: string
  /** โลโก้ร้าน (รูปเจ้าของถ้าร้านไม่ตั้ง) — null = ใช้อักษรตัวแรกของชื่อร้าน */
  logoUrl: string | null
  maxVerifyLevel: number
  /** ปกขนาด lg (variant 00054) — ลองก่อน */
  coverImageLg: string | null
  /** ปกต้นฉบับ — ถอยมาใช้เมื่อ lg โหลดไม่ขึ้น */
  coverImage: string | null
  avgRating: number | null
  completedOrders: number | null
}

/**
 * แถบปก — ประกาศระดับ module (ไม่ใช่ในตัว render) ให้ state onError ไม่ถูกรีเซ็ตทุกรอบ
 * แถบนี้ไม่ใช่ element ที่กดได้ ไม่มีเป้าแตะ — ปุ่มทุกอย่างอยู่ใต้รูป
 */
function CoverBand({ lg, original }: { lg: string | null; original: string | null }) {
  // ลำดับถอย: lg → ต้นฉบับ (ตัด null และ URL ซ้ำ ไม่ให้ลองรูปเดิมสองรอบ)
  const sources = [lg, original].filter((s, i, a): s is string => !!s && a.indexOf(s) === i)
  const [failed, setFailed] = useState(0)
  const imgRef = useRef<HTMLImageElement>(null)
  const currentSrc = sources[failed]

  // รูปที่ล้มก่อน hydrate ไม่ยิง onError (event หายไปแล้ว) → ตรวจซ้ำตอน mount/เปลี่ยน src
  // ไม่วน: ขยับ failed ได้เฉพาะเมื่อรูปปัจจุบันเสียจริง · รูปถัดไปเป็น <img key> ใหม่ · ครบแล้ว imgRef = null
  useEffect(() => {
    const img = imgRef.current

    if (img && img.complete && img.naturalWidth === 0) setFailed(n => n + 1)
  }, [currentSrc])

  // ไม่มีรูป หรือล้มครบทุกชั้น = ถอดแถบทั้งแถบ (ห้ามค้างกล่องเทา)
  if (failed >= sources.length) return null

  return (
    <Box
      className='order-cover'
      sx={{
        position: 'relative',
        overflow: 'hidden',
        /* ความสูงคงที่ระหว่างโหลด = ไม่มี layout shift · ตัวเลขตาม UX Addendum A1 (ไม่อยู่บน spacing scale) */
        height: 72,
        [MQ_360]: { height: 96 },
        [MQ_600]: { height: 128 },
        /* เพดาน 160 < ปกหน้าโปรไฟล์ (176/200/224) ตามกฎของหน้านี้ — ห้ามยกไปเท่าหน้าโปรไฟล์
           จอกว้างปกอยู่ในกรอบ ไม่ชนขอบจอ ⇒ มุมมน 12 + เส้นกรอบ 1px กันรูปสว่างกลืนพื้นกระดาษ */
        [ORDER_TWO_COL_MQ]: {
          height: 160,
          borderRadius: '12px',
          '&::after': {
            content: '""',
            position: 'absolute',
            inset: 0,
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 'inherit',
            pointerEvents: 'none',
          },
        },
        /* พื้นระหว่างโหลด — token ตามธีม ไม่มี fade-in (Flat-At-Rest) */
        bgcolor: 'action.hover',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- URL หลากโดเมน + ต้อง onError ถอยรูป */}
      <img
        ref={imgRef}
        key={currentSrc}
        src={currentSrc}
        alt=''
        aria-hidden='true'
        loading='eager'
        onError={() => setFailed((n) => n + 1)}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          /* เอียงขึ้น 40% — คน/สินค้ามักอยู่ครึ่งบน ตัวหนังสือป้ายที่ติดมากับรูปมักอยู่ขอบบนสุด (UX A1) */
          objectPosition: '50% 40%',
          display: 'block',
        }}
      />
    </Box>
  )
}

export default function ShopHeaderBar({
  shopId,
  shopName,
  logoUrl,
  maxVerifyLevel,
  coverImageLg,
  coverImage,
  avgRating,
  completedOrders,
}: Props) {
  const summary = buildShopSummaryLine({ avgRating, completedOrders })
  // แยกเป็นหน่วย ("4.7 ดาว" / "ออเดอร์สำเร็จ N ครั้ง") จากสตริงของ buildShopSummaryLine เท่านั้น
  // เพื่อให้ตกบรรทัดทีละหน่วยโดยตัวเลขไม่ถูกตัด (R-2) — ไม่ได้คำนวณ/ตัดสินใจอะไรเพิ่ม
  const parts = summary ? summary.split(' · ') : []
  const levelImg = resolveVerifyLevelImage(maxVerifyLevel)

  return (
    <Box component='header' sx={{ bgcolor: 'background.paper', borderBottom: '1px solid', borderColor: 'divider' }}>
      <Box sx={{ ...orderDetailWidthSx, [ORDER_TWO_COL_MQ]: { maxWidth: 1152, px: 4, pt: 4 } }}>
        <CoverBand lg={coverImageLg} original={coverImage} />

        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            px: 4,
            py: 3,
            [ORDER_TWO_COL_MQ]: { px: 0, gap: 4 },
            /* ปกอยู่ = โลโก้ซ้อนขอบครึ่งหนึ่ง ชื่อเริ่มใต้ขอบรูป 12px · ปกไม่อยู่ selector นี้ไม่ match */
            '.order-cover + &': { alignItems: 'flex-start', pt: `${BELOW_COVER_GAP}px` },
            '.order-cover + & .shop-logo': {
              mt: `-${LOGO.base / 2 + BELOW_COVER_GAP}px`,
              [MQ_360]: { mt: `-${LOGO.sm / 2 + BELOW_COVER_GAP}px` },
              [ORDER_TWO_COL_MQ]: { mt: `-${LOGO.wide / 2 + BELOW_COVER_GAP}px` },
            },
          }}
        >
          <Box
            className='shop-logo'
            sx={{
              position: 'relative',
              flexShrink: 0,
              width: LOGO.base,
              height: LOGO.base,
              [MQ_360]: { width: LOGO.sm, height: LOGO.sm },
              [ORDER_TWO_COL_MQ]: { width: LOGO.wide, height: LOGO.wide },
            }}
          >
            <Avatar
              src={logoUrl ?? undefined}
              alt=''
              sx={{
                width: '100%',
                height: '100%',
                /* ริงพื้นกระดาษ 4px ตามอวตารของ SmsAutoEnter/GuestOrderView */
                border: '4px solid',
                borderColor: 'background.paper',
                boxShadow: 'var(--mui-customShadows-sm)',
                /* 800 บนอักษรแทนโลโก้ = ภาพ ไม่ใช่ข้อความ (ข้อยกเว้นเดิมของหน้านี้) */
                fontWeight: 800,
                fontSize: '1.25rem',
                bgcolor: 'primary.lightOpacity',
                color: 'primary.main',
              }}
            >
              {shopName.slice(0, 1)}
            </Avatar>
            {levelImg && (
              // eslint-disable-next-line @next/next/no-img-element -- ตราสถิตจาก public/
              <img
                src={levelImg.src}
                alt={levelImg.alt}
                width={20}
                height={20}
                style={{ position: 'absolute', right: -2, bottom: -2 }}
              />
            )}
          </Box>

          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography
              component='h1'
              title={shopName}
              sx={{
                m: 0,
                fontSize: '1.125rem' /* Title 18 / Strong 700 (D-8) */,
                fontWeight: 700,
                /* ≥1.4 — สระ/วรรณยุกต์ไทยของ Anuphan ถูกตัดที่ 1.3 เมื่อมี overflow:hidden + clamp */
                lineHeight: 1.4,
                overflowWrap: 'anywhere',
                display: '-webkit-box',
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                /* R-1: <360 ได้ 3 บรรทัด · ≥360 ได้ 2 */
                WebkitLineClamp: 3,
                [MQ_360]: { WebkitLineClamp: 2 },
                /* h4 ของ ramp (1.5rem) ผ่าน typography token ไม่เขียนเลขซ้ำ · น้ำหนัก Strong 700 (D-8) */
                [ORDER_TWO_COL_MQ]: { typography: 'h4', fontWeight: 700 },
              }}
            >
              {shopName}
            </Typography>
            {parts.length > 0 && (
              <Box
                sx={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  columnGap: '10px' /* UX A1: column-gap 10px */,
                  mt: 0.25,
                  fontSize: '0.8125rem',
                  color: 'text.secondary',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {parts.map((p, i) => (
                  <Box key={p} component='span' sx={{ whiteSpace: 'nowrap' }}>
                    {p.endsWith(SHOP_RATING_UNIT) && (
                      <Box component='span' className='sr-only'>
                        คะแนนรีวิวเฉลี่ย{' '}
                      </Box>
                    )}
                    {p}
                    {i < parts.length - 1 ? ' ·' : ''}
                  </Box>
                ))}
              </Box>
            )}
          </Box>

          <Button
            component={NextLink}
            href={`/messages/${shopId}`}
            variant='tonal'
            color='primary'
            aria-label='แชทกับร้าน'
            sx={{
              flexShrink: 0,
              color: 'primary.dark' /* คอนทราสต์ AA บนพื้นจาง — ห้ามใช้ primary.main เป็นสีตัวอักษร */,
              /* <360: ไอคอนล้วน 44×44 (ตามเกณฑ์เป้าแตะ) */
              minWidth: 44,
              width: 44,
              height: 44,
              p: 0,
              flexDirection: 'column',
              gap: 0,
              /* 360–860: ไอคอน + "แชท" ซ้อนแนวตั้ง 52×48 */
              [MQ_360]: { width: 52, height: 48 },
              /* ≥861: ไอคอน + "แชทกับร้าน" แนวนอน */
              [ORDER_TWO_COL_MQ]: { width: 'auto', height: 44, flexDirection: 'row', gap: 1.5, px: 4 },
            }}
          >
            <Icon icon='tabler-message-circle' fontSize={22} aria-hidden='true' />
            <Box
              component='span'
              sx={{ display: 'none', fontSize: '0.8125rem', lineHeight: 1.2, [MQ_360]: { display: 'block' }, [ORDER_TWO_COL_MQ]: { display: 'none' } }}
            >
              แชท
            </Box>
            <Box
              component='span'
              sx={{ display: 'none', fontSize: '0.9375rem', lineHeight: 1.2, [ORDER_TWO_COL_MQ]: { display: 'block' } }}
            >
              แชทกับร้าน
            </Box>
          </Button>
        </Box>
      </Box>
    </Box>
  )
}
