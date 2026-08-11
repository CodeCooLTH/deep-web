'use client'

/**
 * ProfileHero — หัวหน้าร้านสาธารณะโฉมใหม่ (mockup อนุมัติ 2026-07-26 ทิศทาง C "กลางหน้า สมมาตร")
 * docs/superpowers/specs/2026-07-26-public-profile-final.html
 *
 * ทำไมจัดกลางแทนชื่อซ้าย-รูปขวา: แบบเดิมเหมือน reference ที่ user ส่งมามากเกินไป และแผ่นเนื้อหา
 * มุมโค้งที่ถูกดึงขึ้นทับแถบสีทำให้เกิดรอยบากสองข้างที่อ่านเป็นความบังเอิญ แบบนี้ให้รูปวงกลม
 * คร่อมรอยต่อแทนมุมโค้ง จึงไม่มีรอยบากและเปลี่ยนแกนการอ่านเป็นบน-ล่าง
 *
 * ลำดับหลักฐานตั้งใจเรียงตามน้ำหนัก: ตัวตนร้าน → ระดับความน่าเชื่อถือ → เหรียญ
 * → ตัวเลขธุรกรรม (อัตราสำเร็จ + ออเดอร์ + ลูกค้า + ซื้อซ้ำ ในแถบเดียว) → ปุ่มคุย
 *
 * 2026-08-09: อัตราสำเร็จเคยเป็นบล็อกแยกที่ให้ตัวเลข 32px ใต้แถวสถิติ — user ทักว่าหัวโปรไฟล์
 * แน่นเกินและเส้นคั่นเยอะ จึงยุบเข้าแถบเดียวกันเพราะเป็นหลักฐานเชิงตัวเลขชุดเดียวกันอยู่แล้ว
 * (เดิมถูกเส้นคั่นแยกเป็นคนละเรื่องโดยไม่มีเหตุผล) ยังเด่นกว่าเพื่อนบ้านด้วยสี Verified Ink
 *
 * เหรียญ/ช่องทาง/รีวิว ที่ไม่มีข้อมูลจะไม่ render เลย — แต่ทุกช่องในแถบตัวเลข
 * แสดงเสมอโดยใส่ 0 ตามที่ user กำหนด 2026-07-26 เพราะเป็นโครงหลักของหน้า ถ้าซ่อนบางช่อง
 * layout จะขยับไปมาระหว่างร้าน และผู้ซื้อแยกไม่ออกว่าช่องที่หายคือไม่มีหรือแค่ไม่แสดง
 *
 * Base: theme/vuexy/typescript-version/full-version/src/@core/components/mui/Avatar.tsx (fallback initials)
 *   + src/app/(marketing)/auth/sign-in/OrderLinkShell.tsx (ภาษาภาพเดียวกัน: รูปเต็มกว้าง + ไล่เงา + สถิติ)
 */
import { useState, useEffect, useRef } from 'react'

import NextLink from 'next/link'

import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'

import { Icon } from '@iconify/react'

// 🛑 ใช้ SVG + ชื่อแบรนด์ตรง ๆ ไม่ใช่ `@components/layout/shared/Logo`
// ตัวนั้นเรียก useVerticalNav() ซึ่ง **throw** เมื่อไม่มี VerticalNavContext ครอบ — หน้าร้านสาธารณะ
// ไม่ได้อยู่ใต้ layout ที่มี provider ตัวนั้น (ต่างจาก dashboard) ใช้แล้วหน้าพังทั้งหน้า
// สองบรรทัดนี้คือสิ่งที่ Logo.tsx render อยู่ข้างในพอดี ลบเฉพาะพฤติกรรมยุบ/กาง sidebar ที่ไม่มีความหมายที่นี่
import VuexyLogo from '@core/svg/Logo'
import themeConfig from '@configs/themeConfig'

import { badgeIconName } from '@/lib/badge-icons'
import { ChannelStrip, type OfficialChannel } from './OfficialChannels'
import ResponsiveSheet from './ResponsiveSheet'
// เกณฑ์ขั้นต่ำอ่านจาก SSOT — ห้าม hardcode เลขในข้อความ ไม่งั้นวันที่เกณฑ์เปลี่ยน
// หน้าจอจะบอกตัวเลขที่ไม่ตรงกับที่ระบบใช้จริง
import { COMPLETION_RATE_MIN_SAMPLE } from '@/lib/order-stats'
import { getTierChipTone } from '@/lib/trust-tier'
import { isClampOverflowing } from '@/lib/clamp-overflow'
import { formatDateTH } from '@/lib/format-date'

/** `imageUrl` = artwork จริงของเหรียญจาก backend — `icon` เป็นแค่ fallback เมื่อเหรียญนั้นยังไม่มีรูป
 *  (badge-icons.ts เขียนกติกานี้ไว้เองว่า "ปกติ render รูป asset จาก badge.imageUrl" แต่ hero
 *   ไม่เคยมี field นี้ให้ส่ง จึงตกไปใช้ fallback ตลอดเวลา ทั้งที่ artwork มีอยู่จริงในโปรเจกต์) */
export type HeroBadge = {
  id: string
  name: string
  nameEN: string
  icon: string
  imageUrl?: string | null
  /** เงื่อนไขที่ทำให้ได้เหรียญนี้ — แปลจาก `Badge.criteria` ที่เป็นเกณฑ์จริง (badge-criteria.ts)
   *  null = เกณฑ์ชนิดที่ยังไม่มีคำแปล → โมดัลไม่แสดงบรรทัดนั้น ไม่ใช่เดาข้อความกลาง ๆ */
  criteriaLabel?: string | null
  /** วันที่ได้รับ (UserBadge.earnedAt) — ISO string เพราะข้าม RSC boundary ห้ามส่ง Date object */
  earnedAtIso?: string | null
}

export type ProfileHeroData = {
  shopName: string
  username: string
  avatar: string | null
  coverImage: string | null
  tierGradient: string
  trustScore: number
  tierLabel: string
  maxVerifyLevel: number
  category: string | null
  memberSince: string
  /** คำอธิบายร้านที่ผู้ขายเขียนเอง (`Shop.description`) — เดิมมีแต่ในแท็บ "เกี่ยวกับร้าน"
   *  ทั้งที่เป็นประโยคเดียวที่ร้านได้พูดแทนตัวเอง ผู้ซื้อที่กวาดตาผ่านหัวโปรไฟล์แล้วไม่เห็น
   *  จะได้แต่ตัวเลขที่ระบบคำนวณให้ ไม่มีเสียงของร้านเลยสักบรรทัด (user 2026-08-10) */
  bio?: string | null
  badges: HeroBadge[]
  totalBadgeCount: number
  completedOrders: number | null
  customerCount: number | null
  repeatCustomerCount: number | null
  completionRate: number | null
  /** feature 00039 — ฐานที่ใช้คำนวณจริง (BR-OSM-07) ต้องแสดงคู่กับ % เสมอ ผู้ซื้อจะได้บวกตามได้
   *  เดิมหน้าจอโชว์แต่ % แล้วเขียนว่า "จากออเดอร์ทั้งหมด" ซึ่งไม่ตรงกับตัวหารจริง */
  completionDenominator?: number
  /** จำนวนใบที่หักออกเพราะไม่ใช่ความผิดร้าน — แสดงเมื่อ > 0 เท่านั้น */
  completionExcluded?: number
  /** ตัวหารยังไม่ถึงเกณฑ์ขั้นต่ำ — ต้องแสดงข้อความอธิบาย ไม่ใช่ซ่อนเงียบ ๆ */
  completionBelowMinSample?: boolean
  /** 🛑 ทั้งสอง field นี้ **ไม่ถูกอ่านใน ProfileHero อีกต่อไป** ตั้งแต่ถอดปุ่มแชทออก 2026-08-10
   *  เก็บไว้เพราะ ShopProfile.tsx ส่ง object ก้อนเดียวกันนี้ต่อให้ component อื่นที่ยังใช้ `shopId`
   *  (เช่นปุ่ม "สอบถามสินค้านี้" ที่การ์ดสินค้า) — ลบออกจะบังคับแก้ caller โดยไม่ได้อะไรกลับมา */
  canChat: boolean
  shopId?: string | null
  /** ระดับถัดไปและระยะห่าง — ทั้งสองหน้าคำนวณจาก getNextTierInfo() อยู่แล้ว แค่ไม่เคยส่งเข้า hero
   *  null = อยู่ระดับสูงสุดแล้ว (แผงอธิบายคะแนนใช้เลือกข้อความ ไม่ใช่ซ่อนบล็อก) */
  nextTierLabel?: string | null
  pointsToNext?: number | null
  /** ร้านที่พักใช้คำคนละชุดกับร้านขายของ — ที่พักไม่มี "ออเดอร์" มีแต่ "การเข้าพัก" */
  isLodging?: boolean
  /** feature 00028 — ร้านสินค้าและบริการใช้คำ "นัดหมาย" แทน "ออเดอร์" (isLodging ชนะถ้าเป็น true ทั้งคู่ — เคสจริงไม่เกิดขึ้น) */
  isServiceQueue?: boolean
  /** อัตราการตอบแชท (FR-RESP) — cron คำนวณไว้แล้ว เกณฑ์ว่าจะโชว์ไหมอยู่ที่ lib/chat-response-display.ts
   *  🛑 อยู่บนโปรไฟล์ ไม่ใช่ในแท็บ "เกี่ยวกับร้าน" (user 2026-08-10) — ความเร็วในการตอบเป็นสิ่งที่
   *  ผู้ซื้อใช้ตัดสินใจ "จะทักดีไหม" ก่อนกดปุ่มทักแชทซึ่งอยู่บนโปรไฟล์ ไม่ใช่ข้อมูลแนะนำตัวของร้าน */
  chatResponseRate?: number | null
  chatMedianResponseSec?: number | null
  chatResponseSampleSize?: number | null
}

