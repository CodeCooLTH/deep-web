'use client'

/**
 * PageBlocksSection — บล็อกที่ผู้ขายจัดวางไว้เหนือแถบแท็บของหน้าร้านสาธารณะ
 * (feature 00035, SRS TFR-005) render ตามลำดับ sortOrder ที่ listShopPageBlocks คืนมาแล้ว
 * — component นี้ไม่จัดเรียงเอง แค่ map ตาม array ที่ได้รับ
 *
 * ทนต่อข้อมูลหาย: listShopPageBlocks ตัดบล็อกที่ไม่เหลือเนื้อหา (เหรียญถูกถอดจนหมด/โพสต์ต้นทาง
 * ถูกลบ) ออกให้แล้วตั้งแต่ชั้น service — ที่นี่กันซ้ำอีกชั้นด้วย early-return ไม่ render กล่องเปล่า
 * ถ้า array ทั้งชุดว่าง (ร้านที่ไม่เคยจัดหน้าเลย หรือจัดแล้วแต่ของหายหมดพอดี)
 *
 * Base: ./ProfileHero.tsx (ชิปเหรียญ + ProfileImg fallback pattern สำหรับรูปที่โหลดพังได้)
 *   + ./OfficialChannels.tsx (แถวลิงก์นอกเปิดแท็บใหม่ rel noopener noreferrer)
 *   + ./PublicRoomList.tsx (การ์ด — ทั้งคู่ใช้ MUI Card variant='outlined' radius 8px ตั้งแต่ 2026-08-10)
 */
import { useState } from 'react'

import Card from '@mui/material/Card'
import Typography from '@mui/material/Typography'

import { Icon } from '@iconify/react'

import { badgeIconName } from '@/lib/badge-icons'

export type PageBlockBadge = {
  id: string
  name: string
  nameEN: string
  icon: string | null
  imageUrl: string | null
}

export type PageBlockPost = {
  id: string
  message: string | null
  /** resolve แล้วจากชั้น service (mirroredFileId ? getFileUrl(...) : thumbnailUrl) — ห้ามคิด fallback ใหม่ที่นี่ */
  imageUrl: string | null
  mediaType: string | null
  reactionCount: number | null
  fbCommentCount: number | null
  shareCount: number | null
  permalink: string | null
}

export type PageBlockItem =
  | { id: string; type: 'BADGE_HIGHLIGHT'; sortOrder: number; badges: PageBlockBadge[] }
  | { id: string; type: 'FACEBOOK_POST'; sortOrder: number; post: PageBlockPost }

/** จำนวนเหรียญสูงสุดต่อบล็อก — ตรงกับเพดานที่ builder บังคับไว้ (Valibot maxLength + DB CHECK) */
const MAX_BLOCK_BADGES = 4

function BlockImg({ src, alt, className }: { src: string | null; alt: string; className: string }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) return null
  // eslint-disable-next-line @next/next/no-img-element -- รูปจาก storage/CDN ของ Meta หลากโดเมน (เดียวกับ ProfileHero)
  return <img src={src} alt={alt} className={className} onError={() => setFailed(true)} />
}

