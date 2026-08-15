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

import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'

import { Icon } from '@iconify/react'

import VuexyLogo from '@core/svg/Logo'
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
      {/* ── ปก ── */}
      <div
        className='relative overflow-hidden bs-[128px] sm:bs-[160px] md:bs-[176px]'
        style={{ background: data.tierGradient }}
      >
        <ProfileImg src={data.coverImage} alt='' className='absolute inset-0 is-full bs-full object-cover' />

        {/* 🛑 **ห้ามเอาฉากทับสีประจำระดับกลับมาที่ปก** (ถอดออก 2026-08-14 หลัง ux audit)
            ผมเคยใส่ `linear-gradient(160deg, ${'{tierAccent}'}6B …)` + scrim `8C` ไว้ตรงนี้ตามทิศทาง
            B+C แล้วมันคือการ **สร้างการละเมิดเดิมขึ้นมาใหม่บนอิลิเมนต์เดิม tier เดิม**:

            `getTierAccentColor()` คืน **`#7367F0` ให้ Deep Star ซึ่งคือ primary ของทั้งระบบ**
            ⇒ แทนค่าแล้วบรรทัดนั้นอ่านว่า "ไล่สีม่วง gradient ตกแต่ง" ซึ่ง DESIGN.md เขียนแบนไว้
            ด้วยคำเดียวกันเป๊ะ 2 จุด (บรรทัด 137 "ม่วงคือ accent ทึบ ไม่ใช่ gradient ตกแต่ง"
            และบรรทัด 370 รายการ Don't ข้อแรก)

            🛑 และ `Tier Lists.md` §ประวัติ 2026-08-10 บันทึกไว้เองว่าเคยเจอปัญหานี้แล้ว แก้แล้ว
            และ **ล็อกด้วยเทส `[blocker]` ใน `trust-tier.test.ts`** — ครั้งนั้นต้นเหตุคือ "ปกสูงขึ้น
            ~27% ทำให้พื้นที่ม่วงโตเกินเพดาน One Voice" ส่วนของผมคือทับม่วง **ทั้งใบที่ ~42–55%**
            ซึ่งมากกว่าเหตุการณ์นั้นหลายเท่า — ผมไม่ได้อ่าน SSOT ก่อนลงมือ

            ผลพลอยได้ที่ถอดออกแล้วได้มาด้วย: Gold accent `#FF9F43` = **`warning-amber.canonical`
            ตัวเดียวกับที่ใช้สื่อ "ยืนยันแค่บางส่วน"** ในแผงหลักฐานที่อยู่ใต้ปกลงมา — การย้อมปก
            ด้วยเฉดนั้นทำให้ร้าน Gold ได้จอที่พูดว่า "ดีเยี่ยม" กับ "ยังไม่ครบ" ด้วยสีเดียวกัน

            ตัวตนของระดับยังสื่อครบโดยไม่ต้องมีชั้นนี้ 3 ทาง: `tierGradient` (พื้นปกตอนไม่มีรูป —
            ผ่านการทบทวนมาแล้วเมื่อ 2026-08-10) · พื้นย้อมของแผงหลักฐาน (อัลฟาต่ำ มีความหมาย) ·
            พิลระดับข้างชื่อร้าน */}

        {/* ตราแบรนด์ — พื้นทึบ ไม่ใช่ไล่เงา เพราะปกมี 2 กรณี (รูปจริง / ไล่สี tier) พื้นทึบอ่านออกทั้งคู่
            p-2.5 เป็น hit-area ที่มองไม่เห็น ดัน tap target รวมให้ถึง 44px ขณะที่พิลที่ตาเห็นสูง ~30px */}
        <NextLink
          href='/'
          aria-label={`${themeConfig.templateName} — กลับหน้าแรก`}
          /* block-start/inline-start เขียนเป็นค่าตรง ๆ ด้วยเหตุผลเดียวกับตราระดับด้านล่าง
             (ตัวนี้ "ดูเหมือนถูก" เพราะ static position ของลูกคนแรกบังเอิญอยู่มุมซ้ายบนพอดี) */
          className='absolute block-start-0 inline-start-0 p-2.5 no-underline'
        >
          <span className='inline-flex items-center gap-1.5 rounded-full plb-1.5 pli-3 bg-[var(--mui-palette-background-paper)] shadow-sm'>
            <VuexyLogo className='text-primary' style={{ fontSize: 16 }} />
            <span className='text-[13px] font-bold text-[var(--mui-palette-text-primary)]'>
              {themeConfig.templateName}
            </span>
          </span>
        </NextLink>
      </div>

      {/* ── ตัวตนร้าน ── */}
      {/* 🛑 `md:` ในหน้านี้ = **900px ไม่ใช่ 768px** — `marketing.css` รีแมป `--breakpoint-md: 900px`
             ตาม MUI (คอมเมนต์เดิมในไฟล์นี้ที่เขียนว่า "≥768px" ผิดมาตั้งแต่ต้น) ⇒ ช่วง 768–899
             ยังได้ผังมือถือ ซึ่งถูกต้องอยู่แล้วเพราะแท็บเล็ตแนวตั้งพื้นที่ไม่พอวางปุ่มข้างรูป */}
      <div className='pli-5 -mbs-[44px] md:-mbs-[60px] relative'>
        {/* 🛑 กล่องนอกต้องไม่มี overflow-hidden ไม่งั้นตราระดับที่ absolute มุมล่างขวาโดนตัดหาย
            รูปโปรไฟล์ใหญ่ขึ้นบนเดสก์ท็อป 88 → 120px (user 2026-08-13) — บนจอกว้าง 960px
            รูป 88px อ่านเป็นไอคอนมากกว่า "หน้าคน" ซึ่งขัดกับทั้งหน้าที่พยายามบอกว่านี่คือคนจริง
            การซ้อนทับปกยังเป็นครึ่งหนึ่งของรูปเหมือนเดิม (`-mbs` = ครึ่งความสูงรูป) */}
        <div className='relative is-[88px] bs-[88px] md:is-[120px] md:bs-[120px] mbe-2.5'>
          {/* วงแหวนสีระดับรอบขอบขาว — `box-shadow` ไม่ใช่ border ที่สอง เพราะ border ซ้อนจะกิน
              พื้นที่ด้านในทำให้รูปเล็กลง ส่วน shadow วาดออกนอกกล่อง รูปจึงยังเต็ม 88/120px เท่าเดิม */}
          <div
            className='is-full bs-full rounded-full border-4 overflow-hidden bg-primary flex items-center justify-center text-white text-3xl font-bold border-[var(--mui-palette-background-paper)]'
            style={{ boxShadow: `0 0 0 2px ${data.tierAccent}2E` }}
          >
            <ProfileImg
              src={data.avatar}
              alt=''
              className='is-full bs-full object-cover'
              fallback={data.shopName.trim().charAt(0)}
            />
          </div>
          {levelImage && (
            /* ความหมายมาจาก `alt` (element เป็น <img> = role img ซึ่งรองรับชื่อจากผู้เขียน) —
               ที่ 34px เลขในอาร์ตเวิร์กอ่านไม่ออก และสีอย่างเดียวสื่อความหมายไม่ได้ (WCAG 1.4.1) */
            // eslint-disable-next-line @next/next/no-img-element -- asset ใน public/
            <img
              src={levelImage.src}
              alt={levelImage.alt}
              title={levelImage.alt}
              /* 🛑 ใช้คลาสชุดเดียวกับของเดิมเป๊ะ — `inset-block-end-0`/`inset-inline-end-0`
                 **ไม่ถูกเจนเป็น CSS ในโปรเจกต์นี้** ⇒ img หลุดจาก absolute ไปอยู่ใน flow ปกติ
                 แล้วไปทับชื่อร้านบรรทัดถัดไป (คลาสที่ไม่มีนิยาม = no-op เงียบ ไม่มีอะไรฟ้อง) */
              className='absolute inline-end-[-6px] block-end-[-2px] bs-9 md:bs-11 is-auto'
              style={{ filter: 'drop-shadow(0 1px 2px rgba(47,43,61,.35))' }}
            />
          )}
        </div>

        {/* ── มือถือ: ปุ่มอยู่ใต้แถวตัวเลข เต็มความกว้าง (ในระยะนิ้วโป้ง) ──
               เดสก์ท็อป: ปุ่มยกขึ้นไปอยู่ **แถวเดียวกับรูปโปรไฟล์ ชิดขวา** แบบ X/Twitter
               (user ส่งภาพอ้างอิงมา 2026-08-13) — ตำแหน่งนี้คืนบรรทัดชื่อร้านให้เป็นของชื่อล้วน ๆ
               และปุ่มไปอยู่ในแถบที่สายตาผ่านอยู่แล้วตอนดูรูป */}
        <div>
          <div className='min-is-0'>
        <div className='flex items-center gap-2 flex-wrap'>
          {/* 24px (h4) → 28px (h3) บนเดสก์ท็อป — ทั้งคู่เป็นขั้นจริงใน ramp ของ DESIGN.md
              🛑 ของเดิม 22px **ไม่อยู่บน ramp เลย** (ramp เดิน 18 → 24 → 28) เป็นค่าที่ตกทอดมาจาก
              ProfileHero การขยับรอบนี้จึงแก้ค่าที่หลุดระบบอยู่ก่อนแล้วไปด้วยในตัว
              🛑 อย่าไปใช้ 26/30 ที่ "ดูพอดี" — ไม่มีในระบบ (detector จับได้ 3 ครั้งในวันเดียว) */}
          <Typography
            component='h1'
            className='text-[24px] md:text-[28px] font-bold leading-tight'
            color='text.primary'
          >
            {data.shopName}
          </Typography>
          {/* ── ชิปคะแนน: **พิลเดียว 2 ช่วง** (ยกกลับมาจากของเดิมตามคำสั่ง user 2026-08-13) ──
              รอบก่อนผมยุบเป็น MUI `<Chip>` ก้อนเดียวพื้นสีระดับ `41/100 · Deep Classic` ซึ่ง
              **ทิ้งงานที่ของเดิมทำไว้ 2 อย่าง**:
                1. ตัวเลขไม่ได้เด่นกว่าตัวหาร — `41` กับ `/100` ขนาดเท่ากันหมด ทั้งที่คนอ่าน
                   ต้องการเลขจริง ส่วน `/100` มีไว้บอกสเกลเฉย ๆ
                2. **พื้นสีระดับกลืนกับคะแนน** — ของเดิมแยกช่วงซ้าย (พื้นเข้ม = ตัวเลขระบบ) ออกจาก
                   ช่วงขวา (สีประจำระดับจาก `getTierChipTone`) ⇒ Deep Gold กับ Deep Classic
                   ต่างกันตั้งแต่ยังไม่ได้อ่านตัวหนังสือ ซึ่งเป็นเหตุผลที่ `getTierChipTone` มีอยู่
              🛑 ไม่มี ⓘ — user สั่งถอดไปตั้งแต่ 2026-08-11 และภาพอ้างอิงรอบนี้ก็ไม่มี
              ข้อแลกเปลี่ยนที่รับไว้: ไม่มีสัญญาณทางสายตาว่าพิลนี้กดได้ เหลือแค่ cursor + focus ring
              (ของเดิมมีเช็คเขียวหลังชื่อร้านเป็นทางเข้าที่สอง แต่จอนี้ไม่มี เพราะ L1 ห้ามเป็นเขียว) */}
          <button
            type='button'
            onClick={() => setScorePanelOpen(true)}
            aria-haspopup='dialog'
            aria-expanded={scorePanelOpen}
            aria-controls='trust-score-panel'
            aria-label={`คะแนนความน่าเชื่อถือ ${data.trustScore} จาก ${TRUST_SCORE_MAX} · ระดับ ${data.tierLabel} — ดูรายละเอียด`}
            /* ::after ดัน tap target ให้ถึง 44px โดยพิลที่ตาเห็นยังเล็กเท่าเดิม —
               ถ้าใส่ padding จริง line box ของบรรทัดชื่อร้านจะโตตามแล้วดันทั้งบล็อกห่างลงไป */
            className='relative inline-flex items-stretch rounded-full overflow-hidden border-0 p-0 bg-transparent cursor-pointer font-[inherit] after:absolute after:inset-[-13px] after:content-[""] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mui-palette-primary-main)]'
          >
            {/* 15px = ขั้น Subtitle/Body ของ ramp — ไม่ใช่ 14px ซึ่งไม่อยู่บน ramp เลย */}
            {/* 🛑 `font-bold` (700 = ขั้น Strong) ไม่ใช่ 800 — DESIGN.md สงวน 800 ให้ **Metric เท่านั้น**
                ซึ่งมีขนาดของตัวเองคือ 32/22/20px · 15px/800 จึงไม่ใช่ทั้ง Strong และ Metric
                เป็นคู่ผสมที่สามที่ไม่มีชื่อในระบบ (ux audit 2026-08-14)
                นี่คือแพตเทิร์นเดียวกับที่ทำให้ต้องประกาศขั้น Strong เพิ่มเมื่อ 2026-08-12 —
                แต่ละไฟล์เลือกน้ำหนักกันเองจนไม่มีตัวไหนอยู่ใน vocab */}
            <span className='inline-flex items-center plb-1 pli-2 text-[15px] font-bold tabular-nums leading-none bg-[var(--mui-palette-text-primary)] text-[var(--mui-palette-background-paper)]'>
              {data.trustScore}
              <span className='text-[11px] font-bold opacity-65'>{`/${TRUST_SCORE_MAX}`}</span>
            </span>
            {/* 🛑 ลูกศรท้ายพิลคือสัญญาณเดียวว่า "กดได้" — บนมือถือไม่มี cursor ไม่มี hover
                และ ⓘ ถูกถอดไปตามคำสั่ง user (2026-08-11) ⇒ ก่อนหน้านี้พิลนี้ไม่มีสัญญาณเลย
                ทั้งที่มันเป็น **ทางเข้าเดียว** ของแผงที่อธิบายว่า 41/100 แปลว่าอะไร
                (จอนี้ไม่มีเช็คเขียวหลังชื่อร้านเป็นทางเข้าที่สองแบบของเดิม เพราะ L1 ห้ามเป็นเขียว)
                วางท้ายพิลไม่ใช่หน้าตัวเลข จึงไม่แย่งพื้นที่จากสิ่งที่คนมาอ่าน */}
            <span
              className='inline-flex items-center gap-0.5 plb-1 pis-2.5 pie-1.5 text-[13px] font-bold leading-none'
              style={{ background: tierTone.bg, color: tierTone.text }}
            >
              {data.tierLabel}
              <Icon icon='tabler:chevron-right' width={13} aria-hidden />
            </span>
          </button>
          {/* 🛑 ไม่มีชิปคะแนนรีวิวตรงนี้ (user ถอดออก 2026-08-13) — เลขเดียวกันโผล่ 3 ที่ในจอเดียว
              คือ ชิปนี้ · ช่อง "รีวิว" ในแถวตัวเลข · ป้ายแท็บ "รีวิว 4.7"
              ม็อกอัพไม่มีชิปนี้มาแต่แรก ผมเป็นคนเติมเข้ามาเองโดยยกมาจากหัวโปรไฟล์เดิม */}
        </div>

        <Typography variant='body2' color='text.secondary' className='mbs-1.5'>
          {[`@${data.username}`, data.category, `เปิดร้านมาแล้ว ${formatShopAge(data.createdAtIso)}`]
            .filter(Boolean)
            .join(' · ')}
        </Typography>

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
                color: 'var(--mui-palette-text-secondary)',
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
                  /* primary.dark ไม่ใช่ primary.main — 13px ไม่เข้าเกณฑ์ large text ของ WCAG
                     จึงต้องผ่าน 4.5:1 แบบ body (#7367F0 บนขาวได้ ~4.25:1) */
                  className='absolute inset-be-0 inline-end-0 pis-2 text-[13px] font-semibold bg-[var(--mui-palette-background-paper)]'
                  style={{ color: 'var(--mui-palette-primary-dark)' }}
                >
                  เพิ่มเติม
                </span>
              )}
            </Typography>
            </BioShell>
          </div>
        ) : null}

        {/* ── แถวตัวเลข ──
               🛑 **flex-wrap ไม่ใช่ grid 4 คอลัมน์** — grid แบ่งความกว้าง 960px เท่า ๆ กัน
               ทำให้ตัวเลขกระจายห่างกันช่องละ ~230px บนเดสก์ท็อป อ่านเป็นตัวเลข 4 ตัวลอย ๆ
               ไม่ใช่ "ชุดตัวเลขของร้านนี้" (ม็อกอัพใช้ flex gap แน่น ๆ ชิดซ้าย)
               🛑 และไม่ใช่ `overflow-x-auto` แบบม็อกอัพด้วย — ที่ <360px แถว scroll ไม่มี
               affordance ผู้ใช้ไม่รู้ว่ามีช่องที่ 4 อยู่ (iPhone SE, Galaxy Fold ตอนพับ)
               `flex-wrap` ได้ทั้งสองอย่าง: แน่นชิดซ้ายบนจอกว้าง และตกบรรทัดแทนการซ่อนบนจอแคบ
               ไม่มี min-width ต่อช่อง — ความกว้างเท่าป้ายของมันเอง (min-is ที่เคยใส่คือตัวที่ดันให้ห่าง)
               ตัวเลข 22px/800 = ขั้น Metric ของ DESIGN.md ซึ่งสงวน 800 ไว้ให้ตัวเลขโดยเฉพาะ */}
        <div className='flex flex-wrap gap-x-10 gap-y-3 mbs-7'>
          {data.stats.map((s) => (
            <div key={s.label}>
              {/* 🛑 ตัวเลขต้องระบุสีเอง ห้ามปล่อยให้สืบทอด — ค่าที่สืบมาคือ `text.primary` ของ Vuexy
                  ซึ่งเป็น rgba ที่มี alpha < 1 ⇒ ตัวเลขจางกว่าชื่อร้านที่ตั้งสีไว้ตรง ๆ ทั้งที่
                  ควรเป็นของที่เด่นที่สุดรองจากชื่อ (user: "ตัวเลขไม่เด่นพอ" 2026-08-13)
                  32px ต่างจากม็อกอัพ (22px) โดยตั้งใจ — เป็น **ขั้นบนสุดของ Metric ramp**
                  ที่ DESIGN.md ประกาศไว้ (32/22/20) ไม่ใช่เลขที่เลือกเอง; 26px ที่ลองก่อนหน้า
                  หลุด ramp และ detector จับได้ทันที · ป้ายใต้มันคือ 13px ⇒ อัตราส่วน ~2.5:1
                  ทำให้สแกนเจอ "ตัวเลข" ก่อน "คำ" ซึ่งเป็นลำดับที่ผู้ชมโปรไฟล์โซเชียลอ่านจริง */}
              <span
                className='text-[32px] font-extrabold tabular-nums leading-none'
                style={{ letterSpacing: '-0.02em', color: 'var(--mui-palette-text-primary)' }}
              >
                {s.value != null ? compactCount(s.value) : '—'}
              </span>
              {/* 🛑 บังคับสีผ่าน `sx` ไม่ใช่ prop `color` — `variant='caption'` ของธีมชนะ prop
                  แล้วป้ายออกมาเป็น `text.disabled` (0.4) = **2.29:1** ซึ่งตกเกณฑ์ 4.5:1 เกินครึ่ง
                  (วัดจากหน้าจริง critique 2026-08-13 · `text.secondary` 0.7 ให้ 5.24:1)
                  ป้ายพวกนี้คือสิ่งเดียวที่ทำให้ตัวเลข 32px มีความหมาย ถ้าอ่านไม่ออกก็เหลือเลขลอย ๆ
                  และ PRODUCT.md ระบุกลุ่มผู้ใช้เป็นผู้สูงวัย/digital-literacy ต่ำไว้ตรงตัว
                  🛑 `color='text.secondary'` ที่ประกาศไว้ **ไม่มีผลจริง** — คลาสเดียวกับ `color`
                  บน `<h1>` ที่ออกมาเป็น 0.7 ทั้งที่สั่ง `text.primary` (ประกาศ ≠ ผลลัพธ์) */}
              <Typography
                variant='caption'
                className='block mbs-0.5'
                sx={{ color: 'var(--mui-palette-text-secondary)' }}
              >
                {s.label}
              </Typography>
            </div>
          ))}
        </div>

          </div>

        {/* ── ปุ่มลงมือ ──
               ไม่มีปุ่ม "ติดตาม" เพราะระบบไม่มีระบบติดตามจริง — ปุ่มที่กดแล้วไม่เกิดอะไรบนหน้าที่
               ขายความน่าเชื่อถือ ทำลายความน่าเชื่อถือมากกว่าไม่มีปุ่ม
               🛑 ป้ายปุ่มใช้ **ชื่อแพลตฟอร์มสั้น** ไม่ใช่ชื่อเพจ — ชื่อเพจจริงยาวได้ถึง 34 ตัวอักษร
               ซึ่งล้นปุ่มที่ 390px และชื่อเพจแสดงอยู่ในบล็อกเพจทางการด้านล่างแล้ว */}
        {/* 🛑 แถวปุ่ม **ถอดออกจากโฟลว์ทุกขนาดจอ** (`absolute`) ไปเกาะมุมขวาของบล็อกตัวตน
            ให้ก้นปุ่มเสมอก้นรูปโปรไฟล์ — user เลือกผังนี้เอง 2026-08-13 ("มันกินพื้นที่นะ")
            แถวเต็มความกว้างแบบเดิมกิน ~56px ของจอแรกบนมือถือ ซึ่งเป็นพื้นที่ที่ควรเป็นของ
            หลักฐานความน่าเชื่อถือ (เหตุผลทั้งหมดที่หน้านี้มีอยู่)

            `block-start` ต่างกันตาม breakpoint เพราะรูปโปรไฟล์คนละขนาด:
              มือถือ  รูป 88px  → ก้นรูปที่ y=88  ปุ่มสูง 38 ⇒ 50
              ≥900px  รูป 120px → ก้นรูปที่ y=120 ปุ่มสูง 38 ⇒ 82
            🛑 ถ้าวันหนึ่งเปลี่ยนขนาดรูป **ต้องแก้เลขคู่นี้ด้วย** ไม่งั้นปุ่มจะลอยไม่ตรงก้นรูป
            โดยไม่มีอะไรฟ้อง (ทั้งคู่เป็นค่าที่ถูกต้องตามชนิดทุกประการ)

            🛑 ไม่ render ปุ่มสองชุดตาม breakpoint เพราะสองชุด = ลิงก์ซ้ำในลำดับการอ่านของ
            screen reader (มันไม่เห็นว่าตัวหนึ่ง `hidden`) และกด Tab เจอสองรอบ */}
          <div className='flex gap-2 shrink-0 absolute inline-end-5 block-start-[50px] md:block-start-[82px]'>
          {chatHref && chatChannel && (
            <Button
              variant='contained'
              size='large'
              href={chatHref}
              target='_blank'
              rel='noopener noreferrer'
              startIcon={<Icon icon='tabler:message-circle' width={18} />}
              /* ป้ายปุ่มเป็น "ติดต่อร้านค้า" (user สั่ง) — บอก *สิ่งที่จะเกิด* ไม่ใช่ชื่อช่องทาง
                 🛑 ชื่อแพลตฟอร์มยังต้องอยู่ใน accessible name + title เพราะปุ่มนี้ **พาออกนอกเว็บ**
                 ผู้ใช้ควรรู้ปลายทางก่อนกด (โดยเฉพาะ screen reader ที่ไม่เห็นไอคอน) */
              title={`เปิด ${CHANNEL_SHORT_LABEL[chatChannel.provider] ?? 'ช่องทางร้าน'}`}
              aria-label={`ติดต่อร้านค้าผ่าน ${CHANNEL_SHORT_LABEL[chatChannel.provider] ?? 'ช่องทางร้าน'}`}
              /* 🛑 เดสก์ท็อปหด: กว้างเท่าข้อความ (ไม่ใช่ `fullWidth`) และเตี้ยลงเหลือ ~38px
                 เพราะมันไม่ได้อยู่ในระยะนิ้วโป้งแล้ว เกณฑ์ 44px ของ WCAG ผูกกับการแตะ ไม่ใช่เมาส์
                 ผลพลอยได้: โควตา One Voice (ม่วง ≤10%) ลดลงอีกมากบนจอกว้าง
                 media query เขียนเป็น 900px ตรง ๆ เพราะเป็นค่าที่ `--breakpoint-md` ถูกรีแมปไว้
                 🛑 15px = ขั้น Subtitle/Body ของ ramp — **ห้าม 14px** ซึ่งไม่อยู่บน ramp เลย
                 (ผมตั้ง 14 ก่อนเพราะ "อยากให้เล็กลงกว่าเดิม" แล้วเลือกเลขที่ดูพอดีแทนขั้นที่ระบบมี
                 detector จับได้ — เป็นความผิดพลาดตัวเดียวกับที่ ProfileHero เขียนเตือนไว้เองในไฟล์เดิม) */
              sx={{
                inlineSize: 'auto',
                minBlockSize: 38,
                paddingBlock: '5px',
                paddingInline: '16px',
                fontSize: '15px',
                /* ปุ่มที่ตาเห็นสูง 38px แต่พื้นที่แตะจริง 44px ตามเกณฑ์ของโปรเจกต์ —
                   ::after ที่ absolute ไม่กินที่ในโฟลว์ จึงไม่ดันอะไรให้ห่างออกไป */
                position: 'relative',
                '&::after': { content: '""', position: 'absolute', insetBlock: -3, insetInline: 0 },
              }}
            >
              ติดต่อร้านค้า
            </Button>
          )}
          <Button
            variant='outlined'
            size='large'
            color='secondary'
            onClick={share}
            aria-label='แชร์โปรไฟล์นี้'
            /* สี่เหลี่ยม 38×38 เท่าความสูงปุ่มหลัก — ปุ่มสองใบที่สูงไม่เท่ากันในแถวเดียว
               อ่านเป็นของคนละชุด (ดูภาพอ้างอิงของ X: ปุ่มทุกใบสูงเท่ากันหมด) */
            sx={{
              minBlockSize: 38,
              paddingBlock: 0,
              ...(chatHref
                ? { inlineSize: 38, minInlineSize: 38, paddingInline: 0 }
                : { paddingInline: '16px', fontSize: '15px' }),
              position: 'relative',
              '&::after': { content: '""', position: 'absolute', insetBlock: -3, insetInline: 0 },
            }}
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
        </div>
        </div>

        {/* สถานะการคัดลอกต้องประกาศให้ screen reader ด้วย — ไอคอนที่เปลี่ยนรูปเงียบ ๆ ผู้ใช้ SR ไม่รู้เลย */}
        <span role='status' aria-live='polite' className='sr-only'>
          {copied ? 'คัดลอกลิงก์โปรไฟล์แล้ว' : ''}
        </span>
      </div>

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
