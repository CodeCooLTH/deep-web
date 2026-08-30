'use client'

/**
 * ShopProfile — ตัวประกอบหน้าร้านสาธารณะ ใช้ร่วมกันทั้งสอง URL
 *
 *   /u/[username] — ร้านส่วนตัวของผู้ใช้ (kind = PERSONAL)
 *   /b/[slug]     — ร้านแบบธุรกิจ (kind = BUSINESS)
 *
 * ทำไมต้องรวม: สองหน้านี้แสดง "ร้าน" เหมือนกัน ต่างแค่ที่มาของข้อมูล การดูแลสองชุดทำให้
 * ดีไซน์แยกกันเดินทีละนิดจนต่างกันจริง (เกิดมาแล้วก่อนหน้านี้ — comment ในไฟล์เดิมทั้งสองหน้า
 * ต้องเขียนกำกับว่า "ต้อง sync ทั้ง 2 หน้าเสมอ" ซึ่งเป็นสัญญาณว่าโครงสร้างผิดตั้งแต่แรก)
 * ที่นี่จึงรับข้อมูลรูปแบบเดียว แล้วหน้าไหนจะดึงจากที่ไหนก็เป็นเรื่องของหน้านั้น
 *
 * ชุดแท็บขึ้นกับประเภทกิจการ (user กำหนด 2026-07-26; feature 00028 เพิ่มสาขาที่ 3)
 *   ร้านขายออนไลน์      ปักหมุด / สินค้า / เกี่ยวกับร้าน / รีวิว {คะแนน}
 *   ร้านสินค้าและบริการ  ปักหมุด / บริการ / สินค้า(ถ้ามีของเสริม) / เกี่ยวกับร้าน / รีวิว {คะแนน}
 *   ร้านที่พัก          ปักหมุด / ห้องพัก / ปฏิทิน / เกี่ยวกับร้าน / รีวิว {คะแนน}
 * แท็บปักหมุดโผล่เฉพาะเมื่อร้านปักคลิปไว้ · แท็บ "บริการ"/"สินค้า" โผล่เฉพาะเมื่อมีข้อมูลจริง
 *
 * feature 00028 — label แท็บสินค้าเปลี่ยนจาก "สินค้าและบริการ" → "สินค้า": คำเดิมชนกับชื่อ vertical
 * ใหม่ (Shop.vertical = SERVICE_QUEUE แสดงผลเป็น "สินค้าและบริการ") ตรงตัวถ้าไม่แก้จะเกิดร้าน
 * SERVICE_QUEUE ที่มีทั้งแท็บ "บริการ" กับแท็บ "สินค้าและบริการ" วางเคียงกัน — คำเดียวกันสองความหมาย
 */
import { useState } from 'react'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import Typography from '@mui/material/Typography'

import { Icon } from '@iconify/react'

import Box from '@mui/material/Box'

import ProfileIdentity from './ProfileIdentity'
import EvidencePanel from './EvidencePanel'
import OfficialChannelsBlock from './OfficialChannelsBlock'
import ShopExtraPages, { type ExtraPageTab } from './ShopExtraPages'
import type { HeroBadge } from './BadgeShowcase'
import PageBlocksSection, { type PageBlockItem } from './PageBlocksSection'
import ProfileTabs from './ProfileTabs'
import PublicRoomList, { type PublicRoom } from './PublicRoomList'
import PublicServiceList, { type PublicService } from './PublicServiceList'
import AvailabilityCalendar, { type AvailabilityData } from './AvailabilityCalendar'
import type { OfficialChannel } from './OfficialChannels'
import ReviewSummary, { type RatingBucket } from './ReviewSummary'
import ReviewList, { type ReviewListItem } from './ReviewList'
import ShopVideos, { type ShopVideoItem } from './ShopVideos'
import AboutOverview, { type AboutData } from '../profile/AboutOverview'
import { ProfileRightContent } from '../profile'
import type { SerializedProduct } from '../profile'
import { applyTabOrder, computeVisibleTabKeys, type ProfileTabKey } from '@/lib/profile-tab-keys'
import { shopStatVocab } from '@/lib/shop-stat-vocab'
import { getTierAccentColor } from '@/lib/trust-tier'

/** ข้อมูลหัวโปรไฟล์ — คงรูปเดิมของ `ProfileHeroData` ไว้เพื่อไม่ให้ทั้งสอง page ต้องรื้อ mapping
 *  เพิ่มเฉพาะ `createdAtIso` ที่ ProfileIdentity ต้องใช้คำนวณ "เปิดร้านมาแล้ว …" */
