'use client'

/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/components/CustomerDetails.tsx
 *
 * copy จากธีม: `card-header` + `card-body` · แถวบน `mb-7.5 flex items-center` + avatar
 * `size-11 rounded-full object-cover` + ชื่อ · รายการติดต่อ `ul.text-default-400.space-y-2.5`
 * โดยแต่ละแถวมีไอคอนกลม `btn btn-icon bg-light text-default-800 size-6! rounded-full`
 *
 * ตัดจากธีม (มีเหตุผล ไม่ใช่ความมักง่าย):
 *   - ธงชาติ — ระบบไม่มีแนวคิดประเทศของผู้ซื้อเลย
 *   - "Since 2020" — ไม่มีข้อมูลนี้ และไม่ query เพิ่มเพื่อเติมช่องว่างทางสายตา
 *   - ⋮ dropdown (share/edit/block/delete) และปุ่มดินสอที่หัวการ์ด — ไม่มี flow จริงสักอัน
 *     ใส่ไว้เท่ากับ affordance หลอก
 *   - แถวที่อยู่ — ย้ายไปการ์ด "ที่อยู่จัดส่ง" แล้ว ไม่ให้ข้อมูลเดียวกันโผล่ 2 ที่ในจอเดียว
 *   - อีเมล — ระบบเก็บช่องทางติดต่อช่องเดียว (buyerContact) ซึ่งเป็นเบอร์เป็นหลัก
 *
 * คอนทราสต์: ธีมใช้ `text-default-400` ทั้งการ์ด (2.46:1 ตก AA) → `text-default-700`/`-800`
 *
 * 'use client' บังคับ: การ์ดนี้ใช้ getSalesChannelDisplay() ซึ่งอยู่ในโมดูล 'use client'
 * (SalesChannelBadge.tsx) — เรียกจาก server component แล้วพังทั้งหน้าเป็น 500 ตอน runtime
 * โดยที่ tsc/build ไม่ฟ้องอะไรเลย (เกิดจริงบน production 2026-08-05 11:21)
 * การ์ดนี้รับ props ที่ serialize ได้ทั้งหมดอยู่แล้ว ไม่มี logic ฝั่ง server จึงย้ายมาได้ปลอดภัย
 */

import Image from 'next/image'
import Link from 'next/link'
import Icon from '@/components/wrappers/Icon'
import { formatDateTH } from '@/lib/format-date'
import { SalesChannelLogo, getSalesChannelDisplay } from '@/components/safepay/SalesChannelBadge'
import { resolveBuyerNames, type OrderFactsBuyer } from './order-detail-shared'

