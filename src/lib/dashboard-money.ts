/**
 * dashboard-money — ใครเห็นเงินอะไรบนแดชบอร์ด (feature 00071 · S-3/S-6)
 *
 * ทำไมแยกไฟล์: boolean ที่ตัดสินว่า UI จะแสดงเงินหรือไม่ ห้ามอยู่ในเทอร์นารีกลาง JSX
 * (docs/conventions/ui-boolean-needs-a-testable-home.md) · ไฟล์บริสุทธิ์ ไม่ import prisma
 *
 * ระดับ PER_ORDER/NONE เห็นเงินรายใบได้ (ราคา/ยอดต่อออเดอร์) แต่ไม่เห็นยอดรวมของร้าน ⇒ ทุกธงเป็น FULL เท่านั้น
 */
import { canUseAppointments } from '@/lib/appointments'
import { moneyLevel, type MoneyLevel, type ShopRole } from '@/lib/shop-permissions'

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

/**
 * บล็อกหน้าแรกตามบทบาท (spec 00071 P3 §3) — ตัดสินที่นี่ที่เดียว ทั้ง query ฝั่ง server และ JSX ใช้ค่าชุดนี้
 * (ห้ามเขียน boolean เดียวกันซ้ำในหน้า — เกณฑ์เพี้ยนกันเมื่อไหร่ ช่างจะเห็นของที่ไม่ควรเห็นเงียบ ๆ)
 *
 * · bestSellerStrip: เฉพาะเจ้าของ/ผู้ดูแล/ตอบแชท — เปิดบิล/ช่างไม่มีงานขายสินค้า
 * · technicianHome: ช่างล้วน (ไม่ถือบทบาทอื่นเลย) — union กับบทบาทอื่น = ผังของบทบาทอื่น (ตรงกับแท็บ "งาน" ใน resolveMobileNav)
 * · todayJobs: ช่างล้วน + ร้านรับนัด — ห้าม mount ซ่อนด้วย CSS (endpoint คืนเบอร์ลูกค้า)
 * · recentOrderAmount: ยอดรายใบ — ระดับ NONE (ช่าง) ไม่เห็น · ไม่ query ยอดมาแต่แรก
 * · recentOrderTools: ปุ่มส่งออก/นำเข้า — ซ่อนเมื่อ NONE (ปุ่มนั้นไม่ทำงานจริงอยู่แล้ว แต่ไม่ควรโผล่ให้ช่าง)
 * · salesChannelDonut: ช่างล้วนไม่มี (การ์ดงานวันนี้เข้าไปแทนที่)
 */
export function homeBlocks(roles: readonly ShopRole[], shop: { kind: string; vertical: string }) {
  const technicianHome = roles.length > 0 && roles.every((r) => r === 'TECHNICIAN')
  const level = moneyLevel(roles)
  return {
    bestSellerStrip: roles.some((r) => r === 'OWNER' || r === 'MANAGER' || r === 'CHAT'),
    technicianHome,
    todayJobs: technicianHome && canUseAppointments(shop),
    recentOrderAmount: level !== 'NONE',
    recentOrderTools: level !== 'NONE',
    salesChannelDonut: !technicianHome,
  }
}
