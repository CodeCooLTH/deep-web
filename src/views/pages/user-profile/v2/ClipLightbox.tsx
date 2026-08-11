'use client'

/**
 * ClipLightbox — เนื้อในของ lightbox สำหรับคลิปปักหมุด (เปลือกคือ `ProfileLightbox`)
 *
 * 🛑 **ยังต้องกดก่อนถึงจะโหลด iframe เหมือนตอนอยู่ในกริด** — ไม่ใช่เล่นอัตโนมัติตอนเปิด
 * กลไก gate นี้มีเหตุผลสองข้อที่ยังจริงอยู่ในหน้าต่างนี้ทุกประการ: สคริปต์ของแพลตฟอร์มหนัก
 * หลายเมกะไบต์ และแพลตฟอร์มจะเห็นว่าใครเปิดดูทั้งที่ผู้ชมยังไม่ได้เลือกดู
 * (ต่างจากกริดตรงที่นี่กดครั้งเดียวได้คลิปเต็มจอ ไม่ต้องกดสองที)
 *
 * สถิติในแผงเป็น **snapshot ณ เวลาที่ร้านกดเลือก ไม่ใช่ค่าสด** และอ่านอย่างเดียว —
 * ปุ่มถูกใจของคลิปไม่ทำ (user เคาะ 2026-08-11) เพราะไลก์บนแพลตฟอร์มต้นทางเราสั่งไม่ได้
 * ปุ่มที่กดแล้วไม่มีอะไรเกิดขึ้นจริงบนแพลตฟอร์มคือปุ่มหลอก
 *
 * Base: src/views/pages/user-profile/v2/ShopVideos.tsx (VideoCell — gate ก่อนโหลด iframe + สถิติ)
 */
import { useState } from 'react'

import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'

import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'

import { Icon } from '@iconify/react'

import { buildEmbedUrl, type VideoProvider } from '@/lib/shop-video'

import ProfileLightbox from './ProfileLightbox'
import { PROVIDER_UI, compactCount, type ShopVideoItem } from './ShopVideos'

/* 🛑 ผู้เรียกต้องส่ง `key={item.id}` — เปลี่ยนคลิปแล้วต้องกลับไปสถานะ "ยังไม่เล่น" ไม่งั้นใบถัดไป
   จะโหลด iframe เองทันทีทั้งที่ผู้ชมยังไม่ได้เลือกดู ซึ่งเป็นสิ่งเดียวกับที่ gate มีไว้กัน
   ทำด้วย remount ไม่ใช่ setState ใน effect (ดูเหตุผลเดียวกันที่ `ProductMedia`) */
