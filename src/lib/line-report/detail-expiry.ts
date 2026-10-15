import { shiftIsoDate, thaiMidnightUtc, todayThaiIsoDate } from '@/lib/date-range'

/** หมดอายุ 00:00 ไทยของวันที่ 2 นับจากวันไทยที่ส่งรายงาน (= เปิดได้ตลอดวันส่ง + วันถัดไป) */
export function detailExpiresAt(createdAt: Date): Date {
  const [y, m, d] = shiftIsoDate(todayThaiIsoDate(createdAt), 2).split('-').map(Number)
  return thaiMidnightUtc(y, m - 1, d)
}
