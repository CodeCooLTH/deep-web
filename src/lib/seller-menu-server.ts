import 'server-only'

import { getT } from '@/i18n/server'
import type { EntitlementStatus, InventoryPackage } from '@/lib/inventory-addon'
import { applyChatBadge, applyMenuLocale, resolveVisibleSellerMenu, sellerMenuItems } from '@/lib/seller-menu'
import { resolveExpenseAccess, type ExpenseAccessDecision } from '@/services/expense-access.service'
import { getEntitlementInfo } from '@/services/inventory-entitlement.service'
import type { MenuItemType } from '@/types'

/**
 * seller-menu-server — "เมนูที่ผู้ใช้คนนี้เห็นจริง" ฉบับ server เพียงชุดเดียวของทั้งระบบ
 *
 * ## ทำไมต้องมีไฟล์นี้
 *
 * `resolveVisibleSellerMenu` (ใน `@/lib/seller-menu`) เป็นฟังก์ชันบริสุทธิ์ — มันรับ "ผลลัพธ์ของ
 * การถามฐานข้อมูล" เข้ามา ไม่ได้ถามเอง ⇒ ผู้เรียกทุกรายต้องประกอบ input ชุดเดียวกันเองทุกครั้ง
 * (entitlement · staff · expense · shop · hidePayments) และต้องพันด้วย `applyChatBadge` →
 * `applyMenuLocale` ตามลำดับที่ถูกด้วย
 *
 * เดิมมีผู้เรียกรายเดียว (`(dashboard)/layout.tsx`) จึงไม่มีปัญหา — พอหน้าแชท (`(chat)/layout.tsx`)
 * ต้องมีเมนูของตัวเองด้วย (แถบ `ChatNavRail`) การก็อปลำดับนั้นไปวางอีกที่คือ **permission drift**
 * ที่หัวไฟล์ `seller-menu.ts` เตือนไว้เองตรงตัวว่าเป็นความเสี่ยงอันดับ 1 ของเมนู: วันที่กฎสิทธิ์
 * เปลี่ยนแล้วอีกชุดไม่เปลี่ยน = เมนูพาผู้ใช้ไปหน้าที่เขาไม่มีสิทธิ์ โดยไม่มี `tsc`/build/เทสตัวไหน
 * ฟ้อง เพราะทั้งสองชุด "ถูก" ในตัวเอง (คลาสเดียวกับ Hard Rule 16)
 *
 * ⇒ ลำดับการ compose อยู่ที่นี่ **ที่เดียว** ผู้เรียกส่งแค่ข้อเท็จจริงของร้านเข้ามา
 *
 * ## ทำไม `unreadChatCount`/`hidePayments` เป็น parameter ไม่ใช่ถามเองข้างใน
 *
 * ผู้เรียกทั้งสองรายต้องใช้ค่าสองตัวนี้กับของอย่างอื่นด้วยอยู่แล้ว (`(dashboard)` ใช้
 * `unreadChatCount` กับ `SellerBottomNav` และ `hidePayments` กับการ์ดแพ็กเกจ) ถ้าถามเองข้างใน
 * ด้วยจะกลายเป็นถาม 2 รอบต่อ request โดยเปล่าประโยชน์ — ส่วน entitlement/expense ไม่มีใครใช้
 * นอกจากเมนู จึงถามเองที่นี่ให้จบ
 */
export type SellerMenuContext = {
  /** session ดิบ — ส่งต่อให้ `resolveExpenseAccess` ซึ่ง re-verify membership ของตัวเอง */
  session: { user?: { id?: string | null; activeShopId?: string | null } | null } | null
  /** ร้านที่กำลังเปิดอยู่ — null = ยังไม่มีร้าน (ยังต้องคืนเมนูได้ ดู fail-closed ด้านล่าง) */
  shopId: string | null
  kind: 'PERSONAL' | 'BUSINESS'
  role: 'OWNER' | 'ADMIN'
  vertical: string
  /** badge เมนู "ข้อความ" — ผู้เรียกดึงเองเพราะใช้ที่อื่นด้วย */
  unreadChatCount: number
  /** เปิดจากในแอป iOS (App Store Guideline 3.1.1) — ดู `src/lib/app-shell.ts` */
  hidePayments: boolean
}

export async function resolveSellerMenuItems(ctx: SellerMenuContext): Promise<MenuItemType[]> {
  // fail-closed ทั้งสองตัว: query ล้ม → ค่าที่ "ซ่อนของ" ไม่ใช่ "โชว์ของ"
  //   entitlement → NOT_SUBSCRIBED (เมนูสต็อกขึ้น badge เลือกแพ็กเกจ ไม่ใช่เปิดใช้ฟรี)
  //   expense     → NO_SHOP (ซ่อนเมนูค่าใช้จ่ายสนิท — ด่านจริงอยู่ที่ ExpensesPage อยู่แล้ว)
  // ห้าม throw: ทั้งสอง layout ที่เรียกตัวนี้พังทั้งหน้าถ้ามี exception หลุดออกไป
  let entitlement: { status: EntitlementStatus; package: InventoryPackage | null } = {
    status: 'NOT_SUBSCRIBED',
    package: null,
  }
  let expense: ExpenseAccessDecision = { kind: 'NO_SHOP' }

  const [entitlementResult, expenseResult] = await Promise.allSettled([
    ctx.shopId ? getEntitlementInfo(ctx.shopId) : Promise.resolve(entitlement),
    resolveExpenseAccess(ctx.session),
  ])
  if (entitlementResult.status === 'fulfilled') entitlement = entitlementResult.value
  else console.error('[seller-menu] getEntitlementInfo failed, fallback NOT_SUBSCRIBED', entitlementResult.reason)
  if (expenseResult.status === 'fulfilled') expense = expenseResult.value
  else console.error('[seller-menu] resolveExpenseAccess failed, fallback NO_SHOP (hide menu)', expenseResult.reason)

  /**
   * ลำดับนี้ยกมาจาก `(dashboard)/layout.tsx` ทั้งดุ้น — เหตุผลของแต่ละชั้นอยู่ที่นั่นและที่
   * `resolveVisibleSellerMenu` โดยย่อ:
   *   · `applyChatBadge` อยู่นอก `resolveVisibleSellerMenu` ได้เพราะแตะแค่ `seller:inbox`
   *     ซึ่งไม่มีตัวกรองไหนกรองออก — 🛑 วันที่มีตัวกรองซ่อนเมนู "ข้อความ" ได้ ข้อสรุปนี้ตายทันที
   *     ต้องย้าย applyChatBadge เข้าไปก่อนตัวกรองนั้น
   *   · `applyMenuLocale` นอกสุด: แปลป้ายหลังกรองเสร็จ จะได้ไม่ต้องแปลของที่ถูกซ่อนอยู่แล้ว
   *     และ badge เกาะฟิลด์ `badge` ไม่ใช่ `label` จึงไม่ทับกับ applyChatBadge
   */
  return applyMenuLocale(
    applyChatBadge(
      resolveVisibleSellerMenu(sellerMenuItems, {
        entitlement,
        staff: { kind: ctx.kind, role: ctx.role },
        expense,
        shop: { kind: ctx.kind, vertical: ctx.vertical },
        hidePayments: ctx.hidePayments,
      }),
      ctx.unreadChatCount,
    ),
    await getT(),
    ctx.vertical,
  )
}