export type ShopProfileHeroData = {
  shopName: string
  username: string
  avatar: string | null
  coverImage: string | null
  tierGradient: string
  trustScore: number
  tierLabel: string
  avgRating?: number | null
  reviewCount?: number
  maxVerifyLevel: number
  category: string | null
  memberSince: string
  /** ISO ของวันเปิดร้าน — ใช้แสดงอายุร้านเป็นคำ ไม่ให้ผู้อ่านต้องคำนวณเอง */
  createdAtIso: string
  bio?: string | null
  badges: HeroBadge[]
  totalBadgeCount: number
  completedOrders: number | null
  customerCount: number | null
  repeatCustomerCount: number | null
  completionRate: number | null
  completionDenominator?: number
  completionExcluded?: number
  completionBelowMinSample?: boolean
  nextTierLabel?: string | null
  pointsToNext?: number | null
  isLodging?: boolean
  isServiceQueue?: boolean
  chatResponseRate?: number | null
  chatMedianResponseSec?: number | null
  chatResponseSampleSize?: number | null
}

export type ShopProfileData = {
  hero: ShopProfileHeroData
  isLodging: boolean
  /** feature 00028 — ร้านประเภทสินค้าและบริการ (Shop.vertical === 'SERVICE_QUEUE') */
  isServiceQueue: boolean
  rooms: PublicRoom[]
  availability: AvailabilityData | null
  /** feature 00028 — คิวงานที่เปิดใช้งานอยู่ ([] เสมอสำหรับร้านที่ไม่ใช่ SERVICE_QUEUE) */
  services: PublicService[]
  pinnedProducts: SerializedProduct[]
  otherProducts: SerializedProduct[]
  about: AboutData
  channels: OfficialChannel[]
  videos: ShopVideoItem[]
  reviews: ReviewListItem[]
  avgRating: number | null
  reviewCount: number
  ratingDistribution: RatingBucket[] | null
  shopId: string | null
  isOwnShop: boolean
  itemKind?: 'PRODUCT' | 'ROOM'
  /**
   * feature 00035 — ลำดับแท็บที่ผู้ขายจัดไว้ (ShopPageLayout.tabOrder)
   * ไม่ส่งมา/ว่าง = ใช้ลำดับ default ของระบบ · เป็น "ลำดับ" ไม่ใช่ allow-list: คีย์ที่ไม่ได้ระบุ
   * ไปต่อท้าย ไม่ได้หายไป (แท็บปิดไม่ได้ — guardrail บังคับใน applyTabOrder)
   */
  tabOrder?: readonly string[]
  /** feature 00035 — บล็อกที่ผู้ขายจัดวางไว้เหนือแถบแท็บ (listShopPageBlocks) ไม่ส่งมา/ว่าง = ไม่มีบล็อก */
  blocks?: PageBlockItem[]
  /**
   * feature 00053 — หน้านี้พิมพ์ราคาไหม (`ShopPageLayout.showPrices`)
   *
   * 🛑 ไม่ใส่ `?` และไม่มีค่าตั้งต้น — บังคับให้ผู้เรียกส่งมาเสมอ ถ้าเป็น optional แล้วหน้าไหน
   * ลืมส่ง `undefined` จะถูกอ่านเป็น falsy ⇒ "ซ่อนราคา" ซึ่งบังเอิญตรงกับค่าตั้งต้นพอดี = ลืมส่ง
   * แล้วไม่มีอะไรฟ้องเลย (และวันที่ค่าตั้งต้นเปลี่ยน ทุกจุดที่ลืมจะพลิกพร้อมกันโดยไม่มีใครรู้)
   */
  showPrices: boolean
  /**
   * feature 00053 — จำนวนสินค้าที่ดึงมาชนเพดาน `MAX_PROFILE_PRODUCTS` ⇒ อาจมีมากกว่าที่แสดง
   * ต้องมีป้ายบอกใต้กริด ไม่ใช่เงียบ (partial-data-must-be-labeled-or-filled.md)
   */
  productsTruncated?: boolean
}

/**
 * โครงหน้า 2 คอลัมน์ — ตัวเลขทุกตัวยกมาจากไฟล์อ้างอิงที่ user ส่ง ไม่ได้กะเอง
 *   .layout  { display:grid; grid-template-columns:255px minmax(0,1fr); gap:18px; padding:20px 0 70px }
 *   .container{ width:min(1080px, calc(100% - 36px)) }
 *
 * 🛑 `minmax(0,1fr)` ไม่ใช่ `1fr` — grid item มี `min-width:auto` เป็นค่าตั้งต้น ⇒ ตารางหรือ
 * แถบแท็บที่กว้างเกินจะ **ดันคอลัมน์ให้ล้นออกนอกจอ** แทนที่จะถูกบีบ (คลาสเดียวกับบั๊ก
 * `docs/conventions/flex-header-truncation.md` แค่ย้ายมาเกิดบน grid)
 *
 * breakpoint 900 ตรงกับ `md` ของ Vuexy พอดี (theme remap md=900/lg=1200) จึงใช้ token ของธีมได้
 * ส่วน 650 ของไฟล์อ้างอิงไม่มี token ตรง ๆ — ใช้ค่า px ตรงตามไฟล์เพื่อไม่ให้เพี้ยนจากต้นแบบ
 */
const CONTAINER_SX = {
  inlineSize: 'min(1080px, calc(100% - 36px))',
  marginInline: 'auto',
  '@media (max-width:650px)': { inlineSize: 'min(100% - 24px, 1080px)' },
} as const

