'use client'

/**
 * ServiceJobPhotosCard — "รูปจากร้าน" บนหน้าออเดอร์ของลูกค้า `/o/[token]` (feature 00086 P3 · T12 · S-13)
 *
 * ลูกค้าอ่านหลักฐานก่อนทำ/หลังทำ (Mode: Read — ไม่มี action ใหม่) · render หลังผ่าน grant เท่านั้น
 * (page.tsx ยิง query หลังด่าน 00015 · GuestOrderView ไม่มีการ์ดนี้) · ไม่มีชื่อพนักงานใด ๆ (Controller Q1)
 *
 * Base: src/app/(marketing)/o/[token]/AppointmentCard.tsx (Card + CardContent cardBodySx + SectionTitle
 *   + กล่องรัศมีเท่า MiniFact) ซึ่ง chase ต่อไปที่
 *   theme/vuexy/typescript-version/full-version/src/views/apps/ecommerce/orders/details/OrderDetailsCard.tsx
 *   lightbox: src/views/pages/user-profile/v2/ProfileLightbox.tsx (เปลือกเดียวกับ InspectionBlock —
 *   scroll lock / กักโฟกัส / Esc / คืนโฟกัส ครบในตัว ไม่ประกอบ overlay ใหม่)
 */
import { useState } from 'react'

import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'

import { Icon } from '@iconify/react'

import ProfileLightbox from '@/views/pages/user-profile/v2/ProfileLightbox'
import { formatDayMonthTimeTH } from '@/lib/format-date'

import SectionTitle from './SectionTitle'
import { cardBodySx } from './card-padding'
import type { BuyerServiceJobPhotoRecord, BuyerServiceJobPhotos } from './buyer-service-job-photos'

const PHASE_LABEL: Record<BuyerServiceJobPhotoRecord['phase'], string> = {
  BEFORE: 'ก่อนทำ',
  AFTER: 'หลังทำ',
}

const phaseCaption = (r: BuyerServiceJobPhotoRecord) => `${PHASE_LABEL[r.phase]} · ${formatDayMonthTimeTH(r.createdAtIso)} น.`

/**
 * ไทล์รูปหนึ่งใบ — ประกาศนอก component หลัก (docs/conventions/component-declared-in-render.md)
 * รูปพัง → ช่อง `tabler-photo-off` ทีละใบ ไม่ซ่อนทั้งแถว (UX D11)
 */
function PhotoTile({ src, thumb, label, onOpen }: { src: string; thumb: string | null; label: string; onOpen: () => void }) {
  /* กริดใช้รูปย่อ (00054) ก่อน — ไม่มีไฟล์ย่อ (ยังไม่ backfill/ย่อไม่สำเร็จ) → ต้นฉบับ → พังจริงค่อยเป็นช่อง photo-off
     แพตเทิร์นเดียวกับ PublicRoomList · lightbox ใช้ต้นฉบับเสมอ */
  const [stage, setStage] = useState<'thumb' | 'original' | 'failed'>(thumb ? 'thumb' : 'original')
  const failed = stage === 'failed'

  return (
    <Box
      component='button'
      type='button'
      onClick={onOpen}
      aria-label={label}
      sx={{
        position: 'relative',
        aspectRatio: '1 / 1',
        inlineSize: '100%',
        p: 0,
        border: 0,
        overflow: 'hidden',
        cursor: 'pointer',
        /* รัศมีเท่า MiniFact ของการ์ดนัด (borderRadius: 2) — ช่องในการ์ดทั้งหน้าใช้ค่าเดียว */
        borderRadius: 2,
        bgcolor: 'action.hover',
        color: 'text.secondary',
        display: 'grid',
        placeItems: 'center',
        '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
      }}
    >
      {failed ? (
        <Icon icon='tabler-photo-off' fontSize={22} aria-hidden='true' />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- URL จาก storage (fileUrlOf) เหมือนรูปอื่นในหน้านี้
        <img
          src={stage === 'thumb' && thumb ? thumb : src}
          alt=''
          loading='lazy'
          onError={() => setStage((s) => (s === 'thumb' ? 'original' : 'failed'))}
          style={{ position: 'absolute', inset: 0, inlineSize: '100%', blockSize: '100%', objectFit: 'cover' }}
        />
      )}
    </Box>
  )
}

