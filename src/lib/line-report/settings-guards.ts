/**
 * settings-guards — boolean/ตัวเลือกที่หน้าตั้งค่ากลุ่ม LINE ตัดสิน (00070 · addendum E §4.2) · pure
 *
 * ทำไมอยู่ใน lib: ปุ่ม × / checkbox ตัวสุดท้าย / ปุ่มเพิ่มเวลา เป็น boolean ที่ตัดสินว่ากดได้ไหม ต้องมีเทส mutation จับ
 * (convention `ui-boolean-needs-a-testable-home`) · server ยังเป็นด่านจริง (INVALID_SETTINGS) — ที่นี่กันไม่ให้ผู้ใช้เจอ error จากปุ่มที่ไม่ควรกดได้
 * 🛑 ไม่ import service/prisma — ไฟล์นี้ถูก bundle เข้า client
 */
import { MAX_PICK_SHOPS } from '@/lib/line-report/bind-wizard-rules'
import { SLOT_OPTIONS } from '@/lib/line-report/schedule'

export const MAX_DAILY_TIMES = 4

export const METRIC_KEYS = ['showOrders', 'showSales', 'showCancelled', 'showTopProducts', 'showProfit'] as const
export type MetricKey = (typeof METRIC_KEYS)[number]

export const NEEDS_TIME_HELPER = 'ต้องมีอย่างน้อย 1 เวลา ปิดรายวันถ้าไม่ต้องการส่ง'
export const METRIC_REQUIRED_HELPER = 'ต้องแสดงตัวเลขอย่างน้อย 1 รายการ'
export const SHOP_REQUIRED_HELPER = 'ต้องเลือกอย่างน้อย 1 ร้าน'
export const TIMES_FULL_HELPER = 'ครบ 4 เวลาแล้ว ลบเวลาเดิมก่อนจึงจะเพิ่มได้'
export const DELETED_SHOP_HELPER = 'ร้านนี้ถูกลบแล้ว จึงไม่ถูกรวมในรายงาน'
export const ENABLE_NEEDS_TIME_HELPER = 'เพิ่มเวลาก่อน จึงจะเปิดรายงานได้'

/** เพิ่มเวลาได้เมื่อยังไม่ครบ 4 */
export const canAddTime = (times: readonly number[]): boolean => times.length < MAX_DAILY_TIMES

/** ตัวเลือกใน form-select ของ "เพิ่มเวลา" — ตัดค่าที่เลือกไปแล้วออก (server ปฏิเสธค่าซ้ำ) */
export const addableSlots = (times: readonly number[]) => SLOT_OPTIONS.filter((o) => !times.includes(o.minutes))

export const withTime = (times: readonly number[], minutes: number): number[] => [...new Set([...times, minutes])].sort((a, b) => a - b)
export const withoutTime = (times: readonly number[], minutes: number): number[] => times.filter((t) => t !== minutes)

/** ลบเวลาไม่ได้เมื่อจะเหลือ 0 ทั้งที่ยังเปิดรายวัน/รายเดือน (กฎ NEEDS_TIME ของ server) */
export function canRemoveTime(times: readonly number[], on: { dailyEnabled: boolean; monthlyEnabled: boolean }): boolean {
  return !((on.dailyEnabled || on.monthlyEnabled) && times.length <= 1)
}

/** เปิดสวิตช์รายวัน/รายเดือนได้เมื่อมีเวลา ≥1 — ปิดเสมอได้ */
export const canEnableSend = (times: readonly number[]): boolean => times.length >= 1

/** ตัวเลขที่ติ๊กอยู่และเป็นตัวสุดท้าย → ปิดไม่ได้ (METRIC_REQUIRED) */
export function isLastMetric(settings: Record<MetricKey, boolean>, key: MetricKey): boolean {
  return settings[key] && METRIC_KEYS.filter((k) => settings[k]).length === 1
}

/** ร้านที่ติ๊กอยู่และเป็นตัวสุดท้าย (นับเฉพาะร้านที่ใช้งานได้) → ถอดไม่ได้ */
export const isLastShop = (selectedOkIds: readonly string[], id: string): boolean => selectedOkIds.length === 1 && selectedOkIds[0] === id

export type ShopRow = { id: string; name: string; vertical: string; kind: string; state: 'OK' | 'LOCKED' | 'DELETED' }

/**
 * แถวร้านในรายการ = ร้านเดิมของกลุ่ม (รวมที่ล็อก/ลบแล้ว — แสดง disabled) + ร้านที่เพิ่มได้ (ที่ยังไม่อยู่ในกลุ่ม)
 * ร้านเดิมมาก่อนเพื่อไม่ให้แถวกระโดดตอนติ๊ก
 */
