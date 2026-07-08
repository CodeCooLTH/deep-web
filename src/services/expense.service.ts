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
import { formatDate } from '@/lib/format-date'

// ─────────────────────────────────────────────────────────────────────────────
// Serialization (RSC-safe)
// ─────────────────────────────────────────────────────────────────────────────

export interface SerializedExpense {
  id: string
  shopId: string
  category: string
  amount: number
  // "YYYY-MM-DD" พ.ศ. (formatDate) — ตรง API.md §4.1 ตัวอย่าง response ("2569-07-08")
  expenseDate: string
  note: string | null
  createdByUserId: string
  createdAt: string
  updatedAt: string
}

export function serializeExpense(expense: Expense): SerializedExpense {
  return {
    id: expense.id,
    shopId: expense.shopId,
    category: expense.category,
    amount: Number(expense.amount),
    expenseDate: formatDate(expense.expenseDate),
    note: expense.note,
    createdByUserId: expense.createdByUserId,
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
): Promise<Expense> {
  return prisma.expense.create({
    data: {
      shopId,
      createdByUserId,
      category: data.category,
      amount: data.amount,
      expenseDate: data.expenseDate,
      note: data.note ?? null,
    },
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
}

/** listExpenses — เรียงจาก expenseDate ล่าสุดก่อน (API.md §4.2) */
export async function listExpenses(shopId: string, opts?: ListExpensesOptions): Promise<Expense[]> {
  return prisma.expense.findMany({
    where: {
      shopId,
      ...(opts?.range ? { expenseDate: { gte: opts.range.gte, lt: opts.range.lt } } : {}),
    },
    orderBy: { expenseDate: 'desc' },
  })
}
