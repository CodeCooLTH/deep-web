import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import * as v from "valibot";
import { authOptions } from "@/lib/auth";
import { ReceivableQuerySchema } from "@/lib/validations";
import { resolveExpenseAccess } from "@/services/expense-access.service";
import { resolveDateRange, isValidCustomRange } from "@/lib/date-range";
import { getReceivables } from "@/services/receivable.service";
import { resolveShopVertical } from "@/lib/lodging";

/**
 * GET /api/finance/receivables — บิลที่ยังเก็บเงินไม่ครบ (feature 00067 · API.md §4.1)
 *
 * มิเรอร์โครงของ `api/expenses/report/route.ts` ทุกขั้น (session → สิทธิ์ → parse → range → service)
 * ต่างแค่มีด่าน vertical เพิ่มมาอีกชั้น
 *
 * 🛑 **ตัดสินสิทธิ์ที่นี่เองเสมอ ห้ามเชื่อว่าหน้าเป็นคนกรองมาแล้ว** — endpoint นี้ยิงตรงได้
 * จากทุกที่ที่มี session cookie
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const decision = await resolveExpenseAccess(
    session as unknown as { user: { id: string; activeShopId?: string | null } },
  );
  if (decision.kind === "NO_SHOP") return NextResponse.json({ error: "NO_SHOP" }, { status: 403 });
  if (decision.kind === "STAFF_NOT_ALLOWED") {
    return NextResponse.json({ error: "STAFF_NOT_ALLOWED" }, { status: 403 });
  }

  /**
   * 🛑 ร้านที่ไม่ใช่ SERVICE_QUEUE ได้ 404 ไม่ใช่ 403 โดยตั้งใจ — 403 แปลว่า "มีของอยู่แต่คุณ
   * ไม่มีสิทธิ์" ซึ่งไม่จริง สำหรับร้านประเภทอื่น endpoint นี้ไม่มีอยู่เลย (ฟีเจอร์ยังไม่เปิดให้)
   * ใช้ `resolveShopVertical` ตัวเดิมที่ fail-closed ห้ามเทียบสตริงเอง
   */
  if (resolveShopVertical(decision.shop.vertical) !== "SERVICE_QUEUE") {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const { searchParams } = request.nextUrl;
  const parsed = v.safeParse(ReceivableQuerySchema, {
    range: searchParams.get("range") ?? undefined,
    start: searchParams.get("start") ?? undefined,
    end: searchParams.get("end") ?? undefined,
    cursor: searchParams.get("cursor") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: "INVALID_RANGE" }, { status: 400 });

  const { range: preset, start, end, cursor, limit } = parsed.output;
  if (preset === "custom" && !isValidCustomRange(start, end)) {
    return NextResponse.json({ error: "INVALID_RANGE" }, { status: 400 });
  }

  const range = resolveDateRange(preset, start, end);
  const result = await getReceivables(decision.shop.id, range, { cursor, limit });

  return NextResponse.json(result);
}
