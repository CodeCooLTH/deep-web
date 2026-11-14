/**
 * MetaSections — ส่วนที่รอข้อมูลจาก Meta (async server components ห่อด้วย <Suspense> ที่ page.tsx)
 * ทำไมแยก: ฝั่ง Deep ขึ้นทันที การ์ดฝั่ง Meta ทยอยขึ้นตามคำขอ Q1–Q4 ที่ขนานกัน (FR-002) · คำขอหนึ่งล้มไม่ลากการ์ดอื่น (FR-008)
 * ไม่มีสูตรในไฟล์นี้ — ทุกตัวเลขมาจาก src/lib/ad-quality-view.ts (นิยามเดียว HR16)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/page.tsx (กริดการ์ด — ไฟล์นี้เป็นตัวประกอบข้อมูล ไม่มี markup ของตัวเอง)
 */
import { adDisplayName } from '@/lib/ad-attribution'
import { buildQualityRows, buildTotals, spendRatios } from '@/lib/ad-quality-view'
import { formatDateTime } from '@/lib/format-date'
import { getT } from '@/i18n/server'
import type { QualityBundle } from '@/services/meta-ads-quality.service'
import type { QualityDeepSide } from '@/services/ad-quality-report.service'
import AdQualityTable from './AdQualityTable'
import BreakdownCard from './BreakdownCard'
import ChatCompareHero from './ChatCompareHero'
import ChatGapTable from './ChatGapTable'
import ChatQualityHero from './ChatQualityHero'
import SpendDeliveryHero from './SpendDeliveryHero'

type Common = { bundle: QualityBundle; deep: QualityDeepSide; pageFiltered: boolean }

/** แถว ① ② ③ — ต้องการ Q1 (+Q2 ของ ③) */
export async function TopRowMeta({ bundle, deep, pageFiltered, noun }: Common & { noun: string }) {
  const [ad, account] = await Promise.all([bundle.ad, bundle.account])
  const rows = buildQualityRows(deep.deepAds, ad.status === 'OK' ? ad.rows : null, { pageFiltered })
  const totals = buildTotals(rows)
  const reach = account.status === 'OK' ? account.rows[0] ?? null : null
  const ratios = spendRatios(deep.ads.summary.spend, totals, deep.chatsTotal, reach, { pageFiltered })
  return (
    <>
      <ChatCompareHero deepOnly={false} status={ad.status} totals={ad.status === 'OK' ? totals : null} deepTotal={deep.chatsTotal} top={totals.highGapTop} />
      <ChatQualityHero status={ad.status} totals={ad.status === 'OK' ? totals : null} orders={deep.ordersTotal} deepChats={deep.chatsTotal} closeRatePct={deep.closeRatePct} noun={noun} />
      <SpendDeliveryHero
        spend={deep.ads.summary.spend} impressions={totals.impressions} reach={reach?.reach ?? null} frequency={ratios.frequency}
        ctr={totals.ctr} cpc={ratios.cpc} costPerChatMeta={ratios.costPerChatMeta} costPerChatDeep={ratios.costPerChatDeep}
        adStatus={ad.status} reachStatus={account.status}
      />
    </>
  )
}

/** ④ — ต้องการ Q3 + Q4 · ตัวเลือกแอด = แอดที่มีแชท (Deep) ในช่วง/เพจนี้ */
export async function BreakdownMeta({ bundle, deep, selectedAd }: Omit<Common, 'pageFiltered'> & { selectedAd: string | null }) {
  const [placement, age] = await Promise.all([bundle.placement, bundle.agegender])
  const t = await getT()
  const options = deep.deepAds
    .filter((d) => /^\d{1,30}$/.test(d.adId))
    .sort((a, b) => b.chats - a.chats)
    .map((d) => ({ adId: d.adId, label: adDisplayName(d.adTitle, d.adId, t.inbox.contextBar.adIdFallback) ?? d.adId }))
  return (
    <BreakdownCard
      placementStatus={placement.status} placementRows={placement.status === 'OK' ? placement.rows : []}
      ageStatus={age.status} ageRows={age.status === 'OK' ? age.rows : []}
      adOptions={options} selectedAd={selectedAd}
    />
  )
}

/** ⑤ ⑥ — ต้องการ Q1 */
export async function TablesMeta({ bundle, deep, pageFiltered, noun }: Common & { noun: string }) {
  const ad = await bundle.ad
  const rows = buildQualityRows(deep.deepAds, ad.status === 'OK' ? ad.rows : null, { pageFiltered })
  const totals = buildTotals(rows)
  return (
    <>
      <ChatGapTable rows={rows} totals={ad.status === 'OK' ? totals : null} deepOnly={false} status={ad.status} />
      {ad.status === 'OK' && <AdQualityTable rows={rows} noun={noun} totals={{ chatsMeta: totals.chatsMeta, chatsDeep: deep.chatsTotal, orders: deep.ordersTotal }} />}
    </>
  )
}

/** "ข้อมูลจาก Meta อัปเดตเมื่อ …" = เวลาที่เก่าที่สุดของคำขอที่สำเร็จ (ตัวเลขทั้งหน้าไม่สดกว่านี้) */
export async function FetchedLine({ bundle }: { bundle: QualityBundle }) {
  const t = await getT()
  const cards = await Promise.all([bundle.ad, bundle.account, bundle.placement, bundle.agegender])
  const times = cards.map((c) => c.fetchedAt).filter((v): v is number => v !== null)
  if (times.length === 0) return null
  return <p className="text-default-700 mb-0 text-xs">{t.adQuality.metaUpdated.replace('{time}', formatDateTime(new Date(Math.min(...times))))} · {t.adQuality.refreshEvery}</p>
}
