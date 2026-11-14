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

export type DetailData = {
  channelId: string
  name: string
  avatarUrl: string | null
  setting: PageSetting
  eventOptions: EventOpts
  datasets: DatasetView[]
  stats: { sent: number; failed: number; pending: number; lastSentAt: string | null }
  /** แท็กที่ลงทะเบียนของร้าน (มี id) — กฎผูกกับแท็กที่ลงทะเบียนเท่านั้น */
  tags: { id: string; name: string }[]
}

export const MAX_DATASETS = 3

/** ชื่อที่แสดงของชุดข้อมูล — ไม่มีชื่อเรียก: แบบเพจ = "ชุดข้อมูลของเพจ" · กรอกเอง = Dataset ID */
export const datasetName = (d: Pick<DatasetView, 'label' | 'source' | 'datasetId'>, pageDefault: string) =>
  d.label?.trim() || (d.source === 'PAGE' ? pageDefault : `Dataset ${d.datasetId}`)
