/**
 * expense.service.ts — CRUD ของ Expense (feature 00016 Expense & Cost Tracking)
 * SSOT: docs/20 - Features/00016 - Expense & Cost Tracking/SDS.md §3, §8; SRS.md TFR-003/004
 *
 * 🛑 TD-004: เป็น "dumb" service — ไม่ตรวจสิทธิ์/ownership เอง route
 * (`api/expenses/[id]/route.ts`) ต้อง fetch ผ่าน getExpenseById แล้วเทียบ shopId เอง ก่อนเรียก
 * updateExpense/deleteExpense (มิเรอร์ pattern ของ api/products/[id]/route.ts)
 */
import { prisma } from '@/lib/prisma'
import type { Expense } from '@prisma/client'
import type { ExpenseCategory } from '@/lib/expense'

// ─────────────────────────────────────────────────────────────────────────────
// Serialization (RSC-safe)
// ─────────────────────────────────────────────────────────────────────────────

export interface SerializedExpense {
  id: string
  shopId: string
  category: string
  amount: number
  // "YYYY-MM-DD" ISO ค.ศ. (wire format คงที่ — display พ.ศ. ทำที่ presentation layer ด้วย formatDate)
  // expenseDate เก็บเป็น UTC-midnight-of-calendar-date → slice(0,10) ได้ calendar date ตรง ไม่ off-by-one
  expenseDate: string
  note: string | null
  createdByUserId: string
  /**
   * 00086 FR-019 — ชื่อผู้บันทึก (เจ้าของเห็น "บันทึกโดย {ชื่อ}" ในรายการ) · null = แถวที่โหลดมาโดยไม่ join ผู้ใช้
   * (เช่นผลของ create/update ที่คืนแถวดิบ) ไม่ใช่ "ไม่มีผู้บันทึก"
   */
  createdByName: string | null
  createdAt: string
  updatedAt: string
}

/** แถวที่ join ชื่อผู้บันทึกมาแล้ว (listExpenses/listOwnExpenses) — แถวดิบจาก create/update ก็ส่งเข้า serializeExpense ได้ */
export type ExpenseWithCreator = Expense & { createdBy?: { displayName: string } | null }

/** select ชื่อผู้บันทึกอย่างเดียว — ไม่ดึงเบอร์/อีเมลของผู้ใช้ออกมา (permission-gate-follows-the-row) */
const CREATOR_INCLUDE = { createdBy: { select: { displayName: true } } } as const