const LAYOUT_SX = {
  ...CONTAINER_SX,
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', md: '255px minmax(0,1fr)' },
  gap: '18px',
  /* 🛑 ที่ว่างท้ายหน้าของ xs ต้องบวก `env(safe-area-inset-bottom)` — แถบปุ่มล่างเป็น `fixed`
     สูง 61px + safe-area และ **spacer ของมันถูกถอดออกแล้ว** (เคยวางผิดที่ใต้ปก ดู `MobileCta`)
     ⇒ กล่องนี้เป็นที่เดียวที่กันไม่ให้แถบทับการ์ดใบสุดท้าย · ใช้ env() ได้จริงเพราะ
     `(marketing)/layout.tsx` ตั้ง `viewportFit:'cover'` ไว้ (`docs/conventions/ios-safe-area.md`) */
  padding: { xs: '12px 0 calc(70px + env(safe-area-inset-bottom))', md: '20px 0 70px' },
  alignItems: 'start',
} as const

/**
 * ≤900px: ยุบเป็น 2 ช่องเรียงกันแล้วดันลงไปอยู่ใต้แท็บ (`order`)
 * ≤650px: เรียงลงเป็นแถวเดียว — 2 ช่องบนจอ 375px เหลือช่องละ ~170px ซึ่งแคบเกินกว่าจะอ่าน
 *         บรรทัดอธิบายใต้หัวข้อได้ (ตัวเลข 650 มาจากไฟล์อ้างอิงตรง ๆ)
 */
/** กรอบการ์ดของคอลัมน์ซ้าย — ค่าจากไฟล์อ้างอิง (`.card` + `.social-card`) */
/** `.tabs-card` ของไฟล์อ้างอิง */
const TABS_CARD_SX = {
  background: 'var(--mui-palette-background-paper)',
  border: '1px solid var(--mui-palette-divider)',
  /* 14px = มุมมนของ "การ์ด" ทุกใบบนหน้านี้ (สินค้า/ห้องพัก/บริการ/ไทล์คลิป) — user เคาะ
     2026-08-23 ให้เท่ากันทั้งหน้า · เดิมเป็น 18px ตามไฟล์อ้างอิง แต่การ์ดในเนื้อหาถูกปรับเป็น
     14px ไปแล้วเมื่อ 2026-08-21/23 ("ยกทุกแท็บให้พูดภาษาเดียวกัน") เหลือกรอบนอกกับคอลัมน์ซ้าย
     ค้างที่ 18 อยู่สองใบ ⇒ มุมของกรอบนอกกับการ์ดข้างในไม่ตรงกันเวลาวางซ้อนกัน */
  borderRadius: '12px',
  boxShadow: '0 4px 18px rgb(47 43 61 / .08)',
  overflow: 'hidden',
  /* 🛑 ≤650px การ์ดนี้ต้อง **ชนขอบจอจริง** — เดิมถอดแค่มุมมนกับขอบข้าง แต่ตัวการ์ดยังอยู่ใน
     `CONTAINER_SX` ที่เว้นข้างละ 12px ⇒ ยังมีพื้นเพจโผล่ 2 แถบ และมุมมน 0 ที่ตั้งไว้ก็ไม่มีเหตุผล
     รองรับ · ผลพลอยได้ที่ user เจอเอง: ระยะขอบของ panel (12px) ไปซ้อนบนระยะของ container
     ⇒ การ์ดบริการเริ่มที่ 24px ขณะที่การ์ดฝั่งซ้ายใต้มันเริ่มที่ 12px = แคบกว่าข้างละ 12px
     ดันออกให้เต็มจอแล้ว ระยะของ panel กลายเป็น 12px เท่ากับ container ⇒ กว้างเท่ากันพอดี */
  '@media (max-width:650px)': {
    borderRadius: 0,
    borderInline: 0,
    marginInline: '-12px',
    inlineSize: 'calc(100% + 24px)',
  },
} as const

/**
 * ตัวนับของแต่ละแท็บ — แยกเป็นตารางเดียวแทนการเขียน `count:` กระจายในแต่ละแท็บ
 * เพิ่มแท็บใหม่แล้วอยากมีตัวนับ ให้เติมที่นี่ที่เดียว
 */
const TAB_COUNTS: Record<string, ((d: ShopProfileData) => number | undefined) | undefined> = {
  services: (d) => d.services.length || undefined,
  items: (d) => d.pinnedProducts.length + d.otherProducts.length || undefined,
  rooms: (d) => d.rooms.length || undefined,
  pinned: (d) => d.videos.length || undefined,
}

const SIDE_CARD_SX = {
  background: 'var(--mui-palette-background-paper)',
  border: '1px solid var(--mui-palette-divider)',
  /* 14px — ชุดเดียวกับ TABS_CARD_SX ด้านบน (token `rounded.card` ใน DESIGN.md) */
  borderRadius: '12px',
  boxShadow: '0 4px 18px rgb(47 43 61 / .08)',
  padding: '20px',

} as const

