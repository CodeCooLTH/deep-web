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
import { useEffect, useState } from 'react'

import { Icon } from '@iconify/react'

import { type VideoProvider } from '@/lib/shop-video'

import ClipLightbox from './ClipLightbox'
import { useLightboxDeepLink } from './useLightboxDeepLink'

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
export const PROVIDER_UI: Record<VideoProvider, { logo: string | null; label: string }> = {
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
export function compactCount(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`
  return `${(n / 1_000_000).toFixed(1)}M`
}

const compact = compactCount

/**
 * ไทล์คลิปในกริด
 *
 * 🛑 กดแล้ว **เปิด lightbox** ไม่ใช่แทนที่ไทล์นั้นด้วย iframe เหมือนเดิม — ท่าเดิมทำให้คลิป
 * เล่นอยู่ในกรอบ 3:4 ขนาดเท่าไทล์ (ราว 240px บนเดสก์ท็อป) ซึ่งเล็กเกินกว่าจะดูรู้เรื่อง
 * และ iframe ที่โผล่กลางกริดทำให้ผังกระตุก · การ gate ก่อนโหลด iframe ไม่ได้หายไปไหน
 * มันย้ายเข้าไปอยู่ใน lightbox (`ClipLightbox`) ซึ่งยังต้องกดอีกทีถึงจะโหลด
 */
function VideoCell({ item, onOpen }: { item: ShopVideoItem; onOpen: () => void }) {
  const [imgFailed, setImgFailed] = useState(false)

  const provider = item.provider as VideoProvider
  const ui = PROVIDER_UI[provider]

  return (
    <button
      type='button'
      onClick={onOpen}
      aria-label={`เปิดคลิปจาก ${ui.label}${item.accountName ? ` บัญชี ${item.accountName}` : ''}`}
      // 3:4 ไม่ใช่ 9:16 — วัดจากไทล์จริงที่ user แคปมาจาก IG (233×310 ≈ 0.75)
      // IG ครอปไทล์ในกริดเป็น 3:4 แม้แต่ reels ที่ต้นฉบับเป็น 9:16
      // ⚠️ ตอนกดเล่น คลิปแนวตั้งจะมีแถบดำบน-ล่างในกรอบ 3:4 — แลกกับกริดที่ไม่กระโดด
      className='group relative aspect-[3/4] bg-[var(--mui-palette-action-hover)] overflow-hidden border-0 p-0 cursor-pointer block is-full font-[inherit]'
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

export default function ShopVideos({
  items: raw,
  shopId = null,
  isOwnShop,
  /** id ของคลิปที่ deep link สั่งให้เปิด (`?clip=`) — ไม่มี/ไม่รู้จัก = ไม่เปิดอะไร */
  initialClipId,
  onDeepLinkResolved,
}: {
  items: ShopVideoItem[]
  shopId?: string | null
  isOwnShop?: boolean
  initialClipId?: string | null
  /** แจ้งผู้เรียกว่า id ที่ส่งมาใช้ได้จริงไหม — ใช้ไม่ได้ต้องถอดพารามิเตอร์ทิ้งเงียบ ๆ */
  onDeepLinkResolved?: (ok: boolean) => void
}) {
  const items = raw.filter(isRenderable)

  const writeParam = useLightboxDeepLink('clip')
  /* lazy initializer ไม่ใช่ useEffect — useEffect จะมีหนึ่งเฟรมที่ lightbox ยังไม่เปิด
     ผู้ใช้ที่กดลิงก์มาจะเห็นหน้าร้านกระพริบก่อนแล้วโมดัลค่อยเด้งทับ */
  const [openIndex, setOpenIndex] = useState<number | null>(() => {
    if (!initialClipId) return null
    const i = items.findIndex((v) => v.id === initialClipId)
    return i >= 0 ? i : null
  })

  useEffect(() => {
    if (!initialClipId) return
    onDeepLinkResolved?.(items.some((v) => v.id === initialClipId))
    // ตั้งใจให้รันครั้งเดียวตอน mount — deep link เป็นค่าตั้งต้น ไม่ใช่ค่าที่ sync ตลอดเวลา
    // (ผู้ใช้กด ‹ › ต่อไปเองแล้ว URL จะไม่ตรงกับ initialClipId อีก ซึ่งถูกต้อง)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const open = (i: number) => {
    setOpenIndex(i)
    // push ตอนเปิดครั้งแรก → ปุ่ม back ปิด lightbox
    writeParam(items[i].id, 'push')
  }
  const move = (i: number) => {
    setOpenIndex(i)
    // replace ตอนเลื่อนใบ → ไม่ว่าจะดูกี่ใบก็กด back ครั้งเดียวออก
    writeParam(items[i].id, 'replace')
  }
  const close = () => {
    setOpenIndex(null)
    writeParam(null, 'replace')
  }

  if (items.length === 0) return null

  // เหลือแค่กริดรูปล้วน (user 2026-07-26) — ตัดคำอธิบายใต้กริดกับลิงก์ "ดูบน..." ออก
  // ทั้งสองอันเป็นข้อความรอบ ๆ ที่แย่งความสนใจจากตัวคลิป และข้อมูลที่จำเป็นจริง (แพลตฟอร์ม
  // ชื่อบัญชี ยอดวิว/ไลก์) อยู่บนรูปแต่ละใบอยู่แล้ว ส่วนทางไปดูบนแพลตฟอร์มมีในตัวคลิปที่ฝัง

  // 🛑 ชิดซ้ายเสมอ ไม่จัดกลาง (user 2026-08-10: "ทำไมมัน center มันต้อง left")
  // เคยใช้ justify-center เพื่อให้แถวสุดท้ายที่ไม่เต็มดูไม่โหว่ แต่ผลคือทั้งกริดขยับตามจำนวนคลิป
  // ซึ่งอ่านเป็นของที่ "ลอย" ไม่ใช่ผังคงที่ — ฟีดคลิปทุกแอปที่ผู้ชมคุ้น (IG/TikTok) ชิดซ้ายหมด
  // แถวสุดท้ายไม่เต็มเป็นเรื่องปกติของฟีด ไม่ใช่ข้อบกพร่องที่ต้องแก้ด้วยการจัดกลาง
  //
  // 🛑 3 คอลัมน์เป็นของ "มือถือ" เท่านั้น ไม่ใช่ทุกจอ (user 2026-08-10: "grid ใหญ่ไปป่าว")
  // IG ใช้ 3 คอลัมน์บนคอนเทนเนอร์ ~935px ได้เพราะไทล์เป็น 1:1 แต่ของเราเป็น **9:16**
  // 960/3 = 317px กว้าง → สูง 563px ต่อไทล์ = คลิปเดียวกินเกือบเต็มจอเดสก์ท็อป
  // สัดส่วนไทล์คือสิ่งที่ทำให้ลอกจำนวนคอลัมน์ของ IG มาตรง ๆ ไม่ได้ ต้องคิดจากความสูงที่ได้จริง
  // ช่องไฟ 4px + ชิดซ้าย ยังคงไว้ตามที่ user ขอ
  return (
    /* ขนาดไทล์อ้างอิง Instagram ที่ user วัดมาเอง 2026-08-11: **242×322px, 6 ใบต่อแถว**
       ในคอนเทนเนอร์ ~1480px (เรา inspect เองได้ 304×405 = ใหญ่เกิน)

       - มือถือ 3 คอลัมน์ (ไม่แตะ user บอกว่าโอเคแล้ว)
       - md (900px+) 4 คอลัมน์ → ที่คอนเทนเนอร์ 960px ได้ไทล์ ~236px ใกล้ 242 ของ IG
       - xl (1536px+) 6 คอลัมน์ + ถ่างออกนอกคอนเทนเนอร์ 260px ต่อข้าง → กริดกว้าง 1480px
         ได้ไทล์ ~242px เท่า IG พอดี

       🛑 IG ถ่างเฉพาะ "กริด" ไม่ได้ถ่ายทั้งหน้า — หัวโปรไฟล์ของเขายังแคบกว่ากริดชัดเจน
       เราจึงถ่างที่กริดด้วย negative margin ไม่ใช่ขยาย max-is ของคอนเทนเนอร์
       (ขยายคอนเทนเนอร์จะลาก bio/แถบตัวเลข/แถวเพจ ไปกว้าง 1480 ด้วย ซึ่งอ่านยากและไม่เหมือน IG)

       ตัวเลข -260px ผูกกับ max-is-[960px] ของ ShopProfile.tsx: (1480-960)/2 = 260
       **ถ้าวันไหนเปลี่ยนความกว้างคอนเทนเนอร์ ต้องมาแก้ตัวเลขนี้ด้วย** ไม่งั้นกริดจะล้นจอ

       🛑 -mx-5 = หัก `pli-5` (20px) ของ tab panel ให้ไทล์ชนขอบคอนเทนเนอร์จริง
       (Tailwind v4 map `mx` เป็น `margin-inline` อยู่แล้ว จึงยังเป็น logical property
        เลือก core utility แทน `-mli-5` ของปลั๊กอินเพราะไม่ต้องพึ่งพฤติกรรมของปลั๊กอิน

        📌 ผมเคยเขียนตรงนี้ว่า `-mli-5` "ไม่ถูกเจนเป็น CSS เลย" — **ผิด** ตรวจ CSS ที่ build ออกมา
        จริงแล้วเจน `.-mli-5{margin-inline:calc(calc(var(--spacing)*5)*-1)!important}` ปกติ
        (Tailwind v4 จัดการค่าติดลบให้เองโดยไม่ต้องมี supportsNegative เหมือน v3) ใช้ได้ทั้งคู่ —
        บันทึกไว้เพราะข้ออ้างว่า "คลาสนี้ใช้ไม่ได้" คือเหตุผลที่คนถัดไปจะไม่ลองใช้มันอีกเลย)
       user ทัก 2026-08-11: "เวลาอยู่บน mobile เราไม่ชิดขอบแบบ IG มันเหลือพื้นที่ตรงรูปเยอะ เสียดาย"

       ที่น่าสนใจคือ **คอมเมนต์ในไฟล์นี้กับ profile/index.tsx อ้างมาตลอดว่าทำ full-bleed แล้ว**
       (profile/index.tsx เขียนตรงตัวว่า "-20px = หัก pli-5 ของ tab panel ... ค่าเดียวกับ -mli-5
       ที่กริดคลิปใช้") แต่ **ไม่มีไฟล์ไหนใส่ negative margin จริงสักไฟล์** — คอมเมนต์อ้างอิงกันเอง
       ไปมาจนอ่านเหมือนมีของอยู่แล้ว ไม่มี gate ไหนตรวจว่าคอมเมนต์ตรงกับโค้ดไหม (HR16 ทิศกลับ) */
    <>
      <div className='grid grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-1 -mx-5 sm:mx-0 xl:-mx-[260px]'>
        {items.map((v, i) => (
          <VideoCell key={v.id} item={v} onOpen={() => open(i)} />
        ))}
      </div>

      {openIndex != null && (
        <ClipLightbox
          items={items}
          index={openIndex}
          onIndexChange={move}
          onClose={close}
          shopId={shopId}
          isOwnShop={isOwnShop}
        />
      )}
    </>
  )
}
