import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSubdomain } from "@/lib/subdomain";
import { markRead, type SenderRole } from "@/services/chat.service";

/**
 * POST /api/chat/conversations/[id]/read — mark-read แยกฝั่ง buyer/shop
 * body ว่างเสมอ — role derive จาก subdomain (ไม่รับจาก client, SDS §3.3/API.md §4.5)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = (session.user as any).id as string;
  const { id } = await params;

  const host = request.headers.get("host") || "";
  const role: SenderRole = getSubdomain(host) === "seller" ? "SHOP" : "BUYER";

  try {
    await markRead(id, userId, role);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "CONVERSATION_NOT_FOUND") {
      return NextResponse.json({ error: "ไม่พบบทสนทนา" }, { status: 404 });
    }
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "ไม่มีสิทธิ์เข้าถึงบทสนทนานี้" }, { status: 403 });
    }
    console.error("[POST /api/chat/conversations/[id]/read]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" }, { status: 500 });
  }
}