export default function CustomerDetails({
  buyer,
  summary,
  salesChannel,
  profileKey,
}: {
  buyer: OrderFactsBuyer
  /** ตัวเลขจริงของลูกค้ารายนี้กับร้านนี้ — null = ออเดอร์ยังไม่ผูก Customer (ไม่มีเบอร์) */
  summary: { orderCount: number; sinceISO: string } | null
  /** ช่องทางที่ลูกค้าทักเข้ามา — เป็นตราเกาะรูปโปรไฟล์ ไม่กินแถวของตัวเองในรายการติดต่อ */
  salesChannel: string | null
  /**
   * opaque key ของหน้าโปรไฟล์ลูกค้า (feature 00057) — `null` = ออเดอร์นี้ไม่มีข้อมูลติดต่อเลย
   * จน key ตกเป็น `guest-unknown` ซึ่ง **match ลูกค้าหลายคนพร้อมกัน** ⇒ ต้องไม่มีลิงก์
   * ผู้เรียกเป็นคนตัดสินและส่ง `null` มาให้ ไม่ใช่ให้ที่นี่เดาเอง
   */
  profileKey: string | null
}) {
  const { registeredName, displayName, hasBuyerInfo } = resolveBuyerNames(buyer)
  const channelLabel = salesChannel ? getSalesChannelDisplay(salesChannel).label : null

  return (
    <div className="card">
      <div className="card-header">
        <h4 className="card-title">ผู้ซื้อ</h4>
        {/* ทางเข้าที่ 3 ของหน้าโปรไฟล์ลูกค้า (feature 00057 FR-012) */}
        {profileKey && (
          <Link
            href={`/customers/${encodeURIComponent(profileKey)}`}
            className="text-primary-ink hover:text-primary inline-flex items-center gap-1 text-2xs font-medium">
            <Icon icon="user-circle" className="text-xs" aria-hidden="true" />
            ดูโปรไฟล์ลูกค้า
          </Link>
        )}
      </div>
      <div className="card-body">
        {!hasBuyerInfo ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <Icon icon="user-off" className="text-default-300 mb-2 text-3xl" aria-hidden="true" />
            <p className="text-default-700 text-sm">ยังไม่มีผู้ซื้อยืนยัน</p>
            <p className="text-default-700 mt-1 text-xs">ผู้ซื้อจะต้องยืนยัน OTP ผ่านลิงก์ก่อนข้อมูลจะปรากฏ</p>
          </div>
        ) : (
          <>
            <div className="mb-5 flex items-center">
              <div className="relative me-2.5">
                {buyer.avatar ? (
                  <Image
                    alt={displayName ?? 'ผู้ซื้อ'}
                    className="size-11 rounded-full object-cover"
                    height={44}
                    src={buyer.avatar}
                    width={44}
                  />
                ) : (
                  <div className="bg-default-200 flex size-11 items-center justify-center rounded-full">
                    <span className="text-default-700 text-sm font-semibold">
                      {displayName ? (
                        displayName.charAt(0).toUpperCase()
                      ) : (
                        <Icon icon="user" className="text-base" aria-hidden="true" />
                      )}
                    </span>
                  </div>
                )}
                {salesChannel && (
                  <span
                    aria-label={`ทักมาจาก ${channelLabel}`}
                    className="ring-card absolute -end-0.5 -bottom-0.5 flex size-4.5 items-center justify-center overflow-hidden rounded-full ring-2"
                    title={`ทักมาจาก ${channelLabel}`}
                  >
                    <SalesChannelLogo channel={salesChannel} className="size-full rounded-full" size={18} />
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <h5 className="text-default-800 mb-1.25 truncate text-sm font-medium">
                  {displayName ?? 'ไม่ระบุชื่อ'}
                </h5>
                <p className="text-default-700 text-xs">
                  {buyer.buyerUsername
                    ? `@${buyer.buyerUsername}`
                    : registeredName
                      ? 'ผู้ซื้อที่ลงทะเบียนแล้ว'
                      : 'ชื่อที่ร้านบันทึก'}
                </p>
              </div>
            </div>

            <ul className="space-y-2.5">
              {/* ตัวเลขจริงจากฐาน — บอกว่าลูกค้าคนนี้เคยซื้อกับ *ร้านนี้* มาแล้วกี่ครั้ง
                  ร้านใช้ตัดสินใจได้จริง (ลูกค้าประจำ vs คนใหม่) และไม่ใช่ข้อมูลที่แต่งขึ้น */}
              {summary && (
                <>
                  <li>
                    <div className="flex items-center gap-2.5">
                      <span className="btn btn-icon bg-light text-default-800 size-6! rounded-full">
                        <Icon icon="shopping-bag" className="text-sm" aria-hidden="true" />
                      </span>
                      <span className="text-default-800 text-sm font-medium">
                        สั่งกับร้านนี้ {summary.orderCount} ครั้ง
                      </span>
                    </div>
                  </li>
                  <li>
                    <div className="flex items-center gap-2.5">
                      <span className="btn btn-icon bg-light text-default-800 size-6! rounded-full">
                        <Icon icon="calendar-plus" className="text-sm" aria-hidden="true" />
                      </span>
                      <span className="text-default-700 text-sm">
                        ลูกค้าตั้งแต่ {formatDateTH(summary.sinceISO)}
                      </span>
                    </div>
                  </li>
                </>
              )}
              <li>
                <div className="flex items-center gap-2.5">
                  <span className="btn btn-icon bg-light text-default-800 size-6! rounded-full">
                    <Icon icon="phone" className="text-sm" aria-hidden="true" />
                  </span>
                  {buyer.buyerContact ? (
                    // ลิงก์เดียวของการ์ดนี้ที่กดแล้วทำอะไรจริง — ร้านต้องโทรหาลูกค้าตอนแพ็คของ
                    /* 🛑 ต้องเป็น `inline-flex items-center` ไม่ใช่ `<a>` เปล่า ๆ ที่ใส่ `min-h-11`
                       `<a>` ที่เป็นลูกของ flex ถูก **blockify** ⇒ `min-height: 44px` มีผลจริง
                       แต่ตัวอักษรไปนอนบนสุดของกล่อง 44px นั้น ขณะที่ไอคอน 24px ถูก `items-center`
                       จัดกลางแถว ⇒ **เบอร์ลอยสูงกว่าไอคอน** (user เจอบน TestFlight 2026-08-17)
                       จัดกลางในตัวเองแล้ว ได้ทั้ง tap target 44px และบรรทัดที่ตรงกับไอคอน */
                    <a
                      className="text-primary hover:text-primary-hover inline-flex min-h-11 items-center text-sm font-medium transition-all sm:min-h-0"
                      href={`tel:${buyer.buyerContact}`}
                    >
                      {buyer.buyerContact}
                    </a>
                  ) : (
                    <span className="text-default-700 text-sm font-medium">ยังไม่มีเบอร์ติดต่อ</span>
                  )}
                </div>
              </li>
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
