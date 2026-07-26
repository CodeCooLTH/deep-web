'use client'

/**
 * ShopVideos — คลิปที่ร้านเลือกโชว์บนหน้าร้านสาธารณะ (2026-07-26)
 *
 * ฝัง iframe ตามที่ user เลือก แต่ **โหลดเมื่อกดเท่านั้น** ไม่ใช่โหลดทุกอันตั้งแต่เปิดหน้า
 * เหตุผล: หน้านี้เพิ่งถูกจูนให้เบาและมีหน้าที่สร้างความน่าเชื่อถือ ถ้าฝัง iframe หกอันพร้อมกัน
 * จะดึงสคริปต์ของแพลตฟอร์มมาหลายเมกะไบต์ตั้งแต่วินาทีแรก และแพลตฟอร์มจะเห็นทันทีว่าใคร
 * เปิดหน้าร้านนี้ทั้งที่ผู้ชมยังไม่ได้เลือกดูคลิปสักอัน — แสดงรูปปกก่อนแล้วค่อยโหลดเมื่อกด
 * ได้ทั้งความเร็วและความเป็นส่วนตัว โดยยังเป็นการฝังจริงตามที่ต้องการ
 *
 * URL ที่ใช้ฝังประกอบขึ้นใหม่จากรหัสคลิปเสมอ (buildEmbedUrl) ไม่ใช้ค่าที่ผู้ใช้กำหนด
 *
 * Base: src/views/pages/user-profile/v2/PublicRoomList.tsx (grid การ์ด 2 คอลัมน์)
 */
import { useState } from 'react'

import Typography from '@mui/material/Typography'

import { Icon } from '@iconify/react'

import { buildEmbedUrl, buildWatchUrl, VIDEO_PROVIDER_LABEL, type VideoProvider } from '@/lib/shop-video'

export type ShopVideoItem = {
  id: string
  provider: string
  videoId: string
  caption: string | null
  thumbnailUrl: string | null
}

function VideoCard({ item }: { item: ShopVideoItem }) {
  const [playing, setPlaying] = useState(false)
  const [imgFailed, setImgFailed] = useState(false)

  const parsed = { provider: item.provider as VideoProvider, videoId: item.videoId }
  const embedUrl = buildEmbedUrl(parsed)
  const watchUrl = buildWatchUrl(parsed)

  return (
    <div className='rounded-xl overflow-hidden border'>
      <div className='relative bs-[240px] bg-[var(--mui-palette-action-hover)]'>
        {playing ? (
          <iframe
            src={embedUrl}
            title={item.caption ?? 'คลิปจากร้าน'}
            className='is-full bs-full'
            style={{ border: 0 }}
            allow='accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture'
            allowFullScreen
            // sandbox แน่นที่สุดเท่าที่ยังเล่นได้ — ไม่ให้ iframe พาหน้าเราไปที่อื่นเอง
            sandbox='allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox'
            referrerPolicy='strict-origin-when-cross-origin'
            loading='lazy'
          />
        ) : (
          <button
            type='button'
            onClick={() => setPlaying(true)}
            className='is-full bs-full relative flex items-center justify-center cursor-pointer bg-transparent border-0 p-0'
            aria-label={`เล่นคลิป${item.caption ? ` ${item.caption}` : ''}`}
          >
            {item.thumbnailUrl && !imgFailed ? (
              // eslint-disable-next-line @next/next/no-img-element -- รูปปกจาก CDN ของแพลตฟอร์ม
              <img
                src={item.thumbnailUrl}
                alt=''
                className='absolute inset-0 is-full bs-full object-cover'
                onError={() => setImgFailed(true)}
                loading='lazy'
              />
            ) : null}
            <span className='relative is-14 bs-14 rounded-full bg-black/55 text-white flex items-center justify-center'>
              <Icon icon='lucide:play' width={26} />
            </span>
          </button>
        )}
      </div>

      <div className='p-3'>
        {item.caption && (
          <Typography variant='body2' className='line-clamp-2'>
            {item.caption}
          </Typography>
        )}
        <a
          href={watchUrl}
          target='_blank'
          rel='noopener noreferrer'
          className='text-[12.5px] font-semibold text-primary no-underline flex items-center gap-1 mbs-1.5'
        >
          {`ดูบน ${VIDEO_PROVIDER_LABEL[parsed.provider]}`}
          <Icon icon='lucide:external-link' width={12} />
        </a>
      </div>
    </div>
  )
}

export default function ShopVideos({ items }: { items: ShopVideoItem[] }) {
  if (items.length === 0) return null

  return (
    <div>
      <Typography className='font-semibold mbe-1'>คลิปจากร้าน</Typography>
      <Typography variant='caption' color='text.disabled' className='block mbe-3'>
        คลิปเหล่านี้มาจากบัญชีที่ร้านยืนยันความเป็นเจ้าของแล้ว
      </Typography>
      <div className='grid grid-cols-2 gap-4'>
        {items.map((v) => (
          <VideoCard key={v.id} item={v} />
        ))}
      </div>
    </div>
  )
}
