/**
 * MetaSections — ส่วนที่รอข้อมูลจาก Meta (async server components ห่อด้วย <Suspense> ที่ page.tsx)
 * ทำไมแยก: ฝั่ง Deep ขึ้นทันที การ์ดฝั่ง Meta ทยอยขึ้นตามคำขอ Q1–Q4 ที่ขนานกัน (FR-002) · คำขอหนึ่งล้มไม่ลากการ์ดอื่น (FR-008)
 * ไม่มีสูตรในไฟล์นี้ — ทุกตัวเลขมาจาก src/lib/ad-quality-view.ts (นิยามเดียว HR16)
 * Q1 ไม่ OK / ไม่มีแชท (Meta) → ซ่อนการ์ดฝั่ง Meta ทั้งหมด เหลือแถบสถานะเดียวใน KPI + กราฟ/ตารางของแชท (Deep) (มติ O1)
 * แถบตัวชี้วัดรอ Q1+Q2 แยก Suspense ของตัวเอง — KPI/กราฟเทียบไม่ต้องรอ "เข้าถึง" (audit P2-6)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/page.tsx (กริดการ์ด — ไฟล์นี้เป็นตัวประกอบข้อมูล ไม่มี markup ของตัวเอง)
 */
import { adDisplayName } from '@/lib/ad-attribution'
import { buildQualityRows, buildTotals, metaAdsNotInAccount, metaCardsVisible, spendRatios } from '@/lib/ad-quality-view'
import { getT } from '@/i18n/server'
import type { QualityBundle } from '@/services/meta-ads-quality.service'
import type { QualityDeepSide } from '@/services/ad-quality-report.service'
import AdQualityTable from './AdQualityTable'
import BreakdownCard from './BreakdownCard'
import CardState from './CardState'
import ChatQualityCard from './ChatQualityCard'
import CompareChartCard from './CompareChartCard'
import KpiRow from './KpiRow'
import SpendStrip from './SpendStrip'

type Common = { bundle: QualityBundle; deep: QualityDeepSide; pageFiltered: boolean }

/** ส่วนของ KPI ฝั่ง Deep — ใช้ร่วมกันทั้งตอนมีและไม่มีข้อมูล Meta */
export const deepKpi = (deep: QualityDeepSide) => ({
  chats: deep.chatsTotal, prevChats: deep.prevChats, closeRatePct: deep.closeRatePct, prevCloseRatePct: deep.prevCloseRatePct,
  orders: deep.ordersTotal, dailyOrders: deep.dailyOrders,
})

/** Q1 → แถว/ยอดรวม/ธงว่าแสดงการ์ด Meta ได้ไหม — ทุกส่วนเรียกตัวนี้ที่เดียวเพื่อตัดสินตรงกัน */
async function resolveQ1({ bundle, deep, pageFiltered }: Common) {
  const ad = await bundle.ad
  const rows = buildQualityRows(deep.deepAds, ad.status === 'OK' ? ad.rows : null, { pageFiltered })
  const totals = buildTotals(rows)
  const metaOk = metaCardsVisible(ad.status, totals)
  const nia = metaAdsNotInAccount(ad.status, deep.deepAds.length, pageFiltered)
  return { ad, rows, totals, metaOk, nia }
}

/** KPI 4 ใบ — ต้องการ Q1 */
export async function KpiRowMeta(c: Common & { noun: string }) {
  const { deep, noun } = c
  const { ad, totals, metaOk, nia } = await resolveQ1(c)
  const spendValue = deep.ads.summary.spend
  const ratios = spendRatios(spendValue, totals, deep.chatsTotal, null, { pageFiltered: c.pageFiltered })
  return (
    <KpiRow
      noun={noun} deep={deepKpi(deep)}
      meta={metaOk ? { chats: totals.chatsMeta, deepSameSet: totals.chatsDeepSameSet, gap: totals.gap, adsCounted: totals.adsCounted } : null}
      spend={metaOk && spendValue !== null ? { value: spendValue, prev: deep.ads.summary.prevSpend, daily: deep.dailySpend, perChatDeep: ratios.costPerChatDeep } : null}
      status={metaOk ? undefined : <CardState status={ad.status === 'OK' ? 'EMPTY' : ad.status} notInAccount={nia ? { n: deep.deepAds.length, name: deep.ads.accountName } : undefined} />}
    />
  )
}

/** กราฟเทียบรายแอด + คุณภาพแชท (Meta) — ต้องการ Q1 */
export async function CompareRowMeta(c: Common) {
  const { rows, totals, metaOk } = await resolveQ1(c)
  return (
    <div className="gap-base grid grid-cols-1 xl:grid-cols-3">
      <div className={metaOk ? 'xl:col-span-2' : 'xl:col-span-3'}><CompareChartCard rows={rows} metaOk={metaOk} /></div>
      {metaOk && <ChatQualityCard totals={totals} close={{ orders: c.deep.ordersTotal, chats: c.deep.chatsTotal, pct: c.deep.closeRatePct }} />}
    </div>
  )
}

/** แถบการแสดงผล/ต้นทุน — ต้องการ Q1 + Q2 */
export async function StripMeta(c: Common) {
  const [{ totals, metaOk }, account] = await Promise.all([resolveQ1(c), c.bundle.account])
  if (!metaOk) return null
  const reach = account.status === 'OK' ? account.rows[0] ?? null : null
  const ratios = spendRatios(c.deep.ads.summary.spend, totals, c.deep.chatsTotal, reach, { pageFiltered: c.pageFiltered })
  return (
    <SpendStrip
      impressions={totals.impressions} reach={reach?.reach ?? null} frequency={ratios.frequency} ctr={totals.ctr}
      cpc={ratios.cpc} costPerChatMeta={ratios.costPerChatMeta} costPerChatDeep={ratios.costPerChatDeep} reachStatus={account.status}
    />
  )
}

/** ตำแหน่ง + อายุ/เพศ — ต้องการ Q3 + Q4 · ตัวเลือกแอด = แอดที่มีแชท (Deep) ในช่วง/เพจนี้ */
export async function BreakdownMeta(c: Common & { selectedAd: string | null }) {
  const { metaOk } = await resolveQ1(c)
  if (!metaOk) return null
  const [placement, age] = await Promise.all([c.bundle.placement, c.bundle.agegender])
  const t = await getT()
  const options = c.deep.deepAds
    .filter((d) => /^\d{1,30}$/.test(d.adId))
    .sort((a, b) => b.chats - a.chats)
    .map((d) => ({ adId: d.adId, label: adDisplayName(d.adTitle, d.adId, t.inbox.contextBar.adIdFallback) ?? d.adId }))
  return (
    <BreakdownCard
      placementStatus={placement.status} placementRows={placement.status === 'OK' ? placement.rows : []}
      ageStatus={age.status} ageRows={age.status === 'OK' ? age.rows : []}
      adOptions={options} selectedAd={c.selectedAd}
    />
  )
}

/** ตารางรายแอดใบเดียว — ต้องการ Q1 */
export async function TableMeta(c: Common) {
  const { rows, totals, metaOk } = await resolveQ1(c)
  const { deep } = c
  return <AdQualityTable rows={rows} metaOk={metaOk} totals={metaOk ? totals : null} deepTotals={{ chats: deep.chatsTotal, orders: deep.ordersTotal, closeRatePct: deep.closeRatePct }} />
}
