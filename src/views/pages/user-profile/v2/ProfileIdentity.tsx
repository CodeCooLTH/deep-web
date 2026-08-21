'use client'

/**
 * ProfileIdentity — หัวโปรไฟล์สาธารณะ: ปก · ตัวตนร้าน · แถวตัวเลข · ปุ่มลงมือ
 *
 * แทน `ProfileHero` ตัวเดิม (ซึ่งแบกทุกอย่างไว้ในไฟล์เดียว 1026 บรรทัด) — ช่องทาง/เหรียญ/
 * หลักฐาน ถูกแยกไปอยู่ `OfficialChannelsBlock` / `BadgeShowcase` / `EvidencePanel` แล้ว
 * ไฟล์นี้จึงเหลือเฉพาะ "ร้านนี้คือใคร" กับ "จะทักยังไง"
 *
 * ── มติที่ยกมาจากของเดิมและห้ามย้อนโดยไม่มีเหตุผลใหม่ ──────────────────
 * · ปกสูงเท่ากันทุกกรณี (มีรูปจริง/ไล่สี tier) — ไม่งั้นหน้าร้านสองร้านสูงไม่เท่ากัน ผู้ซื้อเทียบไม่ได้
 * · รูปวงกลมคร่อมรอยต่อปกกับเนื้อหา (ไม่ใช่มุมโค้งทับ) — ไม่มีรอยบากสองข้าง
 * · แถวตัวเลขแสดงครบทุกช่องเสมอแม้เป็น 0 — ซ่อนบางช่องแล้ว layout ขยับไปมาระหว่างร้าน
 *   และผู้ซื้อแยกไม่ออกว่าช่องที่หายคือ "ไม่มี" หรือ "ไม่แสดง"
 * · ตราแบรนด์ Deep มุมซ้ายบน — ผู้ชมที่ไม่รู้จัก Deep ต้องแยกออกว่านี่คือหน้าที่บุคคลที่สามรับรอง
 *   ไม่ใช่หน้าที่ร้านทำเอง (ไม่งั้นหลักฐาน trust ทั้งชุดเสียน้ำหนักพร้อมกัน)
 *
 * ── ที่ต่างจากของเดิม (มติใหม่ 2026-08-13) ────────────────────────────
 * · **จัดชิดซ้าย ไม่ใช่จัดกลาง** — แกนการอ่านซ้าย→ขวาแบบโปรไฟล์โซเชียลที่ผู้ใช้คุ้นอยู่แล้ว
 * · **ปกเตี้ยลง** (128/160/176) — คืนพื้นที่ให้เนื้อหา ปกที่เป็นไล่สีล้วนไม่ได้บอกอะไรเกี่ยวกับร้าน
 * · **ชิปคะแนนกดได้** เปิดแผงอธิบาย — เดิมเป็นป้ายตาย ⇒ `41/100` กลายเป็นคำตัดสินที่ไม่มีทางแก้ต่าง
 *   ทั้งที่ `Trust Score MVP มีแต่ขึ้น` แปลว่าร้านสุจริตทุกร้านคะแนนต่ำโดยโครงสร้างตอนนี้
 * · **แถวตัวเลขเป็น grid 2/4 คอลัมน์** ไม่ใช่ scroll แนวนอน — ที่ <360px (iPhone SE, Galaxy Fold
 *   ตอนพับ) แถว scroll ไม่มี affordance ผู้ใช้ไม่รู้ว่ามีช่องที่ 4 อยู่
 *
 * Base: v2/ProfileHero.tsx (ปก/รูป/แผงคะแนน/ProfileImg — ยกมาทั้งกลไกและถ้อยคำ)
 */
import type { ReactNode } from 'react'
import { useState, useEffect, useRef } from 'react'

import NextLink from 'next/link'

import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'

import { Icon } from '@iconify/react'

import logoDeepMark from '@/assets/images/logo-deep-mark.png'
import themeConfig from '@configs/themeConfig'

import ResponsiveSheet from './ResponsiveSheet'

import { getTierChipTone } from '@/lib/trust-tier'
import { resolveVerifyLevelImage } from '@/lib/verify-badge'
import { isClampOverflowing } from '@/lib/clamp-overflow'
import { formatShopAge } from '@/lib/shop-age'
import { compactCount } from '@/lib/format-compact-number'
import {
  channelChatUrl,
  firstChattableChannel,
  CHANNEL_SHORT_LABEL,
  type ChannelLinkInput,
} from '@/lib/official-channel-link'

/** คะแนนเต็มของ Trust Score (SSOT: `docs/10 - Business Rules/Tier Lists.md` — สเกล 0–100) */
const TRUST_SCORE_MAX = 100

/** องค์ประกอบคะแนน — ตัวเลขระดับแพลตฟอร์ม (SSOT: PRODUCT.md / docs/PRD.md)
 *  ไม่ใช่ breakdown รายร้าน เพราะข้อมูลไม่มี sub-score ต่อองค์ประกอบให้แสดง */
const TRUST_FACTORS = [
  { icon: 'lucide:shield-check', label: 'ยืนยันตัวตน', weight: '35%' },
  { icon: 'lucide:package', label: 'ประวัติออเดอร์', weight: '25%' },
  { icon: 'lucide:star', label: 'คะแนนรีวิว', weight: '20%' },
  { icon: 'lucide:calendar', label: 'อายุร้าน', weight: '10%' },
  { icon: 'lucide:medal', label: 'เหรียญตรา', weight: '10%' },
] as const

export type ProfileIdentityData = {
  shopName: string
  username: string
  avatar: string | null
  coverImage: string | null
  tierGradient: string
  /** สี accent ของระดับ (SSOT: `getTierAccentColor` ใน lib/trust-tier.ts) — ใช้ย้อมปกและแผงหลักฐาน
   *  🛑 ห้ามส่งสีที่คิดเอง ต้องมาจากฟังก์ชันนั้นเท่านั้น ไม่งั้นสีระดับจะมี 2 นิยามในระบบ (HR16) */
  tierAccent: string
  trustScore: number
  tierLabel: string
  nextTierLabel: string | null
  pointsToNext: number | null
  maxVerifyLevel: number
  category: string | null
  /** ISO ของวันเปิดร้าน — ใช้คำนวณ "เปิดร้านมาแล้ว …" ที่ผู้อ่านไม่ต้องคิดเอง */
  createdAtIso: string
  bio: string | null
  /** 4 ช่องของแถวตัวเลข — คำเรียกผันตามประเภทกิจการมาจากผู้เรียก */
  stats: { value: number | null; label: string }[]
  avgRating: number | null
  reviewCount: number
  /** ช่องทางที่ยืนยันแล้ว — ใช้เลือกปลายทางของปุ่มทัก (ไม่ได้ render รายการที่นี่) */
  channels: ChannelLinkInput[]
}

/** รูปที่ยอมให้โหลดพังได้ — คืน `fallback` เมื่อไม่มี URL **หรือ** โหลดไม่สำเร็จ
 *  รูปที่มี URL อยู่จริงแต่โหลดพัง (ไฟล์หาย/โดเมน OAuth หมดอายุ) ต้องได้ตัวอักษรแรก
 *  ไม่ใช่วงกลมสี primary เปล่า ๆ */
