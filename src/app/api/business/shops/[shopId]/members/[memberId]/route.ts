import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { removeShopMember } from "@/services/shop-member.service";

/**
 * DELETE /api/business/shops/[shopId]/members/[memberId] — owner ลบ admin ออกจาก Business shop
 *
 * ทำไม ownerId derive จาก session เท่านั้น: ดู src/app/api/business/subscribe/route.ts
 *
 * API.md §4.14
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ shopId: string; memberId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const ownerId = (session.user as any).id as string;
  if (!ownerId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { shopId, memberId } = await params;

  try {
    await removeShopMember(ownerId, shopId, memberId);
    return NextResponse.json({ status: "REMOVED" });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "NOT_OWNER") {
      return NextResponse.json({ error: "NOT_OWNER" }, { status: 403 });
    }
    if (e instanceof Error && e.message === "NOT_AN_ADMIN") {
      return NextResponse.json({ error: "NOT_AN_ADMIN" }, { status: 400 });
    }
    console.error(
      "[DELETE /api/business/shops/[shopId]/members/[memberId]] shopId:",
      shopId,
      "memberId:",
      memberId,
      e instanceof Error ? e.message : e,
    );
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
