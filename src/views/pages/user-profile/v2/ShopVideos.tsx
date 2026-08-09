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

/**
 * โลโก้แบรนด์ต่อแพลตฟอร์ม — ไฟล์ชุดเดียวกับที่หน้าแชทใช้ (public/images/logos/)
 *
 * user ทัก 2026-07-26 ว่าไอคอนในระบบเป็นคนละชุดกัน เดิมที่นี่วาดวงกลมสีแบรนด์แล้ววาง glyph
 * สีขาวทับ ซึ่งไม่ใช่โลโก้จริง — IG ที่เป็นวงกลมไล่สีกลายเป็นวงชมพูทึบ ตอนนี้ใช้ไฟล์โลโก้จริง
 * ที่มีทั้งสีและรูปทรงในตัว จึงไม่ต้องมีพื้นวงกลมรองอีกชั้น (แนวเดียวกับ ChannelBadgeOverlay)
 *
 * brand asset เป็น carve-out ของ Hard Rule 6
 * TikTok/YouTube ยังไม่มีไฟล์ในโปรเจกต์ (ยังเชื่อมบัญชีไม่ได้) — เผื่อ label ไว้ก่อน
 */
const PROVIDER_UI: Record<VideoProvider, { logo: string | null; label: string }> = {
  INSTAGRAM: { logo: '/images/logos/instagram-circle.svg', label: 'Instagram' },
  FACEBOOK: { logo: '/images/logos/facebook.svg', label: 'Facebook' },
  TIKTOK: { logo: null, label: 'TikTok' },
  YOUTUBE: { logo: null, label: 'YouTube' },
}

/**
 * TILE_SCRIM — SSOT ในโค้ดของ token **Photo Scrim** (DESIGN.md §Colors → Neutral + Named Rules,
 * `.impeccable/design.json` colors.scrim) ไล่เงาทับรูปถ่ายของผู้ใช้ ให้ตัวหนังสือขาวที่ลอยบนรูป
 * (ชื่อบัญชี/ยอดวิว/ราคา) อ่านออกไม่ว่ารูปจะสว่างแค่ไหน
 *
 * ดำสนิทถูกต้องแล้วตรงนี้ ไม่ใช่การละเมิดกฎ "ห้าม #000" — ดู The Photo-Scrim Exception:
 * scrim ตกบนเนื้อหาของผู้ใช้ ผสมหมึกพลัมเข้าไปคือการเปลี่ยนสีรูปของร้าน
 *
 * ค่าเดียวกับที่การ์ดสินค้าใน `../profile/index.tsx` ใช้ — สองที่นี้ทำหน้าที่เดียวกัน 100%
 * แต่เคยตั้งค่าต่างกันเล็กน้อย (.26/30%/55% กับ .28/32%/52%) โดยไม่มีเหตุผล ต่างน้อยจนตาไม่เห็น
 * ทีละจุด แต่มันคือสิ่งที่ทำให้หน้าอ่านว่า "ประกอบขึ้นมา" มากกว่า "ออกแบบมา" (DESIGN.md §Typography
 * เขียนบทเรียนเดียวกันนี้ไว้กับเรื่องขนาดตัวอักษร 14.5 vs 12.5)
 */