const SIDEBAR_SX = {
  display: { xs: 'grid', md: 'flex' },
  /* 🛑 `auto-fit` ไม่ใช่ `1fr 1fr` — ช่วง 651–899px คอลัมน์นี้เป็นกริด 2 ช่อง แต่การ์ดใบที่สอง
     ("เพจทางการ") แสดงเฉพาะร้านที่ผูกเพจไว้ ⇒ ร้านที่ไม่มีเพจได้การ์ดใบเดียวนอนอยู่ครึ่งซ้าย
     แล้วครึ่งขวาว่างเปล่า (user เจอเองบน iPad Air 820px 2026-08-21)
     `auto-fit` ยุบแทร็กที่ไม่มีของทิ้ง ⇒ มีใบเดียว = เต็มความกว้าง · มีสองใบ = สองช่องเท่าเดิม
     โดยไม่ต้องนับจำนวนการ์ดในโค้ด (เพิ่มการ์ดใบที่สามวันหลังก็ยังถูก) */
  gridTemplateColumns: { xs: 'repeat(auto-fit, minmax(260px, 1fr))' },
  flexDirection: 'column',
  gap: '16px',
  order: { xs: 2, md: 1 },
  /**
   * sticky — การ์ดสองใบนี้เลื่อนตามไปกับเนื้อหา
   * ฝั่งขวา ไม่หายไปจากจอ
   *
   * 🛑 เคยถอดออกไปรอบหนึ่ง (2026-08-21) เพราะอ่านคำว่า "ลอย" ของ user ผิดว่าหมายถึงตัว sticky เอง
   * — ที่จริงเขาอยากให้มัน **เลื่อนตามเหมือนเดิม** ถ้าจะแก้อาการ "ที่ว่างขาวใต้การ์ด" ให้แก้ด้วย
   * การเติมเนื้อหา/ปรับความสูง ไม่ใช่ถอด sticky ทิ้ง
   *
   * `top: 30px` (user เคาะ 2026-08-21) ไม่ใช่ 86px ของไฟล์อ้างอิง — 86 เผื่อไว้สำหรับแถบบนที่
   * ตรึงค้างอยู่ ซึ่งหน้านี้ไม่มี ⇒ ใช้ 86 จะเหลือช่องว่างเปล่า ๆ เหนือการ์ดตอนหยุด
   */
  position: { md: 'sticky' },
  top: { md: '30px' },
  '@media (max-width:650px)': { display: 'block', '& > *': { marginBlockEnd: '12px' } },
} as const

