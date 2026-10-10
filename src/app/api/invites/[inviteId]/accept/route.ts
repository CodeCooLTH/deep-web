import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { acceptShopInvite } from "@/services/shop-member.service";

/**
 * POST /api/invites/[inviteId]/accept — ผู้ถูกเชิญ (login แล้ว) accept คำเชิญของตัวเอง
 *
 * ทำไม role hardcode "ADMIN": คำเชิญสร้างได้เฉพาะ ADMIN · บทบาทย่อยอยู่ใน invite.roles (00071 P2)
 *
 * API.md §4.13
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ inviteId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = (session.user as any).id as string;
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { inviteId } = await params;

  try {
    const invite = await acceptShopInvite(inviteId, userId);
    return NextResponse.json({ shopId: invite.shopId, role: "ADMIN", roles: invite.roles });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "INVITE_NOT_PENDING") {
      return NextResponse.json({ error: "INVITE_NOT_PENDING" }, { status: 409 });
    }
    if (e instanceof Error && e.message === "CONTACT_MISMATCH") {
      return NextResponse.json({ error: "CONTACT_MISMATCH" }, { status: 403 });
    }
    if (e instanceof Error && e.message === "ADMIN_QUOTA_EXCEEDED_AT_ACCEPT") {
      return NextResponse.json({ error: "ADMIN_QUOTA_EXCEEDED_AT_ACCEPT" }, { status: 403 });
    }
    console.error("[POST /api/invites/[inviteId]/accept] inviteId:", inviteId, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
