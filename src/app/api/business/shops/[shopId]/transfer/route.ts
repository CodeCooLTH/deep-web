import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import * as v from "valibot";
import { authOptions } from "@/lib/auth";
import { sessionUserId } from "@/lib/session-user";
import { TransferOwnershipSchema } from "@/lib/validations";
import { memberErrorResponse } from "@/lib/shop-member-errors";
import { transferShopOwnership } from "@/services/shop-member.service";

/**
 * POST /api/business/shops/[shopId]/transfer { memberId } — เจ้าของหลักโอน Shop.userId ให้สมาชิกในร้าน
 * (EXT 2026-10-05 BR-MR-03..05) — เงื่อนไขแพ็กเกจของผู้รับตรวจใน service ทั้งหมด
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ shopId: string }> }) {
  const callerId = sessionUserId(await getServerSession(authOptions));
  if (!callerId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { shopId } = await params;

  const parsed = v.safeParse(TransferOwnershipSchema, await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });

  try {
    await transferShopOwnership(callerId, shopId, parsed.output.memberId);
    return NextResponse.json({ status: "TRANSFERRED" });
  } catch (e: unknown) {
    const res = memberErrorResponse(e);
    if (res) return res;
    console.error("[POST shops/[shopId]/transfer] shopId:", shopId, e);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
