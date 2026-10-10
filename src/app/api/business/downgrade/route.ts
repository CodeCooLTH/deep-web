import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sessionUserId } from "@/lib/session-user";
import { DowngradeBusinessPackageSchema } from "@/lib/validations";
import { downgradeBusinessPackage } from "@/services/business-package.service";

/**
 * POST /api/business/downgrade — owner ดาวน์เกรด tier + เลือก business ที่จะคง ACTIVE (keepShopIds)
 *
 * ทำไม ownerId derive จาก session เท่านั้น: ดู src/app/api/business/subscribe/route.ts
 *
 * API.md §4.4
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  // 00071 (มติ C-15): แพ็กเกจธุรกิจ = ระดับบัญชีของผู้ใช้เอง ไม่ผูกร้านที่ active — ไม่ใช้ด่าน T4 รายร้าน
  // (ไม่งั้นผู้ที่เป็นผู้ดูแลร้านอื่นอยู่จะสมัคร/ยกเลิกแพ็กเกจตัวเองไม่ได้ ทั้งที่ base ทำได้ทุกบริบท)
  // ownerId มาจาก session เท่านั้น และ service ทำงานกับร้านส่วนตัว/ร้านที่ userId ตรงตัวเองเท่านั้น
  const ownerId = sessionUserId(session);
  if (ownerId === null) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = v.safeParse(DowngradeBusinessPackageSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
  }

  try {
    const result = await downgradeBusinessPackage(ownerId, parsed.output.tier, parsed.output.keepShopIds);
    return NextResponse.json(result);
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "SUBSCRIPTION_NOT_ACTIVE") {
      return NextResponse.json({ error: "SUBSCRIPTION_NOT_ACTIVE" }, { status: 409 });
    }
    if (e instanceof Error && e.message === "NOT_A_DOWNGRADE") {
      return NextResponse.json({ error: "NOT_A_DOWNGRADE" }, { status: 409 });
    }
    if (e instanceof Error && e.message === "KEEP_SELECTION_EXCEEDS_QUOTA") {
      return NextResponse.json({ error: "KEEP_SELECTION_EXCEEDS_QUOTA" }, { status: 400 });
    }
    if (e instanceof Error && e.message === "INVALID_SHOP_SELECTION") {
      return NextResponse.json({ error: "INVALID_SHOP_SELECTION" }, { status: 400 });
    }
    console.error("[POST /api/business/downgrade] ownerId:", ownerId, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
