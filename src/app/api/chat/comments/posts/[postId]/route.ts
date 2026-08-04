import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPostComments } from "@/services/page-comment.service";

/**
 * GET /api/chat/comments/posts/[postId] — โพสต์ + คอมเมนต์ทั้งหมด (เก่า→ใหม่)
 * เรียกครั้งแรกจะ backfill จาก Graph ให้ด้วย (throttle 5 นาทีต่อโพสต์ ดู service)
 */
export const dynamic = "force-dynamic";
const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ postId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const userId = (session.user as { id: string }).id;
  const { postId } = await params;

  try {
    const data = await getPostComments({ postId, actorUserId: userId });
    return NextResponse.json(data, { headers: NO_STORE_HEADERS });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "POST_NOT_FOUND") return NextResponse.json({ error: "ไม่พบโพสต์นี้" }, { status: 404 });
    if (msg === "FORBIDDEN") return NextResponse.json({ error: "ไม่มีสิทธิ์เข้าถึงโพสต์นี้" }, { status: 403 });
    console.error("[GET /api/chat/comments/posts/[postId]]", msg || e);
    return NextResponse.json({ error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" }, { status: 500 });
  }
}