export const TILE_SCRIM =
  'linear-gradient(180deg,rgb(0 0 0/.28) 0%,transparent 32%,transparent 52%,rgb(0 0 0/.72) 100%)'

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
      // 🛑 ต้องมีทางกลับ — เดิม `setPlaying(true)` มีที่เดียวและไม่มีที่ไหนคืนเป็น false เลย
      // กดเล่นคลิปแล้วไทล์นั้นกลายเป็น iframe ของบุคคลที่สามถาวร ต้องรีเฟรชทั้งหน้าถึงจะกลับ
      // อาการหนักบนมือถือ: ไทล์ชิดกันไม่มีช่องว่างกันพลาด แตะพลาดแล้วออกไม่ได้
      <div className='relative aspect-[9/16] bg-black'>
        <button
          type='button'
          onClick={() => setPlaying(false)}
          aria-label='ปิดคลิป'
          // z สูงกว่า iframe + พื้นทึบดำโปร่ง ให้เห็นบนคลิปทุกสี · 32px กดโดนบนมือถือ
          className='absolute top-2 inline-end-2 z-10 is-8 bs-8 rounded-full bg-black/55 text-white flex items-center justify-center border-0 p-0 cursor-pointer'
        >
          <Icon icon='lucide:x' width={16} />
        </button>
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
      className='group relative aspect-[9/16] bg-[var(--mui-palette-action-hover)] overflow-hidden border-0 p-0 cursor-pointer block is-full font-[inherit]'
    >
      {item.thumbnailUrl && !imgFailed && (
        // eslint-disable-next-line @next/next/no-img-element -- รูปปกจาก storage ของเรา (mirror) หรือ CDN ของแพลตฟอร์ม
        <img
          src={item.thumbnailUrl}
          alt=''
          // ขยายเล็กน้อยตอนชี้ — บอกว่าไทล์ทั้งใบกดได้ โดยไม่ต้องเพิ่มกรอบ/เงาเข้ามาในกริดที่
          // ตั้งใจให้ชิดกันเป็นผืนเดียว (Tailwind 4 ห่อ hover: ด้วย @media (hover:hover) ให้เอง
          // จอสัมผัสจึงไม่ค้างสถานะหลังแตะ)
          className='absolute inset-0 is-full bs-full object-cover transition-transform duration-300 ease-out group-hover:scale-105'
          onError={() => setImgFailed(true)}
          loading='lazy'
          decoding='async'
        />
      )}

      {/* ไล่เงาล่าง — render เสมอโดยตั้งใจ ไม่ผูกกับ "มีรูปไหม"
          ux gate เสนอให้ตัดทิ้งเมื่อไม่มีรูป โดยมองว่าเป็นของตกแต่งที่ไม่ได้ทำงาน แต่ตรวจแล้ว
          ไม่ใช่: แถบชื่อบัญชี/ยอดวิวด้านล่างเป็น "ตัวหนังสือสีขาว" ที่ render ตลอด ไม่ว่ารูปจะขึ้น
          หรือไม่ — ถอดไล่เงาออกเมื่อรูปพัง = ตัวขาวบนพื้นเทาจาง อ่านไม่ออกทั้งแถบ */}
      <span className='absolute inset-0' style={{ background: TILE_SCRIM }} />

      {/* โลโก้แพลตฟอร์ม มุมบน — บอกทันทีว่าคลิปมาจากที่ไหน */}
      {ui.logo && (
        <span className='absolute top-2 inline-end-2 is-5 bs-5 rounded-full overflow-hidden' title={ui.label}>
          {/* eslint-disable-next-line @next/next/no-img-element -- โลโก้ static ใน public/ */}
          <img src={ui.logo} alt={ui.label} className='is-full bs-full' />
        </span>
      )}

      {/* inset-0 ไม่ใช่ inset-block-start-0 — ตัวหลังไม่ได้ให้ CSS อะไรเลยในโปรเจกต์นี้ (วัดแล้วได้
          top: auto → ตกไปใช้ตำแหน่ง static คือใต้รูปปก) ปุ่มเล่นเลยไปอยู่ล่างคลิปแล้วโดน
          overflow-hidden ตัดครึ่ง แทนที่จะอยู่กลาง */}
      <span className='absolute inset-0 flex items-center justify-center pointer-events-none'>
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

  // 🛑 คอลัมน์คงที่ 3/4/5 + จัดกลาง "เฉพาะแถวสุดท้าย" (ผลของ justify-center บน flex-wrap:
  // แถวที่เต็มกินความกว้าง 100% พอดีอยู่แล้ว การจัดกลางจึงไม่มีผล เหลือผลเฉพาะแถวที่ไม่เต็ม)
  //
  // ปัญหาที่แก้: MAX_SHOP_VIDEOS = 6 ขณะที่กริดเดิมตรึง 5 คอลัมน์ → ร้านที่ปักครบโควตาได้
  // แถวล่างเหลือคลิปโดดใบเดียวชิดซ้ายกับที่ว่าง 4 ช่อง อ่านเป็น "หน้าโหลดไม่ครบ" — และเกิดกับ
  // ทุกร้านที่ใช้ฟีเจอร์นี้เต็มโควตา ไม่ใช่เคสหายาก
  //
  // ทำไมไม่ผูกจำนวนคอลัมน์กับจำนวนคลิป (ท่าที่ลองก่อนหน้านี้): มันแก้ได้เฉพาะเดสก์ท็อป —
  // มือถือตรึง 3 คอลัมน์ตามที่ user กำหนด ร้านที่ปัก 4-5 ใบก็ยังได้แถวโดดอยู่ดี บน surface หลัก
  // ของ product เสียด้วย และไทล์จะมีขนาดไม่เท่ากันระหว่างร้าน (ปัก 3 ใบได้ไทล์ 200px · ปัก 6 ใบ
  // ได้ 153px) ซึ่งสวนทางกับเหตุผลที่ยกมาใช้เอง ท่านี้แก้ทั้งสอง breakpoint ด้วยกลไกเดียว
  // และไทล์กว้างเท่ากันทุกร้านทุกจำนวน = เทียบร้านกันได้จริง
  //
  // 3/4/5 ตรงกับกริดสินค้าใน ../profile/index.tsx ทุก breakpoint (sm=600 md=900 ตาม marketing.css)
  // — สองแผงนี้เขียนคอมเมนต์ว่า "ผังเดียวกัน" มาตลอดโดยไม่เคยตรงกันจริงสักช่วง
  return (
    <div>
      {/* ชิดกันไม่มีช่องว่าง — ผังที่ผู้ชมคุ้นจากแอปคลิปสั้น
          -mli-5 ดึงออกนอก padding ของ tab panel ให้ชนขอบจอจริง */}
      <div className='flex flex-wrap justify-center -mli-5'>
        {items.map((v) => (
          <div key={v.id} className='basis-1/3 sm:basis-1/4 md:basis-1/5'>
            <VideoCell item={v} />
          </div>
        ))}
      </div>
    </div>
  )
}
