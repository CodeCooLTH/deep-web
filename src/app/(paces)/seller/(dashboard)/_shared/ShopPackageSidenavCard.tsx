/**
 * ShopPackageSidenavCard — การ์ดสรุปแพ็กเกจร้านค้า วางเหนือหัวข้อกลุ่ม ANALYTICS ใน sidenav ของ seller
 * (Business Package feat 00008 — sidenav entry point) กดทั้งการ์ดแล้วไปหน้า /business
 *
 * RSC ล้วน (ไม่ต้อง 'use client') — มีแค่ <Link> ไม่มี interactive อื่น: ทั้งการ์ดคือลิงก์เดียว
 * "ปุ่ม"/"text-link" ในสเปกเป็นแค่สไตล์ภาพ (span) ไม่ใช่ element คลิกซ้อน — มิเรอร์ DisabledCta
 * ใน business/components/PackageTierGrid.tsx (span ทำหน้าตาปุ่มโดยไม่ nest interactive element)
 *
 * Base (token สไตล์บนพื้น sidenav มืด — ห้ามใช้ .card เพราะพื้นขาวจะลอย):
 *   dashboard/components/ChecklistSidebar.tsx:118-132
 *   (text-(--sidenav-item-color) / hover:text-(--sidenav-item-hover-color) /
 *    hover:bg-(--sidenav-item-hover-bg) — inherit จาก <html data-menu-color="dark">)
 * Base (คำ/สี LOCKED + ปุ่ม solid สีแดง): business/components/LockedStateBanner.tsx
 * Base (ปุ่ม upgrade + icon crown): inventory/components/UpgradeToProCard.tsx
 * Base (badge "ปัจจุบัน" bg-primary/15 text-primary): business/components/PackageTierGrid.tsx:150-154
 *   (บั๊มเป็น bg-primary/20 เพราะพื้นการ์ดนี้มืดกว่า .card ขาว — ต้องการ contrast มากขึ้น)
 *
 * ไม่ใช้สีเขียวแม้สถานะ ACTIVE — เขียวสงวนไว้เฉพาะ "trust verified" (Verified-Means-Green Rule)
 * ไม่คิดสีแยกตาม tier (GROWTH/PRO/BUSINESS ใช้โทน primary เดียวกันหมด — /business เองก็ไม่ทำ)
 *
 * Icon (crown ปกติ, alert-triangle text-danger เมื่อ LOCKED) วางนอก .shop-package-card-text
 * และคงอยู่เสมอแม้ sidenav ยุบ (condensed/on-hover ไม่ hover) — เป็น anchor ให้ตาเห็นตอนยุบ
 * (ต่างจาก Design Spec ที่พูดถึง icon คู่กับ value เฉพาะ NOT_SUBSCRIBED/LOCKED — ที่นี่ทำเป็น icon
 * ประจำการ์ดเสมอแทน เพราะสถานะยุบ (CSS ด้านล่าง) ต้องมีอะไรให้แสดงทุก status ไม่ใช่แค่ 2 ใน 5 —
 * ตัดสินใจเอง ยังไม่ผ่าน ux review เพิ่มเติม แจ้งใน report)
 *
 * สถานะยุบ sidenav (condensed / on-hover ไม่ hover) — ดู CSS ที่ src/assets/css/safepay-overrides.css
 * (ต่อท้ายบล็อก seller-mobile-shell): ซ่อน .shop-package-card-text + จัดกลาง .shop-package-card
 */

import Icon from '@/components/wrappers/Icon'
import Link from 'next/link'
import {
  BUSINESS_PACKAGE_TIER_CONFIG,
  type BusinessPackageTier,
  type BusinessPackageStatusApp,
} from '@/lib/business-package'

interface ShopPackageSidenavCardProps {
  status: BusinessPackageStatusApp
  tier: BusinessPackageTier | null
  /**
   * true = OWNER ของร้าน → การ์ดทั้งใบเป็นลิงก์ไป /business + มี CTA จัดการ/อัพเกรด
   * false = สมาชิกอื่น (ADMIN) → เห็นข้อมูลเหมือนกันทุกอย่าง แต่ "ดูอย่างเดียว" ไม่มีลิงก์/CTA
   *   (Business Package สมัครระดับบัญชีเจ้าของ — คนอื่นกดไปก็จัดการไม่ได้ = dead-end)
   */
  canManage: boolean
}

