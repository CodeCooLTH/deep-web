import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import * as v from "valibot";
import { UpdateExpenseSchema } from "@/lib/validations";
import { resolveExpenseAccess } from "@/services/expense-access.service";
import { getExpenseById, updateExpense, deleteExpense, serializeExpense } from "@/services/expense.service";
import { parseIsoDateToUtcMidnight } from "@/lib/date-range";

// PATCH /api/expenses/{id} — แก้ไข Expense — API.md §4.3
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decision = await resolveExpenseAccess(session as unknown as { user: { id: string; activeShopId?: string | null } });
  if (decision.kind === "NO_SHOP") return NextResponse.json({ error: "No shop" }, { status: 404 });
  if (decision.kind === "STAFF_NOT_ALLOWED") {
    return NextResponse.json({ error: decision.kind }, { status: 403 });
  }

  // TD-004: ownership check ที่ route — ไม่พบ หรือคนละ shop → 404 เดียวกัน (ไม่ leak, FR-EXP-04-AC-03)
  const { id } = await params;
  const existing = await getExpenseById(id);
  if (!existing || existing.shopId !== decision.shop.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = v.safeParse(UpdateExpenseSchema, body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const updated = await updateExpense(id, {
    ...(parsed.output.category !== undefined && { category: parsed.output.category }),
    ...(parsed.output.amount !== undefined && { amount: parsed.output.amount }),
    ...(parsed.output.expenseDate !== undefined && {
      expenseDate: parseIsoDateToUtcMidnight(parsed.output.expenseDate),
    }),
    ...(parsed.output.note !== undefined && { note: parsed.output.note }),
  });
  return NextResponse.json(serializeExpense(updated));
}

// DELETE /api/expenses/{id} — ลบ Expense (hard-delete) — API.md §4.4
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decision = await resolveExpenseAccess(session as unknown as { user: { id: string; activeShopId?: string | null } });
  if (decision.kind === "NO_SHOP") return NextResponse.json({ error: "No shop" }, { status: 404 });
  if (decision.kind === "STAFF_NOT_ALLOWED") {
    return NextResponse.json({ error: decision.kind }, { status: 403 });
  }

  const { id } = await params;
  const existing = await getExpenseById(id);
  if (!existing || existing.shopId !== decision.shop.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await deleteExpense(id);
  return NextResponse.json({ deleted: true });
}
