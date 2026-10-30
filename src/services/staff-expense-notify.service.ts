/**
 * staff-expense-notify.service — แจ้งเจ้าของร้านเมื่อพนักงานบันทึก/แก้/ลบค่าใช้จ่าย (00086 · BRD FR-020)
 *
 * เขียน Notification ผูก shopId (กระดิ่ง + หน้า /notifications ของร้านนั้น) แล้วยิง push เข้าแอปผู้ขาย
 *
 * 🛑 ผู้รับ = "เจ้าของ" ร้านนั้นเท่านั้น (Shop.userId ∪ ShopMember role=OWNER) ไม่ใช้ userIdsHoldingCap —
 *   ตัวนั้นรับแค่ cap แชท (H1/H3) และจะพาผู้ดูแล (MANAGER) ติดมาด้วย ซึ่ง FR-020 ไม่ได้สั่ง
 * 🛑 ตัดผู้กระทำออกเสมอ — กันเคสที่ผู้กระทำเป็นเจ้าของเอง (ไม่ควรเกิดเพราะ /api/expenses/mine ให้เจ้าของ 403
 *   แต่ด่านนี้ไม่พึ่งด่านที่ route)
 * 🛑 ห้าม throw — ผู้เรียกยิงใน after() หลังบันทึกสำเร็จแล้ว แจ้งเตือนพังต้องไม่ทำให้การบันทึกค่าใช้จ่ายพัง
 */
import { prisma } from '@/lib/prisma'
import { EXPENSE_CATEGORY_LABEL_TH, type ExpenseCategory } from '@/lib/expense'
import { formatBaht } from '@/lib/format-money'
import { pushToUsers } from './app-push.service'

/** kind ของแถว Notification — ฝั่งกระดิ่งร้าน map เป็นไอคอน/ลิงก์ใน src/lib/shop-notification.ts */
export const STAFF_EXPENSE_NOTIFICATION_KIND = 'staff_expense'

export type StaffExpenseAction = 'create' | 'update' | 'delete'

const ACTION_VERB_TH: Record<StaffExpenseAction, string> = {
  create: 'บันทึกค่าใช้จ่าย',
  update: 'แก้ไขค่าใช้จ่าย',
  delete: 'ลบค่าใช้จ่าย',
}

/** หมวดที่ไม่รู้จัก (ข้อมูลเก่า/หมวดถูกถอดภายหลัง) แสดงรหัสดิบแทนการพัง */
function categoryLabel(category: string): string {
  return EXPENSE_CATEGORY_LABEL_TH[category as ExpenseCategory] ?? category
}

/**
 * ข้อความแจ้งเตือน — แยกเป็นฟังก์ชันบริสุทธิ์ให้เทสถ้อยคำได้ตรง ๆ
 * headline = "{ชื่อ} บันทึกค่าใช้จ่าย" · detail = "฿{จำนวน} · {หมวด}" (อ่านต่อกันได้เป็นประโยคเดียว)
 */
export function staffExpenseMessage(params: {
  actorName: string
  action: StaffExpenseAction
  amount: number
  category: string
}): { headline: string; detail: string; sentence: string } {
  const headline = `${params.actorName} ${ACTION_VERB_TH[params.action]}`
  const detail = `${formatBaht(params.amount)} · ${categoryLabel(params.category)}`
  return { headline, detail, sentence: `${headline} ${detail}` }
}

/** เจ้าของร้าน — Shop.userId (ครอบร้าน PERSONAL ที่ไม่มีแถว ShopMember) ∪ ShopMember OWNER (ร้าน BUSINESS) */
async function shopOwnerIds(shopId: string): Promise<{ ownerIds: string[]; shopName: string } | null> {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: {
      userId: true,
      shopName: true,
      members: { where: { role: 'OWNER' }, select: { userId: true } },
    },
  })
  if (!shop) return null
  const ids = new Set<string>([shop.userId, ...shop.members.map((m) => m.userId)])
  return { ownerIds: [...ids], shopName: shop.shopName }
}

export async function notifyOwnerOfStaffExpense(params: {
  shopId: string
  actorUserId: string
  action: StaffExpenseAction
  /** id ของแถว Expense (แถวที่ลบแล้วก็ยังส่ง id เดิม — ไว้อ้างอิง ไม่ได้ใช้เปิดหน้า) */
  expenseId: string
  amount: number
  category: string
}): Promise<void> {
  try {
    const [owners, actor] = await Promise.all([
      shopOwnerIds(params.shopId),
      prisma.user.findUnique({ where: { id: params.actorUserId }, select: { displayName: true } }),
    ])
    if (!owners) return
    const audience = owners.ownerIds.filter((id) => id !== params.actorUserId)
    if (audience.length === 0) return

    const msg = staffExpenseMessage({
      actorName: actor?.displayName || 'พนักงาน',
      action: params.action,
      amount: params.amount,
      category: params.category,
    })

    await prisma.notification.createMany({
      data: audience.map((userId) => ({
        userId,
        shopId: params.shopId,
        kind: STAFF_EXPENSE_NOTIFICATION_KIND,
        title: msg.headline,
        body: msg.detail,
        refId: params.expenseId,
      })),
    })

    // push แยก try — แถวในกระดิ่งเขียนแล้ว push ล้มก็ยังเห็นในเว็บ (pushToUsers เองก็ best-effort อยู่แล้ว)
    try {
      await pushToUsers(
        audience,
        // บรรทัดแรก = ชื่อร้าน — เจ้าของหลายร้านต้องรู้ว่าเป็นของร้านไหน (user ตัดสิน 2026-10-27)
        owners.shopName,
        msg.sentence,
        { type: 'staff-expense', url: '/expenses', shopId: params.shopId },
      )
    } catch (e) {
      console.error('[staff-expense-notify] push failed', e)
    }
  } catch (e) {
    console.error('[staff-expense-notify] notify failed', e)
  }
}