/** คำเรียกตัวเลขตามประเภทกิจการ — เปลี่ยนแค่คำ ไม่เปลี่ยนวิธีนับ */
/* feature 00039 — ห้ามใช้คำว่า "ทั้งหมด" กับตัวหารของอัตราสำเร็จ
   ตัวหารไม่เคยรวมใบที่ยังไม่ปิดจบ (รอชำระ/กำลังส่ง) และยังหักใบที่ผู้ซื้อไม่รับออกอีก
   "ทั้งหมด" จึงเป็นคำที่พูดเกินจริงบนหน้าที่ขายความโปร่งใสเป็นจุดยืน
   (ป้ายเต็ม `rateCaption` ถูกถอดออก 2026-08-09 ตอนยุบ % เข้าแถบตัวเลข — ช่องกว้างไม่พอ
   ใส่ประโยคเต็ม ป้ายจึงเหลือ "อัตราสำเร็จ" และตัวหารไปอยู่บรรทัดเล็กใต้ป้ายแทน) */
/* 🛑 `repeat` เคยเขียน "ลูกค้าใช้บริการซ้ำ" เหมือนกันทั้ง 3 ชุด ทั้งที่ตารางนี้มีไว้แยกคำตามโดเมน
   ร้านขายอะไหล่มอเตอร์ไซค์ไม่ได้ "ให้บริการ" ลูกค้าเขา "ซื้อ" — คำที่ผิดโดเมนบนหน้าที่ผู้ซื้อใช้
   ตัดสินใจ อ่านเป็นข้อความที่ระบบเติมมาเอง ไม่ใช่ข้อมูลของร้านนี้
   (บทเรียนเดียวกับ docs/conventions/… ผันคำตาม vertical ต้องผันทั้งประโยค ไม่ใช่แทนคำนามตัวเดียว) */
const STAT_LABELS = {
  general: {
    orders: 'ออเดอร์',
    /* 🛑 ย่อจาก 'จำนวนลูกค้า'/'ลูกค้าซื้อซ้ำ' เมื่อ 2026-08-10 ตอนยุบเป็น 4 คอลัมน์แถวเดียว —
       ที่ 390px ช่องละ ~87px คำ 11 อักขระที่ 12px จะตกบรรทัดไม่เท่ากันแล้วแถวสูงเบี้ยว
       ยังผันตาม vertical ครบเหมือนเดิม ไม่ได้เพิ่มคีย์ใหม่ */
    customers: 'ลูกค้า',
    repeat: 'ซื้อซ้ำ',
    /** ลักษณนามที่ใช้กับ "จำนวนที่ปิดจบ" — ต่างกันตามโดเมน ไม่ใช่แทนคำนามเฉย ๆ */
    unitLabel: 'ใบ',
    /** คำเต็มที่ใช้แทน "ใบที่ปิดจบ" ซึ่งเป็นศัพท์ภายใน — ผู้ซื้อทั่วไปต้องเดาทั้งกริยาและลักษณนาม */
    settledPhrase: 'ออเดอร์ที่จบแล้ว',
  },
  lodging: {
    orders: 'การเข้าพัก',
    customers: 'ลูกค้า',
    repeat: 'พักซ้ำ',
    unitLabel: 'ครั้ง',
    settledPhrase: 'การเข้าพักที่จบแล้ว',
  },
  serviceQueue: {
    orders: 'นัดหมาย',
    customers: 'ลูกค้า',
    repeat: 'ใช้ซ้ำ',
    unitLabel: 'งาน',
    settledPhrase: 'นัดหมายที่จบแล้ว',
  },
} as const

/**
 * องค์ประกอบของคะแนนความน่าเชื่อถือ — ตัวเลขระดับแพลตฟอร์ม (SSOT: PRODUCT.md / docs/PRD.md)
 * ไม่ใช่ breakdown รายร้าน เพราะ `ProfileHeroData` ไม่มี sub-score ต่อองค์ประกอบให้แสดง
 * ถ้าวันหนึ่งจะโชว์ของจริงรายร้าน ต้องเพิ่ม field ใหม่ ไม่ใช่เดาจากตัวเลขชุดนี้
 */
const TRUST_FACTORS = [
  { icon: 'lucide:shield-check', label: 'ยืนยันตัวตน', weight: '35%' },
  { icon: 'lucide:package', label: 'ประวัติออเดอร์', weight: '25%' },
  { icon: 'lucide:star', label: 'คะแนนรีวิว', weight: '20%' },
  { icon: 'lucide:calendar', label: 'อายุร้าน', weight: '10%' },
  { icon: 'lucide:medal', label: 'เหรียญตรา', weight: '10%' },
] as const

/** คะแนนเต็มของ Trust Score (SSOT: docs/10 - Business Rules/Tier Lists.md — สเกล 0–100) */
const TRUST_SCORE_MAX = 100

/** จำนวนเหรียญที่โชว์เป็นไอคอน ที่เหลือยุบเป็นตัวนับ — กันแถวยาวจนดันเนื้อหาสำคัญตกจอ */


/**
 * รูปที่ยอมให้โหลดพังได้ — คืน `fallback` เมื่อไม่มี URL **หรือ** โหลดไม่สำเร็จ
 *
 * 🛑 `fallback` เพิ่มเข้ามาเพราะเดิมผู้เรียกเช็คเองว่า `!data.avatar` แล้วค่อยโชว์ตัวอักษรแรกของ
 * ชื่อร้าน ซึ่งเป็นคนละคำถามกับ "โหลดสำเร็จไหม" — รูปที่มี URL อยู่จริงแต่โหลดพัง (ไฟล์หาย/
 * โดเมน OAuth หมดอายุ) จึงได้วงกลมสี primary เปล่า ๆ ไม่มีอะไรอยู่ข้างในเลย ทั้งที่ตัวอักษรแรก
 * มีอยู่พร้อมใช้ตลอด. เงื่อนไขต้องอยู่ที่เดียวกับ state ที่รู้ว่าพัง ไม่ใช่ที่ผู้เรียก
 */
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
  // eslint-disable-next-line @next/next/no-img-element -- URL หลากโดเมน (storage/CDN/OAuth) ตาม pattern
  // ShopAvatar เดิมใน ChooseShopClient.tsx ที่ fallback initials เมื่อโหลดรูปไม่ได้
  return <img src={src} alt={alt} className={className} onError={() => setFailed(true)} />
}

/**
 * BadgeArtwork — รูปเหรียญจริง แล้วค่อยตกไปที่ไอคอนเส้นเมื่อไม่มี/โหลดพัง
 *
 * ทำไมไม่ import `BadgeIcon` จาก (buyer-app)/_components ตรง ๆ ตามที่ ux เสนอ:
 * ตัวนั้นบังคับ `objectFit:'cover'` ซึ่งเขียนไว้สำหรับกรอบวงกลม 32px ของหน้า /badges —
 * artwork ของเหรียญเป็นภาพประกอบรูปเหรียญ/ริบบิ้น ไม่ใช่ภาพถ่ายสี่เหลี่ยม `cover` ในกรอบ 15px
 * จะครอปขอบลายทิ้ง ที่นี่ต้อง `contain` และไม่ควรไปแก้ default ของ component กลาง
 * เพราะบริบท 32px ที่อื่นอาจตั้งใจให้เต็มกรอบจริง ๆ
 */
