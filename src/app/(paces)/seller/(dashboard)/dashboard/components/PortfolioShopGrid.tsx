/**
 * PortfolioShopGrid — กริดการ์ดรายร้าน (ร้านเดียว = แถวเต็มกว้าง ไม่ยัดกริดที่ว่างสองช่อง)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(products)/products/components/ProductStats.tsx (grid ของการ์ด)
 */
'use client'

import { cn } from '@/utils/helpers'
import PortfolioShopCard, { type PortfolioShopData } from './PortfolioShopCard'
import PortfolioShopCardError from './PortfolioShopCardError'

export type PortfolioGridItem = { failed: false; shop: PortfolioShopData } | { failed: true; shopId: string; shopName: string; logoUrl: string | null }

const PortfolioShopGrid = ({ items }: { items: PortfolioGridItem[] }) => {
  const single = items.length === 1
  return (
    <div className={cn('grid gap-1.25', !single && 'md:grid-cols-2 2xl:grid-cols-3')}>
      {items.map((it) =>
        it.failed ? (
          <PortfolioShopCardError key={it.shopId} shopName={it.shopName} logoUrl={it.logoUrl} />
        ) : (
          <PortfolioShopCard key={it.shop.shopId} shop={it.shop} single={single} />
        ),
      )}
    </div>
  )
}

export default PortfolioShopGrid
