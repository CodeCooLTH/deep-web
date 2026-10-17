// feature 00078 — ตรรกะตัดสินของหน้าตั้งค่าส่งอัตโนมัติ (pure · แยกจาก component เพื่อให้เทสจับได้)
import { AUTO_NOTIFY_DAILY_CAP } from './ledger-constants'

/** อ่านค่าเพดานจากช่องพิมพ์ — จำนวนเต็ม 1..20 เท่านั้น ไม่ผ่าน = null (ห้ามปัด/ตัดทศนิยมให้เอง) */
export function parseDailyCap(raw: string): number | null {
  const s = raw.trim()
  if (!/^\d{1,3}$/.test(s)) return null
  const n = Number(s)
  return n >= AUTO_NOTIFY_DAILY_CAP.min && n <= AUTO_NOTIFY_DAILY_CAP.max ? n : null
}

/** แถบบนสุดของหน้า — อ่านอย่างเดียวชนะเสมอ (ผู้ใช้ที่แก้ไม่ได้ ไม่มีประโยชน์ที่จะถูกชวนไปเชื่อมช่องทาง) */
export function settingsBanner(o: { canEdit: boolean; hasChannel: boolean }): 'readOnly' | 'noChannel' | null {
  if (!o.canEdit) return 'readOnly'
  return o.hasChannel ? null : 'noChannel'
}
