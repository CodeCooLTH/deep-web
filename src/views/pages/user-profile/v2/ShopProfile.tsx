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
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import Typography from '@mui/material/Typography'

import { Icon } from '@iconify/react'

import ProfileIdentity from './ProfileIdentity'
import EvidencePanel from './EvidencePanel'
import OfficialChannelsBlock from './OfficialChannelsBlock'
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
}

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
    rooms: { label: 'ห้องพัก', content: <PublicRoomList rooms={data.rooms} /> },
    calendar: {
      label: 'ปฏิทิน',
      content: data.availability ? <AvailabilityCalendar data={data.availability} /> : null,
    },
    // feature 00028 — แท็บ "บริการ" ของร้านสินค้าและบริการ ไม่มีคิวงานเลย = ไม่สร้างแท็บ
    // (ไม่ fallback ไปที่อื่น — ตั้งใจตาม UX spec §B edge states)
    services: { label: 'บริการ', content: <PublicServiceList services={data.services} /> },
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
            <ReviewList items={data.reviews} />
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
    <div className='mli-auto max-is-[960px]'>
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
          /* แสดงครบ 4 ช่องเสมอแม้เป็น 0 — ซ่อนบางช่องแล้ว layout ขยับไปมาระหว่างร้าน
             และผู้ซื้อแยกไม่ออกว่าช่องที่หายคือ "ไม่มี" หรือ "ไม่แสดง" (มติ 2026-07-26) */
          stats: [
            { value: data.hero.completedOrders ?? 0, label: L.orders },
            { value: data.hero.customerCount ?? 0, label: L.customers },
            { value: data.hero.repeatCustomerCount ?? 0, label: L.repeat },
            { value: data.reviewCount > 0 ? data.reviewCount : null, label: 'รีวิว' },
          ],
        }}
      />

      <EvidencePanel
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
          shopName: data.hero.shopName,
          tierAccent: getTierAccentColor(data.hero.trustScore),
        }}
      />

      {/* pbs-6 (24px) ไม่ใช่ 16 — ทิศทาง B: บล็อกที่ไม่มีพื้นสีคั่นต้องใช้ที่ว่างทำหน้าที่แทนกล่อง */}
      <div className='pli-5 pbs-6'>
        <OfficialChannelsBlock channels={data.channels} shopName={data.hero.shopName} />
      </div>

      <PageBlocksSection blocks={effectiveBlocks} />

      <ProfileTabs
        /* deep link ต้องพาไปแท็บที่ของชิ้นนั้นอยู่ก่อน ไม่งั้น panel ที่ถือ lightbox ไม่ถูก mount
           (ProfileTabs render content เฉพาะแท็บที่ active) แล้วลิงก์จะเปิดหน้าเปล่าเฉย ๆ
           คีย์ที่ไม่มีในชุดแท็บ → ProfileTabs ตกกลับไปแท็บแรกให้เอง */
        initialActiveKey={productParam ? 'items' : clipParam ? 'pinned' : null}
        tabs={applyTabOrder(visibleKeys, effectiveTabOrder).map((key) => ({
          key,
          label: tabContent[key].label,
          content: tabContent[key].content,
        }))}
      />
    </div>
  )
}
