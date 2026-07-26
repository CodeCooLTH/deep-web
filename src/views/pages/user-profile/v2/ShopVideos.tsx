'use client'

/**
 * ShopVideos — แท็บ "ปักหมุด" ของหน้าร้านสาธารณะ (2026-07-26)
 *
 * เป็นแท็บแรกเสมอเมื่อร้านปักคลิปไว้ ตามที่ user กำหนด — คลิปคือสิ่งที่ร้านตั้งใจให้เห็นก่อน
 *
 * เรียงแบบกริดชิดกันไม่มีช่องว่าง สัดส่วน 9:16 ตามมาตรฐานคลิปสั้นของทุกแพลตฟอร์ม
 * (ผู้ชมคุ้นกับผังนี้จากแอปที่ใช้อยู่แล้ว การเว้นช่องว่างจะทำให้อ่านเป็นการ์ดสินค้าแทนที่จะเป็น
 * แผงคลิป)
 *
 * ฝัง iframe จริงตามที่ user เลือก แต่โหลดเมื่อกดเท่านั้น — ถ้าฝังทุกอันตั้งแต่เปิดหน้าจะดึง
 * สคริปต์ของแพลตฟอร์มหลายเมกะไบต์ทันที และแพลตฟอร์มจะเห็นว่าใครเปิดหน้าร้านนี้ทั้งที่ผู้ชม
 * ยังไม่ได้เลือกดูสักอัน แสดงรูปปกก่อนแล้วโหลดเมื่อกดได้ทั้งความเร็วและความเป็นส่วนตัว
 *
 * ยอดไลก์เป็น snapshot ณ เวลาที่ร้านกดเลือก ไม่ใช่ค่าสด (ดู service ว่าทำไม)
 * ยอดวิวยังไม่มีสำหรับ Instagram — ต้องใช้ scope instagram_manage_insights ที่ยังไม่ได้ขอ
 * ช่องนี้จึงถูกซ่อนเมื่อไม่มีค่า ไม่ใช่แสดง 0
 *
 * Base: src/views/pages/user-profile/v2/PublicRoomList.tsx (กริดการ์ด) ปรับเป็นชิดขอบไม่มี gap
 */
import { useState } from 'react'

import { Icon } from '@iconify/react'

import { buildEmbedUrl, type VideoProvider } from '@/lib/shop-video'

export type ShopVideoItem = {
  id: string
  provider: string
  videoId: string
  caption: string | null
  thumbnailUrl: string | null
  accountName: string | null
  likeCount: number | null
  commentCount: number | null
  viewCount: number | null
}

/** ไอคอน + สีแบรนด์ต่อแพลตฟอร์ม — สีแบรนด์เป็น carve-out ที่อนุญาต (Hard Rule 6) */
// ใช้ simple-icons = โลโก้แบรนด์จริง ไม่ใช่ไอคอนเส้นที่วาดเลียนแบบ (user ขอ 2026-07-26)
// ผู้ชมจำโลโก้จริงได้ทันทีโดยไม่ต้องอ่าน ส่วนไอคอนเส้นต้องเพ่งถึงจะรู้ว่าแพลตฟอร์มไหน
const PROVIDER_UI: Record<VideoProvider, { icon: string; color: string; label: string }> = {
  INSTAGRAM: { icon: 'simple-icons:instagram', color: '#E1306C', label: 'Instagram' },
  FACEBOOK: { icon: 'simple-icons:facebook', color: '#1877F2', label: 'Facebook' },
  TIKTOK: { icon: 'simple-icons:tiktok', color: '#010101', label: 'TikTok' },
  YOUTUBE: { icon: 'simple-icons:youtube', color: '#FF0000', label: 'YouTube' },
}

/**
 * แถวที่บันทึกไว้ด้วยโค้ดรุ่นก่อนแก้บั๊ก shortcode จะเก็บ media id (ตัวเลขล้วน) แทน shortcode
 * ของ Instagram ซึ่งประกอบ URL ฝังแล้วเปิดไม่ขึ้น — คัดออกดีกว่าปล่อยให้ผู้ชมกดแล้วเจอหน้าเปล่า
 * โดยไม่มีอะไรอธิบาย (ร้านต้องกดบันทึกใหม่ในหน้าตั้งค่าเพื่อให้ได้ค่าที่ถูก)
 */
function isRenderable(item: ShopVideoItem): boolean {
  if (item.provider === 'INSTAGRAM') return !/^[0-9]+$/.test(item.videoId)
  return true
}

