import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { replyToComment } from "@/services/page-comment.service";
import { GraphApiError } from "@/lib/facebook/graph";

/**
 * POST /api/chat/comments/[commentId]/reply — ตอบคอมเมนต์แบบสาธารณะในนามเพจ (feature 00029)
 * body: { message: string }
 *
 * 🛑 ข้อความนี้เป็นสาธารณะ ทุกคนที่เห็นโพสต์เห็นด้วย — UI ต้องเตือนก่อนส่ง (BR-23)
 */
export const dynamic = "force-dynamic";

const MAX_LEN = 8000; // เพดานคอมเมนต์ของ Facebook เอง ~8000 ตัวอักษร

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ commentId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const userId = (session.user as { id: string }).id;
  const { commentId } = await params;

  let message = "";
  try {
    const body = (await request.json()) as { message?: unknown };
    if (typeof body.message !== "string" || body.message.trim().length === 0) {
      return NextResponse.json({ error: "กรุณาพิมพ์ข้อความก่อนส่ง" }, { status: 400 });
    }
    if (body.message.length > MAX_LEN) {
      return NextResponse.json({ error: "ข้อความยาวเกินไป" }, { status: 400 });
    }
    message = body.message;
  } catch {
    return NextResponse.json({ error: "รูปแบบคำขอไม่ถูกต้อง" }, { status: 400 });
  }

  try {
    const result = await replyToComment({ commentId, message, actorUserId: userId });
    return NextResponse.json({ ok: true, id: result.id });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "COMMENT_NOT_FOUND") return NextResponse.json({ error: "ไม่พบความคิดเห็นนี้" }, { status: 404 });
    if (msg === "FORBIDDEN") return NextResponse.json({ error: "ไม่มีสิทธิ์ตอบความคิดเห็นนี้" }, { status: 403 });
    if (msg === "COMMENT_DELETED") return NextResponse.json({ error: "ความคิดเห็นนี้ถูกลบไปแล้ว" }, { status: 409 });
    if (msg === "CHANNEL_INACTIVE") return NextResponse.json({ error: "เพจนี้ยังไม่ได้เชื่อมต่อ" }, { status: 409 });
    if (e instanceof GraphApiError) {
      return NextResponse.json({ error: `Facebook ปฏิเสธการตอบ: ${e.message}` }, { status: 502 });
    }
    console.error("[POST /api/chat/comments/[commentId]/reply]", msg || e);
    return NextResponse.json({ error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" }, { status: 500 });
  }
}
