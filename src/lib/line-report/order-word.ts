/**
 * order-word — คำเรียก "ใบ" ในหน้าตั้งค่ารายงาน (00070 · addendum E §6)
 *
 * ห่อ `reportOrderWord` (เจ้าของตรรกะ) — ห้ามนับ vertical เองซ้ำ · ร้านที่ไม่ใช่ OK ถือเป็น EXCLUDED
 * ตามที่ builder ทำ (ไม่ OK ทั้งหมด → helper ถอยไปใช้ vertical ของทุกร้านเอง)
 */
import { reportOrderWord } from '@/lib/line/flex-summary-report'

export type OrderWordShop = { name: string; vertical: string | null; state: string }

export function orderWordFor(shops: readonly OrderWordShop[]): { word: string; mixed: boolean } {
  return reportOrderWord(
    shops.map((s) => ({
      shop: { id: '', name: s.name, vertical: s.vertical },
      state: s.state === 'OK' ? ('OK' as const) : ('EXCLUDED' as const),
    })),
  )
}
