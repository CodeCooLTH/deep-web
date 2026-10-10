import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireShopCapability } from "@/lib/shop-capability";
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
  // 00071 T4: จัดการแพ็กเกจ = เจ้าของหลักของร้านที่ active (401 ไม่รู้ตัวตน อยู่ในด่านเอง)
  const gate = await requireShopCapability(session, "T4");
  if (!gate.ok) return gate.response;
  const ownerId = gate.userId;

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
