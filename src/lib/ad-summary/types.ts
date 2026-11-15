/**
 * ad-summary/types — สัญญาข้อมูลของหน้า "สรุปโฆษณา" /reports/ads-summary (feature 00094)
 * 🛑 ไฟล์นี้คือ contract ที่ทุกชั้นใช้ร่วม (lib สูตร · service · UI) — แก้ต้องแก้ทุกผู้ใช้ในรอบเดียวกัน
 * ทุกค่าเป็น serializable ล้วน (ส่งจาก RSC ลง client ได้) · null = "ไม่มีข้อมูล" แสดง "—" (ไม่ใช่ 0) — BR-AIR-12
 * นิยามตัวเลข (HR16): ยอดขาย/ออเดอร์/แชทเข้าร้าน = getAdSalesReport (00091) · ค่าโฆษณา = getAdSpend (00091 FR-010)
 *   · impressions/clicks/แชท (Meta) = Meta Insights · ห้ามใช้ purchase/ROAS ของ Meta
 */

/** ทิศทางที่ดีของตัวชี้วัด (BR-AIR-02) — signed: ขึ้น=ดี · inverse: ขึ้น=แย่ · neutral: ไม่ตัดสิน */
export type Tone = 'signed' | 'inverse' | 'neutral'
/** ผลตัดสินทิศทาง — null = ช่วงก่อนไม่มีฐาน (≤0/null) → ไม่แสดง % */
export type Trend = 'good' | 'bad' | 'neutral' | null

/** ค่าคู่ ช่วงนี้/ช่วงก่อน ของตัวชี้วัดหนึ่งตัว */
export type MetricPair = { cur: number | null; prev: number | null }

/** สถานะข้อมูลฝั่ง Meta ของทั้งหน้า (สืบ SpendResult['state'] ของ 00091) */
export type MetaState = 'OK' | 'NOT_CONNECTED' | 'AUTH' | 'CURRENCY' | 'ERROR'

/** สถานะต่อส่วน (Suspense แยก) — สืบ CardStatus ของ 00093 */
export type SectionStatus = 'OK' | 'EMPTY' | 'UNAVAILABLE' | 'ERROR' | 'AUTH'

/** จุดรายวัน (ช่วง 1 วัน = รายชั่วโมง เฉพาะตัวเลขร้าน — Meta ไม่มีรายชั่วโมง) — ตัวตั้ง/ตัวหารดิบ เพื่อรวมสัปดาห์/เดือนแบบ Σ/Σ */
export type DailyPoint = {
  /** YYYY-MM-DD (หรือ YYYY-MM-DDTHH เมื่อรายชั่วโมง) */
  day: string
  sales: number
  /** ยอดขายเฉพาะโฆษณาที่มีค่าโฆษณา > 0 (ตัวตั้ง ROAS) */
  coveredSales: number
  orders: number
  /** แชทเข้าร้าน (ห้องไม่ซ้ำ นับตามวันคลิก) */
  chats: number
  /** null = Meta ไม่ OK */
  spend: number | null
  impressions: number | null
  clicks: number | null
  /** แชทที่ Meta นับ */
  chatsMeta: number | null
  /** เข้าถึงรายวัน (ค่าประมาณ ห้ามรวมข้ามวัน) — ใช้แค่กราฟเล็กเข้าถึง/ความถี่ */
  reach: number | null
}

export type Grouping = 'day' | 'week' | 'month'

/** ช่องของกราฟหลังจัดกลุ่ม — อัตราคำนวณจาก Σ/Σ ของช่อง · partial = ช่องไม่เต็ม (สัปดาห์/เดือนที่ช่วงตัดกลาง) */
export type Bucket = DailyPoint & { label: string; partial: boolean }

export type KpiSet = {
  spend: MetricPair
  sales: MetricPair
  roas: MetricPair
  cpa: MetricPair
  orders: MetricPair
  closeRate: MetricPair
  aov: MetricPair
  impressions: MetricPair
  reach: MetricPair
  frequency: MetricPair
  chatsMeta: MetricPair
  ctr: MetricPair
  cpc: MetricPair
  cpm: MetricPair
  costPerChatMeta: MetricPair
  chats: MetricPair
}

export type FunnelStep = { key: 'impressions' | 'clicks' | 'chatsMeta' | 'chats' | 'orders'; source: 'META' | 'SHOP'; cur: number | null; prev: number | null }
/** อัตราผ่านจากขั้น i-1 → i (เป็น %) · crossSource = ข้ามจาก Meta ไปของร้าน (ขั้น 3→4) */
export type FunnelRate = { cur: number | null; prev: number | null; crossSource: boolean }
export type Funnel = { steps: FunnelStep[]; rates: FunnelRate[]; /** index ใน rates ที่แย่ลงมากสุด (ผ่านเกณฑ์) หรือ null */ worst: number | null }

/** ป้ายจัดกลุ่ม BR-AIR-08 · null = ไม่จัดกลุ่ม (วัตถุประสงค์อื่น / ไม่มีค่ากลาง) */
export type PerfTag = 'good' | 'ok' | 'watch' | 'thin' | null
export type TagReason = { tag: PerfTag; reason: string }

