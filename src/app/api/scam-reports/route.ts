import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { requireAuth } from "@/lib/auth";
import { CreateScamReportSchema } from "@/lib/validations";
import { createScamReport, DuplicateScamReportError } from "@/services/scam-report.service";

// แจ้ง/รายงานมิจฉาชีพ (เขียน) — ต้อง login + บังคับหลักฐาน. สร้างเป็น PENDING รอ admin ตรวจ
export async function POST(request: NextRequest) {
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "ต้องเข้าสู่ระบบก่อนรายงาน" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = v.safeParse(CreateScamReportSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  try {
    const report = await createScamReport(user.id, parsed.output);
    return NextResponse.json({ id: report.id, status: report.status }, { status: 201 });
  } catch (e) {
    if (e instanceof DuplicateScamReportError) {
      return NextResponse.json({ error: "คุณเคยรายงานตัวระบุนี้ไปแล้ว" }, { status: 409 });
    }
    throw e;
  }
}
