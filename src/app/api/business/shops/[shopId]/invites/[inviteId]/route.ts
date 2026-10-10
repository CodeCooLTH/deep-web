import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireShopCapability } from "@/lib/shop-capability";
import { keepErrorCode } from "@/lib/legacy-forbidden";
import { cancelInvite } from "@/services/shop-member.service";

/**
 * DELETE /api/business/shops/[shopId]/invites/[inviteId] — owner ยกเลิกคำเชิญที่ยังค้าง PENDING
 *
 * ทำไม ownerId derive จาก session เท่านั้น: ดู src/app/api/business/subscribe/route.ts
 *
 * API.md §4.12
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ shopId: string; inviteId: string }> },
) {
  const session = await getServerSession(authOptions);
  const { shopId, inviteId } = await params;
  // 00071 T2: คงรหัส NOT_OWNER ที่ UI เดิมอ่าน
  const gate = await requireShopCapability(session, "T2", { shopId });
  if (!gate.ok) return keepErrorCode(gate.response, "NOT_OWNER");
  const ownerId = gate.userId;

  try {
    await cancelInvite(ownerId, shopId, inviteId);
    return NextResponse.json({ status: "CANCELLED" });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "NOT_OWNER") {
      return NextResponse.json({ error: "NOT_OWNER" }, { status: 403 });
    }
    if (e instanceof Error && e.message === "INVITE_NOT_PENDING") {
      return NextResponse.json({ error: "INVITE_NOT_PENDING" }, { status: 409 });
    }
    console.error(
      "[DELETE /api/business/shops/[shopId]/invites/[inviteId]] shopId:",
      shopId,
      "inviteId:",
      inviteId,
      e instanceof Error ? e.message : e,
    );
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
