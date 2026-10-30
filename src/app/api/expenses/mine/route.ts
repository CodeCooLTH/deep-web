import { NextRequest, NextResponse, after } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import * as v from "valibot";
import { CreateExpenseSchema } from "@/lib/validations";
import { forbiddenRoleResponse } from "@/lib/forbidden-role";
import { resolveStaffExpenseAccess } from "@/services/expense-access.service";
import { createExpense, listExpenses, serializeExpense } from "@/services/expense.service";
import { notifyOwnerOfStaffExpense } from "@/services/staff-expense-notify.service";
import { resolveDateRange, parseIsoDateToUtcMidnight, todayThaiIsoDate } from "@/lib/date-range";

/**
 * /api/expenses/mine — "ค่าใช้จ่ายของฉัน" ของพนักงานร้านบริการ (00086 · BRD FR-018/019)
 *
 * ด่าน = resolveStaffExpenseAccess (ร้านบริการ ∧ ADMIN ∧ ธง canRecordExpense · อ่านแถวสมาชิกสดทุกคำขอ)
 * 🛑 เจ้าของได้ 403 ที่นี่โดยตั้งใจ — เจ้าของใช้ /api/expenses (F1/F2) ที่เห็น/แก้ทั้งร้าน
 * 🛑 คืนเฉพาะแถวที่ผู้นี้บันทึกเอง และไม่มียอดรวม/สรุปใด ๆ ของร้าน (พนักงานไม่มี F1)
 */

const NO_STORE = { "cache-control": "private, no-store" } as const;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function denied(kind: "UNAUTH" | "NO_SHOP" | "FORBIDDEN") {
  if (kind === "UNAUTH") return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
  // 409 ไม่ใช่ 404 — 404 ของเส้นนี้สงวนไว้ให้ "ไม่พบแถว" เท่านั้น (โมดัลถือ 404 Not found = ลบไปแล้ว)
  // ถ้า NO_SHOP เป็น 404 ด้วย การลบที่ไม่ได้ลบจริงจะขึ้นว่า "ถูกลบไปแล้ว" (MINOR-4)
  if (kind === "NO_SHOP") return NextResponse.json({ error: "NO_SHOP" }, { status: 409, headers: NO_STORE });
  return forbiddenRoleResponse();
}

// GET /api/expenses/mine?start&end — รายการที่ฉันบันทึกในร้านที่ active (ช่วงเวลา optional ต้องมาคู่กัน)
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const access = await resolveStaffExpenseAccess(session);
  if (access.kind !== "GRANTED") return denied(access.kind);

  const { searchParams } = request.nextUrl;
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  if (start && end && (!ISO_DATE.test(start) || !ISO_DATE.test(end))) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400, headers: NO_STORE });
  }
  const range = start && end ? resolveDateRange("custom", start, end).expenseRange : undefined;

  const expenses = await listExpenses(access.shopId, {
    createdByUserId: access.userId,
    ...(range ? { range } : {}),
  });
  return NextResponse.json(expenses.map(serializeExpense), { headers: NO_STORE });
}

// POST /api/expenses/mine — บันทึกค่าใช้จ่าย ผู้บันทึก = ผู้ใช้จาก session เสมอ (body ส่ง createdByUserId มาก็ไม่มีผล)
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const access = await resolveStaffExpenseAccess(session);
  if (access.kind !== "GRANTED") return denied(access.kind);

  const body = await request.json().catch(() => null);
  const parsed = v.safeParse(CreateExpenseSchema, body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400, headers: NO_STORE });

  // TD-002 เดิม: ไม่ส่งวันที่ → วันนี้ (ปฏิทินไทย) · normalize เป็น UTC-midnight เสมอ
  const expenseDate = parseIsoDateToUtcMidnight(parsed.output.expenseDate ?? todayThaiIsoDate());
  const expense = await createExpense(access.shopId, access.userId, {
    category: parsed.output.category,
    amount: parsed.output.amount,
    expenseDate,
    note: parsed.output.note ?? null,
  });
  // FR-020: แจ้งเจ้าของหลังบันทึกสำเร็จ — after() = ไม่หน่วงคำตอบ และพังก็ไม่กระทบการบันทึก (service ไม่ throw)
  after(() =>
    notifyOwnerOfStaffExpense({
      shopId: access.shopId,
      actorUserId: access.userId,
      action: "create",
      expenseId: expense.id,
      amount: Number(expense.amount),
      category: expense.category,
    }),
  );
  return NextResponse.json(serializeExpense(expense), { status: 201, headers: NO_STORE });
}
