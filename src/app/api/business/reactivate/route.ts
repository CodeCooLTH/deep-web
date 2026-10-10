import { NextResponse } from "next/server";
import { rejectInAppPurchase } from "@/lib/app-purchase-guard";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireShopCapability } from "@/lib/shop-capability";
import { reactivateBusinessPackage } from "@/services/business-package.service";

/**
 * POST /api/business/reactivate — owner เปิดใช้ subscription ที่ถูก LOCKED_RENEWAL_FAILED กลับมา ACTIVE
 *
 * ทำไม ownerId derive จาก session เท่านั้น: ดู src/app/api/business/subscribe/route.ts
 *
 * Request body: ไม่มี ({}) — API.md §4.6
 */
export async function POST() {
  // ในแอป (iOS/Android) ห้ามจ่ายเงินให้ Deep นอกสโตร์ — ด่านจริง ไม่ใช่แค่ซ่อนปุ่ม (app-purchase-guard.ts)
  const inAppBlocked = await rejectInAppPurchase()
  if (inAppBlocked) return inAppBlocked
  const session = await getServerSession(authOptions);
  // 00071 T4: จัดการแพ็กเกจ = เจ้าของหลักของร้านที่ active (401 ไม่รู้ตัวตน อยู่ในด่านเอง)
  const gate = await requireShopCapability(session, "T4");
  if (!gate.ok) return gate.response;
  const ownerId = gate.userId;

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
