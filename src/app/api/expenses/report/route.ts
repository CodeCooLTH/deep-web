import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import * as v from "valibot";
import { PnlReportQuerySchema } from "@/lib/validations";
import { resolveExpenseAccess } from "@/services/expense-access.service";
import { resolveDateRange } from "@/lib/date-range";
import { getPnlReport } from "@/services/pnl.service";

// GET /api/expenses/report — รายงาน P&L — API.md §4.5
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decision = await resolveExpenseAccess(session as unknown as { user: { id: string; activeShopId?: string | null } });
  if (decision.kind === "NO_SHOP") return NextResponse.json({ error: "No shop" }, { status: 404 });
  if (decision.kind === "PACKAGE_LOCKED" || decision.kind === "STAFF_NOT_ALLOWED") {
    return NextResponse.json({ error: decision.kind }, { status: 403 });
  }

  const { searchParams } = request.nextUrl;
  const parsed = v.safeParse(PnlReportQuerySchema, {
    range: searchParams.get("range") ?? undefined,
    start: searchParams.get("start") ?? undefined,
    end: searchParams.get("end") ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { range: preset, start, end } = parsed.output;
  if (preset === "custom" && (!start || !end)) {
    return NextResponse.json({ error: "CUSTOM_RANGE_REQUIRES_START_END" }, { status: 400 });
  }

  const range = resolveDateRange(preset, start, end);
  const report = await getPnlReport(decision.shop.id, range);
  return NextResponse.json(report);
}