export default function ShopPackageSidenavCard({ status, tier, canManage }: ShopPackageSidenavCardProps) {
  const isLocked = status === 'LOCKED_RENEWAL_FAILED'
  const isActive = status === 'ACTIVE'

  const config = tier ? BUSINESS_PACKAGE_TIER_CONFIG[tier] : null
  // Free = pseudo tier (ไม่มี row ใน BUSINESS_PACKAGE_TIER_CONFIG) — NOT_SUBSCRIBED เท่านั้นที่ไม่มี config
  const tierLabel = config?.label ?? 'Free'
  const priceLabel = config ? `฿${config.priceBaht.toLocaleString('th-TH')} ต่อเดือน` : null

  // ดูอย่างเดียว → เป็น <div> ไม่ใช่ <Link> (กันกดแล้วไปเจอหน้าที่ทำอะไรไม่ได้) และไม่มี hover state
  const Wrapper = canManage ? Link : 'div'
  const wrapperProps = canManage
    ? {
        href: '/business',
        'aria-label': `แพ็กเกจร้านค้า ${tierLabel}${isLocked ? ' ต่ออายุไม่สำเร็จ' : ''} ไปที่หน้าแพ็กเกจ`,
      }
    : {}

  return (
    <Wrapper
      {...(wrapperProps as { href: string })}
      className={`shop-package-card flex items-center gap-2.5 rounded-md border-s-3 px-2.5 py-2.5 text-(--sidenav-item-color) ${
        canManage
          ? 'transition-colors hover:text-(--sidenav-item-hover-color) hover:bg-(--sidenav-item-hover-bg)'
          : ''
      } ${isLocked ? 'border-danger' : 'border-primary'}`}
    >
      <Icon
        icon={isLocked ? 'alert-triangle' : 'crown'}
        className={`size-5 shrink-0 ${isLocked ? 'text-danger' : ''}`}
        aria-hidden="true"
      />

      <div className="shop-package-card-text min-w-0 flex-1">
        <p className="text-2xs font-semibold opacity-80">แพ็กเกจร้านค้า</p>

        <div className="mt-0.5 flex items-center gap-1.5">
          <span className="truncate text-sm font-bold">{tierLabel}</span>
          {isActive && (
            <span className="badge bg-primary/20 text-primary text-2xs ms-auto shrink-0">ใช้งานอยู่</span>
          )}
          {isLocked && (
            <span className="badge bg-danger/15 text-danger text-2xs ms-auto shrink-0">ต่ออายุไม่สำเร็จ</span>
          )}
        </div>

        {status === 'NOT_SUBSCRIBED' && (
          <p className="mt-0.5 text-2xs opacity-70">อัพเกรดเพื่อเปิดธุรกิจเพิ่ม</p>
        )}
        {isActive && priceLabel && <p className="mt-0.5 text-2xs opacity-70">{priceLabel}</p>}

        {/* CTA เฉพาะ OWNER — คนอื่นเห็นข้อมูลเหมือนกันแต่ไม่มีปุ่ม (จัดการแทนไม่ได้อยู่แล้ว) */}
        {canManage && (
          <div className="mt-2">
            {status === 'NOT_SUBSCRIBED' && (
              <span className="btn btn-sm bg-primary text-white hover:bg-primary-hover w-full">
                อัพเกรดแพ็กเกจ
              </span>
            )}
            {isActive && (
              <span className="text-primary text-2xs font-bold">จัดการแพ็กเกจ →</span>
            )}
            {isLocked && (
              <span className="btn btn-sm bg-danger text-white hover:bg-danger-hover w-full">
                แก้ไขเลย →
              </span>
            )}
          </div>
        )}
      </div>
    </Wrapper>
  )
}
