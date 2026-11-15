/**
 * ad-summary-report.service — หน้า "สรุปโฆษณา" /reports/ads-summary (feature 00094)
 *
 * 🛑 HR16: ไม่มีตัวนับของตัวเอง — ยอดขาย/ออเดอร์/แชท/ค่าโฆษณา/ROAS มาจาก getAdSalesReport ครั้งเดียว ·
 * impressions/clicks/แชท Meta = Σ แถว Insights ที่ getAdSalesReport ดึงมาแล้ว (ไม่ดึงซ้ำ) · reach = Q1/Q2 ของ 00093 ·
 * ลำดับชั้นแคมเปญ→ชุด→แอดจากแถว Insights + entities (E1–E3) · ผลรวมตาราง = ตัวเลขหลักเสมอ (ไม่ทิ้งแถว → unknownCampaign)
 * ส่วน Meta ล้มส่วนใดส่วนหนึ่ง = ส่วนนั้นเป็น null/สถานะ ห้ามล้มทั้งหน้า · ไม่เชื่อม/AUTH/CURRENCY = ไม่ยิง Meta เพิ่ม
 */
import { sumKnown } from '@/lib/ad-quality-formulas'
import { thaiDayKey } from '@/lib/format-date'
import type { InsightsRow } from '@/lib/meta-ads-insights'
import type { AgeGenderRow, DailyReachRow, ReachRow } from '@/lib/meta-ads-quality'
import { classify, creativeFlags, isThin, objectiveGroup } from '@/lib/ad-summary/classify'
import { buildKpi, buildProfit, coveredOf, type Totals } from '@/lib/ad-summary/formulas'
import { buildFunnel } from '@/lib/ad-summary/funnel'
import { buildInsights } from '@/lib/ad-summary/insights'
import type {
  AdRow, AdsetRow, AdSummaryReport, Audience, CampaignRow, DailyPoint, MetaState, RollUp, SectionStatus,
} from '@/lib/ad-summary/types'
import { getAdSalesReport, type AdReport, type AdReportRange, type AdReportRow } from '@/services/ad-sales-report.service'
import { getAdEntities, type EntitiesCard, type EntitiesSource } from '@/services/meta-ads-entities.service'
import { getQualityBundle, type CardStatus, type QualityCard } from '@/services/meta-ads-quality.service'
import type { SpendSource } from '@/services/meta-ads-spend.service'

export type AdSummaryDeps = {
  spendSource?: SpendSource
  quality?: typeof getQualityBundle
  entities?: EntitiesSource
  /** ใช้ทดสอบ includesRecent */
  now?: Date
}

const round2 = (n: number) => Math.round(n * 100) / 100
const DAY = 86_400_000

type Meas = { impressions: number | null; clicks: number | null; chatsMeta: number | null }
// ?? null: แคชข้าม deploy อาจไม่มี field ใหม่ (undefined) → กัน NaN
const addMeas = (rows: InsightsRow[]): Meas => ({
  impressions: sumKnown(rows.map((r) => r.impressions ?? null)),
  clicks: sumKnown(rows.map((r) => r.clicks ?? null)),
  chatsMeta: sumKnown(rows.map((r) => r.chatsMeta ?? null)),
})
const group = <T>(items: T[], key: (t: T) => string): Map<string, T[]> => {
  const m = new Map<string, T[]>()
  for (const i of items) {
    const k = key(i)
    const a = m.get(k)
    if (a) a.push(i); else m.set(k, [i])
  }
  return m
}
const bySpendThenSales = (a: RollUp, b: RollUp) => (b.spend ?? -1) - (a.spend ?? -1) || b.sales - a.sales

function rollUp(ads: AdRow[]): RollUp {
  const cogs = ads.map((a) => a.cogs)
  return {
    coveredSales: round2(ads.reduce((s, a) => s + a.coveredSales, 0)),
    coveredOrders: ads.reduce((s, a) => s + a.coveredOrders, 0),
    spend: sumKnown(ads.map((a) => a.spend)),
    sales: round2(ads.reduce((s, a) => s + a.sales, 0)),
    orders: ads.reduce((s, a) => s + a.orders, 0),
    chats: ads.reduce((s, a) => s + a.chats, 0),
    chatsMeta: sumKnown(ads.map((a) => a.chatsMeta)),
    impressions: sumKnown(ads.map((a) => a.impressions)),
    clicks: sumKnown(ads.map((a) => a.clicks)),
    // ต้นทุนรวมกลุ่ม: มีแอดใดไม่ครบ = ไม่ครบทั้งกลุ่ม (ห้ามเดาเป็น 0)
    cogs: cogs.some((c) => c === null) ? null : round2(cogs.reduce<number>((s, c) => s + (c as number), 0)),
  }
}