function ProfileImg({
  src,
  alt,
  className,
  fallback = null,
}: {
  src: string | null
  alt: string
  className: string
  fallback?: React.ReactNode
}) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) return <>{fallback}</>
  // eslint-disable-next-line @next/next/no-img-element -- URL หลากโดเมน (storage/CDN/OAuth)
  return <img src={src} alt={alt} className={className} onError={() => setFailed(true)} />
}

/**
 * จำนวนบรรทัดที่คำอธิบายร้านถูกย่อไว้ — **ค่าเดียวคุมทั้งการย่อและการวัด**
 * ถ้าแยกกันเมื่อไหร่ ปุ่ม "เพิ่มเติม" จะโผล่ผิดจังหวะโดยไม่มีอะไรฟ้อง (Hard Rule 16)
 */
const BIO_CLAMP_LINES = 2

/**
 * ตัวห่อของคำอธิบายร้าน — เป็นปุ่มเมื่อข้อความยาวจนต้องย่อ ไม่งั้นเป็นย่อหน้าเปล่า
 *
 * 🛑 ต้องประกาศ **นอก** ตัว render ของ `ProfileIdentity` (docs/conventions/component-declared-in-render.md)
 * 🛑 ทั้งสองกิ่งต้องกว้างเท่ากันเป๊ะ (block เต็มความกว้าง ไม่มี padding/border) เพราะ `<span>`
 *    ข้างในคือโหนดที่ถูกวัดว่า "ล้นไหม" — ถ้าความกว้างต่างกันแม้พิกเซลเดียว ผลการวัดจะต่างกัน
 *    ระหว่างสองสถานะ แล้วบั๊กสลับไม่หยุดจะกลับมาในรูปใหม่
 */
function BioShell({
  interactive,
  expanded,
  onToggle,
  children,
}: {
  interactive: boolean
  expanded: boolean
  onToggle: () => void
  children: ReactNode
}) {
  if (!interactive) return <p className='m-0'>{children}</p>

  return (
    <button
      type='button'
      onClick={onToggle}
      aria-expanded={expanded}
      className='m-0 is-full border-0 bg-transparent p-0 cursor-pointer font-[inherit] text-start whitespace-normal rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mui-palette-primary-main)]'
    >
      {children}
    </button>
  )
}


/* ───────────────────────────────────────────────────────────────────────────
   สไตล์ของ HERO — ทุกค่ายกจากไฟล์อ้างอิง `deep_store_profile_responsive.html`
   แยกออกมานอก component เพราะเป็นค่าคงที่: ประกาศในตัว render = อ็อบเจกต์ใหม่ทุกครั้ง
   ที่ re-render ⇒ MUI คำนวณ/แทรก CSS class ใหม่ทุกรอบโดยไม่ได้อะไรกลับมา
   (ญาติกับ `docs/conventions/hook-return-identity-in-deps.md` — identity ที่ไม่นิ่ง)
   ─────────────────────────────────────────────────────────────────────────── */

/** เท่ากับ `.container` ของไฟล์อ้างอิง — ต้องตรงกับ LAYOUT_SX ใน ShopProfile.tsx ไม่งั้นขอบซ้าย
 *  ของ hero กับของเนื้อหาด้านล่างจะไม่ตรงแนวกัน (สังเกตง่ายมากเพราะโลโก้อยู่ขอบซ้ายพอดี) */
const HERO_INNER_SX = {
  position: 'relative',
  inlineSize: 'min(1080px, calc(100% - 36px))',
  marginInline: 'auto',
  display: { xs: 'block', sm: 'grid' },
  gridTemplateColumns: { sm: '130px minmax(0,1fr)', md: '170px minmax(0,1fr) 232px' },
  gap: { sm: '20px', md: '28px' },
  alignItems: 'center',
  minBlockSize: { md: 300 },
  /* ระยะบน 40px — ตราแบรนด์ Deep เป็น `absolute` มุมซ้ายบน กินถึง y=38px
     เดิมโลโก้ร้านชิดซ้ายเหมือนกันจึงทับกัน (ต้องดันถึง 52px) แต่ตอนนี้โลโก้จัดกึ่งกลางแล้ว
     จอ 320px (แคบสุด) โลโก้เริ่มที่ x=107 ส่วนตราแบรนด์จบที่ x=96 ⇒ ไม่ชนกันในแนวนอนอีก
     40 จึงเหลือไว้เพื่อ "หายใจ" ใต้ตราแบรนด์อย่างเดียว ไม่ใช่เพื่อหลบ */
  padding: { xs: '40px 0 18px', md: '29px 0 24px' },
  '@media (max-width:650px)': { inlineSize: 'min(100% - 24px, 1080px)' },
} as const

const LOGO_SX = {
  inlineSize: { xs: 96, sm: 122, md: 154 },
  blockSize: { xs: 96, sm: 122, md: 154 },
  borderRadius: '50%',
  border: '5px solid #fff',
  background: '#050507',
  boxShadow: '0 12px 34px rgba(0,0,0,.35)',
  overflow: 'hidden',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  marginBlockEnd: { xs: '14px', sm: 0 },
} as const

const TITLE_SX = {
  fontSize: { xs: 24, md: 30 },
  lineHeight: 1.2,
  fontWeight: 900,
  letterSpacing: '-.4px',
  color: '#fff',
  margin: '13px 0 7px',
} as const

/** กล่องกระจกฝ้า — `backdropFilter` มีต้นทุนตอน composite ถ้าใช้หลายชั้นซ้อน
 *  ที่นี่ใช้ชั้นเดียวบนกล่องเล็ก จึงคุ้ม (ทำให้ตัวเลขอ่านออกบนรูปปกที่สว่างไม่เท่ากันทุกใบ) */
const STATS_SX = {
  marginBlockStart: { xs: '16px', md: '18px' },
  display: 'grid',
  maxInlineSize: { md: 545 },
  border: '1px solid rgba(255,255,255,.14)',
  borderRadius: '14px',
  background: 'rgba(0,0,0,.28)',
  backdropFilter: 'blur(8px)',
  overflow: 'hidden',
} as const

const STAT_SX = { padding: { xs: '9px 6px', md: '10px 12px' }, textAlign: 'center', position: 'relative' } as const

const STAT_DIVIDER_SX = {
  '&::after': {
    content: '""',
    position: 'absolute',
    insetInlineEnd: 0,
    insetBlockStart: '20%',
    blockSize: '60%',
    inlineSize: '1px',
    background: 'rgba(255,255,255,.13)',
  },
} as const

const HERO_SIDE_SX = {
  alignSelf: 'center',
  gridColumn: { sm: '1/-1', md: 'auto' },
  display: { xs: 'grid', sm: 'flex', md: 'block' },
  alignItems: 'center',
  gap: { xs: '10px', sm: '12px' },
  marginBlockStart: { xs: '14px', md: 0 },
} as const

