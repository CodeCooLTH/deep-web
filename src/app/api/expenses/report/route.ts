import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import * as v from "valibot";
import { PnlReportQuerySchema } from "@/lib/validations";
import { requireShopCapability } from "@/lib/shop-capability";
import { resolveDateRange, isValidCustomRange } from "@/lib/date-range";
import { getPnlReport } from "@/services/pnl.service";
import { getCostCoverage } from "@/services/cost-coverage.service";
import { listExpenses, serializeExpense } from "@/services/expense.service";

// GET /api/expenses/report — รายงาน P&L — API.md §4.5
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const gate = await requireShopCapability(session, "F1");
  if (!gate.ok) return gate.response;
  const shop = gate.active.shop;

  const { searchParams } = request.nextUrl;
  const parsed = v.safeParse(PnlReportQuerySchema, {
    range: searchParams.get("range") ?? undefined,
    start: searchParams.get("start") ?? undefined,
    end: searchParams.get("end") ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { range: preset, start, end } = parsed.output;
  if (preset === "custom" && !isValidCustomRange(start, end)) {
    return NextResponse.json({ error: "CUSTOM_RANGE_REQUIRES_START_END" }, { status: 400 });
  }

  const range = resolveDateRange(preset, start, end);

  // คืนรายงาน + รายการที่ scope ด้วย "ช่วงเดียวกัน" ใน response เดียว — หน้า /expenses ใช้ทั้งการ์ด P&L,
  // การ์ดแยกหมวด, การ์ดสรุปเร็ว และตัวรายการ จากก้อนนี้ก้อนเดียว จึงไม่มีทางที่ตัวเลขสองส่วนขัดกันเอง
  // (เดิม list ดึงทั้งหมดไม่ผูกช่วง แต่ P&L ผูกช่วง — คนละฐานกัน)
  const [report, expenses, coverage] = await Promise.all([
    getPnlReport(shop.id, range, shop.vertical),
    listExpenses(shop.id, { range: range.expenseRange }),
    // feature 00067 — ตัวนับ "ยังไม่ได้ตั้งต้นทุน n จาก m รายการ" ของป้ายเตือนข้อมูลไม่ครบ
    // เพิ่มเป็นช่องใหม่ (additive) ผู้เรียกเดิมที่ไม่อ่านช่องนี้ไม่ได้รับผลกระทบ
    getCostCoverage(shop.id, range),
  ]);

  return NextResponse.json({ ...report, expenses: expenses.map(serializeExpense), coverage });
}
