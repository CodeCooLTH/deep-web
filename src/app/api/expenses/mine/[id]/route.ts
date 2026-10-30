import { NextRequest, NextResponse, after } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import * as v from "valibot";
import { UpdateExpenseSchema } from "@/lib/validations";
import { forbiddenRoleResponse } from "@/lib/forbidden-role";
import { resolveStaffExpenseAccess } from "@/services/expense-access.service";
import { deleteOwnExpense, serializeExpense, updateOwnExpense } from "@/services/expense.service";
import { parseIsoDateToUtcMidnight } from "@/lib/date-range";
import { notifyOwnerOfStaffExpense } from "@/services/staff-expense-notify.service";

/**
 * /api/expenses/mine/{id} — แก้/ลบค่าใช้จ่าย "ที่ฉันบันทึกเอง" (00086 · BRD FR-019)
 *
 * เงื่อนไขเจ้าของแถวอยู่ใน WHERE ของการเขียน (updateOwnExpense/deleteOwnExpense) —
 * แถวของคนอื่น/ร้านอื่น/ไม่มีอยู่ = 404 เดียวกัน (ไม่เปิดเผยว่าแถวนั้นมีอยู่)
 * 🛑 เจ้าของได้ 403 ที่นี่ — เจ้าของแก้/ลบทุกแถวผ่าน /api/expenses/{id} (F2)
 */

const NO_STORE = { "cache-control": "private, no-store" } as const;

function denied(kind: "UNAUTH" | "NO_SHOP" | "FORBIDDEN") {
  if (kind === "UNAUTH") return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
  // 409 ไม่ใช่ 404 — 404 ของเส้นนี้สงวนไว้ให้ "ไม่พบแถว" เท่านั้น (โมดัลถือ 404 Not found = ลบไปแล้ว)
  // ถ้า NO_SHOP เป็น 404 ด้วย การลบที่ไม่ได้ลบจริงจะขึ้นว่า "ถูกลบไปแล้ว" (MINOR-4)
  if (kind === "NO_SHOP") return NextResponse.json({ error: "NO_SHOP" }, { status: 409, headers: NO_STORE });
  return forbiddenRoleResponse();
}

const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404, headers: NO_STORE });

// PATCH /api/expenses/mine/{id} — partial update (UpdateExpenseSchema เดียวกับเจ้าของ)
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const access = await resolveStaffExpenseAccess(session);
  if (access.kind !== "GRANTED") return denied(access.kind);

  const body = await request.json().catch(() => null);
  const parsed = v.safeParse(UpdateExpenseSchema, body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400, headers: NO_STORE });

  const { id } = await params;
  const updated = await updateOwnExpense(id, { shopId: access.shopId, createdByUserId: access.userId }, {
    ...(parsed.output.category !== undefined && { category: parsed.output.category }),
    ...(parsed.output.amount !== undefined && { amount: parsed.output.amount }),
    ...(parsed.output.expenseDate !== undefined && {
      expenseDate: parseIsoDateToUtcMidnight(parsed.output.expenseDate),
    }),
    ...(parsed.output.note !== undefined && { note: parsed.output.note }),
  });
  if (!updated) return notFound();
  // FR-020: แจ้งเจ้าของ (ยอด/หมวดหลังแก้) — after() ไม่หน่วงคำตอบ · พังไม่กระทบการแก้
  after(() =>
    notifyOwnerOfStaffExpense({
      shopId: access.shopId,
      actorUserId: access.userId,
      action: "update",
      expenseId: updated.id,
      amount: Number(updated.amount),
      category: updated.category,
    }),
  );
  return NextResponse.json(serializeExpense(updated), { headers: NO_STORE });
}

// DELETE /api/expenses/mine/{id} — ลบแถวของตัวเอง (hard-delete เหมือนของเจ้าของ)
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const access = await resolveStaffExpenseAccess(session);
  if (access.kind !== "GRANTED") return denied(access.kind);

  const { id } = await params;
  const deleted = await deleteOwnExpense(id, { shopId: access.shopId, createdByUserId: access.userId });
  if (!deleted) return notFound();
  // FR-020: แจ้งเจ้าของด้วยยอด/หมวดของแถวที่เพิ่งลบ
  after(() =>
    notifyOwnerOfStaffExpense({
      shopId: access.shopId,
      actorUserId: access.userId,
      action: "delete",
      expenseId: deleted.id,
      amount: Number(deleted.amount),
      category: deleted.category,
    }),
  );
  return NextResponse.json({ deleted: true }, { headers: NO_STORE });
}
