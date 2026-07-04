import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireActiveShop } from "@/lib/shop-context";
import { revokeInviteLink } from "@/services/invite-link.service";

/**
 * DELETE /api/shops/current/invite-links/[slug] — owner ปิดใช้งานลิงก์เชิญของ shop ปัจจุบัน (active context)
 *
 * feature 00012, Task 2.1
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const ownerId = (session.user as any).id as string;
  if (!ownerId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const active = await requireActiveShop(session as unknown as { user: { id: string; activeShopId?: string | null } });
  if (!active || active.kind !== "BUSINESS" || active.role !== "OWNER") {
    return NextResponse.json({ error: "NOT_OWNER" }, { status: 403 });
  }

  const { slug } = await params;

  try {
    await revokeInviteLink(ownerId, active.shop.id, slug);
    return new NextResponse(null, { status: 204 });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "NOT_OWNER") {
      return NextResponse.json({ error: "NOT_OWNER" }, { status: 403 });
    }
    console.error("[DELETE /api/shops/current/invite-links/[slug]] shopId:", active.shop.id, "slug:", slug, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