/** ย่อเลขให้อ่านง่ายบนพื้นที่แคบ — 12,300 → 12.3K (ยกมาจาก ShopVideos.tsx compact()) */
function compactCount(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`
  return `${(n / 1_000_000).toFixed(1)}M`
}

function BadgeHighlightBlock({ badges, blockKey }: { badges: PageBlockBadge[]; blockKey: string }) {
  if (badges.length === 0) return null
  return (
    // data-block-key: จุดเกาะให้ BuilderPreviewBridge วัด getBoundingClientRect() ตอนอยู่ในโหมด builder draft
    // (feature 00035, SDS §4.1) — ไม่มีผลกับการแสดงผลปกติ
    <ul
      data-block-key={blockKey}
      className='flex justify-center gap-2 flex-wrap pli-5 plb-3.5 m-0 p-0 list-none border-be'
    >
      {badges.slice(0, MAX_BLOCK_BADGES).map((b) => (
        <li key={b.id}>
          <span className='inline-flex items-center gap-1.5 rounded-full plb-1 pli-2.5 text-[13px] font-medium bg-[var(--mui-palette-action-hover)] text-[var(--mui-palette-text-primary)]'>
            <Icon icon={badgeIconName(b.nameEN, b.icon)} width={15} className='shrink-0 opacity-70' />
            {b.name}
          </span>
        </li>
      ))}
    </ul>
  )
}

function FacebookPostBlock({ post, blockKey }: { post: PageBlockPost; blockKey: string }) {
  // ยอดที่เป็น 0 ไม่ได้บอกอะไร (โพสต์ใหม่/ไม่มีปฏิสัมพันธ์) — ซ่อนเหมือน ShopVideos ไม่แสดงศูนย์
  const stats = (
    [
      post.reactionCount != null && post.reactionCount > 0
        ? { key: 'reaction', icon: 'lucide:thumbs-up', value: post.reactionCount }
        : null,
      post.fbCommentCount != null && post.fbCommentCount > 0
        ? { key: 'comment', icon: 'lucide:message-circle', value: post.fbCommentCount }
        : null,
      post.shareCount != null && post.shareCount > 0
        ? { key: 'share', icon: 'lucide:share-2', value: post.shareCount }
        : null,
    ] as const
  ).filter((s): s is { key: string; icon: string; value: number } => s !== null)

  // ไม่มีทั้งรูป ข้อความ และยอดนับ — ไม่เหลืออะไรให้ดูจริง ๆ (edge case ที่ service ไม่ได้กรองไว้)
  if (!post.imageUrl && !post.message && stats.length === 0) return null

  const inner = (
    <>
      {post.imageUrl && (
        <div className='relative aspect-video bg-[var(--mui-palette-action-hover)] overflow-hidden'>
          <BlockImg src={post.imageUrl} alt='' className='absolute inset-0 is-full bs-full object-cover' />
        </div>
      )}
      <div className='p-4 flex flex-col gap-2'>
        {post.message && (
          <Typography variant='body2' color='text.primary' className='line-clamp-3'>
            {post.message}
          </Typography>
        )}
        {stats.length > 0 && (
          <div className='flex items-center gap-3'>
            {stats.map((s) => (
              <Typography
                key={s.key}
                component='span'
                variant='caption'
                color='text.disabled'
                className='flex items-center gap-1'
              >
                <Icon icon={s.icon} width={13} />
                {compactCount(s.value)}
              </Typography>
            ))}
          </div>
        )}
      </div>
    </>
  )

  // rounded 8px = ขั้น "การ์ดและแผง" ของ shape ramp ฝั่ง buyer (DESIGN.md §Shapes)
  // เดิม rounded-xl (12px) ไม่อยู่บน ramp เลย (4/6/8/10/full) — ค่านี้ถูกก็อปต่อ ๆ กันมาในโฟลเดอร์ v2/
  // จึง "สม่ำเสมอกันเอง" แต่ไม่ตรงระบบ ซึ่งจับได้ยากกว่าค่าที่หลุดเดี่ยว ๆ
  //
  /* ใช้ MUI `Card variant='outlined'` แทน `<div className='rounded-lg border'>` — ได้ผิวเดียวกันเป๊ะ
     (ขอบ 1px ไม่มีเงา) แต่ขอบ/พื้นมาจาก palette ของธีมแทน utility ที่บังเอิญตรง และเป็น primitive
     ตัวเดียวกับที่หน้าอื่นทั้งระบบใช้ (Hard Rule 1 — safepay-ux audit 2026-08-10)
     `component` เปลี่ยนตัว element จริงตามว่าโพสต์กดออกไปได้ไหม — โพสต์ที่ไม่มี permalink
     (ข้อมูลผิดปกติ) ยังต้องแสดงได้ แค่ไม่ใช่ลิงก์ ห้ามกลายเป็น <a> ที่กดแล้วไม่ไปไหน */
  const cardSx = { borderRadius: '8px', overflow: 'hidden' } as const
  const cardClass = 'block mli-5 mbs-3.5 mbe-3.5 no-underline text-[color:inherit]'

  // โพสต์ที่ไม่มี permalink (ข้อมูลผิดปกติ) ยังโชว์ได้ แค่กดออกไปที่โพสต์จริงไม่ได้
  // data-block-key: จุดเกาะให้ BuilderPreviewBridge วัดตำแหน่ง (feature 00035, SDS §4.1)
  return post.permalink ? (
    <Card
      variant='outlined'
      sx={cardSx}
      component='a'
      href={post.permalink}
      target='_blank'
      rel='noopener noreferrer'
      className={cardClass}
      data-block-key={blockKey}
    >
      {inner}
    </Card>
  ) : (
    <Card variant='outlined' sx={cardSx} className={cardClass} data-block-key={blockKey}>
      {inner}
    </Card>
  )
}

export default function PageBlocksSection({ blocks }: { blocks: PageBlockItem[] }) {
  if (blocks.length === 0) return null

  return (
    <div>
      {blocks.map((block) =>
        block.type === 'BADGE_HIGHLIGHT' ? (
          <BadgeHighlightBlock key={block.id} badges={block.badges} blockKey={block.id} />
        ) : (
          <FacebookPostBlock key={block.id} post={block.post} blockKey={block.id} />
        ),
      )}
    </div>
  )
}
