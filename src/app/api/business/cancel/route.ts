import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cancelBusinessPackage } from "@/services/business-package.service";

/**
 * POST /api/business/cancel — owner ยกเลิก package กลับ Free (ไม่มี body)
 *
 * ทำไม ownerId derive จาก session เท่านั้น: ดู src/app/api/business/subscribe/route.ts
 * ล็อกทุก Business shop ทันที + ลบ subscription row (grace 30 วันเริ่มนับต่อ shop)
 * — client ต้อง confirm dialog (Sweet Alerts) ก่อนยิง request นี้ (ดู API.md §4.5)
 *
 * Request body: ไม่มี ({}) — API.md §4.5
 */
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const ownerId = (session.user as any).id as string;
  if (!ownerId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const result = await cancelBusinessPackage(ownerId);
    return NextResponse.json(result);
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "SUBSCRIPTION_NOT_ACTIVE") {
      return NextResponse.json({ error: "SUBSCRIPTION_NOT_ACTIVE" }, { status: 409 });
    }
    console.error("[POST /api/business/cancel] ownerId:", ownerId, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
