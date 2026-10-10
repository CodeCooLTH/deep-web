/**
 * dashboard-money — ใครเห็นเงินอะไรบนแดชบอร์ด (feature 00071 · S-3/S-6)
 *
 * ทำไมแยกไฟล์: boolean ที่ตัดสินว่า UI จะแสดงเงินหรือไม่ ห้ามอยู่ในเทอร์นารีกลาง JSX
 * (docs/conventions/ui-boolean-needs-a-testable-home.md) · ไฟล์บริสุทธิ์ ไม่ import prisma
 *
 * ระดับ PER_ORDER/NONE เห็นเงินรายใบได้ (ราคา/ยอดต่อออเดอร์) แต่ไม่เห็นยอดรวมของร้าน ⇒ ทุกธงเป็น FULL เท่านั้น
 */
import type { MoneyLevel } from '@/lib/shop-permissions'

export function dashboardMoney(level: MoneyLevel) {
  const full = level === 'FULL'
  return {
    revenueStat: full,
    salesReport: full,
    topSelling: full,
    provinceMap: full,
    walletHero: full,
    salesChartCard: full,
    bestSellerCounts: full,
    topups: full,
  }
}

type Redactable = {
  walletBalance?: number | null
  salesSeries?: unknown
  portfolio?: unknown
  bestSellers?: { soldCount?: number }[]
}

/**
 * ตัด key เงินออกจาก payload มือถือ — "ไม่มีคีย์" ไม่ใช่ null/0 (0 = โกหกว่ายอดเป็นศูนย์)
 * ชั้นที่สองถัดจากการไม่ query: ถ้าใครเผลอยัดค่าเข้ามา ก็ไม่ข้ามเส้น RSC → client
 */
export function redactCommandCenterData<T extends Redactable>(data: T, level: MoneyLevel): T {
  if (level === 'FULL') return data
  const out: Redactable = { ...data }
  delete out.walletBalance
  delete out.salesSeries
  delete out.portfolio
  if (out.bestSellers) {
    out.bestSellers = out.bestSellers.map((b) => {
      const { soldCount: _omit, ...rest } = b
      void _omit
      return rest
    })
  }
  return out as T
}