const sectionStatus = (meta: MetaState, card: CardStatus | null): SectionStatus => {
  if (meta === 'AUTH') return 'AUTH'
  if (meta === 'NOT_CONNECTED' || meta === 'CURRENCY') return 'UNAVAILABLE'
  if (meta === 'ERROR' || card === null) return 'ERROR'
  return card
}

export async function getAdSummaryReport(shopId: string, range: AdReportRange, deps: AdSummaryDeps = {}): Promise<AdSummaryReport> {
  const report: AdReport = await getAdSalesReport(shopId, range, { spendSource: deps.spendSource })
  const metaState = report.ads.state as MetaState
  const metaOk = metaState === 'OK'
  const channelId = range.shopChannelId || null
  const adIds = report.rows.map((r) => r.adId)

  // ส่วน Meta ทั้งหมดขนานกัน · ไม่ OK = ไม่ยิงเพิ่ม · แต่ละส่วนล้มเอง ไม่ลากส่วนอื่น (null = คำขอล้ม)
  type Cards = { account: QualityCard<'account'> | null; agegender: QualityCard<'agegender'> | null; daily: QualityCard<'daily'> | null }
  let cards: Cards | null = null
  let entities: EntitiesCard | null = null
  if (metaOk) {
    const q = (deps.quality ?? getQualityBundle)({
      shopId, since: report.range.from, until: report.range.to,
      // เลือกเพจ → ชุดแอดในขอบเขตเท่านั้น (เหมือน 00091/00093) · ไม่เลือก = ระดับบัญชี
      scopeAdIds: channelId ? adIds : undefined,
      only: ['account', 'agegender', 'daily'],
    })
    const [account, agegender, daily, ent] = await Promise.all([
      q.account.catch(() => null), q.agegender.catch(() => null), q.daily.catch(() => null),
      adIds.length ? (deps.entities ?? getAdEntities)(shopId, adIds).catch(() => null) : Promise.resolve(null),
    ])
    cards = { account, agegender, daily }
    entities = ent
  }

  // ── แถว Insights ในขอบเขต (เลือกเพจ = เฉพาะแอดในตาราง) แยกช่วงนี้/ก่อนหน้า
  const curFromKey = report.range.from
  const scope = channelId ? new Set(adIds) : null
  const inScope = report.insightRows.filter((r) => !scope || scope.has(r.adId))
  const curRows = inScope.filter((r) => r.day >= curFromKey)
  const prevRows = inScope.filter((r) => r.day < curFromKey)
  const curMeas = metaOk ? addMeas(curRows) : { impressions: null, clicks: null, chatsMeta: null }
  const prevMeas = metaOk ? addMeas(prevRows) : { impressions: null, clicks: null, chatsMeta: null }

  const accountReach = metaOk && cards?.account?.status === 'OK' ? (cards.account.rows as ReachRow[])[0]?.reach ?? null : null

  // ── KPI: ตัวตั้ง/ตัวหารดิบจาก getAdSalesReport (ตัวเลขเดียวกับ /reports/ads)
  const s = report.summary, p = report.previous, as = report.ads.summary
  const cur: Totals = {
    spend: metaOk ? as.spend : null, coveredSales: s.coveredSales, coveredOrders: s.coveredOrders,
    sales: s.adSales, orders: s.adOrders, chats: s.chats, ...curMeas, reach: accountReach,
  }
  const prev: Totals = {
    spend: metaOk ? as.prevSpend : null, coveredSales: p.coveredSales, coveredOrders: p.coveredOrders,
    sales: p.adSales, orders: p.adOrders, chats: p.chats, ...prevMeas, reach: null, // reach ช่วงก่อนไม่ถามเพิ่ม (ไม่เพิ่มคำขอ Meta)
  }
  const kpi = buildKpi({ cur, prev })
  const funnel = buildFunnel(kpi, { cur: curMeas.clicks, prev: prevMeas.clicks })

  // ── รายแอด
  const entAd = new Map((entities?.state === 'OK' ? entities.ads : []).map((a) => [a.id, a]))
  const entSet = new Map((entities?.state === 'OK' ? entities.adsets : []).map((a) => [a.id, a]))
  const entCamp = new Map((entities?.state === 'OK' ? entities.campaigns : []).map((a) => [a.id, a]))
  const rowsByAd = group(curRows, (r) => r.adId)
  const latest = (rs: InsightsRow[] | undefined) => (rs ?? []).reduce<InsightsRow | null>((a, r) => (!a || r.day >= a.day ? r : a), null)

  const totalsForFlags = { spend: kpi.spend.cur, orders: kpi.orders.cur ?? 0, ctr: kpi.ctr.cur, closeRate: kpi.closeRate.cur }
  const toAd = (r: AdReportRow): AdRow => {
    const ins = rowsByAd.get(r.adId)
    const last = latest(ins)
    const e = entAd.get(r.adId)
    const m = ins ? addMeas(ins) : { impressions: null, clicks: null, chatsMeta: null }
    const base = {
      adId: r.adId,
      name: r.adTitle ?? last?.adName ?? null,
      photoFileId: r.adPhotoFileId,
      thumbnailUrl: e?.thumbnailUrl ?? null,
      // โครงสร้างปัจจุบันของ Meta (E1–E3) ก่อน · ไม่มีจึงใช้ที่เห็นในแถว Insights
      adsetId: e?.adsetId ?? last?.adsetId ?? null,
      campaignId: e?.campaignId ?? last?.campaignId ?? null,
      status: e?.status ?? null,
      spend: r.spend, sales: r.sales, orders: r.orders, chats: r.chats,
      ...coveredOf(r.spend, r.sales, r.orders),
      ...(metaOk ? m : { impressions: null, clicks: null, chatsMeta: null }),
      reach: null, // ไม่ถาม Q1 รายแอด — ไม่มี UI ใช้ (reach รวม = บัญชี)
      cogs: r.cogs,
    }
    return {
      ...base,
      tag: r.spend !== null && isThin({ spend: r.spend, chats: r.chats }) ? 'thin' : null, // ข้อมูลน้อย = จาง ไม่ติดป้ายเชิงลบ
      tagReason: null,
      creativeFlags: creativeFlags(base, totalsForFlags),
    }
  }
  const allAds = report.rows.map(toAd)

  // ── ลำดับชั้น (แอดที่ไม่รู้แคมเปญ/ชุด → unknownCampaign ไม่ทิ้งแถว)
  const known = allAds.filter((a) => metaOk && a.campaignId && a.adsetId)
  const unknown = allAds.filter((a) => !known.includes(a))
  const campaigns: CampaignRow[] = [...group(known, (a) => a.campaignId!)].map(([campaignId, cAds]) => {
    const adsets: AdsetRow[] = [...group(cAds, (a) => a.adsetId!)].map(([adsetId, sAds]) => {
      const sample = latest(rowsByAd.get(sAds[0].adId))
      return {
        adsetId, name: entSet.get(adsetId)?.name ?? latest(curRows.filter((r) => r.adsetId === adsetId))?.adsetName ?? sample?.adsetName ?? null,
        status: entSet.get(adsetId)?.status ?? null,
        ads: [...sAds].sort(bySpendThenSales), ...rollUp(sAds),
      }
    }).sort(bySpendThenSales)
    const ec = entCamp.get(campaignId)
    const prevOfCampaign = prevRows.filter((r) => (entAd.get(r.adId)?.campaignId ?? r.campaignId) === campaignId)
    return {
      campaignId,
      name: ec?.name ?? latest(curRows.filter((r) => r.campaignId === campaignId))?.campaignName ?? null,
      objective: ec?.objective ?? null, status: ec?.status ?? null,
      adsets, prevSpend: sumKnown(prevOfCampaign.map((r) => r.spend)),
      tag: null, tagReason: null, ...rollUp(cAds),
    }
  }).sort(bySpendThenSales)
  classify(campaigns, (c) => objectiveGroup(c.objective)).forEach((t, i) => { campaigns[i].tag = t.tag; campaigns[i].tagReason = t.reason })
  const unknownCampaign = { ads: [...unknown].sort(bySpendThenSales), ...rollUp(unknown) }

  // ── กำไรขั้นต้นหลังค่าโฆษณา (ชุดเดียวกับ ROAS = แอดที่มีค่าโฆษณา>0)
  const profit = buildProfit({
    coveredSales: s.coveredSales, cogs: metaOk ? s.coveredCogs : null, spend: cur.spend,
    missingCostLines: s.missingCostLines, truncated: report.truncated,
    byCampaign: campaigns.map((c) => {
      const cov = c.adsets.flatMap((a) => a.ads).filter((a) => (a.spend ?? 0) > 0)
      const r = rollUp(cov)
      return { campaignId: c.campaignId, name: c.name, sales: r.sales, cogs: r.cogs, spend: r.spend }
    }),
  })

  // ── รายวัน/รายชั่วโมง (ตัวเลขร้านจาก getAdSalesReport · Meta รายวันเท่านั้น)
  const span = range.to.getTime() - range.from.getTime()
  const hourly = span <= DAY
  const dailyReach = new Map(((cards?.daily?.status === 'OK' ? cards.daily.rows : []) as DailyReachRow[]).map((r) => [r.day, r.reach]))
  const measByDay = (rows: InsightsRow[]) => new Map([...group(rows, (r) => r.day)].map(([d, rs]) => [d, addMeas(rs)]))
  const curByDay = measByDay(curRows), prevByDay = measByDay(prevRows)
  const toDaily = (pts: AdReport['daily'], meas: Map<string, Meas>, reachOf: Map<string, number | null> | null): DailyPoint[] =>
    pts.map((d) => {
      const withMeta = metaOk && !hourly // Meta ไม่มีรายชั่วโมง
      const m = meas.get(d.day)
      return {
        day: d.day, sales: d.adSales, coveredSales: d.coveredSales, orders: d.adOrders, chats: d.chats,
        spend: withMeta ? d.spend : null,
        // วันที่ Meta ไม่ส่งแถว = ไม่มีการแสดงผล (0) · ไม่ใช่ไม่ทราบ
        impressions: withMeta ? m?.impressions ?? 0 : null, clicks: withMeta ? m?.clicks ?? 0 : null, chatsMeta: withMeta ? m?.chatsMeta ?? 0 : null,
        reach: withMeta && reachOf ? reachOf.get(d.day) ?? null : null,
      }
    })

  const now = deps.now ?? new Date()
  const includesRecent = report.range.to >= thaiDayKey(new Date(now.getTime() - DAY))

  // ── กลุ่มผู้ชม (Q4)
  const agCard = cards?.agegender ?? null
  const agRows = (agCard?.status === 'OK' ? agCard.rows : []) as AgeGenderRow[]
  const genderSum = (g: 'male' | 'female' | 'unknown') =>
    sumKnown(agRows.filter((r) => (r.gender === 'male' || r.gender === 'female' ? r.gender : 'unknown') === g).map((r) => r.reach))
  const audience: Audience = {
    status: sectionStatus(metaState, agCard?.status ?? null),
    reach: accountReach, chatsMeta: curMeas.chatsMeta,
    gender: (['male', 'female', 'unknown'] as const).map((key) => ({ key, reach: genderSum(key) })),
    age: [...group(agRows, (r) => r.age)].map(([range, rs]) => ({
      range, reach: sumKnown(rs.map((r) => r.reach)), chatsMeta: sumKnown(rs.map((r) => r.chats)), spend: sumKnown(rs.map((r) => r.spend)),
    })).sort((a, b) => a.range.localeCompare(b.range, 'en', { numeric: true })),
  }

  const insights = buildInsights({
    kpi, campaigns, ads: allAds, chatGap: { meta: curMeas.chatsMeta, shop: s.chats },
    truncated: report.truncated, metaOk, hourly, includesRecent,
  })

  return {
    range: report.range, prevRange: report.prevRange, includesRecent, hourly,
    meta: { state: metaState, tzMismatch: report.ads.tzMismatch, accountName: report.ads.accountName },
    truncated: report.truncated, hasAnyAdData: report.hasAnyAdData,
    kpi, daily: toDaily(report.daily, curByDay, dailyReach), prevDaily: toDaily(report.prevDaily, prevByDay, null),
    funnel, campaigns, unknownCampaign, profit, insights, audience,
  }
}