export default function ShopProfile({ data }: { data: ShopProfileData }) {
  /**
   * deep link ของ lightbox — อ่านฝั่ง client ที่นี่ ไม่ใช่ `await searchParams` ที่ Server Component
   *
   * 🛑 ทั้งสองหน้าประกาศ type `searchParams` ไว้แต่ไม่เคยอ่านจริง ถ้าเริ่มอ่าน Next จะเปลี่ยน
   * navigation เป็น server refetch เต็มรูป **ทุกครั้งที่กด ‹ ›** = โหลดใหม่ทั้งหน้าเพื่อเลื่อนรูป
   *
   * ทั้งสองหน้า render แบบ dynamic อยู่แล้ว (เรียก `getServerSession` ซึ่งอ่านคุกกี้) จึงไม่ติด
   * เงื่อนไข `<Suspense>` ของ `useSearchParams()` ที่บังคับเฉพาะหน้าที่ prerender แบบ static
   */
  /**
   * หน้าเต็มจอ "เพจทางการ / เหรียญของร้าน" — `null` = ปิด
   *
   * 🛑 state อยู่ที่นี่ที่เดียว ไม่ใช่ในการ์ดแต่ละใบ เพราะไฟล์อ้างอิงรวมสองหน้านี้เป็น **หน้าเดียว
   * ที่สลับด้วยแท็บ** ถ้าแต่ละการ์ดถือ Dialog ของตัวเองเหมือนเดิม แท็บจะสลับไปอีกหน้าไม่ได้เลย
   * (และจะได้ Dialog สองใบที่ต่างคนต่างล็อก scroll — ดู overlay-scroll-lock-single-owner)
   */
  const [extraPage, setExtraPage] = useState<ExtraPageTab | null>(null)

  const searchParams = useSearchParams()
  const productParam = searchParams.get('p')
  const clipParam = searchParams.get('clip')

  const router = useRouter()
  const pathname = usePathname()

  /**
   * id ที่ไม่มีอยู่จริง/สินค้าถูกปิดขายไปแล้ว → **ถอดพารามิเตอร์ทิ้งเงียบ ๆ ไม่ toast**
   * ลิงก์เก่าที่ของถูกเอาออกไปแล้วเป็นเรื่องปกติของฟีดสาธารณะ ไม่ใช่ความผิดพลาดที่ผู้ชมต้องรับรู้
   */
  const dropParam = (key: 'p' | 'clip') => (ok: boolean) => {
    if (ok) return
    const next = new URLSearchParams(searchParams.toString())
    next.delete(key)
    const qs = next.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  // feature 00035 — เดิมอ่านจาก BuilderDraftContext (BuilderPreviewBridge.tsx) เมื่ออยู่ในโหมด
  // builder draft ผ่าน iframe; รื้อ canvas เป็น Paces-native แล้ว (2026-08-07 รอบสอง) ไม่มี Bridge
  // ห่ออีกต่อไป — อ่านจาก data.tabOrder/data.blocks (SSR) ตรง ๆ เสมอ
  const effectiveTabOrder = data.tabOrder ?? []
  const effectiveBlocks = data.blocks ?? []

  const hasItems = data.pinnedProducts.length + data.otherProducts.length > 0
  const L = shopStatVocab(data.isLodging, data.isServiceQueue)

  // feature 00035 (SRS TFR-002/TFR-003) — ตรรกะ "แท็บไหนมีข้อมูลจริง" ย้ายไป src/lib/profile-tab-keys.ts
  // เพื่อให้หน้า builder ฝั่ง seller รู้ชุดแท็บเดียวกันได้โดยไม่ต้องเขียนเงื่อนไขซ้ำ (กัน drift)
  // ผลลัพธ์ต้องเหมือนเดิม 100% — นี่คือ refactor ล้วน ไม่ใช่เปลี่ยน behavior
  const visibleKeys = computeVisibleTabKeys({
    hasVideos: data.videos.length > 0,
    isLodging: data.isLodging,
    hasRooms: data.rooms.length > 0,
    hasAvailability: data.availability != null,
    isServiceQueue: data.isServiceQueue,
    hasServices: data.services.length > 0,
    hasItems,
    /* 🛑 แท็บรีวิว **แสดงเสมอ** แม้ยังไม่มีรีวิว — เดิมตัดทั้งแท็บทิ้งเมื่อ 0 รีวิว ซึ่งอ่านได้ว่า
       "หน้านี้ไม่มีเรื่องรีวิว" ไม่ใช่ "ร้านนี้ยังไม่มีใครรีวิว" · สองอย่างนี้ต่างกันมากสำหรับคนที่
       กำลังตัดสินใจโอนเงิน และเคสร้านที่ปิดออเดอร์ไปหลายร้อยครั้งแต่ 0 รีวิว เกิดจริงบน prod */
    hasReviews: true,
  })

  // label/content ของแต่ละแท็บ — ยกมาจากของเดิมทั้งหมด ไม่แก้ถ้อยคำ
  const tabContent: Record<ProfileTabKey, { label: string; content: React.ReactNode }> = {
    // "ปักหมุด" มาก่อนเสมอเมื่อร้านปักคลิปไว้ (user กำหนด 2026-07-26) — คลิปคือสิ่งที่
    // ร้านตั้งใจให้เห็นก่อนสิ่งอื่น (ลำดับนี้อยู่ใน PROFILE_TAB_KEYS แล้ว)
    pinned: {
      label: 'ปักหมุด',
      content: (
        <ShopVideos
          items={data.videos}
          shopId={data.shopId}
          isOwnShop={data.isOwnShop}
          initialClipId={clipParam}
          onDeepLinkResolved={dropParam('clip')}
        />
      ),
    },
    rooms: {
      label: 'ห้องพัก',
      content: <PublicRoomList rooms={data.rooms} showPrices={data.showPrices} />,
    },
    calendar: {
      label: 'ปฏิทิน',
      content: data.availability ? <AvailabilityCalendar data={data.availability} /> : null,
    },
    // feature 00028 — แท็บ "บริการ" ของร้านสินค้าและบริการ ไม่มีคิวงานเลย = ไม่สร้างแท็บ
    // (ไม่ fallback ไปที่อื่น — ตั้งใจตาม UX spec §B edge states)
    services: {
      label: 'บริการ',
      // 🛑 ไม่มี SectionHead ครอบแล้ว — origin/main ถอดหัวข้อออกจากทุกแท็บในรอบ "ยกทุกแท็บให้
      // พูดภาษาเดียวกัน" (9456b128) ยกโครงของเขามาทั้งดุ้นแล้ววาง prop ของ 00053 กลับเข้าไป
      content: <PublicServiceList services={data.services} showPrices={data.showPrices} />,
    },
    items: {
      // feature 00028 — เดิม "สินค้าและบริการ" ชนกับชื่อ vertical ใหม่ เปลี่ยนเป็น "สินค้า"
      label: 'สินค้า',
      content: (
        <ProfileRightContent
          data={{
            pinnedProducts: data.pinnedProducts,
            otherProducts: data.otherProducts,
            openShopEmptyState: false,
            itemKind: data.itemKind,
          }}
          shopId={data.shopId}
          isOwnShop={data.isOwnShop}
          shopName={data.hero.shopName}
          shopAvatar={data.hero.avatar}
          initialProductId={productParam}
          onDeepLinkResolved={dropParam('p')}
          showPrices={data.showPrices}
          isServiceQueue={data.isServiceQueue}
          truncated={data.productsTruncated ?? false}
        />
      ),
    },
    about: {
      // ช่องทาง Official อยู่ในแท็บนี้ ไม่แยกเป็นแท็บของตัวเอง — เป็นข้อมูล "ติดต่อร้านนี้
      // ได้ทางไหน" ซึ่งเป็นเรื่องเดียวกับการแนะนำร้าน และทำให้จำนวนแท็บอยู่ตามที่กำหนด
      label: 'เกี่ยวกับร้าน',
      // ช่องทางย้ายขึ้นไปอยู่ใต้บรรทัด slug ในหัวโปรไฟล์แล้ว (user 2026-08-09) — ไม่คงไว้สองที่
      // เพราะเป็นข้อมูลชุดเดียวกัน การซ้ำพร้อมกรอบ "ยืนยันแล้ว" สองรอบเพิ่มพื้นที่โดยไม่เพิ่มข้อมูล
      content: <AboutOverview data={data.about} />,
    },
    reviews: {
      // คะแนนอยู่ในป้ายแท็บ ผู้ซื้อเห็นเรตทันทีโดยไม่ต้องกดเข้าไปดู
      // กางตัวหารด้วย (`4.5/5`) — เลขลอย ๆ ต้องเดาว่าเต็มเท่าไหร่ กติกาเดียวกับที่คะแนนความน่าเชื่อถือ
      // และอัตราความสำเร็จใช้อยู่แล้วบนหน้าเดียวกัน (ตัวเลขที่คำนวณย้อนกลับไม่ได้คือตัวเลขที่ไม่มีใครเชื่อ)
      /* "รีวิว 5.0" ไม่ใช่ "รีวิว 5/5" (user 2026-08-11) — ตัวหารซ้ำกับดาวที่อยู่ข้าง ๆ อยู่แล้ว
         และทำให้ป้ายยาวขึ้นจนแถบแท็บต้องเลื่อน · toFixed(1) ให้ 5 กับ 4.9 กว้างเท่ากันเสมอ
         ป้ายจึงไม่ขยับตอนคะแนนเปลี่ยน */
      /* ป้ายมีคะแนนต่อท้ายเฉพาะตอนมีรีวิวจริง — "รีวิว 0.0" อ่านเป็นคะแนนศูนย์ ไม่ใช่ยังไม่มีรีวิว */
      label: data.avgRating != null ? `รีวิว ${data.avgRating.toFixed(1)}` : 'รีวิว',
      content:
        data.ratingDistribution && data.avgRating != null ? (
          <>
            <ReviewSummary
              avgRating={data.avgRating}
              reviewCount={data.reviewCount}
              distribution={data.ratingDistribution}
            />
            <ReviewList items={data.reviews} totalCount={data.reviewCount} />
          </>
        ) : (
          /* empty state ที่แยก "ยังไม่มีใครรีวิว" ออกจาก "ร้านนี้ไม่มีประวัติ" ให้ชัด
             และบอกด้วยว่า **ใครรีวิวได้** ซึ่งเปลี่ยนการไม่มีรีวิวจากข้อด้อยเป็นหลักฐานความเข้มงวด */
          <div className='plb-8 text-center'>
            <Icon icon='tabler:message-star' width={40} className='text-[var(--mui-palette-text-disabled)] mli-auto' />
            <Typography variant='body2' color='text.secondary' className='mbs-2'>
              ยังไม่มีผู้ซื้อเขียนรีวิว
            </Typography>
            <Typography variant='caption' color='text.secondary' className='block mbs-1 mli-auto max-is-[42ch]'>
              รีวิวบน Deep มาจากผู้ซื้อที่ยืนยันรับของแล้วเท่านั้น ร้านเขียนเองหรือจ้างรีวิวไม่ได้
            </Typography>
            {data.hero.completedOrders != null && data.hero.completedOrders > 0 && (
              <Typography variant='caption' color='text.secondary' className='block mbs-1 tabular-nums'>
                {`ร้านนี้${L.verb}ไปแล้ว ${data.hero.completedOrders.toLocaleString('th-TH')} ครั้ง`}
              </Typography>
            )}
          </div>
        ),
    },
  }

  return (
    /**
     * โครงหน้า 2 คอลัมน์ตามไฟล์อ้างอิง `deep_store_profile_responsive.html` (user ส่ง 2026-08-20)
     *
     * 🛑 hero อยู่ **นอก** container โดยตั้งใจ — ปกร้านต้องกินเต็มความกว้างจอ (full-bleed)
     * ส่วนเนื้อหาด้านล่างถูกจำกัดที่ 1080px ตาม `--container` ของไฟล์อ้างอิง
     *
     * เดิมทั้งหน้าเป็นคอลัมน์เดียว `max-is-[960px]` ทุกความกว้าง ⇒ บนจอ 1440px มีที่ว่าง
     * ข้างละ ~240px ที่ไม่ได้ใช้ ขณะที่การ์ดหลักฐาน/เพจทางการ (ซึ่งเป็นข้อมูล "ตัดสินใจ")
     * ถูกดันลงไปอยู่ใต้ fold — โครงใหม่ยกขึ้นมาอยู่คอลัมน์ซ้ายที่เห็นพร้อมเนื้อหาตั้งแต่ต้น
     */
    <>
      <ProfileIdentity
        data={{
          shopName: data.hero.shopName,
          username: data.hero.username,
          avatar: data.hero.avatar,
          coverImage: data.hero.coverImage,
          tierGradient: data.hero.tierGradient,
          trustScore: data.hero.trustScore,
          tierLabel: data.hero.tierLabel,
          /* 🛑 คำนวณที่นี่ที่เดียวแล้วส่งลงไป — ห้ามให้ลูกแต่ละตัวเรียก `getTierAccentColor` เอง
             ไม่งั้นวันที่มีคนส่งคะแนนคนละตัวเข้าไป (เช่น score ของ user vs ของ shop ซึ่งเคยไม่ตรงกัน
             มาแล้วในหน้านี้) ปกกับแผงหลักฐานจะย้อมคนละสีโดยไม่มีอะไรฟ้อง */
          tierAccent: getTierAccentColor(data.hero.trustScore),
          nextTierLabel: data.hero.nextTierLabel ?? null,
          pointsToNext: data.hero.pointsToNext ?? null,
          maxVerifyLevel: data.hero.maxVerifyLevel,
          category: data.hero.category,
          createdAtIso: data.hero.createdAtIso,
          bio: data.hero.bio ?? null,
          avgRating: data.hero.avgRating ?? null,
          reviewCount: data.hero.reviewCount ?? 0,
          channels: data.channels,
          /**
           * แสดงครบทุกช่องเสมอแม้เป็น 0 — ซ่อนบางช่องแล้ว layout ขยับไปมาระหว่างร้าน
           * และผู้ซื้อแยกไม่ออกว่าช่องที่หายคือ "ไม่มี" หรือ "ไม่แสดง" (มติ 2026-07-26)
           *
           * 🛑 **3 ช่อง ไม่ใช่ 4** (user เคาะ 2026-08-23) — ช่องที่ 4 เคยเป็น "รีวิว" แล้วเปลี่ยนเป็น
           * "ระดับยืนยัน" แล้วถอดออกทั้งช่อง เพราะ:
           *   · รีวิว → ย้ายไปอยู่การ์ดคะแนนฝั่งขวาของปกแล้ว เขียนซ้ำ = เลขเดียวกันโผล่สองที่
           *   · ระดับยืนยัน → เป็นที่พูดถึงที่ **4** ของเรื่องเดียวกันบนหน้าเดียว (โล่บนรูปโปรไฟล์ ·
           *     ติ๊กถูกท้ายชื่อ · การ์ดซ้าย) และ `1/3` เป็นเศษส่วนที่ไปยืนข้างตัวนับ 356/351/5
           *     ⇒ อ่านสะดุดเพราะคนละหน่วย
           *   · 🛑 หนักกว่านั้น: ร้านเกือบทั้งหมดอยู่ระดับ 1 (ยืนยันเบอร์ = ขั้นอัตโนมัติ) ⇒ `1/3`
           *     ทำให้ร้านปกติทุกร้านดูเหมือนทำอะไรไม่เสร็จ ทั้งที่นั่นคือสถานะปกติ · การ์ดซ้าย
           *     เขียนเป็นประโยค "ยืนยันเบอร์แล้ว" ขึ้นต้นด้วยสิ่งที่ *ทำแล้ว* — คนละน้ำเสียงกัน
           *
           * กริดผูกกับ `data.stats.length` อยู่แล้ว จึงยุบเหลือ 3 คอลัมน์เองโดยไม่ต้องแก้อะไรเพิ่ม
           */
          stats: [
            { value: data.hero.completedOrders ?? 0, label: L.orders },
            { value: data.hero.customerCount ?? 0, label: L.customers },
            { value: data.hero.repeatCustomerCount ?? 0, label: L.repeat },
          ],
        }}
      />

      <Box sx={LAYOUT_SX}>
        {/* คอลัมน์ซ้าย — "ทำไมร้านนี้ถึงเชื่อถือได้" + เพจทางการ
            ≤900px ยุบเป็น 2 ช่องเรียงกันและถูกดันลงไป **ใต้** แท็บ (order) เพราะบนมือถือ
            คนกดดูของก่อน แล้วค่อยหาเหตุผลว่าเชื่อได้ไหม — ตรงข้ามกับบนเดสก์ท็อปที่เห็นพร้อมกัน */}
        <Box component='aside' sx={SIDEBAR_SX}>
          <EvidencePanel
            onOpenBadgePage={() => setExtraPage('badges')}
            data={{
              maxVerifyLevel: data.hero.maxVerifyLevel,
              verifiedLevels: data.about.verifiedLevels ?? [],
              completionRate: data.hero.completionRate,
              completionDenominator: data.hero.completionDenominator ?? 0,
              completionExcluded: data.hero.completionExcluded ?? 0,
              completionBelowMinSample: data.hero.completionBelowMinSample ?? false,
              unitLabel: L.unitLabel,
              chat: {
                chatResponseRate: data.hero.chatResponseRate,
                chatMedianResponseSec: data.hero.chatMedianResponseSec,
                chatResponseSampleSize: data.hero.chatResponseSampleSize,
              },
              badges: data.hero.badges,
              totalBadgeCount: data.hero.totalBadgeCount,
            }}
          />
          {/* กรอบการ์ดใส่ที่ "จุดเรียกใช้" ไม่ใช่ในตัว OfficialChannelsBlock เอง —
              ไฟล์นั้นออกแบบมาให้วางแทรกในเนื้อหาได้ทั่วไป (มีทั้งแถวสรุปและหน้าเต็ม) การไปตรึง
              กรอบไว้ข้างในจะบังคับรูปแบบให้ทุกที่ที่หยิบไปใช้ในอนาคต · ที่นี่มันเป็นการ์ดในคอลัมน์
              ซ้าย จึงห่อกรอบเฉพาะบริบทนี้ (padding 20 / radius 18 / เงา ตามไฟล์อ้างอิง) */}
          {/* 🛑 ไม่มีเพจ = **ไม่แสดงการ์ดเลย** ไม่ใช่แสดงการ์ดเปล่า
              ร้านที่ยังไม่ผูกช่องทางไหนเลยเคยได้กล่องขาวว่าง ๆ ค้างอยู่ในคอลัมน์ซ้าย (user ส่ง
              ภาพหน้าจอร้าน `chakeawneawsub` มาให้ดู 2026-08-21) ซึ่งอ่านได้ว่า "หน้าโหลดไม่ครบ"
              มากกว่า "ร้านนี้ยังไม่มีเพจ" — กล่องเปล่าแย่กว่าไม่มีกล่องเสมอ

              🛑 เช็คที่ `data.channels.length` ตรงนี้ ไม่ใช่ปล่อยให้ `OfficialChannelsBlock`
              คืน null เอง เพราะกรอบการ์ดอยู่ **ข้างนอก** ตัว component (ห่อที่จุดเรียกใช้)
              ถ้าเช็คข้างในกรอบก็ยังถูกวาดอยู่ดี */}
          {data.channels.length > 0 && (
            <Box sx={SIDE_CARD_SX}>
              <OfficialChannelsBlock channels={data.channels} onOpenPage={() => setExtraPage('pages')} />
            </Box>
          )}
        </Box>

        <Box component='main' sx={{ minInlineSize: 0, order: { xs: 1, md: 2 } }}>
          <PageBlocksSection blocks={effectiveBlocks} />

          {/* `.tabs-card` — การ์ดขาวครอบทั้งแถบแท็บและเนื้อหา · `overflow:hidden` ให้แถบแท็บ
              ที่มีเส้นคั่นล่างจบพอดีกับมุมมนของการ์ด (ไฟล์อ้างอิงตั้ง overflow:hidden ด้วยเหตุผลนี้)
              มือถือ (≤650) ไฟล์อ้างอิงถอดมุมมน/ขอบข้างออกให้ชนขอบจอ — ทำตาม */}
          <Box sx={TABS_CARD_SX}>
          <ProfileTabs
        /* deep link ต้องพาไปแท็บที่ของชิ้นนั้นอยู่ก่อน ไม่งั้น panel ที่ถือ lightbox ไม่ถูก mount
           (ProfileTabs render content เฉพาะแท็บที่ active) แล้วลิงก์จะเปิดหน้าเปล่าเฉย ๆ
           คีย์ที่ไม่มีในชุดแท็บ → ProfileTabs ตกกลับไปแท็บแรกให้เอง */
        initialActiveKey={productParam ? 'items' : clipParam ? 'pinned' : null}
        tabs={applyTabOrder(visibleKeys, effectiveTabOrder).map((key) => ({
          key,
          label: tabContent[key].label,
          content: tabContent[key].content,
          /* ตัวนับบนแท็บตามไฟล์อ้างอิง — เฉพาะแท็บที่ "นับได้จริง" เท่านั้น
             🛑 ไม่ใส่ให้ `reviews` เพราะป้ายแท็บนั้นแบกคะแนนอยู่แล้ว ("รีวิว 4.9") การเติมจำนวน
             ต่อท้ายจะได้ "รีวิว 4.9  17" ซึ่งเลขสองตัวติดกันคนละหน่วย อ่านผิดได้ทันที
             และไม่ใส่ให้ `about`/`calendar` เพราะไม่มีอะไรให้นับ */
          count: TAB_COUNTS[key]?.(data),
        }))}
          />
          </Box>
        </Box>
      </Box>

      {/* หน้าเต็มจอ "เพจทางการ / เหรียญของร้าน" — Base: `deep_store_extra_pages_concept_new.html`
          render ที่นี่ที่เดียว ทั้งการ์ดเหรียญและการ์ดเพจเปิดตัวเดียวกันคนละแท็บ */}
      <ShopExtraPages
        open={extraPage !== null}
        tab={extraPage ?? 'pages'}
        onClose={() => setExtraPage(null)}
        shop={{
          shopName: data.hero.shopName,
          username: data.hero.username,
          avatar: data.hero.avatar,
          tierLabel: data.hero.tierLabel,
          avgRating: data.hero.avgRating ?? null,
        }}
        channels={data.channels}
        badges={data.hero.badges}
        totalBadges={data.hero.totalBadgeCount}
      />
    </>
  )
}
