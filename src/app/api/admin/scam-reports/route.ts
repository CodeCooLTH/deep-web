import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getScamReports } from "@/services/scam-report.service";

// queue สำหรับ admin — filter ตาม status (PENDING/APPROVED/REJECTED) หรือทั้งหมด
export async function GET(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const status = new URL(request.url).searchParams.get("status") ?? undefined;
  const reports = await getScamReports(status || undefined);
  return NextResponse.json(reports);
}