/** ≤650px ซ่อนปุ่มคู่นี้ตามไฟล์อ้างอิง — มันไปอยู่ในแถบติดขอบล่าง (mobile CTA) ของเฟส 3 แทน
 *  🛑 จนกว่าเฟส 3 จะเสร็จ **ยังไม่ซ่อน** ไม่งั้นมือถือจะติดต่อร้านไม่ได้เลยระหว่างทาง */
const HERO_ACTIONS_SX = {
  /* ≤650px ซ่อน — ปุ่มคู่นี้ย้ายไปอยู่แถบติดขอบล่าง (`.mobile-cta`) ตามไฟล์อ้างอิง
     🛑 ก่อนหน้านี้ยังไม่ซ่อนโดยตั้งใจ เพราะแถบล่างยังไม่ได้ทำ — ถ้าซ่อนตอนนั้นมือถือจะติดต่อ
     ร้านไม่ได้เลย ตอนนี้แถบล่างมีแล้วจึงซ่อนได้ */
  display: { xs: 'none', sm: 'flex' },
  justifyContent: { md: 'flex-end' },
  gap: '10px',
  marginBlockEnd: { md: '42px' },
  order: { sm: 2 },
  marginInlineStart: { sm: 'auto', md: 0 },
} as const

const BTN_PRIMARY_SX = {
  border: 0,
  borderRadius: '11px',
  padding: '11px 16px',
  fontWeight: 800,
  fontSize: 15,
  color: '#fff',
  /* ไล่สีจากม่วงแบรนด์ #7367F0 — ไฟล์อ้างอิงใช้ #7657ff→#5739ef ซึ่งไม่ใช่สีเรา
     (CLAUDE.md HR8: Impeccable ชนะเรื่องสี) จึงยกเฉพาะ "รูปแบบ" มา ไม่ยกค่าสี */
  background: 'linear-gradient(135deg, #7367F0, #5a4ee0)',
  boxShadow: '0 9px 22px rgba(115,103,240,.35)',
  '&:hover': { background: 'linear-gradient(135deg, #7367F0, #5a4ee0)', transform: 'translateY(-1px)' },
} as const

const BTN_GHOST_SX = {
  borderRadius: '11px',
  padding: '11px 16px',
  minInlineSize: 0,
  fontWeight: 800,
  fontSize: 15,
  color: '#fff',
  border: '1px solid rgba(255,255,255,.25)',
  background: 'rgba(255,255,255,.05)',
  '&:hover': { border: '1px solid rgba(255,255,255,.4)', background: 'rgba(255,255,255,.12)' },
} as const

const SCORE_CARD_SX = {
  padding: { xs: '13px', md: '19px' },
  borderRadius: '18px',
  border: '1px solid rgba(255,255,255,.17)',
  background: 'rgba(20,12,4,.7)',
  backdropFilter: 'blur(8px)',
  display: 'grid',
  gridTemplateColumns: { xs: '45px 1fr', md: '58px 1fr' },
  gap: '14px',
  alignItems: 'center',
  flex: { sm: 1 },
  maxInlineSize: { sm: 360, md: 'none' },
} as const

const SCORE_ICON_SX = {
  inlineSize: { xs: 45, md: 58 },
  blockSize: { xs: 45, md: 58 },
  borderRadius: { xs: '12px', md: '16px' },
  background: 'linear-gradient(145deg, rgba(255,171,45,.25), rgba(255,255,255,.06))',
  display: 'grid',
  placeItems: 'center',
  color: '#ffac22',
} as const

/**
 * `.mobile-cta` ของไฟล์อ้างอิง — แถบปุ่มติดขอบล่าง แสดงเฉพาะจอ ≤650px
 *
 * 🛑 ต้องอยู่ **นอกบล็อกปก** — `position:fixed` เลิกยึด viewport ทันทีที่บรรพบุรุษตัวใดตัวหนึ่ง
 * มี `transform`/`filter`/`backdrop-filter` และปกมีกล่องสถิติที่ใช้ `backdropFilter` อยู่
 * วางเป็นพี่น้องของปก (ไม่ใช่ลูก) จึงไม่มีบรรพบุรุษตัวไหนสร้าง containing block ให้
 *
 * ไม่ใช้ `createPortal` เพราะท่านั้นต้องมี mounted-guard ที่ `setState` ใน effect ซึ่งผิดกฎ
 * eslint ของรีโป (`ShopSwitchOverlay.tsx` ติดกฎนี้ค้างอยู่) — การวางให้ถูกที่ตั้งแต่แรก
 * ได้ผลเหมือนกันโดยไม่ต้องแลกอะไร
 *
 * 🛑 แถบนี้ลอยทับเนื้อหา ต้องมีที่ว่างท้ายหน้ากันบังการ์ดใบสุดท้าย — **แต่ที่ว่างนั้นไม่ได้อยู่
 * ในไฟล์นี้** มันคือ `LAYOUT_SX.padding` ของ `ShopProfile` (70px + `env(safe-area-inset-bottom)`)
 * เพราะที่ว่าง "ท้ายหน้า" ต้องอยู่ท้ายกล่องที่ครอบเนื้อหาจริง ไม่ใช่ท้ายคอมโพเนนต์ปก
 * เคยวาง spacer ไว้ในนี้แล้วมันไปโผล่คั่นกลางจอใต้ปก (แก้ 2026-08-21) — ห้ามเอากลับมา
 */
function MobileCta({
  chatHref,
  chatLabel,
  onShare,
  copied,
}: {
  chatHref: string | null
  chatLabel: string | null
  onShare: () => void
  copied: boolean
}) {
  return (
    <>
      {/* 🛑 **ไม่มี spacer ตรงนี้** — เคยมี `blockSize:62px` วางไว้บรรทัดนี้ ซึ่งอยู่ **ใต้ปกทันที**
          คือหัวหน้า ทั้งที่หน้าที่ของมันคือดันที่ว่างไว้ **ท้ายหน้า** ไม่ให้แถบลอยบังเนื้อหาใบสุดท้าย
          ⇒ ช่องว่าง 62px ไปโผล่คั่นระหว่างปกกับแถบแท็บกลางจอ (user เจอเอง 2026-08-21
          "เว้นห่างกับ tap เกินไป") ขณะที่ท้ายหน้ายังไม่ได้อะไรเพิ่มเลย
          ที่ว่างท้ายหน้ามาจาก `LAYOUT_SX.padding` ของ `ShopProfile` อยู่แล้ว (70px + safe-area)
          ซึ่งเป็นกล่องที่ครอบเนื้อหาจริง = ที่ที่ถูกต้อง ห้ามเอา spacer กลับมา */}
      <Box
        sx={{
          display: { xs: 'grid', sm: 'none' },
          gridTemplateColumns: chatHref ? '1fr 1fr' : '1fr',
          gap: '9px',
          position: 'fixed',
          insetInline: 0,
          insetBlockEnd: 0,
          zIndex: 60,
          padding: '9px 12px calc(9px + env(safe-area-inset-bottom))',
          background: 'rgba(255,255,255,.95)',
          backdropFilter: 'blur(14px)',
          borderBlockStart: '1px solid #ececf2',
        }}
      >
        <Button variant='outlined' color='secondary' onClick={onShare} sx={MOBILE_BTN_SX} aria-label='แชร์โปรไฟล์นี้'>
          <Icon icon={copied ? 'tabler:check' : 'tabler:share-2'} width={18} />
          {copied ? 'คัดลอกแล้ว' : 'แชร์'}
        </Button>
        {chatHref && (
          <Button
            variant='contained'
            href={chatHref}
            target='_blank'
            rel='noopener noreferrer'
            aria-label={`ติดต่อร้านค้าผ่าน ${chatLabel ?? 'ช่องทางร้าน'}`}
            sx={{ ...MOBILE_BTN_SX, ...BTN_PRIMARY_SX, blockSize: 43 }}
          >
            <Icon icon='tabler:message-circle' width={18} />
            ติดต่อร้านค้า
          </Button>
        )}
      </Box>
    </>
  )
}

