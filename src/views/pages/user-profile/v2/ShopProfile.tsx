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
 * ชุดแท็บขึ้นกับประเภทกิจการ (user กำหนด 2026-07-26)
 *   ร้านทั่วไป  สินค้าและบริการ / เกี่ยวกับร้าน / รีวิว {คะแนน}
 *   ร้านที่พัก   บ้านพัก / ปฏิทิน / เกี่ยวกับ / รีวิว {คะแนน}
 */
import ProfileHero, { type ProfileHeroData } from './ProfileHero'
import ProfileTabs from './ProfileTabs'
import PublicRoomList, { type PublicRoom } from './PublicRoomList'
import AvailabilityCalendar, { type AvailabilityData } from './AvailabilityCalendar'
import OfficialChannels, { type OfficialChannel } from './OfficialChannels'
import ReviewSummary, { type RatingBucket } from './ReviewSummary'
import ReviewList, { type ReviewListItem } from './ReviewList'
import AboutOverview, { type AboutData } from '../profile/AboutOverview'
import { ProfileRightContent } from '../profile'
import type { SerializedProduct } from '../profile'

export type ShopProfileData = {
  hero: ProfileHeroData
  isLodging: boolean
  rooms: PublicRoom[]
  availability: AvailabilityData | null
  pinnedProducts: SerializedProduct[]
  otherProducts: SerializedProduct[]
  about: AboutData
  channels: OfficialChannel[]
  reviews: ReviewListItem[]
  avgRating: number | null
  reviewCount: number
  ratingDistribution: RatingBucket[] | null
  shopId: string | null
  isOwnShop: boolean
  itemKind?: 'PRODUCT' | 'ROOM'
}

export default function ShopProfile({ data }: { data: ShopProfileData }) {
  const hasItems = data.pinnedProducts.length + data.otherProducts.length > 0

  return (
    <div className='mli-auto max-is-[960px]'>
      <ProfileHero data={data.hero} />

      <ProfileTabs
        tabs={[
          // แท็บที่ไม่มีข้อมูลไม่ถูกสร้างเป็นตัวเลือกเลย ไม่ใช่สร้างแล้วโชว์หน้าเปล่า
          ...(data.isLodging && data.rooms.length > 0
            ? [{ key: 'rooms', label: 'บ้านพัก', content: <PublicRoomList rooms={data.rooms} /> }]
            : []),
          ...(data.isLodging && data.availability
            ? [
                {
                  key: 'calendar',
                  label: 'ปฏิทิน',
                  content: <AvailabilityCalendar data={data.availability} />,
                },
              ]
            : []),
          ...(!data.isLodging && hasItems
            ? [
                {
                  key: 'items',
                  label: 'สินค้าและบริการ',
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
              ]
            : []),
          {
            // ช่องทาง Official อยู่ในแท็บนี้ ไม่แยกเป็นแท็บของตัวเอง — เป็นข้อมูล "ติดต่อร้านนี้
            // ได้ทางไหน" ซึ่งเป็นเรื่องเดียวกับการแนะนำร้าน และทำให้จำนวนแท็บอยู่ตามที่กำหนด
            key: 'about',
            label: data.isLodging ? 'เกี่ยวกับ' : 'เกี่ยวกับร้าน',
            content: (
              <div className='flex flex-col gap-5'>
                <AboutOverview data={data.about} />
                {data.channels.length > 0 && <OfficialChannels channels={data.channels} />}
              </div>
            ),
          },
          ...(data.ratingDistribution && data.avgRating != null
            ? [
                {
                  key: 'reviews',
                  // คะแนนอยู่ในป้ายแท็บ ผู้ซื้อเห็นเรตทันทีโดยไม่ต้องกดเข้าไปดู
                  label: `รีวิว ${data.avgRating}`,
                  content: (
                    <>
                      <ReviewSummary
                        avgRating={data.avgRating}
                        reviewCount={data.reviewCount}
                        distribution={data.ratingDistribution}
                      />
                      <ReviewList items={data.reviews} />
                    </>
                  ),
                },
              ]
            : []),
        ]}
      />
    </div>
  )
}
