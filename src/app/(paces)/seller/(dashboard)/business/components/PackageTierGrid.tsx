/**
 * PackageTierGrid — grid 4 การ์ด tier (Free/Growth/Pro/Business) ของ package matrix (Design Spec §1 ข้อ 4)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/pages/pricing/page.tsx (grid 4 card: card > card-body
 *   p-7.5 text-center > title/subtitle/price/feature-tick ul > CTA area px-15 pt-3.75 pb-7.5)
 *   + src/app/(paces)/seller/(dashboard)/inventory/components/InventoryGate.tsx (1-card gate ที่เคย
 *   ขยายมาจาก pricing/page.tsx เดียวกัน — ยึด text-4xl แทน text-[40px] arbitrary)
 *
 * Adaptations vs pricing/page.tsx:
 * - ตัด `!bg-primary` เต็มการ์ดแบบ popular-plan — เปลี่ยนเป็น `border-primary border` สำหรับ tier ปัจจุบัน
 *   (Design Spec: "current tier=border-primary border ไม่ใช่ !bg-primary")
 * - ตัด `text-[40px]` arbitrary → ใช้ token `text-4xl` (HR7)
 * - ปุ่ม CTA เปลี่ยนตาม state matrix (Design Spec §1) แทน Link เดี่ยว — embed client button ต่อ state
 * - LOCKED state: ทุกปุ่ม grid disabled (reactivate อยู่ที่ LockedStateBanner แทน ไม่ใช่ในนี้)
 *
 * server component ล้วน — ปุ่ม action ทั้งหมด (PackageActionButton/CancelPackageButton/DowngradeButton)
 * เป็น client component แยกไฟล์ (มี Swal/router.refresh) embed เข้ามา
 */
import Icon from '@/components/wrappers/Icon'
import {
  BUSINESS_PACKAGE_TIER_CONFIG,
  TIER_ORDER,
  type BusinessPackageTier,
  type BusinessPackageStatusApp,
} from '@/lib/business-package'
import PackageActionButton from './PackageActionButton'
import CancelPackageButton from './CancelPackageButton'
import DowngradeButton, { type DowngradeBusinessItem } from './DowngradeButton'

export interface PackageTierGridProps {
  statusApp: BusinessPackageStatusApp
  currentTier: BusinessPackageTier | null
  /** ธุรกิจที่ owner เป็นเจ้าของทั้งหมด — ใช้โดย CancelPackageButton/DowngradeButton */
  ownedBusinesses: DowngradeBusinessItem[]
}

// Free — pseudo tier UI-only (ไม่มี row ใน DB, ไม่อยู่ใน BUSINESS_PACKAGE_TIER_CONFIG SSOT)
// ตัวเลข 0/0 ตรงตาม Design Spec Constants: "Free ฿0(0/-)"
const FREE_TIER = { priceBaht: 0, maxBusinesses: 0, maxAdminsPerBusiness: null as number | null, label: 'Free' }

function quotaFeatures(maxBusinesses: number | null, maxAdminsPerBusiness: number | null): string[] {
  if (maxBusinesses === 0) {
    return ['ใช้ Personal shop ได้ตามปกติ (ฟรีตลอดไป)', 'สร้าง Business account ไม่ได้']
  }
  return [
    `สร้างได้ ${maxBusinesses === null ? 'ไม่จำกัด' : maxBusinesses} ธุรกิจ`,
    `${maxAdminsPerBusiness === null ? 'ไม่จำกัด' : maxAdminsPerBusiness} ผู้ดูแลต่อธุรกิจ`,
    'Product/Order/Wallet แยกเป็นของตัวเอง',
  ]
}

const TIERS: { tier: BusinessPackageTier; label: string }[] = [
  { tier: 'GROWTH', label: 'Growth' },
  { tier: 'PRO', label: 'Pro' },
  { tier: 'BUSINESS', label: 'Business' },
]

