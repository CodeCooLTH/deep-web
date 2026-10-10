import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireShopCapability } from "@/lib/shop-capability";
import { keepErrorCode } from "@/lib/legacy-forbidden";
import { revokeInviteLink } from "@/services/invite-link.service";

/**
 * DELETE /api/shops/current/invite-links/[slug] — owner ปิดใช้งานลิงก์เชิญของ shop ปัจจุบัน (active context)
 *
 * feature 00012, Task 2.1
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const session = await getServerSession(authOptions);
  // 00071 T2: ลิงก์เชิญ = เจ้าของ · เฉพาะร้านธุรกิจ · คงรหัส NOT_OWNER
  const gate = await requireShopCapability(session, "T2");
  if (!gate.ok) return keepErrorCode(gate.response, "NOT_OWNER");
  const active = gate.active;
  if (active.kind !== "BUSINESS") return NextResponse.json({ error: "NOT_OWNER" }, { status: 403 });
  const ownerId = gate.userId;

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
