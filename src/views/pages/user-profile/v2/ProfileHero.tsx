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
import { useState } from 'react'

import NextLink from 'next/link'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'

import Button from '@mui/material/Button'
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
import { resolveChatResponse } from '@/lib/chat-response-display'
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
  canChat: boolean
  /** ปลายทางของปุ่มแชท — null เมื่อยังไม่มีร้าน (ปุ่มจะไม่ถูก render) */
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
    customers: 'จำนวนลูกค้า',
    repeat: 'ลูกค้าซื้อซ้ำ',
    /** ลักษณนามที่ใช้กับ "จำนวนที่ปิดจบ" — ต่างกันตามโดเมน ไม่ใช่แทนคำนามเฉย ๆ */
    unitLabel: 'ใบ',
    /** คำเต็มที่ใช้แทน "ใบที่ปิดจบ" ซึ่งเป็นศัพท์ภายใน — ผู้ซื้อทั่วไปต้องเดาทั้งกริยาและลักษณนาม */
    settledPhrase: 'ออเดอร์ที่จบแล้ว',
  },
  lodging: {
    orders: 'การเข้าพัก',
    customers: 'จำนวนลูกค้า',
    repeat: 'ลูกค้ากลับมาพักซ้ำ',
    unitLabel: 'ครั้ง',
    settledPhrase: 'การเข้าพักที่จบแล้ว',
  },
  serviceQueue: {
    orders: 'นัดหมาย',
    customers: 'จำนวนลูกค้า',
    repeat: 'ลูกค้าใช้บริการซ้ำ',
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
const MAX_BADGE_ICONS = 5

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
  const router = useRouter()
  const { status: sessionStatus } = useSession()

  /** ยังไม่ล็อกอิน → ไปหน้าเข้าสู่ระบบแล้วเด้งกลับมาที่ห้องแชทเดิม (เส้นทางเดียวกับปุ่มสอบถามสินค้า) */
  const goChat = () => {
    if (!data.shopId) return
    const target = `/messages/${data.shopId}`
    router.push(
      sessionStatus === 'authenticated' ? target : `/auth/sign-in?callbackUrl=${encodeURIComponent(target)}`,
    )
  }

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
  // อัตราการตอบแชท — ซ่อนทั้งบรรทัดเมื่อ sample ยังไม่ถึงเกณฑ์ (ไม่ใช่โชว์ 0%)
  const chatResponse = resolveChatResponse(data)

  const stats = [
    data.completionRate != null
      ? {
          value: `${data.completionRate}%`,
          label: 'อัตราสำเร็จ',
          // ถอด "จาก N ใบ" ออกจากช่อง (user 2026-08-10: "76 ใบคืออะไร ผมว่าเอาออกดีกว่า")
          // 🛑 นี่เป็นการเบี่ยงจาก BR-OSM-07 (feature 00039) ที่กำหนดให้ % ต้องมาคู่ตัวหารเสมอ
          // ต้นเหตุที่มันอ่านไม่รู้เรื่องคือ **ผมย่อคำเอง** ตอนยุบ % เข้าช่องแคบ: ของเดิมเขียนว่า
          // "จาก 60 ออเดอร์ที่จบแล้ว" ซึ่งมีคำนามครบ พอเหลือ "จาก 76 ใบ" ลักษณนามลอยจึงไร้ความหมาย
          // ถ้าจะเอาตัวหารกลับมา ให้ใช้ประโยคเต็มที่มีคำนาม ไม่ใช่เอาคำย่อกลับมา
          hint: null,
          highlight: true,
        }
      : {
          value: '—',
          label: 'อัตราสำเร็จ',
          hint: data.completionBelowMinSample ? 'ยังสรุปไม่ได้' : null,
          highlight: false,
        },
    { value: data.completedOrders ?? 0, label: L.orders, hint: null, highlight: false },
    { value: data.customerCount ?? 0, label: L.customers, hint: null, highlight: false },
    { value: data.repeatCustomerCount ?? 0, label: L.repeat, hint: null, highlight: false },
  ]

  // E3 — เหรียญที่เกิน 5 ใบ: `data.badges` ส่งมาครบทุกใบอยู่แล้ว (หน้าไม่ได้ตัด) โค้ดแค่ slice เอง
  // จึงกางได้โดยไม่ต้องดึงข้อมูลเพิ่ม เดิมชิป `+N` เป็น <span> ตาย = ประกาศว่ามีอีกแล้วจบตรงนั้น
  const [badgesExpanded, setBadgesExpanded] = useState(false)
  const shownBadges = badgesExpanded ? data.badges : data.badges.slice(0, MAX_BADGE_ICONS)
  const restBadgeCount = data.totalBadgeCount - Math.min(data.badges.length, MAX_BADGE_ICONS)

  // E2 — แผงอธิบายคะแนน เปิดได้จาก 2 ทาง (เช็คเขียว "ยืนยันตัวตนแล้ว" กับไอคอนข้อมูล) แต่ปลายทางเดียว
  // รวมเป็นแผงเดียวเพราะการยืนยันตัวตนคือองค์ประกอบที่มีน้ำหนักสูงสุดของคะแนน (35%) แยกกันจะซ้ำกันเอง
  // และแก้ปัญหาเดิมที่เช็คเขียวสื่อความหมายด้วย `title` อย่างเดียว — มือถือไม่มี hover จึงไม่มีทางรู้
  const [scorePanelOpen, setScorePanelOpen] = useState(false)

  // เหรียญที่กดเปิดดูรายละเอียดอยู่ — null = ปิด (user 2026-08-10 "อยากให้ badge กดได้ แล้วมี modal
  // ขึ้นมาแสดงว่าเค้าได้จากเงื่อนไขอะไร เมื่อไหร่ เน้นให้ buyer อ่านแล้วเชื่อมั่นในร้าน")
  const [openBadge, setOpenBadge] = useState<HeroBadge | null>(null)

  return (
    <div className='is-full'>
      {/* ── ปก: รูปจริงถ้าร้านอัปโหลด ไม่งั้นใช้ไล่สีตามระดับความน่าเชื่อถือ ──
             🛑 ความสูงขึ้นกับ "มีรูปจริงไหม" ไม่ใช่ขนาดจอเพียงอย่างเดียว
             - มีรูป → 104 → 140 → 176px ตามความกว้าง: เดิมตรึง 104px ทุกจอ บนคอนเทนเนอร์ 960px
               รูปปกที่ร้านอัปโหลดจึงถูก object-cover ครอปเหลือแถบบางอัตราส่วนราว 9:1 ร้านเห็นรูป
               ตัวเองเหลือแค่แถบสีเดียว ทั้งที่นี่คือรูปแรกที่ผู้ซื้อเห็น
             - ไม่มีรูป → ตรึง 104px: ไล่สี tier ไม่ใช่เนื้อหา มันคือของตกแต่ง การให้พื้นที่มันเพิ่ม
               ตามจอที่กว้างขึ้นไม่ได้เพิ่มหลักฐานอะไรให้ผู้ซื้อเลย และร้านระดับ Deep Star ได้ไล่สี
               ที่มี #7367F0 (primary ของทั้งระบบ) อยู่กลางแถบ — 176px × 960px ของสีม่วงล้วนบนหน้า
               ที่มีม่วงอยู่แล้วอีก 3 จุด (ปุ่มแชท/แท็บ active/ป้ายปักหมุด) ดัน One Voice เกิน 10%
               และตรงกับ Don't ของ DESIGN.md ตรงตัวว่า "ไล่สีม่วง gradient ตกแต่ง"
             ไม่แตะ -mbs-[42px] ของบล็อกถัดไป เพราะรูปวงกลมคร่อมรอยต่อ ไม่ได้ยึดกับความสูงปก */}
      <div
        className={`relative overflow-hidden ${
          data.coverImage ? 'bs-[104px] sm:bs-[140px] md:bs-[176px]' : 'bs-[104px]'
        }`}
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
      <div className='text-center pli-5 pbe-3 -mbs-[42px] relative'>
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
        </Typography>

        <div className='flex items-center justify-center gap-1.5 flex-wrap mbs-1.5'>
          {/* เดิมเป็น <span title='...'> — `title` ขึ้นเมื่อ hover เท่านั้น ซึ่งบนมือถือ (surface หลัก
              ของเรา) ไม่มี hover เลย ความหมายของเช็คเขียวจึงเข้าถึงไม่ได้ทั้งกลุ่มผู้ใช้หลัก
              ตอนนี้เป็นปุ่มที่เปิดแผงอธิบายเดียวกับไอคอนข้อมูล (ยืนยันตัวตน = 35% ของคะแนน) */}
          {data.maxVerifyLevel > 0 && (
            <button
              type='button'
              onClick={() => setScorePanelOpen(true)}
              aria-haspopup='dialog'
              aria-expanded={scorePanelOpen}
              aria-controls='trust-score-panel'
              aria-label='ยืนยันตัวตนแล้ว — แตะเพื่อดูรายละเอียดคะแนนความน่าเชื่อถือ'
              title='ยืนยันตัวตนแล้ว'
              className='is-[18px] bs-[18px] rounded-full bg-success text-white flex items-center justify-center border-0 p-0 cursor-pointer'
            >
              <Icon icon='lucide:check' width={11} />
            </button>
          )}
          {/* คะแนนความน่าเชื่อถือ — ตำแหน่งข้างชื่อตามที่ user กำหนด สีของตัวเลขมาจากระดับจริง
              ไม่ได้ตายตัวเป็นเหลือง (ยึด SSOT docs/10 - Business Rules/Tier Lists.md) */}
          {/* 🛑 แสดง "/100" ติดตัวเลขเสมอ ไม่ใช่ซ่อนไว้ในแผงอธิบาย — เดิมเป็นเลขเปล่า ผู้ชมไม่มีทาง
              รู้ว่า 24 ดีหรือแย่ ทั้งที่มันอยู่ตำแหน่งเด่นที่สุดของหน้าติดชื่อร้าน และมาก่อน 93% ใน
              ลำดับการอ่าน คนที่แค่กวาดตาผ่าน (ซึ่งคือคนส่วนใหญ่) ต้องได้บริบทโดยไม่ต้องกดอะไรเลย */}
          <span className='inline-flex items-center gap-1 rounded-full plb-1 pli-2.5 text-[13px] font-extrabold bg-[var(--mui-palette-text-primary)] text-[var(--mui-palette-background-paper)] tabular-nums'>
            {`${data.trustScore}/${TRUST_SCORE_MAX}`}
          </span>
          <span className='rounded-lg plb-1 pli-2.5 text-[13px] font-semibold bg-[var(--mui-palette-action-hover)] text-[var(--mui-palette-text-secondary)]'>
            {data.tierLabel}
          </span>
          {/* ทางลึกสำหรับคนที่อยากรู้ว่าคะแนนมาจากไหน (progressive disclosure) — กดเท่านั้น ไม่ใช้ hover */}
          <button
            type='button'
            onClick={() => setScorePanelOpen(true)}
            aria-haspopup='dialog'
            aria-expanded={scorePanelOpen}
            aria-controls='trust-score-panel'
            aria-label='ดูวิธีคำนวณคะแนนความน่าเชื่อถือ'
            className='flex items-center justify-center border-0 bg-transparent p-1 cursor-pointer text-[var(--mui-palette-text-secondary)]'
          >
            <Icon icon='lucide:info' width={15} />
          </button>
        </div>

        {/* text.secondary ไม่ใช่ text.disabled — ink ที่ 0.4 ได้คอนทราสต์ ~2.3:1 ตก AA (4.5:1)
            ส่วน 0.7 ได้ ~5.2:1 ผ่าน. บรรทัดนี้คือชื่อผู้ใช้/หมวด/วันเปิดร้าน = ข้อมูลจริงที่ผู้ซื้อ
            ใช้ยืนยันว่ามาถูกร้าน ไม่ใช่สถานะปิดใช้งาน จึงไม่ควรอยู่ชั้น disabled
            แก้ความเข้มอย่างเดียว ไม่แตะเฉด (docs/conventions/contrast-fix-keeps-hue.md) */}
        <Typography variant='caption' color='text.secondary' className='block mbs-1'>
          {[`@${data.username}`, data.category, `เปิดร้านตั้งแต่ ${data.memberSince}`]
            .filter(Boolean)
            .join(' · ')}
        </Typography>
      </div>

      {/* ── ช่องทางที่เชื่อมต่อ: อยู่ติดบรรทัด slug ── */}
      <ChannelStrip channels={channels} />

      {/* ── อัตราการตอบแชท: อยู่ติดแถวช่องทาง ──
             user ย้ายมาที่นี่เอง (2026-08-10 "มันต้องอยู่กับพวก page ด้านบนไหมนะ") และถูก —
             แถวบนบอก **ช่องทางที่ทักได้** บรรทัดนี้บอก **ทักแล้วได้คำตอบเร็วแค่ไหน** เป็นคำถาม
             ต่อเนื่องประโยคเดียวกัน ส่วนแถบตัวเลขด้านล่างเป็นหลักฐานการซื้อขาย (ออเดอร์/ลูกค้า/
             อัตราสำเร็จ) ซึ่งมาจากคนละแหล่งและตอบคนละคำถาม การเอาไปวางท้ายแถบนั้นทำให้มันอ่าน
             เหมือนสถิติการขายตัวที่ 5 ทั้งที่ไม่ได้มาจากออเดอร์สักใบ

             🛑 ห้ามย้ายกลับไปแท็บ "เกี่ยวกับร้าน" (user สั่งรอบเดียวกัน) — ผู้ซื้ออ่านตัวเลขนี้
             เพื่อตัดสินใจว่าจะกดทักแชทดีไหม ข้อมูลที่ใช้ตัดสินใจต้องอยู่ที่เดียวกับปุ่ม */}
      {chatResponse && (
        <div className='flex items-center justify-center gap-x-2 gap-y-1 flex-wrap mbs-2'>
          <Icon icon='tabler-message-circle-2' fontSize={16} className='text-textSecondary' />
          <Typography variant='caption' color='text.secondary'>
            ตอบกลับ <strong className='text-textPrimary tabular-nums'>{chatResponse.ratePercent}%</strong>
            {chatResponse.timeLabel ? (
              <>
                {' · ตอบเฉลี่ย '}
                <strong className='text-textPrimary'>{chatResponse.timeLabel}</strong>
              </>
            ) : null}
          </Typography>
        </div>
      )}

      {/* ── เหรียญ: ชิปที่บอกชื่อจริง ไม่ใช่วงกลมไอคอนล้วน ──
             เดิมเป็นวงกลม 38px ที่มีแต่ไอคอน + title สำหรับ hover ซึ่งบนมือถือ (surface หลักของเรา)
             ไม่มี hover เลย ผู้ชมจึงเห็นวงกลมสีลอย ๆ ที่ตีความไม่ได้ — ซึ่งตรงกับสิ่งที่ DESIGN.md
             Principle #1 ห้ามไว้ตรง ๆ ว่า "ห้าม badge ตกแต่ง" เหรียญที่อ่านไม่ออกคือของตกแต่ง
             ไม่ใช่หลักฐาน. ใส่ชื่อลงไปแล้วมันกลายเป็นหลักฐานที่ทำงานจริง

             สีเปลี่ยนจาก warning-amber เป็นกลาง — DESIGN.md สงวนส้มไว้ให้ "รอดำเนินการ/เตือน"
             การเอาสีเตือนมาใช้กับรางวัลที่ได้มาแล้วทำให้ความหมายของสีทั้งระบบเพี้ยน และไม่ใช้เขียว
             เพราะ Verified-Means-Green สงวนไว้ให้ "ยืนยันแล้ว" โดยเฉพาะ ใช้กับทุกเหรียญจะทำให้
             สัญญาณเขียวเฟ้อตามที่กติกาเตือนไว้เอง ── */}
      {shownBadges.length > 0 && (
        <div className='pli-5 pbe-4'>
          {/* หัวข้อ + ทางไปดูทั้งหมด — โครงตาม ref ที่ user ส่ง (2026-08-10 "ตอนแรก Achievement
              ของร้าน ผมอยากได้แบบนี้") แต่ ref เป็น eyebrow ตัวพิมพ์ใหญ่ภาษาอังกฤษ ซึ่ง DESIGN.md
              ระบุไว้ใน Anti-references ตรงตัว ("eyebrow ตัวพิมพ์ใหญ่จิ๋วเหนือทุก section")
              จึงใช้หัวข้อไทย sentence-case ตามระบบแทน — เอา IA/ผังของ ref มา ไม่เอาสกิน */}
          <div className='flex items-baseline justify-between gap-3 mbe-3'>
            <Typography variant='body2' className='font-semibold' color='text.primary'>
              เหรียญของร้าน
            </Typography>
            {restBadgeCount > 0 && (
              <button
                type='button'
                onClick={() => setBadgesExpanded((v) => !v)}
                aria-expanded={badgesExpanded}
                aria-controls='badge-list'
                aria-label={badgesExpanded ? 'ย่อรายการเหรียญ' : `ดูเหรียญทั้งหมด ${data.totalBadgeCount} เหรียญ`}
                className='flex items-center gap-1 border-0 bg-transparent p-0 text-[13px] font-semibold text-primary cursor-pointer shrink-0'
              >
                {badgesExpanded ? 'ย่อ' : `ดูทั้งหมด ${data.totalBadgeCount}`}
                <Icon icon={badgesExpanded ? 'lucide:chevron-up' : 'lucide:arrow-right'} width={13} />
              </button>
            )}
          </div>

          {/* 🛑 ชิดซ้าย ไม่จัดกลาง — เหรียญคือรายการหลักฐาน ไม่ใช่ของตกแต่งที่ต้องสมมาตร
              (แนวเดียวกับที่ user สั่งให้กริดคลิปชิดซ้ายในรอบเดียวกัน) */}
          <ul id='badge-list' className='flex flex-wrap gap-x-5 gap-y-3 m-0 p-0 list-none'>
            {shownBadges.map((b) => (
              <li key={b.id} className='is-[84px]'>
                <button
                  type='button'
                  onClick={() => setOpenBadge(b)}
                  aria-haspopup='dialog'
                  aria-label={`ดูรายละเอียดเหรียญ ${b.name}`}
                  className='flex flex-col items-center gap-2 is-full border-0 bg-transparent p-0 cursor-pointer font-[inherit]'
                >
                {/* วงกลม 56px ให้ artwork เต็มตาแบบ ref — ไม่ใช่ไอคอนจิ๋วในชิป
                    🛑 พื้นวงต้องมีสีอ่อน ไม่ใช่ขาวล้วน: เหรียญ 11/20 ใบในระบบยังไม่มี artwork และ
                    ตกไปใช้ไอคอนเส้น ถ้าพื้นเป็นขาวเดียวกับการ์ด ใบที่ไม่มีรูปจะดูเหมือน "โหลดไม่มา"
                    พื้นอ่อนทำให้มันอ่านเป็น "ช่องใส่เหรียญที่ยังไม่มีลาย" ซึ่งเป็นความจริง */}
                {/* ไม่มีขอบ/พื้น/เงา (user 2026-08-10: "ไม่ชอบ border เน้นแสดงรูปได้ไหม ไม่ต้องมีขอบ")
                    artwork ของเหรียญเป็นเหรียญกลมที่มีขอบในตัวอยู่แล้ว การครอบวงอีกชั้นคือขอบซ้อนขอบ
                    กล่องยังคงขนาด 56px คงที่ไว้เพื่อให้ทุกใบยืนบนเส้นฐานเดียวกัน แม้ artwork แต่ละใบ
                    จะมีสัดส่วน/ระยะขอบในไฟล์ไม่เท่ากัน */}
                <span className='is-14 bs-14 flex items-center justify-center shrink-0'>
                  <BadgeArtwork imageUrl={b.imageUrl} nameEN={b.nameEN} icon={b.icon} alt={b.name} size={56} />
                </span>
                {/* ชื่อเหรียญใต้รูป — clamp 2 บรรทัด ชื่อไทยยาวกว่าอังกฤษใน ref มาก */}
                <Typography
                  variant='caption'
                  color='text.primary'
                  className='text-center leading-tight line-clamp-2 font-medium'
                >
                  {b.name}
                </Typography>
                </button>
              </li>
            ))}
          </ul>
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
      <div className='pli-5 plb-4 border-bs border-be bg-[var(--mui-palette-background-default)]'>
        <div className='grid grid-cols-2 sm:grid-cols-4 gap-y-3 gap-x-2'>
          {stats.map((s) => (
            <div key={s.label} className='text-center'>
              {/* อัตราสำเร็จใช้ Verified Ink #18804A ไม่ใช่ #28C76F (DESIGN.md §2 "สองโทน") —
                  เขียวหลักบนพื้นขาวได้ contrast แค่ 2.21:1 ตกเกณฑ์แม้กับตัวใหญ่ ตัวเลขที่สำคัญ
                  ที่สุดในหน้าจึงจะเป็นตัวที่ผู้สูงวัยอ่านยากที่สุดพอดี ซึ่งขัดกับกลุ่มผู้ใช้ใน PRODUCT.md */}
              <div
                className='text-[22px] font-extrabold tabular-nums leading-tight'
                style={{ letterSpacing: '-0.025em', color: s.highlight ? '#18804A' : undefined }}
              >
                {s.value}
              </div>
              {/* ป้ายใต้ตัวเลข = สิ่งที่บอกว่าตัวเลขนั้นแปลว่าอะไร ถ้าอ่านไม่ออกตัวเลขก็ไร้ความหมาย
                  เดิม text.disabled ตก AA เช่นเดียวกับบรรทัด meta ด้านบน */}
              <Typography variant='caption' color='text.secondary' className='block'>
                {s.label}
              </Typography>
              {/* ตัวหารที่ BR-OSM-07 บังคับให้อยู่คู่ % เสมอ (feature 00039) — ย้ายบล็อกแล้วห้ามหาย */}
              {s.hint && (
                <Typography variant='caption' color='text.disabled' className='block tabular-nums'>
                  {s.hint}
                </Typography>
              )}
            </div>
          ))}
        </div>

      {/* ── บรรทัดขยายความของอัตราสำเร็จ ──
             ตัวเลข % ย้ายไปอยู่ในแถวด้านบนแล้ว เหลือแค่ข้อความที่ตัวเลขในช่องแคบ ๆ พูดแทนไม่ได้
             และเป็นข้อความที่ feature 00039 บังคับว่าต้องมี ไม่ใช่ของประดับ:

             • ยังไม่ถึงเกณฑ์ → ต้องบอกว่า "ไม่ได้แปลว่าร้านมีปัญหา" เพราะช่องที่ขึ้น "—" เฉย ๆ
               ผู้ซื้ออ่านเป็นข้อมูลถูกซ่อน ซึ่งอันตรายกว่าการบอกตรง ๆ ว่าข้อมูลยังไม่พอ (BR-OSM-10)
             • มีใบที่หักออก → ต้องกางว่าหักกี่ใบเพราะอะไร (BR-OSM-07) ไม่งั้นตัวหารในช่องด้านบน
               จะบวกกลับไม่ตรงกับจำนวนออเดอร์ที่โชว์อยู่ข้าง ๆ กันเอง

             ไม่มี border-bs — เป็นส่วนขยายของแถบตัวเลขด้านบน ไม่ใช่บล็อกใหม่ (user 2026-08-09
             ทักว่าเส้นคั่นเยอะเกินจนหัวดูแน่น) และไม่ render เลยเมื่อไม่มีอะไรต้องอธิบาย */}
      {data.completionRate == null && data.completionBelowMinSample ? (
          <Typography variant='caption' color='text.secondary' className='block mbs-3 text-center'>
            {`อัตราสำเร็จจะขึ้นเมื่อมี${L.settledPhrase}ครบ ${COMPLETION_RATE_MIN_SAMPLE} ${L.unitLabel} — ไม่ได้แปลว่าร้านมีปัญหา`}
          </Typography>
        ) : data.completionRate != null && data.completionExcluded ? (
          <Typography variant='caption' color='text.secondary' className='block mbs-3 text-center tabular-nums'>
            {`ไม่นับ ${data.completionExcluded} ${L.unitLabel}ที่ผู้ซื้อไม่รับของ`}
          </Typography>
        ) : null}
      </div>

      {/* ปุ่มแชท — เดิมไม่มีทั้ง onClick และ href คือกดแล้วไม่เกิดอะไรขึ้นเลย ต่อปลายทางให้แล้ว
          ยังไม่ล็อกอิน → พาไปหน้าเข้าสู่ระบบพร้อม callbackUrl กลับมาที่ห้องแชทเดิม
          (เส้นทางเดียวกับปุ่ม "สอบถามสินค้านี้" ที่การ์ดสินค้า) */}
      {data.canChat && data.shopId && (
        <div className='pli-5 pbs-4 pbe-4 max-md:block hidden'>
          <Button
            fullWidth
            variant='contained'
            size='large'
            onClick={goChat}
            startIcon={<Icon icon='lucide:message-circle' width={19} />}
            // 10px = ขั้นบนสุดของ shape ramp ฝั่ง buyer (4/6/8/10/full ตาม DESIGN.md §Shapes)
            // เดิม 13px ไม่ตรงขั้นไหนเลย — ต่างจาก 10 น้อยจนตาไม่เห็นทีละจุด แต่คือสิ่งที่ทำให้หน้า
            // อ่านว่า "ประกอบขึ้นมา" (ปุ่มลอยฝั่งเดสก์ท็อปด้านล่างใช้ full ซึ่งอยู่บน ramp อยู่แล้ว)
            sx={{ minBlockSize: 50, borderRadius: '10px' }}
          >
            แชทกับร้าน
          </Button>
        </div>
      )}

      {/* บนจอกว้างปุ่มเต็มความกว้างกินพื้นที่เกินความสำคัญและดันเนื้อหาจริงตกจอ (user 2026-07-26)
          จึงย้ายเป็นปุ่มลอยมุมขวาล่างแทน — กดได้ทุกจุดที่เลื่อนถึงโดยไม่แย่งพื้นที่เนื้อหา */}
      {data.canChat && data.shopId && (
        <Button
          variant='contained'
          size='large'
          onClick={goChat}
          startIcon={<Icon icon='lucide:message-circle' width={19} />}
          sx={{
            display: { xs: 'none', md: 'inline-flex' },
            position: 'fixed',
            insetBlockEnd: 24,
            insetInlineEnd: 24,
            zIndex: 30,
            minBlockSize: 50,
            borderRadius: '999px',
            paddingInline: '22px',
            boxShadow: '0 10px 28px rgb(47 43 61 / .28)',
          }}
        >
          แชทกับร้าน
        </Button>
      )}

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
