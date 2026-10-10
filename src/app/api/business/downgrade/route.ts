import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireShopCapability } from "@/lib/shop-capability";
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
  // 00071 T4: จัดการแพ็กเกจ = เจ้าของหลักของร้านที่ active (401 ไม่รู้ตัวตน อยู่ในด่านเอง)
  const gate = await requireShopCapability(session, "T4");
  if (!gate.ok) return gate.response;
  const ownerId = gate.userId;

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
