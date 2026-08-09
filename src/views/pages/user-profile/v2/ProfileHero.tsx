'use client'

/**
 * ProfileHero — หัวหน้าร้านสาธารณะโฉมใหม่ (mockup อนุมัติ 2026-07-26 ทิศทาง C "กลางหน้า สมมาตร")
 * docs/superpowers/specs/2026-07-26-public-profile-final.html
 *
 * ทำไมจัดกลางแทนชื่อซ้าย-รูปขวา: แบบเดิมเหมือน reference ที่ user ส่งมามากเกินไป และแผ่นเนื้อหา
 * มุมโค้งที่ถูกดึงขึ้นทับแถบสีทำให้เกิดรอยบากสองข้างที่อ่านเป็นความบังเอิญ แบบนี้ให้รูปวงกลม
 * คร่อมรอยต่อแทนมุมโค้ง จึงไม่มีรอยบากและเปลี่ยนแกนการอ่านเป็นบน-ล่าง
 *
 * ลำดับหลักฐานตั้งใจเรียงตามน้ำหนัก: ตัวตนร้าน → ระดับความน่าเชื่อถือ → เหรียญ → ตัวเลขธุรกรรม
 * → อัตราความสำเร็จ (ตัวเลขเดียวที่ให้พื้นที่ใหญ่ที่สุด) → ปุ่มคุย
 *
 * เหรียญ/ช่องทาง/รีวิว ที่ไม่มีข้อมูลจะไม่ render เลย — แต่ตัวเลขสามช่อง (ออเดอร์/ลูกค้า/ซื้อซ้ำ)
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
import Drawer from '@mui/material/Drawer'
import IconButton from '@mui/material/IconButton'

import { Icon } from '@iconify/react'

// 🛑 ใช้ SVG + ชื่อแบรนด์ตรง ๆ ไม่ใช่ `@components/layout/shared/Logo`
// ตัวนั้นเรียก useVerticalNav() ซึ่ง **throw** เมื่อไม่มี VerticalNavContext ครอบ — หน้าร้านสาธารณะ
// ไม่ได้อยู่ใต้ layout ที่มี provider ตัวนั้น (ต่างจาก dashboard) ใช้แล้วหน้าพังทั้งหน้า
// สองบรรทัดนี้คือสิ่งที่ Logo.tsx render อยู่ข้างในพอดี ลบเฉพาะพฤติกรรมยุบ/กาง sidebar ที่ไม่มีความหมายที่นี่
import VuexyLogo from '@core/svg/Logo'
import themeConfig from '@configs/themeConfig'

import { badgeIconName } from '@/lib/badge-icons'
// เกณฑ์ขั้นต่ำอ่านจาก SSOT — ห้าม hardcode เลขในข้อความ ไม่งั้นวันที่เกณฑ์เปลี่ยน
// หน้าจอจะบอกตัวเลขที่ไม่ตรงกับที่ระบบใช้จริง
import { COMPLETION_RATE_MIN_SAMPLE } from '@/lib/order-stats'

export type HeroBadge = { id: string; name: string; nameEN: string; icon: string }

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
}

/** คำเรียกตัวเลขตามประเภทกิจการ — เปลี่ยนแค่คำ ไม่เปลี่ยนวิธีนับ */
/* feature 00039 — rateCaption เลิกใช้คำว่า "ทั้งหมด" ทุกชุด
   ตัวหารไม่เคยรวมใบที่ยังไม่ปิดจบ (รอชำระ/กำลังส่ง) และตอนนี้ยังหักใบที่ผู้ซื้อไม่รับออกอีก
   คำว่า "ทั้งหมด" จึงเป็นคำที่พูดเกินจริงบนหน้าที่ขายความโปร่งใสเป็นจุดยืน
   จำนวนจริงอยู่ในบรรทัดตัวหารใต้ % แล้ว ป้ายบรรทัดบนจึงบอกแค่ว่ามันคืออะไร */
/* 🛑 `repeat` เคยเขียน "ลูกค้าใช้บริการซ้ำ" เหมือนกันทั้ง 3 ชุด ทั้งที่ตารางนี้มีไว้แยกคำตามโดเมน
   ร้านขายอะไหล่มอเตอร์ไซค์ไม่ได้ "ให้บริการ" ลูกค้าเขา "ซื้อ" — คำที่ผิดโดเมนบนหน้าที่ผู้ซื้อใช้
   ตัดสินใจ อ่านเป็นข้อความที่ระบบเติมมาเอง ไม่ใช่ข้อมูลของร้านนี้
   (บทเรียนเดียวกับ docs/conventions/… ผันคำตาม vertical ต้องผันทั้งประโยค ไม่ใช่แทนคำนามตัวเดียว) */
