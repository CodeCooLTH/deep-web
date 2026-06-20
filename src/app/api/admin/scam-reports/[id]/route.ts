import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { requireAdmin } from "@/lib/auth";
import { ReviewScamReportSchema } from "@/lib/validations";
import {
  reviewScamReport,
  ScamReportNotFoundError,
  ScamSelfReviewForbiddenError,
} from "@/services/scam-report.service";

// อนุมัติ/ปฏิเสธรายงาน — self-review guard + not-found อยู่ใน service layer
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = v.safeParse(ReviewScamReportSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  try {
    const updated = await reviewScamReport(id, admin.id, parsed.output);
    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof ScamSelfReviewForbiddenError) {
      return NextResponse.json(
        { error: "ไม่สามารถอนุมัติ/ปฏิเสธรายงานของตนเองได้" },
        { status: 403 },
      );
    }
    if (e instanceof ScamReportNotFoundError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw e;
  }
}
