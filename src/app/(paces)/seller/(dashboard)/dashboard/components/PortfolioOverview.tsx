/**
 * PortfolioOverview — ส่วน "ภาพรวมทุกธุรกิจ" บนบริบท Personal ของ /seller/dashboard (feature 00069)
 * SSOT: docs/20 - Features/00069 - Professional Multi-Business Dashboard/UX-Design-Spec.md
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/widgets/charts/components/SalesReport.tsx (การ์ดสรุป — ดู PortfolioSummaryCard)
 *   + theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(products)/products/components/ProductStats.tsx (การ์ดร้าน)
 *
 * - ไม่เข้าเงื่อนไข (0 ร้าน OWNER+จ่ายแล้ว) → page ไม่ mount ส่วนนี้เลย (เช็คด้วย listOverviewShops ก่อน —
 *   ถ้าเช็คใน Suspense ผู้ใช้ Personal ส่วนใหญ่จะเห็น skeleton วาบแล้วหายทุกครั้ง)
 * - Suspense key = สตริงช่วงเวลา → เปลี่ยนช่วงแล้วขึ้น skeleton เฉพาะส่วนนี้ ส่วนล่างของ Dashboard ไม่ขยับ
 * - service ล้มทั้งก้อน → SellerErrorState ในส่วนนี้ ส่วนอื่นของหน้าไม่กระทบ (ไม่ throw ขึ้นไปเป็น 500 ทั้งหน้า)
 */
import { Suspense } from 'react'
import { getT } from '@/i18n/server'
import { byVertical } from '@/i18n/vertical'
import { resolveOrderVocab } from '@/lib/seller-menu'
import { buildRangeQs } from '@/lib/business-overview'
import type { DateRangePreset, ResolvedDateRange } from '@/lib/date-range'
import { getBusinessOverview, type OverviewShop } from '@/services/business-overview.service'
import SellerErrorState from '../../_shared/SellerErrorState'
import PortfolioShopGrid, { type PortfolioGridItem } from './PortfolioShopGrid'
import PortfolioSkeleton from './PortfolioSkeleton'
import PortfolioSummaryCard from './PortfolioSummaryCard'

type Props = {
  /** ต้องมาจาก sessionUserId() เท่านั้น */
  userId: string
  preset: DateRangePreset
  custom: [string, string] | null
  resolved: ResolvedDateRange
  /** ผลจาก listOverviewShops() ที่ page เช็คแล้วว่าไม่ว่าง — ส่วนนี้จึงไม่ต้อง query ซ้ำ */
  shops: OverviewShop[]
}

async function PortfolioContent({ userId, preset, custom, resolved, shops }: Props) {
  const rangeQs = buildRangeQs({ preset, custom })
  let overview: Awaited<ReturnType<typeof getBusinessOverview>>
  try {
    overview = await getBusinessOverview(userId, resolved, rangeQs, shops)
  } catch (err) {
    console.error('[business-overview]', err)
    return (
      <section aria-labelledby="portfolio-title" className="mb-1.25">
        <div className="card">
          <div className="card-body">
            <h2 id="portfolio-title" className="sr-only">
              ภาพรวมทุกธุรกิจ
            </h2>
            <SellerErrorState
              compact
              title="โหลดภาพรวมทุกธุรกิจไม่สำเร็จ"
              message="ส่วนอื่นของหน้านี้ใช้งานได้ตามปกติ ลองโหลดใหม่อีกครั้ง"
              retryHref={`/dashboard?${rangeQs}`}
            />
          </div>
        </div>
      </section>
    )
  }
  if (!overview) return null

  const t = await getT()
  const items: PortfolioGridItem[] = overview.cards.map((c) =>
    c.status === 'ERROR'
      ? { failed: true, shopId: c.shopId, shopName: c.shopName, logoUrl: c.logoUrl }
      : {
          failed: false,
          shop: {
            shopId: c.shopId,
            shopName: c.shopName,
            logoUrl: c.logoUrl,
            orderNoun: byVertical(t.vocab.orderNoun, c.vertical),
            costNoun: resolveOrderVocab(c.vertical).costNoun,
            revenue: c.revenue,
            netProfit: c.netProfit,
            marginPct: c.marginPct,
            orderCount: c.orderCount,
            missingCost: c.missingCost,
            missingExpense: c.missingExpense,
            landingPath: c.href,
          },
        },
  )

  return (
    <section aria-labelledby="portfolio-title" className="mb-1.25">
      <PortfolioSummaryCard
        totals={overview.totals}
        preset={preset}
        custom={custom}
        label={resolved.label}
        series={overview.series}
        seriesMonth={overview.seriesMonth}
        failedShopNames={overview.cards.filter((c) => c.status === 'ERROR').map((c) => c.shopName)}
      />
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="text-base font-semibold">แยกรายร้าน</h3>
        <span className="text-default-700 text-xs">เรียงตามยอดขาย</span>
      </div>
      <PortfolioShopGrid items={items} />
    </section>
  )
}

const PortfolioOverview = (props: Props) => (
  <Suspense key={buildRangeQs(props)} fallback={<PortfolioSkeleton />}>
    <PortfolioContent {...props} />
  </Suspense>
)

export default PortfolioOverview