function BadgeArtwork({
  imageUrl,
  nameEN,
  icon,
  alt,
  size = 48,
}: {
  imageUrl?: string | null
  nameEN: string
  icon: string
  alt: string
  /** ขนาด artwork ภายในวงกลม — 48 ใน 56 = เต็มตาแบบ ref เหลือขอบบางไว้ไม่ให้ลายชนขอบวง */
  size?: number
}) {
  const [failed, setFailed] = useState(false)
  if (imageUrl && !failed) {
    // eslint-disable-next-line @next/next/no-img-element -- asset ใน public/ + storage หลากโดเมน
    return (
      <img
        src={imageUrl}
        alt={alt}
        width={size}
        height={size}
        loading='lazy'
        onError={() => setFailed(true)}
        // 24 ใน 26 = artwork กินเกือบเต็มวง เหลือขอบขาวบางเฉียบไว้แยกเหรียญออกจากพื้นชิป
        // (user 2026-08-10 "อยากให้ badge มันเต็ม ๆ circle มากกว่านี้ ให้เน้นการแสดง badge ให้ชัดขึ้น")
        // ยัง contain ไม่ใช่ cover — artwork เป็นรูปเหรียญ/ริบบิ้น cover จะครอปขอบลายทิ้ง
        style={{ width: size, height: size, objectFit: 'contain' }}
      />
    )
  }
  // เหรียญที่ยังไม่มี artwork — ไอคอนเส้นเล็กกว่ารูปจริงเล็กน้อย เพราะ glyph เส้นเต็มวงจะดูหนา
  // เกินจนแย่งสายตาไปจากเหรียญที่มีลายจริง
  // 🛑 เหรียญ 11/20 ใบในระบบยังไม่มี artwork และตกมาที่ไอคอนเส้น — ถ้าปล่อยจาง (opacity .6 เทา)
  // มันจะดูอ่อนกว่าเหรียญ pixel-art ที่สีจัดข้าง ๆ จนทั้งแถวอ่านเป็น "บางใบโหลดไม่มา"
  // ใช้สี primary เต็มความเข้ม: เป็นสีของระบบ ไม่ใช่การประดิษฐ์ความหมายใหม่ให้เหรียญแต่ละใบ
  // (เขียวสงวนให้ "ยืนยันแล้ว" · ส้มสงวนให้ "เตือน" ตาม DESIGN.md จึงใช้ไม่ได้ที่นี่)
  return (
    <Icon
      icon={badgeIconName(nameEN, icon)}
      width={Math.round(size * 0.58)}
      className='shrink-0 text-primary'
    />
  )
}