export function buildShopRows(
  groupShops: readonly { shopId: string; name: string; vertical: string; kind: string; state: string }[],
  reportable: readonly { id: string; name: string; vertical: string | null; kind: string }[],
): ShopRow[] {
  const inGroup = new Set(groupShops.map((s) => s.shopId))
  return [
    ...groupShops.map((s) => ({ id: s.shopId, name: s.name, vertical: s.vertical, kind: s.kind, state: (s.state === 'OK' ? 'OK' : s.state === 'LOCKED' ? 'LOCKED' : 'DELETED') as ShopRow['state'] })),
    ...reportable.filter((s) => !inGroup.has(s.id)).map((s) => ({ id: s.id, name: s.name, vertical: s.vertical ?? 'ONLINE_SALES', kind: s.kind, state: 'OK' as const })),
  ]
}

/** สลับร้าน — ชนเพดาน 10 แล้วเพิ่มไม่ได้ · ถอดตัวสุดท้ายที่ใช้งานได้ไม่ได้ · ร้านล็อก/ลบคงอยู่ในชุดเสมอ (ไม่ลบเงียบ — AC-09-3) */
export function toggleShop(rows: readonly ShopRow[], selected: readonly string[], id: string): string[] {
  const row = rows.find((r) => r.id === id)
  if (!row || row.state !== 'OK') return [...selected]
  if (selected.includes(id)) {
    const okSelected = selected.filter((x) => rows.find((r) => r.id === x)?.state === 'OK')
    return isLastShop(okSelected, id) ? [...selected] : selected.filter((x) => x !== id)
  }
  return selected.length >= MAX_PICK_SHOPS ? [...selected] : [...selected, id]
}

/** checkbox ของแถวร้านถูกปิดเมื่อ: ร้านไม่พร้อม · ร้านสุดท้าย · ครบเพดานแล้วและแถวนี้ยังไม่ติ๊ก */
export function shopDisabledReason(rows: readonly ShopRow[], selected: readonly string[], id: string, canEdit: boolean): string | null {
  const row = rows.find((r) => r.id === id)
  if (!row) return null
  if (row.state === 'DELETED') return DELETED_SHOP_HELPER
  if (row.state !== 'OK') return 'ถูกล็อกเพราะแพ็กเกจ จะกลับมาให้เลือกเมื่อเปิดใช้งานร้านนี้อีกครั้ง'
  if (!canEdit) return null
  const checked = selected.includes(id)
  const okSelected = selected.filter((x) => rows.find((r) => r.id === x)?.state === 'OK')
  if (checked && isLastShop(okSelected, id)) return SHOP_REQUIRED_HELPER
  if (!checked && selected.length >= MAX_PICK_SHOPS) return 'เลือกได้สูงสุด 10 ร้าน'
  return null
}

/** วันตัดรอบ: 1..31 แล้วสิ้นเดือน (null) */
export const CUTOFF_OPTIONS: readonly (number | null)[] = [...Array.from({ length: 31 }, (_, i) => i + 1), null]
export const cutoffLabel = (day: number | null): string => (day === null ? 'สิ้นเดือน' : `วันที่ ${day}`)
export const cutoffFromValue = (value: string): number | null => (value === 'EOM' ? null : Number(value))
export const cutoffToValue = (day: number | null): string => (day === null ? 'EOM' : String(day))

/** ไม่ได้เปิดรายวันและรายเดือน = ไม่มีรายงานอัตโนมัติ (ผูกสำเร็จแล้วค่าเริ่มต้นคือปิด) → ต้องบอกผู้ใช้ */
export const isAutoReportOff = (s: { dailyEnabled: boolean; monthlyEnabled: boolean }): boolean => !s.dailyEnabled && !s.monthlyEnabled

export type PreviewKind = 'DAILY' | 'MONTHLY'
/**
 * พรีวิวแสดงใบไหน + ปุ่ม seg ตัวไหนกดไม่ได้ — ตัวที่ปิดอยู่ disabled · รายเดือนต้องมี cycle ด้วย
 * ถ้าใบที่เลือกอยู่ถูกปิด → ถอยไปอีกใบที่เปิดอยู่ · ปิดทั้งคู่ = รายวัน (ยังเห็นตัวอย่างข้อความได้ — คำสั่ง "สรุปวันนี้" ใช้หน้าตาเดียวกัน)
 */
export function previewState(view: PreviewKind, s: { dailyEnabled: boolean; monthlyEnabled: boolean }, hasCycle: boolean) {
  const monthlyOk = s.monthlyEnabled && hasCycle
  const dailyOk = s.dailyEnabled
  let kind: PreviewKind = view
  if (kind === 'MONTHLY' && !monthlyOk) kind = 'DAILY'
  else if (kind === 'DAILY' && !dailyOk && monthlyOk) kind = 'MONTHLY'
  return { kind, dailyDisabled: !dailyOk, monthlyDisabled: !monthlyOk }
}