export function serializeExpense(expense: ExpenseWithCreator): SerializedExpense {
  return {
    id: expense.id,
    shopId: expense.shopId,
    category: expense.category,
    amount: Number(expense.amount),
    expenseDate: expense.expenseDate.toISOString().slice(0, 10),
    note: expense.note,
    createdByUserId: expense.createdByUserId,
    createdByName: expense.createdBy?.displayName ?? null,
    createdAt: expense.createdAt.toISOString(),
    updatedAt: expense.updatedAt.toISOString(),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CRUD
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateExpenseInput {
  category: ExpenseCategory
  amount: number
  /** ต้อง normalize เป็น UTC-midnight-of-calendar-date แล้วก่อนเรียก (parseIsoDateToUtcMidnight ที่ route) */
  expenseDate: Date
  note?: string | null
}

export async function createExpense(
  shopId: string,
  createdByUserId: string,
  data: CreateExpenseInput,
): Promise<ExpenseWithCreator> {
  return prisma.expense.create({
    data: {
      shopId,
      createdByUserId,
      category: data.category,
      amount: data.amount,
      expenseDate: data.expenseDate,
      note: data.note ?? null,
    },
    // 00086 — คืนชื่อผู้บันทึกในคำตอบ POST ด้วย (จอแสดง "บันทึกโดย" ได้ทันทีโดยไม่ต้องโหลดใหม่)
    include: CREATOR_INCLUDE,
  })
}

export interface UpdateExpenseInput {
  category?: ExpenseCategory
  amount?: number
  /** ต้อง normalize เป็น UTC-midnight-of-calendar-date แล้วก่อนเรียก ถ้าส่งมา */
  expenseDate?: Date
  note?: string | null
}

/** updateExpense — TD-004: ไม่ตรวจ shopId เอง ownership check ทำที่ route ก่อนเรียก */
export async function updateExpense(expenseId: string, data: UpdateExpenseInput): Promise<Expense> {
  return prisma.expense.update({
    where: { id: expenseId },
    data: {
      ...(data.category !== undefined && { category: data.category }),
      ...(data.amount !== undefined && { amount: data.amount }),
      ...(data.expenseDate !== undefined && { expenseDate: data.expenseDate }),
      ...(data.note !== undefined && { note: data.note }),
    },
  })
}

/** deleteExpense — TD-004: ไม่ตรวจ shopId เอง ownership check ทำที่ route ก่อนเรียก (hard-delete) */
export async function deleteExpense(expenseId: string): Promise<Expense> {
  return prisma.expense.delete({ where: { id: expenseId } })
}

export async function getExpenseById(expenseId: string): Promise<Expense | null> {
  return prisma.expense.findUnique({ where: { id: expenseId } })
}

export interface ListExpensesOptions {
  /** ช่วง expenseDate — ทั้งคู่ optional, ต้องมาคู่กัน (ไม่งั้น ignore ที่ route) */
  range?: { gte: Date; lt: Date }
  /**
   * 00086 FR-019 — เฉพาะแถวที่ผู้ใช้คนนี้บันทึก (หน้า "ค่าใช้จ่ายของฉัน" ของพนักงาน)
   * ไม่ส่ง = ทั้งร้าน (เจ้าของ) — ผู้เรียกฝั่งพนักงานต้องส่งเสมอ (route /api/expenses/mine)
   */
  createdByUserId?: string
}

/**
 * hasAnyExpense — ร้านนี้เคยบันทึกค่าใช้จ่ายไหม (ไม่จำกัดช่วงเวลา)
 *
 * ใช้แยกข้อความ empty state 2 แบบ: "ยังไม่เคยบันทึกเลย" (ชวนเริ่มต้น) กับ "ช่วงนี้ไม่มีรายการ"
 * (ชวนเปลี่ยนช่วงเวลา) — สองอันนี้ต้องพูดคนละอย่าง ไม่งั้นข้อความโกหกกรณีใดกรณีหนึ่งเสมอ
 */
export async function hasAnyExpense(shopId: string): Promise<boolean> {
  const first = await prisma.expense.findFirst({ where: { shopId }, select: { id: true } })
  return first !== null
}

/**
 * 00086 FR-018 — จำนวนรายการที่ผู้ใช้คนนี้บันทึกในร้านนี้ (การ์ด "ค่าใช้จ่ายที่ฉันบันทึก" บนหน้าแรกพนักงาน)
 * นับอย่างเดียว ไม่คืนยอดเงิน — พนักงานไม่มี F1 จึงห้ามมียอดรวมใด ๆ หลุดไปถึงหน้าแรก
 * ใช้ index Expense_shopId_createdBy_expenseDate_idx (prefix shopId+createdByUserId)
 */
export async function countOwnExpenses(shopId: string, createdByUserId: string): Promise<number> {
  return prisma.expense.count({ where: { shopId, createdByUserId } })
}

/** listExpenses — เรียงจาก expenseDate ล่าสุดก่อน (API.md §4.2) */
export async function listExpenses(shopId: string, opts?: ListExpensesOptions): Promise<ExpenseWithCreator[]> {
  return prisma.expense.findMany({
    where: {
      shopId,
      ...(opts?.createdByUserId ? { createdByUserId: opts.createdByUserId } : {}),
      ...(opts?.range ? { expenseDate: { gte: opts.range.gte, lt: opts.range.lt } } : {}),
    },
    include: CREATOR_INCLUDE,
    orderBy: { expenseDate: 'desc' },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// 00086 FR-019 — แก้/ลบ "เฉพาะแถวของตัวเอง" (พนักงานที่ได้ธง canRecordExpense)
//
// 🛑 ต่างจาก updateExpense/deleteExpense (TD-004 dumb) โดยตั้งใจ: เงื่อนไขเจ้าของแถวอยู่ใน WHERE เดียวกับการเขียน
// (updateMany/deleteMany WHERE {id, shopId, createdByUserId}) — ไม่มีช่อง "อ่านแล้วค่อยเขียน" ให้ลืมเทียบ
// และแถวของคนอื่น/ร้านอื่น/ไม่มีอยู่ ได้ผลเดียวกัน = null → route ตอบ 404 (ไม่บอกว่ามีแถวนั้นอยู่)
// ─────────────────────────────────────────────────────────────────────────────

export interface OwnExpenseScope {
  shopId: string
  createdByUserId: string
}

/** แก้แถวของตัวเอง — คืนแถวหลังแก้ (join ชื่อผู้บันทึก) หรือ null ถ้าไม่ใช่แถวของผู้นี้ในร้านนี้ */
export async function updateOwnExpense(
  expenseId: string,
  scope: OwnExpenseScope,
  data: UpdateExpenseInput,
): Promise<ExpenseWithCreator | null> {
  const res = await prisma.expense.updateMany({
    where: { id: expenseId, shopId: scope.shopId, createdByUserId: scope.createdByUserId },
    data: {
      ...(data.category !== undefined && { category: data.category }),
      ...(data.amount !== undefined && { amount: data.amount }),
      ...(data.expenseDate !== undefined && { expenseDate: data.expenseDate }),
      ...(data.note !== undefined && { note: data.note }),
    },
  })
  if (res.count === 0) return null
  return prisma.expense.findFirst({
    where: { id: expenseId, shopId: scope.shopId, createdByUserId: scope.createdByUserId },
    include: CREATOR_INCLUDE,
  })
}

/**
 * ลบแถวของตัวเอง (hard-delete) — คืนภาพของแถวที่เพิ่งลบ หรือ null ถ้าไม่ใช่แถวของผู้นี้ในร้านนี้
 * 00086 FR-020: ต้องคืนยอด/หมวดของแถวที่ลบ เพื่อแจ้งเจ้าของว่า "ลบค่าใช้จ่าย ฿X · หมวด"
 * เงื่อนไขเจ้าของแถวยังอยู่ใน WHERE ของ deleteMany เหมือนเดิม — การอ่านก่อนลบเป็นแค่ภาพสำหรับแจ้งเตือน
 * ไม่ใช่ด่านสิทธิ์ (อ่าน+ลบอยู่ใน transaction เดียว)
 */
export async function deleteOwnExpense(expenseId: string, scope: OwnExpenseScope): Promise<Expense | null> {
  const where = { id: expenseId, shopId: scope.shopId, createdByUserId: scope.createdByUserId }
  const [snapshot, res] = await prisma.$transaction([
    prisma.expense.findFirst({ where }),
    prisma.expense.deleteMany({ where }),
  ])
  return res.count > 0 ? snapshot : null
}