/** `.mobile-cta .btn { height:43px }` */
const MOBILE_BTN_SX = {
  blockSize: 43,
  borderRadius: '11px',
  fontWeight: 800,
  fontSize: 14,
  gap: '8px',
} as const

export default function ProfileIdentity({ data }: { data: ProfileIdentityData }) {
  const [copied, setCopied] = useState(false)
  const [scorePanelOpen, setScorePanelOpen] = useState(false)

  const tierTone = getTierChipTone(data.trustScore)
  const levelImage = resolveVerifyLevelImage(data.maxVerifyLevel)
  const chatChannel = firstChattableChannel(data.channels)
  const chatHref = chatChannel ? channelChatUrl(chatChannel) : null

  /* ── คำอธิบายร้าน: ย่อ 2 บรรทัด กดที่ตัวข้อความเพื่อกาง ──
     🛑 ปุ่มโผล่จากการ **วัดว่าล้นจริง** ไม่ใช่นับจำนวนตัวอักษร — ภาษาไทยไม่มีช่องว่างระหว่างคำ
     จำนวนอักขระบอกไม่ได้ว่าจะตก 2 บรรทัดไหม (ที่มาของ lib/clamp-overflow.ts)
     🛑 วัดตอน "ย่ออยู่" เท่านั้น — ตอนกางแล้ว scrollHeight = clientHeight เสมอ ถ้าวัดตอนนั้น
     ปุ่มจะหายทันทีที่กด แล้วผู้ใช้ย่อกลับไม่ได้ */
  /** โพรบที่ซ่อนไว้ — ข้อความชุดเดียวกันแบบ **ไม่ย่อ** ไว้วัดความสูงจริง (ดูเหตุผลที่ JSX) */
  const bioProbeRef = useRef<HTMLElement>(null)
  /** ตัวห่อชั้นนอกที่ **ไม่เคยเปลี่ยน** ไม่ว่าสถานะไหน — จุดเฝ้าความกว้างที่เชื่อถือได้ */
  const bioHostRef = useRef<HTMLDivElement>(null)
  const [bioExpanded, setBioExpanded] = useState(false)
  const [bioOverflows, setBioOverflows] = useState(false)

  useEffect(() => {
    const el = bioProbeRef.current
    if (!el) return
    const update = () => {
      /* 🛑 เทียบ "ความสูงจริงของข้อความ" กับ "ความสูงที่โควตาให้ (2 บรรทัด)"
         ไม่ใช่ `scrollHeight` vs `clientHeight` ของกล่องที่ถูก clamp — ค่านั้นเชื่อไม่ได้:
         Chrome รุ่นใหม่ตัดเนื้อหาที่เกินออกจาก `scrollHeight` ด้วย ⇒ ได้ 53 เท่ากับ 53
         (= "ไม่ล้น") ตอนโหลดครั้งแรก แล้วกลายเป็น 105 หลัง reflow — คำตอบขึ้นกับจังหวะที่วัด
         โพรบไม่มี clamp จึงคืนความสูงเต็มเสมอทุกเอนจินทุกจังหวะ */
      const lh = parseFloat(getComputedStyle(el).lineHeight)

      if (!Number.isFinite(lh) || lh <= 0) return
      setBioOverflows(isClampOverflowing(el.scrollHeight, lh * BIO_CLAMP_LINES))
    }
    update()

    /* 🛑 **ต้องวัดซ้ำหลังฟอนต์โหลดเสร็จเสมอ** (critique 2026-08-13 — เหตุผลที่ปุ่มไม่เคยโผล่เลย)
       ตอน Anuphan โหลดเสร็จข้อความ reflow จาก 2 เป็น 3 บรรทัด ถ้าวัดแค่ตอน mount จะได้คำตอบ
       ของฟอนต์สำรอง (ซึ่ง "ไม่ล้น") ค้างอยู่ตลอดอายุหน้า
       (guard `cancelled` กัน setState หลัง unmount) */
    let cancelled = false

    document.fonts?.ready.then(() => {
      if (!cancelled) update()
    })

    /* เฝ้า **ตัวห่อชั้นนอกที่ไม่เคยเปลี่ยน** — ความกว้างที่เปลี่ยน (หมุนจอ/เปลี่ยนขนาดหน้าต่าง)
       คือสิ่งเดียวที่ทำให้คำตอบเปลี่ยน และ host เป็นโหนดเดียวในบล็อกนี้ที่ไม่เคยถูก unmount */
    const host = bioHostRef.current
    const ro = host ? new ResizeObserver(update) : null

    if (host && ro) ro.observe(host)

    return () => {
      cancelled = true
      ro?.disconnect()
    }
    /* 🛑 **`bioOverflows` ต้องไม่อยู่ใน deps** — มันคือผลลัพธ์ของ effect นี้เอง การใส่มันกลับเข้าไป
       ทำให้ "วัด → เปลี่ยนสถานะ → วัดใหม่" กลายเป็นวงจรปิด ซึ่งวนไม่หยุดทันทีที่ค่าที่วัดได้ใน
       สองสถานะไม่ตรงกัน (เกิดจริงบน iOS Safari — ดูคอมเมนต์ที่ตัว bio)
       🛑 **`bioExpanded` ก็ไม่ต้องอยู่ด้วย** — โพรบไม่เคยถูกย่อ ความสูงของมันจึงไม่ขึ้นกับว่า
       ผู้ใช้กางอยู่หรือไม่ (เดิมต้องกันไว้เพราะวัดจากตัวข้อความจริงซึ่งกางแล้ว scrollH = clientH) */
  }, [data.bio])

  const share = async () => {
    const url = typeof window !== 'undefined' ? window.location.href : ''
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: data.shopName, url })
        return
      } catch {
        /* กดยกเลิกแผงแชร์ = ไม่ใช่ข้อผิดพลาด ตกไปคัดลอกลิงก์ */
      }
    }
    /* 🛑 เช็คว่ามี clipboard จริงก่อน — `navigator.clipboard?.writeText()` คืน undefined เมื่อ
       API ไม่มี (insecure context / WebView เก่า) แล้ว `await` ผ่านไปเฉย ๆ ⇒ เครื่องหมายถูก
       จะขึ้นทั้งที่ไม่ได้คัดลอกอะไรเลย */
    if (!navigator.clipboard) return
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <>
      {/* ══════════════════════════════════════════════════════════════════════
          HERO — ยกโครงจากไฟล์อ้างอิงที่ user ส่ง (`deep_store_profile_responsive.html`)
          ตัวเลขทุกตัว (170/1fr/232 · gap 28 · min-h 300 · โลโก้ 154 ขอบ 5) มาจากไฟล์นั้นตรง ๆ

          🛑 ฉากทับเป็น "น้ำตาลเข้ม/ดำ" ไม่ใช่สีประจำระดับ — ต่างจากของที่ถูกถอดออกเมื่อ 2026-08-14
          ครั้งนั้นคือ `linear-gradient(160deg, ${tierAccent}6B …)` ซึ่ง `getTierAccentColor()` คืน
          **`#7367F0` ให้ Deep Star = primary ของทั้งระบบ** ⇒ อ่านได้ว่า "ไล่สีม่วงตกแต่ง" ที่
          DESIGN.md แบนไว้ และดันสัดส่วนม่วงเกินเพดาน One Voice

          ของรอบนี้ต่างกันที่ **หน้าที่**: เป็น scrim เพื่อให้ตัวหนังสือขาวอ่านออกบนรูปปก (เรื่อง
          คอนทราสต์ WCAG) ไม่ใช่การย้อมด้วยสีแบรนด์ — และเพราะ hero เปลี่ยนเป็นโทนเข้ม
          **สัดส่วนม่วงในหน้ากลับ "ลดลง" ไม่ใช่เพิ่ม**

          `tierGradient` ยังทำหน้าที่เดิมคือพื้นตอนร้าน **ไม่มีรูปปก** (ผ่านการทบทวน 2026-08-10 แล้ว)
          ══════════════════════════════════════════════════════════════════════ */}
      <Box
        component='section'
        sx={{
          position: 'relative',
          overflow: 'hidden',
          color: '#fff',
          background: data.coverImage ? '#120d07' : data.tierGradient,
        }}
      >
        {/* ชั้นรูป + ฉากทับ 2 ชั้นตามไฟล์อ้างอิง (before = ไล่แนวนอนให้ฝั่งซ้ายเข้มพอสำหรับตัวหนังสือ,
            after = ไล่แนวตั้งบาง ๆ ที่ขอบล่าง กันหน้าตัดกับพื้นขาวของ layout ด้านล่างแข็งเกินไป) */}
        <Box aria-hidden sx={{ position: 'absolute', inset: 0 }}>
          <ProfileImg
            src={data.coverImage}
            alt=''
            className='absolute inset-0 is-full bs-full object-cover'
          />
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              background: {
                xs: 'linear-gradient(180deg, rgba(15,10,5,.52), rgba(15,10,5,.94) 48%, #120d07 100%)',
                md: 'linear-gradient(90deg, rgba(15,11,6,.99) 0%, rgba(18,12,5,.92) 26%, rgba(35,17,4,.58) 56%, rgba(53,24,1,.34) 100%)',
              },
            }}
          />
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(180deg, transparent 65%, rgba(9,7,5,.35))',
            }}
          />
        </Box>

        {/* ตราแบรนด์ — พื้นทึบ ไม่ใช่ไล่เงา เพราะปกมี 2 กรณี (รูปจริง / ไล่สี tier) พื้นทึบอ่านออกทั้งคู่
            p-2.5 เป็น hit-area ที่มองไม่เห็น ดัน tap target รวมให้ถึง 44px ขณะที่พิลที่ตาเห็นสูง ~30px */}
        <NextLink
          href='/'
          aria-label={`${themeConfig.templateName} — กลับหน้าแรก`}
          className='absolute block-start-0 inline-start-0 p-2.5 no-underline z-[2]'
        >
          <span className='inline-flex items-center gap-1.5 rounded-full plb-1.5 pli-3 bg-[var(--mui-palette-background-paper)]'>
            {/* โลโก้ Deep ของจริง (เดิมเป็น `VuexyLogo` = รูป "V" ของธีม)
                มีคำว่า Deep จาก `themeConfig.templateName` อยู่ข้าง ๆ จึงใช้มาร์ก ไม่ใช่เวิร์ดมาร์ก */}
            {/* eslint-disable-next-line @next/next/no-img-element -- โลโก้ static ที่ import มาแล้ว */}
            <img src={logoDeepMark.src} alt='' className='bs-4 is-auto' />
            <span className='text-[13px] font-bold text-[var(--mui-palette-text-primary)]'>
              {themeConfig.templateName}
            </span>
          </span>
        </NextLink>

        <Box sx={HERO_INNER_SX}>
          {/* ── คอลัมน์ 1: โลโก้ร้าน ── */}
          {/* xs จัดกึ่งกลาง (user เคาะ 2026-08-21) — พ่อเป็น `display:block` ตอน xs
              จึงจัดกลางด้วย `marginInline:auto` ไม่ใช่ `justifySelf` (อันนั้นมีผลเฉพาะ grid item)
              ต้องมี `inlineSize:'fit-content'` คู่กัน ไม่งั้นกล่องกว้างเต็มแถวแล้ว auto ไม่มีผล
              sm ขึ้นไปพ่อเป็น grid แล้ว กลับไปใช้ `justifySelf` ตามเดิม */}
          <Box
            sx={{
              position: 'relative',
              inlineSize: { xs: 'fit-content', sm: 'auto' },
              marginInline: { xs: 'auto', sm: 0 },
              justifySelf: { xs: 'start', md: 'center' },
            }}
          >
            <Box sx={LOGO_SX}>
              <ProfileImg
                src={data.avatar}
                alt=''
                className='is-full bs-full object-cover'
                fallback={
                  <span className='text-[40px] font-extrabold text-white'>
                    {data.shopName.trim().charAt(0)}
                  </span>
                }
              />
            </Box>
            {levelImage && (
              <img
                src={levelImage.src}
                alt={levelImage.alt}
                title={levelImage.alt}
                className='absolute inline-end-[-2px] block-end-[2px] bs-10 md:bs-12 is-auto'
                style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,.5))' }}
              />
            )}
          </Box>

          {/* ── คอลัมน์ 2: ตัวตนร้าน ──
              xs จัดกึ่งกลางทั้งคอลัมน์ (พิลระดับ / ชื่อร้าน / บรรทัด meta) ตาม user 2026-08-21
              🛑 **ยกเว้นคำโปรย** ซึ่งบังคับ `text-start` ไว้ที่ตัวมันเอง เพราะป้าย "เพิ่มเติม" เป็น
              `absolute inline-end-0` = ตรึงมุมขวาล่างของกล่อง ไม่ใช่ท้ายตัวอักษร ⇒ พอจัดกลาง
              บรรทัดสุดท้ายจะสั้นกว่ากล่อง แล้วป้ายไปลอยห่างจากข้อความโดยไม่มีอะไรเชื่อม
              (จะจัดกลางคำโปรยด้วยต้องรื้อป้ายเป็นบรรทัดแยกก่อน — ยังไม่ทำในรอบนี้) */}
          <Box sx={{ minInlineSize: 0, textAlign: { xs: 'center', sm: 'start' } }}>
            {/* พิลระดับ — คงเป็น "ปุ่ม" ไม่ใช่ป้ายเฉย ๆ เพราะมันคือทางเข้าเดียวของแผงคะแนน
                (ไฟล์อ้างอิงวาดเป็นป้ายนิ่ง ๆ ถ้าลอกตรงนั้นมา ผู้ใช้จะเข้าแผงไม่ได้อีกเลย) */}
            <button
              type='button'
              onClick={() => setScorePanelOpen(true)}
              aria-haspopup='dialog'
              aria-expanded={scorePanelOpen}
              aria-controls='trust-score-panel'
              aria-label={`คะแนนความน่าเชื่อถือ ${data.trustScore} จาก ${TRUST_SCORE_MAX} · ระดับ ${data.tierLabel} — ดูรายละเอียด`}
              /* 🛑 **ไม่แตะระบบแรงค์** — ใช้ `getTierChipTone()` ชุดเดิมของระบบทั้งดุ้น (user สั่ง
                 2026-08-21: "ใช้ตรีมเดิมของระบบนั้นละ อย่าไปแก้แรงค์เขานะ")

                 ชุดนั้นเป็น "ตัวหนังสือเข้มบนพื้นอ่อน" ซึ่งออกแบบไว้สำหรับการ์ดพื้นขาว — วางบน
                 ปกเข้มตรง ๆ จะจมหาย ทางแก้ที่ **ไม่ต้องแตะสีของระดับเลย** คือวางบน "แผ่นทึบสีพื้น"
                 แล้วให้พิลของระดับทำงานบนแผ่นนั้นเหมือนตอนอยู่บนการ์ดขาว

                 เป็นท่าเดียวกับ **ตราแบรนด์ Deep มุมซ้ายบน** ในไฟล์นี้ ซึ่งเลือกพื้นทึบด้วยเหตุผล
                 ที่เขียนไว้แล้วว่า "ปกมี 2 กรณี (รูปจริง / ไล่สี tier) พื้นทึบอ่านออกทั้งคู่" */
              className='inline-flex items-center gap-1.5 cursor-pointer border-0 p-0 bg-transparent'
            >
              <span
                className='inline-flex items-center gap-1.5 rounded-full plb-1.5 pli-3'
                style={{ background: 'var(--mui-palette-background-paper)' }}
              >
                <span
                  className='inline-flex items-center gap-1 rounded-full plb-0.5 pli-2 text-[12px] font-extrabold'
                  style={{ background: tierTone.bg, color: tierTone.text }}
                >
                  {data.tierLabel}
                </span>
                <span className='text-[13px] font-bold tabular-nums text-[var(--mui-palette-text-primary)]'>
                  {data.trustScore}
                  <span className='text-[11px] opacity-60'>{`/${TRUST_SCORE_MAX}`}</span>
                </span>
                <Icon icon='tabler:chevron-right' width={13} aria-hidden className='text-[var(--mui-palette-text-secondary)]' />
              </span>
            </button>

            <Typography component='h1' sx={TITLE_SX}>
              {data.shopName}
            </Typography>

            <Box sx={{ color: 'rgba(255,255,255,.72)', fontSize: 13, lineHeight: 1.7 }}>
              {[`@${data.username}`, data.category, `เปิดร้านมาแล้ว ${formatShopAge(data.createdAtIso)}`]
                .filter(Boolean)
                .join(' · ')}
            </Box>

            {data.bio?.trim() ? (
              /* 🛑 **โหนดที่ถูกวัด ต้องไม่เปลี่ยนหน้าตาตามผลการวัด** (บั๊ก prod 2026-08-15)
                 เดิมอิลิเมนต์ตัวเดียวกันสลับแท็ก `p` ↔ `button` ตามค่า `bioOverflows` ซึ่งเป็นค่าที่
                 ได้จากการวัด **อิลิเมนต์นั้นเอง** = ป้อนกลับเข้าตัวเอง บนเอนจินที่ `-webkit-line-clamp`
                 ไม่ทำงานกับ `<button>` (WebKit — iOS Safari) ค่าที่วัดได้ในสองสถานะจึงไม่ตรงกัน:
                   `<p>` clamp ติด → scrollH > clientH → true  → เปลี่ยนเป็น `<button>`
                   `<button>` clamp หลุด → scrollH = clientH → false → เปลี่ยนกลับเป็น `<p>` → วนไม่จบ
                 ⇒ ทุกอย่างใต้บรรทัดนี้ขยับขึ้นลงทุกเฟรมตลอดเวลา user ส่งคลิปจาก iPhone มายืนยัน
                 (2 บรรทัด ↔ 3 บรรทัด + "เพิ่มเติม" สลับตลอด 3.6 วินาทีที่อัด)
                 ตอนนี้ตัวที่ถูกวัดคือ `<span>` ที่แท็ก/คลาส/sx **เหมือนกันทุกสถานะ** ส่วนความเป็นปุ่ม
                 ย้ายออกไปอยู่ที่ตัวห่อ ⇒ ผลการวัดไม่ขึ้นกับผลการวัดอีกต่อไป
                 (`<button>` ห่อ `<span>` เป็น HTML ที่ถูก — button รับได้เฉพาะ phrasing content
                 ซึ่งเป็นบทเรียนเดียวกับที่ `OfficialChannelsBlock` เคยพลาดกับ `<h2>`) */
              <div ref={bioHostRef} className='relative mbs-3'>
                {/* 🛑 โพรบวัดความสูง — ข้อความชุดเดียวกันแบบ **ไม่ย่อ** ซ่อนไว้ทับที่เดิม
                    มีไว้เพราะ "ล้นไหม" ต้องตอบได้โดย **ไม่ต้องวัดกล่องที่ถูกย่อ**:
                      · กล่องที่ถูก clamp ให้ `scrollHeight` ไม่ตรงกันระหว่างเอนจิน และไม่ตรงกันแม้แต่
                        ในเอนจินเดียวกันคนละจังหวะ (Chrome: 53 ตอนโหลด → 105 หลัง reflow)
                      · ถ้าไปวัดกล่องจริง ผลการวัดจะขึ้นกับสถานะที่ผลการวัดเป็นคนกำหนด = วนไม่จบ
                    โพรบไม่มี clamp ไม่มีปุ่ม ไม่เคยเปลี่ยนรูปร่าง ⇒ ให้คำตอบเดิมเสมอ
                    `absolute` + `invisible` = วัดได้แต่ไม่กินที่และไม่มีใครเห็น (ห้าม `hidden`
                    ของ Tailwind หรือ `display:none` — ความสูงจะกลายเป็น 0)
                    `aria-hidden` เพราะข้อความชุดนี้ถูกอ่านจากตัวจริงอยู่แล้ว */}
                <Typography
                  ref={bioProbeRef}
                  component='span'
                  aria-hidden
                  className='absolute inset-inline-0 inset-block-start-0 invisible pointer-events-none select-none'
                  sx={{ fontSize: '15px', lineHeight: 1.75 }}
                >
                  {data.bio.trim()}
                </Typography>
                <BioShell
                  interactive={bioOverflows}
                  expanded={bioExpanded}
                  onToggle={() => setBioExpanded((v) => !v)}
                >
                {/* ตัวข้อความเอง — "เพิ่มเติม" ซ้อนท้ายบรรทัดสุดท้าย ไม่มีปุ่มแยกบรรทัด
                    🛑 ตัวซ้อนต้องมีพื้น paper **ทึบ** — line-clamp ไม่ได้ลบข้อความ แค่ซ่อน
                    ถ้าโปร่งจะเห็นตัวอักษรซ้อนกันเป็นเงา */}
                <Typography
                  component='span'
                  color='text.primary'
                  /* 🛑 **ห้ามมี `block` ตรงนี้** — utility ของ Tailwind ชนะ `display` ที่ `sx` ตั้งไว้
                     พอกลายเป็น `display:block` แล้ว `-webkit-line-clamp` ไม่ทำงาน (ต้องการ `-webkit-box`)
                     ⇒ ข้อความกางเต็ม แต่ป้าย "เพิ่มเติม" ยังโผล่ = คำเชิญให้กดสิ่งที่กางอยู่แล้ว
                     `relative` ต้องอยู่ที่โหนดนี้ เพราะป้ายซ้อนวางตัวเทียบกับกล่องข้อความ ไม่ใช่กับปุ่ม */
                  className='relative m-0 font-[inherit] text-start'
                  sx={{
                    /* 🛑 คงที่ 15px (ขั้น Body ของ ramp) — ความโปร่งของทิศทาง B มาจาก **leading 1.75**
                       ไม่ใช่จากขนาด เพราะ ramp ไม่มี 16px และขั้นถัดไปคือ 18px ซึ่งเป็นขั้นหัวข้อย่อย
                       สีเป็น text.secondary เพราะ bio ไม่ควรแข่งน้ำหนักกับชื่อร้านที่อยู่เหนือมัน 2 บรรทัด */
                    fontSize: '15px',
                    lineHeight: 1.75,
                    color: 'rgba(255,255,255,.88)',
                    ...(bioExpanded
                      ? { display: 'block' }
                      : {
                          display: '-webkit-box',
                          WebkitBoxOrient: 'vertical',
                          WebkitLineClamp: BIO_CLAMP_LINES,
                          overflow: 'hidden',
                        }),
                  }}
                >
                  {data.bio.trim()}
                  {bioOverflows && !bioExpanded && (
                    <span
                      aria-hidden
                      /* บนปกเข้มใช้ขาวล้วน (คอนทราสต์ >12:1) ไม่ใช้ primary.dark ซึ่งคำนวณไว้สำหรับพื้นขาว
                         แผ่นบังเป็นไล่สีโปร่ง→เข้ม เพราะพื้นหลังเป็นรูป ไม่ใช่สีทึบที่ทาบทับตรง ๆ ได้ */
                      className='absolute inset-be-0 inline-end-0 pis-6 text-[13px] font-semibold'
                      style={{ color: '#fff', background: 'linear-gradient(90deg, transparent, rgba(18,13,7,.92) 42%, rgba(18,13,7,.98))' }}
                    >
                      เพิ่มเติม
                    </span>
                  )}
                </Typography>
                </BioShell>
              </div>
            ) : null}

            {/* ── กล่องสถิติกระจกฝ้า — 4 ช่องมีเส้นคั่น ตามไฟล์อ้างอิง ──
                🛑 `gridTemplateColumns` ผูกกับ **จำนวนช่องจริง** ไม่ hardcode 4: ไฟล์อ้างอิงมี 4 ช่อง
                แต่ `data.stats` ผันตามประเภทกิจการ (บางร้านได้ 3) ถ้าตรึงไว้ 4 ร้านนั้นจะเหลือช่องว่าง
                ค้างหนึ่งช่องพร้อมเส้นคั่นลอย ๆ โดยไม่มีอะไรฟ้อง */}
            {data.stats.length > 0 && (
              <Box sx={{ ...STATS_SX, gridTemplateColumns: `repeat(${data.stats.length}, 1fr)` }}>
                {data.stats.map((s, i) => (
                  <Box key={s.label} sx={{ ...STAT_SX, ...(i < data.stats.length - 1 ? STAT_DIVIDER_SX : null) }}>
                    <Box component='b' sx={{ fontSize: { xs: 20, md: 24 }, display: 'block', fontWeight: 800 }} className='tabular-nums'>
                      {s.value != null ? compactCount(s.value) : '—'}
                    </Box>
                    <Box component='span' sx={{ fontSize: { xs: 10, md: 11 }, color: 'rgba(255,255,255,.68)' }}>
                      {s.label}
                    </Box>
                  </Box>
                ))}
              </Box>
            )}
          </Box>

          {/* ── คอลัมน์ 3: ปุ่มติดต่อ + การ์ดคะแนนรีวิว ── */}
          <Box sx={HERO_SIDE_SX}>
            <Box sx={HERO_ACTIONS_SX}>
              {chatHref && chatChannel && (
                <Button
                  variant='contained'
                  href={chatHref}
                  target='_blank'
                  rel='noopener noreferrer'
                  startIcon={<Icon icon='tabler:message-circle' width={18} />}
                  title={`เปิด ${CHANNEL_SHORT_LABEL[chatChannel.provider] ?? 'ช่องทางร้าน'}`}
                  aria-label={`ติดต่อร้านค้าผ่าน ${CHANNEL_SHORT_LABEL[chatChannel.provider] ?? 'ช่องทางร้าน'}`}
                  sx={BTN_PRIMARY_SX}
                >
                  ติดต่อร้านค้า
                </Button>
              )}
              <Button
                variant='outlined'
                onClick={share}
                aria-label='แชร์โปรไฟล์นี้'
                sx={BTN_GHOST_SX}
                startIcon={chatHref ? undefined : <Icon icon={copied ? 'tabler:check' : 'tabler:share-2'} width={18} />}
              >
                {chatHref ? (
                  <Icon icon={copied ? 'tabler:check' : 'tabler:share-2'} width={18} />
                ) : copied ? (
                  'คัดลอกลิงก์แล้ว'
                ) : (
                  'แชร์โปรไฟล์'
                )}
              </Button>
            </Box>

            {/* การ์ดคะแนน = **คะแนนรีวิวจากลูกค้า** คนละตัวกับคะแนนความน่าเชื่อถือในพิลด้านซ้าย
                (ไฟล์อ้างอิงก็แยกสองอย่างนี้เหมือนกัน) — ซ่อนทั้งใบเมื่อยังไม่มีรีวิว ดีกว่าโชว์ "—/5"
                ซึ่งอ่านได้ว่าร้านได้คะแนนแย่ ทั้งที่แปลว่ายังไม่มีใครรีวิว */}
            {data.avgRating != null && (
              <Box sx={SCORE_CARD_SX}>
                <Box sx={SCORE_ICON_SX} aria-hidden>
                  <Icon icon='tabler:star-filled' width={26} />
                </Box>
                <Box sx={{ minInlineSize: 0 }}>
                  <Box component='small' sx={{ display: 'block', color: 'rgba(255,255,255,.72)', fontSize: 12, marginBlockEnd: '2px' }}>
                    คะแนนร้านค้า
                  </Box>
                  {/* ≤900px เรียงเลข/ดาว/จำนวนไว้บรรทัดเดียว — บนมือถือทั้งสามอยู่คนละบรรทัด
                      ทำให้การ์ดสูง ~110px ทั้งที่ไอคอนข้าง ๆ สูงแค่ 45px ⇒ ที่ว่างเปล่าเต็มใบ
                      บรรทัดเดียวเหลือ ~72px และดันเนื้อหาจริงขึ้นมาให้เห็นเร็วขึ้น
                      `alignItems: baseline` ให้เลข 22px กับดาว 13px นั่งบนเส้นฐานเดียวกัน */}
                  <Box
                    sx={{
                      display: { xs: 'flex', md: 'block' },
                      alignItems: 'baseline',
                      flexWrap: 'wrap',
                      columnGap: '9px',
                    }}
                  >
                    <Box component='strong' sx={{ fontSize: { xs: 22, md: 27 }, fontWeight: 800 }} className='tabular-nums'>
                      {data.avgRating.toFixed(1)}
                      <Box component='small' sx={{ fontSize: 13, opacity: 0.7 }}>/5</Box>
                    </Box>
                    <Box aria-hidden sx={{ color: '#ffac22', fontSize: 13, lineHeight: 1 }}>
                      {'★'.repeat(Math.round(data.avgRating)).padEnd(5, '☆')}
                    </Box>
                    <Box
                      sx={{
                        fontSize: 11,
                        color: 'rgba(255,255,255,.65)',
                        marginBlockStart: { xs: 0, md: '4px' },
                      }}
                      className='tabular-nums'
                    >
                      {`(${data.reviewCount.toLocaleString('th-TH')} รีวิว)`}
                    </Box>
                  </Box>
                </Box>
              </Box>
            )}
          </Box>
        </Box>


        {/* สถานะการคัดลอกต้องประกาศให้ screen reader ด้วย — ไอคอนที่เปลี่ยนรูปเงียบ ๆ ผู้ใช้ SR ไม่รู้เลย */}
        <span role='status' aria-live='polite' className='sr-only'>
          {copied ? 'คัดลอกลิงก์โปรไฟล์แล้ว' : ''}
        </span>
      </Box>
        {/* ── `.mobile-cta` — แถบปุ่มติดขอบล่าง เฉพาะจอ ≤650px ──
            🛑 ต้อง **portal ออก document.body** ไม่ใช่ปล่อยไว้ในนี้ — `position:fixed` จะยึดกับ
            อิลิเมนต์แม่แทน viewport ทันทีที่มีบรรพบุรุษตัวใดตัวหนึ่งใช้ `transform`/`filter`/
            `backdrop-filter` (กล่องสถิติในปกนี้ใช้ `backdropFilter` อยู่) — บทเรียนเดียวกับ
            `ShopSwitchOverlay.tsx` ที่เขียนเหตุผลเต็มไว้แล้ว

            🛑 `env(safe-area-inset-bottom)` ใช้ได้จริงเพราะ `(marketing)/layout.tsx` ตั้ง
            `viewportFit: 'cover'` ไว้ — ถ้าไม่มีบรรทัดนั้น ค่านี้จะคืน 0 เงียบ ๆ บนเครื่องจริง
            (`docs/conventions/ios-safe-area.md`) */}
        <MobileCta
          chatHref={chatHref}
          chatLabel={chatChannel ? (CHANNEL_SHORT_LABEL[chatChannel.provider] ?? 'ช่องทางร้าน') : null}
          onShare={share}
          copied={copied}
        />

      {/* ── แผงอธิบายคะแนน ──
             ข้อเท็จจริงของระบบ ไม่ใช่คำปลอบใจ: Trust Score MVP มีแต่ขึ้น ไม่มี penalty
             ร้านส่วนใหญ่บน prod ยังคะแนนต่ำเพราะระบบเพิ่งเริ่ม ไม่ใช่เพราะร้านมีปัญหา */}
      <ResponsiveSheet
        open={scorePanelOpen}
        onClose={() => setScorePanelOpen(false)}
        id='trust-score-panel'
        ariaLabelledBy='trust-score-panel-title'
      >
        <div className='pli-5 pbs-3 pbe-6'>
          <div className='flex items-center justify-between mbe-3'>
            <Typography id='trust-score-panel-title' className='font-semibold' color='text.primary'>
              คะแนนความน่าเชื่อถือ
            </Typography>
            <IconButton size='small' onClick={() => setScorePanelOpen(false)} aria-label='ปิด'>
              <Icon icon='lucide:x' width={18} />
            </IconButton>
          </div>

          {/* ไม่ใช้สีเตือน/แดงไม่ว่าคะแนนจะต่ำแค่ไหน — คะแนนคือระยะทาง ไม่ใช่คำตัดสิน */}
          <div className='flex items-baseline gap-2.5 mbe-1'>
            <span className='text-[32px] font-extrabold tabular-nums leading-none' style={{ letterSpacing: '-0.03em' }}>
              {`${data.trustScore}/100`}
            </span>
            <span className='rounded-lg plb-1 pli-2.5 text-[13px] font-semibold bg-[var(--mui-palette-action-hover)] text-[var(--mui-palette-text-secondary)]'>
              {data.tierLabel}
            </span>
          </div>

          <Typography variant='body2' color='text.secondary'>
            คะแนนนี้เพิ่มขึ้นได้เรื่อย ๆ ตามประวัติจริงของร้าน และไม่มีการหักคะแนน
          </Typography>
          <Typography variant='body2' color='text.primary' className='mbs-1'>
            {data.nextTierLabel && data.pointsToNext != null
              ? `อีก ${data.pointsToNext} คะแนน ถึง ${data.nextTierLabel}`
              : 'อยู่ในระดับสูงสุดแล้ว'}
          </Typography>

          <Typography variant='body2' className='font-semibold mbs-4 mbe-2' color='text.primary'>
            คะแนนนี้คำนวณจากอะไร
          </Typography>
          <ul className='m-0 p-0 list-none flex flex-col gap-2'>
            {TRUST_FACTORS.map((f) => (
              <li key={f.label} className='flex items-center gap-2.5'>
                <Icon icon={f.icon} width={16} className='shrink-0 opacity-70' />
                <Typography variant='body2' color='text.primary' className='flex-1'>
                  {f.label}
                </Typography>
                <Typography variant='body2' color='text.secondary' className='tabular-nums'>
                  {f.weight}
                </Typography>
              </li>
            ))}
          </ul>

          <Typography variant='caption' color='text.secondary' className='block mbs-4'>
            คำนวณจากพฤติกรรมจริงบน Deep เท่านั้น ร้านไม่สามารถซื้อหรือปลอมคะแนนได้
          </Typography>
        </div>
      </ResponsiveSheet>
    </>
  )
}