export default function ServiceJobPhotosCard({ photos }: { photos: BuyerServiceJobPhotos }) {
  const { records, afterPending } = photos
  /** ใบที่เปิดอยู่ใน lightbox — นับต่อเนื่องข้ามขั้น (ก่อนทำ → หลังทำ) ให้ ‹ › เดินได้ทั้งชุด */
  const [viewerIdx, setViewerIdx] = useState<number | null>(null)

  const flat = records.flatMap((r) => r.photoUrls.map((url, i) => ({ url, record: r, n: i + 1 })))
  const hasPhotos = flat.length > 0
  const hasAfter = records.some((r) => r.phase === 'AFTER')
  const current = viewerIdx !== null ? flat[viewerIdx] : undefined
  /** ลำดับใบแรกของแต่ละขั้นใน `flat` */
  const starts = records.map((_, k) => records.slice(0, k).reduce((sum, r) => sum + r.photoUrls.length, 0))

  return (
    <>
    <Card>
      <CardContent sx={cardBodySx}>
        {/* ไม่มีรูปเลย มีแต่บันทึก → หัวข้อพูดตามจริง */}
        <SectionTitle icon='tabler-photo'>{hasPhotos ? 'รูปจากร้าน' : 'บันทึกจากร้าน'}</SectionTitle>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {records.map((r, k) => {
          const start = starts[k]

          return (
            <Box key={r.phase} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Typography variant='body2' color='text.secondary'>
                {phaseCaption(r)}
              </Typography>
              {r.photoUrls.length > 0 && (
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 2 }}>
                  {r.photoUrls.map((url, i) => (
                    <PhotoTile
                      key={url}
                      src={url}
                      thumb={r.thumbUrls[i] ?? null}
                      label={`ดูรูป${PHASE_LABEL[r.phase]}ที่ ${i + 1}`}
                      onOpen={() => setViewerIdx(start + i)}
                    />
                  ))}
                </Box>
              )}
              {r.note && (
                <Typography variant='body2' sx={{ whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>
                  {r.note}
                </Typography>
              )}
            </Box>
          )
        })}

        {!hasAfter && afterPending && (
          <Typography variant='body2' color='text.secondary'>
            รูปหลังทำจะขึ้นที่นี่เมื่อร้านทำเสร็จ
          </Typography>
        )}
        </Box>
      </CardContent>
    </Card>

      {/* นอก Card — overlay fixed ไม่ควรอยู่ใต้กล่องที่ overflow:hidden */}

      {current && viewerIdx !== null && (
        <ProfileLightbox
          open
          onClose={() => setViewerIdx(null)}
          onPrev={viewerIdx > 0 ? () => setViewerIdx(viewerIdx - 1) : undefined}
          onNext={viewerIdx < flat.length - 1 ? () => setViewerIdx(viewerIdx + 1) : undefined}
          index={viewerIdx + 1}
          total={flat.length}
          ariaLabel={`รูป${PHASE_LABEL[current.record.phase]}ที่ ${current.n}`}
          mediaSlot={
            // eslint-disable-next-line @next/next/no-img-element -- URL จาก storage (fileUrlOf)
            <img
              src={current.url}
              alt=''
              style={{ maxInlineSize: '100%', maxBlockSize: '100%', objectFit: 'contain' }}
            />
          }
          panelSlot={
            <Box sx={{ p: 5 }}>
              <Typography sx={{ fontSize: '0.9375rem', fontWeight: 500 }}>{phaseCaption(current.record)}</Typography>
              {current.record.note && (
                <Typography variant='body2' color='text.secondary' sx={{ mt: 1, whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>
                  {current.record.note}
                </Typography>
              )}
            </Box>
          }
        />
      )}
    </>
  )
}
