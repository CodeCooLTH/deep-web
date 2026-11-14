import type { CapiStats } from '@/lib/meta-capi/stats'

/** รูปข้อมูลหน้า detail ที่ serialize ข้าม RSC ได้ (วันที่เป็น ISO string · ไม่มี token) */
export type DatasetView = {
  id: string
  datasetId: string
  source: string
  label: string | null
  events: string[]
  status: string
  hasToken: boolean
}

export type EventOpt = { valueMode?: 'NET' | 'NO_VAT'; sendContents?: boolean; rules?: { tagId: string; valueBaht?: number }[] }
export type EventOpts = Partial<Record<string, EventOpt>>

export type PageSetting = { enabled: boolean; everEnabled: boolean; purchaseAt: string; countPromotedDraft: boolean }

/** สถิติแถวการ์ด (serialize แล้ว) — อายุรอส่งคิดฝั่ง server เป็นนาที กัน hydration mismatch จาก Date.now() */
export type StatsView = Pick<CapiStats, 'pending' | 'failed' | 'sent' | 'sales' | 'leads'> & {
  days: 7 | 30
  lastSentAt: string | null
  oldestPendingMin: number | null
}

export type DetailData = {
  channelId: string
  name: string
  avatarUrl: string | null
  setting: PageSetting
  eventOptions: EventOpts
  datasets: DatasetView[]
  stats: StatsView
  /** แท็กที่ลงทะเบียนของร้าน (มี id) — กฎผูกกับแท็กที่ลงทะเบียนเท่านั้น */
  tags: { id: string; name: string }[]
}

export const MAX_DATASETS = 3

/** ชื่อที่แสดงของชุดข้อมูล — ไม่มีชื่อเรียก: แบบเพจ = "ชุดข้อมูลของเพจ" · กรอกเอง = Dataset ID */
export const datasetName = (d: Pick<DatasetView, 'label' | 'source' | 'datasetId'>, pageDefault: string) =>
  d.label?.trim() || (d.source === 'PAGE' ? pageDefault : `Dataset ${d.datasetId}`)

/** แถวบันทึกการส่งที่ serialize แล้ว (วันที่เป็น ISO string · ไม่มี psid/token) */
export type LogCustomer = { name: string | null; avatarUrl: string | null }
export type LogOrder = { orderNo: string | null; publicToken: string }
export type LogAd = { adId: string | null; adTitle: string | null; photoFileId: string | null; clickedAt: string }
export type LogRow = {
  id: string
  createdAt: string
  eventKey: string
  datasetName: string
  value: number | null
  status: string
  reason: string | null
  attempts: number
  customer: LogCustomer | null
  order: LogOrder | null
  ad: LogAd | null
}
/** รูปที่ API ตอบ (GET .../log) — ก่อนแปลงเป็น LogRow */
export type LogApiRow = Omit<LogRow, 'datasetName' | 'ad'> & { datasetLabel: string | null; datasetId: string; ad: LogAd | null }
export const toLogRow = (x: LogApiRow): LogRow => ({
  id: x.id, createdAt: x.createdAt, eventKey: x.eventKey, datasetName: x.datasetLabel?.trim() || `Dataset ${x.datasetId}`,
  value: x.value, status: x.status, reason: x.reason, attempts: x.attempts, customer: x.customer, order: x.order, ad: x.ad,
})
