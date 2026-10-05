/**
 * PortfolioShopCard — การ์ดรายร้านบน "ภาพรวมทุกธุรกิจ" · ทั้งใบเป็น <button> (กดแล้วสลับ session ร้านก่อนไปหน้าการเงิน)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(products)/products/components/ProductStats.tsx
 *   (.card > .card-body) — ไม่ใช้ PacesStatCard ตรง ๆ เพราะห่อ <button> ไม่ได้ ยืมแค่ class
 * Base (logic): src/hooks/useShopSwitcher.ts — landingPath ต่อร้าน (hook ต้องเรียกต่อการ์ด เพราะปลายทางต่างกันตามประเภทร้าน)
 *
 * ชื่อร้านเป็น <span> ไม่ใช่ <h3>: heading ใน <button> ผิด content model และ screen reader ตัด role ทิ้งอยู่ดี
 */
'use client'

import AccountAvatar from '@/components/AccountAvatar'
import Icon from '@/components/wrappers/Icon'
import ShopSwitchOverlay from '@/components/paces/ShopSwitchOverlay'
import { useShopSwitcher } from '@/hooks/useShopSwitcher'
import { cn } from '@/utils/helpers'
import { formatBaht } from '@/lib/format-money'
import { marginText, profitHeading, profitToneClass, shopIncompleteBadges } from '@/lib/portfolio-display'

/** plain object ล้วน — ข้ามเส้น server→client ได้ */
export type PortfolioShopData = {
  shopId: string
  shopName: string
  logoUrl: string | null
  /** คำเรียกจำนวนที่ผันตามประเภทร้านแล้ว (เช่น "คำสั่งซื้อ" / "การเข้ารับบริการ") */
  orderNoun: string
  costNoun: string
  revenue: number
  netProfit: number
  marginPct: number | null
  orderCount: number
  missingCost: boolean
  missingExpense: boolean
  /** ปลายทางตามประเภทร้าน + ช่วงเวลา (คำนวณฝั่ง server) */
  landingPath: string
}

const PortfolioShopCard = ({ shop, single }: { shop: PortfolioShopData; single: boolean }) => {
  const { switching, target, switchShop } = useShopSwitcher({ landingPath: shop.landingPath })
  const incomplete = shop.missingCost || shop.missingExpense
  const badges = shopIncompleteBadges(shop, shop.costNoun)

  return (
    <>
      <button
        type="button"
        disabled={switching}
        onClick={() => switchShop(shop.shopId, { name: shop.shopName, kind: 'business', logo: shop.logoUrl })}
        className="card h-full w-full text-start transition-shadow hover:shadow-lg focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
      >
        <div className={cn('card-body flex flex-col gap-3', single && 'md:flex-row md:items-center md:gap-8')}>
          <div className={cn('flex min-w-0 items-center gap-2.5', single && 'md:w-1/3')}>
            <AccountAvatar src={shop.logoUrl} kind="business" className="size-9" />
            <span className="min-w-0 flex-1 truncate text-base font-semibold" title={shop.shopName}>
              {shop.shopName}
            </span>
            <Icon icon="chevron-right" className="text-default-700 shrink-0 text-lg" aria-hidden="true" />
          </div>

          <div className={cn('grid min-w-0 grid-cols-2 gap-base', single && 'md:flex-1')}>
            <div className="min-w-0">
              <p className="text-default-700 text-sm">ยอดขาย</p>
              <p className="text-lg font-semibold tabular-nums break-words">{formatBaht(shop.revenue)}</p>
            </div>
            <div className="min-w-0">
              <p className="text-default-700 text-sm">{profitHeading(shop.netProfit, 'shop')}</p>
              <p className={cn('text-lg font-semibold tabular-nums break-words', profitToneClass(shop.netProfit, incomplete))}>
                {formatBaht(shop.netProfit)}
              </p>
            </div>
          </div>

          <div className={cn('flex min-w-0 flex-col gap-2', single && 'md:w-1/3')}>
            <p className="text-default-700 text-sm">
              {marginText(shop.marginPct, incomplete)} · {shop.orderCount.toLocaleString('th-TH')} {shop.orderNoun}
            </p>
            {badges.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {badges.map((b) => (
                  <span key={b} className="badge bg-warning/15 text-warning-ink gap-1.5">
                    <Icon icon="alert-triangle" className="text-sm" aria-hidden="true" />
                    {b}
                  </span>
                ))}
              </div>
            )}
            <span className="text-primary mt-auto inline-flex items-center gap-1 text-sm">
              ดูการเงินร้านนี้
              <Icon icon="chevron-right" className="text-base" aria-hidden="true" />
            </span>
          </div>
        </div>
      </button>
      <ShopSwitchOverlay show={switching} targetName={target?.name} targetKind={target?.kind} targetLogo={target?.logo} />
    </>
  )
}

export default PortfolioShopCard
