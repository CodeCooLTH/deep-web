import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { ScamSearchSchema } from "@/lib/validations";
import { searchScamByIdentifier } from "@/services/scam-report.service";

// ค้นหา (อ่าน) — ไม่ต้อง login. คืน aggregate count/มูลค่า/ประเภท จากรายงานที่ APPROVED
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const parsed = v.safeParse(ScamSearchSchema, {
    type: searchParams.get("type"),
    q: searchParams.get("q"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "พารามิเตอร์ไม่ถูกต้อง" }, { status: 400 });
  }

  const result = await searchScamByIdentifier(parsed.output.type, parsed.output.q);
  return NextResponse.json(result);
}
