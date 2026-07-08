import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import * as v from "valibot";
import { CreateExpenseSchema } from "@/lib/validations";
import { resolveExpenseAccess } from "@/services/expense-access.service";
import { createExpense, listExpenses, serializeExpense } from "@/services/expense.service";
import { resolveDateRange, parseIsoDateToUtcMidnight, todayThaiIsoDate } from "@/lib/date-range";

// GET /api/expenses — รายการ Expense (filter ช่วงเวลา optional ผ่าน ?start&end) — API.md §4.2
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decision = await resolveExpenseAccess(session as unknown as { user: { id: string; activeShopId?: string | null } });
  if (decision.kind === "NO_SHOP") return NextResponse.json({ error: "No shop" }, { status: 404 });
  if (decision.kind === "PACKAGE_LOCKED" || decision.kind === "STAFF_NOT_ALLOWED") {
    return NextResponse.json({ error: decision.kind }, { status: 403 });
  }

  // start/end ทั้งคู่ optional — ต้องมาคู่กัน (ส่งมาแค่ตัวเดียว → ignore ทั้งคู่, ไม่ error, defensive)
  const { searchParams } = request.nextUrl;
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  // validate format ก่อนส่งเข้า resolveDateRange (กัน Invalid Date เงียบ ๆ — parity กับ report route)
  const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
  if (start && end && (!ISO_DATE.test(start) || !ISO_DATE.test(end))) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const range =
    start && end ? resolveDateRange("custom", start, end).expenseRange : undefined;

  const expenses = await listExpenses(decision.shop.id, range ? { range } : undefined);
  return NextResponse.json(expenses.map(serializeExpense));
}

// POST /api/expenses — สร้าง Expense — API.md §4.1
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decision = await resolveExpenseAccess(session as unknown as { user: { id: string; activeShopId?: string | null } });
  if (decision.kind === "NO_SHOP") return NextResponse.json({ error: "No shop" }, { status: 404 });
  if (decision.kind === "PACKAGE_LOCKED" || decision.kind === "STAFF_NOT_ALLOWED") {
    return NextResponse.json({ error: decision.kind }, { status: 403 });
  }

  const body = await request.json();
  const parsed = v.safeParse(CreateExpenseSchema, body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  // TD-002: expenseDate ไม่ส่งมา → default วันนี้ (Thai calendar date), ทั้งคู่ normalize เป็น UTC-midnight เสมอ
  const expenseDate = parseIsoDateToUtcMidnight(parsed.output.expenseDate ?? todayThaiIsoDate());

  const userId = (session.user as { id?: string }).id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const expense = await createExpense(decision.shop.id, userId, {
    category: parsed.output.category,
    amount: parsed.output.amount,
    expenseDate,
    note: parsed.output.note ?? null,
  });
  return NextResponse.json(serializeExpense(expense), { status: 201 });
}
