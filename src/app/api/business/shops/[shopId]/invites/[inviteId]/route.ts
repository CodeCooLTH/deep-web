import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
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
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const ownerId = (session.user as any).id as string;
  if (!ownerId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { shopId, inviteId } = await params;

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
