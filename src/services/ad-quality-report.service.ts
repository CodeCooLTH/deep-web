/**
 * ad-quality-report.service — ฝั่ง Deep ของรายงานคุณภาพโฆษณา (00093)
 * 🛑 HR16: แชท (Deep) ต่อแอด · คำสั่งซื้อ · ค่าโฆษณา มาจาก getAdSalesReport ตรง ๆ (ตัวเดียวกับ /reports/ads — ห้ามเขียนนับใหม่)
 * ค่าโฆษณาหน้านี้ = ads.summary.spend ของ getAdSpend ตัวเดียวกัน (ไม่ใช้ spend จาก Q1) · เรียกด้วยช่วงเดียวกับ /reports/ads
 * ทำให้ใช้แคช Insights ร่วมกันและ "ไม่เรียก Meta เพิ่ม" จาก 00091
 */
import { getAdSalesReport, type AdReport, type AdReportRange } from '@/services/ad-sales-report.service'
import type { SpendSource } from '@/services/meta-ads-spend.service'
import type { DeepAd } from '@/lib/ad-quality-view'

export type QualityDeepSide = {
  /** แอดที่มีแชท (Deep) ในช่วง/เพจนี้ — แอดที่มีแต่คำสั่งซื้อ (คลิกก่อนช่วง) ไม่เข้า (ไม่มีแชทให้เทียบ) */
  deepAds: DeepAd[]
  /** แชท (Deep) ทั้งช่วง = ห้องไม่ซ้ำข้ามทุกแอด (ตัวเดียวกับแถวรวมของ /reports/ads) */
  chatsTotal: number
  ordersTotal: number
  closeRatePct: number | null
  ads: AdReport['ads']
  range: AdReport['range']
  hasAnyAdData: boolean
}

export function deepAdsOf(rows: AdReport['rows']): DeepAd[] {
  return rows.filter((r) => r.chats > 0).map((r) => ({ adId: r.adId, adTitle: r.adTitle, photoFileId: r.adPhotoFileId, chats: r.chats, orders: r.orders }))
}

export async function getQualityDeepSide(shopId: string, range: AdReportRange, deps: { spendSource?: SpendSource } = {}): Promise<QualityDeepSide> {
  const r = await getAdSalesReport(shopId, range, deps)
  return {
    deepAds: deepAdsOf(r.rows),
    chatsTotal: r.summary.chats,
    ordersTotal: r.summary.adOrders,
    closeRatePct: r.summary.closeRatePct,
    ads: r.ads,
    range: r.range,
    hasAnyAdData: r.hasAnyAdData,
  }
}
