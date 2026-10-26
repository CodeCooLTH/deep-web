import { PARCEL_CLOSE_OUTCOMES, type ParcelCloseOutcome } from '@/lib/parcel-close'

/** คอลัมน์ DB เป็น string — แคบเป็น union ผ่าน allow-list (ค่าแปลก = ถือว่ายังไม่ปิด) */
export function asParcelClose(v: string | null | undefined): ParcelCloseOutcome | null {
  return (PARCEL_CLOSE_OUTCOMES as readonly string[]).includes(v ?? '') ? (v as ParcelCloseOutcome) : null
}