export default function ProfileHero({
  data,
  channels = [],
}: {
  data: ProfileHeroData
  /** ช่องทางที่ยืนยันแล้ว — ย้ายมาจากแท็บ "เกี่ยวกับร้าน" (user 2026-08-09 "เอา page ที่เชื่อมต่อ
   *  ออกมาไว้ข้างล่าง slug") ผู้ซื้อจำนวนมากรู้จักเพจของร้านก่อนรู้จัก Deep การเห็นชื่อเพจเดียวกับ
   *  ที่เคยเห็นในฟีดคือหลักฐานว่ามาถูกร้าน จึงควรอยู่ใกล้ตัวตนร้าน ไม่ใช่ซ่อนหลังแท็บ */
  channels?: OfficialChannel[]
}) {
  // สีของช่วงระดับในชิปคะแนน — ผ่านคอนทราสต์แล้วทุกระดับ (ดูเหตุผลใน lib/trust-tier.ts)
  const tierTone = getTierChipTone(data.trustScore)

  const L = data.isLodging ? STAT_LABELS.lodging : data.isServiceQueue ? STAT_LABELS.serviceQueue : STAT_LABELS.general

  // แสดงครบทุกช่องเสมอ ไม่มีข้อมูลให้เป็น 0 (user กำหนด 2026-07-26) — ต่างจากบล็อกอื่นในหน้านี้
  // ที่ซ่อนเมื่อไม่มีข้อมูล เพราะช่องพวกนี้เป็นโครงหลักของหน้า การซ่อนบางช่องทำให้ layout ขยับ
  // ไปมาระหว่างร้าน และผู้ซื้อเทียบสองร้านกันไม่ได้ว่าช่องที่หายไปคือไม่มีหรือแค่ไม่แสดง
  //
  // อัตราความสำเร็จย้ายเข้ามาเป็นช่องแรก (user 2026-08-09) — เดิมเป็นบล็อกแยกใต้แถวนี้
  // ทั้งที่เป็นหลักฐานเชิงตัวเลขชุดเดียวกัน ถูกเส้นคั่นแยกเป็นคนละเรื่องโดยไม่มีเหตุผล
  //
  // 🛑 `hint` คือตัวหารที่ BR-OSM-07 (feature 00039) บังคับว่าต้องแสดงคู่ % เสมอ —
  // % ที่ผู้ซื้อคำนวณย้อนกลับไม่ได้คือ % ที่ไม่มีใครเชื่อ ห้ามตัดทิ้งตอนย้ายเข้ามาในแถว
  // และเมื่อยังไม่ถึงเกณฑ์ขั้นต่ำต้องขึ้น "ยังสรุปไม่ได้" ไม่ใช่หายเงียบหรือแสดง 0%
  // 🛑 ลำดับใหม่ (user เคาะ 2026-08-10): ออเดอร์ · ลูกค้า · ซื้อซ้ำ · อัตราสำเร็จ
  // เดิมอัตราสำเร็จอยู่ช่องแรก แต่มันเป็น "ผลสรุป" ของสามช่องแรก การอ่านผลสรุปก่อนตัวตั้งทำให้
  // ผู้ซื้อไม่รู้ว่า % นั้นมาจากฐานเท่าไหร่ — และช่องนี้เป็นช่องเดียวที่อาจกดได้ วางท้ายสุด
  // จึงไม่ทำให้ผู้ใช้เผลอกดตอนกวาดตาจากซ้าย
  //
  // `interactive` = เซลล์นี้เปิดแผงอธิบายได้ — เฉพาะตอนมีอะไรให้อธิบายจริงเท่านั้น
  // ถ้าข้อมูลครบต้องเป็น static ไม่ใช่ปุ่มที่กดแล้วไม่มีอะไรเกิดขึ้น
  const stats = [
    { value: data.completedOrders ?? 0, label: L.orders, highlight: false, interactive: false },
    { value: data.customerCount ?? 0, label: L.customers, highlight: false, interactive: false },
    { value: data.repeatCustomerCount ?? 0, label: L.repeat, highlight: false, interactive: false },
    data.completionRate != null
      ? {
          value: `${data.completionRate}%`,
          label: 'อัตราสำเร็จ',
          highlight: true,
          interactive: Boolean(data.completionExcluded),
        }
      : {
          value: '—',
          label: 'อัตราสำเร็จ',
          highlight: false,
          interactive: Boolean(data.completionBelowMinSample),
        },
  ]


  // E2 — แผงอธิบายคะแนน เปิดได้จาก 2 ทาง (เช็คเขียว "ยืนยันตัวตนแล้ว" กับไอคอนข้อมูล) แต่ปลายทางเดียว
  // รวมเป็นแผงเดียวเพราะการยืนยันตัวตนคือองค์ประกอบที่มีน้ำหนักสูงสุดของคะแนน (35%) แยกกันจะซ้ำกันเอง
  // และแก้ปัญหาเดิมที่เช็คเขียวสื่อความหมายด้วย `title` อย่างเดียว — มือถือไม่มี hover จึงไม่มีทางรู้
  const [scorePanelOpen, setScorePanelOpen] = useState(false)

  // แผงอธิบายอัตราสำเร็จ — ประโยคยาวย้ายมาอยู่หลังการแตะแทนที่จะ inline เสมอ (user 2026-08-10
  // "static กินพื้นที่เยอะมาก") ตัวเลข 4 ช่องยังอยู่ครบตามมติ 2026-07-26 ไม่แตะแม้แต่ช่องเดียว
  const [completionPanelOpen, setCompletionPanelOpen] = useState(false)

  // ── คำอธิบายร้าน: ย่อ 2 บรรทัด กดดูเพิ่มเติมได้ (user 2026-08-10 "ข้างบนมันแน่น") ──
  // 🛑 ปุ่ม "ดูเพิ่มเติม" โผล่เฉพาะตอนข้อความล้นจริง ไม่ใช่เดาจากจำนวนตัวอักษร — จำนวนตัวอักษร
  // บอกไม่ได้ว่าจะตก 2 บรรทัดไหม เพราะขึ้นกับความกว้างกล่องและการตัดคำของภาษาไทยที่ไม่มีช่องว่าง
  // ระหว่างคำ (บทเรียนเดียวกับปุ่มกางเหรียญที่ user ทักไปเมื่อเช้าว่าโผล่ตลอด — lib/clamp-overflow.ts)
  const bioRef = useRef<HTMLParagraphElement>(null)
  const [bioExpanded, setBioExpanded] = useState(false)
  const [bioOverflows, setBioOverflows] = useState(false)

  useEffect(() => {
    const el = bioRef.current
    if (!el) return
    // วัดตอน "ย่ออยู่" เท่านั้น — ตอนกางแล้ว scrollHeight = clientHeight เสมอ ถ้าวัดตอนนั้น
    // ปุ่มจะหายไปทันทีที่กด แล้วผู้ใช้ย่อกลับไม่ได้
    const update = () => {
      if (bioExpanded) return
      setBioOverflows(isClampOverflowing(el.scrollHeight, el.clientHeight))
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [bioExpanded, data.bio])

  // เหรียญที่กดเปิดดูรายละเอียดอยู่ — null = ปิด (user 2026-08-10 "อยากให้ badge กดได้ แล้วมี modal
  // ขึ้นมาแสดงว่าเค้าได้จากเงื่อนไขอะไร เมื่อไหร่ เน้นให้ buyer อ่านแล้วเชื่อมั่นในร้าน")
  /* 🛑 โมดัลรายละเอียดเหรียญ **เข้าไม่ถึงตั้งแต่ 2026-08-10** — ไม่มีใครเรียก `setOpenBadge(b)`
     อีกแล้วหลังถอดกริดเหรียญที่กดได้ออก (user ไม่เอาการกางในหน้า)

     คงไว้โดยตั้งใจ ไม่ใช่ลืม: นี่คือชิ้นส่วนของปลายทางที่ user ต้องการจริง — "กดแล้วเป็น modal
     หรือเปลี่ยนหน้าไปเลย ซึ่งยังไม่มีตอนนี้" วันที่ทำโมดัลรวมเหรียญ (หรือ route ของเหรียญ)
     ตัวนี้คือเนื้อหาต่อ 1 ใบที่เอาไปใช้ได้ทันที

     🛑 ถ้าอ่านถึงตรงนี้แล้วยังไม่มีใครเรียก และไม่มีแผนจะทำโมดัลแล้ว — ลบทิ้ง อย่าปล่อยไว้
     เพราะโค้ด UI ที่เข้าไม่ถึงจะกลายเป็นสิ่งที่คนอ่านเชื่อว่ายังทำงานอยู่ */
  const [openBadge, setOpenBadge] = useState<HeroBadge | null>(null)

  return (
    <div className='is-full'>
      {/* ── ปก: รูปจริงถ้าร้านอัปโหลด ไม่งั้นใช้ไล่สีตามระดับความน่าเชื่อถือ ──
             176 → 200 → 224px **เท่ากันทั้งสองกรณี** (user ทัก 2026-08-10 รอบสอง "cover ก็เล็ก"
             หลังจากรอบแรกยกจาก 104 เป็น 132/144–224 แล้วยังไม่พอ)
             ที่ 390px ได้ 2.2:1 ใกล้เคียง Facebook Page cover (2.63:1) · ที่ 960px ได้ 4.29:1

             🛑 เดิมแยกความสูง 2 กรณี (มีรูป > ไล่สี) ด้วยเหตุผลว่า "ของจริงควรได้พื้นที่มากกว่า
             ของตกแต่ง" — ยกเลิกแล้ว เพราะผลข้างเคียงคือ **หน้าร้านสองร้านสูงไม่เท่ากัน** ซึ่งขัด
             หลักที่ไฟล์นี้ยึดมาตลอดว่า layout ต้องคงที่ข้ามร้านเพื่อให้ผู้ซื้อเทียบกันได้
             (หลักเดียวกับที่บังคับให้แถบตัวเลขแสดงครบ 4 ช่องเสมอแทนการซ่อนช่องว่าง)

             แลกด้วย: ร้านที่ยังไม่อัปโหลดปกได้แถบไล่สีสูง 176–224px ซึ่งเป็นพื้นที่ตกแต่งล้วน
             และร้านระดับ Deep Star จะได้ม่วงกินพื้นที่มากขึ้น — จึงเจือจางไล่สีของ Star ลง 1 ขั้น
             ไปแล้วในรอบก่อน (getTierGradient) ให้ยังอยู่ในเพดาน One Voice

             ไม่แตะ -mbs-[42px] ของบล็อกถัดไป — 42 คือครึ่งของรูป 84px ผูกกับ "ขนาดรูป"
             ไม่ใช่ "ความสูงปก" */}
      <div
        className='relative overflow-hidden bs-[176px] sm:bs-[200px] md:bs-[224px]'
        style={{ background: data.tierGradient }}
      >
        <ProfileImg src={data.coverImage} alt='' className='absolute inset-0 is-full bs-full object-cover' />

        {/* ── E1: ตราแบรนด์ Deep ──
            ก่อนหน้านี้ทั้งหน้าไม่มีตราแบรนด์อยู่เลยแม้แต่จุดเดียว ((marketing)/layout.tsx ไม่ render
            header/navbar ใด ๆ) ผู้ชมที่ไม่รู้จัก Deep จึงแยกไม่ออกว่านี่คือหน้าที่ "บุคคลที่สามรับรอง"
            หรือหน้าที่ร้านทำเอง — ซึ่งทำให้หลักฐาน trust ทั้งชุดบนหน้านี้เสียน้ำหนักไปพร้อมกัน

            พื้นทึบ (paper) ไม่ใช่ไล่เงา: ปกมี 2 กรณี (รูปจริงของร้าน / ไล่สี tier ที่เราสร้างเอง)
            พื้นทึบอ่านออกทั้งคู่ด้วยกลไกเดียว ไม่ต้องแตกสไตล์ตาม coverImage — และ token Photo Scrim
            มีขอบเขตเฉพาะ "ทับรูปภาพ" ไล่สี tier เป็นผิวของเราเอง ไม่เข้าข่าย
            เล็กโดยตั้งใจ: ร้านคือพระเอกของหน้า Deep เป็นผู้รับรอง ไม่ใช่เจ้าของเวที */}
        <NextLink
          href='/'
          aria-label={`${themeConfig.templateName} — กลับหน้าแรก`}
          // p-2.5 เป็น hit-area ที่มองไม่เห็น ดัน tap target รวมให้ถึง 44px ตามเกณฑ์ AA
          // ขณะที่ pill ที่ตาเห็นยังสูงราว 30px (ไม่ให้แย่งสายตาไปจากชื่อร้าน)
          className='absolute inset-block-start-0 inset-inline-start-0 p-2.5 no-underline'
        >
          <span className='inline-flex items-center gap-1.5 rounded-full plb-1.5 pli-3 bg-[var(--mui-palette-background-paper)] shadow-sm'>
            <VuexyLogo className='text-primary' style={{ fontSize: 16 }} />
            <span className='text-[13px] font-bold text-[var(--mui-palette-text-primary)]'>
              {themeConfig.templateName}
            </span>
          </span>
        </NextLink>
      </div>

      {/* ── ตัวตนร้าน: รูปวงกลมคร่อมรอยต่อระหว่างปกกับเนื้อหา แทนการใช้มุมโค้งทับ ── */}
      {/* ── จังหวะแนวตั้งของหัวโปรไฟล์ (ตั้งเป็นระบบเดียว 2026-08-10) ──
             ระหว่าง "บล็อกใหญ่" (ตัวตน · เพจ · เหรียญ · ตัวเลข) = **16px เสมอ**
             ภายในบล็อก = 4–10px

             🛑 วิธีนับ: แถวที่มี `min-bs-[44px]` (แถวเพจ) มีที่ว่างในตัวข้างละ ~12px อยู่แล้ว
             เพราะเนื้อหาจริงสูงแค่ ~20px แล้วถูกจัดกลาง — บล็อกที่อยู่ติดกับมันจึงใส่ padding
             แค่ 4px ก็ได้ระยะจริง 16px ส่วนบล็อกที่ไม่มี min-height (แถวเหรียญ) ต้องใส่เต็ม

             ผมพลาดข้อนี้มา 2 รอบในวันเดียว — รอบแรกใส่ padding เต็มทุกบล็อกแล้วได้ 24px
             (user: "มันห่าง ๆ กันไงไม่รู้") รอบสองถอด padding ออกหมดแล้วได้ ~12px และติดกันเป็นพืด
             (user: "มันแออัดกันสุด ๆ") ทั้งสองรอบผมแก้ทีละจุดโดยไม่มีเลขกลางให้ยึด */}
      <div className='text-center pli-5 pbe-1 -mbs-[42px] relative'>
        {/* 🛑 กล่องนอกต้อง **ไม่มี** overflow-hidden ไม่งั้นป้ายระดับที่ absolute อยู่มุมล่างขวาโดนตัดหาย
            วงกลมที่ครอบรูปเป็นชั้นในต่างหากที่ถือ overflow-hidden ไว้ */}
        <div className='relative is-[84px] bs-[84px] mli-auto mbe-2.5'>
          <div className='is-full bs-full rounded-full border-4 overflow-hidden bg-primary flex items-center justify-center text-white text-3xl font-extrabold border-[var(--mui-palette-background-paper)]'>
            <ProfileImg
              src={data.avatar}
              alt={data.shopName}
              className='is-full bs-full object-cover'
              fallback={data.shopName.trim().charAt(0)}
            />
          </div>
          {/* ระดับการยืนยันตัวตนติดที่รูปร้าน (user 2026-08-10) — เขียนคำเต็ม "ระดับ N" ไม่ใช่เลขลอย
              เพราะเลขในวงกลมมุมรูปโปรไฟล์อ่านเป็น "จำนวนแจ้งเตือน" ตามความคุ้นของทุกแอป
              ใช้เขียว success ถูกตามกฎ Verified-Means-Green (ระดับ > 0 = ยืนยันแล้วจริง)
              maxVerifyLevel = 0 → ไม่ render เลย ไม่ใช่ขึ้น "ระดับ 0" ซึ่งอ่านเป็นตราลบ */}
          {data.maxVerifyLevel > 0 && (
            <span
              className='absolute inline-end-[-4px] block-end-0 inline-flex items-center gap-1 rounded-full plb-0.5 pli-2 text-[11px] font-bold bg-success text-white border-2 border-[var(--mui-palette-background-paper)] whitespace-nowrap'
              title={`ยืนยันตัวตนระดับ ${data.maxVerifyLevel}`}
            >
              <Icon icon='lucide:shield-check' width={11} />
              {`ระดับ ${data.maxVerifyLevel}`}
            </span>
          )}
        </div>

        <Typography component='h1' className='text-xl font-extrabold' sx={{ letterSpacing: '-0.02em' }}>
          {data.shopName}
          {/* 🛑 เช็คยืนยันตัวตนย้ายมาต่อท้าย "ชื่อร้าน" (user 2026-08-10) — เดิมอยู่หน้าชิปคะแนน
              ซึ่งผิดที่ เพราะมันเป็นคุณสมบัติของ *ชื่อร้าน* ไม่ใช่ของ *คะแนน* และเป็นแพตเทิร์น
              verified badge ที่ทุกแพลตฟอร์มใช้ตรงกัน ผู้ซื้อจึงอ่านออกโดยไม่ต้องเรียนรู้ใหม่

              ยังเป็น <button> จริงเหมือนเดิม ไม่ใช่ <span> ที่มีแต่ `title` — มือถือไม่มี hover
              ความหมายจึงต้องมาจาก aria-label · p-3.5 เป็น hit-area ที่มองไม่เห็น ดันวง 18px
              ให้รวมเป็น 46px ผ่านเกณฑ์ 44px โดยที่ตาเห็นวงเท่าเดิม
              (<button> ซ้อนใน <h1> ถูกตามสเปก HTML — h1 รับ inline interactive content ได้
              และ screen reader จะอ่านชื่อร้านต่อด้วย "ยืนยันตัวตนแล้ว" ซึ่งให้บริบทมากขึ้น) */}
          {data.maxVerifyLevel > 0 && (
            <button
              type='button'
              onClick={() => setScorePanelOpen(true)}
              aria-haspopup='dialog'
              aria-expanded={scorePanelOpen}
              aria-controls='trust-score-panel'
              aria-label='ยืนยันตัวตนแล้ว — แตะเพื่อดูรายละเอียดคะแนนความน่าเชื่อถือ'
              /* 🛑 พื้นที่แตะทำด้วย `after:` ที่ absolute ไม่ใช่ padding จริง — padding 14px รอบวง 18px
                  ให้ hit area 46px ก็จริง แต่มัน **ขยายกล่องของปุ่มไปด้วย** ซึ่งอยู่ในบรรทัดชื่อร้าน
                  → line box ของ <h1> โตขึ้น 28px แล้วดันชิปคะแนนกับบรรทัดที่เหลือห่างลงไปทั้งชุด
                  (user 2026-08-10: "ระยะมันห่างไป จากชื่อร้านลงมา")
                  `after:inset-[-13px]` ให้พื้นที่แตะ 44px เท่าเดิมโดยไม่กินที่ในโฟลว์เลย */
              className='relative inline-flex items-center justify-center align-middle border-0 bg-transparent p-0 mis-1.5 cursor-pointer after:absolute after:inset-[-13px] after:content-[""] rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--mui-palette-primary-main)]'
            >
              <span
                title='ยืนยันตัวตนแล้ว'
                className='is-[18px] bs-[18px] rounded-full bg-success text-white flex items-center justify-center'
              >
                <Icon icon='lucide:check' width={11} />
              </span>
            </button>
          )}
        </Typography>

        {/* ── ชิปคะแนน: พิลเดียว 2 ช่วง (user เคาะแบบ T2 เมื่อ 2026-08-10) ──
            เดิมเป็น "ชิป 2 ก้อนที่ไม่เกี่ยวกัน" วางต่อกัน — ก้อนดำบอกตัวเลข ก้อนเทาบอกชื่อระดับ
            ทั้งที่มันคือของชิ้นเดียวกัน (78 คะแนน → เพราะงั้นถึงเป็น Deep Gold)

            และที่สำคัญกว่า: ก้อนระดับใช้พื้นเทากลาง ๆ ทำให้ **Deep Gold กับ Deep Classic
            หน้าตาเหมือนกันเป๊ะ** แยกได้ด้วยการอ่านตัวหนังสืออย่างเดียว ทั้งที่สีประจำระดับมีอยู่แล้ว
            ในระบบและปกก็ใช้สีชุดนี้อยู่ — มีแต่ชิปที่ไม่ใช้ (getTierChipTone ใน lib/trust-tier.ts)

            `/100` เล็กลงและจาง = ตัวเลขจริงเด่นขึ้นโดยไม่ต้องขยายพิล แต่ยังมีบริบทให้คนที่
            กวาดตาผ่านรู้ว่า 26 นั้นเทียบกับอะไร (เหตุผลเดิมตอนเพิ่ม /100 เข้ามา ยังใช้อยู่) */}
        <div className='flex items-center justify-center gap-0.5 flex-wrap mbs-1.5'>
          <span className='inline-flex items-stretch rounded-full overflow-hidden'>
            {/* 15px = ขั้น "h6 / Subtitle / Body" ของ ramp (DESIGN.md §Typography) ไม่ใช่ 14px
                ซึ่งไม่อยู่บน ramp เลย — ผมตั้ง 14 ตอนแรกเพราะอยากให้ใหญ่กว่า 13px ของชิปเดิม
                แล้วเลือกเลขที่ "ดูพอดี" แทนที่จะเลือกขั้นถัดไปที่ระบบมีอยู่ (impeccable hook จับได้) */}
            <span className='inline-flex items-center plb-1 pli-2 text-[15px] font-extrabold tabular-nums leading-none bg-[var(--mui-palette-text-primary)] text-[var(--mui-palette-background-paper)]'>
              {data.trustScore}
              <span className='text-[11px] font-bold opacity-65'>{`/${TRUST_SCORE_MAX}`}</span>
            </span>
            <span
              className='inline-flex items-center plb-1 pli-2.5 text-[13px] font-bold leading-none'
              style={{ background: tierTone.bg, color: tierTone.text }}
            >
              {data.tierLabel}
            </span>
          </span>
          {/* ทางลึกสำหรับคนที่อยากรู้ว่าคะแนนมาจากไหน (progressive disclosure) — กดเท่านั้น ไม่ใช้ hover
              min-bs/min-is 44px บังคับตรง ๆ แทนการคำนวณจาก padding (ไอคอน 15px + p-2 ได้แค่ 31px) */}
          <button
            type='button'
            onClick={() => setScorePanelOpen(true)}
            aria-haspopup='dialog'
            aria-expanded={scorePanelOpen}
            aria-controls='trust-score-panel'
            aria-label='ดูวิธีคำนวณคะแนนความน่าเชื่อถือ'
            /* เหตุผลเดียวกับเช็คเขียว — 44px จริงในแถวที่พิลสูง ~28px จะดันแถวทั้งแถวให้สูงขึ้น */
            className='relative flex items-center justify-center border-0 bg-transparent p-0 mis-0.5 cursor-pointer text-[var(--mui-palette-text-secondary)] after:absolute after:inset-[-15px] after:content-[""] rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--mui-palette-primary-main)]'
          >
            <Icon icon='lucide:info' width={15} />
          </button>
        </div>

        {/* วันเปิดร้านอยู่ **บรรทัดเดียวกับ slug** (user 2026-08-10 "ย้ายขึ้นไปไว้ข้างๆ slug ร้าน")
            สองค่านี้เป็น "ตัวระบุร้าน" เหมือนกัน — ชื่อที่ใช้เรียก กับ อายุที่ใช้ประเมิน — ผู้ซื้อ
            อ่านคู่กันในการกวาดตาครั้งเดียว ส่วนหมวดหมู่เป็น "ขายอะไร" ซึ่งเป็นคำถามคนละข้อ
            จึงอยู่ใต้คำอธิบายร้านที่ตอบคำถามเดียวกัน */}
        <Typography variant='caption' color='text.secondary' className='block mbs-1'>
          {[`@${data.username}`, `เปิดร้านตั้งแต่ ${data.memberSince}`].join(' · ')}
        </Typography>

        {/* คำอธิบายร้าน — ลำดับตามที่ user วางเอง (2026-08-10): รูป → ชื่อ/slug → คำอธิบาย →
            หมวด+วันเปิดร้าน → ช่องทาง. เหตุผลของลำดับนี้คือมันไล่จาก "ร้านนี้คือใคร" ไป
            "ร้านนี้ขายอะไร" ไป "ทักได้ทางไหน" ซึ่งเป็นลำดับที่คนอ่านจริง

            🛑 ตัวหนังสือ 14px สีหลัก ไม่ใช่ caption สีรอง — นี่คือประโยคเดียวในหน้าที่ร้านเขียนเอง
            ทุกบรรทัดที่เหลือเป็นข้อมูลที่ระบบคำนวณ/ดึงมา ถ้าจับมันไปอยู่ชั้นสีรองเท่ากับบอกว่า
            เสียงของร้านสำคัญน้อยกว่าเลขที่ระบบเติมให้
            จำกัด 3 บรรทัดแล้วตัด — คำอธิบายยาว ๆ จะดันแถวช่องทาง/เหรียญ/ตัวเลขตกจอแรกไปหมด
            ตัวเต็มอ่านได้ที่แท็บ "เกี่ยวกับร้าน" ซึ่งยังแสดงครบเหมือนเดิม */}
        {data.bio?.trim() ? (
          /* ── คำอธิบายร้าน: กดที่ตัวข้อความเพื่อกาง ไม่มีปุ่มแยกบรรทัด ──
             user 2026-08-10: "เอาดูเพิ่มเติมออก แต่เปลี่ยนเป็น ... หรือทำให้ดูกดได้"

             เดิมปุ่ม "ดูเพิ่มเติม" กินทั้งบรรทัด (~26px) เพื่อบอกสิ่งที่ `…` ของ line-clamp
             บอกอยู่แล้ว — ตอนนี้ตัวข้อความเองเป็นปุ่ม และมีคำว่า "เพิ่มเติม" สีหลักซ้อนอยู่
             ท้ายบรรทัดสุดท้าย (แพตเทิร์นเดียวกับ Instagram/Facebook) = ได้ทั้ง `…` และสัญญาณว่ากดได้
             โดยไม่กินบรรทัดใหม่เลย

             🛑 ตัวซ้อนต้องมีพื้น paper ทึบ ไม่ใช่โปร่ง — มันวางทับตัวหนังสือที่ยังอยู่ข้างใต้
             (line-clamp ไม่ได้ลบข้อความ แค่ซ่อน) ถ้าโปร่งจะเห็นตัวอักษรซ้อนกันเป็นเงา

             🛑 `bioOverflows` มาจากการวัดจริง ไม่ใช่นับตัวอักษร — ข้อความไทยไม่มีช่องว่างระหว่างคำ
             จำนวนอักขระบอกไม่ได้ว่าจะตก 2 บรรทัดไหม (lib/clamp-overflow.ts) */
          <Typography
            ref={bioRef}
            component={bioOverflows ? 'button' : 'p'}
            color='text.primary'
            onClick={bioOverflows ? () => setBioExpanded((v) => !v) : undefined}
            aria-expanded={bioOverflows ? bioExpanded : undefined}
            className={`m-0 mbs-2 text-sm mli-auto border-0 bg-transparent p-0 font-[inherit] ${
              bioOverflows ? 'cursor-pointer relative block is-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mui-palette-primary-main)] rounded' : ''
            }`}
            sx={{
              maxInlineSize: '46ch',
              textAlign: 'center',
              ...(bioExpanded
                ? {}
                : {
                    display: '-webkit-box',
                    WebkitBoxOrient: 'vertical',
                    WebkitLineClamp: 2,
                    overflow: 'hidden',
                  }),
            }}
          >
            {data.bio.trim()}
            {bioOverflows && !bioExpanded && (
              <span
                aria-hidden
                className='absolute inset-be-0 inline-end-0 pis-2 text-[13px] font-semibold text-primary bg-[var(--mui-palette-background-paper)]'
              >
                เพิ่มเติม
              </span>
            )}
          </Typography>
        ) : null}

        {/* 🛑 บรรทัด "หมวดหมู่ · ตอบกลับ N% ใน X" ถูกถอดออกชั่วคราว (user 2026-08-10 "ลองเอา
            category / ตอบภายใน 1 นาที ออกก่อน") — หัวโปรไฟล์แน่นเกินไป

            ข้อมูลไม่ได้หายจากระบบ: `data.category` กับ `data.chatResponse*` ยังส่งมาครบเหมือนเดิม
            ทั้งสองหน้า (/b/[slug] และ /u/[username]) เอากลับมาแค่คืนบล็อกนี้ + `resolveChatResponse`
            ไม่ต้องแตะ data layer — ดู git history ของไฟล์นี้ที่คอมมิตวันเดียวกัน */}
      </div>

      {/* ── ช่องทางที่เชื่อมต่อ: อยู่ติดบรรทัด slug ── */}
      <ChannelStrip channels={channels} />


      {/* ── เหรียญ: แถวสรุปบรรทัดเดียว (user 2026-08-10 ส่ง ref ของ Instagram
             "Followed by ckfastwork, paulpattarapon + 3 more") ──

           เดิมเป็นบล็อกของตัวเองสูง ~96px (หัวข้อ + กริดไอคอน + ชื่อใต้ไอคอน) ตอนนี้ ~32px

           🛑 ทำไมแบบซ้อนกันถึงใช้ได้กับของเรา: ref ของ IG ซ้อน "รูปคน" ซึ่งแต่ละใบต่างกันชัด
           ส่วนเหรียญเราเป็นไอคอนเส้นสีเดียวกันหมด ถ้าซ้อนโดยไม่มีอะไรคั่นจะอ่านเป็นก้อนเดียว
           จึงต้องมีวงพื้นขาวคั่นทุกใบ เหมือนที่ IG ได้มาฟรีจากขอบรูปโปรไฟล์

           🛑 **ยังกดไม่ได้โดยตั้งใจ** — user ตัดสิน 2026-08-10 ว่าไม่เอาการกางเป็นกริดในหน้า
           ("ไม่อยากให้กดแถวเหรียญแล้วเป็นแบบนั้น") และปลายทางที่ต้องการจริงคือ **โมดัล หรือ
           หน้าเต็มของเหรียญ ซึ่งยังไม่มีในระบบ** ("เอาดูทั้งหมดออกก่อนก็ได้")

           อย่าเผลอทำให้กดได้โดยชี้ไปที่ทางเดิม — ทางเดิมคือสิ่งที่ถูกปฏิเสธ ไม่ใช่สิ่งที่ยังไม่ได้ทำ
           วันที่จะทำ ต้องสร้างปลายทางใหม่ก่อน (โมดัลรวมเหรียญ หรือ route `/…/badges`) */}
      {data.badges.length > 0 && (
        <div className='pli-5 pbs-1 pbe-4'>
          <div className='flex items-center gap-2'>
            <span className='flex shrink-0'>
              {data.badges.slice(0, 3).map((b, i) => (
                <span
                  key={b.id}
                  className={`is-6 bs-6 rounded-full bg-[var(--mui-palette-background-paper)] flex items-center justify-center shrink-0 ${i > 0 ? '-mis-2' : ''}`}
                  style={{ boxShadow: '0 0 0 2px var(--mui-palette-background-paper)', zIndex: 3 - i }}
                >
                  <BadgeArtwork imageUrl={b.imageUrl} nameEN={b.nameEN} icon={b.icon} alt='' size={24} />
                </span>
              ))}
            </span>
            <Typography variant='caption' color='text.secondary' className='min-is-0 truncate'>
              {'เหรียญ '}
              <strong className='text-textPrimary font-semibold'>
                {data.badges.slice(0, 2).map((b) => b.name).join(', ')}
              </strong>
              {data.totalBadgeCount > 2 ? ` + อีก ${data.totalBadgeCount - 2}` : ''}
            </Typography>
          </div>
        </div>
      )}

      {/* ── ตัวเลขธุรกรรม: อัตราสำเร็จ + 3 ช่องเดิม อยู่ในแถวเดียวกัน ──
             เดิมอัตราสำเร็จเป็นบล็อกแยกใต้แถวนี้ ทั้งที่เป็นหลักฐานเชิงตัวเลขชุดเดียวกัน
             ถูกเส้นคั่นแยกเป็นคนละเรื่อง (user 2026-08-09) — ยุบแล้วเส้นคั่นลดจาก 3 เหลือ 2

             grid 2 คอลัมน์บนมือถือ ไม่ใช่ 4 เรียงเดียว: ที่ 390px สี่ช่องได้ช่องละ ~87px
             ป้ายอย่าง "ลูกค้าซื้อซ้ำ"/"จำนวนลูกค้า" (11 อักขระไทยที่ 13px) จะตกบรรทัดไม่เท่ากัน
             ทำให้แถวสูงไม่เท่ากันและอ่านเป็นตารางเบี้ยว — 2×2 ได้ช่องละ ~175px ป้ายอยู่บรรทัดเดียวครบ */}
      {/* 🛑 พื้นอ่อน + เส้นคั่น **ทั้งบนและล่าง** (user 2026-08-10 "ไม่มีเส้นขั้น ระหว่าง score กับ Tab")
          เดิมมีแค่ border-bs (ขอบบน) แถบตัวเลขจึงไหลชนแถบแท็บโดยไม่มีอะไรคั่น สายตาอ่านเป็นก้อนเดียวกัน
          ทั้งที่เป็นคนละเรื่อง — พื้น background.default (Cool Mist) บนการ์ดขาวทำให้มันเป็น "แผงหลักฐาน"
          ที่แยกตัวออกมาชัด โดยไม่ต้องเพิ่มสีหรือขนาดตัวอักษรที่จะไปแย่งกับชื่อร้าน
          plb-4 (จาก 3.5) ให้ตัวเลขมีที่หายใจขึ้น = เด่นขึ้นด้วยพื้นที่ ไม่ใช่ด้วยการขยายตัวอักษร
          ขนาดยังคง 22px ทุกช่องเท่ากันตามที่ user กำหนดตอนยุบ % เข้ามา */}
      {/* 🛑 4 คอลัมน์แถวเดียวทุกจอ + เส้นคั่นตั้ง (user เคาะแบบ S3 เมื่อ 2026-08-10)
          เดิมเป็น 2×2 บนมือถือ สูง 198px — user ทักว่า "กินพื้นที่เยอะมาก" และจอแรกไม่เหลือที่ให้
          เห็นสินค้าสักชิ้น ตอนนี้ ~72px

          ที่ 390px ช่องละ ~87px จึงต้องย่อป้ายเป็น "ลูกค้า"/"ซื้อซ้ำ" (ดู STAT_LABELS) —
          เหตุผลเดิมที่ต้องใช้ 2×2 คือป้ายยาวตกบรรทัดไม่เท่ากันแล้วแถวเบี้ยว พอย่อป้ายแล้ว
          ข้อจำกัดนั้นหายไป ไม่ใช่การฝืน

          เส้นคั่นตั้ง (`border-s` ที่ช่อง 2-4) คือสิ่งที่ทำให้มันกลับมาอ่านเป็น "แผงหลักฐาน"
          ที่มีโครงสร้าง แทนที่จะเป็นตัวเลขสี่ตัวลอย ๆ — เป็น divider กลาง ไม่ใช่แถบสีตกแต่ง
          พื้น background.default + เส้นคั่นบน-ล่าง คงเดิม */}
      <div className='pli-5 plb-3.5 border-bs border-be bg-[var(--mui-palette-background-default)]'>
        {/* 🛑 2 คอลัมน์ที่ต่ำกว่า 360px — 4 คอลัมน์ที่ 320px ได้ช่องละ 70px แต่ป้าย "อัตราสำเร็จ"
            + ไอคอน ⓘ ต้องการ ~80px จึงล้นและป้ายตกบรรทัดไม่เท่ากันจนแถวเบี้ยว
            (จอที่โดนจริง: iPhone SE รุ่นแรก, Galaxy Fold ตอนพับ) */}
        <div className='grid grid-cols-2 min-[360px]:grid-cols-4 gap-x-1 gap-y-3'>
          {stats.map((s, i) => {
            const cellCls = `text-center ${i > 0 ? 'min-[360px]:border-s' : ''}`
            const value = (
              /* อัตราสำเร็จใช้ Verified Ink #18804A ไม่ใช่ #28C76F (DESIGN.md §2 "สองโทน") —
                 เขียวหลักบนพื้นขาวได้ contrast แค่ 2.21:1 ตกเกณฑ์แม้กับตัวใหญ่ ตัวเลขที่สำคัญ
                 ที่สุดในหน้าจึงจะเป็นตัวที่ผู้สูงวัยอ่านยากที่สุดพอดี ซึ่งขัดกับ PRODUCT.md */
              <div
                className='text-[22px] font-extrabold tabular-nums leading-tight'
                style={{ letterSpacing: '-0.025em', color: s.highlight ? '#18804A' : undefined }}
              >
                {s.value}
              </div>
            )

            /* 🛑 ทั้งเซลล์เป็นปุ่ม ไม่ใช่แค่ตัวหนังสือป้าย — ป้ายสูงราว 18px ซึ่งตกเกณฑ์ tap target
               44px ส่วนทั้งเซลล์ ~87×64px ผ่านสบาย และกลุ่มผู้ใช้ที่ PRODUCT.md ผูกไว้
               (ผู้สูงวัย/digital-literacy ต่ำ) แตะเป้าใหญ่ง่ายกว่าเสมอ */
            return s.interactive ? (
              <button
                key={s.label}
                type='button'
                onClick={() => setCompletionPanelOpen(true)}
                aria-haspopup='dialog'
                aria-expanded={completionPanelOpen}
                aria-controls='completion-rate-panel'
                aria-label={
                  data.completionRate == null
                    ? 'ทำไมอัตราสำเร็จยังสรุปไม่ได้ — แตะเพื่อดูรายละเอียด'
                    : 'อัตราสำเร็จคำนวณจากอะไรบ้าง — แตะเพื่อดูรายละเอียด'
                }
                className={`${cellCls} is-full min-bs-[44px] flex flex-col items-center justify-center border-is border-be-0 border-bs-0 border-ie-0 bg-transparent p-0 cursor-pointer font-[inherit] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mui-palette-primary-main)] rounded`}
              >
                {value}
                <Typography variant='caption' color='text.secondary' className='flex items-center gap-0.5'>
                  {s.label}
                  <Icon icon='lucide:info' width={12} />
                </Typography>
              </button>
            ) : (
              <div key={s.label} className={cellCls}>
                {value}
                {/* ป้ายใต้ตัวเลข = สิ่งที่บอกว่าตัวเลขนั้นแปลว่าอะไร ถ้าอ่านไม่ออกตัวเลขก็ไร้ความหมาย
                    text.secondary ไม่ใช่ text.disabled ซึ่งตก AA */}
                <Typography variant='caption' color='text.secondary' className='block'>
                  {s.label}
                </Typography>
              </div>
            )
          })}
        </div>
      </div>

      {/* 🛑 ปุ่ม "แชทกับร้าน" ถูกถอดออกทั้งสองจุด (inline มือถือ + ปุ่มลอยเดสก์ท็อป) เมื่อ
          2026-08-10 ตามคำสั่ง user ใน phase นี้ — คืนพื้นที่ 82px ให้จอแรกได้เห็นสินค้าจริง

          ผลที่ยอมรับไว้แล้ว: หน้านี้ไม่มีทางไปคุยกับร้านจากตัวมันเองอีก ผู้ซื้อที่เชื่อแล้วต้อง
          กดเพจ Facebook/Instagram ในแถวช่องทาง ซึ่งพาออกนอก Deep — ถ้าจะเอากลับ ทางที่ไม่กิน
          พื้นที่คือทำเป็นไอคอนในแถวที่มีอยู่แล้ว ไม่ใช่คืนปุ่มเต็มความกว้าง */}

      {/* ── โมดัลรายละเอียดเหรียญ ──
             user 2026-08-10: "อยากให้ badge กดได้ แล้วมี modal ขึ้นมาแสดงว่าเค้าได้จากเงื่อนไขอะไร
             เมื่อไหร่ (เน้นให้ buyer อ่านแล้วเชื่อมั่นในร้านค้า)"

             🛑 ref ที่ส่งมาเป็นจอของ **ผู้ขาย** (YOUR PROGRESS 847/1000 · HOW TO UNLOCK FASTER ·
             Reward upon unlocking · Apply Tips) ซึ่งทั้งหมดไม่มีความหมายกับผู้ซื้อที่กำลังดูเหรียญ
             ที่ร้าน **ได้มาแล้ว** — เอาโครงโมดัล/ลำดับการอ่านของ ref มา ไม่เอาเนื้อหา

             🛑 สิ่งที่ ref มีแต่เรา **ไม่มีข้อมูลจริง** จึงไม่ใส่: ระดับความหายาก (UNCOMMON) ·
             "มีร้านแค่ ~12% ที่ทำได้" (ไม่มีสถิติเทียบกลุ่ม) · ความคืบหน้า (เหรียญที่ได้แล้วไม่มี
             ความคืบหน้า) — หน้านี้เคยมีตัวเลขข้ามแพลตฟอร์มที่แต่งขึ้นแล้วถูกถอดออก 2026-07-22

             บรรทัดที่ทำให้ผู้ซื้อ "เชื่อมั่น" จริง ๆ คือบรรทัดสุดท้าย: ระบบมอบให้เองจากพฤติกรรมจริง
             ร้านขอเองไม่ได้ — ซึ่งเป็นความจริงของระบบ (evaluateSellerBadgesForShop ประเมินอัตโนมัติ)
             ไม่ใช่คำโฆษณา */}
      {/* ── แผงอธิบายอัตราสำเร็จ ──
             ข้อความชุดนี้เคย inline อยู่ใต้แถบตัวเลขเสมอ 2 บรรทัด (user 2026-08-10 ทักว่าแถบนี้
             "กินพื้นที่เยอะมาก") — ย้ายมาอยู่หลังการแตะแทน

             🛑 สิ่งที่ **ไม่ได้** เปลี่ยน: ตัวเลข 4 ช่องยังแสดงครบเสมอตามมติ 2026-07-26 และ
             ป้ายสั้นบนหน้าจอยังบอกสถานะอยู่ (— / %) ที่ย้ายมาคือ *ประโยคขยายความ* เท่านั้น
             ซึ่ง feature 00039 บังคับว่าต้องมี แต่ไม่ได้บังคับว่าต้องอ่านทุกครั้ง (1 ชั้นของ
             progressive disclosure ตามที่ NN/g แนะนำว่าห้ามเกิน 2 ชั้น)

             คำทุกคำเป็นของเดิมไม่ได้เขียนใหม่ — BR-OSM-07/BR-OSM-10 ยังบังคับเหมือนเดิม */}
      <ResponsiveSheet
        open={completionPanelOpen}
        onClose={() => setCompletionPanelOpen(false)}
        id='completion-rate-panel'
        ariaLabelledBy='completion-rate-panel-title'
      >
        <div className='pli-5 pbs-3 pbe-6'>
          <div className='flex items-center justify-between mbe-3'>
            <Typography id='completion-rate-panel-title' className='font-semibold' color='text.primary'>
              อัตราสำเร็จ
            </Typography>
            <IconButton size='small' onClick={() => setCompletionPanelOpen(false)} aria-label='ปิด'>
              <Icon icon='lucide:x' width={18} />
            </IconButton>
          </div>

          {data.completionRate == null && data.completionBelowMinSample ? (
            <Typography variant='body2' color='text.secondary'>
              {`อัตราสำเร็จจะขึ้นเมื่อมี${L.settledPhrase}ครบ ${COMPLETION_RATE_MIN_SAMPLE} ${L.unitLabel} — ไม่ได้แปลว่าร้านมีปัญหา`}
            </Typography>
          ) : data.completionRate != null && data.completionExcluded ? (
            <Typography variant='body2' color='text.secondary' className='tabular-nums'>
              {`ไม่นับ ${data.completionExcluded} ${L.unitLabel}ที่ผู้ซื้อไม่รับของ`}
            </Typography>
          ) : null}
        </div>
      </ResponsiveSheet>

      <ResponsiveSheet
        open={openBadge !== null}
        onClose={() => setOpenBadge(null)}
        ariaLabel='รายละเอียดเหรียญ'
      >
        {openBadge && (
          <div className='pli-5 pbs-3 pbe-6'>
            <div className='flex justify-end'>
              <IconButton size='small' onClick={() => setOpenBadge(null)} aria-label='ปิด'>
                <Icon icon='lucide:x' width={18} />
              </IconButton>
            </div>

            <div className='flex flex-col items-center gap-3 pbe-4'>
              <span className='is-24 bs-24 flex items-center justify-center'>
                <BadgeArtwork
                  imageUrl={openBadge.imageUrl}
                  nameEN={openBadge.nameEN}
                  icon={openBadge.icon}
                  alt={openBadge.name}
                  size={96}
                />
              </span>
              <Typography component='h2' className='text-xl font-extrabold text-center'>
                {openBadge.name}
              </Typography>
            </div>

            <div className='flex flex-col gap-3'>
              {/* เงื่อนไขที่ได้มา — แปลจากเกณฑ์จริงใน Badge.criteria ไม่ใช่คำที่แต่งขึ้น */}
              {openBadge.criteriaLabel && (
                <div className='flex items-start gap-2.5'>
                  <Icon icon='lucide:target' width={17} className='shrink-0 mbs-0.5 text-primary' />
                  <span>
                    <Typography variant='caption' color='text.secondary' className='block'>
                      ได้รับเมื่อทำถึงเกณฑ์
                    </Typography>
                    <Typography variant='body2' color='text.primary' className='font-medium'>
                      {openBadge.criteriaLabel}
                    </Typography>
                  </span>
                </div>
              )}

              {/* เมื่อไหร่ — วันที่จริงจาก UserBadge.earnedAt */}
              {openBadge.earnedAtIso && (
                <div className='flex items-start gap-2.5'>
                  <Icon icon='lucide:calendar-check' width={17} className='shrink-0 mbs-0.5 text-primary' />
                  <span>
                    <Typography variant='caption' color='text.secondary' className='block'>
                      ร้านนี้ได้รับเมื่อ
                    </Typography>
                    <Typography variant='body2' color='text.primary' className='font-medium'>
                      {formatDateTH(openBadge.earnedAtIso)}
                    </Typography>
                  </span>
                </div>
              )}
            </div>

            <div className='mbs-5 plb-3 pli-3.5 rounded-lg bg-[var(--mui-palette-action-hover)]'>
              <Typography variant='body2' color='text.primary' className='flex items-start gap-2'>
                <Icon icon='lucide:shield-check' width={17} className='shrink-0 mbs-0.5' />
                <span>ระบบมอบเหรียญนี้ให้อัตโนมัติจากประวัติจริงของร้าน — ร้านขอเองหรือซื้อไม่ได้</span>
              </Typography>
            </div>
          </div>
        )}
      </ResponsiveSheet>

      {/* ── E2: แผงอธิบายคะแนนความน่าเชื่อถือ ──
             Base: src/app/(marketing)/a/[id]/AuctionBidHistoryModal.tsx (Drawer anchor='bottom' +
             แถบจับ + หัวข้อ/ปุ่มปิด) ซึ่ง adapt มาจาก theme/vuexy/.../views/apps/email/ComposeMail.tsx

             ไม่ใช่ tooltip เพราะเนื้อหาหลายบรรทัด + surface หลักคือมือถือที่ไม่มี hover

             รูปร่างสลับตามจอผ่าน ResponsiveSheet: มือถือ = bottom sheet · เดสก์ท็อป = โมดัลกลางจอ
             (เดิมเป็น bottom sheet ทุกจอ ซึ่ง user ทักว่าบนเดสก์ท็อปมันยึดขอบล่างโดยไม่มีเหตุผล) */}
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

          {/* ตัวเลขซ้ำจากหัว — ไม่ใช้สีเตือน/แดงไม่ว่าคะแนนจะต่ำแค่ไหน คะแนนคือระยะทาง ไม่ใช่คำตัดสิน */}
          <div className='flex items-baseline gap-2.5 mbe-1'>
            <span className='text-[32px] font-extrabold tabular-nums leading-none' style={{ letterSpacing: '-0.03em' }}>
              {`${data.trustScore}/${TRUST_SCORE_MAX}`}
            </span>
            <span className='rounded-lg plb-1 pli-2.5 text-[13px] font-semibold bg-[var(--mui-palette-action-hover)] text-[var(--mui-palette-text-secondary)]'>
              {data.tierLabel}
            </span>
          </div>

          {/* ข้อเท็จจริงจริงของระบบ ไม่ใช่คำปลอบใจลอย ๆ — Trust Score MVP มีแต่ขึ้น ไม่มี penalty
              ร้านส่วนใหญ่บน prod ยังคะแนนต่ำเพราะระบบเพิ่งเริ่ม ไม่ใช่เพราะร้านมีปัญหา */}
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
    </div>
  )
}
