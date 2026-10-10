import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sessionUserId } from "@/lib/session-user";
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
  // 00071 (มติ C-15): แพ็กเกจธุรกิจ = ระดับบัญชีของผู้ใช้เอง ไม่ผูกร้านที่ active — ไม่ใช้ด่าน T4 รายร้าน
  // (ไม่งั้นผู้ที่เป็นผู้ดูแลร้านอื่นอยู่จะสมัคร/ยกเลิกแพ็กเกจตัวเองไม่ได้ ทั้งที่ base ทำได้ทุกบริบท)
  // ownerId มาจาก session เท่านั้น และ service ทำงานกับร้านส่วนตัว/ร้านที่ userId ตรงตัวเองเท่านั้น
  const ownerId = sessionUserId(session);
  if (ownerId === null) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

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