function ClipMedia({ item }: { item: ShopVideoItem }) {
  const [playing, setPlaying] = useState(false)
  const [imgFailed, setImgFailed] = useState(false)

  const provider = item.provider as VideoProvider
  const ui = PROVIDER_UI[provider]

  return (
    <Box
      sx={{
        position: 'relative',
        inlineSize: '100%',
        /* 9:16 ที่นี่ ไม่ใช่ 3:4 เหมือนไทล์ในกริด — กริดครอปเป็น 3:4 เพื่อให้ผังไม่กระโดด
           แต่ lightbox คือที่ที่ผู้ชม "ตั้งใจดูคลิป" จึงให้สัดส่วนจริงของคลิปสั้น */
        aspectRatio: '9/16',
        maxBlockSize: { md: '88dvh' },
        bgcolor: 'common.black',
        marginInline: 'auto',
      }}
    >
      {playing ? (
        <iframe
          src={buildEmbedUrl({ provider, videoId: item.videoId })}
          title={item.caption ?? `คลิปจาก ${ui.label}`}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
          allow='accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture'
          allowFullScreen
          // sandbox แน่นที่สุดเท่าที่ยังเล่นได้ — ไม่ให้ iframe พาหน้าเราไปที่อื่นเอง
          sandbox='allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox'
          referrerPolicy='strict-origin-when-cross-origin'
        />
      ) : (
        <Box
          component='button'
          type='button'
          onClick={() => setPlaying(true)}
          aria-label={`เล่นคลิปจาก ${ui.label}${item.accountName ? ` บัญชี ${item.accountName}` : ''}`}
          sx={{
            position: 'absolute',
            inset: 0,
            border: 0,
            p: 0,
            cursor: 'pointer',
            background: 'transparent',
            '&:focus-visible': { outline: '2px solid', outlineColor: 'common.white', outlineOffset: -4 },
          }}
        >
          {item.thumbnailUrl && !imgFailed && (
            // eslint-disable-next-line @next/next/no-img-element -- รูปปกจาก storage ของเรา (mirror) หรือ CDN ของแพลตฟอร์ม
            <img
              src={item.thumbnailUrl}
              alt=''
              onError={() => setImgFailed(true)}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            />
          )}
          <Box
            component='span'
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Box
              component='span'
              sx={{
                inlineSize: 64,
                blockSize: 64,
                borderRadius: '999px',
                bgcolor: 'rgb(0 0 0 / .45)',
                color: 'common.white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon icon='lucide:play' width={28} />
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  )
}

export default function ClipLightbox({
  items,
  index,
  onIndexChange,
  onClose,
  shopId,
  isOwnShop,
}: {
  items: ShopVideoItem[]
  index: number
  onIndexChange: (next: number) => void
  onClose: () => void
  shopId: string | null
  isOwnShop?: boolean
}) {
  const router = useRouter()
  const { status: sessionStatus } = useSession()

  const item = items[index]
  if (!item) return null

  const ui = PROVIDER_UI[item.provider as VideoProvider]

  const canChat = Boolean(shopId) && !isOwnShop
  const handleChat = () => {
    if (!shopId) return
    const target = `/messages/${shopId}`
    if (sessionStatus !== 'authenticated') {
      router.push(`/auth/sign-in?callbackUrl=${encodeURIComponent(target)}`)
      return
    }
    router.push(target)
  }

  const stats: { icon: string; label: string; value: number }[] = [
    ...(item.viewCount != null ? [{ icon: 'lucide:play', label: 'ยอดดู', value: item.viewCount }] : []),
    ...(item.likeCount != null ? [{ icon: 'lucide:heart', label: 'ถูกใจ', value: item.likeCount }] : []),
    ...(item.commentCount != null && item.commentCount > 0
      ? [{ icon: 'lucide:message-circle', label: 'ความคิดเห็น', value: item.commentCount }]
      : []),
  ]

  return (
    <ProfileLightbox
      open
      onClose={onClose}
      onPrev={index > 0 ? () => onIndexChange(index - 1) : undefined}
      onNext={index < items.length - 1 ? () => onIndexChange(index + 1) : undefined}
      index={index + 1}
      total={items.length}
      ariaLabel={item.caption ?? `คลิปจาก ${ui.label}`}
      mediaSlot={<ClipMedia key={item.id} item={item} />}
      panelSlot={
        <Box sx={{ display: 'flex', flexDirection: 'column', blockSize: '100%' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
            {ui.logo && (
              <Box component='span' sx={{ inlineSize: 24, blockSize: 24, flex: 'none' }}>
                {/* eslint-disable-next-line @next/next/no-img-element -- โลโก้ static ใน public/ */}
                <img src={ui.logo} alt={ui.label} style={{ width: '100%', height: '100%' }} />
              </Box>
            )}
            <Box sx={{ minInlineSize: 0 }}>
              {item.accountName && (
                <Typography variant='body2' sx={{ fontWeight: 700 }} noWrap>
                  {`@${item.accountName}`}
                </Typography>
              )}
              <Typography variant='caption' color='text.secondary'>
                {ui.label}
              </Typography>
            </Box>
          </Box>

          <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5, flex: 1, minBlockSize: 0 }}>
            {item.caption && <Typography variant='body2'>{item.caption}</Typography>}

            {stats.length > 0 && (
              <Box sx={{ display: 'flex', gap: 2.5, flexWrap: 'wrap' }}>
                {stats.map((s) => (
                  <Box key={s.label} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
                    <Icon icon={s.icon} width={15} />
                    <Typography component='span' variant='body2' sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                      {compactCount(s.value)}
                    </Typography>
                    <Typography component='span' variant='caption' color='text.secondary'>
                      {s.label}
                    </Typography>
                  </Box>
                ))}
                {/* 🛑 ต้องบอกว่าเป็นตัวเลข ณ วันที่ร้านกดเลือก ไม่ใช่ค่าสด — ไม่งั้นผู้ชมที่ไปเทียบ
                    กับแพลตฟอร์มต้นทางแล้วเห็นไม่ตรงจะสรุปว่าเราปั้นตัวเลข ซึ่งแย่กว่าไม่โชว์เลย */}
                <Typography variant='caption' color='text.secondary' sx={{ inlineSize: '100%' }}>
                  ตัวเลขบันทึกไว้ตอนที่ร้านเลือกคลิปนี้ ไม่ใช่ค่าล่าสุด
                </Typography>
              </Box>
            )}
          </Box>

          {canChat && (
            <Box
              sx={{
                position: 'sticky',
                insetBlockEnd: 0,
                p: 2,
                bgcolor: 'background.paper',
                borderTop: '1px solid',
                borderColor: 'divider',
              }}
            >
              <Button fullWidth variant='contained' startIcon={<Icon icon='tabler-message-circle' fontSize={18} />} onClick={handleChat}>
                แชทกับร้าน
              </Button>
            </Box>
          )}
        </Box>
      }
    />
  )
}
