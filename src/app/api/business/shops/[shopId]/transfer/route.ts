import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import * as v from "valibot";
import { authOptions } from "@/lib/auth";
import { requireShopCapability } from "@/lib/shop-capability";
import { keepErrorCode } from "@/lib/legacy-forbidden";
import { TransferOwnershipSchema } from "@/lib/validations";
import { memberErrorResponse } from "@/lib/shop-member-errors";
import { transferShopOwnership } from "@/services/shop-member.service";

/**
 * POST /api/business/shops/[shopId]/transfer { memberId } — เจ้าของหลักโอน Shop.userId ให้สมาชิกในร้าน
 * (EXT 2026-10-05 BR-MR-03..05) — เงื่อนไขแพ็กเกจของผู้รับตรวจใน service ทั้งหมด
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ shopId: string }> }) {
  const session = await getServerSession(authOptions);
  const { shopId } = await params;
  // 00071 T4: โอนเจ้าของหลัก = เจ้าของหลักเท่านั้น · คงรหัส NOT_PRIMARY_OWNER ที่ UI มีข้อความเฉพาะ
  const gate = await requireShopCapability(session, "T4", { shopId });
  if (!gate.ok) return keepErrorCode(gate.response, "NOT_PRIMARY_OWNER");
  const callerId = gate.userId;

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
