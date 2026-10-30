/**
 * dashboard-money — ใครเห็นเงินอะไรบนแดชบอร์ด (feature 00071 · S-3/S-6)
 *
 * ทำไมแยกไฟล์: boolean ที่ตัดสินว่า UI จะแสดงเงินหรือไม่ ห้ามอยู่ในเทอร์นารีกลาง JSX
 * (docs/conventions/ui-boolean-needs-a-testable-home.md) · ไฟล์บริสุทธิ์ ไม่ import prisma
 *
 * ระดับ PER_ORDER/NONE เห็นเงินรายใบได้ (ราคา/ยอดต่อออเดอร์) แต่ไม่เห็นยอดรวมของร้าน ⇒ ทุกธงเป็น FULL เท่านั้น
 */
import { canUseAppointments } from '@/lib/appointments'
import { can, isTechnicianOnly, memberCanRecordStaffExpense, moneyLevel, type MoneyLevel, type ShopRole, type StaffFlags } from '@/lib/shop-permissions'
import { canSeePage, isServiceTechnicianOnly, showsShopPackage } from '@/lib/role-nav'

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
  /** feature 00073 เฟส B — มัดจำรับล่วงหน้า (เงิน) */
  advanceDeposit?: unknown
  /** feature 00073 — ตัวเลขหลักบนการ์ด (เงิน) */
  headline?: unknown
  /** feature 00078 — การ์ดรายงานร้านบริการ (เงิน) */
  serviceReport?: unknown
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
  delete out.advanceDeposit
  delete out.headline
  delete out.serviceReport
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
 *
 * ช่างล้วนร้านบริการ (00086 · user 2026-10-30 "มีไว้ด้วยและทำให้ช่างใช้งานง่าย") — ตัวนับ/ทางลัดเดิมยังอยู่ครบ แต่:
 * · (ลำดับ) การ์ด "งานของฉันวันนี้" (todayJobs) วางช่องแรกของแถวบนเดสก์ท็อป — มือถืออยู่ต่อจาก hero อยู่แล้ว
 * · shopWideJobLabels: หัวการ์ดตัวนับเขียนว่า "งานทั้งร้าน" — ตัวเลขเป็นของทั้งร้าน ไม่ใช่ของช่าง (กันอ่านปนกับ "งานของฉัน")
 * · activityLinksByPage: ฟีดกิจกรรม (เดสก์ท็อป) ลิงก์ได้เฉพาะหน้าที่บทบาทเปิดได้ · ไม่มีปุ่มชวนสร้างงาน (ช่างไม่มี O2)
 * · shopPackage: ชิป/การ์ดแพ็กเกจร้านค้า — ช่างล้วนร้านบริการไม่เห็น (showsShopPackage — ตัวเดียวกับ sidebar ใน layout)
 * บทบาทอื่น/ร้านประเภทอื่น: ทุกธงชุดนี้ให้ผังเดิมทุกตัวอักษร
 */
export function homeBlocks(roles: readonly ShopRole[], shop: { kind: string; vertical: string }) {
  const technicianHome = isTechnicianOnly(roles) // 00086: นิยามเดียวกับ role-nav/ด่านงานช่าง (shop-permissions)
  const level = moneyLevel(roles)
  return {
    bestSellerStrip: roles.some((r) => r === 'OWNER' || r === 'MANAGER' || r === 'CHAT'),
    technicianHome,
    todayJobs: technicianHome && canUseAppointments(shop),
    recentOrderAmount: level !== 'NONE',
    recentOrderTools: level !== 'NONE',
    salesChannelDonut: !technicianHome,
    shopWideJobLabels: isServiceTechnicianOnly(roles, shop),
    activityLinksByPage: isServiceTechnicianOnly(roles, shop),
    shopPackage: showsShopPackage(roles, shop),
  }
}

/**
 * ฟีดกิจกรรมสำหรับผู้ที่ `homeBlocks().activityLinksByPage` — ลิงก์ที่บทบาทเปิดไม่ได้ (เช่น แก้สินค้า = P2) ถอดเหลือเป็นข้อความ
 * รายการยังอยู่ครบ (ไม่ลบของ) แค่ไม่พาไปหน้าที่เจอ "ไม่มีสิทธิ์" · ตัดสินด้วย canSeePage (ทะเบียนเดียวกับ gatePage)
 */
export function activityWithOpenableLinks<T extends { href?: string }>(items: readonly T[], roles: readonly ShopRole[]): T[] {
  return items.map((i) => {
    if (!i.href || canSeePage(i.href, roles)) return i
    const { href: _drop, ...rest } = i
    void _drop
    return rest as T
  })
}

/**
 * การ์ด "ค่าใช้จ่ายที่ฉันบันทึก" บนหน้าแรก (00086 · FR-018) — ร้านบริการ ∧ สมาชิก ADMIN ∧ ธง canRecordExpense
 * ∧ ผู้ดูไม่มี F1 (เจ้าของมีหน้าค่าใช้จ่ายเต็มอยู่แล้ว ห้ามเห็นการ์ดพนักงานซ้อน)
 * `roles` = ชุดที่ผ่าน effectiveRoles แล้ว · ธงที่ไม่ได้ส่ง = false (ด่านเดียวกับ /api/expenses/mine)
 * หน้า /expenses/mine ใช้ฟังก์ชันนี้ตัวเดียวกันเป็นด่านหน้า — การ์ดกับหน้าปลายทางจึงไม่มีทางเห็นต่างกัน
 */
export function showsStaffExpenseCard(
  shop: { kind: string; vertical: string },
  role: string,
  roles: readonly ShopRole[],
  flags?: StaffFlags,
): boolean {
  return memberCanRecordStaffExpense(shop, role, flags) && !can(roles, 'F1')
}
