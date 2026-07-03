import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { reactivateBusinessPackage } from "@/services/business-package.service";

/**
 * POST /api/business/reactivate — owner เปิดใช้ subscription ที่ถูก LOCKED_RENEWAL_FAILED กลับมา ACTIVE
 *
 * ทำไม ownerId derive จาก session เท่านั้น: ดู src/app/api/business/subscribe/route.ts
 *
 * Request body: ไม่มี ({}) — API.md §4.6
 */
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const ownerId = (session.user as any).id as string;
  if (!ownerId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const result = await reactivateBusinessPackage(ownerId);
    return NextResponse.json(result);
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "SUBSCRIPTION_NOT_LOCKED") {
      return NextResponse.json({ error: "SUBSCRIPTION_NOT_LOCKED" }, { status: 409 });
    }
    if (e instanceof Error && e.message === "PERSONAL_SHOP_REQUIRED") {
      return NextResponse.json({ error: "PERSONAL_SHOP_REQUIRED" }, { status: 412 });
    }
    if (e instanceof Error && e.message === "INSUFFICIENT_CREDIT") {
      return NextResponse.json({ error: "INSUFFICIENT_CREDIT" }, { status: 402 });
    }
    console.error("[POST /api/business/reactivate] ownerId:", ownerId, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
