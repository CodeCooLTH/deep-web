/**
 * tracking-link — ลิงก์ติดตามพัสดุที่แนบให้ลูกค้า (00078 · S-17 · TFR-016)
 *
 * ตารางเริ่มว่าง: ทุกแบรนด์ที่ไม่ใช่ ISHIP ประกาศ 'NONE' ชัด ๆ (ไม่มีลิงก์ = ไม่แนบ ดีกว่าแนบลิงก์เดา)
 *
 * วิธีเพิ่มแถว: เปิดลิงก์จริงด้วยเลขพัสดุจริงแล้วเห็นหน้าติดตามของพัสดุนั้น ก่อน แล้วจึงแทน 'NONE' ด้วย
 *   DEEP → { form: 'DEEP', url: 'https://.../{เลข}', verifiedAt: 'YYYY-MM-DD' }  (ฝังเลขลง URL ได้)
 *   PAGE → { form: 'PAGE', url: 'https://...', verifiedAt: '...' }  (หน้ากรอกเลขเอง ลิงก์ไม่มีเลข)
 * ห้ามใส่ URL ที่ยังไม่ได้ยืนยัน
 */
import { COURIER_BRANDS, courierBrandCode } from './courier'
import { trackingUrl as ishipTrackingUrl } from '@/lib/chat-shipment-panel'

export type TrackingLinkRow = { form: 'DEEP' | 'PAGE'; url: string; verifiedAt: string }
export type CourierBrandCode = (typeof COURIER_BRANDS)[number]['code']

export const TRACKING_LINKS: Record<string, TrackingLinkRow | 'NONE'> = {
  FLASH: 'NONE',
  KERRY: 'NONE',
  THAIPOST: 'NONE',
  DHL: 'NONE',
  BEST: 'NONE',
  SPX: 'NONE',
  FUZE: 'NONE',
  JANDT: 'NONE',
}

export function trackingLinkFor(
  input: { courierCode?: string | null; courierName?: string | null; trackingNo: string; source: 'ISHIP' | 'MANUAL' },
  table: Record<string, TrackingLinkRow | 'NONE'> = TRACKING_LINKS,
): string | null {
  const brand = courierBrandCode(input.courierCode, input.courierName)
  const row = brand ? table[brand] : undefined
  if (row && row !== 'NONE') {
    return row.form === 'DEEP' ? row.url.replace('{เลข}', encodeURIComponent(input.trackingNo)) : row.url
  }
  return input.source === 'ISHIP' ? ishipTrackingUrl(input.trackingNo) : null
}