export default function PackageTierGrid({ statusApp, currentTier, ownedBusinesses }: PackageTierGridProps) {
  const isLocked = statusApp === 'LOCKED_RENEWAL_FAILED'
  const isActive = statusApp === 'ACTIVE'

  return (
    <div className="grid grid-cols-1 gap-base md:grid-cols-2 lg:grid-cols-4">
      {/* ─── Free card ───────────────────────────────────────────────────── */}
      <TierCard
        label="Free"
        price={FREE_TIER.priceBaht}
        features={quotaFeatures(FREE_TIER.maxBusinesses, FREE_TIER.maxAdminsPerBusiness)}
        isCurrent={statusApp === 'NOT_SUBSCRIBED'}
        cta={
          statusApp === 'NOT_SUBSCRIBED' ? null : isActive ? (
            <CancelPackageButton ownedBusinessNames={ownedBusinesses.map((b) => b.shopName)} />
          ) : (
            // LOCKED — ปุ่มยกเลิกไม่มีความหมาย (ไม่มี subscription ที่ ACTIVE ให้ยกเลิก) — reactivate อยู่ที่ banner
            <DisabledCta label="ยกเลิกแพ็กเกจ" />
          )
        }
      />

      {/* ─── Growth / Pro / Business cards ─────────────────────────────────── */}
      {TIERS.map(({ tier, label }) => {
        const config = BUSINESS_PACKAGE_TIER_CONFIG[tier]
        const isCurrent = currentTier === tier
        const isHigher = currentTier ? TIER_ORDER[tier] > TIER_ORDER[currentTier] : true
        const isLower = currentTier ? TIER_ORDER[tier] < TIER_ORDER[currentTier] : false

        let cta: React.ReactNode = null
        if (isLocked) {
          cta = <DisabledCta label={isCurrent ? 'ล็อกอยู่' : isHigher ? 'อัพเกรด' : 'ดาวน์เกรด'} />
        } else if (statusApp === 'NOT_SUBSCRIBED') {
          cta = <PackageActionButton tier={tier} tierLabel={label} price={config.priceBaht} mode="subscribe" />
        } else if (isActive && isCurrent) {
          cta = null // badge "ปัจจุบัน" แสดงแทน — ไม่มีปุ่ม
        } else if (isActive && isHigher) {
          cta = <PackageActionButton tier={tier} tierLabel={label} price={config.priceBaht} mode="upgrade" />
        } else if (isActive && isLower) {
          cta = (
            <DowngradeButton
              tier={tier}
              tierLabel={label}
              maxBusinesses={config.maxBusinesses}
              ownedBusinesses={ownedBusinesses}
            />
          )
        }

        return (
          <TierCard
            key={tier}
            label={label}
            price={config.priceBaht}
            features={quotaFeatures(config.maxBusinesses, config.maxAdminsPerBusiness)}
            isCurrent={isCurrent}
            cta={cta}
          />
        )
      })}
    </div>
  )
}

function DisabledCta({ label }: { label: string }) {
  return (
    <span
      aria-disabled="true"
      className="btn bg-light text-default-400 w-full cursor-not-allowed inline-flex items-center justify-center gap-1.5"
    >
      <Icon icon="lock" className="text-base" aria-hidden="true" />
      {label}
    </span>
  )
}

function TierCard({
  label,
  price,
  features,
  isCurrent,
  cta,
}: {
  label: string
  price: number
  features: string[]
  isCurrent: boolean
  cta: React.ReactNode
}) {
  return (
    <div className={`card h-full rounded-md${isCurrent ? ' border-primary border' : ''}`}>
      <div className="card-body p-7.5 text-center">
        {isCurrent && (
          <span className="badge bg-primary/15 text-primary mb-3 inline-flex items-center gap-1">
            <Icon icon="check" className="text-xs" aria-hidden="true" />
            ปัจจุบัน
          </span>
        )}
        <h3 className="mb-1.25 text-xl font-bold">{label}</h3>
        <div className="my-7.5">
          <h1 className="text-4xl font-bold">฿{price.toLocaleString('th-TH')}</h1>
          <small className="text-default-400 text-sm">/เดือน</small>
        </div>
        <ul className="space-y-2.5 text-start">
          {features.map((feature, i) => (
            <li className="flex items-center gap-3" key={i}>
              <Icon icon="check" className="text-success text-sm shrink-0" aria-hidden="true" />
              {feature}
            </li>
          ))}
        </ul>
      </div>
      {/* CTA area padding — px-15 pt-3.75 pb-7.5 มิเรอร์ theme pricing/page.tsx เป๊ะ */}
      {cta && <div className="px-15 pt-3.75 pb-7.5">{cta}</div>}
    </div>
  )
}
