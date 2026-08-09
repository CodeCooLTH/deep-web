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
import ProfileHero, { type ProfileHeroData } from './ProfileHero'
import PageBlocksSection, { type PageBlockItem } from './PageBlocksSection'
import ProfileTabs from './ProfileTabs'
import PublicRoomList, { type PublicRoom } from './PublicRoomList'
import PublicServiceList, { type PublicService } from './PublicServiceList'
import AvailabilityCalendar, { type AvailabilityData } from './AvailabilityCalendar'
import OfficialChannels, { type OfficialChannel } from './OfficialChannels'
import ReviewSummary, { type RatingBucket } from './ReviewSummary'
import ReviewList, { type ReviewListItem } from './ReviewList'
import ShopVideos, { type ShopVideoItem } from './ShopVideos'
import AboutOverview, { type AboutData } from '../profile/AboutOverview'
import { ProfileRightContent } from '../profile'
import type { SerializedProduct } from '../profile'
import { applyTabOrder, computeVisibleTabKeys, type ProfileTabKey } from '@/lib/profile-tab-keys'

export type ShopProfileData = {
  hero: ProfileHeroData
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
  // feature 00035 — เดิมอ่านจาก BuilderDraftContext (BuilderPreviewBridge.tsx) เมื่ออยู่ในโหมด
  // builder draft ผ่าน iframe; รื้อ canvas เป็น Paces-native แล้ว (2026-08-07 รอบสอง) ไม่มี Bridge
  // ห่ออีกต่อไป — อ่านจาก data.tabOrder/data.blocks (SSR) ตรง ๆ เสมอ
  const effectiveTabOrder = data.tabOrder ?? []
  const effectiveBlocks = data.blocks ?? []

  const hasItems = data.pinnedProducts.length + data.otherProducts.length > 0

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
    hasReviews: data.ratingDistribution != null && data.avgRating != null,
  })

  // label/content ของแต่ละแท็บ — ยกมาจากของเดิมทั้งหมด ไม่แก้ถ้อยคำ
  const tabContent: Record<ProfileTabKey, { label: string; content: React.ReactNode }> = {
    // "ปักหมุด" มาก่อนเสมอเมื่อร้านปักคลิปไว้ (user กำหนด 2026-07-26) — คลิปคือสิ่งที่
    // ร้านตั้งใจให้เห็นก่อนสิ่งอื่น (ลำดับนี้อยู่ใน PROFILE_TAB_KEYS แล้ว)
    pinned: { label: 'ปักหมุด', content: <ShopVideos items={data.videos} /> },
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
        />
      ),
    },
    about: {
      // ช่องทาง Official อยู่ในแท็บนี้ ไม่แยกเป็นแท็บของตัวเอง — เป็นข้อมูล "ติดต่อร้านนี้
      // ได้ทางไหน" ซึ่งเป็นเรื่องเดียวกับการแนะนำร้าน และทำให้จำนวนแท็บอยู่ตามที่กำหนด
      label: 'เกี่ยวกับร้าน',
      content: (
        <div className='flex flex-col gap-5'>
          <AboutOverview data={data.about} />
          {data.channels.length > 0 && <OfficialChannels channels={data.channels} />}
        </div>
      ),
    },
    reviews: {
      // คะแนนอยู่ในป้ายแท็บ ผู้ซื้อเห็นเรตทันทีโดยไม่ต้องกดเข้าไปดู
      // กางตัวหารด้วย (`4.5/5`) — เลขลอย ๆ ต้องเดาว่าเต็มเท่าไหร่ กติกาเดียวกับที่คะแนนความน่าเชื่อถือ
      // และอัตราความสำเร็จใช้อยู่แล้วบนหน้าเดียวกัน (ตัวเลขที่คำนวณย้อนกลับไม่ได้คือตัวเลขที่ไม่มีใครเชื่อ)
      label: `รีวิว ${data.avgRating}/5`,
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
        ) : null,
    },
  }

  return (
    <div className='mli-auto max-is-[960px]'>
      <ProfileHero data={{ ...data.hero, shopId: data.shopId }} />

      <PageBlocksSection blocks={effectiveBlocks} />

      <ProfileTabs
        tabs={applyTabOrder(visibleKeys, effectiveTabOrder).map((key) => ({
          key,
          label: tabContent[key].label,
          content: tabContent[key].content,
        }))}
      />
    </div>
  )
}
