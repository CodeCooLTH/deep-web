import { NextRequest, NextResponse } from "next/server";
import { rejectInAppPurchase } from "@/lib/app-purchase-guard";
import * as v from "valibot";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sessionUserId } from "@/lib/session-user";
import { UpgradeBusinessPackageSchema } from "@/lib/validations";
import { upgradeBusinessPackage } from "@/services/business-package.service";

/**
 * POST /api/business/upgrade — owner อัพเกรด tier (ต้องสูงกว่า tier ปัจจุบัน)
 *
 * ทำไม ownerId derive จาก session เท่านั้น: ดู src/app/api/business/subscribe/route.ts
 *
 * API.md §4.3
 */
export async function POST(request: NextRequest) {
  // ในแอป (iOS/Android) ห้ามจ่ายเงินให้ Deep นอกสโตร์ — ด่านจริง ไม่ใช่แค่ซ่อนปุ่ม (app-purchase-guard.ts)
  const inAppBlocked = await rejectInAppPurchase()
  if (inAppBlocked) return inAppBlocked
  const session = await getServerSession(authOptions);
  // 00071 (มติ C-15): แพ็กเกจธุรกิจ = ระดับบัญชีของผู้ใช้เอง ไม่ผูกร้านที่ active — ไม่ใช้ด่าน T4 รายร้าน
  // (ไม่งั้นผู้ที่เป็นผู้ดูแลร้านอื่นอยู่จะสมัคร/ยกเลิกแพ็กเกจตัวเองไม่ได้ ทั้งที่ base ทำได้ทุกบริบท)
  // ownerId มาจาก session เท่านั้น และ service ทำงานกับร้านส่วนตัว/ร้านที่ userId ตรงตัวเองเท่านั้น
  const ownerId = sessionUserId(session);
  if (ownerId === null) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = v.safeParse(UpgradeBusinessPackageSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
  }

  try {
    const result = await upgradeBusinessPackage(ownerId, parsed.output.tier);
    return NextResponse.json(result);
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "SUBSCRIPTION_NOT_ACTIVE") {
      return NextResponse.json({ error: "SUBSCRIPTION_NOT_ACTIVE" }, { status: 409 });
    }
    if (e instanceof Error && e.message === "NOT_AN_UPGRADE") {
      return NextResponse.json({ error: "NOT_AN_UPGRADE" }, { status: 409 });
    }
    if (e instanceof Error && e.message === "PERSONAL_SHOP_REQUIRED") {
      return NextResponse.json({ error: "PERSONAL_SHOP_REQUIRED" }, { status: 412 });
    }
    if (e instanceof Error && e.message === "INSUFFICIENT_CREDIT") {
      return NextResponse.json({ error: "INSUFFICIENT_CREDIT" }, { status: 402 });
    }
    console.error("[POST /api/business/upgrade] ownerId:", ownerId, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