/** ย่อเลขให้อ่านง่ายบนพื้นที่แคบ — 12,300 → 12.3K */
function compact(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`
  return `${(n / 1_000_000).toFixed(1)}M`
}

function VideoCell({ item }: { item: ShopVideoItem }) {
  const [playing, setPlaying] = useState(false)
  const [imgFailed, setImgFailed] = useState(false)

  const provider = item.provider as VideoProvider
  const ui = PROVIDER_UI[provider]
  const parsed = { provider, videoId: item.videoId }

  if (playing) {
    return (
      <div className='relative aspect-[9/16] bg-black'>
        <iframe
          src={buildEmbedUrl(parsed)}
          title={item.caption ?? `คลิปจาก ${ui.label}`}
          className='absolute inset-0 is-full bs-full'
          style={{ border: 0 }}
          allow='accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture'
          allowFullScreen
          // sandbox แน่นที่สุดเท่าที่ยังเล่นได้ — ไม่ให้ iframe พาหน้าเราไปที่อื่นเอง
          sandbox='allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox'
          referrerPolicy='strict-origin-when-cross-origin'
        />
      </div>
    )
  }

  return (
    <button
      type='button'
      onClick={() => setPlaying(true)}
      aria-label={`เล่นคลิปจาก ${ui.label}${item.accountName ? ` บัญชี ${item.accountName}` : ''}`}
      className='relative aspect-[9/16] bg-[var(--mui-palette-action-hover)] overflow-hidden border-0 p-0 cursor-pointer block is-full'
    >
      {item.thumbnailUrl && !imgFailed && (
        // eslint-disable-next-line @next/next/no-img-element -- รูปปกจาก CDN ของแพลตฟอร์ม
        <img
          src={item.thumbnailUrl}
          alt=''
          className='absolute inset-0 is-full bs-full object-cover'
          onError={() => setImgFailed(true)}
          loading='lazy'
        />
      )}

      {/* ไล่เงาล่าง — ให้ตัวหนังสือขาวอ่านออกไม่ว่ารูปปกจะสว่างแค่ไหน */}
      <span
        className='absolute inset-0'
        style={{ background: 'linear-gradient(180deg,rgb(0 0 0/.28) 0%,transparent 32%,transparent 52%,rgb(0 0 0/.72) 100%)' }}
      />

      {/* ไอคอนแพลตฟอร์ม มุมบน — บอกทันทีว่าคลิปมาจากที่ไหน */}
      <span
        className='absolute top-2 inline-end-2 is-6 bs-6 rounded-full flex items-center justify-center text-white'
        style={{ background: ui.color }}
        title={ui.label}
      >
        <Icon icon={ui.icon} width={13} />
      </span>

      <span className='absolute inset-block-start-0 flex items-center justify-center is-full bs-full pointer-events-none'>
        <span className='is-11 bs-11 rounded-full bg-black/45 text-white flex items-center justify-center'>
          <Icon icon='lucide:play' width={20} />
        </span>
      </span>

      {/* ชื่อบัญชี + ยอด — ซ่อนช่องที่ไม่มีค่า ไม่แสดงศูนย์ */}
      <span className='absolute bottom-0 inline-start-0 inline-end-0 p-2 text-white text-start'>
        {item.accountName && (
          <span className='block text-[11px] font-semibold truncate'>{`@${item.accountName}`}</span>
        )}
        <span className='flex items-center gap-2.5 text-[11px] mbs-0.5'>
          {item.viewCount != null && (
            <span className='flex items-center gap-1'>
              <Icon icon='lucide:play' width={11} />
              {compact(item.viewCount)}
            </span>
          )}
          {item.likeCount != null && (
            <span className='flex items-center gap-1'>
              <Icon icon='lucide:heart' width={11} />
              {compact(item.likeCount)}
            </span>
          )}
          {item.commentCount != null && item.commentCount > 0 && (
            <span className='flex items-center gap-1'>
              <Icon icon='lucide:message-circle' width={11} />
              {compact(item.commentCount)}
            </span>
          )}
        </span>
      </span>
    </button>
  )
}

export default function ShopVideos({ items: raw }: { items: ShopVideoItem[] }) {
  const items = raw.filter(isRenderable)
  if (items.length === 0) return null

  // เหลือแค่กริดรูปล้วน (user 2026-07-26) — ตัดคำอธิบายใต้กริดกับลิงก์ "ดูบน..." ออก
  // ทั้งสองอันเป็นข้อความรอบ ๆ ที่แย่งความสนใจจากตัวคลิป และข้อมูลที่จำเป็นจริง (แพลตฟอร์ม
  // ชื่อบัญชี ยอดวิว/ไลก์) อยู่บนรูปแต่ละใบอยู่แล้ว ส่วนทางไปดูบนแพลตฟอร์มมีในตัวคลิปที่ฝัง
  return (
    <div>
      {/* กริดชิดกันไม่มีช่องว่าง — ผังเดียวกับที่ผู้ชมคุ้นจากแอปคลิปสั้น
          -mli ดึงออกนอก padding ของ tab panel ให้ชนขอบจอจริง
          มือถือ 3 ต่อแถวเท่าแอปคลิปสั้นทั่วไป เดสก์ท็อป 5 ต่อแถว (user กำหนด 2026-07-26) */}
      <div className='grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-0 -mli-5'>
        {items.map((v) => (
          <VideoCell key={v.id} item={v} />
        ))}
      </div>
    </div>
  )
}