const STAT_LABELS = {
  general: {
    orders: 'ออเดอร์',
    customers: 'จำนวนลูกค้า',
    repeat: 'ลูกค้าซื้อซ้ำ',
    rateCaption: 'อัตราความสำเร็จของออเดอร์บน Deep',
    /** ลักษณนามที่ใช้กับ "จำนวนที่ปิดจบ" — ต่างกันตามโดเมน ไม่ใช่แทนคำนามเฉย ๆ */
    unitLabel: 'ใบ',
    /** คำเต็มที่ใช้แทน "ใบที่ปิดจบ" ซึ่งเป็นศัพท์ภายใน — ผู้ซื้อทั่วไปต้องเดาทั้งกริยาและลักษณนาม */
    settledPhrase: 'ออเดอร์ที่จบแล้ว',
  },
  lodging: {
    orders: 'การเข้าพัก',
    customers: 'จำนวนลูกค้า',
    repeat: 'ลูกค้ากลับมาพักซ้ำ',
    rateCaption: 'อัตราความสำเร็จของการเข้าพักบน Deep',
    unitLabel: 'ครั้ง',
    settledPhrase: 'การเข้าพักที่จบแล้ว',
  },
  serviceQueue: {
    orders: 'นัดหมาย',
    customers: 'จำนวนลูกค้า',
    repeat: 'ลูกค้าใช้บริการซ้ำ',
    rateCaption: 'อัตราความสำเร็จของนัดหมายบน Deep',
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

export default function ProfileHero({ data }: { data: ProfileHeroData }) {
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

  // แสดงครบสามค่าเสมอ ไม่มีข้อมูลให้เป็น 0 (user กำหนด 2026-07-26) — ต่างจากบล็อกอื่นในหน้านี้
  // ที่ซ่อนเมื่อไม่มีข้อมูล เพราะสามค่านี้เป็นโครงหลักของหน้า การซ่อนบางช่องทำให้ layout ขยับ
  // ไปมาระหว่างร้าน และผู้ซื้อเทียบสองร้านกันไม่ได้ว่าช่องที่หายไปคือไม่มีหรือแค่ไม่แสดง
  const stats = [
    { value: data.completedOrders ?? 0, label: L.orders },
    { value: data.customerCount ?? 0, label: L.customers },
    { value: data.repeatCustomerCount ?? 0, label: L.repeat },
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
        <div className='is-[84px] bs-[84px] rounded-full border-4 mli-auto mbe-2.5 overflow-hidden bg-primary flex items-center justify-center text-white text-3xl font-extrabold border-[var(--mui-palette-background-paper)]'>
          <ProfileImg
            src={data.avatar}
            alt={data.shopName}
            className='is-full bs-full object-cover'
            fallback={data.shopName.trim().charAt(0)}
          />
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
        <ul id='badge-list' className='flex justify-center gap-2 flex-wrap pli-5 pbe-3.5 m-0 p-0 list-none'>
          {shownBadges.map((b) => (
            <li key={b.id}>
              <span className='inline-flex items-center gap-1.5 rounded-full plb-1 pli-2.5 text-[13px] font-medium bg-[var(--mui-palette-action-hover)] text-[var(--mui-palette-text-primary)]'>
                <Icon icon={badgeIconName(b.nameEN, b.icon)} width={15} className='shrink-0 opacity-70' />
                {b.name}
              </span>
            </li>
          ))}
          {restBadgeCount > 0 && (
            <li>
              {/* 🛑 สองอย่างที่แก้พร้อมกันตรงนี้:
                  (1) เดิมเป็น <span> ตาย — บอกว่ามีเหรียญอีก N ใบแล้วจบ ไม่มีทางดูได้เลยทั้งเมาส์
                      คีย์บอร์ด และ screen reader (อ่านผ่านไปเฉย ๆ) เหรียญคือหลักฐานความน่าเชื่อถือ
                      การประกาศว่ามีแต่ดูไม่ได้ ขัดหลัก show-don't-tell ตรงจุดที่ตัวมันเองพูดถึง
                  (2) text-disabled (ink 0.4) ได้คอนทราสต์ ~2.3:1 ตก AA — ไฟล์นี้อธิบายเรื่องนี้ไว้เอง
                      ในบล็อกบรรทัดเมตาด้านบน แล้วเปลี่ยนไปใช้ text-secondary (0.7 ≈ 5.2:1) แต่ตกหล่น
                      ตรงชิปนี้จุดเดียว
                  พื้นโปร่ง+ขอบ แทนพื้นทึบแบบชิปเหรียญ เพื่อให้ต่างจากชิปที่กดไม่ได้ข้าง ๆ
                  (filled = ข้อมูลนิ่ง · outlined + chevron = กดได้) */}
              <button
                type='button'
                onClick={() => setBadgesExpanded((v) => !v)}
                aria-expanded={badgesExpanded}
                aria-controls='badge-list'
                aria-label={badgesExpanded ? 'ย่อรายการเหรียญ' : `ดูเหรียญที่เหลืออีก ${restBadgeCount} ใบ`}
                className='inline-flex items-center gap-1 rounded-full plb-1 pli-2.5 text-[13px] font-medium bg-transparent border border-[var(--mui-palette-divider)] text-[var(--mui-palette-text-secondary)] cursor-pointer'
              >
                {badgesExpanded ? 'ย่อ' : `+${restBadgeCount}`}
                <Icon icon={badgesExpanded ? 'lucide:chevron-up' : 'lucide:chevron-down'} width={13} />
              </button>
            </li>
          )}
        </ul>
      )}

      {/* ── ตัวเลขธุรกรรม: แสดงครบสามช่องเสมอ ── */}
      {/* ใช้ flex กระจายกลาง ไม่ใช่ grid 3 คอลัมน์ตายตัว — ร้านที่มีสถิติไม่ครบสามตัว (เช่นออเดอร์
          เก่าที่ยังไม่ผูก Customer) จะเหลือช่องเดียวแล้วเบี้ยวไปชิดซ้าย ดูเหมือนหน้าพัง (เจอตอน QA จริง) */}
      <div className='flex justify-around gap-2 pli-5 plb-3.5 border-bs'>
          {stats.map((s) => (
            <div key={s.label} className='text-center min-is-[84px]'>
              <div className='text-[22px] font-extrabold tabular-nums leading-tight' style={{ letterSpacing: '-0.025em' }}>
                {s.value}
              </div>
              {/* ป้ายใต้ตัวเลข = สิ่งที่บอกว่าตัวเลขนั้นแปลว่าอะไร ถ้าอ่านไม่ออกตัวเลขก็ไร้ความหมาย
                  เดิม text.disabled ตก AA เช่นเดียวกับบรรทัด meta ด้านบน */}
              <Typography variant='caption' color='text.secondary'>
                {s.label}
              </Typography>
            </div>
          ))}
      </div>

      {/* ── อัตราความสำเร็จ: ตัวเลขที่ได้พื้นที่ใหญ่สุดในหน้า เพราะเป็นสิ่งที่คนกำลังจะโอนเงินอยากรู้
             ที่สุด และเป็นสีเขียวตามหลัก verified-means-green ที่ใช้ทั้งระบบ

             ใช้ Verified Ink #18804A ไม่ใช่ #28C76F (DESIGN.md §2 "สองโทน") — เขียวหลักบนพื้นขาว
             ได้ contrast แค่ 2.21:1 ตกเกณฑ์แม้กับตัวใหญ่ ตัวเลขที่สำคัญที่สุดในหน้าจึงเป็นตัวที่
             ผู้สูงวัยอ่านยากที่สุดพอดี ซึ่งขัดกับกลุ่มผู้ใช้ที่ PRODUCT.md ผูกไว้ ── */}
      {/* feature 00039 — บล็อกนี้ต้อง "ไม่หายไปเงียบ ๆ" เมื่อยังสรุปไม่ได้
          ร้านที่เคยเห็น % แล้ววันหนึ่งมันหายไปโดยไม่มีคำอธิบาย จะอ่านเป็นหน้าพัง/มีอะไรถูกซ่อน
          ซึ่งอันตรายกว่าการบอกตรง ๆ ว่าข้อมูลยังไม่พอ — บนหน้าที่ทั้งหน้ามีไว้สร้างความเชื่อใจ */}
      {data.completionRate != null ? (
        <div className='pli-5 plb-3.5 border-bs'>
          <div className='flex items-baseline gap-2.5'>
            <span
              className='text-[32px] font-extrabold tabular-nums leading-none'
              style={{ color: '#18804A', letterSpacing: '-0.03em' }}
            >
              {`${data.completionRate}%`}
            </span>
            <Typography variant='body2' color='text.secondary'>
              {L.rateCaption}
            </Typography>
          </div>
          {/* กางตัวหารให้เห็น (BR-OSM-07) — % ที่คำนวณย้อนกลับไม่ได้คือสิ่งที่ผู้ซื้อไม่เชื่อ
              ไม่แสดง "ไม่นับ 0 ใบ" เพราะประโยคนั้นไม่ให้ข้อมูลอะไรเลย */}
          {/* "ปิดจบ" เป็นศัพท์ภายใน ผู้ซื้อทั่วไป (โดยเฉพาะกลุ่มผู้สูงวัยที่ PRODUCT.md ผูกไว้)
              ต้องเดาทั้งคำกริยาและลักษณนาม — เปลี่ยนเป็นคำเต็มที่อ่านแล้วเข้าใจทันที */}
          {data.completionDenominator != null && (
            <Typography variant='caption' color='text.secondary' className='block mbs-1 tabular-nums'>
              {`จาก ${data.completionDenominator} ${L.settledPhrase}`}
              {data.completionExcluded ? ` · ไม่นับ ${data.completionExcluded} ${L.unitLabel}ที่ผู้ซื้อไม่รับของ` : ''}
            </Typography>
          )}
        </div>
      ) : data.completionBelowMinSample ? (
        /* น้ำเสียงเป็นกลาง ไม่ใช้สีเตือน/ผิดพลาด — นี่ไม่ใช่ปัญหาของร้าน แค่ข้อมูลยังไม่พอ
           และบอกเงื่อนไขที่จะทำให้ตัวเลขปรากฏ ไม่ใช่บอกแค่ว่าไม่มี */
        <div className='pli-5 plb-3.5 border-bs'>
          {/* 🛑 ข้อความนี้เคยพูดกับ "ร้าน" ("ต้องมีใบที่ปิดจบอย่างน้อย 3 ใบ") แต่คนที่อ่านหน้านี้คือ
              "ผู้ซื้อ" — เขาไม่ได้อยากรู้เกณฑ์ของระบบ เขาอยากรู้ว่าควรคิดยังไงกับร้านนี้
              เขียนใหม่ให้ตอบคำถามของคนที่กำลังจะโอนเงิน แล้วค่อยบอกเกณฑ์เป็นข้อมูลประกอบ */}
          <Typography variant='body2' color='text.primary'>
            ร้านนี้ยังมีประวัติไม่พอให้สรุปอัตราความสำเร็จ
          </Typography>
          <Typography variant='caption' color='text.secondary' className='block mbs-0.5'>
            {`ตัวเลขจะขึ้นเมื่อมี${L.settledPhrase}ครบ ${COMPLETION_RATE_MIN_SAMPLE} ${L.unitLabel} — ไม่ได้แปลว่าร้านมีปัญหา`}
          </Typography>
        </div>
      ) : null}

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

      {/* ── E2: แผงอธิบายคะแนนความน่าเชื่อถือ ──
             Base: src/app/(marketing)/a/[id]/AuctionBidHistoryModal.tsx (Drawer anchor='bottom' +
             แถบจับ + หัวข้อ/ปุ่มปิด) ซึ่ง adapt มาจาก theme/vuexy/.../views/apps/email/ComposeMail.tsx

             เป็น bottom sheet ไม่ใช่ modal กลางจอ: นี่คือข้อมูลเสริมที่ไม่ได้ขัดจังหวะงานอะไร
             และไม่ใช่ tooltip เพราะเนื้อหาหลายบรรทัด + surface หลักคือมือถือที่ไม่มี hover

             🛑 radius 10px ไม่ใช่ 18px ของไฟล์ต้นแบบ — 18 ไม่อยู่บน shape ramp ฝั่ง buyer
             (4/6/8/10/full) ไฟล์นี้เพิ่งแก้ปุ่มแชท 13→10 ด้วยเหตุผลเดียวกันในรอบเดียวกัน */}
      <Drawer
        anchor='bottom'
        open={scorePanelOpen}
        onClose={() => setScorePanelOpen(false)}
        // MUI v9: `PaperProps` ถูกถอดออกแล้ว ต้องผ่าน `slotProps.paper` (รูปเดียวกับไฟล์ต้นแบบ)
        slotProps={{
          paper: {
            id: 'trust-score-panel',
            'aria-labelledby': 'trust-score-panel-title',
            sx: { borderRadius: '10px 10px 0 0', maxBlockSize: '86dvh' },
          },
        }}
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
      </Drawer>
    </div>
  )
}