/** แถวโฆษณาหนึ่งตัว (ระดับล่างสุด) */
export type AdRow = {
  adId: string
  name: string | null
  photoFileId: string | null
  thumbnailUrl: string | null
  adsetId: string | null
  campaignId: string | null
  status: string | null
  spend: number | null
  sales: number
  orders: number
  /** ตัวตั้ง ROAS / ตัวหารต้นทุนต่อออเดอร์ — เฉพาะเมื่อ spend > 0 (นิยามเดียวกับ KPI · 00091) */
  coveredSales: number
  coveredOrders: number
  chats: number
  chatsMeta: number | null
  impressions: number | null
  clicks: number | null
  reach: number | null
  /** ต้นทุนสินค้าของใบชุดเดียวกับยอดขาย (F-12) · null = มีบรรทัดไม่มีต้นทุน */
  cogs: number | null
  tag: PerfTag
  tagReason: string | null
  /** BR-AIR-10 — คีย์ป้ายครีเอทีฟ */
  creativeFlags: ('HIGH_SPEND_LOW_ORDERS' | 'HIGH_CTR_LOW_CLOSE')[]
}

export type AdsetRow = { adsetId: string; name: string | null; status: string | null; ads: AdRow[] } & RollUp
export type CampaignRow = {
  campaignId: string
  name: string | null
  /** ค่า objective ดิบของ Meta (OUTCOME_ENGAGEMENT ฯลฯ) */
  objective: string | null
  status: string | null
  adsets: AdsetRow[]
  prevSpend: number | null
  tag: PerfTag
  tagReason: string | null
} & RollUp

/** ผลรวมของกลุ่ม (Σ ของลูก) — reach ไม่รวมข้ามโฆษณา (BR-AIR-11) จึงไม่มีในนี้ */
export type RollUp = { spend: number | null; sales: number; orders: number; coveredSales: number; coveredOrders: number; chats: number; chatsMeta: number | null; impressions: number | null; clicks: number | null; cogs: number | null }

export type Profit = {
  /** ตัวตั้งชุดเดียวกับ ROAS (โฆษณาที่มีค่าโฆษณา>0) */
  coveredSales: number
  cogs: number | null
  spend: number | null
  grossProfit: number | null
  profitAfterAds: number | null
  /** 0..1 */
  grossMargin: number | null
  breakEvenRoas: number | null
  /** จำนวนบรรทัดสินค้าที่ไม่มีต้นทุน (>0 = ข้อมูลไม่เพียงพอ) */
  missingCostLines: number
  byCampaign: { campaignId: string; name: string | null; profitAfterAds: number | null }[]
}

export type InsightPriority = 'HIGH' | 'MEDIUM'
export type InsightConfidence = 'HIGH' | 'MEDIUM'
export type InsightRuleId = 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6' | 'R7' | 'R8'
/** คำแนะนำหนึ่งข้อ — ข้อความเป็นคีย์ + พารามิเตอร์ (UI แปลผ่าน i18n) ไม่มีประโยคฝังใน lib */
export type Insight = {
  rule: InsightRuleId
  priority: InsightPriority
  confidence: InsightConfidence
  /** ค่าที่ใช้เติมในหัวข้อ/สาเหตุ/สิ่งที่ลองทำ เช่น { name, spendShare, orderShare } */
  params: Record<string, string | number>
  /** ตัวเลขหลักฐาน 2–4 ตัว — ทุกตัวต้องปรากฏบนหน้า (FR-004 AC-3) */
  evidence: { key: string; value: number | null; prev?: number | null; unit: 'baht' | 'pct' | 'num' | 'x' }[]
  /** ใช้ทำลิงก์ "ดูในตาราง" */
  campaignId?: string
  adId?: string
  /** ค่าโฆษณาที่เกี่ยวข้อง — ใช้เรียงลำดับรอง */
  spendAtStake: number
}

export type Audience = {
  status: SectionStatus
  reach: number | null
  chatsMeta: number | null
  gender: { key: 'male' | 'female' | 'unknown'; reach: number | null }[]
  age: { range: string; reach: number | null; chatsMeta: number | null; spend: number | null }[]
}

export type AdSummaryReport = {
  range: { from: string; to: string }
  prevRange: { from: string; to: string }
  /** ช่วงรวมเมื่อวาน/วันนี้ → ความมั่นใจของ R1/R4 สูงสุด MEDIUM (BR-AIR-09) */
  includesRecent: boolean
  /** ช่วง ≤ 1 วัน → รายชั่วโมง เฉพาะตัวเลขร้าน */
  hourly: boolean
  meta: { state: MetaState; tzMismatch: boolean; accountName: string | null }
  /** ใบเกินเพดาน (สืบ 00091) → คำแนะนำปิด · กำไร "ข้อมูลไม่เพียงพอ" */
  truncated: boolean
  hasAnyAdData: boolean
  kpi: KpiSet
  daily: DailyPoint[]
  prevDaily: DailyPoint[]
  funnel: Funnel
  campaigns: CampaignRow[]
  /** โฆษณาที่ Meta ไม่รู้จัก (ลบแล้ว/คนละบัญชี/ไม่เชื่อม) — ผลรวมตาราง = ตัวเลขหลัก */
  unknownCampaign: { ads: AdRow[] } & RollUp
  profit: Profit
  insights: Insight[]
  audience: Audience
}
